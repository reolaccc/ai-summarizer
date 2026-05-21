import "dotenv/config";
import * as cheerio from "cheerio";
import express from "express";
import OpenAI from "openai";
import { readFile, writeFile } from "node:fs/promises";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_INPUT_CHARACTERS, MAX_INPUT_TOKENS } from "./src/lib/limits.js";

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
    summaryType: "paragraph",
    instructions:
      "Create a paragraph-first summary that adapts to the source instead of forcing a list. Write 2 to 5 clear paragraphs, depending on how much material matters. Each paragraph should cover one meaningful idea or theme and should read like natural prose, not note fragments. If a paragraph genuinely needs supporting details, examples, consequences, or caveats, you may add a short bullet block directly after that paragraph using plain '- ' bullets. Do not turn the whole response into bullets. If the source is simple, use paragraphs only. Keep important names, events, missions, and products exact instead of replacing them with generic descriptions. The goal is a readable summary with optional local structure inside a paragraph section, not a flat bullet list and not a vague paraphrase.",
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
      "Explain the content in very simple language, as if speaking to a curious 10-year-old. Do not just simplify the wording; make the idea concrete, friendly, and easy to picture. Use exactly 3 short paragraphs and separate them with a blank line. Paragraph 1 should explain what it is. Paragraph 2 should give one concrete everyday example or analogy. Paragraph 3 should explain why it matters. Keep the tone warm, encouraging, and a little conversational. Avoid jargon. If you mention a technical term, explain it right away in simple words.",
  },
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;
const useMockResponses =
  process.env.OPENAI_MOCK_RESPONSES === "true" ||
  process.env.NODE_ENV === "test" ||
  Boolean(apiKey && /^test(-mock)?/i.test(apiKey));

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

function getSpaceXMissionSlug(targetUrl) {
  if (targetUrl.hostname !== "www.spacex.com" && targetUrl.hostname !== "spacex.com") {
    return null;
  }

  const match = targetUrl.pathname.match(/^\/launches\/([^/?#]+)/i);
  if (!match) {
    return null;
  }

  return match[1];
}

function extractSpaceXMissionText(mission) {
  const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const textFromHtml = (value) => {
    const fragment = cheerio.load(`<div>${String(value ?? "")}</div>`);
    return fragment("div").text().replace(/\s+/g, " ").trim();
  };
  const lines = [];

  if (mission?.title) {
    lines.push(`Mission title: ${compact(mission.title)}`);
  }

  if (mission?.missionId) {
    lines.push(`Mission id: ${compact(mission.missionId)}`);
  }

  if (mission?.callToAction) {
    lines.push(`Call to action: ${compact(mission.callToAction)}`);
  }

  const paragraphs = Array.isArray(mission?.paragraphs)
    ? mission.paragraphs.map((item) => textFromHtml(item?.content)).filter(Boolean)
    : [];

  if (paragraphs.length > 0) {
    lines.push("");
    lines.push("Overview:");
    paragraphs.forEach((paragraph) => lines.push(`- ${paragraph}`));
  }

  const formatTimeline = (label, timeline) => {
    const entries = Array.isArray(timeline?.timelineEntries)
      ? timeline.timelineEntries
          .map((entry) => {
            const time = compact(entry?.time);
            const description = compact(entry?.description);
            return time && description ? `${time} ${description}` : description || time;
          })
          .filter(Boolean)
      : [];

    if (entries.length === 0) {
      return;
    }

    lines.push("");
    lines.push(`${label}:`);
    entries.forEach((entry) => lines.push(`- ${entry}`));
  };

  formatTimeline("Pre-launch timeline", mission?.preLaunchTimeline);
  formatTimeline("Post-launch timeline", mission?.postLaunchTimeline);

  if (Array.isArray(mission?.webcasts) && mission.webcasts.length > 0) {
    const webcastTitles = mission.webcasts
      .map((item) => compact(item?.title || item?.videoId || item?.streamingVideoType))
      .filter(Boolean);

    if (webcastTitles.length > 0) {
      lines.push("");
      lines.push("Webcasts:");
      webcastTitles.forEach((item) => lines.push(`- ${item}`));
    }
  }

  return {
    title: compact(mission?.title) || "SpaceX mission",
    text: lines.join("\n").trim(),
  };
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

function normalizeBulletNodes(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (typeof item === "string") {
        return { text: item.trim(), level: 0 };
      }

      const text = typeof item?.text === "string" ? item.text.trim() : "";
      const rawLevel = typeof item?.level === "number" ? item.level : 0;
      const level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(3, Math.floor(rawLevel))) : 0;

      return { text, level };
    })
    .filter((item) => item.text);
}

function formatBulletNodes(items) {
  return normalizeBulletNodes(items)
    .map((item) => `${"  ".repeat(item.level)}- ${item.text}`)
    .join("\n");
}

function splitBullets(text) {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function splitParagraphs(text) {
  return String(text ?? "")
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function countWords(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
}

function countBulletLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line)).length;
}

function hasParagraphContent(text) {
  return String(text ?? "")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .some((block) => block && !block.split("\n").every((line) => /^[-*•]\s+/.test(line.trim())));
}

function splitSentences(text) {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return [];
  }

  const matches = cleaned.match(/[^.!?。！？]+[.!?。！？]*/g);

  return (matches ?? [cleaned]).map((sentence) => sentence.trim()).filter(Boolean);
}

function splitWordsIntoThree(text) {
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.ceil(words.length / 3));
  const first = words.slice(0, chunkSize).join(" ");
  const second = words.slice(chunkSize, chunkSize * 2).join(" ");
  const third = words.slice(chunkSize * 2).join(" ");

  return [first, second, third].filter(Boolean);
}

function normalizeEli10Paragraphs(text) {
  const paragraphBlocks = splitParagraphs(text);

  if (paragraphBlocks.length >= 3) {
    return paragraphBlocks.slice(0, 3).join("\n\n");
  }

  const sentenceBlocks = splitSentences(paragraphBlocks.join(" "));

  if (sentenceBlocks.length >= 3) {
    const base = Math.floor(sentenceBlocks.length / 3);
    const remainder = sentenceBlocks.length % 3;
    let cursor = 0;

    const chunks = Array.from({ length: 3 }, (_value, index) => {
      const take = base + (index < remainder ? 1 : 0);
      const chunk = sentenceBlocks.slice(cursor, cursor + take);
      cursor += take;
      return chunk.join(" ").trim();
    }).filter(Boolean);

    if (chunks.length === 3) {
      return chunks.join("\n\n");
    }
  }

  const wordChunks = splitWordsIntoThree(sentenceBlocks.join(" "));

  if (wordChunks.length === 3) {
    return wordChunks.join("\n\n");
  }

  return paragraphBlocks.join("\n\n") || sentenceBlocks.join(" ");
}

function cleanAssistantText(text) {
  return String(text ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function buildMockUsage(inputText, outputText) {
  return {
    input_tokens: estimateTokens(inputText),
    output_tokens: estimateTokens(outputText),
  };
}

function createMockSummaryResponse({ summaryMode, contextText, sourceLabel }) {
  const sourcePreview = contextText.slice(0, 800);
  const lowerSource = `${sourceLabel}\n${sourcePreview}`.toLowerCase();

  let payload;

  if (summaryMode === "key_insights") {
    payload = {
      summaryType: "insights",
      summaryText: "",
      summaryBullets: [],
      insightPairs: [
        {
          insight: "The page is focused on a specific mission rather than general SpaceX branding.",
          question: "Why does that specificity matter for what readers expect next?",
        },
        {
          insight: "The content combines launch timing, objectives, and timeline milestones.",
          question: "How does that structure help readers understand the mission more clearly?",
        },
        {
          insight: "The mission is being presented as both a technical test and a public event.",
          question: "What does that dual purpose suggest about SpaceX's communication strategy?",
        },
      ],
      questions: [
        "What part of the mission seems most risky or ambitious?",
        "Which timeline detail matters most for planning around the launch?",
        "How does this mission differ from a routine launch announcement?",
      ],
    };
  } else if (summaryMode === "eli10") {
    payload = {
      summaryType: "paragraph",
      summaryText:
        [
          "Think of this page like a friendly school announcement for a very big science experiment.",
          "It tells people when the test starts, what the team wants to learn, and which parts they will watch carefully.",
          "For Starship Flight 12, SpaceX is trying a new rocket system and checking whether the pieces work together safely, a bit like making sure every part of a giant toy set fits before you play with it.",
        ].join("\n\n"),
      summaryBullets: [],
      insightPairs: [],
      questions: [
        "What is the most important thing this mission is trying to prove?",
        "Why would engineers test the rocket in so many steps?",
        "What makes this launch different from a normal rocket ride?",
      ],
    };
  } else if (
    lowerSource.includes("starship") &&
    (lowerSource.includes("flight 12") || lowerSource.includes("twelfth flight test"))
  ) {
    payload = {
      summaryType: "paragraph",
      summaryText: [
        "Starship Flight 12 is being presented as a full-system test of the redesigned vehicle rather than a simple launch demonstration. The main goal is to see whether the rocket can move through the major phases of flight cleanly enough to build confidence in the overall system.",
        "- The launch window opens Thursday, May 21 at 5:30 p.m. CT.",
        "- The webcast begins about 45 minutes earlier.",
        "- A successful sequence would strengthen confidence in launch, separation, and landing behavior.",
        "",
        "The booster portion of the mission is important because SpaceX is testing demanding flight behavior without also attempting a launch-site catch. That keeps the mission focused on proving core booster performance before adding another layer of difficulty.",
        "- The booster is expected to complete ascent, stage separation, boostback burn, and landing burn.",
        "- Skipping the catch reduces complexity while still generating critical flight data.",
        "",
        "The upper stage is also doing work that matters beyond this single launch, including payload and reentry-related tests tied to future reuse. That makes the mission useful not only as a pass-or-fail event, but as a way to gather data that supports later Starship operations.",
        "- The plan includes deploying 20 Starlink simulators and two modified satellites.",
        "- SpaceX also wants to attempt a Raptor relight and collect reentry data.",
      ].join("\n"),
      summaryBullets: [],
      insightPairs: [],
      questions: [
        "Which part of the mission is the biggest technical leap?",
        "Why would the team avoid a launch-site catch on this flight?",
        "How do the payload tests help future Starship missions?",
      ],
    };
  } else {
    payload = {
      summaryType: "paragraph",
      summaryText: [
        "A strong standard summary should lead with clear paragraphs that explain the main ideas in plain language instead of instantly collapsing everything into bullets. That gives the reader an actual narrative of what matters and how the ideas connect.",
        "",
        "When a section carries extra detail, a short supporting bullet list can help without taking over the whole response. Used carefully, those bullets add evidence, examples, or consequences under the paragraph they belong to rather than replacing the paragraph itself.",
        "",
        "The result should feel readable first and structured second. In practice, that means the summary stays easy to scan while still preserving the most useful detail from the source.",
      ].join("\n"),
      summaryBullets: [],
      insightPairs: [],
      questions: [
        "What is the central takeaway here?",
        "Which detail is most likely to matter later?",
        "What would change the interpretation most?",
      ],
    };
  }

  const output_text = JSON.stringify(payload);

  return {
    output_text,
    usage: buildMockUsage(`Source: ${sourceLabel}\n${contextText}`, output_text),
  };
}

function createMockChatResponse({ sourceContext, question }) {
  const lowerQuestion = question.toLowerCase();
  const lowerSource = sourceContext.toLowerCase();

  let answer = "";

  if (lowerQuestion.includes("melbourne") && lowerQuestion.includes("time") && lowerSource.includes("5:30 p.m. ct")) {
    answer =
      "The launch window opens Friday, May 22 at 8:30 a.m. Melbourne time (AEST). That is 15 hours ahead of Central Time in May, so the Thursday evening CT window becomes Friday morning in Melbourne.";
  } else if (lowerQuestion.includes("launch time") && lowerSource.includes("5:30 p.m. ct")) {
    answer =
      "The launch window is Thursday, May 21 at 5:30 p.m. CT. If you want, I can also convert it to another timezone.";
  } else {
    answer =
      "Based on the source, the best answer is the one most directly supported by the mission details. If you want a conversion or a comparison, I can help work it out from the launch information.";
  }

  return {
    output_text: answer,
    usage: buildMockUsage(`${sourceContext}\n${question}`, answer),
  };
}

function getBulletStats(items) {
  const normalized = normalizeBulletNodes(items);

  return {
    totalCount: normalized.length,
    topLevelCount: normalized.filter((item) => item.level === 0).length,
  };
}

function isTooThinStandardSummary(summary) {
  if (summary?.summaryType !== "paragraph") {
    return true;
  }

  const paragraphCount = splitParagraphs(summary.summaryText).length;
  const wordCount = countWords(summary.summaryText);
  const bulletLineCount = countBulletLines(summary.summaryText);

  return !hasParagraphContent(summary.summaryText) || paragraphCount < 2 || wordCount < 90 || bulletLineCount > 8;
}

function buildInputLimitMessage() {
  return `This demo only supports inputs up to ${MAX_INPUT_CHARACTERS.toLocaleString()} characters (about ${MAX_INPUT_TOKENS.toLocaleString()} tokens). Please paste a shorter excerpt, upload a smaller PDF, or split the document into sections.`;
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
    ? normalizeBulletNodes(payload.summaryBullets)
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

      const missionSlug = getSpaceXMissionSlug(targetUrl);

      if (missionSlug) {
        const missionResponse = await fetch(
          `https://content.spacex.com/api/spacex-website/missions/${missionSlug}`,
          {
            headers: {
              accept: "application/json",
              "user-agent": "AI Summarizer/1.0",
            },
          },
        );

        if (missionResponse.ok) {
          const mission = await missionResponse.json();
          const { title, text } = extractSpaceXMissionText(mission);
          const trimmedText = text.slice(0, 12000);

          if (trimmedText) {
            contextText = trimmedText;
            sourceLabel = title;
          }
        }
      }

      if (sourceLabel === "Pasted text") {
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
    }

    const estimatedInputTokens = estimateTokens(
      `Source: ${sourceLabel}\n\nContent:\n${contextText}`,
    );

    if (contextText.length > MAX_INPUT_CHARACTERS || estimatedInputTokens > MAX_INPUT_TOKENS) {
      return res.status(413).json({
        error: buildInputLimitMessage(),
      });
    }

    const estimatedRequestCost = estimateCostUsd(estimatedInputTokens, 300);

    if (normalizedLedger.spentUsd + estimatedRequestCost >= SPEND_LIMIT_USD) {
      return res.status(402).json({
        error: `Spend guard active: this demo has reached its monthly safety limit of about $${SPEND_LIMIT_USD}.`,
      });
    }

    const response = useMockResponses
      ? createMockSummaryResponse({ summaryMode, contextText, sourceLabel })
      : await client.responses.create({
          model: "gpt-5.4-mini",
          instructions: [
            "You are a helpful summarizer.",
            `Mode: ${modeConfig.label}.`,
            modeConfig.instructions,
            "Return valid JSON only, with this exact shape:",
            '{ "summaryType": "bullets" | "paragraph" | "insights", "summaryText": "string", "summaryBullets": [{"text":"string","level":0}], "insightPairs": [{"insight":"string","question":"string"}], "questions": ["string", "string", "string"] }',
            "If summaryType is bullets, put the main summary in summaryBullets and keep summaryText empty.",
            "If summaryType is paragraph, put the main summary in summaryText and keep summaryBullets empty.",
            "If summaryType is insights, fill insightPairs with 3 to 5 items and keep the other summary fields empty.",
            "The questions field should contain 3 thoughtful follow-up questions unless the mode is insights, in which case the insightPairs already include reflection questions.",
            "Do not include markdown fences, commentary, or any text outside JSON.",
          ].join("\n"),
          input: `Source: ${sourceLabel}\n\nContent:\n${contextText}`,
        });

    let parsed = parseStructuredResponse(response.output_text);

    let extraCost = 0;

    if (summaryMode === "eli10") {
      const eli10ParagraphCount = splitParagraphs(parsed.summaryText).length;

      if (!useMockResponses && eli10ParagraphCount < 3) {
        const rewriteResponse = await client.responses.create({
          model: "gpt-5.4-mini",
          instructions: [
            "You are rewriting an ELI10 explanation so it becomes exactly 3 short paragraphs.",
            "Paragraph 1 should explain what it is.",
            "Paragraph 2 should give one concrete everyday example or analogy.",
            "Paragraph 3 should explain why it matters.",
            "Use a warm, natural, child-friendly tone.",
            "Do not add bullets, headings, markdown fences, or extra commentary.",
            "Return valid JSON only with the same shape as before.",
            '{ "summaryType": "bullets" | "paragraph" | "insights", "summaryText": "string", "summaryBullets": [{"text":"string","level":0}], "insightPairs": [{"insight":"string","question":"string"}], "questions": ["string", "string", "string"] }',
            "Keep summaryType as paragraph and keep summaryBullets empty.",
          ].join("\n"),
          input: [
            `Source: ${sourceLabel}`,
            "",
            `Content:\n${contextText}`,
            "",
            `Current explanation:\n${parsed.summaryText}`,
          ].join("\n"),
        });

        const rewrittenParsed = parseStructuredResponse(rewriteResponse.output_text);
        parsed = {
          ...parsed,
          summaryText: rewrittenParsed.summaryText || parsed.summaryText,
        };

        const rewriteUsage = extractUsageTokens(rewriteResponse.usage);
        extraCost +=
          rewriteUsage.inputTokens > 0 || rewriteUsage.outputTokens > 0
            ? estimateCostUsd(rewriteUsage.inputTokens, rewriteUsage.outputTokens)
            : 0;
      }

      parsed = {
        ...parsed,
        summaryText: normalizeEli10Paragraphs(parsed.summaryText),
      };
    }

    if (!useMockResponses && summaryMode === "standard" && isTooThinStandardSummary(parsed)) {
      const expansionResponse = await client.responses.create({
        model: "gpt-5.4-mini",
        instructions: [
          "You are expanding a standard summary that is too short.",
          "Rewrite it into a richer paragraph-based summary with more concrete information.",
          "Write 2 to 5 real paragraphs based on the source.",
          "Each paragraph should cover one meaningful idea in natural prose.",
          "You may add a short '- ' bullet block only when a paragraph truly benefits from supporting details, examples, or implications.",
          "Do not turn the whole output into bullets.",
          "Return valid JSON only with the same shape as before.",
          '{ "summaryType": "bullets" | "paragraph" | "insights", "summaryText": "string", "summaryBullets": [{"text":"string","level":0}], "insightPairs": [{"insight":"string","question":"string"}], "questions": ["string", "string", "string"] }',
          "Keep summaryType as paragraph and keep summaryBullets empty.",
          "Do not include markdown fences, commentary, or any text outside JSON.",
        ].join("\n"),
        input: [
          `Source: ${sourceLabel}`,
          "",
          `Content:\n${contextText}`,
          "",
          `Current summary to expand:\n${parsed.summaryText || formatBulletNodes(parsed.summaryBullets)}`,
        ].join("\n"),
      });

      const expandedParsed = parseStructuredResponse(expansionResponse.output_text);

      if (!isTooThinStandardSummary(expandedParsed)) {
        parsed = expandedParsed;
      }

      const expansionUsage = extractUsageTokens(expansionResponse.usage);
      extraCost =
        expansionUsage.inputTokens > 0 || expansionUsage.outputTokens > 0
          ? estimateCostUsd(expansionUsage.inputTokens, expansionUsage.outputTokens)
          : 0;
    }
    const { inputTokens, outputTokens } = extractUsageTokens(response.usage);
    const actualCost =
      inputTokens > 0 || outputTokens > 0
        ? estimateCostUsd(inputTokens, outputTokens)
        : estimatedRequestCost;
    const updatedLedger = {
      monthKey: currentMonth,
      spentUsd: Number((normalizedLedger.spentUsd + actualCost + extraCost).toFixed(6)),
    };

    await writeLedger(updatedLedger);

    return res.json({
      summaryType: parsed.summaryType,
      summaryText: parsed.summaryText,
      summaryBullets:
        parsed.summaryBullets.length > 0
          ? parsed.summaryBullets
          : parsed.summaryType === "bullets"
            ? [{ text: response.output_text.trim() || "No summary was returned.", level: 0 }]
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
          ? formatBulletNodes(summaryBullets)
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

    const response = useMockResponses
      ? createMockChatResponse({ sourceContext, question, summaryType, summaryText, summaryBullets, insightPairs, conversationText })
      : await client.responses.create({
          model: "gpt-5.4-mini",
          instructions: [
            "You are a thoughtful follow-up assistant for the provided source content.",
            "Answer the user's question directly, naturally, and intelligently.",
            "You may use the source content plus simple reasoning, arithmetic, calendar math, or timezone conversion when the answer can be inferred.",
            "If the user asks for a conversion or calculation, do the conversion instead of saying the source does not state it.",
            "If a precise answer cannot be determined, say what is known and what is uncertain.",
            "Prefer 1 to 3 short paragraphs. Use bullets only if they make the answer clearer.",
            "Do not use markdown fences.",
            "Do not wrap the answer in bold or other markdown formatting.",
          ].join("\n"),
          input: `Source content:\n${sourceContext}\n\nSummary type: ${summaryType}\n\nSummary:\n${
            summaryType === "bullets"
              ? formatBulletNodes(summaryBullets)
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
      answer:
        answerBullets.length > 0
          ? answerBullets.map(cleanAssistantText).join("\n")
          : cleanAssistantText(response.output_text.trim()) ||
            "I could not generate a response for that question, but the source may still contain the answer.",
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
