import { formatBulletNodes, type BulletNode } from "./bullets";

type ExportPayload = {
  title: string;
  summaryLabel: string;
  summaryType: "paragraph" | "bullets" | "insights";
  summaryText: string;
  summaryBullets: BulletNode[];
  insightPairs: { insight: string; question: string }[];
  questions: string[];
};

type SummaryOnlyPayload = Omit<ExportPayload, "questions">;

function buildSummaryLines(payload: SummaryOnlyPayload) {
  if (payload.summaryType === "bullets") {
    return formatBulletNodes(payload.summaryBullets);
  }

  if (payload.summaryType === "insights") {
    return payload.insightPairs
      .map((pair) => [`Insight: ${pair.insight}`, `Investigate: ${pair.question}`].join("\n"))
      .join("\n\n");
  }

  return payload.summaryText;
}

export function buildMarkdownExport(payload: ExportPayload) {
  const summarySection = buildSummaryLines(payload);

  const questionsSection = payload.questions.map((question) => `- ${question}`).join("\n");

  return [
    `# ${payload.title}`,
    "",
    `## ${payload.summaryLabel}`,
    "",
    summarySection || "No summary available.",
    "",
    "## Follow-up Questions",
    "",
    questionsSection || "No questions available.",
    "",
  ].join("\n");
}

export function buildPlainTextExport(payload: ExportPayload) {
  const summarySection = buildSummaryLines(payload);

  const questionsSection = payload.questions.map((question) => `- ${question}`).join("\n");

  return [
    payload.title,
    "",
    payload.summaryLabel,
    summarySection || "No summary available.",
    "",
    "Follow-up Questions",
    questionsSection || "No questions available.",
    "",
  ].join("\n");
}

export function buildSummaryClipboardText(
  payload: SummaryOnlyPayload,
) {
  return buildSummaryLines(payload);
}

export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
