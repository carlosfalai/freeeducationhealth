# RUNBOOK.md -- run this physician's practice paperwork today

This file is written for an AI coding agent (Claude Code, or any other
coding agent with shell + file access) that has just been asked something
like "run my practice's paperwork today" or "check Spruce and prepare my
cases." It assumes **no other context** -- everything you need to execute
this end-to-end is either in this file or in a file this file points you to.

Read this whole file before doing anything. Then follow "The daily loop"
below, in order, for each run.

## What this is and isn't

- This is **not** a headless server you start once and forget. You (the
  agent) drive it interactively, one run at a time, at the physician's
  request, the same way Claude Code drives any other task.
- `instanthpi/carousel/cards-server.cjs` can optionally run as a small local
  web server so the physician can review cards in a browser, but you do not
  need it running to build, read, or update cards -- they're just JSON
  files, and `cards-server.cjs`'s exported functions are plain
  `require()`-able library code.
- Nothing in this folder sends a message, sends a fax, or generates a
  patient-facing document without an explicit physician approval step.
  Never skip approval, even for a case that looks obviously low-risk.

## Hard rules (do not deviate)

1. **Never send a Spruce reply, fax, or generated PDF without the
   physician's explicit approval of that specific card.** "Looks fine"
   is not approval. Approval is either a card's `status` becoming
   `"approved"` (via the carousel UI or `approveCard()`) or the physician
   directly telling you in chat which card + which plan option + what
   final wording to send.
2. **The carousel server refuses to start without `CAROUSEL_PIN` set.**
   Do not try to work around this or hardcode a PIN into a file that gets
   committed. If it's unset, tell the physician to add it to `.env`.
3. **Never write real patient-identifying content into any file that is
   or could be committed to git.** Card JSON files, the Spruce handled
   tracker, and any generated PDFs live entirely under paths already
   listed in `instanthpi/.gitignore`. Do not add new file types containing
   patient content without also adding them to `.gitignore` first.
4. **If `recommendation.redFlags` is non-empty or `recommendation.divergenceFlag`
   is `true`, say so explicitly and prominently when presenting the card** --
   do not bury it in a details section, and do not draft a reply that omits
   the red-flag guidance from `suggestedNextSteps`.
5. **If `core/`'s panel returns fewer than the configured `panelSize`
   successful provider responses, `getRecommendation()` throws rather than
   silently downgrading.** Do not catch that error and proceed with a
   single-model answer -- surface the failure to the physician instead.
6. Guidance language must be genuinely actionable for someone who may have
   no doctor reachable nearby -- when drafting `suggestedNextSteps` content
   or reviewing what `core/` produced, this is the bar (see the design
   record, `docs/design-decisions.md`).

## One-time setup

Run these once per machine (skip any step already done):

```bash
cd instanthpi
npm install
cp .env.example .env
# then edit .env: fill in CAROUSEL_PIN, SPRUCE_API_TOKEN, SRFAX_* , at least
# two AI provider keys for core/, per the comments in .env.example
python -m pip install -r pdf/requirements.txt
```

Sanity-check each piece works before relying on it:

```bash
# Carousel server starts (Ctrl+C to stop; confirms CAROUSEL_PIN is set)
node carousel/cards-server.cjs

# Spruce credentials work and show today's actionable conversations
node spruce/client.cjs list

# PDF generation works end-to-end
node pdf/generate.cjs pdf/sample-referral.pdf

# PyMuPDF is installed and can read a PDF's form fields
python pdf/fill.py list-fields pdf/sample-referral.pdf
```

Do **not** run a real fax send during setup unless the physician explicitly
asks for a test fax to their own number -- `fax/send.cjs` sends a real fax
the moment it's called.

If `../core/index.js` does not exist yet in this checkout (i.e. `core/`
hasn't been implemented per `core/INTERFACE.md`), tell the physician that
before this runbook's "call core for a recommendation" step will work,
`core/` needs to exist and export `getRecommendation(intakeAnswers, config)`
matching `core/INTERFACE.md`. You can still exercise every other step
(Spruce read, card review UI, PDF, fax) independently in the meantime.

## HIPAA / compliance self-check

The physician can literally say to Claude Code (or whatever agent is
driving this runbook): **"run verify-hipaa and tell me if my setup is
compliant."** When asked that, run:

```bash
node verify-hipaa.cjs
```

from `instanthpi/`, and explain the report in plain language. It checks
everything that *can* be checked automatically: whether the current Claude
Code session itself is on the BAA-covered Bedrock path
(`CLAUDE_CODE_USE_BEDROCK` + `AWS_REGION` set) or the direct Anthropic API,
whether `instanthpi/.env` exists and is git-ignored (it never reads `.env`'s
contents), and whether the AI provider keys named in `.env.example` are
present as real, non-placeholder values in the environment. Exit code 0
means the automatable checks passed; non-zero means something needs fixing.

When explaining the results, be explicit about the part the script cannot
check and why: accepting the AWS Business Associate Addendum happens
manually in AWS Artifact, is a legal agreement only the physician's own
practice can accept, and AWS exposes no API to confirm it -- so a passing
run does **not** by itself mean "HIPAA compliant." Point the physician to
`docs/hipaa-bedrock-guide.md` for that step. Run this check before the
first real patient-data run on a new machine, and again whenever the
environment or Claude Code profile changes.

## The daily loop

Do these steps in order. Steps 1-4 you (the agent) do directly by reading
files/calling functions; step 5 requires physician input; steps 6-7 you do
directly again, gated on that input.

### 1. Find actionable Spruce conversations

```js
const spruce = require('./spruce/client.cjs');
const actionable = await spruce.listActionableConversations();
```

Each entry is `{ conversation, messages, lastMessage }`. `messages` is the
full ordered history for that conversation -- read it yourself for context,
the same way you'd read any other file, before drafting anything.

If `actionable.length === 0`, tell the physician the queue is empty and
stop here for this run.

### 2. Build `IntakeAnswers` for each conversation

For each actionable conversation, read `messages` and construct an
`IntakeAnswers` object matching `core/schema/intake.schema.json` --
`chiefComplaint`, `followUps` (question/answer pairs actually present in the
conversation, not invented ones), and any of the optional fields you can
responsibly infer (`ageRange` as a bracket, never an exact DOB; `locale`;
`jurisdiction` from the physician's own configured
`INSTANTHPI_JURISDICTION`). Leave `followUps` sparse rather than fabricating
answers the patient never gave.

**Do not put PHI-as-identity fields (name, phone, health-card/NAM number,
address) into `IntakeAnswers`** -- that object is what gets passed to
`core/`'s AI panel, and per `core/INTERFACE.md` those identity fields don't
belong there at all. Keep the patient's identity/contact info only in the
card's `source` (conversation id) and your own working context -- never in
`intakeAnswers` or `recommendation`.

### 3. Call `core/` for a recommendation

```js
const { getRecommendation } = require('../core');

const config = {
  providers: [
    { name: 'anthropic', model: 'claude-sonnet-5', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
    { name: 'deepseek', model: 'deepseek-chat', apiKeyEnvVar: 'DEEPSEEK_API_KEY' },
  ],
  panelSize: 2,
  personaStyle: 'generic',
  jurisdiction: process.env.INSTANTHPI_JURISDICTION || null,
};

const recommendation = await getRecommendation(intakeAnswers, config);
```

Adjust `providers`/`panelSize` to whatever the physician has actually
configured keys for in `.env` -- don't assume the exact list above.

### 4. Build a carousel card

```js
const { buildCardFromRecommendation } = require('./carousel/cards-server.cjs');

const card = buildCardFromRecommendation({
  source: {
    type: 'spruce',
    conversationId: conversation.id,
    lastInboundAt: lastMessage.createdAt,
  },
  intakeAnswers,
  recommendation,
  caseSummary: '...', // write this yourself from the conversation -- see below
  planOptions: [ /* see card-schema.md -- case-specific, don't hardcode */ ],
  draftReply: '...', // plain-language reply drafted from recommendation
});
```

Write `caseSummary` and `draftReply` yourself, using
`recommendation.plainLanguageSummary` and `recommendation.suggestedNextSteps`
as the clinical content, but phrased for this specific patient's actual
words and context -- don't just paste the recommendation object's fields
verbatim into the reply. `planOptions` should reflect what's actually
possible for this case (e.g. only offer a fax option if there's a real
destination fax number for a referral). See
`instanthpi/carousel/card-schema.md` for the full field reference and a
worked example, including how to order options when `redFlags` is
non-empty.

Repeat steps 2-4 for every actionable conversation before moving on --
prepare the whole batch, don't go one-by-one waiting for approval in
between (this also matches "batch-prepare, don't drip-feed" practice for
this kind of review queue).

### 5. Wait for physician approval

Two equally valid paths -- use whichever the physician prefers, and it's
fine for it to differ run to run:

**Path A -- web UI.** Tell the physician: "N cards are ready. Run
`npm run carousel` (or it's already running) and open
`http://localhost:4747` (or your configured `CAROUSEL_PORT`), enter your
PIN, and approve or dismiss each card." Then poll:

```js
const { listCards } = require('./carousel/cards-server.cjs');
const approved = listCards({ status: 'approved' });
```

**Path B -- direct chat instruction.** The physician tells you directly,
e.g. "approve card c_8f2a1e4b with option 2, keep the reply as drafted" or
"for c_91ab, use option 1 but change the reply to say X instead." In this
path you call `approveCard()` yourself on their explicit instruction:

```js
const { approveCard } = require('./carousel/cards-server.cjs');
approveCard('c_8f2a1e4b', {
  chosenPlanOption: 2,
  editedReply: null, // or the physician's replacement text
  decidedBy: 'physician-chat',
});
```

Either way, do not proceed to execution for a card until its `status` is
`"approved"`. If the physician wants to skip a case for now, that's
`dismissCard(id, { decidedBy, note })`, not silence.

### 6. Execute each approved card

```js
const fs = require('fs');
const path = require('path');
const { readCard, resolveReplyText, markSent } = require('./carousel/cards-server.cjs');
const spruce = require('./spruce/client.cjs');
const { generateReferralLetter } = require('./pdf/generate.cjs');
const { sendFax } = require('./fax/send.cjs');

const card = readCard(id);
const chosen = card.planOptions.find(
  (o) => o.number === card.decision.chosenPlanOption,
);

// Send NOTHING unless the approved card carries an explicit, automatable
// action. `"none"` means the physician handles it outside this tool (see
// card-schema.md), and a card approved without a selected plan option gets
// the same treatment: record it as handled and move on -- do NOT default
// to messaging the patient.
if (!chosen || !chosen.action || chosen.action.type === 'none') {
  spruce.markHandled(card.source.conversationId, {
    lastInboundAt: card.source.lastInboundAt,
    decidedBy: card.decision.decidedBy,
  });
  markSent(card.id, { sentVia: 'none', faxResult: null, pdfPath: null });
  return; // next card
}

const action = chosen.action;
const replyText = resolveReplyText(card); // prefers decision.editedReply if set

await spruce.sendMessage(card.source.conversationId, replyText);

let pdfPath = null;
let faxResult = null;

if (action.type === 'spruce_reply_and_pdf' || action.type === 'spruce_reply_and_fax') {
  pdfPath = `./pdf/generated/${card.id}.pdf`; // gitignored via *.pdf
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true }); // generate.cjs does not create dirs
  await generateReferralLetter(pdfPath, action.pdfValues || {});
}

if (action.type === 'spruce_reply_and_fax') {
  faxResult = await sendFax({ toFaxNumber: action.faxNumber, filePath: pdfPath });
}

spruce.markHandled(card.source.conversationId, {
  lastInboundAt: card.source.lastInboundAt,
  decidedBy: card.decision.decidedBy,
});

markSent(card.id, { sentVia: 'spruce', faxResult, pdfPath });
```

If a form needs filling on an *existing* blank PDF (e.g. an insurer form or
a lab requisition template) rather than a from-scratch letter, use
`pdf/fill.py` instead of `pdf/generate.cjs` -- see its module docstring for
the `list-fields` / `fill` CLI, and never pass a real signature image path
that lives inside this repo.

### 7. Report back

After working through the batch, tell the physician plainly: how many
conversations were actionable, how many cards were approved/dismissed, what
was actually sent/faxed, and anything that failed (a `core/` panel error, a
Spruce send failure, a missing fax number) -- don't silently retry a failure
in a loop; surface it.

## Troubleshooting

- **"CAROUSEL_PIN is not set"** -- add it to `instanthpi/.env`; this error
  is intentional (see Hard rules).
- **Spruce API errors (401/403/404 or unexpected field names)** -- check
  `SPRUCE_API_TOKEN` first, then see the `ADAPT-ME` notes at the top of
  `spruce/client.cjs`; your account's actual endpoint paths or response
  field names may differ from the assumed defaults, in which case update
  the small number of marked spots in that file, not the calling code.
- **SRFax `Queue_Fax` fails** -- check `SRFAX_ACCESS_ID`/`SRFAX_PWD` first;
  SRFax's error payload (surfaced verbatim in the thrown error) usually
  states the specific problem (bad number format, insufficient balance,
  etc).
- **`getRecommendation` throws "fewer than panelSize providers succeeded"**
  -- check that each configured provider's API key env var is actually set
  and valid; don't work around this by lowering `panelSize` to 1, since a
  single-model answer with no divergence check is exactly what the panel
  design exists to avoid (see the root design spec's "why a multi-AI panel
  is structural, not optional").
- **PyMuPDF import error** -- `python -m pip install -r pdf/requirements.txt`.

## File map

```
instanthpi/
  RUNBOOK.md              <- this file
  package.json            <- npm deps: express, cookie-parser, dotenv, pdf-lib
  .env.example            <- copy to .env and fill in your own credentials
  verify-hipaa.cjs        <- HIPAA/compliance self-check (see section above)
  carousel/
    cards-server.cjs       <- card store (library) + PIN-gated review server
    card-schema.md          <- card JSON shape, full worked example
    cards/                  <- one JSON file per card (gitignored)
  spruce/
    client.cjs              <- Spruce REST client + actionable-message rule
    .handled.json           <- local handled-state tracker (gitignored)
  fax/
    send.cjs                <- SRFax outbound client (Queue_Fax, Get_FaxStatus)
  pdf/
    generate.cjs             <- new fillable PDF from scratch (pdf-lib)
    fill.py                  <- fill an existing PDF's AcroForm fields (fitz)
    requirements.txt          <- Python deps for fill.py
  inviter/
    README.md                <- phase 2 / optional, not built here
```
