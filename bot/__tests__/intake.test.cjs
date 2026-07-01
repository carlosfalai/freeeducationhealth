'use strict';

const path = require('path');
// The schema declares $schema: draft/2020-12, which needs ajv's dedicated
// 2020 build -- the default `ajv` export only understands draft-07.
const Ajv2020 = require('ajv/dist/2020');

const session = require('../session.cjs');
const intake = require('../intake.cjs');

const intakeSchema = require(path.join('..', '..', 'core', 'schema', 'intake.schema.json'));

function walkThroughFullIntake(chiefComplaint, answers) {
  const s = session.resetSession(999, 'en');
  s.stage = session.STAGES.AWAITING_CHIEF_COMPLAINT;
  intake.recordChiefComplaint(s, chiefComplaint);
  for (const answer of answers) {
    intake.recordFollowUpAnswer(s, answer);
  }
  return s;
}

describe('intake.cjs coerceAnswer', () => {
  test('recognizes skip words as null regardless of case', () => {
    expect(intake.coerceAnswer('Skip', 'text')).toBeNull();
    expect(intake.coerceAnswer('NONE', 'text')).toBeNull();
    expect(intake.coerceAnswer('  ', 'text')).toBeNull();
  });

  test('parses numeric answers to numbers', () => {
    expect(intake.coerceAnswer('7', 'number')).toBe(7);
  });

  test('falls back to raw text when a number answer does not parse', () => {
    expect(intake.coerceAnswer('pretty bad', 'number')).toBe('pretty bad');
  });

  test('parses yes/no answers to booleans', () => {
    expect(intake.coerceAnswer('yes', 'yesno')).toBe(true);
    expect(intake.coerceAnswer('No', 'yesno')).toBe(false);
  });

  test('leaves unrecognized yesno answers as free text rather than guessing', () => {
    expect(intake.coerceAnswer('sometimes', 'yesno')).toBe('sometimes');
  });
});

describe('intake.cjs question sequencing', () => {
  afterEach(() => session.clearSession(999));

  test('moves from AWAITING_CHIEF_COMPLAINT to ASKING_FOLLOWUPS', () => {
    const s = session.resetSession(999, 'en');
    s.stage = session.STAGES.AWAITING_CHIEF_COMPLAINT;
    intake.recordChiefComplaint(s, 'Fever for two days');
    expect(s.stage).toBe(session.STAGES.ASKING_FOLLOWUPS);
    expect(s.chiefComplaint).toBe('Fever for two days');
    expect(intake.nextQuestionKey(s)).toBe(intake.FOLLOWUP_QUESTIONS[0].promptKey);
  });

  test('advances to PROCESSING after the last follow-up question', () => {
    const s = walkThroughFullIntake('Fever for two days', [
      'started yesterday',
      '6',
      'no',
      'chills',
      '18-39',
      'skip',
    ]);
    expect(s.stage).toBe(session.STAGES.PROCESSING);
    expect(intake.nextQuestionKey(s)).toBeNull();
    expect(s.followUps).toHaveLength(intake.FOLLOWUP_QUESTIONS.length);
  });

  test('ignores extra answers once the sequence is already complete', () => {
    const s = walkThroughFullIntake('Fever', ['a', '1', 'no', 'none', 'skip', 'skip']);
    const followUpsBefore = s.followUps.length;
    intake.recordFollowUpAnswer(s, 'ignored');
    expect(s.followUps.length).toBe(followUpsBefore);
  });
});

describe('intake.cjs buildIntakeAnswers schema compliance', () => {
  afterEach(() => session.clearSession(999));

  const ajv = new Ajv2020({ strict: false });
  const validate = ajv.compile(intakeSchema);

  test('produces an object valid against core/schema/intake.schema.json', () => {
    const s = walkThroughFullIntake('Fever for two days', [
      'started yesterday, getting worse',
      '6',
      'no',
      'chills and body aches',
      '18-39',
      'male',
    ]);
    const answers = intake.buildIntakeAnswers(s);
    const valid = validate(answers);
    expect(valid).toBe(true);
    if (!valid) console.error(validate.errors);
  });

  test('remains valid when every follow-up is skipped', () => {
    const s = walkThroughFullIntake('Fever', ['skip', 'skip', 'skip', 'skip', 'skip', 'skip']);
    const answers = intake.buildIntakeAnswers(s);
    expect(validate(answers)).toBe(true);
  });

  test('never includes a jurisdiction field', () => {
    const s = walkThroughFullIntake('Fever', ['skip', 'skip', 'skip', 'skip', 'skip', 'skip']);
    const answers = intake.buildIntakeAnswers(s);
    expect(Object.prototype.hasOwnProperty.call(answers, 'jurisdiction')).toBe(false);
  });
});
