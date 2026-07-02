// FreeEducationHealth -- kiosk/ (waiting-room intake) server.
//
// Serves the static tablet intake page (index.html) and one API route:
//
//   POST /api/intake
//
// which takes the structured answers the kiosk page collected, reshapes them
// into core/schema/intake.schema.json, calls core/'s getRecommendation()
// (core/INTERFACE.md), and -- instead of showing the recommendation to the
// patient -- files it as a new "pending" card in the SAME card store
// instanthpi/carousel/cards-server.cjs uses. A physician reviewing their
// carousel queue sees kiosk-submitted patients alongside Spruce-submitted
// ones. The patient only ever sees "thank you, please have a seat."
//
// Design notes (see README.md for the full picture):
// - The endpoint is WRITE-ONLY. It never returns recommendation content,
//   never lists cards, and never reads a card back -- so an open tablet on
//   the waiting-room network cannot be used to browse anyone's case. Reading
//   cards stays behind the carousel's mandatory PIN gate.
// - If the AI panel fails (missing keys, provider outage, fewer than
//   panelSize successes), the intake is NOT lost and is NOT silently
//   downgraded to a single-model answer: a card is still filed, clearly
//   marked "[AI PANEL UNAVAILABLE]", carrying the raw intake answers for the
//   physician to review manually. The patient in the waiting room is seated
//   either way.
'use strict';

const path = require('path');
const crypto = require('crypto');

// Optional .env (same pattern as instanthpi/): environment may also be set
// by the OS/shell, so a missing .env is not an error.
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (err) {
  // dotenv is a dependency (see package.json); if it's not installed yet
  // this just means env vars must already be set some other way.
}

const express = require('express');

// --- PanelConfig (see core/INTERFACE.md#panelconfig-shape) -----------------
let panelConfig;
try {
  panelConfig = require('./panel.config.js');
} catch (e) {
  console.warn(
    '[kiosk] Could not load panel.config.js (%s) -- using a minimal default. Copy/edit panel.config.js.',
    e.message,
  );
  panelConfig = { providers: [], panelSize: 2, personaStyle: 'generic', locale: 'en', jurisdiction: null };
}

// --- core/ ------------------------------------------------------------------
// Unlike epic/, there is deliberately NO mock-core fallback here: kiosk
// output lands in a real physician review queue, and a "[DEMO PLACEHOLDER]"
// recommendation in that queue would be worse than an honest
// panel-unavailable card. If core/ can't load, the kiosk still starts and
// still captures intakes -- every card is just marked panel-unavailable
// until core/ is installed and configured.
let getRecommendation = null;
let coreLoadError = null;
try {
  ({ getRecommendation } = require('../core'));
  if (typeof getRecommendation !== 'function') {
    throw new Error('../core did not export getRecommendation');
  }
} catch (e) {
  getRecommendation = null;
  coreLoadError = e;
  console.warn(
    '[kiosk] ../core is not available (%s) -- intakes will still be captured, but every card will be marked "[AI PANEL UNAVAILABLE]" until core/ is installed and configured.',
    e.message,
  );
}

// --- Card store --------------------------------------------------------------
// instanthpi/carousel/cards-server.cjs locates its store relative to its own
// file (instanthpi/carousel/cards/) -- there is no CARD_STORE_PATH env var to
// set. Sharing the store therefore means requiring the SAME module, which
// this does by default via the sibling path in this repo. If your kiosk runs
// from a different checkout than your carousel, point
// KIOSK_CARD_STORE_MODULE at that checkout's cards-server.cjs (absolute
// path); the store directory always rides along with the module.
//
// Requiring cards-server.cjs does not start its HTTP server and does not
// need instanthpi/'s npm install -- the card-store functions are plain
// fs/path/crypto file I/O (see the comment block at the top of that file).
const cardStoreModulePath =
  process.env.KIOSK_CARD_STORE_MODULE ||
  path.join(__dirname, '..', 'instanthpi', 'carousel', 'cards-server.cjs');

let cardStore;
try {
  cardStore = require(cardStoreModulePath);
  if (typeof cardStore.createCard !== 'function') {
    throw new Error('module does not export createCard()');
  }
} catch (e) {
  throw new Error(
    `[kiosk] Could not load the carousel card store from ${cardStoreModulePath} (${e.message}). ` +
      'The kiosk is useless without somewhere to file cards -- fix the path ' +
      '(or set KIOSK_CARD_STORE_MODULE to an absolute path to a ' +
      'cards-server.cjs) before starting. See kiosk/README.md.',
  );
}

// --- Intake validation/sanitization ------------------------------------------
// Light, front-door validation so malformed submissions fail fast at the
// kiosk instead of inside the panel. core/ still validates defensively
// against intake.schema.json before spending API calls.

const AGE_BRACKETS = ['0-1', '2-11', '12-17', '18-39', '40-64', '65+'];
const SEX_VALUES = ['male', 'female', 'unspecified'];
const MAX_FOLLOWUPS = 50;
const MAX_TEXT = 2000;
const MAX_QUESTION = 500;

function trimmedOrNull(value, max) {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/**
 * Reshape/validate the kiosk page's POST body into an IntakeAnswers object
 * (core/schema/intake.schema.json). Returns { intake, errors }.
 */
function buildIntake(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { intake: null, errors: ['Request body must be a JSON object.'] };
  }

  const chiefComplaint = trimmedOrNull(body.chiefComplaint, MAX_TEXT);
  if (!chiefComplaint) errors.push('chiefComplaint is required (non-empty string).');

  const rawFollowUps = Array.isArray(body.followUps) ? body.followUps : null;
  if (!rawFollowUps) errors.push('followUps is required (array of { question, answer, topic? }).');

  const followUps = [];
  if (rawFollowUps) {
    if (rawFollowUps.length > MAX_FOLLOWUPS) {
      errors.push(`followUps has too many entries (max ${MAX_FOLLOWUPS}).`);
    } else {
      for (const item of rawFollowUps) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push('Each followUps entry must be an object.');
          break;
        }
        const question = trimmedOrNull(item.question, MAX_QUESTION);
        if (!question) {
          errors.push('Each followUps entry needs a non-empty question string.');
          break;
        }
        let answer = item.answer;
        if (typeof answer === 'string') {
          answer = trimmedOrNull(answer, MAX_TEXT); // '' and whitespace -> null (skipped)
        } else if (typeof answer === 'number') {
          if (!Number.isFinite(answer)) answer = null;
        } else if (typeof answer !== 'boolean' && answer !== null && answer !== undefined) {
          errors.push('followUps answers must be a string, number, boolean, or null.');
          break;
        }
        followUps.push({
          question,
          answer: answer === undefined ? null : answer,
          topic: trimmedOrNull(item.topic, 100),
        });
      }
    }
  }

  const ageRange = AGE_BRACKETS.includes(body.ageRange) ? body.ageRange : null;
  const sex = SEX_VALUES.includes(body.sex) ? body.sex : null;
  const locale =
    typeof body.locale === 'string' && /^[A-Za-z0-9-]{2,20}$/.test(body.locale)
      ? body.locale
      : panelConfig.locale || 'en';

  if (errors.length) return { intake: null, errors };

  return {
    intake: {
      intakeId: crypto.randomUUID(),
      locale,
      chiefComplaint,
      onsetAndDuration: trimmedOrNull(body.onsetAndDuration, MAX_TEXT),
      followUps,
      freeTextNotes: trimmedOrNull(body.freeTextNotes, MAX_TEXT),
      ageRange,
      sex,
    },
    errors: [],
  };
}

// --- Card assembly ------------------------------------------------------------
// See instanthpi/carousel/card-schema.md for the exact card shape. This only
// assembles the envelope deterministically from the intake + the panel's own
// output -- it does not invent clinical content.

function panelUnavailableRecommendation(reason) {
  // Schema-valid RecommendationObject (core/schema/recommendation.schema.json)
  // that plainly states no AI guidance exists. Deliberately empty
  // considerations/redFlags/nextSteps: fabricating any of those here would be
  // exactly the silent-downgrade CLAUDE.md forbids.
  return {
    considerations: [],
    divergenceFlag: false,
    redFlags: [],
    suggestedNextSteps: [],
    plainLanguageSummary:
      'AI panel unavailable when this kiosk intake was submitted ' +
      `(${reason}). No AI-generated guidance exists for this case -- ` +
      'review the raw intake answers on this card directly.',
    billingSuggestions: null,
    panelMeta: null,
  };
}

function patientFlaggedRedFlagYes(intake) {
  return intake.followUps.some((f) => f.topic === 'red-flag-screen' && f.answer === true);
}

function buildCaseSummary(intake, { panelOk, flaggedYes }) {
  const bits = [];
  if (!panelOk) bits.push('[AI PANEL UNAVAILABLE -- raw intake only]');
  if (flaggedYes) bits.push('[PATIENT ANSWERED YES TO THE RED-FLAG SCREEN]');
  const demo = [intake.ageRange, intake.sex && intake.sex !== 'unspecified' ? intake.sex : null]
    .filter(Boolean)
    .join(', ');
  bits.push(`Walk-in kiosk intake${demo ? ` (${demo})` : ''}: ${intake.chiefComplaint}`);
  if (intake.onsetAndDuration) bits.push(`Onset/course: ${intake.onsetAndDuration}.`);
  return bits.join(' ');
}

function buildPlanOptions({ recommendation, flaggedYes }) {
  // Kiosk patients are physically present, so there is no messaging channel
  // to execute -- every option is action type "none" (physician handles it at
  // the visit; see card-schema.md's action.type notes). Per card-schema.md,
  // when red flags exist the urgent option must be option 1, not buried.
  const urgent = (recommendation.redFlags || []).length > 0 || flaggedYes;
  const options = [];
  let n = 1;
  if (urgent) {
    const why = [
      ...(flaggedYes ? ['patient answered yes to the red-flag screen'] : []),
      ...(recommendation.redFlags || []),
    ].join('; ');
    options.push({
      number: n++,
      label: 'See this patient ahead of the queue',
      description: `Urgent findings raised: ${why}. Assess in person now rather than in arrival order.`,
      action: { type: 'none' },
    });
  }
  options.push({
    number: n++,
    label: 'Review at the visit',
    description:
      'Use this card as visit preparation; go over the considerations and next steps with the patient in the room.',
    action: { type: 'none' },
  });
  return options;
}

function buildDraftReply(recommendation, panelOk) {
  if (!panelOk) {
    return (
      'No draft was generated -- the AI panel was unavailable when this ' +
      'kiosk intake was captured. Review the intake answers on this card ' +
      'and advise the patient directly at the visit.'
    );
  }
  // The patient is in the waiting room, so this "reply" is never sent over a
  // channel -- it is the panel's own patient-facing wording, assembled as
  // talking points the physician can edit, read out, or hand over.
  const lines = [recommendation.plainLanguageSummary];
  const steps = recommendation.suggestedNextSteps || [];
  if (steps.length) {
    lines.push('');
    steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  return lines.join('\n');
}

function buildKioskCard({ intake, recommendation, panelError }) {
  const panelOk = !panelError;
  const rec = panelOk
    ? recommendation
    : panelUnavailableRecommendation(String((panelError && panelError.message) || panelError));
  const flaggedYes = patientFlaggedRedFlagYes(intake);
  const now = new Date().toISOString();
  return {
    source: {
      type: 'kiosk',
      kioskId: process.env.KIOSK_ID || 'kiosk-1',
      // Mirrors card-schema.md's source.lastInboundAt convention: the moment
      // of the patient's submission is their "last inbound message".
      lastInboundAt: now,
    },
    caseSummary: buildCaseSummary(intake, { panelOk, flaggedYes }),
    intakeAnswers: intake,
    recommendation: rec,
    planOptions: buildPlanOptions({ recommendation: rec, flaggedYes }),
    draftReply: buildDraftReply(rec, panelOk),
  };
}

// --- Express app ---------------------------------------------------------------

const app = express();
app.use(express.json({ limit: '128kb' }));

// Serve only the specific static file this front-end needs -- deliberately
// NOT express.static(__dirname), which would also publish server.cjs,
// panel.config.js, package.json, and README.md over HTTP.
const INDEX_FILE = path.join(__dirname, 'index.html');
app.get('/', (req, res) => res.sendFile(INDEX_FILE));
app.get('/index.html', (req, res) => res.sendFile(INDEX_FILE));

app.get('/health', (req, res) => res.json({ ok: true }));

// Very small per-IP submission throttle: one intake is one POST, and a
// single kiosk device realistically produces at most a few per minute, so
// this only exists to blunt scripted abuse of an unauthenticated endpoint.
const submissions = new Map(); // ip -> { count, windowStart }
const SUBMIT_WINDOW_MS = 10 * 60 * 1000;
const SUBMIT_MAX_PER_WINDOW = 30;

function tooManySubmissions(ip) {
  const now = Date.now();
  const entry = submissions.get(ip);
  if (!entry || now - entry.windowStart > SUBMIT_WINDOW_MS) {
    submissions.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > SUBMIT_MAX_PER_WINDOW;
}

app.post('/api/intake', async (req, res) => {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  if (tooManySubmissions(ip)) {
    return res.status(429).json({ error: 'Too many submissions -- wait a moment and try again.' });
  }

  const { intake, errors } = buildIntake(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  let recommendation = null;
  let panelError = null;
  if (getRecommendation) {
    try {
      recommendation = await getRecommendation(intake, panelConfig);
    } catch (e) {
      // Do NOT retry with a smaller panel or a single model -- CLAUDE.md
      // forbids downgrading below panelSize. The failure is surfaced to the
      // physician on the card instead.
      panelError = e;
      console.error('[kiosk] AI panel failed for intake %s: %s', intake.intakeId, e.message);
    }
  } else {
    panelError = coreLoadError || new Error('core/ is not installed/available');
  }

  let card;
  try {
    card = cardStore.createCard(buildKioskCard({ intake, recommendation, panelError }));
  } catch (e) {
    console.error('[kiosk] Failed to write card for intake %s: %s', intake.intakeId, e.message);
    return res.status(500).json({
      error: 'The kiosk could not save this check-in. Please tell the reception staff.',
    });
  }

  console.log(
    '[kiosk] Filed card %s (intake %s, panel %s)',
    card.id,
    intake.intakeId,
    panelError ? 'UNAVAILABLE' : 'ok',
  );

  // Deliberately minimal: no recommendation content, no red flags, no card
  // body ever goes back to the waiting-room device.
  res.status(201).json({ ok: true });
});

// JSON body parse errors (and anything else) -> JSON, never an HTML stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err && err.type === 'entity.parse.failed' ? 400 : err.status || 500;
  res.status(status).json({ error: status === 400 ? 'Invalid JSON body.' : 'Internal error.' });
});

module.exports = { app, buildIntake, buildKioskCard };

if (require.main === module) {
  const PORT = Number(process.env.KIOSK_PORT) || 4646;
  app.listen(PORT, () => {
    console.log(`FreeEducationHealth kiosk/ front-end: http://localhost:${PORT}/`);
    console.log(`Cards are filed to: ${cardStore.CARDS_DIR}`);
    console.log(
      getRecommendation
        ? `AI panel: core/ loaded (panelSize ${panelConfig.panelSize}, ${panelConfig.providers.length} provider(s) configured).`
        : 'AI panel: core/ NOT available -- cards will be marked "[AI PANEL UNAVAILABLE]".',
    );
    console.log(
      'Open this address in the tablet browser on the clinic network (see README.md).',
    );
  });
}
