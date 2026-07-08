"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  connected: boolean;
  uid?: number;
  serverVersion?: string | null;
  instance?: string;
  database?: string;
  user?: string;
  error?: string;
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
        <p className="mt-3 text-xs text-rose-300/80">
          {status?.error ??
            "Vérifiez les variables d'environnement Odoo sur Vercel."}
        </p>
      )}
    </div>
  );
}
