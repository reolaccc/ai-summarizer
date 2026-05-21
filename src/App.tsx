import { useMemo, useState, type FormEvent } from "react";
import { EstimatorCard } from "./components/EstimatorCard";
import { FileDropzone } from "./components/FileDropzone";
import { QuestionsCard, SummaryCard } from "./components/ResultCards";
import { SelectedModeChip, SummaryModeSelector } from "./components/SummaryModeSelector";
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
      setError("Paste text, article URL, or upload a PDF before generating a summary.");
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

  const emptyQuestions = summary?.questions ?? [];
  const sourceLabel = summary?.sourceLabel ?? (pdfFileName ? pdfFileName : "Paste text, article URL, or upload a PDF");

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#eff6ff_0%,_#f8fafc_38%,_#ffffff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-6 shadow-sm backdrop-blur">
          <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            AI Summarizer
          </div>
          <div className="mt-4 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Turn long content into clear summaries, fast.
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
              Paste text, article URL, or upload a PDF. Keep the interface simple, with just enough structure to get
              to the answer quickly.
            </p>
          </div>
        </header>

        <section className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">
                  Input
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Paste text, article URL, or upload a PDF.
                </p>
              </div>
              <div className="inline-flex flex-wrap gap-2">
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                  {sourceLabel}
                </span>
                {pdfFileName ? (
                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                    PDF: {pdfFileName}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
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
                placeholder="Paste text, article URL, or upload a PDF"
                className="mt-4 min-h-[280px] w-full resize-y rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-base leading-7 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                <span>{inputValue.trim().length.toLocaleString()} characters</span>
                <span>{isPdfProcessing ? "Processing PDF..." : "Ready for text, URL, or PDF"}</span>
              </div>
            </div>

            <SummaryModeSelector value={summaryMode} onChange={setSummaryMode} />
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Generate Summary</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Review the estimated token usage and cost, then generate a concise summary in the selected mode.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGenerating || isPdfProcessing}
              className="inline-flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isGenerating ? "Generating..." : "Generate Summary"}
            </button>
          </div>

          <div className="mt-4">
            <EstimatorCard
              inputTokens={usageEstimate.inputTokens}
              outputTokens={usageEstimate.outputTokens}
              estimatedCost={usageEstimate.estimatedCost}
            />
          </div>

          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
              {error}
            </p>
          ) : null}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
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

          <QuestionsCard questions={emptyQuestions} />
        </section>

        <section className="rounded-[2rem] border border-slate-200/80 bg-white/85 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-600">Ask a follow-up</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Keep the conversation going with questions about the generated summary.
              </p>
            </div>
            <SelectedModeChip value={summaryMode} />
          </div>

          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSendChat}>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Ask a question about the summary..."
              className="min-h-[120px] w-full resize-y rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {chatMessages.length > 0 ? `${chatMessages.length} message${chatMessages.length === 1 ? "" : "s"} in this thread` : "Start a new thread after generating a summary."}
              </span>
              <button
                type="submit"
                disabled={isSendingChat || !hasSummary}
                className="inline-flex items-center justify-center rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
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
                      ? "border-sky-200 bg-sky-50 text-sky-900"
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
              <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
                No follow-up question yet. Generate a summary first, then ask anything specific.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
