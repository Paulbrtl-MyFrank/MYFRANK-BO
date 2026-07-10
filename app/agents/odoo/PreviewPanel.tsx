"use client";

import { useState } from "react";

interface Email {
  subject: string;
  body_html: string;
  send_offset_days: number;
}
interface Result {
  name?: string;
  emails?: Email[];
}

export default function PreviewPanel() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch("/api/agents/followup/preview?limit=1", {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        const withEmails = (data.results || []).filter(
          (r: Result) => r.emails && r.emails.length,
        );
        if (withEmails.length === 0) {
          setError(
            data.leadsScanned === 0
              ? "Aucune opportunité en Auto Follow-up à prévisualiser."
              : "Rien à prévisualiser (les opportunités ont déjà une séquence).",
          );
        } else {
          setResults(withEmails);
        }
      } else {
        setError(data.error || "Échec de la prévisualisation.");
      }
    } catch {
      setError("Réseau indisponible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">👁️</span>
        <h2 className="text-sm font-semibold">Prévisualiser la rédaction</h2>
      </div>
      <p className="mb-3 text-xs text-white/50">
        Génère un exemple de séquence pour 1 opportunité, avec tes consignes
        actuelles. Aucune écriture dans Odoo.
      </p>

      <button
        onClick={preview}
        disabled={loading}
        className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15 disabled:opacity-40"
      >
        {loading ? "Génération… (peut prendre ~30 s)" : "Prévisualiser"}
      </button>

      {error && <p className="mt-3 text-sm text-rose-300/80">{error}</p>}

      {results && (
        <div className="mt-4 space-y-5">
          {results.map((r, i) => (
            <div key={i}>
              <div className="mb-2 text-xs uppercase tracking-wide text-white/40">
                {r.name}
              </div>
              <div className="space-y-3">
                {r.emails!.map((email, j) => (
                  <div
                    key={j}
                    className="rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-white/90">
                        {email.subject}
                      </div>
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/50">
                        {email.send_offset_days === 0
                          ? "Jour 0"
                          : `J+${email.send_offset_days}`}
                      </span>
                    </div>
                    <div
                      className="preview-body text-sm leading-relaxed text-white/70"
                      dangerouslySetInnerHTML={{ __html: email.body_html }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
