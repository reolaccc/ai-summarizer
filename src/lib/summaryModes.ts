export type SummaryModeId =
  | "standard"
  | "key_insights"
  | "eli10";

export type SummaryOutputType = "paragraph" | "bullets" | "insights";

export type SummaryModeConfig = {
  id: SummaryModeId;
  label: string;
  description: string;
  outputType: SummaryOutputType;
  estimatedOutputTokens: number;
};

export const SUMMARY_MODES: SummaryModeConfig[] = [
  {
    id: "standard",
    label: "Standard Summary",
    description: "Paragraph-first summary with optional supporting bullets.",
    outputType: "paragraph",
    estimatedOutputTokens: 900,
  },
  {
    id: "key_insights",
    label: "Key Insights",
    description: "Deeper ideas, patterns, and implications.",
    outputType: "insights",
    estimatedOutputTokens: 240,
  },
  {
    id: "eli10",
    label: "Explain Like I'm 10",
    description: "Warm, example-rich, at least 3 short paragraphs.",
    outputType: "paragraph",
    estimatedOutputTokens: 420,
  },
];

export const DEFAULT_SUMMARY_MODE: SummaryModeId = "standard";

export function getSummaryMode(modeId: SummaryModeId) {
  return SUMMARY_MODES.find((mode) => mode.id === modeId) ?? SUMMARY_MODES[0];
}
