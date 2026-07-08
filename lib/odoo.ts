/**
 * Client Odoo minimal basé sur l'API JSON-RPC externe d'Odoo.
 *
 * Utilise fetch (aucune dépendance native), compatible avec le runtime
 * serverless de Vercel. Deux services sont exposés par Odoo :
 *   - "common"  -> authenticate (récupère l'uid)
 *   - "object"  -> execute_kw (lecture / écriture sur les modèles)
 *
 * Aucune "action" métier n'est câblée ici pour l'instant : on fournit
 * seulement l'authentification et un execute_kw générique qui serviront
 * de socle aux futurs outils de l'agent.
 */

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

export interface OdooConnectionInfo {
  uid: number;
  serverVersion?: string;
}

class OdooError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OdooError";
  }
}

/** Récupère la configuration Odoo depuis les variables d'environnement. */
export function getOdooConfig(): OdooConfig {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;

  const missing = [
    ["ODOO_URL", url],
    ["ODOO_DB", db],
    ["ODOO_USERNAME", username],
    ["ODOO_API_KEY", apiKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new OdooError(
      `Variables d'environnement Odoo manquantes : ${missing.join(", ")}`,
    );
  }

  return {
    url: url!.replace(/\/+$/, ""),
    db: db!,
    username: username!,
    apiKey: apiKey!,
  };
}

async function jsonRpc<T>(
  url: string,
  service: string,
  method: string,
  args: unknown[],
): Promise<T> {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1_000_000),
    }),
    // On ne veut jamais mettre en cache un appel RPC.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new OdooError(`Odoo a répondu HTTP ${res.status} (${res.statusText})`);
  }

  const payload = (await res.json()) as {
    result?: T;
    error?: { message?: string; data?: { message?: string } };
  };

  if (payload.error) {
    const detail =
      payload.error.data?.message || payload.error.message || "Erreur inconnue";
    throw new OdooError(`Odoo : ${detail}`);
  }

  return payload.result as T;
}

/** Récupère la version du serveur Odoo (ne nécessite pas d'authentification). */
export async function getServerVersion(config: OdooConfig): Promise<string> {
  const info = await jsonRpc<{ server_version?: string }>(
    config.url,
    "common",
    "version",
    [],
  );
  return info?.server_version ?? "inconnue";
}

/** Authentifie l'utilisateur et renvoie son uid Odoo. */
export async function authenticate(config: OdooConfig): Promise<number> {
  const uid = await jsonRpc<number | false>(config.url, "common", "authenticate", [
    config.db,
    config.username,
    config.apiKey,
    {},
  ]);

  if (!uid) {
    throw new OdooError(
      "Authentification refusée : vérifiez ODOO_DB, ODOO_USERNAME et ODOO_API_KEY.",
    );
  }

  return uid;
}

/**
 * Teste la connexion complète : version serveur + authentification.
 * Utilisé par la route /api/odoo/status.
 */
export async function testConnection(
  config: OdooConfig,
): Promise<OdooConnectionInfo> {
  const [serverVersion, uid] = await Promise.all([
    getServerVersion(config).catch(() => undefined),
    authenticate(config),
  ]);

  return { uid, serverVersion };
}

/**
 * Appel générique execute_kw. Socle pour les futurs outils de l'agent.
 * Aucune action n'est exposée publiquement pour l'instant.
 */
export async function executeKw<T>(
  config: OdooConfig,
  uid: number,
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  return jsonRpc<T>(config.url, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}
