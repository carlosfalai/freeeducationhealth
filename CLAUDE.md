# CLAUDE.md — agent-runbook for this repo

You are an AI coding agent (Claude Code or equivalent) that has just opened
this repository. This file is written so that a human can say **"set this up
for me"** and you can do it end-to-end with zero other guidance beyond the
human providing their own API keys/tokens when asked. Read this whole file
before running anything.

If you want the *design rationale* behind any decision below (why no shared
server, why panelSize >= 2, why billing suggestions never reach patients,
etc.), it lives in `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md`
and `docs/physician-brain-components.md`. You don't need to read those to
complete setup — this file is self-contained for that — but read them before
changing architecture or writing public-facing copy.

## What this project is

FreeEducationHealth is free, self-hosted, open-source software: AI-assisted
health-education/triage guidance for patients, and documentation automation
for physicians, aimed at regions with severe physician scarcity. There is
**no shared server, no monetization, and no Carlos-run infrastructure**.
Every person who runs this brings their own:

- Telegram bot token (for `bot/`)
- AI provider API key(s) — Anthropic, DeepSeek, OpenAI, or a local/Ollama
  endpoint (for `core/`, used by every front-end)
- Spruce Health account + token (for `instanthpi/`, optional)
- SRFax account (for `instanthpi/fax/`, optional)
- Epic developer app registration (for `epic/`, optional)

Never use a real credential as a placeholder value anywhere in this repo.
`.env.example` files use `your-token-here`-style placeholders — keep it that
way in anything you write or generate.

## Repo layout

```
freeeducationhealth/
  CLAUDE.md              <- this file
  SETUP.md               <- human-readable mirror of this file
  INTEGRATION.md         <- how institutions call core/ directly, bypassing bot/instanthpi/epic
  README.md              <- GitHub landing page
  LICENSE                <- MIT (code)
  core/                  <- provider-agnostic AI panel + intake engine (the "body")
    LICENSE-PERSONA.md    <- CC BY-NC, applies only to core/persona/ contents
    INTERFACE.md           <- the contract every front-end codes against; READ THIS before touching core/ or any front-end
    index.cjs               <- entry point: getRecommendation(intakeAnswers, config)
    providers/               <- anthropic.cjs, deepseek.cjs, openai.cjs, local.cjs (Ollama/OpenAI-compatible)
    panel/                   <- N-model orchestration, consensus/divergence detection
    intake/                  <- structured HPI-style intake flow (optional; front-ends may build IntakeAnswers directly)
    schema/                  <- intake.schema.json + recommendation.schema.json (JSON Schema 2020-12)
    persona/                 <- style-guide data, "generic" style only (see PHI-scrub gate note below)
    test/                    <- node --test suite
  bot/                    <- patient-facing Telegram front-end
  instanthpi/             <- physician-facing front-end ("the physician brain"), Spruce-driven
    carousel/                <- review/approval UI + card store (JSON files, no DB)
    spruce/                  <- Spruce REST client + actionable-message rule
    fax/                     <- SRFax outbound client
    pdf/                     <- generate.cjs (pdf-lib, from scratch) + fill.py (PyMuPDF, existing forms)
    inviter/                 <- phase-2/optional, NOT built (docs only — see inviter/README.md)
    RUNBOOK.md               <- the physician-facing agent runbook; read this before driving instanthpi/
  epic/                   <- SMART on FHIR front-end (Epic sandbox-first), read-only, no write-back
  kiosk/                  <- waiting-room intake kiosk (tablet browser, no patient login); files cards into instanthpi/carousel's store
  history-insights/       <- EXPERIMENTAL: paste your own health history -> FAQ-structured education report (CLI only)
    analyze.cjs             <- topic detection + intake building + panel orchestration + FAQ mapping
    cli.cjs                  <- entry point: file/stdin -> report on stdout, optional --pdf export
    pdf-export.cjs           <- self-contained pdf-lib export (portable patient PDF)
  docs/
    superpowers/specs/      <- design spec (internal rationale; do not copy personal narrative into public docs)
    physician-brain-components.md
```

`kiosk/` and `history-insights/` were originally spec-only future modules
but are now built (see `kiosk/README.md` and `history-insights/README.md`).
`history-insights/` is explicitly EXPERIMENTAL — read its README before
touching it or pointing anyone at it.

## The one rule that shapes everything: `core/` has no side effects

`core/` exposes exactly one function:

```js
const { getRecommendation } = require('./core');
const recommendation = await getRecommendation(intakeAnswers, panelConfig);
```

- `intakeAnswers` must validate against `core/schema/intake.schema.json`.
- `panelConfig` is built by the *front-end* from its own env vars/config —
  `core/` never reads environment variables to choose providers itself.
- The return value validates against `core/schema/recommendation.schema.json`.
- `core/` never sends a message, writes a file, or calls Spruce/fax/PDF
  APIs. Every side effect (replying to a patient, sending a fax, filling a
  PDF) is a front-end's job.
- `panelSize` must be >= 2. If fewer than `panelSize` providers succeed,
  `getRecommendation()` **throws** — do not catch that and silently fall
  back to a single-model answer anywhere in this repo. Independent-model
  agreement is what substitutes for physician oversight in a deployment
  with no reviewing clinician.

Full contract: `core/INTERFACE.md`. Read it before modifying any front-end's
call into `core/`.

## Install dependencies

Six independent Node projects, each with its own `package.json` and
`node_modules` — there is no root `package.json` and no workspace tooling.
Install each one you intend to run:

```bash
cd core && npm install && cd ..
cd bot && npm install && cd ..
cd instanthpi && npm install && cd ..
cd epic && npm install && cd ..
cd kiosk && npm install && cd ..
cd history-insights && npm install && cd ..
```

`instanthpi/pdf/fill.py` additionally needs a Python dependency:

```bash
cd instanthpi
python -m pip install -r pdf/requirements.txt
```

Requires Node >= 18 and Python 3 (any recent 3.x — verified against 3.12).
Only install the folders relevant to what you're standing up: a
patient-only deployment needs `core/` + `bot/`; a physician deployment
needs `core/` + `instanthpi/` (Python only if you'll fill existing PDF
forms, not just generate new ones).

## Standing up the Telegram bot (`bot/`) end-to-end

1. Get a bot token: message `@BotFather` on Telegram, send `/newbot`, follow
   the prompts. It replies with a token like `123456789:AAExampleToken`.
2. `cd bot && cp .env.example .env`
3. Edit `bot/.env`:
   - `BOT_TOKEN` — the token from step 1.
   - `PANEL_PROVIDERS` — at least two providers, comma-separated, each
     `name:model:apiKeyEnvVar[:baseUrl]`, e.g.
     `anthropic:claude-sonnet-5:ANTHROPIC_API_KEY,deepseek:deepseek-chat:DEEPSEEK_API_KEY`.
     For a local/Ollama model use the `openai-compatible`-style
     `local` provider entry with a `:baseUrl` (e.g.
     `...:local:llama3:LOCAL_API_KEY:http://localhost:11434/v1`).
   - `PANEL_SIZE` — must be `>= 2` and `<=` the number of providers listed.
   - Add a real value for each `apiKeyEnvVar` name you referenced (e.g.
     `ANTHROPIC_API_KEY=...`, `DEEPSEEK_API_KEY=...`) — ask the human
     operator for these; never invent or reuse a key from elsewhere in this
     conversation.
4. `npm install` (if not already done above).
5. One-time operator consent gate — the bot refuses to start without it:
   ```bash
   node accept-consent.cjs
   ```
   This asks the operator to type `I ACCEPT`, confirming they understand
   they are the data controller for messages their bot receives. It writes
   a local `.operator-consent.json` marker (git-ignored). Do this
   interactively with the human — do not fabricate their acceptance.
6. Run it:
   ```bash
   node index.cjs
   ```
   or `npm start`. It long-polls Telegram; Ctrl+C to stop.
7. Verify: message the bot on Telegram, send `/start`, answer the intake
   questions. If `core/` isn't installed/working yet, the bot still starts
   and completes the conversation flow, but tells the user it can't
   generate a recommendation yet — that's expected, not a bug, until
   `core/` has real provider keys configured.

Full detail (data-handling notes, file map, known v1 limitations):
`bot/README.md`.

## Pointing `instanthpi/` at a physician's own Spruce account

`instanthpi/` is not a server you start once and forget — it's a set of
scripts an agent (you) drives interactively, at the physician's request.
**Read `instanthpi/RUNBOOK.md` in full before driving any of this** — it is
itself an agent-runbook with hard rules (never send/fax/generate a document
without explicit per-case physician approval; never lower `panelSize` to
work around a panel failure; never write patient-identifying content into a
file that could be committed). This section is the install/setup path only.

1. `cd instanthpi && npm install`
2. `cp .env.example .env`
3. Edit `instanthpi/.env`:
   - `CAROUSEL_PIN` — required; the physician's own review server refuses to
     start without it. Pick something only the physician knows.
   - `SPRUCE_API_TOKEN` — from the physician's own Spruce Health dashboard
     (Spruce → API/integrations). This is *their* Spruce account, not a
     shared one.
   - `SPRUCE_BASE_URL` — leave as the default
     (`https://api.sprucehealth.com`) unless the physician's account
     documentation says otherwise.
   - `SRFAX_ACCESS_ID`, `SRFAX_PWD`, `SRFAX_CALLER_ID` — only needed if the
     physician wants outbound faxing; otherwise leave blank and skip that
     module.
   - `SIGNATURE_IMAGE_PATH` — optional, and only ever a path to a private,
     untracked file the physician supplies themselves. Leave empty to sign
     printed/exported PDFs by hand (the default and always-safe option).
     **Never** use, request, or embed Dr. Carlos Faviel Font's real
     signature or any other real signature image in this repo.
   - `ANTHROPIC_API_KEY` / `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` — at least
     `panelSize` of these, matching whatever the physician actually holds
     accounts for.
   - `INSTANTHPI_JURISDICTION` — e.g. `CA-QC`, or `generic` if none applies;
     forwarded to `core/` for jurisdiction-aware billing-code suggestions
     only (never shown to the patient).
4. `python -m pip install -r pdf/requirements.txt` (only needed for
   `pdf/fill.py`; `pdf/generate.cjs` has no Python dependency).
5. Spruce's exact endpoint paths/field names can vary by account — if
   `spruce/client.cjs` throws unexpected-shape errors, see the `ADAPT-ME`
   comments at the top of that file before assuming the credential is
   wrong.
6. Once configured, follow `instanthpi/RUNBOOK.md`'s "daily loop" to
   actually read Spruce, build cards, and (after physician approval)
   send/fax/generate documents. Do not skip its approval-gate rules.

`instanthpi/inviter/` (Spruce-invite + voice-call onboarding) is documented
but intentionally not built — see `instanthpi/inviter/README.md` for why
(it needs an always-on host + Twilio account, unlike everything else here).

## Smoke-testing PDF generation

Run this after `npm install` in `instanthpi/` to confirm `pdf-lib` and the
template code work, with zero patient data involved:

```bash
cd instanthpi
node pdf/generate.cjs pdf/sample-referral.pdf
```

Expect `Wrote sample referral letter to pdf/sample-referral.pdf` and a
non-trivial PDF file at that path (a few KB). It contains only obviously
fake placeholder values (`Dr. Example Physician`, `Jane Example`) and no
signature image unless `SIGNATURE_IMAGE_PATH` is set to a real file. Open it
or check its size to confirm; `pdf/*.pdf` is git-ignored, so delete it or
leave it — it will not be committed.

To also smoke-test the existing-form-filling path (`fill.py`, PyMuPDF):

```bash
python -m pip install -r pdf/requirements.txt
python pdf/fill.py list-fields pdf/sample-referral.pdf
```

This should print the AcroForm field names the generator created
(`fromPhysicianName`, `patientName`, `reasonForReferral`, etc.) with no
errors. If `import fitz` fails, the pip install above didn't complete —
re-run it before retrying.

## Running tests

```bash
cd core && npm test              # node's built-in test runner
cd bot && npm test               # jest
cd history-insights && npm test  # node's built-in test runner (offline, no AI keys needed)
```

The `core` and `history-insights` test scripts list their test files
explicitly (a bare `node --test test/` directory argument fails with
`MODULE_NOT_FOUND` on some Windows/Node combinations) — when you add a new
test file, add it to that package's `test` script too. `epic/` and
`instanthpi/` have no automated test suite in this checkout; verify them
with the smoke tests above and by starting their servers (`npm start` in
`epic/`, `node carousel/cards-server.cjs` in `instanthpi/`) and hitting
them manually.

## Running `epic/` (SMART on FHIR sandbox)

```bash
cd epic && npm install
# edit config.js: paste your own Epic Non-Production Client ID (see epic/README.md step 1)
# edit panel.config.js: list the AI providers you have keys for
export ANTHROPIC_API_KEY=your-key-here   # matching whatever panel.config.js references
npm start
```

Open `http://localhost:3000/launch.html`. If `../core/index.cjs` doesn't
exist or fails to load yet, `server.cjs` automatically falls back to
`lib/mock-core.cjs`, a clearly-labeled `[DEMO PLACEHOLDER]` responder — this
is expected and lets you exercise the FHIR-read pipeline before `core/` has
real credentials wired up. Full walkthrough: `epic/README.md`.

## Running `history-insights/` (EXPERIMENTAL)

Read `history-insights/README.md` first — it states the module's privacy
model honestly (no project-run server exists, but the *user's configured AI
provider* sees the history text unless they run a fully local model; it is
not "HIPAA compliant" and must never be described as such).

```bash
cd history-insights && npm install
cp .env.example .env   # same PANEL_PROVIDERS/PANEL_SIZE env vars as bot/
npm test               # offline suite, no AI keys needed
```

Smoke-test without any AI calls or keys (uses obviously-fake history text —
never paste real patient data as a test input):

```bash
printf 'Type 2 diabetes 2019.\nMetformin 500 mg twice daily.' | node cli.cjs --dry-run
```

Expect JSON showing `topicsDetected` including diabetes and the exact
(locally redacted) intake payloads a real run would send. A real run
(`node cli.cjs history.txt [--pdf report.pdf]`) needs >= 2 configured
providers and performs one `core/` panel run per section.

## Hard rules for you, the agent, across this whole repo

1. **Never write a real patient name, phone number, health card/NAM number,
   or other PHI into any file** — not in code, not in commit messages, not
   in an "example" value. Use obviously-fake placeholders
   (`Jane Example`, `555-0100`-style) exactly as the existing code does.
2. **Never write a real API key, token, or secret into any tracked file.**
   `.env` files are git-ignored in every folder that has one — verify that
   before creating a new credential-bearing file, and add it to the
   relevant `.gitignore` if it isn't covered.
3. **Never embed or fabricate Dr. Carlos Faviel Font's real signature image
   or real credentials anywhere in this repo**, including in generated
   sample PDFs — the existing `pdf/generate.cjs`/`pdf/fill.py` already
   handle this correctly (no default signature, physician supplies their
   own via an untracked path); do not change that default.
4. **Do not add monetization, license fees, or a shared/hosted server.**
   Every capability here is bring-your-own-credentials, self-hosted. If a
   task seems to imply adding billing, a shared API key, or a
   Carlos-operated backend, stop and flag it instead of building it.
5. **Keep `core/persona/` generic-only.** The design spec's PHI-scrub gate
   (`docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md`) is a
   hard requirement: real mined practice-style data does not enter this
   repo until an adversarial PHI-scrub pass is verified clean. Until told
   otherwise, treat `core/persona/style-guide.md`'s existing generic content
   as the ceiling, not a starting point to add more specific data to.
6. **`panelSize` is never allowed to drop below 2**, in any front-end's
   config, to work around a failing provider. Fix the provider credential
   or leave the error surfaced.
7. **Guidance language must be genuinely actionable for someone who may
   have no doctor reachable nearby** — not a bare "see a doctor." This
   applies to anything you draft into `suggestedNextSteps`-shaped content
   or FAQ/help copy.
8. When writing public-facing copy (README, SETUP, marketing text), do not
   copy personal narrative, anecdotes, or "how I built this" stories from
   `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md` — that
   file explicitly marks its personal-journey content as internal-only.
   State facts (cost, architecture, mission) plainly instead.

## If something in this file is stale

This file should track the actual repo. If you find a command, path, or env
var name here that no longer matches the code (e.g. a script was renamed),
trust the code and update this file in the same change — don't silently
work around a stale instruction here without also fixing it.
