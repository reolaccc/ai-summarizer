import "dotenv/config";
import * as cheerio from "cheerio";
import express from "express";
import OpenAI from "openai";
import { readFile, writeFile } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const port = Number(process.env.PORT || 10000);
const ledgerPath = path.resolve(__dirname, "spend-ledger.json");
const SPEND_LIMIT_USD = 7;
const MODEL_PRICING = {
  inputPerMillion: 0.75,
  outputPerMillion: 4.5,
};
const SUMMARY_MODE_PROMPTS = {
  standard: {
    label: "Standard Summary",
    summaryType: "bullets",
    instructions:
      "Write as many concise bullet points as needed to cover the content thoroughly. For short inputs, use only a few bullets. For longer inputs, include more bullets so the summary feels complete rather than artificially limited. Keep the wording clean and direct.",
  },
  key_insights: {
    label: "Key Insights",
    summaryType: "insights",
    instructions:
      "Write 3 to 5 deeper insights focused on implications, patterns, tradeoffs, assumptions, or second-order effects. Do not paraphrase the source. For each insight, include exactly one reflection question that helps the user think deeper.",
  },
  eli10: {
    label: "Explain Like I'm 10",
    summaryType: "paragraph",
    instructions:
      "Explain the content in very simple language, as if speaking to a curious 10-year-old. Do not just simplify the wording; make the idea concrete and easy to picture. Use plain words, a warm friendly tone, and include at least one everyday example or simple analogy. Aim for 2 short paragraphs so the explanation feels helpful, clear, and not too brief.",
  },
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

function extractReadableText(html) {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe, footer, nav, aside").remove();

  const compact = (value) => value.replace(/\s+/g, " ").trim();
  const firstMeta = (...selectors) =>
    selectors
      .map((selector) => $(selector).first().attr("content")?.trim())
      .find((value) => Boolean(value));
  const gatherText = (selector) =>
    $(selector)
      .toArray()
      .map((element) => compact($(element).text()))
      .filter(Boolean);

  const title =
    compact($("title").first().text()) ||
    compact(firstMeta('meta[property="og:title"]', 'meta[name="twitter:title"]', 'meta[name="title"]') || "") ||
    compact($("h1").first().text()) ||
    "Untitled page";

  const article = $("article").first();
  const main = $("main").first();
  const contentRoot = article.length > 0 ? article : main.length > 0 ? main : $("body");
  const primaryText = compact(contentRoot.text());
  const secondaryText = [
    ...gatherText("h1, h2, h3, h4"),
    ...gatherText("p"),
    ...gatherText("li"),
    ...gatherText("blockquote"),
    ...gatherText("figcaption"),
  ].join(" ").trim();
  const metaText = compact(
    firstMeta(
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ) || "",
  );
  const text = [primaryText, secondaryText, metaText].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return { title, text };
}

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readLedger() {
  try {
    const raw = await readFile(ledgerPath, "utf8");
    const data = JSON.parse(raw);

    if (data && typeof data === "object") {
      return {
        monthKey: typeof data.monthKey === "string" ? data.monthKey : getMonthKey(),
        spentUsd: typeof data.spentUsd === "number" ? data.spentUsd : 0,
      };
    }
  } catch {
    // Ignore missing or malformed ledger files and start fresh.
  }

  return {
    monthKey: getMonthKey(),
    spentUsd: 0,
  };
}

async function writeLedger(ledger) {
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), "utf8");
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostUsd(inputTokens, outputTokens) {
  return (
    (inputTokens * MODEL_PRICING.inputPerMillion) / 1_000_000 +
    (outputTokens * MODEL_PRICING.outputPerMillion) / 1_000_000
  );
}

function extractUsageTokens(usage) {
  if (!usage || typeof usage !== "object") {
    return { inputTokens: 0, outputTokens: 0 };
  }

  const inputTokens =
    typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : 0;

  const outputTokens =
    typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : 0;

  return { inputTokens, outputTokens };
}

function getSummaryModeConfig(mode) {
  return SUMMARY_MODE_PROMPTS[mode] ?? SUMMARY_MODE_PROMPTS.standard;
}

function parseStructuredResponse(outputText) {
  const cleaned = outputText.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The model did not return valid JSON.");
  }

  const payload = JSON.parse(cleaned.slice(start, end + 1));
  const summaryType = payload.summaryType === "insights"
    ? "insights"
    : payload.summaryType === "paragraph"
      ? "paragraph"
      : "bullets";
  const summaryText = typeof payload.summaryText === "string" ? payload.summaryText.trim() : "";
  const summaryBullets = Array.isArray(payload.summaryBullets)
    ? payload.summaryBullets.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const insightPairs = Array.isArray(payload.insightPairs)
    ? payload.insightPairs
        .map((item) => ({
          insight: typeof item?.insight === "string" ? item.insight.trim() : "",
          question: typeof item?.question === "string" ? item.question.trim() : "",
        }))
        .filter((item) => item.insight)
    : [];
  const questions = Array.isArray(payload.questions)
    ? payload.questions.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
    : [];

  return {
    summaryType,
    summaryText,
    summaryBullets,
    insightPairs,
    questions,
  };
}

app.post("/api/summarize", async (req, res) => {
  const summaryMode = typeof req.body?.summaryMode === "string" ? req.body.summaryMode : "standard";
  const value = typeof req.body?.value === "string" ? req.body.value.trim() : "";
  const modeConfig = getSummaryModeConfig(summaryMode);

  if (!value) {
    return res.status(400).json({
      error: "Please paste text, enter a URL, or upload a PDF before generating a summary.",
    });
  }

  if (!client) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY in the .env file. Please add it and restart the app.",
    });
  }

  try {
    const ledger = await readLedger();
    const currentMonth = getMonthKey();
    const normalizedLedger =
      ledger.monthKey === currentMonth ? ledger : { monthKey: currentMonth, spentUsd: 0 };

    let contextText = value;
    let sourceLabel = "Pasted text";

    const looksLikeUrl = /^https?:\/\/\S+/i.test(value);

    if (looksLikeUrl) {
      let targetUrl;

      try {
        targetUrl = new URL(value);
      } catch {
        return res.status(400).json({
          error: "Please enter a valid http:// or https:// URL.",
        });
      }

      if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
        return res.status(400).json({
          error: "Please enter a valid http:// or https:// URL.",
        });
      }

      const pageResponse = await fetch(targetUrl.toString(), {
        redirect: "follow",
        headers: {
          "user-agent": "AI Summarizer/1.0",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (!pageResponse.ok) {
        return res.status(502).json({
          error: `Failed to fetch the page. HTTP ${pageResponse.status}.`,
        });
      }

      const html = await pageResponse.text();
      const { title, text } = extractReadableText(html);
      const trimmedText = text.slice(0, 12000);

      if (!trimmedText) {
        return res.status(400).json({
          error:
            "No readable text was found on that page. The site may be JavaScript-rendered, image-based, or blocked for server-side fetches.",
        });
      }

      contextText = trimmedText;
      sourceLabel = title;
    }

    const estimatedInputTokens = estimateTokens(
      `Source: ${sourceLabel}\n\nContent:\n${contextText}`,
    );
    const estimatedRequestCost = estimateCostUsd(estimatedInputTokens, 300);

    if (normalizedLedger.spentUsd + estimatedRequestCost >= SPEND_LIMIT_USD) {
      return res.status(402).json({
        error: `Spend guard active: this demo has reached its monthly safety limit of about $${SPEND_LIMIT_USD}.`,
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      instructions: [
        "You are a helpful summarizer.",
        `Mode: ${modeConfig.label}.`,
        modeConfig.instructions,
        "Return valid JSON only, with this exact shape:",
        '{ "summaryType": "bullets" | "paragraph" | "insights", "summaryText": "string", "summaryBullets": ["string"], "insightPairs": [{"insight":"string","question":"string"}], "questions": ["string", "string", "string"] }',
        "If summaryType is bullets, put the main summary in summaryBullets and keep summaryText empty.",
        "If summaryType is paragraph, put the main summary in summaryText and keep summaryBullets empty.",
        "If summaryType is insights, fill insightPairs with 3 to 5 items and keep the other summary fields empty.",
        "The questions field should contain 3 thoughtful follow-up questions unless the mode is insights, in which case the insightPairs already include reflection questions.",
        "Do not include markdown fences, commentary, or any text outside JSON.",
      ].join("\n"),
      input: `Source: ${sourceLabel}\n\nContent:\n${contextText}`,
    });

    const parsed = parseStructuredResponse(response.output_text);
    const { inputTokens, outputTokens } = extractUsageTokens(response.usage);
    const actualCost =
      inputTokens > 0 || outputTokens > 0
        ? estimateCostUsd(inputTokens, outputTokens)
        : estimatedRequestCost;
    const updatedLedger = {
      monthKey: currentMonth,
      spentUsd: Number((normalizedLedger.spentUsd + actualCost).toFixed(6)),
    };

    await writeLedger(updatedLedger);

    return res.json({
      summaryType: parsed.summaryType,
      summaryText: parsed.summaryText,
      summaryBullets:
        parsed.summaryBullets.length > 0
          ? parsed.summaryBullets
          : parsed.summaryType === "bullets"
            ? [response.output_text.trim() || "No summary was returned."]
            : [],
      insightPairs: parsed.insightPairs,
      questions:
        parsed.questions.length > 0
          ? parsed.questions.slice(0, 3)
          : [
              "What is the strongest assumption behind the main idea?",
              "What details would change the conclusion most?",
              "How might this affect the future if the trend continues?",
            ],
      contextText,
      sourceLabel,
      spend: {
        monthKey: updatedLedger.monthKey,
        spentUsd: updatedLedger.spentUsd,
        limitUsd: SPEND_LIMIT_USD,
      },
    });
  } catch (error) {
    console.error("OpenAI request failed:", error);

    const message =
      error instanceof Error ? error.message : "Unknown server error while calling OpenAI.";

    if (message.includes("401")) {
      return res.status(401).json({
        error: "OpenAI API key invalid, expired, or not authorized for this project.",
      });
    }

    if (message.includes("403")) {
      return res.status(403).json({
        error: "This API key does not have permission to use the requested model.",
      });
    }

    if (message.includes("429")) {
      return res.status(429).json({
        error: "OpenAI API rate limit or billing limit reached. Please check your API usage and billing.",
      });
    }

    return res.status(500).json({
      error: `OpenAI API error: ${message}`,
    });
  }
});

app.post("/api/chat", async (req, res) => {
  const sourceContext = typeof req.body?.sourceContext === "string" ? req.body.sourceContext.trim() : "";
  const summaryType =
    req.body?.summaryType === "insights"
      ? "insights"
      : req.body?.summaryType === "paragraph"
        ? "paragraph"
        : "bullets";
  const summaryText = typeof req.body?.summaryText === "string" ? req.body.summaryText.trim() : "";
  const summaryBullets = Array.isArray(req.body?.summaryBullets) ? req.body.summaryBullets : [];
  const insightPairs = Array.isArray(req.body?.insightPairs) ? req.body.insightPairs : [];
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  if (!sourceContext) {
    return res.status(400).json({
      error: "Please generate a summary first so I have page context.",
    });
  }

  if (!client) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY in the .env file. Please add it and restart the app.",
    });
  }

  const conversation = messages
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));

  const question = conversation.length > 0 ? conversation[conversation.length - 1].content : "";

  if (!question) {
    return res.status(400).json({
      error: "Please type a question first.",
    });
  }

  try {
    const ledger = await readLedger();
    const currentMonth = getMonthKey();
    const normalizedLedger =
      ledger.monthKey === currentMonth ? ledger : { monthKey: currentMonth, spentUsd: 0 };

    const conversationText = conversation
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");

    const estimatedInputTokens = estimateTokens(
      `Source content:\n${sourceContext}\n\nSummary type: ${summaryType}\n\nSummary:\n${
        summaryType === "bullets"
          ? summaryBullets.map((bullet) => `- ${bullet}`).join("\n")
          : summaryType === "insights"
            ? insightPairs
                .map((pair) => `Insight: ${pair?.insight || ""}\nQuestion: ${pair?.question || ""}`)
                .join("\n\n")
            : summaryText
      }\n\nConversation:\n${conversationText}\n\nAnswer the user's last question.`,
    );
    const estimatedRequestCost = estimateCostUsd(estimatedInputTokens, 200);

    if (normalizedLedger.spentUsd + estimatedRequestCost >= SPEND_LIMIT_USD) {
      return res.status(402).json({
        error: `Spend guard active: this demo has reached its monthly safety limit of about $${SPEND_LIMIT_USD}.`,
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        "You answer questions about the provided source content. Keep the answer short, useful, and in bullet points. If the question is not answerable from the content, say so briefly.",
      input: `Source content:\n${sourceContext}\n\nSummary type: ${summaryType}\n\nSummary:\n${
        summaryType === "bullets"
          ? summaryBullets.map((bullet) => `- ${bullet}`).join("\n")
          : summaryType === "insights"
            ? insightPairs
                .map((pair) => `Insight: ${pair?.insight || ""}\nQuestion: ${pair?.question || ""}`)
                .join("\n\n")
            : summaryText
      }\n\nConversation:\n${conversationText}\n\nAnswer the user's last question.`,
    });

    const answerBullets = splitBullets(response.output_text.trim());
    const { inputTokens, outputTokens } = extractUsageTokens(response.usage);
    const actualCost =
      inputTokens > 0 || outputTokens > 0
        ? estimateCostUsd(inputTokens, outputTokens)
        : estimatedRequestCost;
    const updatedLedger = {
      monthKey: currentMonth,
      spentUsd: Number((normalizedLedger.spentUsd + actualCost).toFixed(6)),
    };

    await writeLedger(updatedLedger);

    return res.json({
      answer: answerBullets.length > 0 ? answerBullets.join("\n") : response.output_text.trim(),
      spend: {
        monthKey: updatedLedger.monthKey,
        spentUsd: updatedLedger.spentUsd,
        limitUsd: SPEND_LIMIT_USD,
      },
    });
  } catch (error) {
    console.error("OpenAI chat request failed:", error);

    const message =
      error instanceof Error ? error.message : "Unknown server error while calling OpenAI.";

    return res.status(500).json({
      error: `OpenAI API error: ${message}`,
    });
  }
});

if (isProduction) {
  app.use(express.static(path.resolve(__dirname, "dist")));

  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(__dirname, "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);
}

app.listen(port, "0.0.0.0", () => {
  console.log(`AI Summarizer running at http://localhost:${port}`);
});
