/**
 * Génération de séquences de mails de relance via Claude.
 *
 * Utilise l'API Messages avec un "tool" forcé pour obtenir une sortie
 * structurée (pas de parsing fragile). Aucune dépendance SDK : fetch.
 */

export interface PlannedEmail {
  /** Objet du mail. */
  subject: string;
  /** Corps du mail en HTML simple (<p>, <br>, <a>…). */
  body_html: string;
  /** Décalage en jours par rapport à aujourd'hui (0 = aujourd'hui). */
  send_offset_days: number;
}

export interface SequenceResult {
  emails: PlannedEmail[];
}

const SYSTEM_PROMPT = `Tu es un copywriter commercial B2B pour MyFrank.
On te donne le contexte d'une opportunité CRM (contact, société, secteur, historique,
notes…). Tu rédiges une SÉQUENCE de relance par e-mail, en français, professionnelle,
chaleureuse mais concise, sans être insistante.

Règles :
- 2 à 4 e-mails maximum, espacés intelligemment sur ~2 semaines (ex. jour 0, +3, +7, +12).
- Le 1er e-mail relance en douceur ; les suivants apportent un angle NOUVEAU
  (valeur ajoutée, cas d'usage, preuve sociale, question ouverte) — jamais une simple répétition.
- Personnalise avec le contexte réel fourni (nom, société, secteur, besoin exprimé).
  N'invente pas de faits que tu n'as pas ; reste général si l'info manque.
- Objets courts et incarnés. Corps en HTML simple (<p>, <br>, liens <a>), pas de styles inline.
- Signe de façon neutre (ex. « L'équipe MyFrank ») sauf si un commercial est indiqué.
- send_offset_days : entier, le 1er e-mail à 0.

Réponds UNIQUEMENT via l'outil submit_sequence.`;

const TOOL = {
  name: "submit_sequence",
  description: "Renvoie la séquence de mails de relance planifiés.",
  input_schema: {
    type: "object",
    properties: {
      emails: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            subject: { type: "string" },
            body_html: { type: "string" },
            send_offset_days: { type: "integer", minimum: 0 },
          },
          required: ["subject", "body_html", "send_offset_days"],
        },
      },
    },
    required: ["emails"],
  },
} as const;

export async function generateFollowupSequence(
  context: Record<string, unknown>,
): Promise<SequenceResult> {
  // Nettoie tout espace / retour à la ligne (fréquent lors d'un copier-coller
  // dans Vercel) : une clé API n'en contient jamais.
  const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s+/g, "");
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquant : impossible de générer la séquence.",
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "submit_sequence" },
      messages: [
        {
          role: "user",
          content:
            "Contexte de l'opportunité (JSON) :\n\n" +
            JSON.stringify(context, null, 2),
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Claude a répondu HTTP ${res.status} : ${detail}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: SequenceResult }>;
  };
  const toolUse = data.content?.find(
    (b) => b.type === "tool_use" && b.name === "submit_sequence",
  );
  if (!toolUse?.input?.emails) {
    throw new Error("Réponse Claude inattendue (pas de séquence).");
  }

  // Tri par date d'envoi croissante, sécurité.
  const emails = [...toolUse.input.emails].sort(
    (a, b) => a.send_offset_days - b.send_offset_days,
  );
  return { emails };
}
