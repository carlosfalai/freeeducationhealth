'use strict';

/**
 * Shared JSON Schema (2020-12) validators for the two contract shapes core/
 * commits to in core/INTERFACE.md: IntakeAnswers (input) and
 * RecommendationObject (output).
 *
 * core/index.cjs uses `assertValidIntake` to fail fast on malformed input
 * before spending API calls on a panel run, and core/panel/orchestrate.cjs
 * uses `assertValidRecommendation` to guarantee it never hands a
 * front-end a shape that doesn't match the published schema.
 */

const Ajv2020 = require('ajv/dist/2020');

const intakeSchema = require('./intake.schema.json');
const recommendationSchema = require('./recommendation.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });

// Recognize (without strictly enforcing) the one string format the schemas
// use, so ajv doesn't warn on every compile. Skipping the ajv-formats
// dependency here is intentional -- core/'s own code is the only writer of
// `generatedAt` (via `new Date().toISOString()`), so full RFC 3339
// enforcement would add a dependency to validate a value core/ controls.
ajv.addFormat('date-time', { type: 'string', validate: () => true });

const validateIntake = ajv.compile(intakeSchema);
const validateRecommendation = ajv.compile(recommendationSchema);

/**
 * @param {import('ajv').ValidateFunction} validator
 * @param {any} data
 * @param {string} label
 */
function assertValid(validator, data, label) {
  const ok = validator(data);
  if (!ok) {
    const details = (validator.errors || [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ');
    const err = new Error(`${label} failed schema validation: ${details}`);
    err.schemaErrors = validator.errors;
    throw err;
  }
}

module.exports = {
  /** Throws if `data` does not match core/schema/intake.schema.json. */
  assertValidIntake(data) {
    assertValid(validateIntake, data, 'IntakeAnswers');
  },
  /** Throws if `data` does not match core/schema/recommendation.schema.json. */
  assertValidRecommendation(data) {
    assertValid(validateRecommendation, data, 'RecommendationObject');
  },
};
