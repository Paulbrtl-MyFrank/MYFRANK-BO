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

  // On retire les espaces / retours à la ligne parasites (fréquents lors
  // d'un copier-coller dans les variables d'environnement Vercel).
  return {
    url: url!.trim().replace(/\/+$/, ""),
    db: db!.trim(),
    username: username!.trim(),
    apiKey: apiKey!.trim(),
  };
}

/**
 * Liste les bases de données disponibles sur l'instance Odoo.
 * Utile pour diagnostiquer un mauvais ODOO_DB. Peut être désactivé
 * côté serveur (list_db = False) : dans ce cas la promesse rejette.
 */
export async function listDatabases(config: OdooConfig): Promise<string[]> {
  const dbs = await jsonRpc<string[]>(config.url, "db", "list", []);
  return Array.isArray(dbs) ? dbs : [];
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

export interface OdooFieldMeta {
  string?: string;
  type?: string;
  relation?: string;
  relation_field?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: [string, string][];
}

/**
 * Récupère la description des champs d'un modèle (fields_get).
 * Lecture seule — sert à l'introspection du schéma Odoo.
 */
export async function getFields(
  config: OdooConfig,
  uid: number,
  model: string,
): Promise<Record<string, OdooFieldMeta>> {
  return executeKw<Record<string, OdooFieldMeta>>(
    config,
    uid,
    model,
    "fields_get",
    [],
    {
      attributes: [
        "string",
        "type",
        "relation",
        "relation_field",
        "required",
        "readonly",
        "selection",
      ],
    },
  );
}

/** search_read générique. */
export async function searchRead<T = Record<string, unknown>>(
  config: OdooConfig,
  uid: number,
  model: string,
  domain: unknown[] = [],
  fields: string[] = [],
  opts: { limit?: number; offset?: number; order?: string } = {},
): Promise<T[]> {
  return executeKw<T[]>(config, uid, model, "search_read", [domain], {
    fields,
    ...opts,
  });
}

/** Crée un enregistrement et renvoie son id. */
export async function createRecord(
  config: OdooConfig,
  uid: number,
  model: string,
  values: Record<string, unknown>,
): Promise<number> {
  return executeKw<number>(config, uid, model, "create", [values]);
}

/** Met à jour des enregistrements. */
export async function writeRecords(
  config: OdooConfig,
  uid: number,
  model: string,
  ids: number[],
  values: Record<string, unknown>,
): Promise<boolean> {
  return executeKw<boolean>(config, uid, model, "write", [ids, values]);
}
