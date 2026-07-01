'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { orchestrate } = require('../panel/orchestrate.cjs');
const { getRecommendation } = require('../index.cjs');
const { assertValidRecommendation } = require('../schema/validate.cjs');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

const SAMPLE_INTAKE = {
  chiefComplaint: 'cough and mild fever for 3 days',
  onsetAndDuration: 'started 3 days ago, about the same since',
  ageRange: '18-39',
  sex: 'unspecified',
  followUps: [
    { question: 'Is there difficulty breathing at rest?', answer: false, topic: 'red-flag-screen' },
    { question: 'How high has the fever been?', answer: '38.2 C', topic: 'fever-history' },
  ],
};

function structuredReply({ considerations = [], redFlags = [], suggestedNextSteps = [], summary = '', billingSuggestions } = {}) {
  const body = { considerations, redFlags, suggestedNextSteps, summary };
  if (billingSuggestions) body.billingSuggestions = billingSuggestions;
  return JSON.stringify(body);
}

/**
 * @param {Record<string, string|Error|{httpError:true,status?:number,message:string}>} byProvider
 *   Keyed by 'anthropic' | 'deepseek' | 'openai' | 'local'.
 */
function makeFetchMock(byProvider) {
  return async (url) => {
    let key;
    if (url.includes('api.anthropic.com')) key = 'anthropic';
    else if (url.includes('api.deepseek.com')) key = 'deepseek';
    else if (url.includes('api.openai.com')) key = 'openai';
    else key = 'local';

    const payload = byProvider[key];
    if (payload === undefined) throw new Error(`mock has no configured response for provider "${key}"`);
    if (payload instanceof Error) throw payload;
    if (payload && payload.httpError) {
      return new Response(JSON.stringify({ error: { message: payload.message } }), {
        status: payload.status || 500,
      });
    }

    if (key === 'anthropic') {
      return new Response(JSON.stringify({ content: [{ type: 'text', text: payload }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: payload } }] }), { status: 200 });
  };
}

function baseConfig(overrides = {}) {
  return {
    providers: [
      { name: 'anthropic', model: 'claude-sonnet-5', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
      { name: 'deepseek', model: 'deepseek-chat', apiKeyEnvVar: 'DEEPSEEK_API_KEY' },
      { name: 'openai', model: 'gpt-4o-mini', apiKeyEnvVar: 'OPENAI_API_KEY' },
    ],
    panelSize: 2,
    personaStyle: 'generic',
    ...overrides,
  };
}

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    ANTHROPIC_API_KEY: 'k',
    DEEPSEEK_API_KEY: 'k',
    OPENAI_API_KEY: 'k',
  };
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

test('orchestrate: three agreeing providers produce a consensus, schema-valid recommendation', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({
      considerations: [{ text: 'Could be consistent with a viral upper respiratory infection', confidence: 0.7 }],
      redFlags: [],
      suggestedNextSteps: ['Rest and drink fluids.', 'Monitor temperature twice a day.'],
      summary: 'This looks like a common viral infection; rest and fluids should help.',
    }),
    deepseek: structuredReply({
      considerations: [{ text: 'Likely a viral upper respiratory tract infection', confidence: 0.6 }],
      redFlags: [],
      suggestedNextSteps: ['Drink plenty of fluids.', 'Use fever-reducing medication if needed.'],
      summary: 'Probably a viral illness; supportive care should be enough for now.',
    }),
    openai: structuredReply({
      considerations: [{ text: 'Consistent with a viral respiratory infection', confidence: 0.65 }],
      redFlags: [],
      suggestedNextSteps: ['Get extra rest over the next few days.'],
      summary: 'This is most likely viral and should improve with supportive care.',
    }),
  });

  const recommendation = await orchestrate(SAMPLE_INTAKE, baseConfig());

  assert.doesNotThrow(() => assertValidRecommendation(recommendation));
  assert.equal(recommendation.divergenceFlag, false);
  assert.equal(recommendation.redFlags.length, 0);
  assert.ok(recommendation.considerations.length >= 1);
  assert.equal(recommendation.considerations[0].confidence > 0 && recommendation.considerations[0].confidence <= 1, true);
  assert.equal(recommendation.panelMeta.panelSize, 3);
  assert.deepEqual(recommendation.panelMeta.providersConsulted.sort(), ['anthropic', 'deepseek', 'openai']);
  assert.equal(recommendation.billingSuggestions, null);
});

test('orchestrate: tolerates one failing provider as long as panelSize is still met', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({
      considerations: [{ text: 'Likely a mild viral illness', confidence: 0.6 }],
      summary: 'Likely viral, supportive care recommended.',
    }),
    deepseek: new Error('network timeout'),
    openai: structuredReply({
      considerations: [{ text: 'Likely a mild viral illness', confidence: 0.5 }],
      summary: 'Probably viral.',
    }),
  });

  const recommendation = await orchestrate(SAMPLE_INTAKE, baseConfig({ panelSize: 2 }));
  assert.equal(recommendation.panelMeta.panelSize, 2);
  assert.deepEqual(recommendation.panelMeta.providersConsulted.sort(), ['anthropic', 'openai']);
});

test('orchestrate: throws (does not silently downgrade) when fewer than panelSize providers succeed', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({ considerations: [{ text: 'ok', confidence: 0.5 }], summary: 's' }),
    deepseek: new Error('network timeout'),
    openai: { httpError: true, status: 401, message: 'invalid api key' },
  });

  await assert.rejects(
    () => orchestrate(SAMPLE_INTAKE, baseConfig({ panelSize: 2 })),
    /only 1\/3 provider\(s\) succeeded/
  );
});

test('orchestrate: rejects panelSize < 2 without making any network calls', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('should not be called');
  };

  await assert.rejects(() => orchestrate(SAMPLE_INTAKE, baseConfig({ panelSize: 1 })), /panelSize must be an integer >= 2/);
  assert.equal(called, false);
});

test('orchestrate: rejects an unknown provider name', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({ considerations: [{ text: 'ok', confidence: 0.5 }], summary: 's' }),
  });

  await assert.rejects(
    () =>
      orchestrate(SAMPLE_INTAKE, {
        providers: [
          { name: 'unknown-provider', model: 'x', apiKeyEnvVar: 'X' },
          { name: 'anthropic', model: 'claude-sonnet-5', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
        ],
        panelSize: 2,
        personaStyle: 'generic',
      }),
    /only 1\/2 provider\(s\) succeeded/
  );
});

test('orchestrate: flags divergence when providers disagree on red flags and on the top consideration', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({
      considerations: [{ text: 'Likely benign muscle strain', confidence: 0.6 }],
      redFlags: [],
      summary: 'Probably a simple strain.',
    }),
    deepseek: structuredReply({
      considerations: [{ text: 'Possible cardiac event requiring urgent evaluation', confidence: 0.5 }],
      redFlags: ['Chest pain with exertion could indicate a heart problem'],
      summary: 'This could be serious and needs urgent in-person evaluation.',
    }),
  });

  const recommendation = await orchestrate(SAMPLE_INTAKE, baseConfig({ providers: baseConfig().providers.slice(0, 2), panelSize: 2 }));
  assert.equal(recommendation.divergenceFlag, true);
  // On divergence, the more cautious (red-flag-raising) provider's summary should win.
  assert.match(recommendation.plainLanguageSummary, /urgent/i);
});

test('orchestrate: includes billingSuggestions only when config.jurisdiction is set, deduped by code+jurisdiction', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({
      considerations: [{ text: 'Likely viral illness', confidence: 0.6 }],
      summary: 's1',
      billingSuggestions: [{ code: '99213', description: 'Office visit', jurisdiction: 'CPT-generic' }],
    }),
    deepseek: structuredReply({
      considerations: [{ text: 'Likely viral illness', confidence: 0.5 }],
      summary: 's2',
      billingSuggestions: [{ code: '99213', description: 'Office visit', jurisdiction: 'CPT-generic' }],
    }),
  });

  const recommendation = await orchestrate(
    SAMPLE_INTAKE,
    baseConfig({ providers: baseConfig().providers.slice(0, 2), panelSize: 2, jurisdiction: 'CPT-generic' })
  );
  assert.deepEqual(recommendation.billingSuggestions, [
    { code: '99213', description: 'Office visit', jurisdiction: 'CPT-generic' },
  ]);
});

test('getRecommendation (core/index.cjs): rejects malformed IntakeAnswers before any network call', async () => {
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error('should not be called');
  };

  await assert.rejects(
    () => getRecommendation({ /* missing required chiefComplaint/followUps */ }, baseConfig()),
    /IntakeAnswers failed schema validation/
  );
  assert.equal(called, false);
});

test('getRecommendation (core/index.cjs): end-to-end happy path matches recommendation.schema.json', async () => {
  global.fetch = makeFetchMock({
    anthropic: structuredReply({
      considerations: [{ text: 'Likely a viral upper respiratory infection', confidence: 0.7 }],
      suggestedNextSteps: ['Rest and drink fluids.'],
      summary: 'Likely viral; supportive care should help.',
    }),
    deepseek: structuredReply({
      considerations: [{ text: 'Likely a viral upper respiratory infection', confidence: 0.6 }],
      suggestedNextSteps: ['Drink fluids and rest.'],
      summary: 'Likely viral.',
    }),
  });

  const recommendation = await getRecommendation(
    SAMPLE_INTAKE,
    baseConfig({ providers: baseConfig().providers.slice(0, 2), panelSize: 2 })
  );
  assert.doesNotThrow(() => assertValidRecommendation(recommendation));
});
