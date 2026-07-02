# history-insights/ — personal health-history education report

> **EXPERIMENTAL.** This module is the least mature part of
> FreeEducationHealth. Its topic detection is a simple keyword list, its
> output is AI-generated and can be wrong, and its interface is a bare CLI.
> It produces **education, not diagnosis and not a treatment plan.**

## What it does

You paste (or point it at a file containing) your own health history as
plain text — past diagnoses, medications, lab results, in any format. You
get back an education report about managing and improving your health going
forward, structured as **FAQ sections per relevant aspect of your health**:
if diabetes appears in your history you get a diabetes-management FAQ
section, if blood-pressure medication appears you get a blood-pressure
section, and so on, plus one overall section that always exists.

Every answer in every section comes from the same `core/` AI panel used by
the rest of this project: **at least 2 independent AI models** must respond,
their agreement is aggregated, and material disagreement is printed as an
explicit divergence warning on that section instead of being silently
blended away (see `../core/INTERFACE.md`). The FAQ *questions* are a fixed
template; this module writes no clinical content of its own.

The guidance is calibrated for someone who may have **no doctor reachable
nearby**: each section's "warning signs" answer states the specific changes
that mean it's time to travel to the nearest clinic or hospital, and the
"what can I do" answer starts with steps you can take yourself, at home,
now.

## Privacy — stated honestly

- **There is no server run by this project's author.** Not for this module,
  not for anything else in this repo. Your history text is read from your
  own disk (or your terminal), processed on your own machine, and the report
  is written to your own stdout/disk. Nothing is uploaded to any
  project-operated infrastructure, because none exists.
- **Whichever AI provider *you* configure sees the history text.** The panel
  works by sending your (locally redacted, see below) history to each
  provider listed in your own `.env` — Anthropic, DeepSeek, OpenAI, or a
  local model. Each hosted provider has its own data-handling terms that you
  accept by using your own API key with them. **If you run fully local
  models (e.g. Ollama via the `openai-compatible` provider entry), the text
  never leaves your machine at all** — that is the only configuration with
  that property.
- **This is not "HIPAA compliant" and we don't claim it is.** HIPAA applies
  to covered entities and their business associates; a self-hosted personal
  tool with no operator in the loop is simply outside that framing. What is
  true, by construction: no third party chosen by this project ever sees
  your data — only the AI provider(s) *you* choose.
- **A best-effort local PII scrub runs before anything is sent.** When this
  module runs inside the full repo checkout it reuses `bot/deidentify.cjs`
  (regex-only, in-process) to redact things that look like emails, phone
  numbers, ID/health-card numbers, and probable names from the copy sent to
  providers. It is best-effort, not a guarantee — **remove your name and any
  ID numbers from the text yourself before pasting.** The history content
  itself (conditions, meds, labs) is the point of the module and is sent.
- Nothing is persisted by this module except what you explicitly ask for
  (`--pdf`). Generated PDFs/reports are git-ignored in this folder.

## Setup

```bash
cd core && npm install && cd ..              # once, if not already done
cd history-insights && npm install
cp .env.example .env
# edit .env: at least two AI providers + their keys; PANEL_SIZE >= 2 always
```

Requires Node >= 18. `core/` must be installed (it's the panel engine this
module calls); `bot/` does not need to be installed, but its
`deidentify.cjs` file is used for the PII scrub when present.

## Usage

```bash
# from a file
node cli.cjs my-history.txt

# from stdin
cat my-history.txt | node cli.cjs

# also export a portable PDF you can keep on your phone and show a clinician
node cli.cjs my-history.txt --pdf my-report.pdf

# report in another language
node cli.cjs my-history.txt --locale fr-CA

# machine-readable output
node cli.cjs my-history.txt --json

# no AI calls: see detected topics and the exact (redacted) payloads
# that WOULD be sent to your configured providers
node cli.cjs my-history.txt --dry-run
```

Run `--dry-run` first. It costs nothing, calls no provider, and shows you
exactly what a real run would transmit — including what the local PII scrub
did and didn't catch.

### The `--pdf` export

The PDF is a simple, self-contained document (same `pdf-lib` engine as
`instanthpi/pdf/`, implemented locally in `pdf-export.cjs`) meant to travel
with you: keep it on your phone and show it to any clinician you manage to
reach, especially where providers don't share records. It is written only to
the path you give — nothing is transmitted. v1 limitation: the PDF's
standard fonts only cover Latin script; for non-Latin locales use the
plain-text/`--json` output instead.

## How it works

1. `analyze.cjs` keyword-matches your text against a short topic catalog
   (diabetes, hypertension, cholesterol, heart, asthma, COPD, kidney,
   thyroid, mental health, pregnancy, smoking, weight). Matching only
   decides which FAQ **sections** exist — the panel always sees your full
   history text.
2. It builds one `IntakeAnswers` object (shape:
   `../core/schema/intake.schema.json`) for an overall section, plus one
   topic-focused intake per detected topic.
3. Each intake is one full `core/` panel run (`getRecommendation`, >= 2
   independent models, sequential to respect provider rate limits). A panel
   run that fails is reported as a failed section — never replaced with
   made-up content, and never retried with a smaller panel.
4. Each panel result is mapped **deterministically** onto four FAQ answers:
   the plain-language summary, the do-this-now steps, the
   go-to-a-clinic warning signs, and what the models considered / whether
   they agreed.

## Files

| File | Purpose |
|---|---|
| `cli.cjs` | Command-line entry point (file/stdin → report → stdout, optional `--pdf`). |
| `analyze.cjs` | Topic detection, intake building, panel orchestration, FAQ mapping, text rendering. |
| `pdf-export.cjs` | Self-contained `pdf-lib` PDF export of a report. |
| `config.cjs` | Builds the `PanelConfig` from your `.env` (same env-var names as `bot/`). |
| `test/analyze.test.cjs` | Offline test suite (`npm test`) — no AI calls, no keys needed. |

## Known v1 limitations

- Topic detection is keyword matching, not understanding: misspellings,
  other languages, and conditions outside the short catalog won't get their
  own section (they are still covered by the overall section, which sees the
  full text).
- Each section is a full panel run, so a history matching 5 topics costs 6
  panel runs (each fanning out to every configured provider). With paid
  hosted providers, that's real API spend per report; local models make it
  free.
- The PDF export is Latin-script only (see above).
- No chunking: a very long history (hundreds of pages) may exceed provider
  context limits — trim to the relevant summary lines if a run fails on
  length.
