/**
 * Client Odoo minimal (JSON-RPC) pour le worker.
 * Aucune dépendance : utilise fetch global (Node 20+).
 */

export function getOdooConfig() {
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
    .filter(([, v]) => !v)
    .map(([n]) => n);

  if (missing.length) {
    throw new Error(`Variables Odoo manquantes : ${missing.join(", ")}`);
  }

  return {
    url: url.trim().replace(/\/+$/, ""),
    db: db.trim(),
    username: username.trim(),
    apiKey: apiKey.trim(),
  };
}

async function jsonRpc(url, service, method, args) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1_000_000),
    }),
  });

  if (!res.ok) {
    throw new Error(`Odoo HTTP ${res.status} (${res.statusText})`);
  }

  const payload = await res.json();
  if (payload.error) {
    const detail =
      payload.error?.data?.message || payload.error?.message || "Erreur inconnue";
    throw new Error(`Odoo : ${detail}`);
  }
  return payload.result;
}

export async function authenticate(config) {
  const uid = await jsonRpc(config.url, "common", "authenticate", [
    config.db,
    config.username,
    config.apiKey,
    {},
  ]);
  if (!uid) {
    throw new Error("Authentification Odoo refusée (db / login / clé API).");
  }
  return uid;
}

export function executeKw(config, uid, model, method, args = [], kwargs = {}) {
  return jsonRpc(config.url, "object", "execute_kw", [
    config.db,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

export function getFields(config, uid, model) {
  return executeKw(config, uid, model, "fields_get", [], {
    attributes: ["string", "type", "relation"],
  });
}

export function searchRead(config, uid, model, domain = [], fields = [], opts = {}) {
  return executeKw(config, uid, model, "search_read", [domain], {
    fields,
    ...opts,
  });
}

export function createRecord(config, uid, model, values) {
  return executeKw(config, uid, model, "create", [values]);
}
