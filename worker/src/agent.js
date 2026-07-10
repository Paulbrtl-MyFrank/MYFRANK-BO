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
- LIS ATTENTIVEMENT le champ "historique" (derniers e-mails, notes, appels) et,
  s'il est présent, le TRANSCRIPT de la visio de démo (champ transcript / compte-rendu) :
  c'est la réalité de la relation (besoins exprimés, objections, contexte de
  l'établissement). Le CONTENU comme le TIMING doivent en découler — cohérents avec
  ce qui s'est dit, reprenant le fil, sans jamais contredire un échange récent.
- 2 à 4 e-mails.
- CADENCE — espace nettement les envois, ne les tasse pas. Par défaut, étale la
  séquence sur ~4 à 6 semaines avec des intervalles qui s'agrandissent
  (ex. J0, +7, +18, +32). Le timing est une DÉCISION, jamais un gabarit fixe :
  ADAPTE-le au contexte. Prospect chaud/engagé → un peu plus resserré ; prospect
  tiède, froid ou occupé → plus espacé.
- RÈGLE ABSOLUE DE TIMING : n'envoie JAMAIS un e-mail avant la période/date de
  recontact convenue avec le prospect dans les échanges (« rappelez-moi la semaine
  prochaine », « après le 15 », « on se reparle à la rentrée », « je reviens dans
  2 semaines »…). Le tout premier envoi doit tomber À ou APRÈS ce moment — jamais avant.
- VARIE nettement les e-mails : chaque message porte un ANGLE distinct, jamais une
  redite. Puise dans ces axes et ORDONNE-les selon le profil et l'historique :
  • Relance simple : vérifier qu'il a bien vu ton précédent message / récap.
  • Valeur & preuve chiffrée : importance des avis Google (ex. ~+9 % de CA par étoile
    supplémentaire, meilleur référencement local, moins de dépendance aux OTA).
  • Passage à l'action : mise en place ultra-rapide (~1 h) avec Joseph (l'associé),
    lien de prise de RDV : https://calendar.app.google/LRbtjkhtyyuoJEX47 — outil
    directement opérationnel.
  Tu peux fusionner ou omettre un axe selon la pertinence ; l'essentiel : chaque
  mail apporte quelque chose de NEUF, adapté au profil.
- Personnalise avec le contexte réel fourni. N'invente pas de faits ; reste général si l'info manque.
- Objets courts et incarnés. Corps en HTML simple (<p>, <br>, liens <a>), sans styles inline.
- Signe de façon neutre (ex. « L'équipe MyFrank ») sauf si un commercial est indiqué.

STOP / NE PAS RELANCER : si l'historique montre que le prospect a clairement REFUSÉ,
demandé d'arrêter, dit qu'il ne souhaite pas avancer maintenant, choisi un autre
prestataire, ou qu'une relance serait déplacée, alors NE génère PAS de séquence.
Dans ce cas, réponds à la place avec : {"skip": true, "reason": "<raison courte>"}.

SORTIE : réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises
de code. Soit une séquence :
{"emails":[{"subject":"...","body_html":"...","send_offset_days":0}, ...]}
(send_offset_days est un entier, le 1er e-mail vaut 0), soit un skip :
{"skip": true, "reason": "..."}`;

/**
 * Construit le prompt système. Les consignes de style peuvent venir (par ordre
 * de priorité) du paramètre Odoo (édité dans le front Vercel), puis de la
 * variable d'environnement AGENT_STYLE. Elles sont ajoutées au prompt et
 * PRIORITAIRES sur les règles par défaut.
 */
function buildSystemPrompt(styleOverride) {
  const style =
    (typeof styleOverride === "string" && styleOverride.trim()) ||
    process.env.AGENT_STYLE?.trim();
  if (!style) return SYSTEM_PROMPT;
  return (
    SYSTEM_PROMPT +
    "\n\n=== CONSIGNES DE STYLE SPÉCIFIQUES (PRIORITAIRES sur les règles ci-dessus) ===\n" +
    style
  );
}

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

export async function generateFollowupSequence(context, styleOverride) {
  const prompt =
    "Contexte de l'opportunité (JSON) :\n\n" +
    JSON.stringify(context, null, 2) +
    "\n\nRédige la séquence et renvoie UNIQUEMENT le JSON demandé.";

  let text = "";
  for await (const message of query({
    prompt,
    options: {
      systemPrompt: buildSystemPrompt(styleOverride),
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

  // L'agent peut décider de ne pas relancer (prospect ayant refusé, etc.).
  if (parsed.skip === true) {
    return { skip: true, reason: String(parsed.reason || "").trim() };
  }

  if (!Array.isArray(parsed.emails) || parsed.emails.length === 0) {
    throw new Error("La séquence générée ne contient aucun e-mail.");
  }

  const emails = parsed.emails
    .map((e) => {
      // Le modèle renvoie parfois send_offset_days en texte ("3") : on
      // convertit explicitement en nombre avant de valider.
      const offset = Number(e.send_offset_days);
      return {
        subject: String(e.subject || "").trim(),
        body_html: String(e.body_html || "").trim(),
        send_offset_days: Number.isFinite(offset)
          ? Math.max(0, Math.trunc(offset))
          : 0,
      };
    })
    .filter((e) => e.subject && e.body_html)
    .sort((a, b) => a.send_offset_days - b.send_offset_days);

  if (!emails.length) throw new Error("Séquence invalide après nettoyage.");
  return { emails };
}
