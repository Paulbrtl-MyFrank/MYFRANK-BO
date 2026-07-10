"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: number;
  name: string;
  contact: string;
  hasSequence: boolean;
}

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [instance, setInstance] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/followup/leads", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        setLeads(data.leads || []);
        setInstance(data.instance || "");
      } else {
        setError(data.error || "Lecture impossible.");
      }
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const odooLink = (id: number) =>
    `${instance}/web#id=${id}&model=crm.lead&view_type=form`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <h2 className="text-sm font-semibold">
            Opportunités en Auto Follow-up
          </h2>
          {!loading && !error && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
              {leads.length}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 transition hover:text-white disabled:opacity-40"
        >
          Rafraîchir
        </button>
      </div>

      {loading && <p className="text-sm text-white/40">Chargement…</p>}
      {error && <p className="text-sm text-rose-300/80">{error}</p>}

      {!loading && !error && leads.length === 0 && (
        <p className="text-sm text-white/40">
          Aucune opportunité en « Auto Follow-up » pour le moment. Passe une
          opportunité en mode IA « Auto Follow-up » dans Odoo pour la voir ici.
        </p>
      )}

      {!loading && !error && leads.length > 0 && (
        <ul className="divide-y divide-white/5">
          {leads.map((lead) => (
            <li key={lead.id}>
              <a
                href={odooLink(lead.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 py-2.5 transition hover:bg-white/5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-white/90 group-hover:text-white">
                    {lead.name}
                  </div>
                  {lead.contact && (
                    <div className="truncate text-xs text-white/45">
                      {lead.contact}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {lead.hasSequence ? (
                    <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                      séquence ✓
                    </span>
                  ) : (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
                      à traiter
                    </span>
                  )}
                  <span className="text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60">
                    ↗
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
