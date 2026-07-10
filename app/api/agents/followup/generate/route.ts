import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/followup/generate   body: { leadId: number }
 * Déclenche le worker en mode COMMIT pour une opportunité précise : l'agent
 * lit la fiche, rédige la séquence et l'écrit réellement dans Odoo
 * (x_ia_email_schedule). Ne fait rien si la fiche a déjà une séquence active.
 */
export async function POST(req: Request) {
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

  const body = await req.json().catch(() => ({}));
  const leadId = Number(body?.leadId);
  if (!leadId || leadId <= 0) {
    return NextResponse.json(
      { ok: false, error: "leadId manquant ou invalide." },
      { status: 200 },
    );
  }

  const target = new URL(`${workerUrl}/agents/followup/run`);
  target.searchParams.set("commit", "1");
  target.searchParams.set("leadId", String(leadId));

  try {
    const res = await fetch(target.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${workerSecret}` },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Worker injoignable (il se réveille peut-être, réessayez).";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
