'use strict';

/**
 * Single source of truth for every user-facing string the bot sends.
 *
 * Nothing else in bot/ should hardcode chat copy inline -- every reply goes
 * through `t(locale, key, vars)` so that adding a new language later means
 * adding a new top-level object here (e.g. `fr`, `sw`, `ht`), not hunting
 * through handler code. Only `en` is populated today; this module does not
 * implement translation, only the structure translation will slot into.
 *
 * @typedef {Record<string, string>} LocaleStrings
 */

/** @type {Record<string, LocaleStrings>} */
const STRINGS = {
  en: {
    simulationDisclaimer:
      'PLEASE READ FIRST -- THIS IS NOT A MEDICAL CONSULTATION.\n' +
      '\n' +
      'Despite whatever the AI tells you, this is NOT a medical consultation. ' +
      'The AI here is built to run a SIMULATION, so it will play the role of a ' +
      'clinician -- it may speak as if it is examining you, diagnosing you, or ' +
      'prescribing for you. It is not, and it cannot. The AI is also capable of ' +
      'making things up (hallucinating), so anything it says may simply be wrong. ' +
      'For that reason, do NOT treat this in any way as a replacement for seeing a ' +
      'real, licensed doctor or physician.\n' +
      '\n' +
      'Anyone with an AI can pretend to be a doctor and give you recommendations ' +
      'that sound just like these. This entire conversation and chatbot is for ' +
      'EDUCATIONAL PURPOSES ONLY. It does NOT and WILL NOT be reviewed by a real ' +
      'doctor or physician unless YOU take it to a doctor yourself and get it ' +
      'validated by them.',

    consentPrompt:
      'Before we begin: do you understand that this is an educational simulation, ' +
      'NOT real medical advice, and NOT a substitute for seeing a licensed doctor? ' +
      'Reply "I agree" to continue, or "no" (or anything else) to stop here.',
    consentDeclined:
      'No problem. This simulation will not continue. ' +
      'For any real health concern, please see a licensed doctor or physician, and ' +
      'if this is an emergency, seek in-person help immediately. ' +
      'Type /start if you change your mind and want to try the educational simulation.',
    consentReminder:
      'To use this educational simulation you first need to agree. ' +
      'Reply "I agree" to continue, or "no" to stop.',

    emergencyBanner:
      'This tool helps you prepare for a doctor visit: it organizes your symptoms, ' +
      'history, and questions into something you can bring to a consultation -- even ' +
      'if that visit is some time away. ' +
      'IMPORTANT: This is a health information tool, not a doctor. ' +
      'It cannot examine you, cannot diagnose you, and cannot replace medical care. ' +
      'If this is a medical emergency (e.g. severe difficulty breathing, chest pain, ' +
      'heavy bleeding, loss of consciousness, a severe injury), seek emergency help ' +
      'immediately through whatever means are available to you -- do not wait for a reply here. ' +
      'Please do not share identifying details in this chat -- your full name, phone number, ' +
      'health card/ID number, or exact home address are never needed to answer a health question here.',

    askChiefComplaint:
      "What's the main problem or symptom that's bothering you today? " +
      'Describe it in your own words.',
    askOnset:
      'When did this start, and has it been getting better, getting worse, or staying the same?',
    askSeverity:
      'On a scale of 1 to 10, how severe does it feel right now? ' +
      '(Reply with a number, or type "skip".)',
    askRedFlagScreen:
      'Right now, are you having any of the following: trouble breathing, ' +
      'chest pain, fainting or near-fainting, confusion, or heavy bleeding? (yes/no)',
    askAssociated:
      'Is anything else happening along with this? Describe any other symptoms, ' +
      'or type "none".',
    askAgeRange:
      'What is your approximate age range? ' +
      '(0-1, 2-11, 12-17, 18-39, 40-64, 65+, or type "skip")',
    askSex:
      "Biological sex, if you're comfortable sharing (male/female), or type \"skip\".",

    processing:
      "Thank you. I'm checking this with more than one independent AI reviewer " +
      'before responding -- this can take up to a minute. Please wait...',
    stillProcessing: "Still working on your previous answer -- one moment, please.",

    summaryHeader: 'In plain terms:',
    considerationsHeader: 'Possible considerations (not a diagnosis):',
    redFlagsHeader: 'URGENT -- watch for:',
    nextStepsHeader: 'What you can do next:',
    divergenceWarning:
      "Note: the independent AI reviewers who looked at this didn't fully agree " +
      'with each other. Treat the considerations above with extra caution, and ' +
      'seek in-person medical care if it is at all reachable.',

    errorCoreMissing:
      "This deployment's recommendation engine isn't wired up yet, so I can't " +
      'generate a recommendation right now. Please tell whoever is running this bot. ' +
      'If this is urgent, seek in-person medical help immediately.',
    errorGeneric:
      "Something went wrong while putting a recommendation together, and I don't " +
      'want to guess at an answer. Please try again in a moment. If this is urgent, ' +
      'seek in-person medical help immediately.',

    doneFollowUp:
      'That is everything for this topic. Type /start any time to go through this ' +
      'again for a new concern.',

    // Shown as the very LAST message, ONLY on deployments whose operator set
    // a DONATION_URL (their OWN donation link). Off by default -- the
    // open-source bot never asks for money unless an operator opts in. {{url}}
    // is the operator's configured link. Using the bot is always free.
    donationAsk:
      'One last thing -- would you like to help keep this free?\n' +
      '\n' +
      'This educational simulation costs money to run, and it stays free for ' +
      'anyone who needs it thanks to donations. If it helped you and you would ' +
      'like to chip in any amount, you can donate here:\n' +
      '{{url}}\n' +
      '\n' +
      'Thank you for your donations -- they are what keep this free and available ' +
      'to anyone using it. Using this bot is always free; a donation is completely ' +
      'optional.',

    // Shown BEFORE any case is submitted to the InstantHPI node network —
    // only relevant on deployments whose operator opted in to sharing.
    // Required by the network's listing rules: users of a sharing node must
    // be told up front, before their case leaves this bot.
    sharingDisclosure:
      'One more thing you should know: the person running this bot shares ' +
      'anonymized case summaries with a review network, where licensed ' +
      'physicians grade the quality of the AI’s answers. What is shared is a ' +
      'de-identified abstract only — your age range, the clinical picture, and ' +
      'what the AI concluded. Never your name, contact details, exact dates, ' +
      'or anything identifying. This grading happens after the fact and is ' +
      'about checking the AI — it is not a doctor reviewing your case or ' +
      'giving you care.',
    alreadyDonePrompt: 'This topic is finished. Type /start to ask about something new.',

    faqBlock:
      '\n---\n' +
      'About this bot\n' +
      '\n' +
      'What it is: a free, self-hosted helper for preparing a doctor visit. It asks\n' +
      'a few questions about a symptom and organizes your symptoms, history, and\n' +
      'questions into plain-language possibilities and next steps you can bring to a\n' +
      'consultation, checked by more than one independent AI reviewer -- useful even\n' +
      'where that visit may be a long way off.\n' +
      '\n' +
      "What it isn't: a doctor, a diagnosis, or a treatment plan. It cannot examine\n" +
      'you, order tests, or prescribe anything, and it is not a standalone source of\n' +
      'diagnosis. In an emergency, seek in-person help immediately rather than\n' +
      'waiting on this bot.\n' +
      '\n' +
      'A caution about "doctors" online: some people falsely claim to be licensed\n' +
      'physicians -- with real-sounding or fabricated credentials -- while simply\n' +
      'passing along AI output without genuinely reviewing it themselves. If someone\n' +
      'presents medical advice as physician-reviewed, verify their credentials\n' +
      'independently where possible (many jurisdictions publish a free public\n' +
      'register of licensed physicians you can check by name).\n' +
      '\n' +
      'How it works: your answers are sent to the AI provider(s) this bot operator\n' +
      'configured, which independently review the case; the combined result is\n' +
      'shown to you, with any disagreement between reviewers flagged rather than\n' +
      'hidden.\n' +
      '\n' +
      'Data privacy: this bot keeps no permanent record of your conversation --\n' +
      'session state lives only in memory while the bot process is running and is\n' +
      'lost on restart. The person operating this bot can see the messages it\n' +
      "receives (Telegram delivers them to the bot operator's server), and whichever\n" +
      "AI provider they configured processes your answers under that provider's own\n" +
      'data-handling terms.',
  },
};

const DEFAULT_LOCALE = 'en';

/**
 * Looks up a user-facing string by key, falling back to the default locale
 * (and then to the key itself) if the requested locale or key is missing.
 * Supports simple `{{name}}` interpolation via `vars`.
 *
 * @param {string} locale BCP-47 locale tag, e.g. "en", "fr-CA".
 * @param {string} key String key from the STRINGS table.
 * @param {Record<string, string|number>} [vars] Optional interpolation values.
 * @returns {string}
 */
function t(locale, key, vars) {
  const table = STRINGS[locale] || STRINGS[DEFAULT_LOCALE];
  let text = (table && table[key]) || (STRINGS[DEFAULT_LOCALE] && STRINGS[DEFAULT_LOCALE][key]) || '';
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{{${name}}}`).join(String(value));
    }
  }
  return text;
}

module.exports = { STRINGS, DEFAULT_LOCALE, t };
