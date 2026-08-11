import { formatTimestamp, type TimelineEntry } from "./timeline";
import type { Target } from "./types";

/**
 * The mission is what the agent reads first: brief, targets, digest, table of
 * contents — and instructions telling it that the full transcript exists and how
 * to pull it. Everything here is levels 1 and 2 of the pyramid; it stays a few
 * thousand tokens no matter how long the call was.
 */

export interface MissionInput {
  id: string;
  title: string;
  brief: string | null;
  digest: string | null;
  toc: string | null;
  lexicon: string | null;
  language: string | null;
  targets: Target[];
  timeline: TimelineEntry[];
  totalDurationSec: number;
  createdAt: Date;
}

function renderTargets(targets: Target[]): string {
  if (targets.length === 0) {
    return "_Aucune cible précisée — demande à l'utilisateur avant de modifier quoi que ce soit._";
  }
  return targets
    .map((t) => {
      const kind = t.kind === "doc" ? "document" : "repo";
      return `- \`${t.path}\` (${kind})${t.note ? ` — ${t.note}` : ""}`;
    })
    .join("\n");
}

function renderSources(timeline: TimelineEntry[]): string {
  if (timeline.length === 0) return "_Aucun audio._";
  return timeline
    .map(
      (t) =>
        `- ${t.title} — commence à ${formatTimestamp(t.offsetSec)}, durée ${formatTimestamp(t.durationSec)}`
    )
    .join("\n");
}

/** Render the full mission as Markdown. */
export function renderMission(session: MissionInput): string {
  const parts: string[] = [];

  parts.push(`# Mission — ${session.title}`);
  parts.push(
    `Session \`${session.id}\` · ${session.createdAt.toISOString().slice(0, 10)} · ` +
      `${formatTimestamp(session.totalDurationSec)} d'audio · ${session.timeline.length} fichier(s)`
  );

  parts.push("\n## Ce que l'utilisateur demande\n");
  parts.push(
    session.brief?.trim() ||
      "_Aucun brief écrit. Traite le digest ci-dessous comme la source d'intention, et confirme avec l'utilisateur avant tout changement important._"
  );

  parts.push("\n## Cibles autorisées\n");
  parts.push(
    "Chemins sur la machine de l'utilisateur. Ne modifie rien en dehors de cette liste sans demander.\n"
  );
  parts.push(renderTargets(session.targets));

  if (session.digest?.trim()) {
    parts.push("\n## Digest de l'appel\n");
    parts.push(
      "_Chaque puce porte le timestamp d'où elle vient. En cas de doute sur une puce, va lire le verbatim avant d'agir._\n"
    );
    parts.push(session.digest.trim());
  }

  if (session.toc?.trim()) {
    parts.push("\n## Table des matières\n");
    parts.push(
      "_Sers-t'en pour repérer les minutes qui comptent, puis tire le verbatim de cette plage._\n"
    );
    parts.push(session.toc.trim());
  }

  parts.push("\n## Aller plus loin dans la transcription\n");
  parts.push(
    [
      "Le transcript complet n'est PAS dans ce document — il est indexé et se récupère à la demande.",
      "N'essaie pas de tout charger : lis le digest et la table des matières, décide ce qui compte, puis :",
      "",
      `- \`get_segment\` — verbatim d'une plage, ex. \`{ sessionId: "${session.id}", from: "1:40:00", to: "1:55:00" }\``,
      `- \`search_transcript\` — recherche plein texte, ex. \`{ sessionId: "${session.id}", query: "pricing paliers" }\``,
      "",
      "Fais-le chaque fois qu'une décision dépend de la formulation exacte, ou qu'une puce du digest est ambiguë.",
      "Le digest est un index, pas une source : c'est le verbatim qui fait foi.",
    ].join("\n")
  );

  if (session.timeline.length > 0) {
    parts.push("\n## Fichiers audio\n");
    parts.push(renderSources(session.timeline));
  }

  if (session.lexicon?.trim()) {
    parts.push("\n## Lexique\n");
    parts.push(
      "_Noms propres fournis avant transcription. Utilise ces graphies exactes dans tout ce que tu écris._\n"
    );
    parts.push("```\n" + session.lexicon.trim() + "\n```");
  }

  return parts.join("\n");
}
