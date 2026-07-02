# SETUP.md — plain-language setup guide

This is the human-readable version of `CLAUDE.md` (the file an AI coding
agent reads automatically). If you have an AI coding agent (Claude Code or
similar), you can skip this and just tell it: **"open this repo and set it
up for me"** — `CLAUDE.md` gives it everything it needs. This file is for
reading directly, no agent required.

FreeEducationHealth is free, self-hosted, open-source software. There is no
company running a shared server and no monthly fee. You run it yourself, on
your own computer or your own server, using your own accounts and API keys.
Nobody but you sees your data, except whichever AI provider you choose to
send requests to (that provider's own privacy terms apply to that traffic —
see the "What this project cannot promise" section near the end).

## What's in this repo

| Folder | Who it's for | What it does |
|---|---|---|
| `core/` | Nobody installs this by itself — it's the engine library bundled into whichever piece you run | Talks to your chosen AI provider(s), runs a multi-AI "panel" so at least two independent models have to agree, and returns a structured recommendation. |
| `bot/` | Patients, run by anyone | A Telegram chatbot: a patient describes their symptoms, answers a few follow-up questions, and gets back plain-language considerations and next steps. |
| `instanthpi/` | A physician, running their own practice tools | Reads a physician's own Spruce Health inbox, drafts replies/PDFs/faxes using the AI panel, and waits for the physician to approve each one before anything is sent. |
| `epic/` | Hospitals/clinics using Epic | A sandbox-first tool that reads a patient's chart from Epic and shows the clinician an AI-panel-reviewed set of considerations. Never writes anything back into Epic. |
| `kiosk/` | Clinics, on a waiting-room tablet | A browser check-in page: the patient answers the structured intake while waiting, and a review card is filed into the same queue `instanthpi/` uses — so the physician walks in with a premade pre-visit summary. |
| `history-insights/` | Individuals (EXPERIMENTAL) | Paste your own past diagnoses/medications/labs as plain text and get back a plain-language education report, organized as FAQs per health topic, with an optional PDF you can carry to any provider. |
| `docs/` | Anyone wanting the full design reasoning | The original design spec, worked output examples for physicians, and a survey of which production features were ported into `instanthpi/`. |

You do not need all of these. Pick the one that matches what you want to
run.

## Before you start: what you'll need

Depending on which piece you run, gather these first. Every one of them is
**yours** — nothing here is shared or provided by this project:

- A Telegram bot token (free, from Telegram's own @BotFather) — for `bot/`.
- At least two AI provider API keys (e.g. Anthropic, DeepSeek, OpenAI — or
  a local model like Ollama, which needs no API key at all) — for any
  front-end, since `core/` requires at least 2 independent models to agree
  before it will produce a recommendation.
- A Spruce Health account and its API token — for `instanthpi/`, optional.
- An SRFax account — for `instanthpi/`'s fax-sending feature, optional.
- A free Epic developer account (fhir.epic.com) — for `epic/`, optional,
  sandbox use requires no approval wait.

## Installing dependencies

You'll need [Node.js](https://nodejs.org) version 18 or newer, and Python 3
if you plan to fill existing PDF forms (not required for basic use).

Open a terminal in the repo folder and run the install command inside each
piece you want to use:

```bash
cd core && npm install
cd ../bot && npm install
cd ../instanthpi && npm install
cd ../epic && npm install
cd ../kiosk && npm install
cd ../history-insights && npm install
```

(There is no single "install everything" command at the repo root on
purpose — each piece is independent. Only install what you're using.)

If you'll be filling existing PDF forms (as opposed to only generating new
ones), also run, inside `instanthpi/`:

```bash
python -m pip install -r pdf/requirements.txt
```

## Setting up the Telegram bot (patients)

1. **Get a bot token.** Open Telegram, message `@BotFather`, send `/newbot`,
   and follow its prompts (pick a name and a username ending in `bot`).
   BotFather gives you a token — copy it, and don't share it publicly.
2. **Create your config file:**
   ```bash
   cd bot
   cp .env.example .env
   ```
3. **Edit `bot/.env`** in any text editor and fill in:
   - `BOT_TOKEN` — the token from step 1.
   - `PANEL_PROVIDERS` — list at least two AI providers you have keys for,
     comma-separated, in the format `name:model:ENV_VAR_NAME`. The file
     already has a working example — just swap in the provider names/models
     you actually have accounts for.
   - Then, further down in the same file, fill in the actual key value for
     each `ENV_VAR_NAME` you referenced (e.g. `ANTHROPIC_API_KEY=sk-...`).
4. **Install dependencies** if you haven't already: `npm install`.
5. **One-time consent step.** Run:
   ```bash
   node accept-consent.cjs
   ```
   This is a short, required acknowledgment that as the bot's operator, you
   can see every message it receives and are responsible for that data
   under your own local privacy law. Type `I ACCEPT` when prompted. The bot
   will refuse to start without this.
6. **Run the bot:**
   ```bash
   node index.cjs
   ```
   Open Telegram, find your bot, and send `/start` to try it.

Full details and known limitations: `bot/README.md`.

## Setting up `instanthpi/` (physicians)

This one is different from the others: it isn't a server that runs
unattended. It's a set of scripts meant to be driven by an AI coding agent
(like Claude Code) sitting alongside the physician, one review session at a
time. If you're a physician without your own coding-agent setup, this piece
is not yet a point-and-click product — it's the open-sourced version of a
real production workflow, meant to be run "in Claude Code," per
`instanthpi/RUNBOOK.md`.

Setup steps, if you're preparing the environment for that agent to use:

1. `cd instanthpi && npm install`
2. `cp .env.example .env`
3. Fill in `.env`:
   - `CAROUSEL_PIN` — required, any PIN only you know. This gates the local
     web page where you review AI-drafted replies before they're sent.
   - `SPRUCE_API_TOKEN` — from your own Spruce Health account's
     API/integrations settings.
   - `SRFAX_ACCESS_ID` / `SRFAX_PWD` / `SRFAX_CALLER_ID` — only if you want
     to send faxes; otherwise leave blank.
   - AI provider keys, same idea as the bot above (at least 2).
   - `SIGNATURE_IMAGE_PATH` — leave this blank. The default is to sign
     printed documents by hand, which is always safe. Only fill this in
     with a path to your *own* private signature image file if you
     understand the implications — never a file that's part of this
     repository.
4. If you'll fill existing PDF forms: `python -m pip install -r pdf/requirements.txt`.
5. Hand the repo to your coding agent and point it at
   `instanthpi/RUNBOOK.md` — that file is written for the agent to follow
   step by step, including a hard rule that nothing is ever sent to a
   patient or faxed without your explicit approval of that specific case.

## Setting up `epic/` (hospitals/clinics using Epic)

1. Create a free account at [fhir.epic.com](https://fhir.epic.com) and
   register a new app (Patient/Standalone launch, R4, read-only scopes —
   full steps in `epic/README.md`).
2. Paste the Client ID Epic gives you into `epic/config.js`.
3. Edit `epic/panel.config.js` to list AI providers you have keys for, then
   set matching environment variables (e.g.
   `export ANTHROPIC_API_KEY=your-key-here`).
4. `cd epic && npm install && npm start`
5. Open `http://localhost:3000/launch.html` and log into Epic's public
   sandbox to try it against a test patient.

This never writes anything back into a real Epic chart — it only reads and
shows the clinician an AI-drafted set of considerations to review.

## Setting up `kiosk/` (clinic waiting rooms)

1. Edit `kiosk/panel.config.js` to list AI providers you have keys for, and
   set the matching environment variables (same pattern as `epic/` above).
2. `cd kiosk && npm install && node server.cjs`
3. Open `http://localhost:4646/` in the tablet's browser on the clinic
   network. Completed intakes are filed as review cards into
   `instanthpi/carousel/cards/`, where the physician reviews them exactly
   like Spruce-driven cards.

Keep the kiosk on the clinic's own local network only — the check-in page
is deliberately open (patients don't log in), and reading the filed cards
stays behind the carousel's PIN. Details: `kiosk/README.md`.

## Trying `history-insights/` (EXPERIMENTAL)

Read `history-insights/README.md` first — it explains honestly what this
module can and cannot promise about privacy (your configured AI provider
sees the history text you submit unless you run a fully local model).

```bash
cd history-insights && npm install
cp .env.example .env    # list your AI providers, same pattern as bot/
npm test                # offline self-check, no AI keys needed
node cli.cjs --dry-run  # paste obviously-fake text to see what would be sent
```

A real run is `node cli.cjs your-history.txt`, with `--pdf report.pdf` to
also produce a portable PDF summary you can keep on your phone.

## Quick sanity check: generate a sample PDF

This confirms the PDF-generation piece works, using entirely fake sample
data (no real patient information involved):

```bash
cd instanthpi
node pdf/generate.cjs pdf/sample-referral.pdf
```

You should see a confirmation message and find a small PDF file at that
path. Open it in any PDF reader — it will show clearly-fake placeholder
text like "Dr. Example Physician" and "Jane Example."

## What this project cannot promise

- **It is not a doctor, and using it does not mean you have a doctor.** Its
  purpose is to help you prepare for a real medical visit — organizing your
  symptoms and questions — not to replace one. It's built especially for
  places where a doctor may not be reachable at all, so its guidance tries
  to be genuinely actionable (what to try, what to watch for, when to
  travel for care) rather than just "go see a doctor."
- **Whichever AI provider you configure (Anthropic, DeepSeek, OpenAI, or
  otherwise) receives the text you send it, under that provider's own
  privacy terms.** This project has no visibility into, or control over,
  what happens to your data once it leaves your own server. Using a fully
  local model (e.g. via Ollama) keeps everything on your own machine.
- **This project does not endorse any particular AI provider.** The
  provider-agnostic design (`core/providers/`) exists precisely so you can
  choose freely, including switching later at no cost to you.
- **No one affiliated with this project will ever release an AI system,
  voice, or video claiming to be Dr. Carlos Faviel Font beyond what exists
  in this project as of its publication date.** Any future imitation of his
  identity or communication style is not authorized by him and should not
  be trusted as genuine.

## Getting more detail

- `docs/diagrams.md` — five diagrams of how everything fits together (they
  render as pictures when viewed on GitHub): the whole system, a patient's
  journey, a physician's daily loop, the multi-AI panel, and why there is
  no central server.
- `CLAUDE.md` — the same setup information, written for an AI agent to
  execute directly, plus a set of hard safety rules.
- `INTEGRATION.md` — if you're a hospital or clinic that wants to call
  `core/` directly from your own EMR/portal instead of using `bot/` or
  `instanthpi/`.
- `docs/physician-brain-components.md` — how each `instanthpi/` module maps
  to a real, already-working production system.
- `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md` — the
  full design rationale and mission statement.
