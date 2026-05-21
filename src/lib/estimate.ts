import { getSummaryMode, type SummaryModeId } from "./summaryModes";
import { MAX_INPUT_CHARACTERS, MAX_INPUT_TOKENS } from "./limits.js";

const MODEL_PRICING = {
  inputPerMillion: 0.75,
  outputPerMillion: 4.5,
};

export function estimateTokens(text: string) {
  if (!text.trim()) {
    return 0;
  }

  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCostUsd(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens * MODEL_PRICING.inputPerMillion) / 1_000_000 +
    (outputTokens * MODEL_PRICING.outputPerMillion) / 1_000_000
  );
}

export function getUsageEstimate(inputText: string, modeId: SummaryModeId) {
  const mode = getSummaryMode(modeId);
  const inputTokens = estimateTokens(inputText);
  const outputTokens = mode.estimatedOutputTokens;
  const estimatedCost = estimateCostUsd(inputTokens, outputTokens);

  return {
    inputTokens,
    outputTokens,
    estimatedCost,
  };
}

export { MAX_INPUT_CHARACTERS, MAX_INPUT_TOKENS };
