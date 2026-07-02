# bot/ -- patient-facing Telegram front-end

Free, self-hosted Telegram bot that collects a short symptom intake and
returns a plain-language recommendation from `core/`'s multi-AI panel. You
run your own bot, with your own Telegram token and your own AI provider
keys -- there is no shared server and nothing is billed to anyone but you.

This is **not a doctor** and does not replace medical care. See the
emergency banner every chat opens with, and `docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md`
for the project's full design rationale.

## What this is built against

`bot/` is a consumer of the contract documented in
[`../core/INTERFACE.md`](../core/INTERFACE.md): it builds an `IntakeAnswers`
object from a short chat conversation, calls `core/`'s
`getRecommendation(intakeAnswers, config)`, and renders the returned
`RecommendationObject` back to the patient. If `../core/index.cjs` isn't
implemented yet in your checkout, the bot still starts (you can exercise the
conversation flow and safety gates), but it will tell users it can't
generate a recommendation until `core/` exists.

## 1. Get a Telegram bot token

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts (choose a name and a username
   ending in `bot`).
3. BotFather replies with a token that looks like `123456789:AAExampleToken`.
   Keep it secret -- anyone with it can control your bot.

## 2. Configure your `.env`

```
cd bot
cp .env.example .env
```

Edit `.env` and fill in:

- `BOT_TOKEN` -- the token from step 1.
- `PANEL_PROVIDERS` -- at least two AI providers, e.g.
  `anthropic:claude-sonnet-5:ANTHROPIC_API_KEY,deepseek:deepseek-chat:DEEPSEEK_API_KEY`.
  Each `apiKeyEnvVar` name must also appear as its own line further down in
  `.env` with your real key. See `../core/INTERFACE.md` for the full
  `PanelConfig` shape, including how to point at a local/Ollama model via
  `openai-compatible` + `baseUrl`.
- `PANEL_SIZE` -- minimum independent model responses required per
  recommendation. Must be at least 2 (a single model has no way to flag
  disagreement); default 2.

`.env` is git-ignored -- never commit it.

## 3. Install dependencies

```
npm install
```

## 4. Accept operator consent (one time)

```
node accept-consent.cjs
```

This prints a short consent text and asks you to type `I ACCEPT`. It
confirms you understand that: you can see every message your bot receives,
you are the data controller for that data under your own local law, and you
must not misuse it. A local marker file (`.operator-consent.json`,
git-ignored) records this. `bot/index.cjs` refuses to start without it.

## 5. Run the bot

```
node index.cjs
```

or `npm start`. The bot polls Telegram for updates; stop it with Ctrl+C.

## Data handling, stated plainly

- Session state (chief complaint, answers, stage) lives only in an
  in-memory `Map`, per chat, for as long as this process runs. Restarting
  the process clears every in-progress conversation. Nothing is written to
  disk or a database.
- Whichever AI provider(s) you configured in `PANEL_PROVIDERS` receive the
  intake text you send them, under that provider's own data-handling terms
  -- this project has no visibility or control over that once the request
  leaves your server.
- You, the operator, can see every message your bot receives (this is how
  Telegram bots work, not specific to this project). Do not point this bot
  at a public group chat expecting private health information to stay
  private from you.
- Before intake text is sent to any AI provider, a local, regex-only PII
  pre-filter (`deidentify.cjs`) redacts likely email addresses, phone
  numbers, 8+-digit ID/health-card-style numbers, and probable full names
  (a Title-Case heuristic) from the copy that leaves your server --
  replacing them with placeholders like `[removed: possible phone number]`.
  It runs entirely in-process (no network or model call) and never touches
  what the patient sees. **It is best-effort, not a guarantee**: it will
  miss names at the start of a message, single-word names, non-Latin
  scripts, and oddly formatted identifiers, and it will occasionally redact
  harmless capitalized phrases. The emergency banner's instruction not to
  share identifying details remains the primary defense.

## File map

| File | Purpose |
| --- | --- |
| `index.cjs` | Entry point: startup gates, Telegram wiring, error boundary around `core/`. |
| `session.cjs` | Ephemeral in-memory per-chat session state, no persistence. |
| `intake.cjs` | Fixed follow-up question sequence; builds a schema-valid `IntakeAnswers`. |
| `safety-gate.cjs` | Hard-coded emergency banner + one-time operator consent gate. |
| `deidentify.cjs` | Local regex-only PII pre-filter applied to the copy of intake text sent to AI providers (see "Data handling" above for its limits). |
| `accept-consent.cjs` | Run once to record operator consent. |
| `faq.cjs` | Short FAQ block sent after each recommendation. |
| `strings.cjs` | Every user-facing string, keyed by locale -- the seam for future translation. |
| `config.cjs` | Builds `core/`'s `PanelConfig` from environment variables. |

## Known limitations (v1)

- The follow-up questions are a small, fixed, generic sequence (onset,
  severity, a red-flag screen, associated symptoms, coarse demographics),
  not the richer track-specific questioning `core/intake/` is expected to
  eventually own. `core/INTERFACE.md` explicitly allows a front-end to build
  `IntakeAnswers` directly like this.
- Only `en` strings are populated in `strings.cjs`; `t()` falls back to `en`
  for any other locale. No machine translation is implemented here by
  design -- see the design spec's note on prioritizing languages spoken in
  physician-scarce regions for a future translation pass.
- If a user's device sends a language other than English, replies are still
  in English until translations are added.
