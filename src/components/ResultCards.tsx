import { buildBulletTree, type BulletNode } from "../lib/bullets";

type SummaryProps = {
  modeLabel: string;
  sourceLabel?: string | null;
  summaryType: "paragraph" | "bullets" | "insights";
  summaryText: string;
  summaryBullets: BulletNode[];
  insightPairs: { insight: string; question: string }[];
  onCopy: () => void;
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
  onExportText,
  canCopy,
}: SummaryProps) {
  const hasSummaryContent =
    summaryType === "bullets"
      ? summaryBullets.length > 0
      : summaryType === "insights"
        ? insightPairs.length > 0
        : Boolean(summaryText.trim());

  const bulletTree = buildBulletTree(summaryBullets);

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
          <div className="space-y-3">
            {bulletTree.map((item, index) => (
              <BulletTreeItem key={`${item.text}-${index}`} node={item} />
            ))}
          </div>
        ) : hasSummaryContent && summaryType === "insights" ? (
          <div className="space-y-3">
            {insightPairs.map((pair, index) => (
              <div key={`${pair.insight}-${index}`} className="rounded-2xl border border-fuchsia-400/15 bg-[#1b0917] p-4">
                <p className="text-sm font-semibold text-fuchsia-200">Insight</p>
                <p className="mt-2 text-sm leading-7 text-fuchsia-50/90">{pair.insight}</p>
                <p className="mt-4 text-sm font-semibold text-fuchsia-200">Investigate</p>
                <p className="mt-2 text-sm leading-7 text-fuchsia-100/70">{pair.question}</p>
              </div>
            ))}
          </div>
        ) : hasSummaryContent ? (
          <StructuredParagraphSummary text={summaryText} />
        ) : (
          <div className="min-h-10" />
        )}
      </div>
    </section>
  );
}

function StructuredParagraphSummary({ text }: { text: string }) {
  const blocks = splitStructuredBlocks(text);

  return (
    <div className="space-y-4 text-sm leading-7 text-fuchsia-50/90 md:text-base">
      {blocks.map((block, index) =>
        block.type === "bullets" ? (
          <ul
            key={`bullets-${index}`}
            className="ml-5 list-disc space-y-2 text-fuchsia-100/85 marker:text-fuchsia-300"
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${item}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={`paragraph-${index}`} className="whitespace-pre-line">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}

function splitStructuredBlocks(text: string) {
  const lines = String(text ?? "").split("\n");
  const blocks: Array<
    | { type: "paragraph"; text: string }
    | { type: "bullets"; items: string[] }
  > = [];
  let paragraphLines: string[] = [];
  let bulletItems: string[] = [];

  const flushParagraph = () => {
    const textBlock = paragraphLines.join("\n").trim();
    if (textBlock) {
      blocks.push({ type: "paragraph", text: textBlock });
    }
    paragraphLines = [];
  };

  const flushBullets = () => {
    if (bulletItems.length > 0) {
      blocks.push({ type: "bullets", items: bulletItems });
    }
    bulletItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      bulletItems.push(line.replace(/^[-*•]\s+/, "").trim());
      continue;
    }

    flushBullets();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushBullets();

  return blocks;
}

function BulletTreeItem({ node }: { node: ReturnType<typeof buildBulletTree>[number] }) {
  const padding = Math.min(node.level, 3) * 16;

  return (
    <div className="rounded-2xl border border-fuchsia-400/10 bg-[#1b0917] px-4 py-3" style={{ marginLeft: padding }}>
      <div className="flex gap-3">
        <span
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
            node.level === 0 ? "bg-fuchsia-300" : node.level === 1 ? "bg-fuchsia-400" : "bg-rose-300"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p
            className={`leading-7 text-fuchsia-50/90 ${
              node.level === 0 ? "text-sm font-semibold md:text-[15px]" : "text-sm md:text-[14px]"
            }`}
          >
            {node.text}
          </p>
          {node.children.length > 0 ? (
            <div className="mt-3 space-y-2">
              {node.children.map((child, index) => (
                <BulletTreeItem key={`${child.text}-${index}`} node={child} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
