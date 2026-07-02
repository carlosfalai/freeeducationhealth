# Start here: clinics

You are setting up a **waiting-room check-in kiosk**: a webpage on a
tablet, iPad, or spare phone at reception. While the patient waits, they
answer the same structured intake a careful history would cover; a
multi-AI panel reviews it; and by the time the physician walks in, a
premade pre-visit summary card is waiting in their review queue. It
standardizes and speeds up intake — it does not replace anything about
the visit itself.

## What you need

- Any computer at the clinic to run the small kiosk server, and a tablet
  or phone on the **same local network** to show the check-in page.
- At least 2 AI provider API keys (or a local model via Ollama).
- No patient logins, no app installs — patients just use the page.

## Step 1 — download your piece (only this one)

Download and unzip:
**[freeeducationhealth-clinic-kiosk.zip](https://github.com/carlosfalai/freeeducationhealth/releases/latest/download/freeeducationhealth-clinic-kiosk.zip)**

This bundle includes both the kiosk **and** the physician review side
(the carousel the kiosk files cards into), so one download covers the
whole clinic loop.

## Step 2 — install an AI coding agent (recommended path)

Built and tested with **Claude Code**; any capable coding agent works.

- **Windows** (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://claude.ai/install.sh | bash`
- Or via Node.js: `npm install -g @anthropic-ai/claude-code`

Open a terminal **inside the unzipped folder**, run `claude`, sign in,
and type:

> Set this up for me. We are a clinic and want the waiting-room kiosk.
> Configure the AI providers, start the kiosk server, show me the
> check-in page, submit one test intake with fake data, and show me the
> card it filed for the physician.

## Step 3 — or set it up yourself

`SETUP.md` section **"Setting up kiosk/ (clinic waiting rooms)"**, then
`kiosk/README.md`. In short: configure providers in
`kiosk/panel.config.js`, run `node server.cjs`, and open
`http://<that-computer>:4646/` on the tablet.

## Ground rules for the waiting room

- Keep the kiosk page on the clinic's own network only. The check-in page
  is deliberately open (patients don't log in); reading the filed cards
  stays behind the review carousel's PIN.
- The welcome screen tells patients not to type names, phone numbers, or
  health-card numbers — the front desk repeating that once makes it stick.
- The physician reviews every card; the kiosk never talks to patients
  about their case and never sends anything anywhere on its own.
