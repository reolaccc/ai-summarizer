type ExportPayload = {
  title: string;
  summaryLabel: string;
  summaryType: "paragraph" | "bullets";
  summaryText: string;
  summaryBullets: string[];
  questions: string[];
};

export function buildMarkdownExport(payload: ExportPayload) {
  const summarySection =
    payload.summaryType === "bullets"
      ? payload.summaryBullets.map((item) => `- ${item}`).join("\n")
      : payload.summaryText;

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
  const summarySection =
    payload.summaryType === "bullets"
      ? payload.summaryBullets.map((item) => `- ${item}`).join("\n")
      : payload.summaryText;

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
