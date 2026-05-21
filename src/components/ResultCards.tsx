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
    <section className="rounded-3xl border border-pink-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">Summary</h2>
          <p className="mt-2 text-sm font-medium text-fuchsia-900">{modeLabel}</p>
          {sourceLabel ? <p className="mt-1 text-xs text-slate-500">Source: {sourceLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!canCopy}
            className="rounded-2xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-fuchsia-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Copy Summary
          </button>
          <button
            type="button"
            onClick={onExportMarkdown}
            disabled={!canCopy}
            className="rounded-2xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-fuchsia-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .md
          </button>
          <button
            type="button"
            onClick={onExportText}
            disabled={!canCopy}
            className="rounded-2xl border border-pink-200 bg-white px-4 py-2 text-sm font-medium text-fuchsia-700 transition hover:border-fuchsia-300 hover:bg-fuchsia-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .txt
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/60 p-4">
        {hasSummaryContent && summaryType === "bullets" ? (
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-slate-700 md:text-base">
            {summaryBullets.map((bullet, index) => (
              <li key={`${bullet}-${index}`}>{bullet}</li>
            ))}
          </ul>
        ) : hasSummaryContent && summaryType === "insights" ? (
          <div className="space-y-3">
            {insightPairs.map((pair, index) => (
              <div key={`${pair.insight}-${index}`} className="rounded-2xl border border-pink-100 bg-white p-4">
                <p className="text-sm font-semibold text-fuchsia-800">Insight</p>
                <p className="mt-2 text-sm leading-7 text-slate-700">{pair.insight}</p>
                <p className="mt-4 text-sm font-semibold text-fuchsia-800">Question</p>
                <p className="mt-2 text-sm leading-7 text-slate-600">{pair.question}</p>
              </div>
            ))}
          </div>
        ) : hasSummaryContent ? (
          <p className="text-sm leading-7 text-slate-700 md:text-base">
            {summaryText}
          </p>
        ) : (
          <p className="text-sm leading-7 text-slate-500">
            Your summary will appear here after you generate one.
          </p>
        )}
      </div>
    </section>
  );
}
