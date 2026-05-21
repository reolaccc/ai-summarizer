# AI Summarizer

A very small MVP web app built with React, Vite, TypeScript, Tailwind CSS, and the OpenAI API.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the project root:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

3. Start the development server:

```bash
npm run dev
```

## Deploy to Render

1. Push this folder to GitHub.
2. In Render, create a new Web Service from that repository.
3. Use the included `render.yaml` Blueprint, or set these values manually:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Environment variable: `OPENAI_API_KEY`
4. Render will prompt you for the API key during setup if you use the Blueprint.

## Notes

- This project is intentionally simple: one page, a Text/URL switcher, one summary output, and a follow-up chat box.
- The app reads `OPENAI_API_KEY` from the local Node server, not from the browser.
- The browser sends either text or a page URL to `/api/summarize`, and the server summarizes that content.
- If you use a URL, the server fetches only that page, extracts readable text, and does not crawl lower-level links.

## Project structure

```text
.
├── .env.example
├── index.html
├── package.json
├── README.md
├── src
│   ├── App.tsx
│   ├── index.css
│   ├── main.tsx
│   └── vite-env.d.ts
├── server.mjs
├── tsconfig.app.json
├── tsconfig.json
└── vite.config.ts
```

## Where to modify the summarization prompt

Open `server.mjs` and update the `instructions` value inside the OpenAI request.
