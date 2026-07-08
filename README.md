# MyFrank — Back Office IA

Console de création et de déploiement des agents IA de MyFrank, déployée sur
Vercel (Next.js App Router).

## Agents

| Agent           | Statut    | Description                                                        |
| --------------- | --------- | ----------------------------------------------------------------- |
| Agent CRM Odoo  | En ligne  | Relié au CRM Odoo. Connexion établie, actions métier à venir.     |

## Démarrage local

```bash
npm install
cp .env.example .env.local   # puis renseignez les valeurs
npm run dev
```

## Variables d'environnement

À définir dans **Vercel → Project Settings → Environment Variables**
(voir `.env.example`). Aucune valeur sensible n'est stockée dans le code.

| Variable            | Rôle                                                    | Requise |
| ------------------- | ------------------------------------------------------- | ------- |
| `ODOO_URL`          | URL de l'instance Odoo                                   | Oui     |
| `ODOO_DB`           | Nom de la base Odoo                                     | Oui     |
| `ODOO_USERNAME`     | Utilisateur Odoo                                        | Oui     |
| `ODOO_API_KEY`      | Clé API Odoo (jamais exposée côté client)               | Oui     |
| `ANTHROPIC_API_KEY` | Clé du modèle pour la conversation de l'agent           | Non\*   |

\* Sans `ANTHROPIC_API_KEY`, la connexion Odoo fonctionne mais le chat renvoie
un message d'attente.

## Architecture

- `app/page.tsx` — tableau de bord listant les agents.
- `app/agents/odoo/` — front de l'agent Odoo (statut de connexion + chat).
- `app/api/odoo/status/` — vérifie la connexion Odoo (version + authentification).
- `app/api/agent/odoo/` — endpoint de conversation de l'agent.
- `lib/odoo.ts` — client Odoo JSON-RPC (auth + `execute_kw` générique).

> Périmètre actuel : **aucune action métier** n'est câblée dans Odoo. La couche
> `executeKw` de `lib/odoo.ts` sert de socle aux futurs outils de l'agent.
