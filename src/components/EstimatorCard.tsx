type Props = {
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
};

export function EstimatorCard({ inputTokens, outputTokens, estimatedCost }: Props) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Token / Cost Estimator</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Input Tokens" value={`~${inputTokens.toLocaleString()}`} />
        <Stat label="Output Tokens" value={`~${outputTokens.toLocaleString()}`} />
        <Stat label="Estimated Cost" value={`~$${estimatedCost.toFixed(4)}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
    </div>
  );
}
