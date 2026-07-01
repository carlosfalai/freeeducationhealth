/**
 * instanthpi/carousel/cards-server.cjs
 *
 * A small local HTTP server (Express) that serves case review "cards" as
 * JSON plus a minimal server-rendered HTML view, gated behind a PIN. Cards
 * are stored as one JSON file per card under carousel/cards/ -- no database,
 * no cloud storage.
 *
 * This module exports two things:
 *   1. A plain card-store library (createCard, readCard, listCards,
 *      approveCard, dismissCard, markSent, deleteCard) that a coding agent
 *      can `require()` directly and call without ever starting the HTTP
 *      server -- reading/writing the JSON files is enough.
 *   2. `startServer()`, which boots the Express app for the physician to
 *      review cards in a browser. Run directly (`node cards-server.cjs` or
 *      `npm run carousel`) to start it.
 *
 * See card-schema.md for the exact card shape, and RUNBOOK.md for how this
 * fits into the daily workflow.
 *
 * PIN gate is mandatory: startServer() throws if CAROUSEL_PIN is unset. The
 * card-store functions above do NOT require a PIN -- they're plain file I/O
 * for use by trusted local scripts/agents, not exposed over the network.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CARDS_DIR = path.join(__dirname, 'cards');

// ---------------------------------------------------------------------------
// Card store (no HTTP, no PIN -- plain local JSON file I/O)
// ---------------------------------------------------------------------------

function ensureCardsDir() {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

function cardPath(id) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid card id: ${JSON.stringify(id)}`);
  }
  return path.join(CARDS_DIR, `${id}.json`);
}

/** Atomic write: write to a temp file then rename, so a reader never sees a
 * half-written card. */
function writeCardFile(id, card) {
  ensureCardsDir();
  const target = cardPath(id);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(card, null, 2), 'utf8');
  fs.renameSync(tmp, target);
  return card;
}

function readCard(id) {
  const file = cardPath(id);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** List all cards, newest first, optionally filtered by status. */
function listCards({ status } = {}) {
  ensureCardsDir();
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith('.json'));
  const cards = files
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(CARDS_DIR, f), 'utf8'));
      } catch (err) {
        console.error(`Skipping unreadable card file ${f}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean)
    .filter((c) => !status || c.status === status);
  cards.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return cards;
}

function newId() {
  return `c_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Create a new card from an already-fully-shaped partial object (see
 * card-schema.md). Fills in id/createdAt/updatedAt/status/decision/execution
 * defaults if not provided.
 */
function createCard(partial) {
  if (!partial || typeof partial !== 'object') {
    throw new Error('createCard requires an object');
  }
  if (!partial.source || !partial.recommendation || !partial.draftReply) {
    throw new Error(
      'createCard requires at least source, recommendation, and draftReply -- see card-schema.md',
    );
  }
  const now = new Date().toISOString();
  const card = {
    id: partial.id || newId(),
    createdAt: partial.createdAt || now,
    updatedAt: now,
    status: partial.status || 'pending',
    source: partial.source,
    caseSummary: partial.caseSummary || '',
    intakeAnswers: partial.intakeAnswers || null,
    recommendation: partial.recommendation,
    planOptions: partial.planOptions || [],
    draftReply: partial.draftReply,
    decision: partial.decision || {
      decidedAt: null,
      decidedBy: null,
      chosenPlanOption: null,
      editedReply: null,
      note: null,
    },
    execution: partial.execution || {
      sentAt: null,
      sentVia: null,
      faxResult: null,
      pdfPath: null,
    },
  };
  return writeCardFile(card.id, card);
}

/**
 * Convenience builder: assemble a well-formed card from a conversation
 * source, the IntakeAnswers that were sent to core/, the RecommendationObject
 * core/ returned, and case-specific planOptions/draftReply/caseSummary that
 * the caller (typically a coding agent with full conversation context)
 * supplies -- this function does not invent clinical content, it only
 * assembles the envelope consistently.
 */
function buildCardFromRecommendation({
  source,
  intakeAnswers,
  recommendation,
  caseSummary,
  planOptions,
  draftReply,
}) {
  if (!source || !recommendation || !draftReply) {
    throw new Error(
      'buildCardFromRecommendation requires source, recommendation, and draftReply',
    );
  }
  return createCard({
    source,
    intakeAnswers: intakeAnswers || null,
    recommendation,
    caseSummary: caseSummary || recommendation.plainLanguageSummary || '',
    planOptions: planOptions || [],
    draftReply,
  });
}

function mustReadCard(id) {
  const card = readCard(id);
  if (!card) throw new Error(`No such card: ${id}`);
  return card;
}

function approveCard(id, { chosenPlanOption = null, editedReply = null, decidedBy = null } = {}) {
  const card = mustReadCard(id);
  card.status = 'approved';
  card.updatedAt = new Date().toISOString();
  card.decision = {
    decidedAt: card.updatedAt,
    decidedBy,
    chosenPlanOption,
    editedReply,
    note: null,
  };
  return writeCardFile(id, card);
}

function dismissCard(id, { decidedBy = null, note = null } = {}) {
  const card = mustReadCard(id);
  card.status = 'dismissed';
  card.updatedAt = new Date().toISOString();
  card.decision = {
    decidedAt: card.updatedAt,
    decidedBy,
    chosenPlanOption: null,
    editedReply: null,
    note,
  };
  return writeCardFile(id, card);
}

function markSent(id, { sentVia = null, faxResult = null, pdfPath = null } = {}) {
  const card = mustReadCard(id);
  card.status = 'sent';
  card.updatedAt = new Date().toISOString();
  card.execution = {
    sentAt: card.updatedAt,
    sentVia,
    faxResult,
    pdfPath,
  };
  return writeCardFile(id, card);
}

function deleteCard(id) {
  const file = cardPath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** The text that should actually be sent for an approved card: the physician's
 * edited reply if they changed it, otherwise the original draft. */
function resolveReplyText(card) {
  return (card.decision && card.decision.editedReply) || card.draftReply;
}

// ---------------------------------------------------------------------------
// HTTP server (Express, PIN-gated)
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function requirePin() {
  const pin = process.env.CAROUSEL_PIN;
  if (!pin || !pin.trim()) {
    throw new Error(
      'CAROUSEL_PIN is not set. The carousel review server refuses to start ' +
        'without a PIN -- this gate is mandatory because cards contain real ' +
        'patient case content. Set CAROUSEL_PIN in instanthpi/.env (see ' +
        '.env.example) before running the server.',
    );
  }
  return pin;
}

function constantTimePinMatches(candidate, pin) {
  const a = Buffer.from(String(candidate || ''));
  const b = Buffer.from(String(pin));
  if (a.length !== b.length) {
    // Compare against itself so the timing cost is similar regardless of
    // whether lengths matched, without throwing on mismatched-length input.
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function startServer({ port } = {}) {
  const pin = requirePin();
  const express = require('express');
  const cookieParser = require('cookie-parser');

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const SESSION_COOKIE = 'ihpi_session';
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  const sessions = new Map(); // token -> expiresAt (ms)

  // Very small brute-force throttle on /login, keyed by remote address.
  const loginAttempts = new Map(); // ip -> { count, windowStart }
  const LOGIN_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_MAX_ATTEMPTS = 8;

  function tooManyLoginAttempts(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
      loginAttempts.set(ip, { count: 0, windowStart: now });
      return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
  }

  function recordLoginAttempt(ip) {
    const entry = loginAttempts.get(ip) || { count: 0, windowStart: Date.now() };
    entry.count += 1;
    loginAttempts.set(ip, entry);
  }

  function requireAuth(req, res, next) {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    const expiresAt = token && sessions.get(token);
    if (expiresAt && expiresAt > Date.now()) {
      sessions.set(token, Date.now() + SESSION_TTL_MS); // sliding expiry
      return next();
    }
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.redirect('/login');
  }

  app.get('/health', (req, res) => res.json({ ok: true }));

  app.get('/login', (req, res) => {
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>instanthpi carousel login</title></head>
<body style="font-family:system-ui,sans-serif;max-width:360px;margin:80px auto">
  <h1>instanthpi carousel</h1>
  <form method="POST" action="/login">
    <label>PIN<br><input type="password" name="pin" autofocus autocomplete="off" style="font-size:1.2em;padding:6px"></label>
    <br><br>
    <button type="submit">Unlock</button>
  </form>
  ${req.query.error ? '<p style="color:#b00">Incorrect PIN.</p>' : ''}
</body></html>`);
  });

  app.post('/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (tooManyLoginAttempts(ip)) {
      return res.status(429).type('html').send('Too many attempts. Try again later.');
    }
    const candidate = (req.body && req.body.pin) || '';
    if (!constantTimePinMatches(candidate, pin)) {
      recordLoginAttempt(ip);
      return res.redirect('/login?error=1');
    }
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL_MS);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_MS,
    });
    res.redirect('/');
  });

  app.post('/logout', (req, res) => {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (token) sessions.delete(token);
    res.clearCookie(SESSION_COOKIE);
    res.redirect('/login');
  });

  app.use(requireAuth);

  // --- JSON API ---

  app.get('/api/cards', (req, res) => {
    res.json(listCards({ status: req.query.status }));
  });

  app.get('/api/cards/:id', (req, res) => {
    const card = readCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'not found' });
    res.json(card);
  });

  app.post('/api/cards/:id/approve', (req, res) => {
    try {
      const { chosenPlanOption, editedReply, decidedBy } = req.body || {};
      const card = approveCard(req.params.id, { chosenPlanOption, editedReply, decidedBy });
      res.json(card);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/cards/:id/dismiss', (req, res) => {
    try {
      const { decidedBy, note } = req.body || {};
      const card = dismissCard(req.params.id, { decidedBy, note });
      res.json(card);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/cards/:id/mark-sent', (req, res) => {
    try {
      const { sentVia, faxResult, pdfPath } = req.body || {};
      const card = markSent(req.params.id, { sentVia, faxResult, pdfPath });
      res.json(card);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // --- Minimal HTML view ---

  function renderCard(card) {
    const options = (card.planOptions || [])
      .map(
        (opt) => `<label style="display:block;margin:4px 0">
          <input type="radio" name="plan_${escapeHtml(card.id)}" value="${escapeHtml(opt.number)}">
          <strong>${escapeHtml(opt.number)}. ${escapeHtml(opt.label)}</strong> -- ${escapeHtml(opt.description || '')}
        </label>`,
      )
      .join('\n');
    const redFlags = (card.recommendation && card.recommendation.redFlags) || [];
    const redFlagHtml = redFlags.length
      ? `<p style="color:#b00;font-weight:bold">RED FLAGS: ${escapeHtml(redFlags.join('; '))}</p>`
      : '';
    const divergenceHtml = card.recommendation && card.recommendation.divergenceFlag
      ? '<p style="color:#a60;font-weight:bold">Panel divergence -- providers disagreed materially, review carefully.</p>'
      : '';
    return `<div style="border:1px solid #ccc;border-radius:8px;padding:16px;margin:16px 0">
      <h3>Card ${escapeHtml(card.id)} <small style="color:#888">(${escapeHtml(card.status)})</small></h3>
      <p><em>${escapeHtml(card.caseSummary)}</em></p>
      ${redFlagHtml}
      ${divergenceHtml}
      <details><summary>Considerations</summary><ul>
        ${(card.recommendation.considerations || [])
          .map((c) => `<li>${escapeHtml(c.text)} (confidence ${escapeHtml(c.confidence)})</li>`)
          .join('')}
      </ul></details>
      <p><strong>Draft reply:</strong></p>
      <form onsubmit="return submitApprove(event, '${escapeHtml(card.id)}')">
        <textarea name="editedReply" rows="4" style="width:100%">${escapeHtml(card.draftReply)}</textarea>
        <p>${options || '<em>No plan options provided.</em>'}</p>
        <button type="submit">Approve</button>
        <button type="button" onclick="submitDismiss('${escapeHtml(card.id)}')">Dismiss</button>
      </form>
    </div>`;
  }

  app.get('/', (req, res) => {
    const pending = listCards({ status: 'pending' });
    const approved = listCards({ status: 'approved' });
    res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>instanthpi carousel</title></head>
<body style="font-family:system-ui,sans-serif;max-width:800px;margin:40px auto">
  <h1>instanthpi carousel</h1>
  <form method="POST" action="/logout" style="float:right"><button>Log out</button></form>
  <h2>Pending (${pending.length})</h2>
  ${pending.map(renderCard).join('') || '<p>No pending cards.</p>'}
  <h2>Approved, awaiting execution (${approved.length})</h2>
  ${approved.map(renderCard).join('') || '<p>None.</p>'}
  <script>
    async function submitApprove(ev, id) {
      ev.preventDefault();
      const form = ev.target;
      const editedReply = form.editedReply.value;
      const chosen = form.querySelector('input[type=radio]:checked');
      const chosenPlanOption = chosen ? Number(chosen.value) : null;
      const res = await fetch('/api/cards/' + id + '/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenPlanOption, editedReply, decidedBy: 'carousel-ui' }),
      });
      if (res.ok) location.reload(); else alert('Approve failed: ' + (await res.text()));
      return false;
    }
    async function submitDismiss(id) {
      const res = await fetch('/api/cards/' + id + '/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decidedBy: 'carousel-ui' }),
      });
      if (res.ok) location.reload(); else alert('Dismiss failed: ' + (await res.text()));
    }
  </script>
</body></html>`);
  });

  const listenPort = port || Number(process.env.CAROUSEL_PORT) || 4747;
  return app.listen(listenPort, () => {
    console.log(`instanthpi carousel listening on http://localhost:${listenPort}`);
  });
}

module.exports = {
  CARDS_DIR,
  ensureCardsDir,
  createCard,
  buildCardFromRecommendation,
  readCard,
  listCards,
  approveCard,
  dismissCard,
  markSent,
  deleteCard,
  resolveReplyText,
  startServer,
};

if (require.main === module) {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  } catch (err) {
    // dotenv is a dependency (see package.json); if it's not installed yet
    // this just means env vars must already be set some other way.
  }
  startServer();
}
