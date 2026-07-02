'use strict';

/**
 * Local, regex-only PII pre-filter.
 *
 * This is a best-effort local scrub applied ONLY to the copy of the intake
 * text that leaves this process and is sent to whichever AI provider(s) the
 * operator configured in `PANEL_PROVIDERS` (see core/INTERFACE.md). It runs
 * entirely in-process: no network call, no model call, no dependency beyond
 * built-in regex. It is deliberately cheap and synchronous so it can sit
 * directly in front of every `getRecommendation()` call.
 *
 * IMPORTANT LIMITATIONS -- read before relying on this:
 *   - This is a best-effort local filter, NOT a guarantee. Regexes cannot
 *     reliably tell a name from an ordinary capitalized phrase, or a phone
 *     number from an unrelated numeric answer (e.g. a lab value or a date).
 *     Expect both false positives (harmless text redacted) and false
 *     negatives (real PII that slips through, e.g. a name in an unusual
 *     script, a nickname, or an ID number embedded oddly in a sentence).
 *   - The primary defense against PII ever entering a chat with this bot is
 *     the mandatory emergency banner sent at the start of every topic
 *     (see strings.cjs `emergencyBanner`, wired via safety-gate.cjs), which
 *     tells the patient not to share identifying details in the first
 *     place. This module is a second layer, not a replacement for that.
 *   - This module never mutates the objects it is given. It returns new,
 *     redacted copies. The original session state and the original
 *     IntakeAnswers object are left untouched, so nothing the bot might
 *     later echo back to the patient (their own chief complaint, answers,
 *     etc.) ever shows a "[removed: ...]" placeholder -- only the copy
 *     actually sent to `getRecommendation()` is redacted.
 *
 * What it redacts, and in what order (order matters -- each pass runs on
 * the output of the previous one, so an already-redacted placeholder is
 * never re-matched by a later pass):
 *   1. Email addresses.
 *   2. Phone numbers -- formatted (parens/dashes/dots/spaces, optional
 *      leading "+" country code, minimum 7 total digits so short clinical
 *      pairs like "40-64" or "120-80" survive) and common bare lengths
 *      (7-11 digits).
 *   3. Any remaining run of 8+ consecutive digits (e.g. a health-card/NAM
 *      number, an insurance ID, a long unformatted ID) that phone matching
 *      didn't already catch -- this also catches digits glued directly onto
 *      letters, e.g. the digit portion of "ABCD12345678".
 *   4. A lightweight heuristic for probable full names: two or more
 *      consecutive Title-Case words, not at the start of a sentence (plain
 *      sentence-initial capitalization is not, by itself, a name signal),
 *      and not made entirely of common capitalized words (days, months,
 *      greetings, etc.). This heuristic WILL miss names at the very start
 *      of a message, single-word names, non-Latin scripts, and all-lowercase
 *      typing, and WILL occasionally flag real non-name phrases (e.g. an
 *      unusual place or brand name). That tradeoff is intentional: for a
 *      pre-filter sitting in front of a third-party AI call, over-redacting
 *      is the safer failure mode than under-redacting.
 */

const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// Formatted phone numbers: optional "+countrycode", then digit groups of
// 2-4 joined by at least one separator (space/dot/dash/parens). Requiring
// at least one separator-joined group is what distinguishes this from a
// bare digit blob (handled separately below and by the ID/health-card pass).
// A candidate match is only redacted if it contains at least
// MIN_PHONE_DIGITS total digits (see redactText) -- short, clinically
// meaningful pairs like an age bracket "40-64", a blood pressure "120-80",
// or "10-15 minutes" are not phone numbers and must survive.
const PHONE_FORMATTED_REGEX = /(?:\+\d{1,3}[-.\s]?)?\(?\d{2,4}\)?(?:[-.\s]\d{2,4}){1,4}\b/g;

// Fewer digits than this and a separator-formatted digit run is treated as
// ordinary content (a range, a BP reading, a date fragment), not a phone
// number. 7 = the shortest common local phone number length.
const MIN_PHONE_DIGITS = 7;

// Bare (unformatted) digit runs of a typical phone-number length. Bounded by
// word boundaries so it does not match the digit suffix of an alphanumeric
// ID like "ABCD12345678" (no boundary exists between a letter and a digit).
const PHONE_BARE_REGEX = /\b\d{7,11}\b/g;

// Anything left over of 8+ consecutive digits is treated as a possible
// ID/health-card number (e.g. a long insurance number, or the digit portion
// of an alphanumeric health card). No word-boundary requirement, so this
// also catches digits glued directly onto letters.
const LONG_DIGIT_REGEX = /\d{8,}/g;

// Candidate runs of 2-4 consecutive Title-Case words, e.g. "Jane Example" or
// "Jane Marie Example". Allows internal apostrophes/hyphens (O'Brien, Smith-Jones).
const NAME_CANDIDATE_REGEX = /[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){1,3}/g;

// Common capitalized words that routinely appear in ordinary patient
// messages and would otherwise trigger false-positive name matches when
// they appear back-to-back (e.g. "Thank You", "Since Monday"). Lower-cased
// for case-insensitive comparison against each word in a name candidate.
const COMMON_CAPITALIZED_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those',
  'since', 'when', 'where', 'what', 'which', 'have', 'has', 'had',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  'doctor', 'dr', 'mr', 'mrs', 'ms', 'hello', 'hi', 'hey',
  'thanks', 'thank', 'you', 'please', 'yes', 'no', 'ok', 'okay',
  'today', 'yesterday', 'tomorrow', 'morning', 'afternoon', 'evening', 'night',
  'i', "i'm", 'im', 'my', 'me', 'well', 'also', 'just', 'still', 'very',
  'really', 'maybe', 'sometimes', 'usually', 'been', 'am', 'is', 'are',
]);

/**
 * True if `index` in `text` is either the very start of the string or
 * immediately follows sentence-ending punctuation (skipping whitespace) --
 * i.e. the word starting there would be capitalized anyway by ordinary
 * English sentence-casing rules, so capitalization alone is not a name
 * signal at that position.
 * @param {string} text
 * @param {number} index
 * @returns {boolean}
 */
function isSentenceStart(text, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(text[i])) i -= 1;
  if (i < 0) return true;
  return /[.!?\n]/.test(text[i]);
}

/**
 * @param {string} candidate the matched run of words, e.g. "Thank You"
 * @returns {boolean} true if every word in the candidate is a common
 *   capitalized word (so it's very unlikely to be a real name).
 */
function isAllCommonWords(candidate) {
  const words = candidate.split(/\s+/);
  return words.every((w) => COMMON_CAPITALIZED_WORDS.has(w.toLowerCase()));
}

/**
 * Redacts the probable-full-name heuristic. Implemented as a manual
 * exec loop (rather than a one-line replace()) because whether a match is
 * skipped depends on the *original, unmodified* surrounding text (sentence
 * position), not on the text being built up in the replacement pass.
 * @param {string} text
 * @returns {string}
 */
function redactProbableNames(text) {
  let result = '';
  let lastEnd = 0;
  NAME_CANDIDATE_REGEX.lastIndex = 0;
  let match;
  while ((match = NAME_CANDIDATE_REGEX.exec(text)) !== null) {
    const candidate = match[0];
    const start = match.index;
    if (isSentenceStart(text, start)) {
      // Only the FIRST word's capitalization is explained by sentence casing;
      // a name may still begin at the second word (e.g. "Hello Jane Example").
      // Resume scanning right after the first word instead of skipping the
      // whole greedy match, or the trailing name would silently leak.
      NAME_CANDIDATE_REGEX.lastIndex = start + candidate.search(/\s/);
      continue;
    }
    if (isAllCommonWords(candidate)) {
      continue;
    }
    result += text.slice(lastEnd, start) + '[removed: possible name]';
    lastEnd = start + candidate.length;
  }
  result += text.slice(lastEnd);
  return result;
}

/**
 * Runs every redaction pass over a single string, in the fixed order
 * documented at the top of this file. Pure function: never mutates its
 * input, has no side effects, makes no network/model calls.
 * @param {string} text
 * @returns {string} the redacted text, safe to forward to an AI provider.
 */
function redactText(text) {
  if (typeof text !== 'string' || text.length === 0) return text;

  let out = text;
  out = out.replace(EMAIL_REGEX, '[removed: possible email address]');
  out = out.replace(PHONE_FORMATTED_REGEX, (match) => {
    const digitCount = (match.match(/\d/g) || []).length;
    return digitCount >= MIN_PHONE_DIGITS ? '[removed: possible phone number]' : match;
  });
  out = out.replace(PHONE_BARE_REGEX, '[removed: possible phone number]');
  out = out.replace(LONG_DIGIT_REGEX, '[removed: possible ID/health card number]');
  out = redactProbableNames(out);
  return out;
}

/**
 * Returns a new IntakeAnswers-shaped object (see
 * core/schema/intake.schema.json) with every free-text field passed through
 * `redactText()`. The input object is never mutated -- this is the object
 * that should be handed to `getRecommendation()`; the original, untouched
 * object stays in the front-end's session/reply path.
 *
 * Structured fields (locale, ageRange, sex, intakeId, jurisdiction,
 * followUps[].topic) are left as-is: they are not free text a patient typed,
 * so there is nothing for a regex-based filter to usefully scan there.
 * `followUps[].answer` is only redacted when it's a string -- booleans and
 * numbers (e.g. a severity score, a yes/no) pass through unchanged.
 *
 * @param {object} intakeAnswers IntakeAnswers, e.g. from bot/intake.cjs's
 *   buildIntakeAnswers().
 * @returns {object} a new IntakeAnswers object safe to send to an AI provider.
 */
function deidentifyIntakeAnswers(intakeAnswers) {
  const out = { ...intakeAnswers };

  if (typeof out.chiefComplaint === 'string') {
    out.chiefComplaint = redactText(out.chiefComplaint);
  }
  if (typeof out.onsetAndDuration === 'string') {
    out.onsetAndDuration = redactText(out.onsetAndDuration);
  }
  if (typeof out.freeTextNotes === 'string') {
    out.freeTextNotes = redactText(out.freeTextNotes);
  }
  if (Array.isArray(out.followUps)) {
    out.followUps = out.followUps.map((fu) => {
      if (fu && typeof fu.answer === 'string') {
        return { ...fu, answer: redactText(fu.answer) };
      }
      return fu;
    });
  }

  return out;
}

module.exports = {
  redactText,
  deidentifyIntakeAnswers,
  // Exported for tests only -- not part of the module's stable contract.
  EMAIL_REGEX,
  PHONE_FORMATTED_REGEX,
  PHONE_BARE_REGEX,
  LONG_DIGIT_REGEX,
  NAME_CANDIDATE_REGEX,
};
