# Start here: individuals with their own health history (EXPERIMENTAL)

You are trying the **history-insights** module: paste your own past
diagnoses, medications, and lab results as plain text, and get back a
plain-language education report — organized as FAQs per health topic
found in your history — plus an optional PDF summary you can keep on your
phone and show any provider you ever see. **This module is explicitly
experimental**, and it educates; it does not diagnose or treat.

## Privacy, stated honestly before you paste anything

There is no server run by this project — the analysis happens on your own
computer. But **whichever AI providers you configure will receive the
(locally redacted) history text** under their own data terms. A local
identifier filter strips likely names, phone numbers, and ID numbers
first, and it is best-effort, not perfect. The only setup where your
history never leaves your machine at all is a fully local model (e.g.
Ollama). This is not "HIPAA compliance" and the module never claims it.

## What you need

- At least 2 AI provider API keys, or a local model via Ollama.
- Your history as a plain text file — even rough notes work.

## Step 1 — download your piece (only this one)

Download and unzip:
**[freeeducationhealth-history-insights.zip](https://github.com/carlosfalai/freeeducationhealth/releases/latest/download/freeeducationhealth-history-insights.zip)**

## Step 2 — install an AI coding agent (recommended path)

Built and tested with **Claude Code**; any capable coding agent works.

- **Windows** (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://claude.ai/install.sh | bash`
- Or via Node.js: `npm install -g @anthropic-ai/claude-code`

Open a terminal **inside the unzipped folder**, run `claude`, sign in,
and type:

> Set this up for me. I am an individual using history-insights. Configure
> my providers, run the offline tests, then do a --dry-run with fake
> history text and show me exactly what would be sent before I use
> anything real.

That `--dry-run` step matters: it shows you the exact (redacted) payloads
a real run would send, before any real data moves.

## Step 3 — or run it yourself

```bash
cd history-insights && npm install
cp .env.example .env     # list your AI providers
npm test                 # offline self-check, no AI keys needed
node cli.cjs --dry-run   # paste fake text, inspect what would be sent
node cli.cjs my-history.txt --pdf report.pdf   # the real run
```

Details and limits (English-keyword topics, Latin-script PDF, and the
rest): `history-insights/README.md`.
