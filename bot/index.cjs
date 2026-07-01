#!/usr/bin/env node
'use strict';

/**
 * Patient-facing Telegram front-end for FreeEducationHealth.
 *
 * Entry point. Wires grammy's Telegram bot to the fixed intake flow
 * (intake.cjs), ephemeral session state (session.cjs), and core/'s
 * getRecommendation() contract (core/INTERFACE.md). Every reply is rendered
 * through strings.cjs so a real translation layer can slot in later without
 * touching this file's control flow.
 *
 * Run `node bot/accept-consent.cjs` once before the first `node bot/index.cjs`.
 */

require('dotenv').config();
const { Bot } = require('grammy');

const { assertOperatorConsent } = require('./safety-gate.cjs');
const { t } = require('./strings.cjs');
const { getFaqBlock } = require('./faq.cjs');
const { buildPanelConfigFromEnv } = require('./config.cjs');
const session = require('./session.cjs');
const intake = require('./intake.cjs');

// --- Startup gates ---------------------------------------------------------
// Order matters: consent is checked before touching Telegram or any
// provider credentials, so a misconfigured/unconsented install never even
// starts polling.

try {
  assertOperatorConsent();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error(
    'BOT_TOKEN is not set. Copy bot/.env.example to bot/.env, add your token from @BotFather, and try again.'
  );
  process.exit(1);
}

let panelConfig;
try {
  panelConfig = buildPanelConfigFromEnv(process.env);
} catch (err) {
  console.error(`Panel configuration error: ${err.message}`);
  process.exit(1);
}

// core/ is the documented contract this front-end is built against (see
// core/INTERFACE.md), not any particular implementation of it. If
// core/index.cjs isn't available yet, the bot still starts -- so the
// conversation flow and safety gates can be exercised on their own -- but
// recommendation requests fail with a clear, non-alarming message until
// core/ is implemented.
let getRecommendation = null;
try {
  ({ getRecommendation } = require('../core/index.cjs'));
} catch (err) {
  console.warn(
    'Warning: ../core/index.cjs is not available yet (or failed to load), so this bot ' +
      'cannot generate recommendations until it is. Conversation flow and safety gates ' +
      `still work. (${err.message})`
  );
}

// --- Telegram wiring ---------------------------------------------------

const bot = new Bot(BOT_TOKEN);

/**
 * Sends a localized string from strings.cjs. This is the one place that
 * turns a string key into an actual Telegram message -- swap in real
 * translation here later without touching any handler below.
 * @param {import('grammy').Context} ctx
 * @param {string} locale
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 */
async function say(ctx, locale, key, vars) {
  const text = t(locale, key, vars);
  if (text) await ctx.reply(text);
}

/**
 * Telegram gives a short language hint (e.g. "en", "fr"), not a guaranteed
 * full BCP-47 tag. Only "en" has content in strings.cjs today; t() falls
 * back to it for anything else, so this is safe to pass straight through.
 * @param {import('grammy').Context} ctx
 * @returns {string}
 */
function localeFromCtx(ctx) {
  return (ctx.from && ctx.from.language_code) || 'en';
}

/**
 * Resets a chat's session, shows the fixed emergency banner (always, every
 * new topic -- this is not skippable), and asks the first question.
 * @param {import('grammy').Context} ctx
 */
async function startNewTopic(ctx) {
  const locale = localeFromCtx(ctx);
  const s = session.resetSession(ctx.chat.id, locale);
  await say(ctx, locale, 'emergencyBanner');
  s.stage = session.STAGES.AWAITING_CHIEF_COMPLAINT;
  await say(ctx, locale, 'askChiefComplaint');
}

/**
 * Renders a RecommendationObject (core/schema/recommendation.schema.json)
 * as plain text. Deliberately never renders `billingSuggestions` -- that
 * field is for physician-facing front-ends only, per the schema's own
 * description ("Never presented to the patient").
 * @param {import('grammy').Context} ctx
 * @param {string} locale
 * @param {object} rec RecommendationObject
 */
async function sendRecommendation(ctx, locale, rec) {
  const lines = [t(locale, 'summaryHeader'), rec.plainLanguageSummary];

  if (Array.isArray(rec.redFlags) && rec.redFlags.length > 0) {
    lines.push('', t(locale, 'redFlagsHeader'));
    for (const flag of rec.redFlags) lines.push(`- ${flag}`);
  }

  if (Array.isArray(rec.considerations) && rec.considerations.length > 0) {
    lines.push('', t(locale, 'considerationsHeader'));
    for (const c of rec.considerations) {
      const pct = Math.round((c.confidence || 0) * 100);
      lines.push(`- ${c.text} (~${pct}%)`);
    }
  }

  if (Array.isArray(rec.suggestedNextSteps) && rec.suggestedNextSteps.length > 0) {
    lines.push('', t(locale, 'nextStepsHeader'));
    rec.suggestedNextSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  if (rec.divergenceFlag) {
    lines.push('', t(locale, 'divergenceWarning'));
  }

  await ctx.reply(lines.join('\n'));
}

/**
 * Builds IntakeAnswers from the completed session, calls core's
 * getRecommendation(), and replies with the result plus the FAQ block.
 * Any failure (core/ missing, a provider error, fewer than panelSize
 * responses) ends the session in DONE with an apologetic message rather
 * than a stack trace -- this function is the error boundary between
 * core/'s contract and the patient-facing chat.
 * @param {import('grammy').Context} ctx
 * @param {object} s session
 */
async function runRecommendation(ctx, s) {
  const locale = s.locale;
  await say(ctx, locale, 'processing');
  await ctx.replyWithChatAction('typing').catch(() => {});

  if (!getRecommendation) {
    await say(ctx, locale, 'errorCoreMissing');
    s.stage = session.STAGES.DONE;
    return;
  }

  const intakeAnswers = intake.buildIntakeAnswers(s);

  let recommendation;
  try {
    recommendation = await getRecommendation(intakeAnswers, panelConfig);
  } catch (err) {
    console.error(`getRecommendation failed for chat ${ctx.chat.id}:`, err);
    await say(ctx, locale, 'errorGeneric');
    s.stage = session.STAGES.DONE;
    return;
  }

  await sendRecommendation(ctx, locale, recommendation);
  await ctx.reply(getFaqBlock(locale));
  s.stage = session.STAGES.DONE;
  await say(ctx, locale, 'doneFollowUp');
}

bot.command('start', async (ctx) => {
  await startNewTopic(ctx);
});

// Plain long polling (bot.start() below) processes updates one at a time,
// in order -- unlike @grammyjs/runner's concurrent mode, it needs no
// sequentialize() middleware to keep this in-memory session Map safe. If
// this bot is ever migrated to the runner for higher throughput, add
// sequentialize() keyed by chat id first.
bot.on('message:text', async (ctx) => {
  const s = session.getSession(ctx.chat.id);

  switch (s.stage) {
    case session.STAGES.NEW: {
      await startNewTopic(ctx);
      return;
    }

    case session.STAGES.AWAITING_CHIEF_COMPLAINT: {
      intake.recordChiefComplaint(s, ctx.message.text);
      await say(ctx, s.locale, intake.nextQuestionKey(s));
      return;
    }

    case session.STAGES.ASKING_FOLLOWUPS: {
      intake.recordFollowUpAnswer(s, ctx.message.text);
      if (s.stage === session.STAGES.PROCESSING) {
        await runRecommendation(ctx, s);
      } else {
        await say(ctx, s.locale, intake.nextQuestionKey(s));
      }
      return;
    }

    case session.STAGES.PROCESSING: {
      await say(ctx, s.locale, 'stillProcessing');
      return;
    }

    case session.STAGES.DONE:
    default: {
      await say(ctx, s.locale, 'alreadyDonePrompt');
      return;
    }
  }
});

bot.catch((err) => {
  console.error('Unhandled bot error:', err);
});

// Periodic cleanup so a long-running process doesn't accumulate memory for
// chats that started a topic and never came back.
const sweepIntervalHandle = setInterval(() => {
  session.sweepStaleSessions();
}, 5 * 60 * 1000);
sweepIntervalHandle.unref();

async function shutdown(signal) {
  console.log(`Received ${signal}, stopping bot...`);
  clearInterval(sweepIntervalHandle);
  await bot.stop();
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

console.log('Starting FreeEducationHealth Telegram bot (long polling)...');
bot.start();

module.exports = { bot };
