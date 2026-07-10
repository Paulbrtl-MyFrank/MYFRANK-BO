"use client";

import { useState } from "react";
import StylePanel from "./StylePanel";
import PreviewPanel from "./PreviewPanel";
import LeadsList from "./LeadsList";

type Tab = "followup" | "nurture";

export default function AgentTabs() {
  const [tab, setTab] = useState<Tab>("followup");

  return (
    <div>
      {/* Onglets */}
      <div className="mb-4 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button
          onClick={() => setTab("followup")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "followup"
              ? "bg-violet-500 text-white"
              : "text-white/55 hover:text-white"
          }`}
        >
          Auto Follow-up
        </button>
        <button
          onClick={() => setTab("nurture")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === "nurture"
              ? "bg-violet-500 text-white"
              : "text-white/55 hover:text-white"
          }`}
        >
          Nurture
        </button>
      </div>

      {tab === "followup" && (
        <div className="space-y-4">
          <StylePanel />
          <PreviewPanel />
          <LeadsList />
        </div>
      )}

      {tab === "nurture" && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <div className="mb-2 text-2xl">🌱</div>
          <p className="text-sm text-white/50">
            Mode <span className="text-white/80">Nurture</span> — bientôt.
          </p>
          <p className="mt-1 text-xs text-white/35">
            Séquences longues d’entretien pour les opportunités marquées « Nurture ».
          </p>
        </div>
      )}
    </div>
  );
}
