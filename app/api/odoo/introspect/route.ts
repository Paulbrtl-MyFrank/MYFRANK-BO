import { NextResponse } from "next/server";
import {
  authenticate,
  getFields,
  getOdooConfig,
  type OdooFieldMeta,
} from "@/lib/odoo";

// Lecture seule, jamais mis en cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/odoo/introspect
 *
 * Endpoint de DIAGNOSTIC en lecture seule (aucune écriture dans Odoo).
 * Découvre la structure liée au follow-up automatique :
 *  - le champ x_studio_mode_ia sur crm.lead (valeurs de sélection)
 *  - les champs personnalisés (x_*) de crm.lead
 *  - les tableaux one2many personnalisés + le modèle enfant et ses colonnes
 *
 * Sert à identifier le "tableau" des mails planifiés sans en connaître le
 * nom technique à l'avance.
 */
export async function GET() {
  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);

    const leadFields = await getFields(config, uid, "crm.lead");

    const compact = (f: OdooFieldMeta) => ({
      label: f.string,
      type: f.type,
      relation: f.relation,
      relation_field: f.relation_field,
      selection: f.selection,
    });

    // Champs personnalisés (Studio) de crm.lead
    const customLeadFields: Record<string, ReturnType<typeof compact>> = {};
    // Tableaux (one2many) — candidats pour le "tableau" de mails planifiés
    const oneToManyFields: Record<string, ReturnType<typeof compact>> = {};

    for (const [name, meta] of Object.entries(leadFields)) {
      const isCustom = name.startsWith("x_");
      if (isCustom) customLeadFields[name] = compact(meta);
      if (meta.type === "one2many" && (isCustom || name.startsWith("x_"))) {
        oneToManyFields[name] = compact(meta);
      }
    }

    // Introspection des modèles enfants des one2many personnalisés
    const childModels: Record<
      string,
      Record<string, ReturnType<typeof compact>>
    > = {};
    for (const [, meta] of Object.entries(oneToManyFields)) {
      const relation = meta.relation;
      if (relation && !childModels[relation]) {
        try {
          const childFields = await getFields(config, uid, relation);
          childModels[relation] = Object.fromEntries(
            Object.entries(childFields)
              // On masque les champs techniques de base pour la lisibilité.
              .filter(([n]) => !["__last_update"].includes(n))
              .map(([n, m]) => [n, compact(m)]),
          );
        } catch (e) {
          childModels[relation] = {
            _error: {
              label: e instanceof Error ? e.message : "introspection échouée",
              type: "error",
            },
          } as never;
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        model: "crm.lead",
        mode_ia: compact(leadFields["x_studio_mode_ia"] ?? {}),
        customLeadFields,
        oneToManyFields,
        childModels,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue côté serveur.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
