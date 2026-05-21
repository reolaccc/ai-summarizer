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
            className={`crystal-option rounded-2xl px-5 py-5 text-left transition ${
              active ? "crystal-option-active text-fuchsia-50" : "text-fuchsia-50/90 hover:opacity-95"
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
    <span className="crystal-chip inline-flex rounded-full px-3 py-1 text-xs font-medium text-fuchsia-50">
      {mode.label}
    </span>
  );
}
