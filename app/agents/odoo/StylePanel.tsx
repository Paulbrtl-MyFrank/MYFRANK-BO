"use client";

import { useEffect, useState } from "react";

const PLACEHOLDER = `Ex. :
Tutoie toujours le prospect (jamais de vouvoiement).
Signe « Paul — MyFrank ».
3 mails maximum, espacés sur ~10 jours.
Ton direct, chaleureux, phrases courtes ; pas de jargon.`;

export default function StylePanel() {
  const [style, setStyle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/agents/followup/style", {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.ok) setStyle(data.style || "");
        else setMsg({ type: "err", text: data.error || "Lecture impossible." });
      } catch {
        setMsg({ type: "err", text: "Réseau indisponible." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agents/followup/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style }),
      });
      const data = await res.json();
      if (data.ok) setMsg({ type: "ok", text: "Style enregistré ✓" });
      else setMsg({ type: "err", text: data.error || "Échec de l'enregistrement." });
    } catch {
      setMsg({ type: "err", text: "Réseau indisponible." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg">✍️</span>
        <h2 className="text-sm font-semibold">Style des relances</h2>
      </div>
      <p className="mb-3 text-xs text-white/50">
        Consignes appliquées par l’agent quand il rédige les séquences (ton,
        signature, tutoiement, nombre de mails, cadence…). Enregistré dans Odoo,
        pris en compte à la prochaine génération.
      </p>

      <textarea
        value={style}
        onChange={(e) => setStyle(e.target.value)}
        disabled={loading}
        placeholder={loading ? "Chargement…" : PLACEHOLDER}
        rows={7}
        className="thin-scroll w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-white/25 focus:border-white/25 disabled:opacity-50"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || loading}
          className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        {msg && (
          <span
            className={`text-xs ${
              msg.type === "ok" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
