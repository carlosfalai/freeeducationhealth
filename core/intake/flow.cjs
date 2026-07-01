'use strict';

/**
 * Structured, HPI-style intake state machine.
 *
 * Front-ends are not required to use this -- `IntakeAnswers` can be built
 * directly (see core/schema/intake.schema.json); e.g. `epic/` pre-populates
 * from FHIR resources instead of running a conversation at all. This module
 * exists for front-ends (`bot/`, `instanthpi/`) that want a ready-made
 * conversational sequence:
 *
 *   chief-complaint gate -> coarse demographics (optional) -> onset ->
 *   a small library of category-specific targeted follow-up questions ->
 *   done
 *
 * The category library is intentionally small (fever, pain, cough, injury,
 * plus a general fallback) -- this is a starting scaffold, not an attempt
 * to cover every presentation. Front-ends and self-hosters can extend
 * `SYMPTOM_CATEGORIES` with their own categories.
 *
 * Usage:
 *   const { IntakeFlow } = require('./flow.cjs');
 *   const flow = new IntakeFlow({ locale: 'en' });
 *   let step = flow.start();
 *   while (!step.done) {
 *     const userAnswer = await askUser(step.question.question);
 *     step = flow.answer(userAnswer);
 *   }
 *   const intakeAnswers = step.intake; // matches intake.schema.json
 */

const AGE_BRACKETS = ['0-1', '2-11', '12-17', '18-39', '40-64', '65+'];

const SKIP_WORDS = new Set([
  '',
  'skip',
  'n/a',
  'na',
  'none',
  'unknown',
  "don't know",
  'dont know',
  'idk',
  'prefer not to say',
]);

/**
 * A small library of common symptom categories. Each entry lists keywords
 * used to route a free-text chief complaint to that category, and an
 * ordered list of targeted follow-up questions (OPQRST/review-of-systems
 * style), with at least one `red-flag-screen`-tagged question per category.
 */
const SYMPTOM_CATEGORIES = {
  fever: {
    keywords: ['fever', 'temperature', 'chills', 'febrile', 'hot to touch', 'sweats'],
    questions: [
      { question: 'How high has the temperature been, if it was measured?', topic: 'fever-history' },
      { question: 'How many days has the fever been present?', topic: 'fever-history' },
      {
        question: 'Is there a stiff neck, a rash that does not fade when pressed, or a severe headache along with the fever?',
        topic: 'red-flag-screen',
      },
      {
        question: 'Is there difficulty breathing, confusion, or unusual sleepiness/trouble staying awake?',
        topic: 'red-flag-screen',
      },
      { question: 'Is the person able to drink fluids and urinate normally?', topic: 'hydration' },
    ],
  },
  pain: {
    keywords: ['pain', 'ache', 'hurts', 'hurting', 'sore', 'cramp'],
    questions: [
      { question: 'Where exactly is the pain, and does it spread anywhere else?', topic: 'pain-location' },
      { question: 'On a scale of 0 to 10, how severe is the pain at its worst?', topic: 'pain-severity' },
      { question: 'What makes the pain better or worse?', topic: 'pain-modifiers' },
      {
        question: 'Is this the worst pain of its kind ever experienced, or did it start very suddenly?',
        topic: 'red-flag-screen',
      },
      {
        question: 'Is there associated chest pain, difficulty breathing, fainting, or loss of feeling/movement anywhere?',
        topic: 'red-flag-screen',
      },
    ],
  },
  cough: {
    keywords: ['cough', 'coughing', 'wheeze', 'wheezing', 'chest congestion'],
    questions: [
      { question: 'Is the cough dry, or is anything being coughed up (and what color)?', topic: 'cough-character' },
      { question: 'How many days has the cough lasted?', topic: 'cough-history' },
      { question: 'Is there fever along with the cough?', topic: 'ros-respiratory' },
      {
        question: 'Is there difficulty breathing at rest, blue lips, or chest pain when breathing?',
        topic: 'red-flag-screen',
      },
      { question: 'Is there any blood when coughing?', topic: 'red-flag-screen' },
    ],
  },
  injury: {
    keywords: ['injury', 'fell', 'fall', 'cut', 'burn', 'accident', 'hit', 'wound', 'bleeding', 'sprain', 'fracture'],
    questions: [
      { question: 'How did the injury happen, and when?', topic: 'injury-mechanism' },
      { question: 'Is there visible deformity, or is the area unable to bear weight/be used normally?', topic: 'red-flag-screen' },
      { question: 'Is there heavy or ongoing bleeding that has not stopped with direct pressure?', topic: 'red-flag-screen' },
      { question: 'Was there any loss of consciousness, confusion, or head injury involved?', topic: 'red-flag-screen' },
      { question: 'Is the wound, if any, clean, or was it contaminated (dirt, rust, animal/human bite)?', topic: 'wound-care' },
    ],
  },
  general: {
    keywords: [],
    questions: [
      { question: 'Can you describe the main symptom in more detail?', topic: 'general' },
      { question: 'Has anything like this happened before?', topic: 'priorEpisode' },
      {
        question: 'Is there difficulty breathing, severe pain, confusion, fainting, or heavy bleeding?',
        topic: 'red-flag-screen',
      },
      { question: 'Is the symptom getting better, worse, or staying the same?', topic: 'trajectory' },
    ],
  },
};

const CATEGORY_PRIORITY = ['fever', 'pain', 'cough', 'injury'];

/**
 * Route a free-text chief complaint to one of `SYMPTOM_CATEGORIES` by
 * simple case-insensitive keyword matching. Falls back to `"general"`.
 *
 * @param {string} chiefComplaintText
 * @returns {string} category key
 */
function detectCategory(chiefComplaintText) {
  const text = (chiefComplaintText || '').toLowerCase();
  for (const category of CATEGORY_PRIORITY) {
    const { keywords } = SYMPTOM_CATEGORIES[category];
    if (keywords.some((kw) => text.includes(kw))) {
      return category;
    }
  }
  return 'general';
}

/**
 * Normalize an answer: trims strings and maps common "skip" phrasings to
 * `null` per intake.schema.json's convention that `null` means "asked but
 * skipped/unknown/not applicable".
 *
 * @param {string|boolean|number|null|undefined} answer
 * @returns {string|boolean|number|null}
 */
function normalizeAnswer(answer) {
  if (typeof answer === 'string') {
    const trimmed = answer.trim();
    if (SKIP_WORDS.has(trimmed.toLowerCase())) return null;
    return trimmed;
  }
  if (answer === undefined) return null;
  return answer;
}

/**
 * Best-effort mapping of a free-text age answer (a bracket name, or a bare
 * number) to one of intake.schema.json's coarse `ageRange` brackets.
 *
 * @param {string|number|null} answer
 * @returns {string|null}
 */
function mapAgeToBracket(answer) {
  if (answer === null || answer === undefined) return null;
  const text = String(answer).trim();
  if (AGE_BRACKETS.includes(text)) return text;

  const digitsOnly = text.replace(/[^\d.]/g, '');
  if (!digitsOnly) return null;
  const asNumber = Number(digitsOnly);
  if (!Number.isFinite(asNumber)) return null;

  if (asNumber <= 1) return '0-1';
  if (asNumber <= 11) return '2-11';
  if (asNumber <= 17) return '12-17';
  if (asNumber <= 39) return '18-39';
  if (asNumber <= 64) return '40-64';
  return '65+';
}

/**
 * Best-effort mapping of a free-text sex answer to
 * intake.schema.json's `sex` enum.
 *
 * @param {string|null} answer
 * @returns {'male'|'female'|'unspecified'|null}
 */
function mapSex(answer) {
  if (answer === null || answer === undefined) return 'unspecified';
  const text = String(answer).trim().toLowerCase();
  if (['m', 'male', 'man', 'boy'].includes(text)) return 'male';
  if (['f', 'female', 'woman', 'girl'].includes(text)) return 'female';
  return 'unspecified';
}

const STAGES = Object.freeze({
  CHIEF_COMPLAINT: 'chiefComplaint',
  AGE_RANGE: 'ageRange',
  SEX: 'sex',
  ONSET: 'onset',
  FOLLOWUPS: 'followups',
  DONE: 'done',
});

class IntakeFlow {
  /**
   * @param {object} [options]
   * @param {string} [options.locale] - BCP-47 tag, carried through to IntakeAnswers.locale.
   * @param {string} [options.jurisdiction] - Carried through to IntakeAnswers.jurisdiction.
   * @param {boolean} [options.askAgeAndSex=true] - Ask coarse demographics.
   *   Set false when the front-end already has this (e.g. a returning
   *   patient profile) and wants to skip straight to clinical questions.
   */
  constructor(options = {}) {
    this.locale = options.locale || null;
    this.jurisdiction = options.jurisdiction || null;
    this.askAgeAndSex = options.askAgeAndSex !== false;

    this.stage = STAGES.CHIEF_COMPLAINT;
    this.chiefComplaint = '';
    this.chiefComplaintRetried = false;
    this.ageRange = null;
    this.sex = null;
    this.onsetAndDuration = null;
    this.category = null;
    this.followUps = [];
    this._questionQueue = [];
    this._pendingFollowUp = null;
  }

  /**
   * Begin the flow. Must be called once before any `answer()` call.
   * @returns {{done: boolean, question: {question: string, topic: string|null}}}
   */
  start() {
    return this._currentStep();
  }

  /**
   * Advance the flow with the user's answer to the most recently returned
   * question.
   *
   * @param {string|boolean|number|null} rawAnswer
   * @returns {{done: boolean, question?: object, intake?: object}}
   */
  answer(rawAnswer) {
    const value = normalizeAnswer(rawAnswer);

    switch (this.stage) {
      case STAGES.CHIEF_COMPLAINT: {
        if (value === null || value === '') {
          if (!this.chiefComplaintRetried) {
            this.chiefComplaintRetried = true;
            return this._currentStep('Please describe, even briefly, what is bothering you today.');
          }
          this.chiefComplaint = 'Not specified';
        } else {
          this.chiefComplaint = String(value);
        }
        this.category = detectCategory(this.chiefComplaint);
        this.stage = this.askAgeAndSex ? STAGES.AGE_RANGE : STAGES.ONSET;
        break;
      }

      case STAGES.AGE_RANGE: {
        this.ageRange = mapAgeToBracket(value);
        this.stage = STAGES.SEX;
        break;
      }

      case STAGES.SEX: {
        this.sex = mapSex(value);
        this.stage = STAGES.ONSET;
        break;
      }

      case STAGES.ONSET: {
        this.onsetAndDuration = value === null ? null : String(value);
        this._questionQueue = [...SYMPTOM_CATEGORIES[this.category].questions];
        this.stage = STAGES.FOLLOWUPS;
        break;
      }

      case STAGES.FOLLOWUPS: {
        if (this._pendingFollowUp) {
          this.followUps.push({
            question: this._pendingFollowUp.question,
            answer: value,
            topic: this._pendingFollowUp.topic,
          });
          this._pendingFollowUp = null;
        }
        if (this._questionQueue.length === 0) {
          this.stage = STAGES.DONE;
        }
        break;
      }

      case STAGES.DONE:
        // No-op: flow already complete. Front-ends should stop calling
        // answer() once { done: true } has been returned.
        break;

      default:
        throw new Error(`[core/intake/flow] unknown stage "${this.stage}"`);
    }

    return this._currentStep();
  }

  /**
   * @param {string} [overrideQuestionText] - Used to re-ask the chief
   *   complaint with a nudged phrasing after an empty first answer.
   * @returns {{done: boolean, question?: object, intake?: object}}
   * @private
   */
  _currentStep(overrideQuestionText) {
    switch (this.stage) {
      case STAGES.CHIEF_COMPLAINT:
        return {
          done: false,
          question: {
            question: overrideQuestionText || "What's the main problem you'd like help with today?",
            topic: null,
          },
        };

      case STAGES.AGE_RANGE:
        return {
          done: false,
          question: {
            question: `What is the approximate age? (${AGE_BRACKETS.join(', ')}, or "skip")`,
            topic: null,
          },
        };

      case STAGES.SEX:
        return {
          done: false,
          question: { question: "Sex (male/female), or say \"skip\" if you'd rather not say:", topic: null },
        };

      case STAGES.ONSET:
        return {
          done: false,
          question: {
            question: 'When did this start, and has it been getting better, worse, or staying the same?',
            topic: null,
          },
        };

      case STAGES.FOLLOWUPS: {
        if (this._questionQueue.length === 0) {
          this.stage = STAGES.DONE;
          return this._currentStep();
        }
        this._pendingFollowUp = this._questionQueue.shift();
        return {
          done: false,
          question: { question: this._pendingFollowUp.question, topic: this._pendingFollowUp.topic },
        };
      }

      case STAGES.DONE:
        return { done: true, intake: this.toIntakeAnswers() };

      default:
        throw new Error(`[core/intake/flow] unknown stage "${this.stage}"`);
    }
  }

  /**
   * Produce the final object matching core/schema/intake.schema.json.
   * Safe to call at any point, though `followUps` will be incomplete
   * before `{ done: true }` is reached.
   *
   * @returns {object} IntakeAnswers-shaped object
   */
  toIntakeAnswers() {
    /** @type {Record<string, any>} */
    const intake = {
      chiefComplaint: this.chiefComplaint || 'Not specified',
      followUps: this.followUps,
    };
    if (this.locale) intake.locale = this.locale;
    if (this.jurisdiction) intake.jurisdiction = this.jurisdiction;
    if (this.onsetAndDuration !== null && this.onsetAndDuration !== undefined) {
      intake.onsetAndDuration = this.onsetAndDuration;
    }
    if (this.ageRange) intake.ageRange = this.ageRange;
    if (this.sex) intake.sex = this.sex;
    return intake;
  }
}

module.exports = {
  IntakeFlow,
  detectCategory,
  mapAgeToBracket,
  mapSex,
  normalizeAnswer,
  SYMPTOM_CATEGORIES,
  AGE_BRACKETS,
};
