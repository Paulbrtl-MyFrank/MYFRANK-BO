/**
 * Génération de séquences de relance via le Claude Agent SDK.
 *
 * Le SDK s'authentifie avec le PLAN Claude (Pro/Max) grâce au token
 * CLAUDE_CODE_OAUTH_TOKEN (voir README) — aucune clé API facturée à l'usage.
 *
 * On n'utilise pas la dimension "agentique" (outils, boucle) : on demande
 * juste une réponse JSON en un tour. Le prompt impose une sortie stricte
 * que l'on parse ensuite.
 */

import { query } from "@anthropic-ai/claude-agent-sdk";

const SYSTEM_PROMPT = `Tu es un copywriter commercial B2B pour MyFrank.
On te donne le contexte d'une opportunité CRM (contact, société, secteur, historique,
notes…). Tu rédiges une SÉQUENCE de relance par e-mail, en français, professionnelle,
chaleureuse mais concise, sans être insistante.

Règles :
- 2 à 4 e-mails maximum, espacés intelligemment sur ~2 semaines (ex. jour 0, +3, +7, +12).
- Le 1er e-mail relance en douceur ; les suivants apportent un angle NOUVEAU
  (valeur ajoutée, cas d'usage, preuve sociale, question ouverte) — jamais une répétition.
- Personnalise avec le contexte réel fourni. N'invente pas de faits ; reste général si l'info manque.
- Objets courts et incarnés. Corps en HTML simple (<p>, <br>, liens <a>), sans styles inline.
- Signe de façon neutre (ex. « L'équipe MyFrank ») sauf si un commercial est indiqué.

SORTIE : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises
de code, au format exact :
{"emails":[{"subject":"...","body_html":"...","send_offset_days":0}, ...]}
send_offset_days est un entier (le 1er e-mail vaut 0).`;

/** Extrait le premier objet JSON d'une chaîne (tolère les ``` et le texte autour). */
function extractJson(text) {
  if (!text) throw new Error("Réponse vide du modèle.");
  let s = text.trim();
  // Retire d'éventuelles clôtures markdown.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Aucun JSON trouvé dans la réponse du modèle.");
  }
  return JSON.parse(s.slice(start, end + 1));
}

export async function generateFollowupSequence(context) {
  const prompt =
    "Contexte de l'opportunité (JSON) :\n\n" +
    JSON.stringify(context, null, 2) +
    "\n\nRédige la séquence et renvoie UNIQUEMENT le JSON demandé.";

  let text = "";
  for await (const message of query({
    prompt,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: process.env.AGENT_MODEL || "claude-sonnet-5",
      allowedTools: [], // pas d'outils : simple génération de texte
      // Marge de tours (le SDK compte l'échange complet). Sans outils, la
      // génération tient en un tour ; ce plafond évite l'erreur "max turns".
      maxTurns: 6,
      // On ne charge aucune config locale (CLAUDE.md, settings…).
      settingSources: [],
    },
  })) {
    if (message.type === "assistant" && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === "text" && block.text) text += block.text;
      }
    } else if (message.type === "result" && typeof message.result === "string") {
      // Le message final "result" contient la réponse consolidée.
      text = message.result;
    }
  }

  const parsed = extractJson(text);
  if (!Array.isArray(parsed.emails) || parsed.emails.length === 0) {
    throw new Error("La séquence générée ne contient aucun e-mail.");
  }

  const emails = parsed.emails
    .map((e) => ({
      subject: String(e.subject || "").trim(),
      body_html: String(e.body_html || "").trim(),
      send_offset_days: Number.isFinite(e.send_offset_days)
        ? Math.max(0, Math.trunc(e.send_offset_days))
        : 0,
    }))
    .filter((e) => e.subject && e.body_html)
    .sort((a, b) => a.send_offset_days - b.send_offset_days);

  if (!emails.length) throw new Error("Séquence invalide après nettoyage.");
  return { emails };
}
