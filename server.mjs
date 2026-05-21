import "dotenv/config";
import * as cheerio from "cheerio";
import express from "express";
import OpenAI from "openai";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER === "true";
const port = Number(process.env.PORT || 10000);

const app = express();
app.use(express.json({ limit: "1mb" }));

const apiKey = process.env.OPENAI_API_KEY;
const client = apiKey ? new OpenAI({ apiKey }) : null;

function extractReadableText(html) {
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, iframe, footer, nav, aside").remove();

  const title =
    $("title").first().text().trim() || $("h1").first().text().trim() || "Untitled page";

  const article = $("article").first();
  const main = $("main").first();
  const contentRoot = article.length > 0 ? article : main.length > 0 ? main : $("body");
  const text = contentRoot.text().replace(/\s+/g, " ").trim();

  return { title, text };
}

function splitBullets(text) {
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]+\s*/, "")
        .replace(/^\d+[.)]\s*/, ""),
    )
    .filter(Boolean);
}

app.post("/api/summarize", async (req, res) => {
  const mode = req.body?.mode === "text" ? "text" : "url";
  const value = typeof req.body?.value === "string" ? req.body.value.trim() : "";

  if (!value) {
    return res.status(400).json({
      error: mode === "url" ? "Please enter a URL before generating a summary." : "Please paste some text before generating a summary.",
    });
  }

  if (!client) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY in the .env file. Please add it and restart the app.",
    });
  }

  try {
    let contextText = value;
    let sourceLabel = mode === "url" ? value : "Pasted text";

    if (mode === "url") {
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
          error: "No readable text was found on that page.",
        });
      }

      contextText = trimmedText;
      sourceLabel = title;
    }

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        "You are a helpful summarizer. Return 4 to 6 short bullet points. Each bullet should be concise, specific, and easy to scan. Do not add an intro or conclusion.",
      input: `Source: ${sourceLabel}\n\nContent:\n${contextText}`,
    });

    const bullets = splitBullets(response.output_text.trim());

    return res.json({
      bullets: bullets.length > 0 ? bullets : [response.output_text.trim() || "No summary was returned."],
      contextText,
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
  const summaryBullets = Array.isArray(req.body?.summaryBullets) ? req.body.summaryBullets : [];
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
    const conversationText = conversation
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n");

    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        "You answer questions about the provided source content. Keep the answer short, useful, and in bullet points. If the question is not answerable from the content, say so briefly.",
      input: `Source content:\n${sourceContext}\n\nInitial summary bullets:\n${summaryBullets
        .map((bullet) => `- ${bullet}`)
        .join("\n")}\n\nConversation:\n${conversationText}\n\nAnswer the user's last question.`,
    });

    const answerBullets = splitBullets(response.output_text.trim());

    return res.json({
      answer: answerBullets.length > 0 ? answerBullets.join("\n") : response.output_text.trim(),
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
