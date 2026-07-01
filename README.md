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
local/OpenAI-compatible model such as Ollama). The people who built this are
board-certified physicians, not software companies — this began as one
physician's own practice tooling, generalized and released for anyone to
run.

## Architecture

One shared engine (`core/`), four independent front-ends that consume it.
`core/` never talks to Telegram, Spruce, or Epic directly, and it has no
side effects — every front-end is responsible for its own I/O.

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
- **Want the design reasoning?** `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md`
  and `docs/physician-brain-components.md`.

## Licensing

- Code: **MIT** (`LICENSE`).
- `core/persona/`: **CC BY-NC** (`core/LICENSE-PERSONA.md`) — anyone may run
  it; no one may repackage the clinical voice into a competing commercial
  product.

## Notices

**Identity.** No future AI system, video, cloned voice, or persona claiming
to be Dr. Carlos Faviel Font should be treated as authentic beyond what
exists in this project as published. His likeness and communication style
may be imitated or synthesized by others without his authorization — no
such imitation should be mistaken for him.

**No AI-provider endorsement.** This project does not recommend any AI
model or provider over another. The provider-agnostic architecture in
`core/providers/` reflects that neutrality by design.

**Not a doctor, and not a claim of compliance.** Nothing in this project is
a substitute for professional medical care, and self-hosting it does not by
itself make any deployment "HIPAA compliant" or equivalent — that depends
on the covered entity's own arrangements with whichever AI provider they
configure. See `SETUP.md` and `INTEGRATION.md` for what this architecture
can and cannot promise.
