import { getSummaryMode, SUMMARY_MODES, type SummaryModeId } from "../lib/summaryModes";

type Props = {
  value: SummaryModeId;
  onChange: (value: SummaryModeId) => void;
};

export function SummaryModeSelector({ value, onChange }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {SUMMARY_MODES.map((mode) => {
        const active = mode.id === value;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              active
                ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
            }`}
          >
            <div className="text-sm font-semibold">{mode.label}</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">{mode.description}</div>
          </button>
        );
      })}
    </div>
  );
}

export function SelectedModeChip({ value }: { value: SummaryModeId }) {
  const mode = getSummaryMode(value);

  return (
    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
      {mode.label}
    </span>
  );
}
