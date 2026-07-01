'use strict';

/**
 * Hard-coded safety gates for bot/. Nothing in this file is configurable
 * via an environment variable or a config file an operator could edit --
 * that is the point of it. `bot/index.cjs` refuses to start until
 * `assertOperatorConsent()` passes.
 */

const fs = require('fs');
const path = require('path');
const { t } = require('./strings.cjs');

/**
 * Renders the fixed emergency / "not a doctor" banner. The banner TEXT
 * lives in strings.cjs (so it can eventually be translated per locale),
 * but the decision to show it at the start of every new chat, and the fact
 * that it cannot be disabled or edited by an operator's config, is fixed
 * here, not read from any env var.
 * @param {string} [locale]
 * @returns {string}
 */
function getEmergencyBanner(locale = 'en') {
  return t(locale, 'emergencyBanner');
}

const CONSENT_VERSION = 1;
const CONSENT_MARKER_PATH = path.join(__dirname, '.operator-consent.json');

const CONSENT_TEXT = `
FreeEducationHealth bot -- operator consent
============================================

Before this bot will start, you (the person running it) must explicitly
acknowledge the following:

  1. You can see all messages this bot receives. Telegram delivers every
     message sent to your bot directly to the server you run this code on;
     nothing about this project hides that from you.

  2. You are the data controller for those messages under your local law
     (e.g. under GDPR, PIPEDA, or your jurisdiction's equivalent), not the
     authors of this open-source project. Complying with whatever legal
     obligations that role carries where you operate is your
     responsibility.

  3. You must not misuse the data this bot receives -- including patient
     health information volunteered in chat. Do not sell it, do not use it
     for anything other than providing this tool's stated function, and
     secure the server you run it on appropriately.

This project ships no shared server and stores nothing on disk by default;
this consent step exists because self-hosting still makes YOU the operator
of a system that receives sensitive health information, and that
responsibility does not disappear just because the code is free.
`;

/** @returns {boolean} whether this install has recorded operator consent. */
function hasOperatorConsent() {
  try {
    const raw = fs.readFileSync(CONSENT_MARKER_PATH, 'utf8');
    const data = JSON.parse(raw);
    return !!(data && data.version === CONSENT_VERSION && data.acceptedAt);
  } catch {
    return false;
  }
}

/**
 * Writes the local marker file recording that the operator accepted the
 * consent text. Only `bot/accept-consent.cjs` should call this.
 * @returns {{ version: number, acceptedAt: string }}
 */
function recordOperatorConsent() {
  const record = { version: CONSENT_VERSION, acceptedAt: new Date().toISOString() };
  fs.writeFileSync(CONSENT_MARKER_PATH, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

/**
 * Throws if operator consent has not been recorded. Call this at the very
 * start of bot/index.cjs, before creating the Telegram bot.
 */
function assertOperatorConsent() {
  if (!hasOperatorConsent()) {
    throw new Error(
      'Operator consent has not been recorded for this install. ' +
        'Run "node bot/accept-consent.cjs" once, read the consent text, and accept it, ' +
        'then start the bot again. See bot/README.md.'
    );
  }
}

module.exports = {
  getEmergencyBanner,
  CONSENT_TEXT,
  CONSENT_VERSION,
  CONSENT_MARKER_PATH,
  hasOperatorConsent,
  recordOperatorConsent,
  assertOperatorConsent,
};
