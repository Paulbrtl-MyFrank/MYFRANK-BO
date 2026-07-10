/**
 * Agent 1 — Rédacteur de séquences de relance (exécuté par le worker).
 * Lit les opportunités en Auto Follow-up, génère 2-4 mails et les écrit
 * dans le tableau Odoo x_ia_email_schedule.
 */

import {
  authenticate,
  createRecord,
  getConfigParam,
  getFields,
  getOdooConfig,
  searchRead,
} from "./odoo.js";
import { generateFollowupSequence } from "./agent.js";

// Clé du paramètre Odoo où le front Vercel stocke les consignes de style.
const STYLE_PARAM_KEY = "myfrank.agent_style";

const LEAD_MODEL = "crm.lead";
const SCHEDULE_MODEL = "x_ia_email_schedule";
const MODE_FIELD = "x_studio_mode_ia";
const MODE_AUTO_FOLLOWUP = "F";
const STATUS_FIELD = "x_studio_statut_envoi";
const STATUS_ACTIVE = ["planifie", "envoye"];

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
  "x_studio_transcript_visio",
  "description",
];

// Longueur max du transcript de démo injecté dans le contexte (évite un prompt géant).
const TRANSCRIPT_MAX = 5000;

const SEND_HOUR_UTC = 7; // ~9h Paris

function odooDatetime(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Renvoie l'ensemble des ids de leads (parmi ceux fournis) qui ont déjà une
 * séquence active (statut planifie/envoye). Une seule requête groupée plutôt
 * qu'un appel par lead.
 */
async function leadsWithActiveSequence(config, uid, leadIds) {
  if (!leadIds.length) return new Set();
  const rows = await searchRead(
    config,
    uid,
    SCHEDULE_MODEL,
    [
      ["x_lead_id", "in", leadIds],
      [STATUS_FIELD, "in", STATUS_ACTIVE],
    ],
    ["x_lead_id"],
    { limit: 2000 },
  );
  const withSeq = new Set();
  for (const r of rows) {
    if (Array.isArray(r.x_lead_id)) withSeq.add(r.x_lead_id[0]);
  }
  return withSeq;
}

/** Convertit un corps HTML de message Odoo en texte lisible. */
function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Récupère l'historique des échanges (chatter) d'une opportunité : e-mails et
 * notes, en ordre chronologique, pour que l'agent tienne compte de la relation.
 */
async function fetchHistory(config, uid, leadId) {
  const rows = await searchRead(
    config,
    uid,
    "mail.message",
    [
      ["model", "=", LEAD_MODEL],
      ["res_id", "=", leadId],
      ["message_type", "in", ["email", "comment"]],
    ],
    ["date", "author_id", "email_from", "subject", "body"],
    { limit: 12, order: "date desc" },
  ).catch(() => []);

  return rows
    .reverse() // ancien -> récent
    .map((m) => ({
      date: m.date,
      de: Array.isArray(m.author_id) ? m.author_id[1] : m.email_from || "",
      sujet: m.subject || "",
      message: stripHtml(m.body).slice(0, 800),
    }))
    .filter((m) => m.message);
}

/**
 * @param {{ dryRun?: boolean, limit?: number, leadId?: number }} opts
 */
export async function runFollowupPlanner(opts = {}) {
  const dryRun = opts.dryRun !== false; // sûr par défaut
  const limit = Math.min(Math.max(1, opts.limit || 5), 25);
  // Cible une opportunité précise (bouton « Générer » d'une fiche). 0 => toutes.
  const leadId = Number(opts.leadId) > 0 ? Number(opts.leadId) : 0;

  const config = getOdooConfig();
  const uid = await authenticate(config);

  // On ne demande que les champs réellement présents (noms Studio variables).
  const leadFieldSet = new Set(Object.keys(await getFields(config, uid, LEAD_MODEL)));
  const contextFields = LEAD_CONTEXT_FIELDS.filter((f) => leadFieldSet.has(f));

  // Consignes de style éditées depuis le front Vercel (stockées dans Odoo).
  const style = await getConfigParam(config, uid, STYLE_PARAM_KEY).catch(() => "");

  // On récupère un vivier large d'opportunités en Auto Follow-up, puis on
  // écarte d'un coup celles qui ont déjà une séquence. On ne borne PAS la
  // requête Odoo par `limit` : sinon, avec limit=1 (prévisualisation), on ne
  // verrait que l'opportunité la plus récente — souvent déjà séquencée — et on
  // n'atteindrait jamais celles qui ont réellement besoin d'une relance.
  // Si `leadId` est fourni, on ne traite que cette fiche.
  const domain = leadId
    ? [["id", "=", leadId]]
    : [[MODE_FIELD, "=", MODE_AUTO_FOLLOWUP]];
  const pool = await searchRead(config, uid, LEAD_MODEL, domain, contextFields, {
    limit: leadId ? 1 : 200,
    order: "create_date desc",
  });

  const sequenced = await leadsWithActiveSequence(
    config,
    uid,
    pool.map((l) => l.id),
  );

  // Candidats = opportunités sans séquence active. On n'en traite que `limit`.
  const candidates = pool.filter((l) => !sequenced.has(l.id));
  const leads = candidates.slice(0, limit);

  const results = [];
  let planned = 0;
  let skipped = sequenced.size;

  for (const lead of leads) {
    // Historique des échanges (emails/notes) pour un contexte réaliste.
    const historique = await fetchHistory(config, uid, lead.id);

    // Le transcript de démo peut être volumineux : on le borne.
    if (
      typeof lead.x_studio_transcript_visio === "string" &&
      lead.x_studio_transcript_visio.length > TRANSCRIPT_MAX
    ) {
      lead.x_studio_transcript_visio =
        lead.x_studio_transcript_visio.slice(0, TRANSCRIPT_MAX) + " […]";
    }

    const { id: _id, name, ...context } = lead;
    const sequence = await generateFollowupSequence(
      { opportunite: name, ...context, historique },
      style,
    );

    // L'agent peut décider de ne pas relancer (refus, prospect qui décline…).
    if (sequence.skip) {
      skipped++;
      results.push({
        leadId: lead.id,
        name,
        status: "skipped_declined",
        reason: sequence.reason || "",
      });
      continue;
    }

    const now = new Date();
    const destinataire = Array.isArray(lead.partner_id) ? lead.partner_id[0] : false;

    const rows = sequence.emails.map((email) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + email.send_offset_days);
      d.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);
      const values = {
        x_lead_id: lead.id,
        x_name: email.subject.slice(0, 120),
        x_studio_nom_mail: email.subject,
        x_studio_contenu_mail: email.body_html,
        x_studio_date_envoi: odooDatetime(d),
        x_studio_statut_envoi: "planifie",
      };
      if (destinataire) values.x_studio_destinataire = destinataire;
      return values;
    });

    let createdIds = [];
    if (!dryRun) {
      createdIds = [];
      for (const values of rows) {
        createdIds.push(await createRecord(config, uid, SCHEDULE_MODEL, values));
      }
    }

    planned++;
    results.push({
      leadId: lead.id,
      name,
      emailsPlanned: rows.length,
      committed: !dryRun,
      createdIds: dryRun ? undefined : createdIds,
      preview: rows.map((r) => ({
        subject: r.x_studio_nom_mail,
        date: r.x_studio_date_envoi,
      })),
      // On renvoie toujours le contenu généré : en dry-run pour prévisualiser,
      // en commit pour afficher exactement ce qui vient d'être écrit dans Odoo.
      emails: sequence.emails,
    });
  }

  return {
    ok: true,
    mode: dryRun ? "dry-run" : "commit",
    leadsScanned: pool.length,
    candidates: candidates.length,
    sequencesPlanned: planned,
    skipped,
    results,
  };
}
