import { NextResponse } from "next/server";
import {
  authenticate,
  createRecord,
  getFields,
  getOdooConfig,
  searchRead,
  type OdooConfig,
} from "@/lib/odoo";
import { generateFollowupSequence } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// --- Configuration métier ---
const LEAD_MODEL = "crm.lead";
const SCHEDULE_MODEL = "x_ia_email_schedule";
const MODE_FIELD = "x_studio_mode_ia";
const MODE_AUTO_FOLLOWUP = "F";
const STATUS_FIELD = "x_studio_statut_envoi";
const STATUS_ACTIVE = ["planifie", "envoye"]; // séquence considérée existante

// Champs de contexte souhaités pour nourrir la rédaction. On les filtre au
// runtime contre les champs réellement présents sur le modèle (les noms des
// champs Studio varient), donc un nom inexistant est simplement ignoré.
const LEAD_CONTEXT_FIELDS = [
  "name",
  "contact_name",
  "partner_name",
  "email_from",
  "partner_id",
  "x_studio_prnom",
  "x_studio_nom",
  "x_studio_mail",
  "x_studio_job_title",
  "x_studio_secteur",
  "x_studio_linkedin_company",
  "x_studio_lk_company",
  "x_studio_statut",
  "x_studio_engagement",
  "x_studio_features_demandes_et_notes",
  "x_studio_premier_contact",
  "x_studio_dernier_contact",
  "x_studio_note_moyenne",
  "description",
];

/** Formate une date en 'YYYY-MM-DD HH:MM:SS' UTC (format attendu par Odoo). */
function odooDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

interface Lead {
  id: number;
  name?: string;
  partner_id?: [number, string] | false;
  [k: string]: unknown;
}

function isAuthorized(req: Request): { ok: boolean; isCron: boolean } {
  const secret = process.env.CRON_SECRET;
  // Pas de secret configuré → on autorise (phase de mise en place), mais
  // les écritures restent protégées par le mode dry-run par défaut.
  if (!secret) return { ok: true, isCron: false };

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return { ok: true, isCron: true };

  const token = new URL(req.url).searchParams.get("token");
  if (token === secret) return { ok: true, isCron: false };

  return { ok: false, isCron: false };
}

async function hasActiveSequence(
  config: OdooConfig,
  uid: number,
  leadId: number,
): Promise<boolean> {
  const rows = await searchRead(
    config,
    uid,
    SCHEDULE_MODEL,
    [
      ["x_lead_id", "=", leadId],
      [STATUS_FIELD, "in", STATUS_ACTIVE],
    ],
    ["id"],
    { limit: 1 },
  );
  return rows.length > 0;
}

async function handle(req: Request) {
  const { ok, isCron } = isAuthorized(req);
  if (!ok) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const url = new URL(req.url);
  // Par sécurité : on n'écrit dans Odoo QUE si déclenché par le cron
  // (bearer) ou explicitement via ?commit=1. Sinon, aperçu (dry-run).
  const commit = isCron || url.searchParams.get("commit") === "1";
  const limit = Math.min(
    Number(url.searchParams.get("limit")) || 5,
    25,
  );
  const sendHourUtc = 7; // heure d'envoi par défaut (~9h Paris)

  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);

    // 0) On ne lit que les champs de contexte réellement présents sur le
    //    modèle (les noms des champs Studio varient d'une base à l'autre).
    const leadFieldSet = new Set(
      Object.keys(await getFields(config, uid, LEAD_MODEL)),
    );
    const contextFields = LEAD_CONTEXT_FIELDS.filter((f) =>
      leadFieldSet.has(f),
    );

    // 1) Opportunités en Auto Follow-up
    const leads = await searchRead<Lead>(
      config,
      uid,
      LEAD_MODEL,
      [[MODE_FIELD, "=", MODE_AUTO_FOLLOWUP]],
      contextFields,
      { limit, order: "create_date desc" },
    );

    const results: unknown[] = [];
    let planned = 0;
    let skipped = 0;

    for (const lead of leads) {
      // 2) Déjà une séquence active ? → on ne re-génère pas
      if (await hasActiveSequence(config, uid, lead.id)) {
        skipped++;
        results.push({ leadId: lead.id, name: lead.name, status: "skipped_has_sequence" });
        continue;
      }

      // 3) Génération de la séquence
      const { name: _n, id: _i, ...context } = lead;
      const sequence = await generateFollowupSequence({
        opportunite: lead.name,
        ...context,
      });

      // 4) Calcul des dates + (option) écriture dans Odoo
      const now = new Date();
      const destinataire = Array.isArray(lead.partner_id)
        ? lead.partner_id[0]
        : false;

      const rows = sequence.emails.map((email) => {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() + email.send_offset_days);
        d.setUTCHours(sendHourUtc, 0, 0, 0);
        return {
          x_lead_id: lead.id,
          x_name: email.subject.slice(0, 120),
          x_studio_nom_mail: email.subject,
          x_studio_contenu_mail: email.body_html,
          x_studio_date_envoi: odooDatetime(d),
          x_studio_destinataire: destinataire || undefined,
          x_studio_statut_envoi: "planifie",
        };
      });

      let createdIds: number[] = [];
      if (commit) {
        createdIds = await Promise.all(
          rows.map((values) =>
            createRecord(config, uid, SCHEDULE_MODEL, values),
          ),
        );
      }

      planned++;
      results.push({
        leadId: lead.id,
        name: lead.name,
        emailsPlanned: rows.length,
        createdIds: commit ? createdIds : undefined,
        preview: rows.map((r) => ({
          subject: r.x_studio_nom_mail,
          date: r.x_studio_date_envoi,
          destinataire,
        })),
        // En dry-run, on renvoie aussi le corps pour relecture.
        emails: commit ? undefined : sequence.emails,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: commit ? "commit" : "dry-run",
      leadsScanned: leads.length,
      sequencesPlanned: planned,
      skipped,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
