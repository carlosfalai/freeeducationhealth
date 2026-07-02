# kiosk/ &mdash; waiting-room intake kiosk

Free, self-hosted front-end that turns any tablet, iPad, or phone browser at
a clinic reception into a walk-in intake kiosk. No app install, no patient
login or account &mdash; a patient walks up, answers seven large-touch-target
questions (the same chief-complaint + targeted-question flow as the
[`bot/`](../bot/README.md) Telegram intake), and is told:

> Thank you, please have a seat &mdash; your doctor will have this ready when
> you're called.

Behind the scenes the server reshapes the answers into the
[`core/` intake contract](../core/INTERFACE.md), runs `core/`'s independent
AI panel (`getRecommendation()`), and &mdash; instead of showing the result
to the patient &mdash; files it as a new **pending card in the same card
store `instanthpi/carousel` uses**
(see [`../instanthpi/carousel/card-schema.md`](../instanthpi/carousel/card-schema.md)).
A physician reviewing their carousel queue sees kiosk-submitted patients
alongside Spruce-submitted ones, with the panel's considerations, red flags,
suggested next steps, and a pre-drafted set of patient-facing talking points
ready before the patient is called in.

## How the card store is shared

`instanthpi/carousel/cards-server.cjs` locates its store **relative to its
own file** &mdash; one JSON file per card under
`instanthpi/carousel/cards/`. There is no `CARD_STORE_PATH` environment
variable to configure; the store directory always rides along with the
module.

So the kiosk shares the store the same way any trusted local script does: it
`require()`s that exact module (`../instanthpi/carousel/cards-server.cjs`)
and calls its exported `createCard()`. Same module, same `cards/` directory,
same queue &mdash; nothing to point anywhere when kiosk and carousel run
from the same checkout of this repo (the normal case).

If your kiosk runs from a **different checkout** than the carousel the
physician reviews, set `KIOSK_CARD_STORE_MODULE` to the absolute path of
that checkout's `cards-server.cjs`:

```
KIOSK_CARD_STORE_MODULE=/srv/freeeducationhealth/instanthpi/carousel/cards-server.cjs
```

Note: requiring `cards-server.cjs` does **not** start its HTTP server and
does not need `npm install` inside `instanthpi/` &mdash; the card-store
functions are plain Node file I/O. You only need `instanthpi/`'s install (and
its mandatory `CAROUSEL_PIN`) when the physician actually opens the review
UI, which is a separate process on their own machine.

## Setup

1. Install `core/` and the kiosk (each folder is its own Node project):

   ```bash
   cd core && npm install && cd ..
   cd kiosk && npm install
   ```

2. Edit [`panel.config.js`](./panel.config.js) to list the AI providers you
   actually hold keys for. Keep `panelSize >= 2` &mdash; independent-model
   consensus/divergence detection is the only check between the kiosk
   submission and the physician opening the card. Never paste a key value
   into that file; it only names environment variables.

3. Provide the environment variables, either in your shell or in a
   git-ignored `kiosk/.env` (loaded automatically):

   ```
   ANTHROPIC_API_KEY=your-key-here
   OPENAI_API_KEY=your-key-here
   # Optional:
   KIOSK_PORT=4646            # default 4646
   KIOSK_ID=front-desk-1      # label recorded in each card's source, default "kiosk-1"
   KIOSK_CARD_STORE_MODULE=   # only for split checkouts, see above
   ```

4. Start it:

   ```bash
   npm start
   ```

   The startup log prints exactly where cards are being filed &mdash; verify
   it says `.../instanthpi/carousel/cards` before putting the kiosk in front
   of patients.

5. On the reception tablet, open `http://<server-LAN-IP>:4646/` in the
   browser and leave it on the welcome screen. Use the tablet's kiosk
   affordances so patients stay on the page (iPad: Settings &rarr;
   Accessibility &rarr; Guided Access; Android: screen pinning or a kiosk
   browser). The page needs no internet access itself &mdash; only the
   server makes outbound AI provider calls.

6. Smoke-test before real use: submit a fake intake from the tablet
   (`Jane Example`-grade content only), then start the carousel
   (`cd instanthpi && npm install && npm run carousel`, with `CAROUSEL_PIN`
   set) and confirm the card appears in the pending queue with
   `source.type: "kiosk"`.

## What the patient sees, and what they never see

- Seven questions, one per screen: main problem, onset/course, severity
  1&ndash;10, an urgent-symptoms (red-flag) screen, other symptoms, age
  range, sex &mdash; every one after the first skippable. Wording matches
  `bot/strings.cjs` so kiosk and Telegram intakes read identically in the
  physician's queue.
- If they answer YES to the red-flag screen, the page immediately tells them
  to alert reception staff in person &mdash; it does not wait for any AI.
- After submitting: only the thank-you screen. The AI panel's output is
  **never** displayed on the kiosk; it goes to the physician's card queue.
  The API response is a bare `{ "ok": true }`.
- The screen clears itself 20 seconds after the thank-you, and wipes
  half-finished answers after 3 minutes of inactivity, so the next patient
  never sees the previous one's entries.

## Privacy and safety notes

- **No identity fields, by design.** The intake schema has nowhere to put a
  name, phone number, or health-card number, and the welcome screen tells
  patients not to type them &mdash; reception already has identity; the
  physician matches the card to the person they call in. Free-text fields
  are free text, though, so brief the front desk to reinforce this.
- **The kiosk endpoint is write-only.** It serves the intake page and
  accepts submissions; it cannot list, read, or return cards, so a patient
  poking at the tablet (or anything else on that network) cannot browse
  cases through it. Reading cards remains behind the carousel's mandatory
  PIN gate. Still, run this on the clinic's private network, not the open
  internet.
- **Panel failure never loses a patient.** If `core/` is missing, a provider
  key is bad, or fewer than `panelSize` models respond, the card is still
  filed &mdash; clearly marked `[AI PANEL UNAVAILABLE]`, with the raw intake
  answers and no fabricated guidance &mdash; and the patient is seated
  normally. The panel is never quietly shrunk below `panelSize` to force an
  answer.
- **Red flags float to the top.** If the panel raises red flags, or the
  patient answered YES to the red-flag screen, the card's option 1 is "See
  this patient ahead of the queue," per
  [`card-schema.md`](../instanthpi/carousel/card-schema.md)'s safety note.
- Like everything in this repo: no shared server, no monetization, no
  license fees. The AI keys, the hardware, and the data all belong to
  whoever runs the clinic.
