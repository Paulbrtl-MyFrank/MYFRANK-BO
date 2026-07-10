import { NextResponse } from "next/server";
import {
  authenticate,
  getConfigParam,
  getOdooConfig,
  setConfigParam,
} from "@/lib/odoo";

export const dynamic = "force-dynamic";

// Clé du paramètre Odoo où sont stockées les consignes de style.
const STYLE_KEY = "myfrank.agent_style";

/** GET /api/agents/followup/style → lit les consignes de style actuelles. */
export async function GET() {
  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);
    const style = await getConfigParam(config, uid, STYLE_KEY);
    return NextResponse.json({ ok: true, style });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}

/** POST /api/agents/followup/style → enregistre les consignes de style. */
export async function POST(req: Request) {
  let style = "";
  try {
    const body = (await req.json()) as { style?: string };
    style = typeof body.style === "string" ? body.style : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Corps invalide." }, { status: 400 });
  }

  try {
    const config = getOdooConfig();
    const uid = await authenticate(config);
    await setConfigParam(config, uid, STYLE_KEY, style);
    return NextResponse.json({ ok: true, style });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Écriture refusée par Odoo.";
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
