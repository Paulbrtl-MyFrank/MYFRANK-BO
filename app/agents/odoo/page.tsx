import Link from "next/link";
import ConnectionBadge from "./ConnectionBadge";
import AgentTabs from "./AgentTabs";

export const metadata = {
  title: "Agent CRM Odoo — MyFrank",
};

export default function OdooAgentPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-1 text-sm text-white/45 transition hover:text-white"
      >
        ← Tous les agents
      </Link>

      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
          🧩 Agent · CRM
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Agent CRM Odoo</h1>
        <p className="mt-2 text-white/55">
          Assistant relié au CRM Odoo de MyFrank. Rédige les séquences de relance
          (Auto Follow-up) à partir du contexte des opportunités.
        </p>
      </header>

      <div className="mb-6">
        <ConnectionBadge />
      </div>

      <AgentTabs />
    </main>
  );
}
