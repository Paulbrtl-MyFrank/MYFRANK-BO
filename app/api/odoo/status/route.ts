import { NextResponse } from "next/server";
import { getOdooConfig, testConnection } from "@/lib/odoo";

// Toujours exécuté à la volée, jamais mis en cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/odoo/status
 * Vérifie la connexion au CRM Odoo (version serveur + authentification).
 * Ne renvoie jamais l'API key ni aucune donnée sensible.
 */
export async function GET() {
  try {
    const config = getOdooConfig();
    const info = await testConnection(config);

    return NextResponse.json({
      connected: true,
      uid: info.uid,
      serverVersion: info.serverVersion ?? null,
      // On expose seulement des infos non sensibles pour l'affichage.
      instance: config.url,
      database: config.db,
      user: config.username,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue côté serveur.";
    return NextResponse.json(
      { connected: false, error: message },
      { status: 200 },
    );
  }
}
