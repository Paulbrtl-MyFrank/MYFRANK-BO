# MyFrank — Back Office IA

Console de création et de déploiement des agents IA de MyFrank, déployée sur
Vercel (Next.js App Router), avec un worker séparé pour l'exécution IA.

## Agents

| Agent              | Statut    | Description                                                        |
| ------------------ | --------- | ----------------------------------------------------------------- |
| Agent CRM Odoo     | En ligne  | Front conversationnel relié au CRM Odoo.                          |
| Agent 1 — Relances | En place  | Rédige les séquences de relance (Auto Follow-up) via le worker.  |

## Architecture générale

```
Vercel (Next.js)                         Worker (Node, always-on)
├─ Front + statut Odoo + chat            ├─ Claude Agent SDK (plan Pro/Max)
├─ Cron quotidien ───────────────────▶   ├─ Lecture opps mode=F
└─ /api/agents/followup/plan (proxy)     ├─ Génération 2-4 mails
                                         └─ Écriture x_ia_email_schedule (Odoo)
```

Le **worker** (`worker/`) tourne en continu (Railway/Render/Fly) et utilise le
**Claude Agent SDK authentifié avec le plan Claude** — pas de clé API facturée à
l'usage. Le **Agent SDK ne peut pas tourner sur Vercel** (serverless), d'où le
service séparé. Voir `worker/README.md` pour le déploiement.

## Variables d'environnement (Vercel)

| Variable            | Rôle                                                    | Requise |
| ------------------- | ------------------------------------------------------- | ------- |
| `ODOO_URL`          | URL de l'instance Odoo                                   | Oui     |
| `ODOO_DB`           | Nom de la base Odoo                                     | Oui     |
| `ODOO_USERNAME`     | Utilisateur Odoo                                        | Oui     |
| `ODOO_API_KEY`      | Clé API Odoo (jamais exposée côté client)               | Oui     |
| `WORKER_URL`        | URL publique du worker                                  | Oui\*   |
| `WORKER_SECRET`     | Secret partagé Vercel ↔ worker                          | Oui\*   |
| `CRON_SECRET`       | Protège le déclenchement du cron / des tests manuels    | Oui\*   |
| `ANTHROPIC_API_KEY` | Clé du modèle pour le **chat** uniquement               | Non     |

\* Requis pour l'Agent 1. Le worker a ses propres variables (`worker/.env.example`),
dont `CLAUDE_CODE_OAUTH_TOKEN` (token du plan Claude).

## Structure

- `app/page.tsx` — tableau de bord des agents.
- `app/agents/odoo/` — front de l'agent Odoo (statut + chat).
- `app/api/odoo/status/` — test de connexion Odoo.
- `app/api/odoo/introspect/` — introspection lecture seule du schéma Odoo.
- `app/api/agent/odoo/` — chat conversationnel (Messages API).
- `app/api/agents/followup/plan/` — **proxy** qui déclenche le worker.
- `lib/odoo.ts` — client Odoo JSON-RPC.
- `worker/` — service Node exécutant l'Agent 1 (Agent SDK + plan Claude).

## Démarrage local (front Vercel)

```bash
npm install
cp .env.example .env.local
npm run dev
```

Pour le worker : voir `worker/README.md`.
