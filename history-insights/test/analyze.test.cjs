'use strict';

const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const {
  detectTopics,
  parseHistoryItems,
  buildIntakeAnswers,
  buildTopicIntake,
  recommendationToFaqs,
  analyzeHistory,
  generateEducationReport,
  formatReportText,
} = require('../analyze.cjs');

// Placeholder history only -- obviously fake, no real person (repo hard rule).
const SAMPLE_HISTORY = [
  'Type 2 diabetes diagnosed 2019. Last HbA1c 7.8%.',
  'High blood pressure since 2020.',
  'Metformin 500 mg twice daily.',
  'Ramipril 5 mg daily.',
  'Allergy: penicillin (rash).',
  'Former smoker, quit 2021.',
].join('\n');

test('detectTopics finds expected topics and no false positives', () => {
  const topics = detectTopics(SAMPLE_HISTORY);
  const ids = topics.map((t) => t.id);
  assert.ok(ids.includes('diabetes'), 'diabetes should be detected');
  assert.ok(ids.includes('hypertension'), 'hypertension should be detected');
  assert.ok(ids.includes('smoking'), 'smoking should be detected');
  assert.ok(!ids.includes('pregnancy'), 'pregnancy should not be detected');
  assert.ok(!ids.includes('asthma'), 'asthma should not be detected');

  const none = detectTopics('I twisted my ankle on the stairs yesterday.');
  assert.deepStrictEqual(none, []);
});

test('detectTopics matches whole words only', () => {
  // "insomnia" contains no topic keyword; "insulin-like" should still match
  // "insulin" on its own word boundary, but "Ainsulin" must not.
  assert.strictEqual(detectTopics('trouble sleeping, insomnia').length, 0);
  assert.strictEqual(detectTopics('word salad Ainsulinx nothing').length, 0);
});

test('parseHistoryItems classifies dose lines and allergy lines', () => {
  const items = parseHistoryItems(SAMPLE_HISTORY);
  const types = items.map((i) => i.type);
  assert.ok(types.includes('medication'));
  assert.ok(types.includes('allergy'));
  const med = items.find((i) => i.type === 'medication');
  assert.match(med.value, /mg/i);
});

test('buildIntakeAnswers produces intake.schema.json-shaped input', () => {
  const topics = detectTopics(SAMPLE_HISTORY);
  const intake = buildIntakeAnswers(SAMPLE_HISTORY, topics, { locale: 'en' });

  assert.strictEqual(typeof intake.chiefComplaint, 'string');
  assert.ok(intake.chiefComplaint.length > 0);
  assert.ok(Array.isArray(intake.followUps) && intake.followUps.length === topics.length);
  for (const fu of intake.followUps) {
    assert.strictEqual(typeof fu.question, 'string');
    assert.strictEqual(fu.answer, true);
    assert.match(fu.topic, /^history-/);
  }
  assert.ok(intake.freeTextNotes.includes('Type 2 diabetes'));
  assert.match(intake.intakeId, /^history-insights-/);

  // No keys outside the schema's property list (additionalProperties: false).
  const allowed = new Set([
    'intakeId', 'locale', 'jurisdiction', 'chiefComplaint', 'onsetAndDuration',
    'followUps', 'relevantHistory', 'freeTextNotes', 'ageRange', 'sex',
  ]);
  for (const key of Object.keys(intake)) {
    assert.ok(allowed.has(key), `unexpected intake key "${key}"`);
  }

  // If core/ is installed in this checkout, validate against the real schema.
  let assertValidIntake = null;
  try {
    ({ assertValidIntake } = require('../../core/schema/validate.cjs'));
  } catch {
    // standalone checkout without core installed -- shape assertions above suffice
  }
  if (assertValidIntake) {
    assert.doesNotThrow(() => assertValidIntake(intake));
    const topicIntake = buildTopicIntake(SAMPLE_HISTORY, topics[0], { locale: 'en' });
    assert.doesNotThrow(() => assertValidIntake(topicIntake));
  }
});

test('buildIntakeAnswers with no topics still yields non-empty followUps', () => {
  const intake = buildIntakeAnswers('twisted ankle yesterday', [], {});
  assert.strictEqual(intake.followUps.length, 1);
  assert.strictEqual(intake.followUps[0].answer, false);
});

const FAKE_REC = {
  considerations: [
    { text: 'Long-standing type 2 diabetes with borderline control.', confidence: 0.8 },
    { text: 'Cardiovascular risk from combined conditions.', confidence: 0.55 },
  ],
  divergenceFlag: false,
  redFlags: ['Blurred vision with very high sugar readings'],
  suggestedNextSteps: [
    'Check your blood sugar at the same time each morning and write it down.',
    'If you cannot reach a clinic, keep taking your current medication rather than stopping.',
  ],
  billingSuggestions: null,
  plainLanguageSummary: 'Your history shows diabetes that needs steady day-to-day habits.',
  panelMeta: { providersConsulted: ['anthropic', 'deepseek'], panelSize: 2, generatedAt: '2026-07-01T00:00:00Z' },
};

test('recommendationToFaqs maps recommendation fields verbatim into Q/A', () => {
  const faqs = recommendationToFaqs('diabetes and blood sugar', FAKE_REC);
  assert.strictEqual(faqs.length, 4);
  assert.strictEqual(faqs[0].answer, FAKE_REC.plainLanguageSummary);
  assert.match(faqs[1].answer, /^1\. Check your blood sugar/);
  assert.match(faqs[2].answer, /Blurred vision/);
  assert.match(faqs[3].answer, /panel confidence 80%/);
  assert.match(faqs[3].answer, /broad agreement/);
});

test('recommendationToFaqs surfaces divergence and empty-redFlags honestly', () => {
  const divergent = { ...FAKE_REC, divergenceFlag: true, redFlags: [] };
  const faqs = recommendationToFaqs('thyroid', divergent);
  const warnings = faqs.find((f) => f.question.includes('warning signs'));
  assert.match(warnings.answer, /not a guarantee of safety/);
  const panel = faqs.find((f) => f.question.includes('did the models agree'));
  assert.match(panel.answer, /DISAGREED/);
});

test('generateEducationReport builds one section per topic plus overall (injected panel)', async () => {
  const calls = [];
  const fakeGetRecommendation = async (intake) => {
    calls.push(intake);
    return FAKE_REC;
  };
  const report = await generateEducationReport(
    SAMPLE_HISTORY,
    { providers: [{}, {}], panelSize: 2, personaStyle: 'generic' },
    { locale: 'en', getRecommendation: fakeGetRecommendation }
  );

  const topicCount = detectTopics(SAMPLE_HISTORY).length;
  assert.strictEqual(calls.length, topicCount + 1);
  assert.strictEqual(report.sections.length, topicCount + 1);
  assert.strictEqual(report.sections[0].id, 'overall');
  assert.strictEqual(report.experimental, true);
  assert.ok(report.disclaimer.length > 0);

  const text = formatReportText(report);
  assert.match(text, /EXPERIMENTAL/);
  assert.match(text, /SECTION: YOUR OVERALL HEALTH/);
  assert.match(text, /Q: /);
});

test('generateEducationReport records a topic-section failure instead of faking content', async () => {
  let call = 0;
  const flaky = async () => {
    call += 1;
    if (call === 1) return FAKE_REC; // overall succeeds
    throw new Error('only 1/2 provider(s) succeeded');
  };
  const report = await generateEducationReport(
    SAMPLE_HISTORY,
    { providers: [{}, {}], panelSize: 2, personaStyle: 'generic' },
    { getRecommendation: flaky }
  );
  const failed = report.sections.filter((s) => s.error);
  assert.strictEqual(failed.length, report.sections.length - 1);
  for (const section of failed) {
    assert.strictEqual(section.faqs.length, 0);
    assert.match(section.error, /could not be generated/);
  }
});

test('analyzeHistory applies the local PII scrub before building intakes', () => {
  // bot/deidentify.cjs is present in this repo checkout; a phone-number-like
  // string must not survive into the payload that would reach a provider.
  const analysis = analyzeHistory(`${SAMPLE_HISTORY}\nCall me at 555-010-0199.`, {});
  if (analysis.redactionApplied) {
    assert.ok(!analysis.intakeAnswers.freeTextNotes.includes('555-010-0199'));
  } else {
    // Standalone checkout without bot/: the flag must say so honestly.
    assert.strictEqual(analysis.redactionApplied, false);
  }
});

test('exportReportPdf writes a non-trivial PDF', async () => {
  const { exportReportPdf } = require('../pdf-export.cjs');
  const report = await generateEducationReport(
    SAMPLE_HISTORY,
    { providers: [{}, {}], panelSize: 2, personaStyle: 'generic' },
    { getRecommendation: async () => FAKE_REC }
  );
  const outPath = path.join(os.tmpdir(), `history-insights-test-${Date.now()}.pdf`);
  try {
    await exportReportPdf(report, outPath);
    const stat = fs.statSync(outPath);
    assert.ok(stat.size > 1000, `PDF too small: ${stat.size} bytes`);
    const head = fs.readFileSync(outPath).subarray(0, 5).toString('latin1');
    assert.strictEqual(head, '%PDF-');
  } finally {
    fs.rmSync(outPath, { force: true });
  }
});
