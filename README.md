# FreeEducationHealth

Free health education, triage guidance, and physician documentation
automation — self-hosted, open source, no monetization, and no shared
server. Built for regions with severe physician scarcity (in some places,
roughly one doctor per 50,000+ people), where the realistic alternative is
often no medical guidance at all — not as a substitute for accessible
healthcare systems in countries that already have them.

Every self-hoster — a patient, a physician, a clinic, or a hospital — runs
their own instance with their own accounts: their own Telegram bot token,
their own AI provider keys, their own Spruce/SRFax/Epic credentials as
applicable. Nothing is shared, nothing is billed to anyone else, and no
central server ever sees anyone's data.

This project is model-agnostic by design and endorses no AI provider over
another (`core/providers/` supports Anthropic, DeepSeek, OpenAI, and any
local/OpenAI-compatible model such as Ollama). The author, Carlos Faviel
Font, is a board-certified physician, not a professional programmer; this
began as his own practice tooling, built through direct clinical practice
and hands-on iteration over several years, then generalized and released
for anyone to run.

## Who are you? Start with YOUR page — install only your piece

To the people who built it, this is one system. To you, it is one tool —
yours. Each page below is complete on its own: your download, your
instructions, nothing about the rest.

| You are… | Your page | Your download |
|---|---|---|
| A patient or family | [`start/patients.md`](start/patients.md) | the Telegram bot |
| A physician | [`start/physicians.md`](start/physicians.md) | the physician brain (Spruce + review cards + PDF + fax) |
| A clinic | [`start/clinics.md`](start/clinics.md) | the waiting-room kiosk + review carousel |
| A hospital / health system | [`start/hospitals.md`](start/hospitals.md) | the Epic SMART-on-FHIR reader (read-only) |
| An individual with their own health history | [`start/individuals.md`](start/individuals.md) | history-insights (EXPERIMENTAL) |

Each page's recommended path is the same: download your one zip, install
an AI coding agent (built and tested with Claude Code — installers in
every start page), open the folder, and say **"set this up for me."**

## Architecture

**You install only the piece you need.** Each front-end is its own
standalone tool with its own instructions and its own download; nothing
here is a shared service. What unifies them is source code only: every
front-end bundles its own local copy of the engine library (`core/`),
called in-process on your own machine. `core/` never talks to Telegram,
Spruce, or Epic directly, and it has no side effects — every front-end is
responsible for its own I/O.

```
                        ┌─────────────────────────────────────────┐
                        │                 core/                    │
                        │   provider-agnostic AI panel + intake     │
                        │                                            │
                        │  providers/  → Anthropic / DeepSeek /      │
                        │                OpenAI / local (Ollama)     │
                        │  panel/      → N-model consensus +         │
                        │                divergence detection        │
                        │  intake/     → structured HPI-style flow   │
                        │  schema/     → IntakeAnswers,               │
                        │                RecommendationObject         │
                        │  persona/    → generic style guide          │
                        │                                            │
                        │  getRecommendation(intakeAnswers, config)   │
                        └───────────────────┬────────────────────────┘
                                             │  local function call
                                             │  (or optional local HTTP)
              ┌──────────────────┬──────────┴───────────┬──────────────────┐
              │                  │                       │                  │
        ┌─────▼─────┐      ┌─────▼──────┐         ┌──────▼──────┐    ┌──────▼──────┐
        │   bot/    │      │ instanthpi/ │         │    epic/     │    │  your own   │
        │ Telegram  │      │  physician  │         │ SMART on FHIR│    │ integration │
        │  patient  │      │   "brain"   │         │(Epic sandbox │    │ (INTEGRATION│
        │ front-end │      │  (Spruce-   │         │ read + draft,│    │    .md)     │
        │           │      │  driven,    │         │ no write-back│    │             │
        │ free,     │      │ carousel +  │         │              │    │  hospitals/ │
        │ worldwide,│      │ approve +   │         │  read-only,  │    │  clinics    │
        │ self-     │      │ pdf + fax)  │         │  sandbox-    │    │  wiring     │
        │ hosted    │      │             │         │  first       │    │  core/ into │
        │           │      │             │         │              │    │  their own  │
        │           │      │             │         │              │    │  EMR/portal │
        └───────────┘      └─────────────┘         └──────────────┘    └─────────────┘
```

- **`bot/`** — a patient sends symptoms to their own self-hosted Telegram
  bot, answers a short structured intake, and gets back plain-language
  considerations and next steps. The goal is to help someone **prepare for
  a doctor visit** — organizing symptoms, history, and questions — not to
  present itself as a standalone diagnosis, even in places where that visit
  may not happen for a while.
- **`instanthpi/`** — the flagship: a physician's own Claude Code (or other
  coding agent) session reads their Spruce inbox, drafts a reply/PDF/fax
  using `core/`'s AI panel, and presents it as a review card. The physician
  approves or edits every card before anything is sent — the AI drafts, the
  physician remains the author of record.
- **`epic/`** — reads a patient's chart from Epic via SMART on FHIR
  (sandbox-first) and shows the clinician an AI-panel-reviewed set of
  considerations. Read-only; never writes back into Epic.
- **Your own front-end** — hospitals and clinics can skip `bot/`/`instanthpi/`
  entirely and call `core/`'s `getRecommendation()` straight from their own
  portal, EMR plug-in, or internal tool. See `INTEGRATION.md`.

## Why a multi-AI panel, not one model

There is no physician behind every self-hosted deployment the way there is
in a clinic. The N-model panel (minimum 2, default 3–4, self-hoster picks
which providers) is what substitutes for that oversight: independent models
must reach consensus, and material disagreement is surfaced explicitly via
`divergenceFlag` rather than silently resolved by picking one model's
answer.

## Get started

- **Have an AI coding agent?** Open this repo in it and say "set this up
  for me" — `CLAUDE.md` is a complete, self-contained runbook.
- **Setting it up yourself?** Read `SETUP.md` — the same instructions in
  plain language, no agent required.
- **Integrating into your own hospital/clinic system?** Read
  `INTEGRATION.md` for how to call `core/` directly.
- **A physician wondering what quality output looks like?**
  [`docs/examples/README.md`](docs/examples/README.md) — a worked-example
  gallery (referral PDF, review card, recommendation JSON, all placeholder
  data) with short lessons on reading each one, before you've configured
  anything.
- **Prefer pictures?** [`docs/diagrams.md`](docs/diagrams.md) — five
  diagrams (rendered right on GitHub): the whole system, the patient's
  journey, the physician's daily loop, inside the multi-AI panel, and the
  no-central-server deployment topology.
- **Want the design reasoning?** `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md`
  and `docs/physician-brain-components.md`.

## Download

Four zip bundles can be generated from any checkout of this repo:

```bash
node package-releases.cjs
```

They are written to `dist/` and are **not committed to the repo** — each zip
is built fresh from the current source every time the script runs:

- **`freeeducationhealth-full.zip`** — the entire repo. Pick this if you
  want everything, or haven't decided yet which front-end you'll run.
- **`freeeducationhealth-bot-only.zip`** — `core/` + `bot/` + root docs
  (`CLAUDE.md`, `README.md`, `LICENSE`). For someone who just wants to run
  the patient-facing Telegram bot.
- **`freeeducationhealth-instanthpi-only.zip`** — `core/` + `instanthpi/` +
  root docs. For a physician who just wants the physician brain
  (Spruce inbox → review cards → approved replies/PDFs/faxes).
- **`freeeducationhealth-docs-only.zip`** — everything under `docs/` plus
  `README.md`/`SETUP.md`/`CLAUDE.md`/`INTEGRATION.md`, no code at all. For
  reading and evaluating the project without running anything.

The script needs only Node (no npm install, no external zip utility) and
packages only files git would track: anything git-ignored — `.env` files,
`node_modules/`, generated PDFs, carousel card data — never enters a zip,
so even a locally configured checkout can be packaged without leaking
credentials or patient data.

## Licensing

- Code: **MIT** (`LICENSE`).
- `core/persona/`: **CC BY-NC** (`core/LICENSE-PERSONA.md`) — anyone may run
  it; no one may repackage the clinical voice into a competing commercial
  product.

## Notices

**Identity.** This project and its updates are published through its
official channels: this repository and instanthpi.ai. An AI system, video,
cloned voice, or persona claiming to be Dr. Carlos Faviel Font may be an
imitation created without his authorization — do not assume something is
authentically him just because it uses his name, likeness, or
communication style. When in doubt, verify against the official channels.

**No AI-provider endorsement.** This project does not recommend any AI
model or provider over another, and no endorsement of any AI provider is
implied anywhere in it. The provider-agnostic architecture in
`core/providers/` reflects that neutrality by design.

**Not a doctor, and not a claim of compliance.** Nothing in this project is
a substitute for professional medical care, and self-hosting it does not by
itself make any deployment "HIPAA compliant" or equivalent — that depends
on the covered entity's own arrangements with whichever AI provider they
configure. See `SETUP.md` and `INTEGRATION.md` for what this architecture
can and cannot promise.
