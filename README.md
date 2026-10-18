# Daymark

Daymark is a local-first personal progress tracker for recording daily work, habits, and tasks alongside developer activity. It brings a monthly activity calendar and a focused daily log together in one dark dashboard.

## Features

- **Calendar and daily log:** browse months, select a date, mark it productive, and write autosaved notes.
- **Habits and tasks:** check off daily habits, add dated tasks, and mark them complete.
- **Progress overview:** see monthly activity, productive-day streaks, and open tasks.
- **Desktop reminders:** optionally enable browser notifications for tasks with a reminder time. The dashboard must remain open for reminders to run.
- **GitHub activity:** fetch public events, repositories, and a small sample of recent commits by username using GitHub's unauthenticated API. This is not a complete contribution history.
- **LeetCode activity:** fetch public profile counts and this year's submission calendar through LeetCode's public GraphQL endpoint. The endpoint is undocumented and may change.
- **n8n notifications:** send a snapshot or weekly summary to a local n8n webhook; an example workflow is included. SMTP credentials are configured in n8n, not in this project.
- **Local AI assistant:** ask questions about recent tracker data using an Ollama model on your machine. It can read and suggest, but cannot change tracker records.

Journal entries, habits, tasks, and cached integration data are stored in this browser's `localStorage`. They are not uploaded by Daymark unless you explicitly enable or trigger an integration. The assistant sends a limited context (recent journal entries, tasks, and cached activity) to the local Ollama service.

## Requirements

- Node.js and npm
- A modern browser
- Optional: local n8n at `127.0.0.1:5678` and Ollama at `127.0.0.1:11434`

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The Vite development server proxies LeetCode, n8n, and Ollama requests; these integrations are intended for local use. To use n8n at a different local address, set `N8N_BASE_URL` before starting Vite, for example:

```bash
N8N_BASE_URL=http://127.0.0.1:5678 npm run dev
```

Create a production build with:

```bash
npm run build
```

## n8n setup

Import [`daymark-n8n-workflow.json`](./daymark-n8n-workflow.json) into your local n8n instance. Set the sender address and SMTP credential in n8n, then activate the workflow. In Daymark, use the matching webhook path (default: `progress-tracker`) and enter your recipient address. Weekly summaries and browser reminders are checked while the dashboard is open, so keep it running at the configured time.

## Data and limitations

- Clearing this browser's site data removes locally stored tracker information. There is no built-in export or account sync yet.
- GitHub and LeetCode results are public profile data and depend on their APIs and rate limits. LeetCode's endpoint can change without notice.
- n8n and Ollama are optional local services. Daymark does not start either service for you.
- The n8n example can email data through your configured SMTP service. Review the workflow and recipient settings before enabling it.
- This project is a personal dashboard, not a hosted or multi-user service.

## Tech stack

React, Vite, and plain CSS. Browser `localStorage` provides initial persistence; no application backend or database is required.
