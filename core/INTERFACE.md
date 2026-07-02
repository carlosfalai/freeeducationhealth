# core/ interface contract

This document defines the contract every front-end (`bot/`, `instanthpi/`,
`epic/`) uses to talk to `core/`. It is the contract, not the
implementation — `core/`'s internals (which providers, how the panel
aggregates, how intake questions are sequenced) can change freely as long as
this shape is preserved.

## Why this exists

Per `docs/design-decisions.md`,
`core/` has no knowledge of Telegram, Spruce, or Epic. It exposes one stable
function. Every front-end is just a consumer of that function's input/output
shape. This lets a hospital extract or independently version `core/` later
without a rewrite, and lets `bot/`, `instanthpi/`, and `epic/` be built and
tested against a mock implementation of this same contract before `core/`'s
internals are finished.

## The function

```ts
async function getRecommendation(
  intakeAnswers: IntakeAnswers,   // core/schema/intake.schema.json
  config: PanelConfig,
): Promise<RecommendationObject>  // core/schema/recommendation.schema.json
```

- `intakeAnswers` — validates against
  [`core/schema/intake.schema.json`](./schema/intake.schema.json).
  Structured chief complaint, targeted follow-up Q/A pairs, and optional
  free-text notes. No PHI-as-identity fields (name, health card/NAM number,
  phone, address) belong in this object — front-ends are responsible for
  keeping those out, since `core/` has no way to distinguish a real name
  typed into free text from ordinary content.
- `config` — see [`PanelConfig`](#panelconfig-shape) below.
- Return value — validates against
  [`core/schema/recommendation.schema.json`](./schema/recommendation.schema.json).
  Considerations with confidence, a divergence flag, red flags, next steps
  calibrated for "may have no doctor nearby," optional jurisdiction-aware
  billing suggestions, and a plain-language summary.

The function is `async` and may take several seconds — it fans out to N AI
providers and aggregates their responses. It has no side effects: it does
not send messages, write files, or call Spruce/fax/PDF APIs. Everything
downstream of the recommendation (replying to a patient, filling a form,
sending a fax) is the front-end's job, not `core/`'s.

## `PanelConfig` shape

```ts
interface PanelConfig {
  // Which AI providers to consult, and in what order they're tried/aggregated.
  // Each entry names a provider module under core/providers/ plus the model
  // and credential the self-hoster configured for it. Providers are the
  // self-hoster's own accounts -- there is no shared/hosted key.
  providers: Array<{
    name: string;          // e.g. "anthropic", "deepseek", "openai", "openai-compatible"
    model: string;         // e.g. "claude-sonnet-5", "deepseek-chat", "gpt-4o", "llama3" (local)
    apiKeyEnvVar: string;  // name of the env var holding the credential, e.g. "ANTHROPIC_API_KEY"
    baseUrl?: string;      // required for "openai-compatible" (local/Ollama), optional otherwise
  }>;

  // Minimum independent model responses required before a recommendation is
  // returned. Design spec requires panelSize >= 2 always; default 3-4.
  // If fewer than panelSize providers succeed, getRecommendation MUST throw
  // rather than silently downgrade to a single-model answer with no
  // divergence detection.
  panelSize: number;

  // Which persona/style guide to apply when rendering plainLanguageSummary
  // and suggestedNextSteps (see core/persona/). "generic" is the only style
  // guaranteed available pre-PHI-scrub-gate; deployments may add their own.
  personaStyle: "generic" | string;

  // BCP-47 locale to generate output in. Falls back to intakeAnswers.locale
  // if omitted.
  locale?: string;

  // Optional jurisdiction hint forwarded to billingSuggestions generation.
  // Physician-facing front-ends (instanthpi/, epic/) set this; the
  // patient-facing bot/ front-end normally omits it.
  jurisdiction?: string;
}
```

`config` is constructed by the front-end from its own environment/config
file (e.g. a self-hoster's `.env` for `bot/`, or a settings file for
`instanthpi/`). `core/` never reads environment variables directly for
provider selection — the front-end resolves `apiKeyEnvVar` names to actual
values and passes them through `core/providers/`, so `core/` stays testable
with mock credentials.

## How a front-end calls it

This is a single-repo project — the default, supported integration path is
a **local function import, no network hop required**:

```js
// from bot/, instanthpi/, or epic/
const { getRecommendation } = require('../core');
// or: import { getRecommendation } from '../core/index.js';

const recommendation = await getRecommendation(intakeAnswers, panelConfig);
```

A front-end MAY instead run `core/` behind a local HTTP server (e.g. if a
front-end is written in a different language/runtime than `core/`, or an
institution wants to run `core/` as its own versioned service per
`docs/design-decisions.md`'s note
that a hospital could "extract or independently version it later"). In that
case the HTTP contract is:

```
POST /recommendation
Content-Type: application/json

{ "intakeAnswers": <IntakeAnswers>, "config": <PanelConfig> }

-> 200 OK, body: <RecommendationObject>
-> 4xx on schema validation failure (body: { "error": string })
-> 502 if fewer than config.panelSize providers succeeded
```

Front-ends should not assume the HTTP path exists by default — it is an
optional deployment mode, not the primary integration. The local-import path
is what `bot/`, `instanthpi/`, and the sandbox `epic/` front-end use in this
repo.

## Validation

Both schemas live under `core/schema/` and are plain JSON Schema
(2020-12 draft), usable with any standard validator (e.g. `ajv` in Node).
`core/` is expected to validate its own return value against
`recommendation.schema.json` before returning it, and front-ends are
encouraged (not required) to validate `intakeAnswers` before calling
`getRecommendation` so malformed intake fails fast at the UI layer instead
of inside the panel.

## What this contract deliberately does not specify

- How `core/panel/` aggregates N model responses into one `considerations`
  list or decides `divergenceFlag` — that's an internal algorithm, free to
  evolve.
- How `core/intake/` sequences follow-up questions to arrive at
  `IntakeAnswers` — front-ends may also construct `IntakeAnswers` directly
  without using `core/intake/`'s question flow at all (e.g. `epic/`
  pre-populating from FHIR resources).
- Persistence, logging, or retry/backoff behavior for provider calls.

Those are implementation details of `core/`, not part of the contract
front-ends depend on.
