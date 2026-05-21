type SummaryProps = {
  modeLabel: string;
  summaryType: "paragraph" | "bullets";
  summaryText: string;
  summaryBullets: string[];
  onCopy: () => void;
  onExportMarkdown: () => void;
  onExportText: () => void;
  canCopy: boolean;
};

type QuestionsProps = {
  questions: string[];
};

export function SummaryCard({
  modeLabel,
  summaryType,
  summaryText,
  summaryBullets,
  onCopy,
  onExportMarkdown,
  onExportText,
  canCopy,
}: SummaryProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Summary</h2>
          <p className="mt-2 text-sm text-slate-400">{modeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onCopy}
            disabled={!canCopy}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Copy Summary
          </button>
          <button
            type="button"
            onClick={onExportMarkdown}
            disabled={!canCopy}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .md
          </button>
          <button
            type="button"
            onClick={onExportText}
            disabled={!canCopy}
            className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export .txt
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
        {summaryType === "bullets" ? (
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-slate-100 md:text-base">
            {summaryBullets.length > 0 ? (
              summaryBullets.map((bullet, index) => <li key={`${bullet}-${index}`}>{bullet}</li>)
            ) : (
              <li>No summary available.</li>
            )}
          </ul>
        ) : (
          <p className="text-sm leading-7 text-slate-100 md:text-base">
            {summaryText || "No summary available."}
          </p>
        )}
      </div>
    </section>
  );
}

export function QuestionsCard({ questions }: QuestionsProps) {
  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
        Insightful Follow-up Questions
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Three thoughtful questions generated from the content.
      </p>

      <div className="mt-4 space-y-3">
        {questions.length > 0 ? (
          questions.map((question, index) => (
            <div key={`${question}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-sm leading-6 text-slate-100">
              {question}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Questions will appear here after you generate a summary.</p>
        )}
      </div>
    </section>
  );
}
