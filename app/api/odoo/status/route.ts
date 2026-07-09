import { NextResponse } from "next/server";
import {
  authenticate,
  getOdooConfig,
  getServerVersion,
  listDatabases,
} from "@/lib/odoo";

// Toujours exécuté à la volée, jamais mis en cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/odoo/status
 * Vérifie la connexion au CRM Odoo et fournit un diagnostic précis en cas
 * d'échec (serveur joignable ? bases disponibles ?). Ne renvoie jamais
 * l'API key ni aucune donnée sensible.
 */
export async function GET() {
  let config;
  try {
    config = getOdooConfig();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Configuration invalide.";
    return NextResponse.json(
      { connected: false, stage: "config", error: message },
      { status: 200 },
    );
  }

  // 1) Le serveur Odoo est-il joignable ? (ne nécessite pas d'authentification)
  let serverVersion: string | null = null;
  try {
    serverVersion = await getServerVersion(config);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Serveur injoignable.";
    return NextResponse.json(
      {
        connected: false,
        stage: "reachability",
        error: `Impossible de joindre Odoo à l'adresse ${config.url} : ${message}`,
        instance: config.url,
      },
      { status: 200 },
    );
  }

  // 2) Authentification
  try {
    const uid = await authenticate(config);
    return NextResponse.json({
      connected: true,
      uid,
      serverVersion,
      instance: config.url,
      database: config.db,
      user: config.username,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Authentification refusée.";

    // Diagnostic : la base demandée existe-t-elle ? On tente de lister les
    // bases (souvent désactivé en production, on ignore alors l'échec).
    let availableDatabases: string[] | null = null;
    let databaseKnown: boolean | null = null;
    try {
      availableDatabases = await listDatabases(config);
      databaseKnown = availableDatabases.includes(config.db);
    } catch {
      availableDatabases = null;
    }

    return NextResponse.json({
      connected: false,
      stage: "auth",
      // Le serveur répond : le problème vient des identifiants ou de la base.
      error: message,
      serverVersion,
      instance: config.url,
      database: config.db,
      user: config.username,
      availableDatabases,
      databaseKnown,
    });
  }
}
