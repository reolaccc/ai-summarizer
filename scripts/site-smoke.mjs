import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT || 10001);
const baseUrl = `http://127.0.0.1:${port}`;

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the app server to start."));
    }, 60_000);

    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes(`AI Summarizer running at http://localhost:${port}`)) {
        cleanup();
        resolve();
      }
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`App server exited before it became ready (code=${code}, signal=${signal ?? "none"}).`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", onError);
    child.on("exit", onExit);
  });
}

async function run() {
  const child = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      OPENAI_MOCK_RESPONSES: "true",
      OPENAI_API_KEY: "test-mock-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForReady(child);

    const summarizeResponse = await fetch(`${baseUrl}/api/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value: "https://www.spacex.com/launches/starship-flight-12",
        summaryMode: "standard",
      }),
    });

    assert.equal(summarizeResponse.ok, true, "summarize endpoint should succeed");

    const summary = await summarizeResponse.json();
    assert.equal(summary.summaryType, "paragraph", "standard summary should return paragraphs");
    assert.equal(typeof summary.summaryText, "string", "standard summary should return summary text");
    assert.ok(summary.summaryText.length >= 200, "summary should be detailed");
    assert.ok(summary.summaryBullets.length === 0, "standard summary should not use the bullet tree payload");

    const summaryText = summary.summaryText;
    assert.match(summaryText, /Flight 12|Twelfth Flight Test|Starship/i, "summary should mention Flight 12");
    assert.ok(summaryText.split(/\n\s*\n+/).length >= 2, "summary should contain multiple paragraph blocks");
    assert.match(summaryText, /(^|\n)-\s+/m, "standard summary should include supporting bullets for rich sources");

    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceContext: summary.contextText,
        summaryType: summary.summaryType,
        summaryText: summary.summaryText,
        summaryBullets: summary.summaryBullets,
        insightPairs: summary.insightPairs,
        messages: [{ role: "user", content: "launch time to Melbourne time" }],
      }),
    });

    assert.equal(chatResponse.ok, true, "chat endpoint should succeed");

    const chat = await chatResponse.json();
    assert.ok(typeof chat.answer === "string" && chat.answer.length > 0, "chat should return an answer");
    assert.match(chat.answer, /Melbourne|AEST|8:30|Friday, May 22/i, "chat should convert the launch time intelligently");

    console.log("Smoke test passed.");
  } finally {
    child.kill("SIGTERM");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
