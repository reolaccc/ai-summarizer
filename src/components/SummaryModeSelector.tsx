import { getSummaryMode, SUMMARY_MODES, type SummaryModeId } from "../lib/summaryModes";

type Props = {
  value: SummaryModeId;
  onChange: (value: SummaryModeId) => void;
};

export function SummaryModeSelector({ value, onChange }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SUMMARY_MODES.map((mode) => {
        const active = mode.id === value;

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`rounded-2xl border px-5 py-5 text-left transition ${
              active
                ? "border-fuchsia-300/30 bg-fuchsia-500/10 text-fuchsia-50 shadow-sm"
                : "border-fuchsia-400/10 bg-[#240d1f] text-fuchsia-50/90 hover:border-fuchsia-300/20 hover:bg-fuchsia-500/10"
            }`}
          >
            <div className="text-base font-semibold text-fuchsia-50">{mode.label}</div>
          </button>
        );
      })}
    </div>
  );
}

export function SelectedModeChip({ value }: { value: SummaryModeId }) {
  const mode = getSummaryMode(value);

  return (
    <span className="inline-flex rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium text-fuchsia-50">
      {mode.label}
    </span>
  );
}
