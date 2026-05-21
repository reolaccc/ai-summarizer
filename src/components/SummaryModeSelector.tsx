import { getSummaryMode, SUMMARY_MODES, type SummaryModeId } from "../lib/summaryModes";

type Props = {
  value: SummaryModeId;
  onChange: (value: SummaryModeId) => void;
};

export function SummaryModeSelector({ value, onChange }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {SUMMARY_MODES.map((mode) => {
        const active = mode.id === value;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              active
                ? "border-cyan-400 bg-cyan-400/15 text-cyan-50"
                : "border-white/10 bg-slate-900/70 text-slate-200 hover:border-white/20 hover:bg-slate-900"
            }`}
          >
            <div className="text-sm font-semibold">{mode.label}</div>
            <div className="mt-1 text-xs leading-5 text-slate-400">{mode.description}</div>
          </button>
        );
      })}
    </div>
  );
}

export function SelectedModeChip({ value }: { value: SummaryModeId }) {
  const mode = getSummaryMode(value);

  return (
    <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
      {mode.label}
    </span>
  );
}
