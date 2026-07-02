# Start here: patients and families

You are setting up a **free health-preparation chatbot on Telegram** for
yourself, your family, or your community. It asks structured questions
about a symptom, has **at least two independent AI models** answer and
cross-check each other, and gives back plain-language considerations and
next steps — so you arrive at whatever medical care you can reach with
your story organized. It is **not a doctor and never pretends to be one.**

Everything runs on your own computer with your own accounts. Nobody else —
including the people who wrote this — can see what you or your family type.

## What you need

- A computer that stays on while the bot is in use (any laptop works).
- A free Telegram bot token — Telegram's own @BotFather gives you one in
  two minutes.
- Access to at least 2 AI models: two API keys (e.g. Anthropic, DeepSeek,
  OpenAI — small pay-as-you-go cost), or a free local model via Ollama.

## Step 1 — download your piece (only this one)

Download and unzip:
**[freeeducationhealth-bot-only.zip](https://github.com/carlosfalai/freeeducationhealth/releases/latest/download/freeeducationhealth-bot-only.zip)**

That single zip contains the bot and everything it needs. You do not need
anything else from this project.

## Step 2 — install an AI coding agent (recommended path)

The easiest way to set this up is to let an AI coding agent do it for you.
This project was built and tested with **Claude Code**, but any capable
coding agent works — the instructions it needs are inside the folder you
just unzipped (`CLAUDE.md`).

Install Claude Code:

- **Windows** (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://claude.ai/install.sh | bash`
- Or, if you already use Node.js: `npm install -g @anthropic-ai/claude-code`

Then open a terminal **inside the unzipped folder** and run:

```
claude
```

Sign in when it asks (a Claude subscription or API key), then type:

> Set this up for me. I am a patient/family and I only want the Telegram
> bot. Walk me through getting my bot token and AI keys, then start it and
> send a test message with obviously fake symptoms.

The agent reads the folder's own runbook and does the rest, asking you
only for the things that must be yours (your bot token, your AI keys).

## Step 3 — or set it up yourself, by hand

Open `SETUP.md` in the unzipped folder and follow the section **"Setting
up the Telegram bot (patients)."** Then read `bot/README.md` for the
details. No agent required.

## Before you rely on it

- Every session starts with a banner saying this is **not a doctor** and
  that emergencies go to real care immediately. That banner cannot be
  turned off.
- Don't type names, phone numbers, or ID numbers — the bot filters likely
  identifiers out of what it sends to the AI providers, but the filter is
  best-effort, and the habit is the real protection.
- Whoever runs the bot (you) can see what people send it. Only give your
  bot's address to people who know and accept that.
- Be careful with anyone online claiming to be a licensed physician while
  just passing along AI output — many places publish a free public
  register where you can verify a doctor's license by name.
