# epic/ &mdash; SMART on FHIR front-end (Epic, sandbox-first)

Free, self-hosted front-end that reads a patient's chart out of Epic via
[SMART on FHIR](https://fhir.epic.com), reshapes it into the
[`core/` intake contract](../core/INTERFACE.md), and calls `core/`'s
`getRecommendation()` to draft an AI-panel-reviewed considerations list for
the clinician to review. It never writes anything back into Epic &mdash;
write-back is a separate, explicitly gated capability (see
[Write-back is gated](#write-back-is-gated) below).

This generalizes the pattern already proven in the `instanthpi-epic` sandbox
app to a clean, self-hoster-configurable version: no shared client ID, no
shared server, no shared AI keys. You register your own Epic developer app
and bring your own AI provider credentials.

## 1. Register your own Epic developer app (one-time, free)

1. Create a free account at [fhir.epic.com](https://fhir.epic.com)
   (Connection Hub). Verify the email they send you.
2. Create a new app:
   - **Application Audience:** start with **Patients / Standalone** &mdash;
     this is the easiest sandbox launch mode and does not require an
     institution to embed you inside a live EHR session.
   - **SMART on FHIR Version:** R4
   - **Incoming APIs (scopes):** read-only to start &mdash; `Patient.Read`,
     `Condition.Read`, `MedicationRequest.Read`, `AllergyIntolerance.Read`,
     `Observation.Read`. Do not request `DocumentReference.write` yet (see
     below).
   - **Redirect URI:** `http://localhost:3000/index.html`
   - **Launch URI** (only if you also want to test an EHR launch later):
     `http://localhost:3000/launch.html`
3. Epic issues a **Non-Production Client ID** immediately (no approval
   wait for sandbox use). Paste it into [`config.js`](./config.js):

   ```js
   window.EPIC_CONFIG = {
     clientId: "paste-your-non-production-client-id-here",
     ...
   };
   ```

   A freshly created client ID can take up to ~1 hour to propagate to Epic's
   sandbox auth servers &mdash; if `launch.html` reports "invalid client"
   immediately after registering, wait and retry.

## 2. Configure your own AI provider keys

Edit [`panel.config.js`](./panel.config.js) to list the AI providers you
actually have API keys for (Anthropic, OpenAI, DeepSeek, or a local/
OpenAI-compatible endpoint such as Ollama). Then set the matching
environment variables before starting the server, e.g.:

```
export ANTHROPIC_API_KEY=your-key-here
export OPENAI_API_KEY=your-key-here
```

Never paste an actual key value into `panel.config.js` &mdash; it only
holds the *names* of environment variables, per
[`core/INTERFACE.md`](../core/INTERFACE.md#panelconfig-shape). Keep
`panelSize >= 2`: independent-model consensus/divergence detection is what
substitutes for physician oversight in this free, no-shared-server release.

## 3. Run it

```
cd epic
npm install
npm start
```

Open `http://localhost:3000/launch.html` &rarr; log into Epic's sandbox
&rarr; you land on `index.html`, which shows the chart pulled live from
Epic, a form to enter the presenting complaint, and a "Get panel draft"
button that calls `POST /api/recommendation`.

Epic's public sandbox test patients/logins are listed at
<https://fhir.epic.com/Documentation?docId=testpatients>.

### Running before `core/` exists

If `../core/index.js` isn't present yet in your checkout, `server.cjs`
automatically falls back to [`lib/mock-core.cjs`](./lib/mock-core.cjs), a
placeholder that returns a clearly labeled `[DEMO PLACEHOLDER]` response
shaped to match `core/schema/recommendation.schema.json`, so you can
exercise the whole FHIR-read &rarr; intake-shape &rarr; recommendation-shape
pipeline immediately. It does not call any AI provider and carries no
clinical meaning. The moment `core/index.js` exists and exports
`getRecommendation`, `server.cjs` picks it up automatically on next start
&mdash; nothing in `epic/` needs to change.

## 4. What actually happens, end to end

1. `launch.html` starts the SMART OAuth2 flow via the `fhirclient` package.
2. `index.html` reads `Patient`, `Condition`, `MedicationRequest`,
   `AllergyIntolerance`, and `Observation` (vital-signs) resources for the
   authorized patient, and shows them to the clinician.
3. The clinician enters the presenting complaint (FHIR has no reliable
   structured "reason for visit" field for a standalone launch) plus a few
   quick follow-up answers.
4. `index.html` POSTs a flattened, **de-identified** payload to
   `/api/recommendation`: age *range* (not date of birth), sex, and plain
   description strings for problems/medications/allergies/vitals &mdash;
   never the patient's name or MRN. See the inline comment in `index.html`.
5. `server.cjs` reshapes that payload into
   [`core/schema/intake.schema.json`](../core/schema/intake.schema.json)
   via [`lib/fhir-to-intake.cjs`](./lib/fhir-to-intake.cjs) and calls
   `core`'s `getRecommendation(intakeAnswers, config)`.
6. The returned `RecommendationObject` (considerations with confidence,
   `divergenceFlag`, red flags, next steps, optional billing suggestions,
   plain-language summary) is rendered back on `index.html` for the
   clinician to review. Nothing is sent to the patient and nothing is
   written back to Epic.

## Write-back is gated

Creating a `DocumentReference` note back into the chart is a separate,
higher-review Epic scope and is only appropriate once a specific site
sponsors a pilot and grants that write access &mdash; exactly as documented
in the original `instanthpi-epic` sandbox README. This repo does not change
that gate: `epic/` only implements the read + draft path. If you're an
institution wanting to pilot write-back, that is a per-site conversation
with your own Epic team and IT governance, not something this open-source
front-end enables by default.

## Compliance note

This is generic, self-hosted, open-source software with no shared server
and no shared credentials &mdash; you are the data controller for whatever
Epic sandbox/production instance and AI provider keys you point it at. If
you connect this to real patient data (a production Epic instance, not the
public sandbox), you are responsible for ensuring your AI provider
agreements (e.g. a BAA) and local regulations cover that use before doing
so. Nothing in this repository operates a shared or hosted instance on your
behalf.
