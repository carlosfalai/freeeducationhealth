// FreeEducationHealth -- epic/ (SMART on FHIR) server.
//
// Serves the static launch/index pages and one API route:
//
//   POST /api/recommendation
//
// which takes the chart context epic/index.html already read from Epic via
// the `fhirclient` package, reshapes it into core/schema/intake.schema.json
// (see lib/fhir-to-intake.cjs), and calls core/'s getRecommendation()
// (core/INTERFACE.md) to produce a draft recommendation for the clinician
// to review. It never writes anything back to Epic -- see README.md's
// write-back note.
'use strict';

const path = require('path');
const express = require('express');
const { fhirChartToIntake } = require('./lib/fhir-to-intake.cjs');

let panelConfig;
try {
  panelConfig = require('./panel.config.js');
} catch (e) {
  console.warn('[epic] Could not load panel.config.js (%s) -- using a minimal default. Copy/edit panel.config.js.', e.message);
  panelConfig = { providers: [], panelSize: 2, personaStyle: 'generic', jurisdiction: null };
}

// Prefer the real core/ the instant it exists in this checkout (require('../core')
// per core/INTERFACE.md's local-import integration path); fall back to the
// clearly-labeled mock so epic/ is runnable/demoable on its own while core/'s
// N-model panel is still being built. Nothing needs to change here once core/
// ships -- this picks it up automatically on next server start.
let getRecommendation;
let usingMockCore = false;
try {
  ({ getRecommendation } = require('../core'));
  if (typeof getRecommendation !== 'function') throw new Error('../core did not export getRecommendation');
} catch (e) {
  usingMockCore = true;
  ({ getRecommendation } = require('./lib/mock-core.cjs'));
  console.warn('[epic] ../core is not available yet (%s) -- using lib/mock-core.cjs. No real AI panel is running.', e.message);
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// Serve only the specific static files this front-end needs -- deliberately
// NOT express.static(__dirname), which would also publish server.cjs,
// panel.config.js, lib/, package.json, and README.md over HTTP.
const STATIC_FILES = {
  '/': 'launch.html',
  '/launch.html': 'launch.html',
  '/index.html': 'index.html',
  '/config.js': 'config.js'
};
Object.entries(STATIC_FILES).forEach(([route, file]) => {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
});

app.post('/api/recommendation', async (req, res) => {
  const { intake, errors } = fhirChartToIntake(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const config = Object.assign({}, panelConfig, {
    locale: intake.locale || panelConfig.locale,
    jurisdiction: intake.jurisdiction || panelConfig.jurisdiction || null
  });

  res.set('X-Core-Source', usingMockCore ? 'mock' : 'core');
  try {
    const recommendation = await getRecommendation(intake, config);
    res.json(recommendation);
  } catch (e) {
    res.status(502).json({
      error: String((e && e.message) || e),
      hint: usingMockCore
        ? 'Using the lib/mock-core.cjs placeholder -- this should not throw. Check panel.config.js (panelSize >= 2).'
        : 'core/getRecommendation() threw -- likely fewer than config.panelSize providers succeeded, or a ' +
          'provider credential env var named in panel.config.js is missing/unset.'
    });
  }
});

module.exports = { app };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`FreeEducationHealth epic/ front-end: http://localhost:${PORT}/launch.html`);
    console.log(`POST /api/recommendation is using ${usingMockCore ? 'the MOCK core/ placeholder (no real AI panel)' : 'core/'}.`);
  });
}
