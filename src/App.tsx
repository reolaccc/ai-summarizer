import { useState } from "react";

type InputMode = "text" | "url";
type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function App() {
  const [mode, setMode] = useState<InputMode>("url");
  const [input, setInput] = useState("");
  const [summaryBullets, setSummaryBullets] = useState<string[]>([]);
  const [sourceContext, setSourceContext] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [chatError, setChatError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);

  async function handleGenerateSummary() {
    const trimmedInput = input.trim();

    if (!trimmedInput) {
      setError(mode === "url" ? "Please enter a URL before generating a summary." : "Please paste some text before generating a summary.");
      setSummaryBullets([]);
      setSourceContext("");
      setMessages([]);
      return;
    }

    setIsLoading(true);
    setError("");
    setChatError("");

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          value: trimmedInput,
        }),
      });

      const data = (await response.json()) as {
        bullets?: string[];
        contextText?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "Something went wrong while generating the summary. Please try again.");
        setSummaryBullets([]);
        setSourceContext("");
        setMessages([]);
        return;
      }

      setSummaryBullets(Array.isArray(data.bullets) ? data.bullets : []);
      setSourceContext(data.contextText || "");
      setMessages([]);
    } catch (apiError: unknown) {
      console.error(apiError);
      setError("Unable to reach the local summarizer service. Please restart the app and try again.");
      setSummaryBullets([]);
      setSourceContext("");
      setMessages([]);
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
      setChatError("Please generate a summary first so I have page context.");
      return;
    }

    setIsChatLoading(true);
    setChatError("");

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
          mode,
          sourceContext,
          summaryBullets,
          messages: nextMessages,
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
      };

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

  const hasSummary = summaryBullets.length > 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur md:p-8">
          <div className="mb-8 text-center">
            <p className="mb-3 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
              AI Summarizer
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Turn any webpage or text into a quick, clear summary
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              Switch between text and URL, generate a bullet summary, then ask follow-up questions in the chat box below.
            </p>
          </div>

          <div className="mb-4 inline-flex rounded-2xl border border-white/10 bg-slate-900/70 p-1">
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                mode === "url" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              URL
            </button>
            <button
              type="button"
              onClick={() => setMode("text")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                mode === "text" ? "bg-cyan-400 text-slate-950" : "text-slate-300 hover:text-white"
              }`}
            >
              Text
            </button>
          </div>

          <label className="mb-3 block text-sm font-medium text-slate-200" htmlFor="source-input">
            {mode === "url" ? "Page URL to summarize" : "Text to summarize"}
          </label>
          {mode === "url" ? (
            <input
              id="source-input"
              type="url"
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              placeholder="https://example.com/article"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          ) : (
            <textarea
              id="source-input"
              className="min-h-72 w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
              placeholder="Paste your text here..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          )}

          <p className="mt-3 text-xs leading-5 text-slate-400">
            {mode === "url"
              ? "Only the page you enter will be fetched. Links on that page will not be followed."
              : "The text you paste will be summarized directly."}
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
              onClick={handleGenerateSummary}
              disabled={isLoading}
            >
              {isLoading ? "Generating..." : "Generate Summary"}
            </button>
            {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Summary</h2>
            {hasSummary ? (
              <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-slate-100 md:text-base">
                {summaryBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-7 text-slate-100 md:text-base">
                Your generated summary will appear here.
              </p>
            )}
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/70 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">
              Ask a follow-up question
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Ask anything about the current page or text.
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
                className="flex-1 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30"
                placeholder="Ask a question about the page..."
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
          </div>
        </section>
      </div>
    </main>
  );
}
