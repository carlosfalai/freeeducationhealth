# Start here: hospitals and health systems

You are evaluating a **read-only Epic integration**: it reads a patient's
chart via SMART on FHIR (problems, medications, allergies, observations),
pre-populates a structured history, and shows the clinician what a
multi-AI panel makes of it — considerations, red flags, and disagreements
between models, surfaced rather than hidden. **It never writes anything
back into Epic.**

It runs sandbox-first against Epic's public test server, so your team can
evaluate the whole flow before any real credentials or governance
conversations happen.

## Two deployment models — both fully supported

Run it on your own on-premises server, or in your own cloud tenant.
Nothing in this architecture depends on anyone else's infrastructure —
there is no vendor server in the loop, which your compliance review will
want to know first.

Prefer wiring it into your own portal or EMR tooling instead of using
this front-end? `INTEGRATION.md` documents how to call the engine
(`core/`) directly from your own code.

## Step 1 — download your piece (only this one)

Download and unzip:
**[freeeducationhealth-epic-only.zip](https://github.com/carlosfalai/freeeducationhealth/releases/latest/download/freeeducationhealth-epic-only.zip)**

## Step 2 — install an AI coding agent (recommended path)

Built and tested with **Claude Code**; any capable coding agent works.

- **Windows** (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://claude.ai/install.sh | bash`
- Or via Node.js: `npm install -g @anthropic-ai/claude-code`

Open a terminal **inside the unzipped folder**, run `claude`, sign in,
and type:

> Set this up for me against Epic's public sandbox. Register the app
> details with me, configure the AI providers, start the server, and walk
> me through one test patient end to end.

## Step 3 — or set it up yourself

`SETUP.md` section **"Setting up epic/ (hospitals/clinics using Epic)"**,
then `epic/README.md`: free developer account at fhir.epic.com, paste the
Client ID into `epic/config.js`, list providers in `epic/panel.config.js`,
`npm install && npm start`, open `http://localhost:3000/launch.html`.

## For your compliance review

- Read-only by design; write-back (DocumentReference) is gated behind
  explicit per-site sponsor approval and ships disabled.
- Self-hosting does not by itself make a deployment "HIPAA compliant" —
  that depends on your own arrangements (e.g. a BAA) with whichever AI
  provider you configure. `docs/hipaa-bedrock-guide.md` documents one
  BAA-covered path; local models keep chart text on your own
  infrastructure entirely.
- The engine persists nothing and has no side effects; every front-end is
  responsible for its own I/O (`core/INTERFACE.md`).
