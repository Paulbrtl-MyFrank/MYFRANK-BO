import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Proxy vers le worker (Agent SDK + plan Claude).
 *
 * L'Agent 1 ne s'exécute plus sur Vercel (le Agent SDK a besoin d'un
 * environnement Node long-running). Cette route se contente de déclencher
 * le worker :
 *  - déclenchée par le Vercel Cron (en-tête Authorization: Bearer <CRON_SECRET>)
 *    → appelle le worker en mode async + commit (écrit dans Odoo) ;
 *  - déclenchée manuellement avec ?token=<CRON_SECRET> → transmet les
 *    paramètres (dryRun/commit/limit) et renvoie la réponse du worker.
 *
 * Pour un test dry-run avec aperçu, il est plus simple d'appeler directement
 * le worker : GET https://<worker>/agents/followup/run?dryRun=1&token=<WORKER_SECRET>
 */
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const workerUrl = process.env.WORKER_URL?.replace(/\/+$/, "");
  const workerSecret = process.env.WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Worker non configuré : définissez WORKER_URL et WORKER_SECRET sur Vercel.",
      },
      { status: 200 },
    );
  }

  const url = new URL(req.url);
  const auth = req.headers.get("authorization");
  const isCron = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const hasToken = !!cronSecret && url.searchParams.get("token") === cronSecret;

  // Si un CRON_SECRET est configuré, on exige le bearer (cron) ou le token.
  if (cronSecret && !isCron && !hasToken) {
    return NextResponse.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }

  // Le cron écrit réellement et en asynchrone. En manuel, on respecte les params.
  const target = new URL(`${workerUrl}/agents/followup/run`);
  if (isCron) {
    target.searchParams.set("async", "1");
    target.searchParams.set("commit", "1");
  } else {
    if (url.searchParams.get("commit") === "1") target.searchParams.set("commit", "1");
    if (url.searchParams.get("async") === "1") target.searchParams.set("async", "1");
    const limit = url.searchParams.get("limit");
    if (limit) target.searchParams.set("limit", limit);
  }

  try {
    const res = await fetch(target.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, triggered: true, worker: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Worker injoignable.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
