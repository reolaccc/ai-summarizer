export type SummaryModeId =
  | "standard"
  | "bullet_points"
  | "key_insights"
  | "academic"
  | "eli10";

export type SummaryOutputType = "paragraph" | "bullets";

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
    description: "Balanced, readable summary in plain language.",
    outputType: "paragraph",
    estimatedOutputTokens: 180,
  },
  {
    id: "bullet_points",
    label: "Bullet Points",
    description: "Compact bullets that are easy to scan.",
    outputType: "bullets",
    estimatedOutputTokens: 160,
  },
  {
    id: "key_insights",
    label: "Key Insights",
    description: "Insight-driven takeaways and implications.",
    outputType: "bullets",
    estimatedOutputTokens: 200,
  },
  {
    id: "academic",
    label: "Academic",
    description: "Formal tone with precise, structured wording.",
    outputType: "paragraph",
    estimatedOutputTokens: 220,
  },
  {
    id: "eli10",
    label: "Explain Like I'm 10",
    description: "Simple language with familiar examples.",
    outputType: "paragraph",
    estimatedOutputTokens: 170,
  },
];

export const DEFAULT_SUMMARY_MODE: SummaryModeId = "standard";

export function getSummaryMode(modeId: SummaryModeId) {
  return SUMMARY_MODES.find((mode) => mode.id === modeId) ?? SUMMARY_MODES[0];
}
