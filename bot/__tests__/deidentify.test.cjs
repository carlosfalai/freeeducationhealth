'use strict';

const { redactText, deidentifyIntakeAnswers } = require('../deidentify.cjs');

describe('deidentify.cjs redactText', () => {
  test('redacts email addresses', () => {
    expect(redactText('my email is jane.example@example.org thanks')).toBe(
      'my email is [removed: possible email address] thanks'
    );
  });

  test('redacts formatted phone numbers in common shapes', () => {
    expect(redactText('call 514-555-0142 anytime')).toBe(
      'call [removed: possible phone number] anytime'
    );
    expect(redactText('+1 (514) 555-0142')).toBe('[removed: possible phone number]');
    expect(redactText('514.555.0142')).toBe('[removed: possible phone number]');
  });

  test('redacts bare digit runs of phone length', () => {
    expect(redactText('reach me at 5145550142 ok')).toBe(
      'reach me at [removed: possible phone number] ok'
    );
  });

  test('redacts 8+ digit runs as possible ID/health-card numbers, even glued to letters', () => {
    expect(redactText('my number is 123456789012')).toBe(
      'my number is [removed: possible ID/health card number]'
    );
    expect(redactText('card ABCD12345678')).toBe(
      'card ABCD[removed: possible ID/health card number]'
    );
  });

  test('redacts probable full names mid-sentence', () => {
    expect(redactText('I am Jane Example and my chest hurts')).toBe(
      'I am [removed: possible name] and my chest hurts'
    );
  });

  test('still catches a name that follows a sentence-initial common word', () => {
    // "Hello" is explained by sentence casing, but "Jane Example" is not.
    expect(redactText('Hello Jane Example')).toBe('Hello [removed: possible name]');
  });

  test('does not redact common capitalized phrases', () => {
    expect(redactText('Thank You Doctor')).toBe('Thank You Doctor');
    expect(redactText('It started last Monday Morning')).toBe('It started last Monday Morning');
  });

  test('does not redact short clinical number pairs as phone numbers', () => {
    // Age brackets, blood-pressure-style readings, and small ranges carry
    // clinical meaning and have far fewer digits than any real phone number.
    expect(redactText('40-64')).toBe('40-64');
    expect(redactText('blood pressure around 120-80 lately')).toBe(
      'blood pressure around 120-80 lately'
    );
    expect(redactText('for 10-15 minutes at a time')).toBe('for 10-15 minutes at a time');
  });

  test('leaves ordinary symptom text with small numbers untouched', () => {
    const text = 'pain is 7 out of 10 for 3 days';
    expect(redactText(text)).toBe(text);
  });

  test('handles non-string and empty input without throwing', () => {
    expect(redactText('')).toBe('');
    expect(redactText(null)).toBe(null);
    expect(redactText(undefined)).toBe(undefined);
    expect(redactText(42)).toBe(42);
  });

  test('known limitation (documented): capitalized non-name phrases can be over-redacted', () => {
    // This asserts the documented tradeoff so a future "fix" that silently
    // changes the failure mode shows up in the test run.
    expect(redactText('I took Tylenol Extra Strength')).toContain('[removed: possible name]');
  });
});

describe('deidentify.cjs deidentifyIntakeAnswers', () => {
  function sampleIntake() {
    return {
      intakeId: 'test-intake-id',
      locale: 'en',
      chiefComplaint: 'chest pain, I am Jane Example, call 514-555-0142',
      onsetAndDuration: 'started 2 days ago, email me at jane@example.org',
      followUps: [
        { question: 'How severe?', answer: 7, topic: 'severity' },
        { question: 'Any red flags?', answer: false, topic: 'red-flag-screen' },
        { question: 'Anything else?', answer: 'my card is 123456789012', topic: 'associated-symptoms' },
        { question: 'Age range?', answer: '40-64', topic: 'demographics' },
        { question: 'Skipped one', answer: null, topic: null },
      ],
      ageRange: '40-64',
      sex: 'unspecified',
      freeTextNotes: null,
    };
  }

  test('redacts every free-text field on the copy', () => {
    const redacted = deidentifyIntakeAnswers(sampleIntake());
    expect(redacted.chiefComplaint).toBe(
      'chest pain, I am [removed: possible name], call [removed: possible phone number]'
    );
    expect(redacted.onsetAndDuration).toBe(
      'started 2 days ago, email me at [removed: possible email address]'
    );
    expect(redacted.followUps[2].answer).toBe(
      'my card is [removed: possible ID/health card number]'
    );
  });

  test('leaves non-string answers and structured fields alone', () => {
    const redacted = deidentifyIntakeAnswers(sampleIntake());
    expect(redacted.followUps[0].answer).toBe(7);
    expect(redacted.followUps[1].answer).toBe(false);
    expect(redacted.followUps[3].answer).toBe('40-64');
    expect(redacted.followUps[4].answer).toBeNull();
    expect(redacted.ageRange).toBe('40-64');
    expect(redacted.sex).toBe('unspecified');
    expect(redacted.locale).toBe('en');
    expect(redacted.intakeId).toBe('test-intake-id');
    expect(redacted.freeTextNotes).toBeNull();
  });

  test('never mutates the original object (patient-facing copy stays clean)', () => {
    const original = sampleIntake();
    const before = JSON.parse(JSON.stringify(original));
    deidentifyIntakeAnswers(original);
    expect(original).toEqual(before);
    expect(original.chiefComplaint).toContain('Jane Example');
  });

  test('redacts freeTextNotes when present', () => {
    const original = sampleIntake();
    original.freeTextNotes = 'you can also reach my son at +1 (555) 010-0123';
    const redacted = deidentifyIntakeAnswers(original);
    expect(redacted.freeTextNotes).toBe(
      'you can also reach my son at [removed: possible phone number]'
    );
    expect(original.freeTextNotes).toContain('010-0123');
  });
});
