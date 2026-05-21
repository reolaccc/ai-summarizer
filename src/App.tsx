import { useMemo, useState } from "react";
import { EstimatorCard } from "./components/EstimatorCard";
import { FileDropzone } from "./components/FileDropzone";
import { QuestionsCard, SummaryCard } from "./components/ResultCards";
import { SelectedModeChip, SummaryModeSelector } from "./components/SummaryModeSelector";
import { buildMarkdownExport, buildPlainTextExport, copyToClipboard, downloadTextFile } from "./lib/export";
import { extractPdfText } from "./lib/pdf";
import { getUsageEstimate } from "./lib/estimate";
import { DEFAULT_SUMMARY_MODE, getSummaryMode, type SummaryModeId } from "./lib/summaryModes";

type InputType = "text" | "url";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type SummaryType = "paragraph" | "bullets";

type SummarizeResponse = {
  summaryType?: SummaryType;
  summaryText?: string;
  summaryBullets?: string[];
  questions?: string[];
  contextText?: string;
  sourceLabel?: string;
  error?: string;
};

type ChatResponse = {
  answer?: string;
  error?: string;
};

export default function App() {
  const [inputType, setInputType] = useState<InputType>("url");
  const [summaryMode, setSummaryMode] = useState<SummaryModeId>(DEFAULT_SUMMARY_MODE);
  const [input, setInput] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceContext, setSourceContext] = useState("");
  const [summaryType, setSummaryType] = useState<SummaryType>("paragraph");
  const [summaryText, setSummaryText] = useState("");
  const [summaryBullets, setSummaryBullets] = useState<string[]>([]);
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  const currentMode = useMemo(() => getSummaryMode(summaryMode), [summaryMode]);
  const estimator = useMemo(() => getUsageEstimate(input, summaryMode), [input, summaryMode]);

  function clearResults() {
    setSourceLabel("");
    setSourceContext("");
    setSummaryText("");
    setSummaryBullets([]);
    setGeneratedQuestions([]);
    setMessages([]);
    setChatError("");
    setCopyMessage("");
  }

  async function handlePdfFileSelected(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }

    setIsPdfProcessing(true);
    setError("");
    setChatError("");
    setCopyMessage("");

    try {
      const extracted = await extractPdfText(file);

      if (!extracted.text) {
        setError("No readable text was found in that PDF.");
        return;
      }

      setInputType("text");
      setInput(extracted.text);
      setPdfFileName(file.name);
      clearResults();
    } catch (pdfError) {
      console.error(pdfError);
      setError("Failed to read that PDF. Please try another file.");
    } finally {
      setIsPdfProcessing(false);
    }
  }

  async function handleGenerateSummary() {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setError(inputType === "url" ? "Please enter a URL before generating a summary." : "Please paste some text before generating a summary.");
      clearResults();
      return;
    }

    setIsLoading(true);
    setError("");
    setChatError("");
    setCopyMessage("");

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputType,
          value: trimmedInput,
          summaryMode,
        }),
      });

      const data = (await response.json()) as SummarizeResponse;

      if (!response.ok) {
        setError(data.error || "Something went wrong while generating the summary. Please try again.");
        clearResults();
        return;
      }

      setSourceLabel(data.sourceLabel || "");
      setSourceContext(data.contextText || "");
      setSummaryType(data.summaryType || "paragraph");
      setSummaryText(data.summaryText || "");
      setSummaryBullets(Array.isArray(data.summaryBullets) ? data.summaryBullets : []);
      setGeneratedQuestions(Array.isArray(data.questions) ? data.questions : []);
      setMessages([]);
    } catch (apiError: unknown) {
      console.error(apiError);
      setError("Unable to reach the local summarizer service. Please restart the app and try again.");
      clearResults();
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAskQuestion() {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setChatError("Please type a question first.");
      return;
    }

    if (!sourceContext) {
      setChatError("Please generate a summary first so I have content context.");
      return;
    }

    setIsChatLoading(true);
    setChatError("");
    setCopyMessage("");

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmedQuestion }];
    setMessages(nextMessages);
    setQuestion("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceContext,
          summaryType,
          summaryText,
          summaryBullets,
          messages: nextMessages,
        }),
      });

      const data = (await response.json()) as ChatResponse;

      if (!response.ok) {
        setChatError(data.error || "Something went wrong while answering the question.");
        return;
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.answer || "No answer was returned." },
      ]);
    } catch (chatApiError: unknown) {
      console.error(chatApiError);
      setChatError("Unable to reach the local chat service. Please try again.");
    } finally {
      setIsChatLoading(false);
    }
  }

  async function handleCopySummary() {
    const content = buildPlainTextExport({
      title: sourceLabel || "AI Summarizer",
      summaryLabel: currentMode.label,
      summaryType,
      summaryText,
      summaryBullets,
      questions: generatedQuestions,
    });

    try {
      await copyToClipboard(content);
      setCopyMessage("Copied to clipboard.");
    } catch (copyError) {
      console.error(copyError);
      setCopyMessage("Copy failed. Please try again.");
    }
  }

  function handleExportMarkdown() {
    const content = buildMarkdownExport({
      title: sourceLabel || "AI Summarizer",
      summaryLabel: currentMode.label,
      summaryType,
      summaryText,
      summaryBullets,
      questions: generatedQuestions,
    });

    downloadTextFile("ai-summarizer-summary.md", content);
  }

  function handleExportText() {
    const content = buildPlainTextExport({
      title: sourceLabel || "AI Summarizer",
      summaryLabel: currentMode.label,
      summaryType,
      summaryText,
      summaryBullets,
      questions: generatedQuestions,
    });

    downloadTextFile("ai-summarizer-summary.txt", content);
  }

  const hasSummary = summaryType === "bullets" ? summaryBullets.length > 0 : Boolean(summaryText);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:py-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-slate-950/40 backdrop-blur md:p-8">
          <div className="mb-8 text-center">
            <p className="mb-3 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              AI Summarizer
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Summarize text or a webpage, ask questions, and export the result
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              Pick a mode, upload a PDF or paste content, then generate a summary and thoughtful follow-up questions.
            </p>
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1">
                Source: {inputType === "url" ? "URL" : "Text"}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1">
                Mode: {currentMode.label}
              </span>
              <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1">
                PDF: {pdfFileName ? pdfFileName : "none loaded"}
              </span>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Summary Mode</h2>
                  <p className="mt-2 text-sm text-slate-400">Easy to edit in `src/lib/summaryModes.ts`.</p>
                </div>
                <SelectedModeChip value={summaryMode} />
              </div>
              <SummaryModeSelector value={summaryMode} onChange={setSummaryMode} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex rounded-2xl border border-white/10 bg-slate-950/50 p-1">
                  <button
                    type="button"
                    onClick={() => setInputType("url")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      inputType === "url" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputType("text")}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      inputType === "text" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
                    }`}
                  >
                    Text
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  PDF upload fills the text area automatically.
                </p>
              </div>

              <label className="mb-3 block text-sm font-medium text-slate-200" htmlFor="source-input">
                {inputType === "url" ? "Page URL to summarize" : "Text to summarize"}
              </label>
              {inputType === "url" ? (
                <input
                  id="source-input"
                  type="url"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  placeholder="https://example.com/article"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              ) : (
                <textarea
                  id="source-input"
                  className="min-h-72 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  placeholder="Paste your text here..."
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                />
              )}

              <p className="mt-3 text-xs leading-5 text-slate-400">
                {inputType === "url"
                  ? "Only the page you enter will be fetched. Links on that page will not be followed."
                  : "The text you paste will be summarized directly."}
              </p>

              <div className="mt-4">
                <FileDropzone
                  onPdfFileSelected={handlePdfFileSelected}
                  isProcessing={isPdfProcessing}
                  fileName={pdfFileName}
                />
              </div>

              <p className="mt-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-100">
                This demo stops at about $7 monthly spend. 我是你们的朋友果子，微信我你们的反馈哦，好评我再追加额度。
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <EstimatorCard
                  inputTokens={estimator.inputTokens}
                  outputTokens={estimator.outputTokens}
                  estimatedCost={estimator.estimatedCost}
                />

                <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Actions</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
                      onClick={handleGenerateSummary}
                      disabled={isLoading || isPdfProcessing || !input.trim()}
                    >
                      {isLoading ? "Generating..." : "Generate Summary"}
                    </button>
                    {error ? <p className="text-sm text-rose-300">{error}</p> : null}
                    {copyMessage ? <p className="text-sm text-cyan-100">{copyMessage}</p> : null}
                  </div>
                </div>
              </div>
            </div>

            <SummaryCard
              modeLabel={currentMode.label}
              summaryType={summaryType}
              summaryText={summaryText}
              summaryBullets={summaryBullets}
              onCopy={handleCopySummary}
              onExportMarkdown={handleExportMarkdown}
              onExportText={handleExportText}
              canCopy={hasSummary}
            />

            <QuestionsCard questions={generatedQuestions} />

            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
                Ask a follow-up question
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Ask anything about the current content or summary.
              </p>

              <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-slate-500">Your conversation will appear here.</p>
                ) : (
                  messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-auto bg-cyan-400 text-slate-950"
                          : "bg-slate-800 text-slate-100"
                      }`}
                    >
                      {message.content}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                  placeholder="Ask a question about the content..."
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAskQuestion();
                    }
                  }}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-white/50"
                  onClick={handleAskQuestion}
                  disabled={isChatLoading || !hasSummary}
                >
                  {isChatLoading ? "Thinking..." : "Ask"}
                </button>
              </div>

              {chatError ? <p className="mt-3 text-sm text-rose-300">{chatError}</p> : null}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
