import { NextResponse } from "next/server";
import { authenticate, getOdooConfig, searchRead } from "@/lib/odoo";

export const dynamic = "force-dynamic";

const LEAD_MODEL = "crm.lead";
const SCHEDULE_MODEL = "x_ia_email_schedule";
const MODE_FIELD = "x_studio_mode_ia";
const MODE_AUTO_FOLLOWUP = "F";

interface LeadRow {
  id: number;
  name?: string;
  contact_name?: string | false;
  partner_name?: string | false;
  email_from?: string | false;
  create_date?: string | false;
}

/**
 * GET /api/agents/followup/leads
 * Liste les opportunités en Auto Follow-up (mode = F) et indique lesquelles
 * ont déjà une séquence active. Renvoie aussi l'URL de l'instance pour
 * construire les liens vers les fiches Odoo côté client.
 */
export async function GET() {
  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);

    const leads = await searchRead<LeadRow>(
      config,
      uid,
      LEAD_MODEL,
      [[MODE_FIELD, "=", MODE_AUTO_FOLLOWUP]],
      ["name", "contact_name", "partner_name", "email_from", "create_date"],
      { limit: 200, order: "create_date desc" },
    );

    // Quelles opportunités ont déjà une séquence active ?
    const withSequence = new Set<number>();
    if (leads.length) {
      const rows = await searchRead<{ x_lead_id?: [number, string] | false }>(
        config,
        uid,
        SCHEDULE_MODEL,
        [
          ["x_lead_id", "in", leads.map((l) => l.id)],
          ["x_studio_statut_envoi", "in", ["planifie", "envoye"]],
        ],
        ["x_lead_id"],
        { limit: 2000 },
      );
      for (const r of rows) {
        if (Array.isArray(r.x_lead_id)) withSequence.add(r.x_lead_id[0]);
      }
    }

    return NextResponse.json({
      ok: true,
      instance: config.url,
      count: leads.length,
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name || "(sans nom)",
        contact: l.contact_name || l.partner_name || l.email_from || "",
        hasSequence: withSequence.has(l.id),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
