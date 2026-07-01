'use strict';

const { t, STRINGS, DEFAULT_LOCALE } = require('../strings.cjs');

describe('strings.cjs', () => {
  test('returns the requested key for a populated locale', () => {
    expect(t('en', 'askChiefComplaint')).toBe(STRINGS.en.askChiefComplaint);
  });

  test('falls back to the default locale for an unpopulated locale', () => {
    expect(t('fr-CA', 'askChiefComplaint')).toBe(STRINGS[DEFAULT_LOCALE].askChiefComplaint);
  });

  test('returns an empty string for an unknown key rather than throwing', () => {
    expect(t('en', 'thisKeyDoesNotExist')).toBe('');
  });

  test('interpolates {{name}} placeholders when vars are supplied', () => {
    const withVar = {
      en: { greeting: 'Hello {{name}}, welcome' },
    };
    const originalEn = STRINGS.en;
    STRINGS.en = { ...originalEn, ...withVar.en };
    try {
      expect(t('en', 'greeting', { name: 'there' })).toBe('Hello there, welcome');
    } finally {
      STRINGS.en = originalEn;
    }
  });

  test('the hard-coded emergency banner text exists and is non-trivial', () => {
    expect(STRINGS.en.emergencyBanner.length).toBeGreaterThan(40);
    expect(STRINGS.en.emergencyBanner.toLowerCase()).toContain('emergency');
  });
});
