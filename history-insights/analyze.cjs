'use strict';

/**
 * history-insights/analyze.cjs -- EXPERIMENTAL
 *
 * Turns a block of free-text personal health history (past diagnoses,
 * medications, labs -- whatever the person pastes) into:
 *
 *   1. IntakeAnswers-shaped input (../core/schema/intake.schema.json) for
 *      core/'s getRecommendation() -- one overall intake plus one focused
 *      intake per detected topic.
 *   2. A small set of relevant topics, derived by simple keyword matching
 *      against a short curated list (diabetes, hypertension, asthma,
 *      pregnancy, etc.). This is deliberately a v1 heuristic: it structures
 *      the FAQ sections of the report, it does not diagnose anything.
 *   3. An education report object: FAQ sections per topic, where every
 *      answer comes from a full core/ panel run (>= 2 independent models,
 *      divergence surfaced -- see ../core/INTERFACE.md). The FAQ *structure*
 *      is a deterministic mapping over each RecommendationObject; nothing
 *      in this file invents clinical content.
 *
 * Pure-function parts (topic detection, intake building, FAQ mapping,
 * report formatting) have no side effects and no AI calls, so they are
 * testable offline. Only generateEducationReport() talks to core/.
 */

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Topic catalog (v1: short keyword list, matched case-insensitively on word
// boundaries). Matching a keyword only means "this topic gets its own FAQ
// section" -- the panel sees the person's full history text either way.
// ---------------------------------------------------------------------------

const TOPICS = [
  {
    id: 'diabetes',
    label: 'Diabetes and blood sugar',
    keywords: ['diabetes', 'diabetic', 'prediabetes', 'a1c', 'hba1c', 'metformin', 'insulin', 'blood sugar', 'glucose', 'glycemia'],
  },
  {
    id: 'hypertension',
    label: 'Blood pressure (hypertension)',
    keywords: ['hypertension', 'hypertensive', 'high blood pressure', 'blood pressure', 'amlodipine', 'lisinopril', 'ramipril', 'losartan', 'perindopril', 'hydrochlorothiazide'],
  },
  {
    id: 'cholesterol',
    label: 'Cholesterol and blood lipids',
    keywords: ['cholesterol', 'dyslipidemia', 'hyperlipidemia', 'ldl', 'hdl', 'statin', 'atorvastatin', 'rosuvastatin', 'simvastatin', 'triglyceride', 'triglycerides'],
  },
  {
    id: 'heart',
    label: 'Heart and circulation',
    keywords: ['heart attack', 'myocardial infarction', 'angina', 'coronary artery', 'heart failure', 'stent', 'cardiac bypass', 'atrial fibrillation', 'afib', 'arrhythmia', 'stroke', 'tia', 'pacemaker'],
  },
  {
    id: 'asthma',
    label: 'Asthma',
    keywords: ['asthma', 'asthmatic', 'salbutamol', 'ventolin', 'albuterol', 'wheeze', 'wheezing', 'puffer'],
  },
  {
    id: 'copd',
    label: 'COPD and chronic lung disease',
    keywords: ['copd', 'emphysema', 'chronic bronchitis', 'chronic obstructive'],
  },
  {
    id: 'kidney',
    label: 'Kidney health',
    keywords: ['kidney disease', 'chronic kidney', 'ckd', 'renal failure', 'renal insufficiency', 'creatinine', 'egfr', 'dialysis', 'kidney stones'],
  },
  {
    id: 'thyroid',
    label: 'Thyroid',
    keywords: ['thyroid', 'hypothyroid', 'hypothyroidism', 'hyperthyroid', 'hyperthyroidism', 'levothyroxine', 'synthroid', 'tsh', 'goiter', 'goitre'],
  },
  {
    id: 'mental-health',
    label: 'Mental health',
    keywords: ['depression', 'depressive', 'anxiety', 'panic attack', 'panic attacks', 'antidepressant', 'sertraline', 'escitalopram', 'citalopram', 'fluoxetine', 'venlafaxine', 'bipolar', 'ptsd', 'schizophrenia'],
  },
  {
    id: 'pregnancy',
    label: 'Pregnancy and reproductive health',
    keywords: ['pregnant', 'pregnancy', 'prenatal', 'postpartum', 'gestational', 'trying to conceive', 'miscarriage', 'contraception'],
  },
  {
    id: 'smoking',
    label: 'Smoking and tobacco',
    keywords: ['smoking', 'smoker', 'cigarette', 'cigarettes', 'tobacco', 'vaping', 'nicotine'],
  },
  {
    id: 'weight',
    label: 'Weight and metabolic health',
    keywords: ['obesity', 'obese', 'overweight', 'bmi', 'bariatric', 'metabolic syndrome'],
  },
];

const DISCLAIMER =
  'This report is AI-generated health education based only on the history text you provided. ' +
  'It is not a diagnosis, a treatment plan, or a substitute for examination by a clinician, ' +
  'and it may contain errors. If you can reach a clinician, bring this report to them rather ' +
  'than acting on it alone. If you cannot reach one, treat each section\'s "warning signs" ' +
  'answer as the most important part: those are the changes that mean you should travel to ' +
  'the nearest clinic or hospital rather than continue managing at home.';

// ---------------------------------------------------------------------------
// Topic detection + light history parsing (pure, offline)
// ---------------------------------------------------------------------------

/** @param {string} keyword @returns {RegExp} word-boundary, case-insensitive */
function keywordToRegex(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

/**
 * @param {string} historyText the person's raw pasted history
 * @returns {Array<{id: string, label: string, matchedKeywords: string[]}>}
 *   topics whose keyword list matched, in catalog order.
 */
function detectTopics(historyText) {
  const text = String(historyText || '');
  const detected = [];
  for (const topic of TOPICS) {
    const matchedKeywords = topic.keywords.filter((kw) => keywordToRegex(kw).test(text));
    if (matchedKeywords.length > 0) {
      detected.push({ id: topic.id, label: topic.label, matchedKeywords });
    }
  }
  return detected;
}

/**
 * Very light line-level parsing into intake.schema.json `relevantHistory`
 * items. Only classifies what it can do cheaply and reliably-ish:
 * dose-looking lines become "medication", allergy-looking lines become
 * "allergy". Everything else is left to `freeTextNotes` (which always
 * carries the full verbatim text) rather than mis-tagged.
 *
 * @param {string} historyText
 * @returns {Array<{type: string, value: string}>}
 */
function parseHistoryItems(historyText) {
  const items = [];
  const lines = String(historyText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (items.length >= 40) break; // cap: freeTextNotes has the rest verbatim
    const value = line.length > 200 ? `${line.slice(0, 197)}...` : line;
    if (/allerg/i.test(line)) {
      items.push({ type: 'allergy', value });
    } else if (/\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|units?|iu)\b/i.test(line)) {
      items.push({ type: 'medication', value });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// IntakeAnswers builders (pure; shapes match ../core/schema/intake.schema.json)
// ---------------------------------------------------------------------------

function newIntakeId() {
  // Opaque correlation id only -- never a person identifier.
  return `history-insights-${crypto.randomUUID()}`;
}

/**
 * Overall education intake: the whole history, no topic focus.
 * @param {string} historyText (pass the redacted copy -- see generateEducationReport)
 * @param {Array<{id: string, label: string}>} topics from detectTopics()
 * @param {{locale?: string}} [options]
 * @returns {object} IntakeAnswers
 */
function buildIntakeAnswers(historyText, topics, options = {}) {
  const followUps =
    topics.length > 0
      ? topics.map((topic) => ({
          question: `Does your health history mention anything related to ${topic.label.toLowerCase()}?`,
          answer: true,
          topic: `history-${topic.id}`,
        }))
      : [
          {
            question:
              'Did a keyword screen of your history match any of the common condition topics this module knows?',
            answer: false,
            topic: 'history-screen',
          },
        ];

  return {
    intakeId: newIntakeId(),
    locale: options.locale || 'en',
    chiefComplaint:
      'Education request: I am sharing my own past health history (diagnoses, medications, labs) ' +
      'and want a plain-language education report on how to manage and improve my health going ' +
      'forward. This is not a new acute complaint.',
    followUps,
    relevantHistory: parseHistoryItems(historyText),
    freeTextNotes: `Self-reported health history (verbatim):\n${historyText}`,
  };
}

/**
 * Topic-focused education intake, one per detected topic.
 * @param {string} historyText (redacted copy)
 * @param {{id: string, label: string}} topic
 * @param {{locale?: string}} [options]
 * @returns {object} IntakeAnswers
 */
function buildTopicIntake(historyText, topic, options = {}) {
  return {
    intakeId: newIntakeId(),
    locale: options.locale || 'en',
    chiefComplaint:
      `Education request about ${topic.label.toLowerCase()}: based only on my own past health ` +
      'history (shared in the notes below), teach me in plain language how to manage and improve ' +
      'this aspect of my health going forward. This is education, not a new acute complaint.',
    followUps: [
      {
        question: 'What do you most want from this section?',
        answer:
          'A plain-language explanation, day-to-day management steps I can do myself, and the ' +
          'specific warning signs that would mean I need to travel to a clinic or hospital -- ' +
          'I may not have a doctor reachable nearby.',
        topic: `history-${topic.id}`,
      },
    ],
    relevantHistory: parseHistoryItems(historyText),
    freeTextNotes: `Self-reported health history (verbatim):\n${historyText}`,
  };
}

// ---------------------------------------------------------------------------
// FAQ mapping (pure): RecommendationObject -> a section's Q/A list.
// The questions are a fixed template; every answer is taken verbatim from
// fields of the panel's RecommendationObject -- this file adds no clinical
// content of its own.
// ---------------------------------------------------------------------------

/**
 * @param {string} subjectLabel e.g. "diabetes and blood sugar" or "your overall health"
 * @param {object} rec RecommendationObject (../core/schema/recommendation.schema.json)
 * @returns {Array<{question: string, answer: string}>}
 */
function recommendationToFaqs(subjectLabel, rec) {
  const faqs = [];

  faqs.push({
    question: `What should I understand about ${subjectLabel}, based on my history?`,
    answer: rec.plainLanguageSummary,
  });

  if (Array.isArray(rec.suggestedNextSteps) && rec.suggestedNextSteps.length > 0) {
    faqs.push({
      question: 'What can I do about it, starting now?',
      answer: rec.suggestedNextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
    });
  }

  faqs.push({
    question: 'Which warning signs mean I should get to a clinic or hospital?',
    answer:
      Array.isArray(rec.redFlags) && rec.redFlags.length > 0
        ? rec.redFlags.map((flag) => `- ${flag}`).join('\n')
        : 'The AI panel did not raise urgent warning signs specific to this topic from your ' +
          'history. That is not a guarantee of safety: if you become rapidly worse, develop ' +
          'severe pain, trouble breathing, confusion, or heavy bleeding, do not wait to match ' +
          'a sign on a list -- start travelling to the nearest clinic or hospital.',
  });

  const considerationLines = (rec.considerations || []).map(
    (c) => `- ${c.text} (panel confidence ${Math.round(c.confidence * 100)}%)`
  );
  const agreementLine = rec.divergenceFlag
    ? 'CAUTION: the independent AI models materially DISAGREED on this section. Treat it with ' +
      'extra skepticism and prioritize showing this report to a clinician.'
    : 'The independent AI models were in broad agreement on this section.';
  faqs.push({
    question: 'What did the AI panel actually consider, and did the models agree?',
    answer: [...considerationLines, agreementLine].filter(Boolean).join('\n'),
  });

  return faqs;
}

// ---------------------------------------------------------------------------
// Report assembly + generation
// ---------------------------------------------------------------------------

/**
 * Optional local PII scrub, reused from bot/deidentify.cjs when this module
 * runs inside the full repo checkout (that file has zero npm dependencies,
 * so requiring it across the two independent trees is safe). If the file is
 * absent (e.g. a standalone copy of history-insights/ + core/ only), the
 * text is forwarded unscrubbed and the caller is warned -- the README tells
 * people to remove names/IDs from their pasted history themselves either way.
 *
 * @returns {{redactText: (t: string) => string, available: boolean}}
 */
function loadRedactor() {
  try {
    // eslint-disable-next-line global-require
    const { redactText } = require('../bot/deidentify.cjs');
    return { redactText, available: true };
  } catch {
    return { redactText: (t) => t, available: false };
  }
}

/**
 * Offline analysis step: what topics were detected and exactly what would be
 * sent to the AI panel (post-redaction). Used by the CLI's --dry-run and by
 * generateEducationReport() itself. No AI calls, no side effects.
 *
 * @param {string} historyText
 * @param {{locale?: string}} [options]
 * @returns {{topics: Array<object>, redactionApplied: boolean,
 *   intakeAnswers: object, topicIntakes: Array<{topic: object, intakeAnswers: object}>}}
 */
function analyzeHistory(historyText, options = {}) {
  if (typeof historyText !== 'string' || !historyText.trim()) {
    throw new Error('historyText must be a non-empty string of pasted health history.');
  }
  // Detect topics on the ORIGINAL text (the name-redaction heuristic could
  // otherwise eat Title-Case condition phrases like "Type Two Diabetes"),
  // but build every intake from the REDACTED copy -- only the redacted copy
  // is ever sent to an AI provider.
  const redactor = loadRedactor();
  const topics = detectTopics(historyText);
  const redacted = redactor.redactText(historyText);
  return {
    topics,
    redactionApplied: redactor.available,
    intakeAnswers: buildIntakeAnswers(redacted, topics, options),
    topicIntakes: topics.map((topic) => ({
      topic,
      intakeAnswers: buildTopicIntake(redacted, topic, options),
    })),
  };
}

/**
 * Full pipeline: analyze the history, run one core/ panel per section
 * (overall + one per detected topic), and assemble the education report.
 *
 * Panel runs are sequential on purpose: each run already fans out to every
 * configured provider, and self-hosters on free/cheap API tiers hit rate
 * limits fast if sections run in parallel.
 *
 * If the OVERALL panel run fails, this throws (there is no report worth
 * returning). If an individual TOPIC run fails, the failure is recorded on
 * that section verbatim -- never papered over with substitute content, and
 * never retried with a smaller panel (panelSize < 2 is forbidden repo-wide).
 *
 * @param {string} historyText
 * @param {object} panelConfig PanelConfig (see ../core/INTERFACE.md); build
 *   it with config.cjs's buildPanelConfigFromEnv() or construct it directly.
 * @param {object} [options]
 * @param {string} [options.locale] BCP-47 tag for the report language.
 * @param {(msg: string) => void} [options.log] progress logger (e.g. stderr).
 * @param {Function} [options.getRecommendation] injectable for tests;
 *   defaults to require('../core').getRecommendation.
 * @returns {Promise<object>} the education report object (see buildReport docs).
 */
async function generateEducationReport(historyText, panelConfig, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const getRecommendation =
    options.getRecommendation || require('../core').getRecommendation;

  const analysis = analyzeHistory(historyText, options);
  if (!analysis.redactionApplied) {
    log(
      'WARNING: bot/deidentify.cjs not found -- no local PII scrub was applied. ' +
        'Make sure you removed names, phone numbers, and ID numbers from your history text.'
    );
  }
  log(
    analysis.topics.length > 0
      ? `Detected topics: ${analysis.topics.map((t) => t.label).join(', ')}`
      : 'No catalog topics matched -- generating the overall section only.'
  );

  log(`[panel 1/${analysis.topics.length + 1}] overall health overview...`);
  const overallRec = await getRecommendation(analysis.intakeAnswers, panelConfig);

  const sections = [
    {
      id: 'overall',
      label: 'Your overall health',
      divergenceFlag: overallRec.divergenceFlag,
      panelMeta: overallRec.panelMeta || null,
      faqs: recommendationToFaqs('your overall health', overallRec),
    },
  ];

  for (let i = 0; i < analysis.topicIntakes.length; i++) {
    const { topic, intakeAnswers } = analysis.topicIntakes[i];
    log(`[panel ${i + 2}/${analysis.topics.length + 1}] ${topic.label}...`);
    try {
      const rec = await getRecommendation(intakeAnswers, panelConfig);
      sections.push({
        id: topic.id,
        label: topic.label,
        divergenceFlag: rec.divergenceFlag,
        panelMeta: rec.panelMeta || null,
        faqs: recommendationToFaqs(topic.label.toLowerCase(), rec),
      });
    } catch (err) {
      log(`  section "${topic.label}" failed: ${err.message}`);
      sections.push({
        id: topic.id,
        label: topic.label,
        divergenceFlag: false,
        panelMeta: null,
        faqs: [],
        error: `This section could not be generated (${err.message}). No substitute content was invented.`,
      });
    }
  }

  return {
    module: 'history-insights',
    experimental: true,
    generatedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
    topics: analysis.topics.map(({ id, label }) => ({ id, label })),
    redactionApplied: analysis.redactionApplied,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Plain-text rendering (pure) -- what the CLI prints to stdout.
// ---------------------------------------------------------------------------

/**
 * @param {object} report from generateEducationReport()
 * @returns {string}
 */
function formatReportText(report) {
  const bar = '='.repeat(72);
  const lines = [];
  lines.push(bar);
  lines.push('PERSONAL HEALTH EDUCATION REPORT   [EXPERIMENTAL]');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(bar);
  lines.push('');
  lines.push(report.disclaimer);
  lines.push('');
  lines.push(
    report.topics.length > 0
      ? `Topics detected from your history: ${report.topics.map((t) => t.label).join(', ')}`
      : 'No catalog topics were detected in your history; the report has one overall section.'
  );

  for (const section of report.sections) {
    lines.push('');
    lines.push('-'.repeat(72));
    lines.push(`SECTION: ${section.label.toUpperCase()}`);
    if (section.panelMeta && Array.isArray(section.panelMeta.providersConsulted)) {
      lines.push(
        `(answers aggregated from ${section.panelMeta.providersConsulted.length} independent AI models: ` +
          `${section.panelMeta.providersConsulted.join(', ')})`
      );
    }
    lines.push('-'.repeat(72));
    if (section.error) {
      lines.push(section.error);
      continue;
    }
    if (section.divergenceFlag) {
      lines.push('!!! PANEL DIVERGENCE: the independent AI models materially disagreed on this');
      lines.push('!!! section. Treat it with extra skepticism.');
    }
    for (const faq of section.faqs) {
      lines.push('');
      lines.push(`Q: ${faq.question}`);
      lines.push(`A: ${faq.answer}`);
    }
  }

  lines.push('');
  lines.push(bar);
  lines.push('Generated by history-insights (freeeducationhealth) -- self-hosted, no shared infrastructure.');
  lines.push(bar);
  return lines.join('\n');
}

module.exports = {
  TOPICS,
  DISCLAIMER,
  detectTopics,
  parseHistoryItems,
  buildIntakeAnswers,
  buildTopicIntake,
  recommendationToFaqs,
  analyzeHistory,
  generateEducationReport,
  formatReportText,
};
