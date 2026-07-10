# MyFrank BO — Worker (Agent SDK + plan Claude)

Service Node **long-running** qui exécute l'**Agent 1** (rédacteur de séquences de
relance). Il utilise le **Claude Agent SDK** authentifié avec ton **plan Claude
(Pro/Max)** — donc **sans clé API facturée à l'usage**.

Pourquoi un service séparé de Vercel ? Le Agent SDK lance un sous-processus
`claude` persistant et a besoin d'un environnement Node qui tourne en continu :
incompatible avec le serverless de Vercel. Ce worker se déploie sur une plateforme
« always-on » (Railway, Render, Fly.io…) et **Vercel Cron l'appelle** en HTTP.

## Architecture

```
Vercel Cron ──POST /api/agents/followup/plan──▶ Vercel (proxy)
                                                   │  (async, fire-and-forget)
                                                   ▼
                                   Worker  /agents/followup/run?async=1
                                                   │
                          Agent SDK (plan Max) ─── génère la séquence
                                                   │
                                     Odoo  ◀── écrit dans x_ia_email_schedule
```

## 1) Générer le token du plan Claude

Sur ta machine, connecté au compte qui porte l'abonnement Pro/Max :

```bash
npx @anthropic-ai/claude-agent-sdk setup-token
# (ou, si le CLI Claude Code est installé :  claude setup-token)
```

Copie le token généré (`CLAUDE_CODE_OAUTH_TOKEN`). Il est rattaché à ton plan et
se rafraîchit avec ton cycle de facturation.

## 2) Déployer le worker

Choisis une plateforme always-on. Deux options :

**Railway / Render (depuis le repo)**
- Nouveau service à partir de ce repo GitHub
- **Root Directory** : `worker`
- **Build** : `npm install` · **Start** : `npm start`
- Variables d'environnement : voir `.env.example`

**Docker (Fly.io, Cloud Run, VPS…)**
- Un `Dockerfile` est fourni dans ce dossier.

### Variables d'environnement du worker

| Variable | Rôle |
| --- | --- |
| `WORKER_SECRET` | Secret protégeant l'endpoint (identique côté Vercel) |
| `CLAUDE_CODE_OAUTH_TOKEN` | Token du plan Claude (étape 1) |
| `AGENT_MODEL` | Modèle de rédaction (défaut `claude-sonnet-5`) |
| `ODOO_URL` / `ODOO_DB` / `ODOO_USERNAME` / `ODOO_API_KEY` | Connexion Odoo (mêmes valeurs que Vercel) |
| `PORT` | Injecté par la plateforme |

## 3) Brancher Vercel

Côté Vercel, ajoute :

| Variable | Valeur |
| --- | --- |
| `WORKER_URL` | L'URL publique du worker (ex. `https://myfrank-worker.up.railway.app`) |
| `WORKER_SECRET` | **Le même** secret que sur le worker |

Le cron quotidien (`vercel.json`) appelle alors le worker automatiquement.

## Tester

- **Santé** : `GET https://<worker>/health`
- **Dry-run** (aucune écriture Odoo) :
  ```
  https://<worker>/agents/followup/run?dryRun=1&limit=2&token=<WORKER_SECRET>
  ```
- **Écriture réelle** : remplace par `?commit=1&limit=2&token=<WORKER_SECRET>`

## Endpoints

| Méthode | Chemin | Description |
| --- | --- | --- |
| GET | `/health` | Sonde (public) |
| GET/POST | `/agents/followup/run` | Lance l'Agent 1 (protégé par `WORKER_SECRET`) |

Paramètres : `dryRun` (défaut) / `commit=1`, `async=1` (réponse 202 + traitement en fond, utilisé par le cron), `limit` (défaut 5, max 25).
