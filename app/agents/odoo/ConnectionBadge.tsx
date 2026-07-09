"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  connected: boolean;
  stage?: "config" | "reachability" | "auth";
  uid?: number;
  serverVersion?: string | null;
  instance?: string;
  database?: string;
  user?: string;
  error?: string;
  availableDatabases?: string[] | null;
  databaseKnown?: boolean | null;
}

export default function ConnectionBadge() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function check() {
    setLoading(true);
    try {
      const res = await fetch("/api/odoo/status", { cache: "no-store" });
      setStatus(await res.json());
    } catch (e) {
      setStatus({
        connected: false,
        error: e instanceof Error ? e.message : "Réseau indisponible",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  const dot = loading
    ? "bg-amber-400 animate-pulse"
    : status?.connected
      ? "bg-emerald-400"
      : "bg-rose-500";

  const label = loading
    ? "Vérification de la connexion Odoo…"
    : status?.connected
      ? "Connecté à Odoo"
      : "Odoo non connecté";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <button
          onClick={check}
          disabled={loading}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 transition hover:text-white disabled:opacity-40"
        >
          Rafraîchir
        </button>
      </div>

      {status?.connected && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/55">
          <div>
            <dt className="text-white/35">Instance</dt>
            <dd className="truncate">{status.instance}</dd>
          </div>
          <div>
            <dt className="text-white/35">Base</dt>
            <dd>{status.database}</dd>
          </div>
          <div>
            <dt className="text-white/35">Utilisateur (uid)</dt>
            <dd>
              {status.user} <span className="text-white/30">#{status.uid}</span>
            </dd>
          </div>
          <div>
            <dt className="text-white/35">Version serveur</dt>
            <dd>{status.serverVersion ?? "—"}</dd>
          </div>
        </dl>
      )}

      {!loading && !status?.connected && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-rose-300/80">
            {status?.error ??
              "Vérifiez les variables d'environnement Odoo sur Vercel."}
          </p>

          {/* Diagnostic quand le serveur répond mais l'auth échoue */}
          {status?.stage === "auth" && (
            <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2.5 text-white/55">
              <p>
                <span className="text-emerald-300/80">✓ Serveur joignable</span>
                {status.serverVersion ? ` (v${status.serverVersion})` : ""} — le
                problème vient des identifiants ou du nom de la base.
              </p>
              <p>
                Base demandée : <code className="text-white/80">{status.database}</code>{" "}
                {status.databaseKnown === false && (
                  <span className="text-rose-300/80">
                    — introuvable sur ce serveur.
                  </span>
                )}
                {status.databaseKnown === true && (
                  <span className="text-emerald-300/80">— existe bien.</span>
                )}
              </p>
              {status.availableDatabases &&
                status.availableDatabases.length > 0 && (
                  <p>
                    Bases disponibles :{" "}
                    <span className="text-white/80">
                      {status.availableDatabases.join(", ")}
                    </span>
                  </p>
                )}
              <p className="text-white/40">
                Si la base est correcte, vérifiez ODOO_USERNAME et surtout
                ODOO_API_KEY (une clé régénérée invalide l’ancienne).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
