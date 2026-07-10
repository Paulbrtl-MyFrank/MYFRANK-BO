/**
 * Worker HTTP MyFrank — exécute l'Agent 1 (Claude Agent SDK + plan Max).
 *
 * Endpoints :
 *   GET  /health                      → sonde de disponibilité (public)
 *   GET|POST /agents/followup/run     → lance l'Agent 1 (protégé)
 *       ?token=<WORKER_SECRET> ou en-tête Authorization: Bearer <WORKER_SECRET>
 *       ?dryRun=1 (défaut) : aperçu, aucune écriture Odoo
 *       ?commit=1          : écrit réellement dans Odoo
 *       ?async=1           : répond 202 immédiatement et exécute en arrière-plan
 *                            (utilisé par le cron Vercel)
 *       ?limit=<n>         : nombre d'opportunités traitées (défaut 5, max 25)
 */

import express from "express";
import { runFollowupPlanner } from "./followup.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

function authorized(req) {
  const secret = process.env.WORKER_SECRET;
  if (!secret) return false; // secret obligatoire
  const auth = req.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.query.token === secret) return true;
  return false;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "myfrank-bo-worker" });
});

async function handleRun(req, res) {
  if (!process.env.WORKER_SECRET) {
    return res
      .status(500)
      .json({ ok: false, error: "WORKER_SECRET non configuré sur le worker." });
  }
  if (!authorized(req)) {
    return res.status(401).json({ ok: false, error: "Non autorisé." });
  }

  const dryRun = !(req.query.commit === "1");
  const isAsync = req.query.async === "1";
  const limit = Number(req.query.limit) || 5;

  if (isAsync) {
    // Mode cron : on accuse réception tout de suite et on travaille en fond.
    res.status(202).json({ accepted: true, mode: dryRun ? "dry-run" : "commit" });
    runFollowupPlanner({ dryRun, limit })
      .then((r) =>
        console.log(
          `[followup] terminé : ${r.sequencesPlanned} planifiée(s), ${r.skipped} ignorée(s)`,
        ),
      )
      .catch((e) => console.error("[followup] erreur :", e?.message || e));
    return;
  }

  // Mode synchrone (test / dry-run manuel) : on renvoie le résultat.
  try {
    const result = await runFollowupPlanner({ dryRun, limit });
    res.json(result);
  } catch (e) {
    res.status(200).json({ ok: false, error: e?.message || "Erreur inconnue." });
  }
}

app.get("/agents/followup/run", handleRun);
app.post("/agents/followup/run", handleRun);

app.listen(PORT, () => {
  console.log(`myfrank-bo-worker à l'écoute sur le port ${PORT}`);
});
