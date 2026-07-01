'use strict';

/**
 * Converts the chart context epic/index.html already read from Epic via the
 * `fhirclient` package (Patient + Condition/MedicationRequest/
 * AllergyIntolerance/Observation, flattened client-side into plain
 * description strings -- see index.html's `summarize*()` helpers) into an
 * object that validates against core/schema/intake.schema.json.
 *
 * This is the one place epic/ knows anything about FHIR-shaped data.
 * Everything downstream (core/) only ever sees the generic IntakeAnswers
 * contract documented in core/INTERFACE.md and has no FHIR-specific code.
 *
 * Deliberately excludes anything PHI-as-identity (name, MRN, exact date of
 * birth, phone, address) -- per core/INTERFACE.md, none of that belongs in
 * IntakeAnswers. index.html buckets age into a coarse range and never sends
 * the patient's name/MRN to this route in the first place.
 */

const AGE_RANGES = new Set(['0-1', '2-11', '12-17', '18-39', '40-64', '65+']);
const SEXES = new Set(['male', 'female', 'unspecified']);

function cleanStringArray(values) {
  return (Array.isArray(values) ? values : [])
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

function toRelevantHistory(body) {
  const items = [];
  const push = (type, values) => {
    cleanStringArray(values).forEach((value) => items.push({ type, value }));
  };
  push('condition', body.problems);
  push('medication', body.medications);
  push('allergy', body.allergies);
  return items;
}

function buildFreeTextNotes(body) {
  const parts = [];
  const vitals = cleanStringArray(body.vitals);
  if (vitals.length) {
    parts.push(`Recent vitals from chart: ${vitals.join('; ')}`);
  }
  if (typeof body.freeTextNotes === 'string' && body.freeTextNotes.trim()) {
    parts.push(body.freeTextNotes.trim());
  }
  return parts.length ? parts.join('\n\n') : null;
}

function buildFollowUps(body) {
  if (!Array.isArray(body.followUps)) return [];
  return body.followUps
    .filter((f) => f && typeof f.question === 'string' && f.question.trim())
    .map((f) => ({
      question: f.question.trim(),
      answer: f.answer === undefined || f.answer === '' ? null : f.answer,
      topic: typeof f.topic === 'string' && f.topic.trim() ? f.topic.trim() : null
    }));
}

/**
 * @param {object} body - POST /api/recommendation request body (see server.cjs)
 * @returns {{intake: object, errors: string[]}} `intake` matches
 *   core/schema/intake.schema.json when `errors` is empty.
 */
function fhirChartToIntake(body) {
  body = body && typeof body === 'object' ? body : {};
  const errors = [];

  const chiefComplaint = typeof body.chiefComplaint === 'string' ? body.chiefComplaint.trim() : '';
  if (!chiefComplaint) {
    errors.push(
      'chiefComplaint is required. A FHIR read alone has no structured "reason for visit" field ' +
        'for a standalone launch -- the clinician enters it in the form on index.html.'
    );
  }

  const ageRange = AGE_RANGES.has(body.ageRange) ? body.ageRange : null;
  const sex = SEXES.has(body.sex) ? body.sex : null;
  const jurisdiction = typeof body.jurisdiction === 'string' && body.jurisdiction.trim() ? body.jurisdiction.trim() : null;
  const locale = typeof body.locale === 'string' && body.locale.trim() ? body.locale.trim() : 'en';
  const onsetAndDuration =
    typeof body.onsetAndDuration === 'string' && body.onsetAndDuration.trim() ? body.onsetAndDuration.trim() : null;

  const intake = {
    locale,
    jurisdiction,
    chiefComplaint,
    onsetAndDuration,
    followUps: buildFollowUps(body),
    relevantHistory: toRelevantHistory(body),
    freeTextNotes: buildFreeTextNotes(body),
    ageRange,
    sex
  };

  if (typeof body.intakeId === 'string' && body.intakeId.trim()) {
    intake.intakeId = body.intakeId.trim();
  }

  return { intake, errors };
}

module.exports = { fhirChartToIntake, AGE_RANGES, SEXES };
