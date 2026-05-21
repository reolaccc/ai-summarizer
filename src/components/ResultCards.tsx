type SummaryProps = {
  modeLabel: string;
  sourceLabel?: string | null;
  summaryType: "paragraph" | "bullets" | "insights";
  summaryText: string;
  summaryBullets: string[];
  insightPairs: { insight: string; question: string }[];
  onCopy: () => void;
  onExportMarkdown: () => void;
  onExportText: () => void;
  canCopy: boolean;
};

export function SummaryCard({
  modeLabel,
  sourceLabel,
  summaryType,
  summaryText,
  summaryBullets,
  insightPairs,
  onCopy,
  onExportMarkdown,
  onExportText,
  canCopy,
}: SummaryProps) {
  const hasSummaryContent =
    summaryType === "bullets"
      ? summaryBullets.length > 0
      : summaryType === "insights"
        ? insightPairs.length > 0
        : Boolean(summaryText.trim());

  return (
    <section className="rounded-3xl border border-fuchsia-400/20 bg-[#170613]/85 p-5 shadow-[0_16px_50px_rgba(0,0,0,0.22)] backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Summary</h2>
          <p className="mt-2 text-sm font-medium text-fuchsia-50">{modeLabel}</p>
          {sourceLabel ? <p className="mt-1 text-xs text-fuchsia-100/70">Source: {sourceLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!canCopy}
            className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-50 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Copy Summary
          </button>
          <button
            type="button"
            onClick={onExportMarkdown}
            disabled={!canCopy}
            className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-50 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .md
          </button>
          <button
            type="button"
            onClick={onExportText}
            disabled={!canCopy}
            className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-50 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .txt
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-fuchsia-400/10 bg-[#240d1f] p-4">
        {hasSummaryContent && summaryType === "bullets" ? (
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-fuchsia-50/90 md:text-base">
            {summaryBullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>{bullet}</li>
            ))}
          </ul>
        ) : hasSummaryContent && summaryType === "insights" ? (
          <div className="space-y-3">
            {insightPairs.map((pair, index) => (
              <div key={`${pair.insight}-${index}`} className="rounded-2xl border border-fuchsia-400/15 bg-[#1b0917] p-4">
                <p className="text-sm font-semibold text-fuchsia-200">Insight</p>
                <p className="mt-2 text-sm leading-7 text-fuchsia-50/90">{pair.insight}</p>
                <p className="mt-4 text-sm font-semibold text-fuchsia-200">Question</p>
                <p className="mt-2 text-sm leading-7 text-fuchsia-100/70">{pair.question}</p>
              </div>
            ))}
          </div>
        ) : hasSummaryContent ? (
          <p className="text-sm leading-7 text-fuchsia-50/90 md:text-base">
            {summaryText}
          </p>
        ) : (
          <div className="min-h-10" />
        )}
      </div>
    </section>
  );
}
