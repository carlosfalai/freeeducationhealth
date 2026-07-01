'use strict';

/**
 * Short FAQ block appended at the end of each intake session, once a
 * recommendation has been delivered: what this bot is/isn't, how it works,
 * and a data-privacy note. Text lives in strings.cjs (`faqBlock`) so it
 * follows the same per-locale structure as every other reply.
 */

const { t } = require('./strings.cjs');

/**
 * @param {string} [locale]
 * @returns {string}
 */
function getFaqBlock(locale = 'en') {
  return t(locale, 'faqBlock');
}

module.exports = { getFaqBlock };
