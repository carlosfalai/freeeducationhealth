#!/usr/bin/env node
'use strict';

/**
 * One-time operator consent script. Run manually:
 *
 *   node bot/accept-consent.cjs
 *
 * Prints the consent text from safety-gate.cjs, requires the operator to
 * type the exact confirmation phrase, and writes a local marker file
 * (safety-gate.cjs's CONSENT_MARKER_PATH) on success. bot/index.cjs refuses
 * to start until this marker file exists and matches the current consent
 * version.
 */

const readline = require('readline');
const {
  CONSENT_TEXT,
  CONSENT_MARKER_PATH,
  hasOperatorConsent,
  recordOperatorConsent,
} = require('./safety-gate.cjs');

const CONFIRMATION_PHRASE = 'I ACCEPT';

async function main() {
  if (hasOperatorConsent()) {
    console.log(`Operator consent was already recorded (${CONSENT_MARKER_PATH}). Nothing to do.`);
    return;
  }

  console.log(CONSENT_TEXT);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`\nType "${CONFIRMATION_PHRASE}" to confirm, or anything else to cancel: `, resolve);
  });
  rl.close();

  if (answer.trim() === CONFIRMATION_PHRASE) {
    const record = recordOperatorConsent();
    console.log(`\nConsent recorded at ${record.acceptedAt} (${CONSENT_MARKER_PATH}).`);
    console.log('You can now run: node bot/index.cjs');
  } else {
    console.log('\nConsent not recorded. The bot will refuse to start until you run this script again and type the exact phrase.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('accept-consent failed:', err);
  process.exitCode = 1;
});
