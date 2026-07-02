#!/usr/bin/env node
'use strict';

/**
 * Interactive first-run setup for the patient bot.
 *
 *   node bot/setup.cjs
 *
 * The whole point of this project's panel is that MORE THAN ONE independent
 * AI answers every case and they have to agree (an ordinary health chatbot
 * is one model answering alone). So this wizard's job is to help a
 * self-hoster wire up their OWN keys for two-or-more different AIs, then
 * write a valid bot/.env.
 *
 * It reflects one specific piece of guidance: if you drive this project
 * with Claude Code (or any coding agent that already gives you one AI
 * vendor), the panel should still be genuinely multi-vendor -- so this
 * wizard asks you to bring your OWN OpenAI (ChatGPT), Google Gemini, and
 * DeepSeek keys for the panel, which you get directly from each provider
 * and keep for yourself. Nothing here is shared or provided by this
 * project.
 *
 * This script:
 *   - never prints an API key back to the screen (key entry is echo-muted),
 *   - never transmits a key anywhere -- it only writes your local .env,
 *   - refuses to finish with fewer than 2 providers (panelSize >= 2 is a
 *     hard project rule),
 *   - will not clobber an existing .env without explicit confirmation.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_PATH = path.join(__dirname, '.env');

// Provider catalogue. `model` matches each adapter's DEFAULT_MODEL so the
// generated PANEL_PROVIDERS entry works with no further edits.
const PROVIDERS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    note: 'the low-cost default the free education bot already uses',
    model: 'deepseek-chat',
    envVar: 'DEEPSEEK_API_KEY',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    label: 'OpenAI (ChatGPT)',
    note: 'bring your own OpenAI API key',
    model: 'gpt-4o-mini',
    envVar: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    note: 'bring your own Google AI Studio key',
    model: 'gemini-2.5-flash',
    envVar: 'GEMINI_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    note: 'a Claude API key -- separate from a Claude Code subscription',
    model: 'claude-sonnet-5',
    envVar: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
];

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

async function askYesNo(rl, question, defaultYes = true) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  const a = (await ask(rl, question + suffix)).toLowerCase();
  if (!a) return defaultYes;
  return a === 'y' || a === 'yes';
}

/**
 * Ask for a secret with the terminal echo muted, so the key does not appear
 * on screen or in scrollback. Uses the canonical readline `_writeToOutput`
 * override: the prompt text is written synchronously by `rl.question`
 * BEFORE muting turns on, then every subsequent echoed keystroke is
 * suppressed. Works whether or not stdin is a TTY (when piped there is no
 * echo to suppress anyway, and crucially no competing `data` listener is
 * attached, so readline keeps reading the line normally).
 */
function askSecret(rl, question) {
  return new Promise((resolve) => {
    let muted = false;
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function (stringToWrite) {
      if (muted) return; // swallow echoed key characters
      originalWrite.call(rl, stringToWrite);
    };
    rl.question(question, (answer) => {
      rl._writeToOutput = originalWrite;
      if (rl.output && rl.output.isTTY) rl.output.write('\n');
      resolve(answer.trim());
    });
    muted = true; // prompt already written; mute everything typed after it
  });
}

function isPlaceholder(v) {
  if (!v) return true;
  const s = v.toLowerCase();
  return (
    s.includes('your-') ||
    s.includes('-here') ||
    s === 'changeme' ||
    s.startsWith('<') ||
    s.length < 8
  );
}

async function main() {
  console.log('');
  console.log('FreeEducationHealth -- patient bot setup');
  console.log('=========================================');
  console.log('');
  console.log('This bot never answers with a single AI. It runs a PANEL: two or');
  console.log('more independent AI models answer every case separately and have to');
  console.log('agree, and it tells the user when they disagree. That multi-AI');
  console.log('cross-check is the biggest difference from an ordinary health');
  console.log('chatbot, and it is why setup asks you for more than one key.');
  console.log('');
  console.log('Every key you enter is YOURS: you get it directly from each provider,');
  console.log('it is written only to your own bot/.env on this machine, and it is');
  console.log('never shown on screen or sent anywhere by this wizard.');
  console.log('');

  if (fs.existsSync(ENV_PATH)) {
    const rl0 = readline.createInterface({ input: process.stdin, output: process.stdout });
    const overwrite = await askYesNo(
      rl0,
      'A bot/.env already exists. Overwrite it (a timestamped backup is kept)?',
      false
    );
    rl0.close();
    if (!overwrite) {
      console.log('Left your existing bot/.env untouched. Nothing written.');
      return;
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // --- Coding agent question (steers the panel recommendation) ------------
  const usesClaudeCode = await askYesNo(
    rl,
    'Are you driving this project with Claude Code (or another AI coding agent)?'
  );
  if (usesClaudeCode) {
    console.log('');
    console.log('Good. Your coding agent gives you ONE AI vendor already. For a real');
    console.log('multi-vendor panel, bring your own keys for the OTHER providers below');
    console.log('-- ideally OpenAI (ChatGPT), Google Gemini, and DeepSeek -- so at');
    console.log('least two DIFFERENT companies cross-check each case. You get each key');
    console.log('yourself from the link shown; this project provides none of them.');
  } else {
    console.log('');
    console.log('No problem -- an agent is optional. You still need at least two AI');
    console.log('provider keys for the panel. DeepSeek is the low-cost default; add');
    console.log('OpenAI and/or Gemini for a stronger cross-check.');
  }
  console.log('');

  // --- Telegram token -----------------------------------------------------
  console.log('Telegram bot token -- get one free from @BotFather (https://t.me/BotFather -> /newbot).');
  const botToken = await askSecret(rl, 'Paste your Telegram bot token (hidden): ');
  console.log('');

  // --- Provider keys ------------------------------------------------------
  const chosen = [];
  for (const p of PROVIDERS) {
    const want = await askYesNo(
      rl,
      `Add ${p.label} (${p.note})? Key from ${p.keyUrl}`,
      p.id === 'deepseek' // default-yes only for the cheap default
    );
    if (!want) continue;
    let key = '';
    while (isPlaceholder(key)) {
      key = await askSecret(rl, `  Paste your ${p.label} key (hidden): `);
      if (isPlaceholder(key)) {
        const retry = await askYesNo(rl, '  That looks empty/placeholder. Try again?');
        if (!retry) {
          key = '';
          break;
        }
      }
    }
    if (key) chosen.push({ ...p, key });
  }

  rl.close();

  if (chosen.length < 2) {
    console.log('');
    console.log(`Only ${chosen.length} provider key entered. The panel needs at least 2`);
    console.log('independent AIs (this is a hard safety rule, not a setting). Re-run');
    console.log('node bot/setup.cjs when you have a second key. Nothing was written.');
    process.exitCode = 1;
    return;
  }

  // --- Assemble .env ------------------------------------------------------
  const panelProviders = chosen
    .map((p) => `${p.id}:${p.model}:${p.envVar}`)
    .join(',');
  // Consult up to 3 of the configured providers per case; require at least 2.
  const panelSize = Math.min(chosen.length, 3);

  const lines = [
    '# Generated by bot/setup.cjs. Your own credentials -- keep this file private.',
    '# .env is git-ignored so it can never be committed.',
    '',
    `BOT_TOKEN=${botToken}`,
    '',
    '# Multi-AI panel: every listed provider answers each case independently.',
    `PANEL_PROVIDERS=${panelProviders}`,
    `PANEL_SIZE=${panelSize}`,
    '',
    'PERSONA_STYLE=generic',
    'BOT_LOCALE=en',
    '',
    '# --- Provider credentials (one per provider you chose) ------------------',
    ...chosen.map((p) => `${p.envVar}=${p.key}`),
    '',
  ];

  if (fs.existsSync(ENV_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${ENV_PATH}.backup-${stamp}`;
    fs.copyFileSync(ENV_PATH, backup);
    console.log(`\nBacked up existing .env to ${path.basename(backup)}`);
  }

  fs.writeFileSync(ENV_PATH, lines.join('\n'), { mode: 0o600 });

  console.log('');
  console.log(`Wrote bot/.env with ${chosen.length} provider(s): ${chosen.map((p) => p.label).join(', ')}.`);
  console.log(`Panel size ${panelSize} -- that many independent AIs must answer for each recommendation.`);
  console.log('');
  console.log('Next:');
  console.log('  1. node bot/accept-consent.cjs   (one-time operator consent)');
  console.log('  2. node bot/index.cjs            (start the bot)');
  console.log('');
  console.log('Your keys are only in bot/.env on this machine. This wizard sent nothing anywhere.');
}

main().catch((err) => {
  console.error('setup failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
