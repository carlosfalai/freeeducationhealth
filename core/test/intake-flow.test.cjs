'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { IntakeFlow, detectCategory, mapAgeToBracket, mapSex } = require('../intake/flow.cjs');
const { assertValidIntake } = require('../schema/validate.cjs');

test('detectCategory routes common chief complaints to the right category', () => {
  assert.equal(detectCategory('I have a fever and chills'), 'fever');
  assert.equal(detectCategory('sharp pain in my lower back'), 'pain');
  assert.equal(detectCategory('persistent dry cough for a week'), 'cough');
  assert.equal(detectCategory('cut my hand while cooking, bleeding'), 'injury');
  assert.equal(detectCategory('feeling generally unwell'), 'general');
});

test('mapAgeToBracket accepts both bracket labels and bare numbers', () => {
  assert.equal(mapAgeToBracket('18-39'), '18-39');
  assert.equal(mapAgeToBracket('34'), '18-39');
  assert.equal(mapAgeToBracket('7'), '2-11');
  assert.equal(mapAgeToBracket('70'), '65+');
  assert.equal(mapAgeToBracket(null), null);
  assert.equal(mapAgeToBracket('not sure'), null);
});

test('mapSex normalizes free text and defaults to unspecified', () => {
  assert.equal(mapSex('male'), 'male');
  assert.equal(mapSex('F'), 'female');
  assert.equal(mapSex(null), 'unspecified');
  assert.equal(mapSex('rather not say'), 'unspecified');
});

test('IntakeFlow end-to-end run (fever category) produces schema-valid IntakeAnswers', () => {
  const flow = new IntakeFlow({ locale: 'en' });

  let step = flow.start();
  assert.equal(step.done, false);
  assert.match(step.question.question, /main problem/i);

  const answers = ['fever and chills for two days', '18-39', 'female', 'started 2 days ago, getting worse'];
  let i = 0;
  while (!step.done) {
    const nextAnswer = i < answers.length ? answers[i] : 'skip';
    step = flow.answer(nextAnswer);
    i++;
    if (i > 30) throw new Error('IntakeFlow did not terminate -- possible infinite loop');
  }

  assert.equal(step.done, true);
  const intake = step.intake;
  assert.equal(intake.chiefComplaint, 'fever and chills for two days');
  assert.equal(intake.ageRange, '18-39');
  assert.equal(intake.sex, 'female');
  assert.ok(intake.followUps.length > 0);
  assert.ok(intake.followUps.some((fu) => fu.topic === 'red-flag-screen'));

  // Must validate against core/schema/intake.schema.json.
  assert.doesNotThrow(() => assertValidIntake(intake));
});

test('IntakeFlow re-prompts once on an empty chief complaint instead of accepting it silently', () => {
  const flow = new IntakeFlow({ askAgeAndSex: false });
  let step = flow.start();
  step = flow.answer('');
  assert.equal(step.done, false);
  assert.match(step.question.question, /please describe/i);

  step = flow.answer(''); // second empty answer -- flow must not hang forever
  assert.equal(step.done, false); // now moved on to the onset question
});

test('IntakeFlow with askAgeAndSex:false skips straight to the onset question', () => {
  const flow = new IntakeFlow({ askAgeAndSex: false });
  let step = flow.start();
  step = flow.answer('persistent cough');
  assert.match(step.question.question, /when did this start/i);
});

test('IntakeFlow records "skip" answers as null, matching the schema convention', () => {
  const flow = new IntakeFlow({ askAgeAndSex: false });
  let step = flow.start();
  step = flow.answer('injury to my leg after a fall');
  step = flow.answer('yesterday, same since'); // onset
  // First injury follow-up question now pending; answer with a skip word.
  step = flow.answer('skip');
  assert.equal(step.done, false);

  while (!step.done) step = flow.answer('skip');
  const skippedEntry = step.intake.followUps[0];
  assert.equal(skippedEntry.answer, null);
});
