# INTEGRATION.md — calling `core/` directly from your own system

This file is for hospitals, clinics, and other institutions that want to
integrate FreeEducationHealth's AI panel into **your own** front-end — a web
portal, an EMR plug-in, an internal triage tool — instead of using `bot/`
(Telegram) or `instanthpi/` (Spruce-driven) as-is. `core/` was built
specifically to make this possible: it has no knowledge of Telegram, Spruce,
or Epic, and exposes one stable function that any front-end (including one
you write yourself) can call.

If you're building against Epic specifically, `epic/` already does most of
this work for you (SMART on FHIR read + reshape into `core/`'s intake shape)
— see `epic/README.md`. This document is for everyone else: your own portal,
your own EMR's plug-in surface, a kiosk you build yourself, or a backend
service you operate.

## Why this is safe to build on independently

Per the design record (`docs/design-decisions.md`):

> `core/`'s internals (which providers, how the panel aggregates, how intake
> questions are sequenced) can change freely as long as this shape is
> preserved.

That means you can integrate against the contract below and expect it to
stay stable even as `core/`'s internals evolve — the same guarantee
`bot/`, `instanthpi/`, and `epic/` already depend on.

## The contract

Full formal spec: `core/INTERFACE.md`. Summary:

```ts
async function getRecommendation(
  intakeAnswers: IntakeAnswers,   // core/schema/intake.schema.json
  config: PanelConfig,
): Promise<RecommendationObject>  // core/schema/recommendation.schema.json
```

- **No side effects.** `getRecommendation()` does not send messages, write
  files, or call any external system other than the AI providers you
  configured in `config.providers`. It is safe to call as many times as you
  like; nothing downstream happens automatically.
- **No PHI in the input.** `IntakeAnswers` has no fields for name, phone
  number, health-card/NAM number, or address — by schema design
  (`additionalProperties: false` on the top-level object). Keep patient
  identity in your own system; only pass clinical content (chief complaint,
  follow-up answers, coarse age bracket, sex, free text) into `core/`.
- **Async, can take several seconds.** It fans out to N AI providers and
  aggregates their responses before returning.
- **Fails loud, not soft.** If fewer than `config.panelSize` providers
  succeed, it throws rather than silently returning a single-model answer
  with no divergence check. Your integration must handle that rejection
  (e.g. show "recommendation temporarily unavailable," retry, or escalate
  to a human) — do not catch it and downgrade `panelSize` to paper over a
  provider outage.

## Integration path 1: local import (same Node process)

If your front-end is Node.js and lives in (or can vendor) this repo, this is
the simplest path — exactly what `bot/`, `instanthpi/`, and `epic/` do:

```js
const { getRecommendation } = require('/path/to/freeeducationhealth/core');

const recommendation = await getRecommendation(intakeAnswers, panelConfig);
```

## Integration path 2: run `core/` as your own local HTTP service

If your front-end is in a different language/runtime, or you (as an
institution) want to run `core/` as its own independently-versioned
service — e.g. one internal deployment shared by several of your own
front-ends — wrap `core/`'s `getRecommendation()` in a small HTTP server you
control and run on your own infrastructure. `core/INTERFACE.md` documents
the expected shape for this mode:

```
POST /recommendation
Content-Type: application/json

{ "intakeAnswers": <IntakeAnswers>, "config": <PanelConfig> }

-> 200 OK, body: <RecommendationObject>
-> 4xx on schema validation failure (body: { "error": string })
-> 502 if fewer than config.panelSize providers succeeded
```

This repo does not ship that HTTP wrapper for you (there is deliberately no
shared/hosted `core/` service anywhere) — you write and operate it
yourself, on your own infrastructure, with your own AI provider keys. It's a
thin wrapper: a POST handler that calls `getRecommendation()` and returns
its result or error, matching the status codes above.

## Building `IntakeAnswers` from your own data

You do **not** have to use `core/intake/`'s conversational question flow.
Per `core/INTERFACE.md`: "front-ends may also construct `IntakeAnswers`
directly without using `core/intake/`'s question flow at all (e.g. `epic/`
pre-populating from FHIR resources)." Build the object however fits your
system — from a structured EMR query, a form your own portal already
collects, or a triage nurse's structured note.

Minimal valid shape (see `core/schema/intake.schema.json` for the full
field list and descriptions):

```json
{
  "chiefComplaint": "3 days of sore throat and low-grade fever",
  "followUps": [
    { "question": "Any difficulty breathing or swallowing?", "answer": false, "topic": "red-flag-screen" },
    { "question": "Highest temperature measured?", "answer": "38.2C", "topic": "vitals" }
  ],
  "ageRange": "18-39",
  "sex": "unspecified",
  "locale": "en",
  "jurisdiction": "CA-QC"
}
```

Notes:
- `ageRange` is a bracket (`"0-1"`, `"2-11"`, `"12-17"`, `"18-39"`,
  `"40-64"`, `"65+"`), never a date of birth or exact age — this is a
  schema-level privacy choice, not a suggestion.
- `jurisdiction` only affects `billingSuggestions` generation downstream
  (RAMQ-style, CPT-style, etc). Omit it (`null`) if you have no use for
  billing suggestions.
- `relevantHistory` is optional and lets you pass structured items you
  already know (conditions, medications, allergies, prior episodes) instead
  of relying on free text.

## Building `PanelConfig`

```ts
interface PanelConfig {
  providers: Array<{
    name: string;          // "anthropic" | "deepseek" | "openai" | "local" (OpenAI-compatible, e.g. Ollama)
    model: string;         // e.g. "claude-sonnet-5", "deepseek-chat", "gpt-4o", "llama3"
    apiKeyEnvVar: string;  // name of YOUR OWN env var holding the credential
    baseUrl?: string;      // required for "local", optional otherwise
  }>;
  panelSize: number;       // >= 2, always
  personaStyle: "generic" | string;
  locale?: string;         // BCP-47, e.g. "en", "fr-CA"
  jurisdiction?: string;   // optional, for billingSuggestions
}
```

`core/` resolves each `apiKeyEnvVar` at call time from `process.env` — it
never reads a raw key value out of `config` itself, so you can safely log or
persist a `PanelConfig` object without leaking a secret. Set the actual
credential values as environment variables in your own deployment; this
project has no shared/hosted key you can borrow.

`panelSize` must never be set below 2 in your integration. Per the design
spec, "independent models must reach consensus, and material disagreement
is surfaced to the user rather than silently resolved by picking one
model's answer" — this is the mechanism substituting for physician oversight
anywhere a licensed clinician isn't personally reviewing every output before
it's used, and dropping it to 1 removes that safeguard entirely.

## Interpreting the `RecommendationObject` you get back

Full schema: `core/schema/recommendation.schema.json`. Fields your
integration should handle explicitly:

| Field | Type | How to interpret it |
|---|---|---|
| `considerations` | `{ text, confidence }[]` | Ranked possibilities, each with a 0–1 confidence reflecting **panel agreement**, not diagnostic certainty. Present as "considerations," never relabel as "diagnosis" — the schema itself is worded this way deliberately. |
| `divergenceFlag` | boolean | `true` means the panel's models materially disagreed (e.g. conflicting red-flag calls, or non-overlapping considerations). **Surface this explicitly to whoever reviews the case** — don't silently blend a disagreement into one answer. If your integration has no human reviewer at all (fully patient-facing, no clinician in the loop), treat a `true` value as a signal to escalate toward human care rather than presenting a confident-sounding summary. |
| `redFlags` | `string[]` | Urgent findings warranting sooner care, in plain language. **Non-empty means show this first and prominently** — not buried under considerations. An **empty array does not mean "safe"** — it means the panel found no urgent finding in what it was given; your UI copy should not claim more than that. |
| `suggestedNextSteps` | `string[]` | Concrete, ordered actions calibrated for someone who may have no doctor reachable nearby — not a generic "see a doctor" list. Render these as an ordered list; order is meaningful (least-invasive/most-actionable first). |
| `billingSuggestions` | `{ code, description, jurisdiction }[] \| null` | Jurisdiction-aware billing-code suggestions **for the treating clinician's own records only**. Per the schema's own description: "Never presented to the patient." If your integration has any patient-facing surface, actively filter this field out of that surface — don't just rely on your UI "not showing" it by omission; assert it's excluded. |
| `plainLanguageSummary` | string | Safe to show directly to a patient/user — written assuming no medical background and no guaranteed follow-up access to a clinician. |
| `panelMeta` | object \| null | Optional diagnostics (which providers ran, panel size, timestamp). Useful for your own logs, not required to render. |

### `divergenceFlag` and `billingSuggestions` — the two fields institutions most often get wrong

- **`divergenceFlag`**: treat this as a hard gate in your UI logic, not a
  cosmetic badge. A common mistake is to compute it, store it, and never
  actually branch on it. If you have a "physician review required" state in
  your own workflow, `divergenceFlag === true` should route there even if
  your default flow for non-divergent cases is more automated.
- **`billingSuggestions`**: this is scoped to *your own* clinician's
  documentation, not a claim about what an insurer will accept, and never a
  patient-facing figure. If your institution operates in a jurisdiction not
  covered by `config.jurisdiction`, expect `null` back — that's the correct
  behavior, not a bug to work around by inventing your own mapping inside
  `core/`.

## What you are responsible for as the integrating institution

- You are the data controller for whatever identity/PHI-linked data your
  own front-end holds; `core/` never receives it and has no way to keep it
  safe or unsafe on your behalf — that responsibility stays entirely with
  your system.
- You choose and hold your own AI provider agreements (including any BAA or
  equivalent your jurisdiction requires) for the provider(s) you list in
  `config.providers`. This project makes no compliance claim about any
  provider and recommends none over another.
- If you run `core/` as your own HTTP service per path 2 above, you own that
  service's availability, authentication, and network exposure — there is
  no built-in auth on the HTTP contract shown above; add your own (e.g.
  mTLS, an internal network boundary, or a bearer token check) before
  exposing it beyond `localhost`.
- Any deployment mode you choose — on-premises, your own cloud tenant, or
  otherwise — is equally supported; nothing in this architecture depends on
  Carlos's infrastructure either way, so there is no code branch to select
  and no "hosted" tier to opt into or out of.
