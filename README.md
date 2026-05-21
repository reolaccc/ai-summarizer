# AI Summarizer

A small React + Vite + TypeScript demo for summarizing text, URLs, and PDF files with OpenAI.

## Features

- Text or URL input
- Summary modes: Standard Summary, Bullet Points, Key Insights, Academic, Explain Like I'm 10
- PDF upload with drag-and-drop
- Follow-up questions generated from the content
- Token and cost estimator before sending requests
- Copy summary, export Markdown, export plain text
- Small monthly spend guard in the backend

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

3. Start the app locally:

```bash
npm run dev
```

4. Open the local URL shown in the terminal, usually:

```text
http://localhost:5173
```

## Deploy to Render

1. Push this repo to GitHub.
2. In Render, create a new Web Service from the repository.
3. Use the included `render.yaml` or set these values manually:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variable: `OPENAI_API_KEY`
4. Render will give you a public `onrender.com` URL after deployment.

## Render Check

- `render.yaml` already defines the web service and free plan.
- `OPENAI_API_KEY` is configured as a Render environment variable, not in the frontend.
- After deployment, the public URL comes from Render automatically; there is no custom domain setup required for the demo.
- If Render shows a dashboard, the important things to verify are the service status, the env var, and the latest deploy log.

## Project Structure

```text
.
├── README.md
├── index.html
├── package.json
├── render.yaml
├── server.mjs
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── EstimatorCard.tsx
│   │   ├── FileDropzone.tsx
│   │   ├── ResultCards.tsx
│   │   └── SummaryModeSelector.tsx
│   └── lib
│       ├── estimate.ts
│       ├── export.ts
│       ├── pdf.ts
│       └── summaryModes.ts
├── tsconfig.app.json
├── tsconfig.json
└── vite.config.ts
```

## How PDF Extraction Works

PDF uploads are handled in the browser with `pdfjs-dist`. The app:

- Reads the uploaded PDF as bytes
- Loads it with PDF.js
- Iterates through each page
- Extracts text content from every page
- Joins the text and fills the input automatically

The PDF code is lazy-loaded, so the parser only downloads when someone uploads a PDF.

## How Prompts Are Organized

- Summary mode labels and descriptions live in `src/lib/summaryModes.ts`
- Summary prompt behavior is centralized in `server.mjs`
- The backend returns structured JSON with:
  - `summaryType`
  - `summaryText`
  - `summaryBullets`
  - `questions`

If you want to change the actual wording for any mode, edit the summary mode prompt block in `server.mjs`.

## Token Estimation

The estimator is intentionally lightweight and approximate:

- Input tokens are estimated from text length using about 4 characters per token
- Output tokens are estimated from the selected summary mode
- Estimated cost uses the current per-token pricing constants in `src/lib/estimate.ts`

This is meant for rough visibility before the request is sent, not billing-grade precision.

## Customizing Summary Modes

To change the UI labels, descriptions, or token estimates, edit:

- `src/lib/summaryModes.ts`

To change how the AI writes each mode, edit:

- `server.mjs`

## Notes

- The OpenAI API key stays on the server and is not exposed to the browser.
- The backend includes a small spend guard that stops new requests when the demo reaches about `$7` in estimated monthly spend.
- The app preserves the existing chat-style follow-up flow.
