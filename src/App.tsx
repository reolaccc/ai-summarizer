import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { SummaryCard } from "./components/ResultCards";
import { SummaryModeSelector } from "./components/SummaryModeSelector";
import { type BulletNode } from "./lib/bullets";
import {
  buildPlainTextExport,
  buildSummaryClipboardText,
  copyToClipboard,
  downloadTextFile,
} from "./lib/export";
import { DEFAULT_SUMMARY_MODE, getSummaryMode, type SummaryModeId } from "./lib/summaryModes";
import { extractPdfText } from "./lib/pdf";
import { MAX_INPUT_CHARACTERS, MAX_INPUT_TOKENS } from "./lib/estimate";

type SummaryResponse = {
  modeLabel: string;
  summaryType: "paragraph" | "bullets" | "insights";
  summaryText: string;
  summaryBullets: BulletNode[];
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
  const [isInputDragActive, setIsInputDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedMode = getSummaryMode(summaryMode);
  const hasSummary = Boolean(summary);
  const sourceLabel = summary?.sourceLabel ?? (pdfFileName ? pdfFileName : "");
  const isInputTooLarge = inputValue.trim().length > MAX_INPUT_CHARACTERS;

  function clearCurrentInput() {
    setInputValue("");
    setPdfFileName(null);
    setSummary(null);
    setChatInput("");
    setChatMessages([]);
    setError(null);
    fileInputRef.current && (fileInputRef.current.value = "");
  }

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

  function openPdfPicker() {
    fileInputRef.current?.click();
  }

  async function handleSelectedPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      await handlePdfFileSelected(file);
    }

    event.target.value = "";
  }

  async function handleGenerateSummary() {
    const content = inputValue.trim();

    if (!content) {
      setError("Please paste text or upload a PDF before generating a summary.");
      return;
    }

    if (content.length > MAX_INPUT_CHARACTERS) {
      setError(
        `This demo only supports inputs up to ${MAX_INPUT_CHARACTERS.toLocaleString()} characters (about ${Math.round(MAX_INPUT_TOKENS).toLocaleString()} tokens). Please paste a shorter excerpt, upload a smaller PDF, or split the document into sections.`,
      );
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
        summaryBullets: Array.isArray(data.summaryBullets)
          ? data.summaryBullets
              .map((item) => ({
                text: typeof item?.text === "string" ? item.text.trim() : String(item ?? "").trim(),
                level: Number.isFinite(item?.level) ? Math.max(0, Math.min(3, Math.floor(item.level))) : 0,
              }))
              .filter((item) => item.text)
          : [],
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
    await submitChatQuestion();
  }

  async function submitChatQuestion() {
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#5b0f46_0%,_#3f0834_40%,_#160111_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="rounded-[2rem] border border-fuchsia-400/20 bg-white/6 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-black tracking-tight text-fuchsia-50 drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)] sm:text-7xl">
              AI Summarizer
            </h1>
            <p className="mt-3 text-lg font-medium leading-7 text-fuchsia-100/80 sm:text-xl">
              Understand long content and uncover deep insights in minutes.
            </p>
          </div>
        </header>

        <section className="rounded-[2rem] border border-fuchsia-400/20 bg-white/8 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur">
          <div
            className={`rounded-[1.75rem] border p-3 transition ${
              isInputDragActive ? "border-fuchsia-300/35 bg-fuchsia-500/12" : "border-fuchsia-400/15 bg-white/6"
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsInputDragActive(true);
            }}
            onDragLeave={() => setIsInputDragActive(false)}
            onDrop={async (event) => {
              event.preventDefault();
              setIsInputDragActive(false);

              const file = event.dataTransfer.files[0];
              if (file) {
                await handlePdfFileSelected(file);
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleSelectedPdf}
            />

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap gap-2">
                  {sourceLabel ? (
                    <span className="inline-flex rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-medium text-fuchsia-100">
                      {sourceLabel}
                    </span>
                  ) : null}
                  {pdfFileName ? (
                    <span className="inline-flex rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-100">
                      PDF: {pdfFileName}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openPdfPicker}
                    className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-50 transition hover:bg-fuchsia-500/20"
                  >
                    Upload PDF
                  </button>
                  <button
                    type="button"
                    onClick={clearCurrentInput}
                    className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-50 transition hover:bg-fuchsia-500/20"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setError(null);
                }}
                placeholder="Paste text / url here or drop a PDF"
                className="min-h-[150px] w-full resize-y rounded-[1.5rem] border border-fuchsia-400/20 bg-[#180715] px-4 py-3 text-base leading-7 text-fuchsia-50 outline-none transition placeholder:text-fuchsia-200/40 focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-500/20"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fuchsia-100/70">
                <span>{inputValue.trim().length.toLocaleString()} characters</span>
                {isPdfProcessing ? <span>Processing PDF...</span> : null}
                <span className={isInputTooLarge ? "text-rose-200" : "text-fuchsia-100/60"}>
                  Max {MAX_INPUT_CHARACTERS.toLocaleString()} chars
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-fuchsia-400/20 bg-white/8 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                  Generate Summary
                </h2>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-fuchsia-400/15 bg-white/6 p-4">
              <div className="flex flex-col gap-4">
                <SummaryModeSelector value={summaryMode} onChange={setSummaryMode} />
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGenerating || isPdfProcessing || isInputTooLarge}
              className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-400 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(236,72,153,0.35)] transition hover:from-fuchsia-400 hover:via-pink-400 hover:to-rose-300 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isGenerating ? "Generating..." : "Generate Summary"}
            </button>

            {isInputTooLarge ? (
              <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100">
                Input too large. Please keep it under {MAX_INPUT_CHARACTERS.toLocaleString()} characters
                for this demo so we do not spend the whole API budget on one document.
              </p>
            ) : null}

            {error ? (
              <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <section>
          <SummaryCard
            modeLabel={summary?.modeLabel ?? selectedMode.label}
            sourceLabel={summary?.sourceLabel ?? null}
            summaryType={summary?.summaryType ?? selectedMode.outputType}
            summaryText={summary?.summaryText ?? ""}
            summaryBullets={summary?.summaryBullets ?? []}
            insightPairs={summary?.insightPairs ?? []}
            onCopy={handleCopySummary}
            onExportText={handleExportText}
            canCopy={hasSummary}
          />
        </section>

        <section className="rounded-[2rem] border border-fuchsia-400/20 bg-white/8 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-fuchsia-200">Ask a follow-up</h2>
            </div>
          </div>

          <form className="mt-4 flex flex-col gap-3" onSubmit={handleSendChat}>
            <textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitChatQuestion();
                }
              }}
              placeholder="Ask a question about the summary..."
              className="min-h-[120px] w-full resize-y rounded-[1.5rem] border border-fuchsia-400/20 bg-[#180715] px-4 py-4 text-sm leading-6 text-fuchsia-50 outline-none transition placeholder:text-fuchsia-200/40 focus:border-fuchsia-300 focus:ring-4 focus:ring-fuchsia-500/20"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="submit"
                disabled={isSendingChat || !hasSummary}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-400 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(236,72,153,0.35)] transition hover:from-fuchsia-400 hover:via-pink-400 hover:to-rose-300 disabled:cursor-not-allowed disabled:bg-slate-500"
              >
                {isSendingChat ? "Thinking..." : "Send Question"}
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-3">
            {chatMessages.length > 0 ? (
              groupChatMessages(chatMessages)
                .reverse()
                .map((turn, turnIndex) => (
                  <div key={`turn-${turnIndex}`} className="space-y-3">
                    {turn.user ? (
                      <div className="rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 px-4 py-3 text-sm leading-7 text-fuchsia-50">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          You
                        </div>
                        {turn.user.content}
                      </div>
                    ) : null}
                    {turn.assistant ? (
                      <div className="rounded-2xl border border-fuchsia-400/15 bg-[#1b0917] px-4 py-3 text-sm leading-7 text-fuchsia-50">
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          AI
                        </div>
                        {turn.assistant.content}
                      </div>
                    ) : null}
                  </div>
                ))
            ) : (
              <div className="min-h-10" />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function groupChatMessages(messages: ChatMessage[]) {
  const turns: Array<{ user?: ChatMessage; assistant?: ChatMessage }> = [];

  for (let index = 0; index < messages.length; index += 2) {
    const user = messages[index]?.role === "user" ? messages[index] : undefined;
    const assistant = messages[index + 1]?.role === "assistant" ? messages[index + 1] : undefined;
    turns.push({ user, assistant });
  }

  return turns;
}
