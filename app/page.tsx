import Link from "next/link";

interface AgentCard {
  slug: string;
  name: string;
  description: string;
  status: "live" | "soon";
  accent: string;
}

const AGENTS: AgentCard[] = [
  {
    slug: "odoo",
    name: "Agent CRM Odoo",
    description:
      "Assistant relié au CRM Odoo de MyFrank. Connexion établie — les actions métier seront ajoutées progressivement.",
    status: "live",
    accent: "from-violet-500/20 to-indigo-500/10",
  },
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16">
      <header className="mb-14">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Back Office IA
        </div>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          MyFrank <span className="text-white/40">·</span> Agents IA
        </h1>
        <p className="mt-4 max-w-2xl text-white/60">
          Espace de création et de déploiement des agents IA de MyFrank. Chaque
          agent se connecte à un outil métier et opère des actions pour vous.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <Link
            key={agent.slug}
            href={`/agents/${agent.slug}`}
            className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${agent.accent} p-6 transition hover:border-white/25`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg">
                🧩
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  agent.status === "live"
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-white/10 text-white/50"
                }`}
              >
                {agent.status === "live" ? "En ligne" : "Bientôt"}
              </span>
            </div>
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <p className="mt-2 text-sm text-white/55">{agent.description}</p>
            <div className="mt-5 inline-flex items-center gap-1 text-sm text-white/70 transition group-hover:text-white">
              Ouvrir l’agent
              <span className="transition group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}

        <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">
          Nouveaux agents à venir
        </div>
      </section>

      <footer className="mt-20 border-t border-white/10 pt-6 text-xs text-white/30">
        MyFrank — Back Office IA
      </footer>
    </main>
  );
}
