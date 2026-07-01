'use strict';

const session = require('../session.cjs');

describe('session.cjs', () => {
  afterEach(() => {
    // sessions Map is module-level; keep tests isolated.
    session.clearSession(1);
    session.clearSession(2);
  });

  test('getSession creates a fresh NEW-stage session on first access', () => {
    const s = session.getSession(1);
    expect(s.stage).toBe(session.STAGES.NEW);
    expect(s.followUps).toEqual([]);
    expect(s.chiefComplaint).toBeNull();
  });

  test('getSession returns the same object on repeated access', () => {
    const first = session.getSession(1);
    first.chiefComplaint = 'headache';
    const second = session.getSession(1);
    expect(second).toBe(first);
    expect(second.chiefComplaint).toBe('headache');
  });

  test('resetSession replaces prior state with a fresh session', () => {
    const first = session.getSession(1);
    first.chiefComplaint = 'headache';
    const reset = session.resetSession(1, 'fr');
    expect(reset).not.toBe(first);
    expect(reset.chiefComplaint).toBeNull();
    expect(reset.locale).toBe('fr');
  });

  test('sweepStaleSessions removes only sessions older than maxAgeMs', () => {
    const s1 = session.getSession(1);
    s1.updatedAt = Date.now() - 1000 * 60 * 60; // 1 hour ago
    session.getSession(2); // fresh

    const removed = session.sweepStaleSessions(30 * 60 * 1000);
    expect(removed).toBe(1);

    const s2 = session.getSession(2);
    expect(s2.updatedAt).toBeGreaterThan(Date.now() - 5000);
  });

  test('clearSession removes tracked state entirely', () => {
    session.getSession(1);
    expect(session.sessionCount()).toBeGreaterThan(0);
    session.clearSession(1);
    const fresh = session.getSession(1);
    expect(fresh.stage).toBe(session.STAGES.NEW);
  });
});
