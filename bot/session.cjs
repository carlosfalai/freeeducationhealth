'use strict';

/**
 * Ephemeral, in-memory per-chat session state.
 *
 * Deliberately NOT persisted anywhere: no database, no disk file, no
 * external store. State lives only in this process's memory for as long as
 * the bot is running, and is lost on restart -- this is a stated privacy
 * property of bot/ (see bot/README.md and the FAQ block in strings.cjs),
 * not an oversight.
 */

/** @enum {string} */
const STAGES = Object.freeze({
  /** Session created but the chat has not sent a first message/`/start` yet. */
  NEW: 'NEW',
  /** Waiting for the patient to describe their chief complaint. */
  AWAITING_CHIEF_COMPLAINT: 'AWAITING_CHIEF_COMPLAINT',
  /** Working through the fixed follow-up question sequence (see intake.cjs). */
  ASKING_FOLLOWUPS: 'ASKING_FOLLOWUPS',
  /** Follow-ups complete, a getRecommendation() call is in flight. */
  PROCESSING: 'PROCESSING',
  /** Recommendation delivered; session idle until /start begins a new topic. */
  DONE: 'DONE',
});

/** @type {Map<number, object>} chat id -> session state */
const sessions = new Map();

const DEFAULT_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity

/**
 * @param {string} [locale]
 * @returns {object} a fresh session object in the NEW stage.
 */
function createSession(locale) {
  const now = Date.now();
  return {
    stage: STAGES.NEW,
    locale: locale || 'en',
    chiefComplaint: null,
    onsetAndDuration: null,
    followUps: [],
    followUpIndex: 0,
    ageRange: null,
    sex: null,
    freeTextNotes: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Returns the session for a chat id, creating one in the NEW stage if none
 * exists yet.
 * @param {number} chatId
 */
function getSession(chatId) {
  let s = sessions.get(chatId);
  if (!s) {
    s = createSession();
    sessions.set(chatId, s);
  }
  return s;
}

/**
 * Replaces whatever session existed for a chat with a brand-new one. Used
 * at the start of every new topic (`/start` or a chat's first message).
 * @param {number} chatId
 * @param {string} [locale]
 */
function resetSession(chatId, locale) {
  const s = createSession(locale);
  sessions.set(chatId, s);
  return s;
}

/** Marks a session as recently active; call after mutating it. */
function touch(session) {
  session.updatedAt = Date.now();
  return session;
}

/** @param {number} chatId */
function clearSession(chatId) {
  sessions.delete(chatId);
}

/**
 * Removes sessions that have been inactive longer than maxAgeMs. Intended
 * to be called periodically (e.g. from a setInterval in bot/index.cjs) so a
 * long-running process doesn't accumulate memory for chats that never
 * finished a topic.
 * @param {number} [maxAgeMs]
 * @returns {number} how many sessions were removed.
 */
function sweepStaleSessions(maxAgeMs = DEFAULT_SESSION_TTL_MS) {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const [chatId, s] of sessions) {
    if (s.updatedAt < cutoff) {
      sessions.delete(chatId);
      removed += 1;
    }
  }
  return removed;
}

/** @returns {number} current number of tracked sessions (for diagnostics/tests). */
function sessionCount() {
  return sessions.size;
}

module.exports = {
  STAGES,
  getSession,
  resetSession,
  touch,
  clearSession,
  sweepStaleSessions,
  sessionCount,
  DEFAULT_SESSION_TTL_MS,
};
