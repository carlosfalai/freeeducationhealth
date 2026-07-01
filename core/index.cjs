'use strict';

/**
 * core/ single entry point -- see core/INTERFACE.md for the full contract.
 *
 * Every front-end (bot/, instanthpi/, epic/) imports only this file:
 *
 *   const { getRecommendation } = require('../core');
 *   const recommendation = await getRecommendation(intakeAnswers, panelConfig);
 *
 * `core/` has no knowledge of Telegram, Spruce, or Epic, has no side
 * effects, and never reads environment variables for provider *selection*
 * (which providers/models to use is entirely the front-end's PanelConfig).
 */

const { orchestrate } = require('./panel/orchestrate.cjs');
const { assertValidIntake } = require('./schema/validate.cjs');
const { IntakeFlow } = require('./intake/flow.cjs');

/**
 * @param {object} intakeAnswers - Must match core/schema/intake.schema.json.
 * @param {object} config - PanelConfig, see core/INTERFACE.md.
 * @returns {Promise<object>} RecommendationObject, matches core/schema/recommendation.schema.json.
 * @throws if `intakeAnswers` fails schema validation, if `config` is
 *   malformed, or if fewer than `config.panelSize` providers succeed.
 */
async function getRecommendation(intakeAnswers, config) {
  // core/ validates its own input defensively (fail fast, before spending
  // API calls on a panel run) even though core/INTERFACE.md only *requires*
  // front-ends to validate intakeAnswers, not core/ itself.
  assertValidIntake(intakeAnswers);
  return orchestrate(intakeAnswers, config);
}

module.exports = {
  getRecommendation,
  // Re-exported for front-ends that want the ready-made conversational
  // intake sequence (core/INTERFACE.md notes this is optional -- a
  // front-end may build IntakeAnswers directly instead, e.g. epic/).
  IntakeFlow,
};
