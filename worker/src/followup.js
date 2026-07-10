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
  "description",
];

const SEND_HOUR_UTC = 7; // ~9h Paris

function odooDatetime(d) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function hasActiveSequence(config, uid, leadId) {
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

/**
 * @param {{ dryRun?: boolean, limit?: number }} opts
 */
export async function runFollowupPlanner(opts = {}) {
  const dryRun = opts.dryRun !== false; // sûr par défaut
  const limit = Math.min(Math.max(1, opts.limit || 5), 25);

  const config = getOdooConfig();
  const uid = await authenticate(config);

  // On ne demande que les champs réellement présents (noms Studio variables).
  const leadFieldSet = new Set(Object.keys(await getFields(config, uid, LEAD_MODEL)));
  const contextFields = LEAD_CONTEXT_FIELDS.filter((f) => leadFieldSet.has(f));

  // Consignes de style éditées depuis le front Vercel (stockées dans Odoo).
  const style = await getConfigParam(config, uid, STYLE_PARAM_KEY).catch(() => "");

  const leads = await searchRead(
    config,
    uid,
    LEAD_MODEL,
    [[MODE_FIELD, "=", MODE_AUTO_FOLLOWUP]],
    contextFields,
    { limit, order: "create_date desc" },
  );

  const results = [];
  let planned = 0;
  let skipped = 0;

  for (const lead of leads) {
    if (await hasActiveSequence(config, uid, lead.id)) {
      skipped++;
      results.push({ leadId: lead.id, name: lead.name, status: "skipped_has_sequence" });
      continue;
    }

    const { id: _id, name, ...context } = lead;
    const sequence = await generateFollowupSequence(
      { opportunite: name, ...context },
      style,
    );

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
      createdIds: dryRun ? undefined : createdIds,
      preview: rows.map((r) => ({
        subject: r.x_studio_nom_mail,
        date: r.x_studio_date_envoi,
      })),
      emails: dryRun ? sequence.emails : undefined,
    });
  }

  return {
    ok: true,
    mode: dryRun ? "dry-run" : "commit",
    leadsScanned: leads.length,
    sequencesPlanned: planned,
    skipped,
    results,
  };
}
