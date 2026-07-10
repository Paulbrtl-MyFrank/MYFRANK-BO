"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: number;
  name: string;
  contact: string;
  hasSequence: boolean;
}

interface GenState {
  loading?: boolean;
  error?: string;
  skippedReason?: string;
}

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [instance, setInstance] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // État de génération par opportunité (leadId -> état).
  const [gen, setGen] = useState<Record<number, GenState>>({});

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

  async function generate(leadId: number) {
    setGen((g) => ({ ...g, [leadId]: { loading: true } }));
    try {
      const res = await fetch("/api/agents/followup/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (!data.ok) {
        setGen((g) => ({
          ...g,
          [leadId]: { error: data.error || "Échec de la génération." },
        }));
        return;
      }
      const result = (data.results || []).find(
        (r: { leadId: number }) => r.leadId === leadId,
      );

      // L'agent a décidé de ne pas relancer (prospect qui a décliné, etc.).
      if (result?.status === "skipped_declined") {
        setGen((g) => ({
          ...g,
          [leadId]: {
            skippedReason: result.reason || "Relance jugée non pertinente.",
          },
        }));
        return;
      }

      // Séquence écrite (ou l'opportunité avait déjà une séquence) : on se
      // contente de basculer le badge à « séquence ✓ », sans détailler.
      setGen((g) => ({ ...g, [leadId]: {} }));
      setLeads((ls) =>
        ls.map((l) => (l.id === leadId ? { ...l, hasSequence: true } : l)),
      );
    } catch {
      setGen((g) => ({
        ...g,
        [leadId]: { error: "Worker injoignable (il se réveille, réessayez)." },
      }));
    }
  }

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
          {leads.map((lead) => {
            const state = gen[lead.id] || {};
            return (
              <li key={lead.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <a
                    href={odooLink(lead.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group min-w-0 flex-1"
                  >
                    <div className="truncate text-sm text-white/90 group-hover:text-white">
                      {lead.name}
                      <span className="ml-1 text-white/30 transition group-hover:text-white/60">
                        ↗
                      </span>
                    </div>
                    {lead.contact && (
                      <div className="truncate text-xs text-white/45">
                        {lead.contact}
                      </div>
                    )}
                  </a>
                  <div className="flex shrink-0 items-center gap-2">
                    {lead.hasSequence ? (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                        séquence ✓
                      </span>
                    ) : (
                      <>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
                          à traiter
                        </span>
                        <button
                          onClick={() => generate(lead.id)}
                          disabled={state.loading}
                          className="rounded-lg bg-violet-500 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-violet-400 disabled:opacity-40"
                        >
                          {state.loading ? "Génération…" : "Générer la séquence"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {state.loading && (
                  <p className="mt-2 text-xs text-white/40">
                    L’agent lit la fiche et rédige la séquence… (~30 s)
                  </p>
                )}
                {state.error && (
                  <p className="mt-2 text-xs text-rose-300/80">{state.error}</p>
                )}
                {state.skippedReason && (
                  <div className="mt-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/90">
                    ⏸️ Pas de relance générée.{" "}
                    <span className="text-amber-200/70">
                      {state.skippedReason}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
