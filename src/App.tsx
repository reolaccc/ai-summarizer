import { useMemo, useState, type FormEvent } from "react";
import { FileDropzone } from "./components/FileDropzone";
import { SummaryCard } from "./components/ResultCards";
import { SummaryModeSelector } from "./components/SummaryModeSelector";
import {
  buildMarkdownExport,
  buildPlainTextExport,
  buildSummaryClipboardText,
  copyToClipboard,
  downloadTextFile,
} from "./lib/export";
import { DEFAULT_SUMMARY_MODE, getSummaryMode, type SummaryModeId } from "./lib/summaryModes";
import { extractPdfText } from "./lib/pdf";
import { getUsageEstimate } from "./lib/estimate";

type SummaryResponse = {
  modeLabel: string;
  summaryType: "paragraph" | "bullets" | "insights";
  summaryText: string;
  summaryBullets: string[];
  insightPairs: { insight: string; question: string }[];
  questions: string[];
  contextText: string;
  sourceLabel: string;
  spend?: {
    monthKey: string;
    spentUsd: number;
    limitUsd: number;
  };
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_TITLE = "AI Summarizer";

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const [summaryMode, setSummaryMode] = useState<SummaryModeId>(DEFAULT_SUMMARY_MODE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);

  const selectedMode = getSummaryMode(summaryMode);
  const usageEstimate = useMemo(() => getUsageEstimate(inputValue, summaryMode), [inputValue, summaryMode]);
  const hasSummary = Boolean(summary);
  const sourceLabel = summary?.sourceLabel ?? (pdfFileName ? pdfFileName : "");

  async function handlePdfFileSelected(file: File) {
    setError(null);

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }

    setIsPdfProcessing(true);

    try {
      const extracted = await extractPdfText(file);
      const text = extracted.text.trim();

      if (!text) {
        throw new Error("No readable text was found in that PDF.");
      }

      setInputValue(text);
      setPdfFileName(extracted.fileName);
      setSummary(null);
      setChatMessages([]);
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Unable to parse that PDF.";
      setError(message);
      setPdfFileName(null);
    } finally {
      setIsPdfProcessing(false);
    }
  }

  async function handleGenerateSummary() {
    const content = inputValue.trim();

    if (!content) {
      setError("Please paste text or upload a PDF before generating a summary.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          value: content,
          summaryMode,
        }),
      });

      const data = (await response.json()) as SummaryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong while generating the summary.");
      }

      setSummary({
        modeLabel: selectedMode.label,
        summaryType: data.summaryType,
        summaryText: data.summaryText,
        summaryBullets: Array.isArray(data.summaryBullets) ? data.summaryBullets : [],
        insightPairs: Array.isArray(data.insightPairs) ? data.insightPairs : [],
        questions: Array.isArray(data.questions) ? data.questions.slice(0, 3) : [],
        contextText: data.contextText,
        sourceLabel: data.sourceLabel,
        spend: data.spend,
      });
      setChatMessages([]);
      setChatInput("");
    } catch (summaryError) {
      const message = summaryError instanceof Error ? summaryError.message : "Something went wrong while generating the summary.";
      setError(message);
      setSummary(null);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopySummary() {
    if (!summary) {
      return;
    }

    await copyToClipboard(
      buildSummaryClipboardText({
        title: DEFAULT_TITLE,
        summaryLabel: summary.modeLabel,
        summaryType: summary.summaryType,
        summaryText: summary.summaryText,
        summaryBullets: summary.summaryBullets,
        insightPairs: summary.insightPairs,
      }),
    );
  }

  function handleExportMarkdown() {
    if (!summary) {
      return;
    }

    downloadTextFile(
      "ai-summary.md",
      buildMarkdownExport({
        title: DEFAULT_TITLE,
        summaryLabel: summary.modeLabel,
        summaryType: summary.summaryType,
        summaryText: summary.summaryText,
        summaryBullets: summary.summaryBullets,
        insightPairs: summary.insightPairs,
        questions: summary.questions,
      }),
    );
  }

  function handleExportText() {
    if (!summary) {
      return;
    }

    downloadTextFile(
      "ai-summary.txt",
      buildPlainTextExport({
        title: DEFAULT_TITLE,
        summaryLabel: summary.modeLabel,
        summaryType: summary.summaryType,
        summaryText: summary.summaryText,
        summaryBullets: summary.summaryBullets,
        insightPairs: summary.insightPairs,
        questions: summary.questions,
      }),
    );
  }

  async function handleSendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!summary) {
      setError("Generate a summary first so I have context for follow-up questions.");
      return;
    }

    const question = chatInput.trim();
    if (!question) {
      setError("Type a question before sending.");
      return;
    }

    setIsSendingChat(true);
    setError(null);

    const nextMessages: ChatMessage[] = [...chatMessages, { role: "user", content: question }];
    setChatMessages(nextMessages);
    setChatInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceContext: summary.contextText,
          summaryType: summary.summaryType,
          summaryText: summary.summaryText,
          summaryBullets: summary.summaryBullets,
          insightPairs: summary.insightPairs,
          messages: nextMessages,
        }),
      });

      const data = (await response.json()) as { answer?: string; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Unable to answer that question right now.");
      }

      setChatMessages([
        ...nextMessages,
        {
          role: "assistant",
          content:
            data.answer ||
            "I could not generate a response for that question, but the source may still contain the answer.",
        },
      ]);
    } catch (chatError) {
      const message = chatError instanceof Error ? chatError.message : "Unable to answer that question right now.";
      setError(message);
    } finally {
      setIsSendingChat(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#fce7f3_0%,_#fff1f8_34%,_#ffffff_72%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-pink-200/80 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-black tracking-tight text-fuchsia-950 drop-shadow-sm sm:text-7xl">
              AI Summarizer
            </h1>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-500 sm:text-xl">
              Turn long content into clear summaries, fast.
            </p>
          </div>
        </header>

        <section className="rounded-[2rem] border border-pink-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">Input</h2>
              </div>
              <div className="inline-flex flex-wrap gap-2">
                {sourceLabel ? (
                  <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-700">
                    {sourceLabel}
                  </span>
                ) : null}
                {pdfFileName ? (
                  <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                    PDF: {pdfFileName}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-pink-100 bg-pink-50/60 p-4">
              <FileDropzone
                onPdfFileSelected={handlePdfFileSelected}
                isProcessing={isPdfProcessing}
                fileName={pdfFileName}
              />

              <textarea
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setError(null);
                }}
                placeholder="Paste your text here or drop a PDF"
                className="mt-4 min-h-[280px] w-full resize-y rounded-[1.5rem] border border-pink-200 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-100"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>{inputValue.trim().length.toLocaleString()} characters</span>
                <span>{isPdfProcessing ? "Processing PDF..." : "Ready"}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-pink-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                  Generate Summary
                </h2>
              </div>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={isGenerating || isPdfProcessing}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-fuchsia-500 hover:via-pink-500 hover:to-rose-400 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isGenerating ? "Generating..." : "Generate Summary"}
              </button>
            </div>

            <div className="rounded-[1.5rem] border border-pink-100 bg-pink-50/70 p-4">
              <div className="flex flex-col gap-4">
                <SummaryModeSelector value={summaryMode} onChange={setSummaryMode} />
                <div className="rounded-2xl border border-pink-100 bg-white/90 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-fuchsia-700">
                      Token estimate
                    </span>
                    <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-800">
                      Input ~{usageEstimate.inputTokens.toLocaleString()}
                    </span>
                    <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-800">
                      Output ~{usageEstimate.outputTokens.toLocaleString()}
                    </span>
                    <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-medium text-fuchsia-800">
                      Cost ~${usageEstimate.estimatedCost.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <SummaryCard
            modeLabel={summary?.modeLabel ?? selectedMode.label}
            sourceLabel={summary?.sourceLabel ?? null}
            summaryType={summary?.summaryType ?? "bullets"}
            summaryText={summary?.summaryText ?? ""}
            summaryBullets={summary?.summaryBullets ?? []}
            insightPairs={summary?.insightPairs ?? []}
            onCopy={handleCopySummary}
            onExportMarkdown={handleExportMarkdown}
            onExportText={handleExportText}
            canCopy={hasSummary}
          />
        </section>

        <section className="rounded-[2rem] border border-pink-200/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-700">Ask a follow-up</h2>
            </div>
          </div>

          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSendChat}>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask a question about the summary..."
              className="min-h-[120px] w-full resize-y rounded-[1.5rem] border border-pink-200 bg-pink-50/60 px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={isSendingChat || !hasSummary}
                className="inline-flex items-center justify-center rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-5 py-3 text-sm font-semibold text-fuchsia-800 transition hover:border-fuchsia-300 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isSendingChat ? "Thinking..." : "Send Question"}
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-3">
            {chatMessages.length > 0 ? (
              chatMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {message.role === "user" ? "You" : "AI"}
                  </div>
                  {message.content}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-pink-200 bg-pink-50/40 px-4 py-3 text-sm leading-6 text-slate-500">
                Ask a question to start the conversation.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
