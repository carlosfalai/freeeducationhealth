'use strict';

/**
 * Loads persona/style-guide markdown by name for
 * `core/panel/orchestrate.cjs` to fold into each provider's system prompt.
 *
 * `"generic"` (core/persona/style-guide.md) is the only style guaranteed to
 * exist -- see the PHI-scrub gate note in
 * docs/superpowers/specs/2026-07-01-freeeducationhealth-design.md. A
 * self-hosted deployment may drop in additional persona files here (e.g.
 * `core/persona/my-clinic.md`) and reference them by
 * `PanelConfig.personaStyle`, but only after they've passed the same
 * PHI-scrub verification the generic guide already meets.
 */

const fs = require('node:fs');
const path = require('node:path');

const GENERIC_STYLE = 'generic';
const GENERIC_FILE = path.join(__dirname, 'style-guide.md');

/**
 * @param {string} personaStyle - `PanelConfig.personaStyle`, e.g. "generic".
 * @returns {string} the style guide's markdown contents
 */
function loadStyleGuide(personaStyle) {
  const requested = personaStyle || GENERIC_STYLE;

  if (requested === GENERIC_STYLE) {
    return fs.readFileSync(GENERIC_FILE, 'utf8');
  }

  const candidatePath = path.join(__dirname, `${requested}.md`);
  if (fs.existsSync(candidatePath)) {
    return fs.readFileSync(candidatePath, 'utf8');
  }

  throw new Error(
    `[core/persona] unknown personaStyle "${requested}": no file at ` +
      `core/persona/${requested}.md. Falling back silently would risk shipping ` +
      `an unreviewed voice -- add the file (see core/persona/style-guide.md ` +
      `for the shape) or use personaStyle: "generic".`
  );
}

module.exports = { loadStyleGuide, GENERIC_STYLE };
