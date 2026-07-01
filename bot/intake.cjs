'use strict';

/**
 * Minimal, fixed intake question flow that assembles a schema-valid
 * `IntakeAnswers` object (see core/schema/intake.schema.json) from chat
 * answers.
 *
 * core/INTERFACE.md is explicit that front-ends may construct
 * `IntakeAnswers` directly without using `core/intake/`'s own question
 * sequencing -- that module is expected to eventually own richer,
 * track-specific questioning. This is deliberately a small, generic MVP
 * sequence (onset, severity, a red-flag screen, associated symptoms, coarse
 * demographics), not a reimplementation of that future logic.
 */

const crypto = require('crypto');
const { STAGES, touch } = require('./session.cjs');
const { t } = require('./strings.cjs');

/**
 * @typedef {{ id: string, topic: string, promptKey: string, type: 'text'|'number'|'yesno' }} FollowUpQuestion
 */

/** @type {FollowUpQuestion[]} */
const FOLLOWUP_QUESTIONS = [
  { id: 'onset', topic: 'onset-duration', promptKey: 'askOnset', type: 'text' },
  { id: 'severity', topic: 'severity', promptKey: 'askSeverity', type: 'number' },
  { id: 'redFlagScreen', topic: 'red-flag-screen', promptKey: 'askRedFlagScreen', type: 'yesno' },
  { id: 'associated', topic: 'associated-symptoms', promptKey: 'askAssociated', type: 'text' },
  { id: 'ageRange', topic: 'demographics', promptKey: 'askAgeRange', type: 'text' },
  { id: 'sex', topic: 'demographics', promptKey: 'askSex', type: 'text' },
];

const SKIP_WORDS = new Set(['skip', 'n/a', 'na', 'none', 'pass', '-']);

/**
 * Normalizes a raw text answer according to the question's declared type.
 * Returns `null` for skip words (matches the schema's "asked but
 * skipped/unknown/not applicable" meaning), otherwise a string, number, or
 * boolean. Falls back to the raw trimmed text if it doesn't cleanly parse,
 * rather than guessing.
 * @param {string} rawText
 * @param {FollowUpQuestion['type']} type
 * @returns {string|number|boolean|null}
 */
function coerceAnswer(rawText, type) {
  const text = String(rawText == null ? '' : rawText).trim();
  if (SKIP_WORDS.has(text.toLowerCase())) return null;
  if (text === '') return null;

  if (type === 'number') {
    const num = Number(text);
    return Number.isFinite(num) ? num : text;
  }

  if (type === 'yesno') {
    const lower = text.toLowerCase();
    if (['yes', 'y', 'oui'].includes(lower)) return true;
    if (['no', 'n', 'non'].includes(lower)) return false;
    return text;
  }

  return text;
}

/** @param {object} session @returns {FollowUpQuestion|null} */
function currentQuestion(session) {
  return FOLLOWUP_QUESTIONS[session.followUpIndex] || null;
}

/**
 * @param {object} session
 * @returns {string|null} the strings.cjs key for the next prompt to send, or
 *   null once the follow-up sequence is complete.
 */
function nextQuestionKey(session) {
  const q = currentQuestion(session);
  return q ? q.promptKey : null;
}

/**
 * Records the chief complaint and advances the session into the follow-up
 * question sequence.
 * @param {object} session
 * @param {string} rawText
 */
function recordChiefComplaint(session, rawText) {
  session.chiefComplaint = String(rawText || '').trim();
  session.stage = STAGES.ASKING_FOLLOWUPS;
  session.followUpIndex = 0;
  touch(session);
}

/**
 * Records the answer to the current follow-up question, appends it to
 * `session.followUps`, and advances to the next question -- or into the
 * PROCESSING stage if that was the last one.
 * @param {object} session
 * @param {string} rawText
 */
function recordFollowUpAnswer(session, rawText) {
  const question = currentQuestion(session);
  if (!question) return; // nothing left to record

  const answer = coerceAnswer(rawText, question.type);

  if (question.id === 'onset' && answer !== null) {
    session.onsetAndDuration = String(answer);
  } else if (question.id === 'ageRange' && answer !== null) {
    session.ageRange = String(answer);
  } else if (question.id === 'sex' && answer !== null) {
    const normalized = String(answer).toLowerCase();
    session.sex = normalized === 'male' || normalized === 'female' ? normalized : 'unspecified';
  }

  session.followUps.push({
    question: t(session.locale, question.promptKey),
    answer,
    topic: question.topic,
  });

  session.followUpIndex += 1;
  if (!currentQuestion(session)) {
    session.stage = STAGES.PROCESSING;
  }
  touch(session);
}

/** @param {object} session @returns {boolean} */
function isIntakeComplete(session) {
  return session.stage === STAGES.PROCESSING || session.stage === STAGES.DONE;
}

/**
 * Builds a schema-valid `IntakeAnswers` object (core/schema/intake.schema.json)
 * from accumulated session state. Never sets `jurisdiction` -- the
 * patient-facing bot omits it per core/INTERFACE.md, leaving billing-code
 * suggestions to physician-facing front-ends only.
 * @param {object} session
 * @returns {object} IntakeAnswers
 */
function buildIntakeAnswers(session) {
  return {
    intakeId: crypto.randomUUID(),
    locale: session.locale,
    chiefComplaint: session.chiefComplaint,
    onsetAndDuration: session.onsetAndDuration,
    followUps: session.followUps,
    ageRange: session.ageRange,
    sex: session.sex,
    freeTextNotes: session.freeTextNotes,
  };
}

module.exports = {
  FOLLOWUP_QUESTIONS,
  coerceAnswer,
  currentQuestion,
  nextQuestionKey,
  recordChiefComplaint,
  recordFollowUpAnswer,
  isIntakeComplete,
  buildIntakeAnswers,
};
