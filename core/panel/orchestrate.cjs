'use strict';

/**
 * N-model panel orchestration.
 *
 * This is the "physician oversight substitute" described in
 * docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md: with no
 * clinician reviewing output in most self-hosted deployments, independent
 * models must reach consensus, and material disagreement must be surfaced
 * (`divergenceFlag`) rather than silently resolved by picking one model's
 * answer.
 *
 * Per core/INTERFACE.md, none of the aggregation logic in this file is part
 * of the stable contract -- only the RecommendationObject shape it produces
 * is. The consensus/divergence heuristics here are simple and legible on
 * purpose (token-overlap clustering, not embeddings) and are expected to
 * evolve.
 */

const { loadStyleGuide } = require('../persona/load.cjs');
const { assertValidRecommendation } = require('../schema/validate.cjs');

const anthropic = require('../providers/anthropic.cjs');
const deepseek = require('../providers/deepseek.cjs');
const openai = require('../providers/openai.cjs');
const gemini = require('../providers/gemini.cjs');
const local = require('../providers/local.cjs');

/** Maps PanelConfig.providers[].name -> the adapter module that handles it. */
const PROVIDER_REGISTRY = {
  anthropic,
  deepseek,
  openai,
  gemini,
  local,
  'openai-compatible': local,
};

const STOPWORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'been',
  'could',
  'would',
  'likely',
  'consistent',
  'possible',
  'associated',
  'their',
  'there',
  'which',
  'being',
  'about',
  'these',
  'those',
  'other',
  'presenting',
  'presentation',
]);

const RESPONSE_SHAPE_EXAMPLE = {
  considerations: [{ text: 'string', confidence: 0.0 }],
  redFlags: ['string'],
  suggestedNextSteps: ['string'],
  summary: 'string',
  billingSuggestions: [{ code: 'string', description: 'string', jurisdiction: 'string' }],
};

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

/**
 * @param {import('../INTERFACE.md')} config - PanelConfig (see core/INTERFACE.md)
 * @returns {string}
 */
function buildSystemPrompt(config) {
  const styleGuide = loadStyleGuide(config.personaStyle);
  return [
    styleGuide,
    '',
    '---',
    '',
    'You are participating as one independent model in a multi-AI clinical-reasoning ' +
      'panel for FreeEducationHealth, a free, self-hosted health-education/triage tool. ' +
      'In most deployments there is no physician reviewing your output before it reaches ' +
      'the user -- your calibrated honesty and the structured output format requested in ' +
      'the user message are the safety mechanism, not a human in the loop. Follow the ' +
      'style guide above, and respond ONLY with the JSON object requested -- no markdown ' +
      'code fences, no commentary outside the JSON.',
  ].join('\n');
}

/**
 * @param {object} intakeAnswers - IntakeAnswers (see core/schema/intake.schema.json)
 * @param {object} config - PanelConfig
 * @returns {string}
 */
function buildUserPrompt(intakeAnswers, config) {
  const lines = [];
  lines.push(
    'Review the following structured intake and respond with a single JSON object ONLY ' +
      '(no prose before or after, no code fence) matching exactly this shape:'
  );
  lines.push(JSON.stringify(RESPONSE_SHAPE_EXAMPLE, null, 2));
  lines.push('');
  lines.push('Field rules:');
  lines.push(
    '- "considerations": ranked list of plain-language clinical possibilities, each with ' +
      'a "confidence" from 0 to 1. These are considerations, not a diagnosis -- do not label them as one.'
  );
  lines.push(
    '- "redFlags": urgent findings from the intake that warrant seeking care sooner, in ' +
      'plain language. Use an empty array if none -- do not pad this with generic boilerplate.'
  );
  lines.push(
    '- "suggestedNextSteps": concrete, actionable, ordered steps for someone who may have ' +
      'no doctor reachable nearby (see the style guide above). Least-invasive/most-immediately-actionable first.'
  );
  lines.push('- "summary": a short plain-language summary suitable for direct display to the patient.');
  if (config.jurisdiction) {
    lines.push(
      `- "billingSuggestions": jurisdiction-aware billing code suggestions for jurisdiction ` +
        `"${config.jurisdiction}", each as {code, description, jurisdiction}. Use [] if unsure -- ` +
        'do not invent a code you are not reasonably confident exists.'
    );
  } else {
    lines.push('- "billingSuggestions": omit or use [] -- no jurisdiction was provided for this request.');
  }
  lines.push('');
  lines.push('--- STRUCTURED INTAKE ---');
  lines.push(`Chief complaint: ${intakeAnswers.chiefComplaint}`);
  if (intakeAnswers.onsetAndDuration) {
    lines.push(`Onset/duration: ${intakeAnswers.onsetAndDuration}`);
  }
  if (intakeAnswers.ageRange) lines.push(`Age range: ${intakeAnswers.ageRange}`);
  if (intakeAnswers.sex) lines.push(`Sex: ${intakeAnswers.sex}`);

  if (Array.isArray(intakeAnswers.followUps) && intakeAnswers.followUps.length > 0) {
    lines.push('Follow-up questions and answers:');
    for (const fu of intakeAnswers.followUps) {
      const topic = fu.topic ? ` [${fu.topic}]` : '';
      lines.push(`  - Q: ${fu.question}${topic}`);
      const answerText = fu.answer === null || fu.answer === undefined ? '(not answered / unknown)' : fu.answer;
      lines.push(`    A: ${answerText}`);
    }
  }

  if (Array.isArray(intakeAnswers.relevantHistory) && intakeAnswers.relevantHistory.length > 0) {
    lines.push('Relevant history:');
    for (const item of intakeAnswers.relevantHistory) {
      lines.push(`  - ${item.type}: ${item.value}`);
    }
  }

  if (intakeAnswers.freeTextNotes) {
    lines.push(`Additional notes: ${intakeAnswers.freeTextNotes}`);
  }

  const locale = config.locale || intakeAnswers.locale;
  if (locale) {
    lines.push('');
    lines.push(
      `Respond in language/locale: ${locale}. Keep JSON keys in English exactly as shown -- ` +
        'only the text values should be written in that language.'
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Provider response parsing
// ---------------------------------------------------------------------------

/**
 * Extract a JSON object substring from raw model output, tolerating models
 * that wrap the JSON in a code fence or a sentence of prose despite
 * instructions.
 *
 * @param {string} rawText
 * @returns {string}
 */
function extractJson(rawText) {
  const trimmed = String(rawText || '').trim();
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // fall through to bracket extraction below
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object found in response');
  }
  return trimmed.slice(start, end + 1);
}

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Parse and defensively coerce one provider's raw text reply into a
 * normalized shape used by the aggregation functions below.
 *
 * @param {string} rawText
 * @param {string} providerName
 * @returns {{providerName: string, considerations: Array<{text:string,confidence:number}>, redFlags: string[], suggestedNextSteps: string[], summary: string, billingSuggestions: Array<object>}}
 */
function parseProviderResponse(rawText, providerName) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(rawText));
  } catch (err) {
    throw new Error(`provider "${providerName}" did not return parseable JSON: ${err.message}`);
  }

  const considerations = Array.isArray(parsed.considerations)
    ? parsed.considerations
        .filter((c) => c && typeof c.text === 'string' && c.text.trim())
        .map((c) => ({ text: c.text.trim(), confidence: clamp01(c.confidence) }))
    : [];

  const redFlags = Array.isArray(parsed.redFlags)
    ? parsed.redFlags.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim())
    : [];

  const suggestedNextSteps = Array.isArray(parsed.suggestedNextSteps)
    ? parsed.suggestedNextSteps.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
    : [];

  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';

  const billingSuggestions = Array.isArray(parsed.billingSuggestions)
    ? parsed.billingSuggestions.filter((b) => b && b.code && b.jurisdiction)
    : [];

  if (considerations.length === 0 && !summary) {
    throw new Error(`provider "${providerName}" returned an unusable response (no considerations or summary)`);
  }

  return { providerName, considerations, redFlags, suggestedNextSteps, summary, billingSuggestions };
}

// ---------------------------------------------------------------------------
// Cross-provider aggregation (the "simple heuristic" the contract allows)
// ---------------------------------------------------------------------------

/**
 * @param {string} text
 * @returns {Set<string>}
 */
function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOPWORDS.has(token))
  );
}

/**
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0..1
 */
function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * True if the panel disagreed materially: either some providers raised a
 * red flag while others raised none, or their top-ranked considerations
 * share no meaningful vocabulary at all. Front-ends should surface this
 * flag rather than silently trust the blended answer (see
 * recommendation.schema.json's `divergenceFlag` description).
 *
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @returns {boolean}
 */
function detectDivergence(results) {
  if (results.length < 2) return false;

  const anyRedFlags = results.map((r) => r.redFlags.length > 0);
  if (anyRedFlags.some(Boolean) && anyRedFlags.some((v) => !v)) {
    return true;
  }

  const topTokenSets = results
    .map((r) => (r.considerations[0] ? tokenize(r.considerations[0].text) : new Set()))
    .filter((set) => set.size > 0);

  for (let i = 0; i < topTokenSets.length; i++) {
    for (let j = i + 1; j < topTokenSets.length; j++) {
      if (jaccard(topTokenSets[i], topTokenSets[j]) === 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Pick the most-repeated (mode), longest-on-tie text to represent a cluster
 * of near-duplicate considerations raised by different providers.
 *
 * @param {string[]} texts
 * @returns {string}
 */
function pickRepresentativeText(texts) {
  const counts = new Map();
  for (const text of texts) counts.set(text, (counts.get(text) || 0) + 1);

  let best = texts[0];
  let bestScore = [counts.get(best) || 1, best.length];
  for (const text of texts) {
    const score = [counts.get(text) || 1, text.length];
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      best = text;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Cluster near-duplicate considerations across providers (token-overlap
 * >= 0.3) and score each cluster by summed confidence divided by the total
 * number of providers consulted -- so a consideration only one of four
 * providers raised scores lower than one all four agreed on, per
 * recommendation.schema.json's confidence description ("reflects agreement
 * across panel members").
 *
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @param {number} totalProviders
 * @param {number} [cap]
 * @returns {Array<{text: string, confidence: number}>}
 */
function mergeConsiderations(results, totalProviders, cap = 6) {
  const clusters = [];

  for (const result of results) {
    for (const consideration of result.considerations) {
      const tokens = tokenize(consideration.text);
      const cluster = clusters.find((c) => jaccard(tokens, c.tokens) >= 0.3);
      if (cluster) {
        cluster.texts.push(consideration.text);
        cluster.confidenceSum += consideration.confidence;
      } else {
        clusters.push({ tokens, texts: [consideration.text], confidenceSum: consideration.confidence });
      }
    }
  }

  return clusters
    .map((cluster) => ({
      text: pickRepresentativeText(cluster.texts),
      confidence: Math.round((cluster.confidenceSum / totalProviders) * 100) / 100,
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, cap);
}

/**
 * Union of red flags across all providers, de-duplicated by token overlap.
 * Any provider raising a red flag is enough to surface it -- this is a
 * safety-first union, not a majority vote.
 *
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @returns {string[]}
 */
function mergeRedFlags(results) {
  const clusters = [];
  for (const result of results) {
    for (const flag of result.redFlags) {
      const tokens = tokenize(flag);
      const isDuplicate = clusters.some((c) => jaccard(tokens, c.tokens) >= 0.4);
      if (!isDuplicate) clusters.push({ tokens, text: flag });
    }
  }
  return clusters.map((c) => c.text);
}

/**
 * Merge next-step lists in provider order, de-duplicating near-identical
 * steps so the ordering (least-invasive first) from whichever provider
 * suggested a step first is preserved.
 *
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @param {number} [cap]
 * @returns {string[]}
 */
function mergeNextSteps(results, cap = 8) {
  const steps = [];
  const tokenSets = [];
  for (const result of results) {
    for (const step of result.suggestedNextSteps) {
      if (steps.length >= cap) return steps;
      const tokens = tokenize(step);
      const isDuplicate = tokenSets.some((t) => jaccard(tokens, t) >= 0.4);
      if (!isDuplicate) {
        steps.push(step);
        tokenSets.push(tokens);
      }
    }
  }
  return steps;
}

/**
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @returns {Array<{code:string,description:string,jurisdiction:string}>|null}
 */
function mergeBillingSuggestions(results) {
  const seen = new Map();
  for (const result of results) {
    for (const item of result.billingSuggestions) {
      const key = `${item.jurisdiction}::${item.code}`;
      if (!seen.has(key)) {
        seen.set(key, {
          code: String(item.code),
          description: String(item.description || ''),
          jurisdiction: String(item.jurisdiction),
        });
      }
    }
  }
  const merged = Array.from(seen.values());
  return merged.length > 0 ? merged : null;
}

/**
 * Choose the single plainLanguageSummary to return. On consensus, use the
 * first successful provider's summary (provider order = self-hoster's
 * configured order). On divergence, prefer the summary from whichever
 * provider raised the most red flags -- erring cautious when the panel
 * disagrees, since there is usually no clinician in the loop to break the
 * tie.
 *
 * @param {ReturnType<typeof parseProviderResponse>[]} results
 * @param {boolean} divergenceFlag
 * @returns {string}
 */
function pickSummary(results, divergenceFlag) {
  const ordered = divergenceFlag ? [...results].sort((a, b) => b.redFlags.length - a.redFlags.length) : results;
  const withSummary = ordered.find((r) => r.summary);
  if (withSummary) return withSummary.summary;
  return (
    'The panel could not produce a plain-language summary for this intake -- ' +
    'please review the considerations and next steps below.'
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Fan out `intakeAnswers` to every provider in `config.providers`, parse
 * and aggregate the successful responses into a RecommendationObject, and
 * validate the result against recommendation.schema.json before returning.
 *
 * Throws (does not silently degrade) if fewer than `config.panelSize`
 * providers succeed -- see core/INTERFACE.md.
 *
 * @param {object} intakeAnswers - IntakeAnswers
 * @param {object} config - PanelConfig
 * @returns {Promise<object>} RecommendationObject
 */
async function orchestrate(intakeAnswers, config) {
  if (!config || typeof config !== 'object') {
    throw new Error('[core/panel] config is required');
  }
  if (!Array.isArray(config.providers) || config.providers.length === 0) {
    throw new Error('[core/panel] config.providers must be a non-empty array (see core/INTERFACE.md)');
  }
  if (!Number.isInteger(config.panelSize) || config.panelSize < 2) {
    throw new Error('[core/panel] config.panelSize must be an integer >= 2 (see core/INTERFACE.md)');
  }
  if (config.providers.length < config.panelSize) {
    throw new Error(
      `[core/panel] config.panelSize is ${config.panelSize} but only ${config.providers.length} ` +
        'provider(s) are configured -- this requirement could never be satisfied'
    );
  }

  const prompt = {
    systemPrompt: buildSystemPrompt(config),
    userPrompt: buildUserPrompt(intakeAnswers, config),
  };

  const settled = await Promise.allSettled(
    config.providers.map(async (providerEntry) => {
      const adapter = PROVIDER_REGISTRY[providerEntry.name];
      if (!adapter) {
        throw new Error(
          `unknown provider "${providerEntry.name}" -- expected one of: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`
        );
      }
      const rawText = await adapter(prompt, providerEntry);
      return parseProviderResponse(rawText, providerEntry.name);
    })
  );

  const successes = [];
  const failureMessages = [];
  settled.forEach((result, index) => {
    const providerName = config.providers[index].name;
    if (result.status === 'fulfilled') {
      successes.push(result.value);
    } else {
      const reason = result.reason && result.reason.message ? result.reason.message : String(result.reason);
      failureMessages.push(`${providerName}: ${reason}`);
    }
  });

  if (successes.length < config.panelSize) {
    throw new Error(
      `[core/panel] only ${successes.length}/${config.providers.length} provider(s) succeeded, ` +
        `need >= panelSize (${config.panelSize}). This is a hard failure, not a silent single-model ` +
        `fallback -- see core/INTERFACE.md. Failures: ${failureMessages.join(' | ') || 'none'}`
    );
  }

  const divergenceFlag = detectDivergence(successes);

  const recommendation = {
    considerations: mergeConsiderations(successes, successes.length),
    divergenceFlag,
    redFlags: mergeRedFlags(successes),
    suggestedNextSteps: mergeNextSteps(successes),
    billingSuggestions: config.jurisdiction ? mergeBillingSuggestions(successes) : null,
    plainLanguageSummary: pickSummary(successes, divergenceFlag),
    panelMeta: {
      providersConsulted: successes.map((s) => s.providerName),
      panelSize: successes.length,
      generatedAt: new Date().toISOString(),
    },
  };

  assertValidRecommendation(recommendation);
  return recommendation;
}

module.exports = {
  orchestrate,
  // Exported for unit testing -- not part of core/INTERFACE.md's contract.
  buildSystemPrompt,
  buildUserPrompt,
  parseProviderResponse,
  detectDivergence,
  mergeConsiderations,
  mergeRedFlags,
  mergeNextSteps,
  mergeBillingSuggestions,
  pickSummary,
  PROVIDER_REGISTRY,
};
