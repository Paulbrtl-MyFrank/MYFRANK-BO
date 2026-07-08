import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `Tu es l'agent CRM Odoo de MyFrank, un assistant intégré au back office de MyFrank.
Tu es relié au CRM Odoo de l'entreprise (instance rank-nfc).

État actuel : la connexion technique à Odoo est établie, mais AUCUNE action métier
(création de lead, mise à jour de contact, etc.) n'est encore activée. Tu peux
discuter, comprendre les besoins et expliquer ce que tu pourras faire une fois les
actions branchées, mais tu ne dois pas prétendre exécuter d'action dans Odoo pour
l'instant. Si on te demande une action concrète, explique qu'elle sera bientôt
disponible et propose de préparer la demande.

Réponds en français, de manière concise et professionnelle.`;

/**
 * POST /api/agent/odoo
 * Endpoint de conversation de l'agent. Pour l'instant : discussion uniquement,
 * aucune action Odoo n'est câblée (conformément au périmètre défini).
 */
export async function POST(req: Request) {
  let messages: ChatMessage[] = [];
  try {
    const body = (await req.json()) as { messages?: ChatMessage[] };
    messages = Array.isArray(body.messages) ? body.messages : [];
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "⚙️ L'agent n'est pas encore relié à son modèle : ajoutez la variable " +
        "d'environnement ANTHROPIC_API_KEY sur Vercel pour activer la conversation. " +
        "La connexion à Odoo, elle, est déjà en place.",
    });
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        { error: `Modèle indisponible (HTTP ${res.status}).`, detail },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const reply =
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "(réponse vide)";

    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
