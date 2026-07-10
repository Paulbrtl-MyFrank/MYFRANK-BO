import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/agents/followup/preview?limit=1
 * Déclenche le worker en mode dry-run (aucune écriture Odoo) et renvoie les
 * séquences générées, pour prévisualiser la rédaction depuis le front.
 */
export async function GET(req: Request) {
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

  const limit = new URL(req.url).searchParams.get("limit") || "1";
  const target = new URL(`${workerUrl}/agents/followup/run`);
  target.searchParams.set("dryRun", "1");
  target.searchParams.set("limit", limit);

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
