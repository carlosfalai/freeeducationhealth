'use strict';

/**
 * Placeholder implementation of core/'s getRecommendation(), used ONLY when
 * this checkout does not yet have a `../core/index.js` to require. It lets
 * epic/ be run and demoed end-to-end (FHIR read -> intake shape -> draft UI)
 * before core/'s real N-model panel exists, per the design spec's note that
 * front-ends "may be built and tested against a mock implementation of this
 * same contract before core/'s internals are finished"
 * (docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md).
 *
 * THIS DOES NOT CALL ANY AI PROVIDER AND CARRIES NO CLINICAL WEIGHT
 * WHATSOEVER. Every field is hard-coded to say so. server.cjs prefers the
 * real `../core` automatically the moment it exists -- nothing here needs
 * to be wired up manually once core/ ships.
 *
 * @param {object} intakeAnswers - see core/schema/intake.schema.json
 * @param {object} config - see core/INTERFACE.md#panelconfig-shape
 * @returns {Promise<object>} matches core/schema/recommendation.schema.json
 */
async function getRecommendation(intakeAnswers, config) {
  const panelSize = (config && config.panelSize) || 0;
  if (panelSize < 2) {
    // Mirror the real contract's fail-closed behavior even in the mock, so
    // a self-hoster who misconfigures panelSize sees the same failure mode
    // they'll see once the real core/ is wired in.
    throw new Error('PanelConfig.panelSize must be >= 2 (see core/INTERFACE.md#panelconfig-shape).');
  }

  const cc = (intakeAnswers && intakeAnswers.chiefComplaint) || '(no chief complaint provided)';

  return {
    considerations: [
      {
        text:
          '[DEMO PLACEHOLDER -- core/ is not built in this checkout yet, no AI panel ran] ' +
          `Chief complaint received: "${cc}". Once core/index.js exists and exports ` +
          'getRecommendation(), this list will contain ranked clinical considerations from ' +
          'an independent N-model panel instead of this fixed message.',
        confidence: 0
      }
    ],
    divergenceFlag: false,
    redFlags: [],
    suggestedNextSteps: [
      'This is a placeholder response from epic/lib/mock-core.cjs -- it is not medical guidance.',
      'Build core/ per core/INTERFACE.md so epic/server.cjs picks up the real getRecommendation() automatically.'
    ],
    billingSuggestions: null,
    plainLanguageSummary:
      '[DEMO PLACEHOLDER] core/ is not installed in this checkout yet, so no AI panel ran for this ' +
      'case. This screen only demonstrates the FHIR-read -> intake-shape -> recommendation-shape ' +
      'pipeline that epic/ provides.',
    panelMeta: {
      providersConsulted: [],
      panelSize: 0,
      generatedAt: new Date().toISOString()
    }
  };
}

module.exports = { getRecommendation };
