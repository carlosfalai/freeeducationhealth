/**
 * instanthpi/spruce/client.cjs
 *
 * A generic REST client for Spruce Health's API, plus the "actionable
 * message" rule used throughout this project: a conversation is actionable
 * if its last message is inbound (from the patient) and it hasn't already
 * been handled since that message arrived.
 *
 * ADAPT-ME: this file targets Spruce's general REST conventions (Bearer
 * auth, JSON bodies, cursor-style pagination) as a reasonable default shape
 * for a self-hosted client. Spruce's exact endpoint paths and response field
 * names can change or vary by account/API version -- verify against your
 * account's current API reference (https://developer.sprucehealth.com or
 * your Spruce admin's API docs) and adjust the small number of constants and
 * field lookups marked ADAPT-ME below. Nothing else in this project depends
 * on the exact wire format; only this file needs to change if your account's
 * API differs.
 *
 * Handled-state tracking is a local JSON file (spruce/.handled.json), not a
 * database -- this mirrors the "no cloud DB" principle used by carousel/.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.SPRUCE_BASE_URL || 'https://api.sprucehealth.com';
const HANDLED_FILE = path.join(__dirname, '.handled.json');

function getToken() {
  const token = process.env.SPRUCE_API_TOKEN;
  if (!token || !token.trim()) {
    throw new Error(
      'SPRUCE_API_TOKEN is not set. Set it in instanthpi/.env (see .env.example) ' +
        'to your own Spruce Health API bearer token.',
    );
  }
  return token;
}

async function spruceFetch(pathname, { method = 'GET', body } = {}) {
  const url = `${BASE_URL}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }
  if (!res.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`Spruce API ${method} ${pathname} failed: ${res.status} ${detail}`);
  }
  return data;
}

/**
 * List conversations for this Spruce account.
 * ADAPT-ME: endpoint path and pagination field names ("conversations",
 * "nextCursor") assumed; verify against your account's API reference.
 */
async function listConversations({ limit = 50, cursor } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  const data = await spruceFetch(`/v1/conversations?${params.toString()}`);
  return {
    conversations: (data && data.conversations) || [],
    nextCursor: (data && data.nextCursor) || null,
  };
}

/**
 * List messages in a single conversation, oldest-first.
 * ADAPT-ME: assumed message shape is { id, direction: 'inbound'|'outbound',
 * createdAt, body }.
 */
async function listMessages(conversationId, { limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  const data = await spruceFetch(
    `/v1/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
  const messages = (data && data.messages) || [];
  // Defensively sort oldest-first regardless of what the API returned, since
  // "last message" logic below depends on ordering.
  return [...messages].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

function getLastMessage(messages) {
  if (!messages || messages.length === 0) return null;
  return messages[messages.length - 1];
}

/**
 * Send a text reply into a conversation.
 * ADAPT-ME: assumed request shape { body: text }; some accounts may expect
 * additional fields (e.g. a sender/participant id).
 */
async function sendMessage(conversationId, text) {
  return spruceFetch(`/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: { body: text },
  });
}

// ---------------------------------------------------------------------------
// Local "handled" tracker (no database) + the actionable-message rule
// ---------------------------------------------------------------------------

function loadHandled() {
  if (!fs.existsSync(HANDLED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(HANDLED_FILE, 'utf8'));
  } catch (err) {
    console.error(`spruce/.handled.json is corrupt, starting fresh: ${err.message}`);
    return {};
  }
}

function saveHandled(map) {
  const tmp = `${HANDLED_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(map, null, 2), 'utf8');
  fs.renameSync(tmp, HANDLED_FILE);
}

/**
 * Record that a conversation has been handled as of a given inbound message
 * timestamp. If the patient sends a new message after `lastInboundAt`, the
 * conversation becomes actionable again -- this is a deliberate "reopen
 * safe" design so a handled-marker never permanently silences a
 * conversation.
 */
function markHandled(conversationId, { lastInboundAt, decidedBy = null, note = null } = {}) {
  const map = loadHandled();
  map[conversationId] = {
    lastInboundAt: lastInboundAt || new Date().toISOString(),
    handledAt: new Date().toISOString(),
    decidedBy,
    note,
  };
  saveHandled(map);
}

function unmarkHandled(conversationId) {
  const map = loadHandled();
  delete map[conversationId];
  saveHandled(map);
}

function getHandledEntry(conversationId) {
  return loadHandled()[conversationId] || null;
}

/**
 * The actionable-message rule: a conversation is actionable if its last
 * message is inbound AND either it has never been marked handled, or the
 * patient has sent a new inbound message since it was last marked handled.
 */
function isActionableFromMessages(messages) {
  const last = getLastMessage(messages);
  if (!last || last.direction !== 'inbound') return false;
  return true; // handled-state check happens by conversationId in isActionable()
}

async function isActionable(conversationId) {
  const messages = await listMessages(conversationId);
  const last = getLastMessage(messages);
  if (!last || last.direction !== 'inbound') return false;
  const handled = getHandledEntry(conversationId);
  if (!handled) return true;
  return new Date(last.createdAt).getTime() > new Date(handled.lastInboundAt).getTime();
}

/**
 * Fetch conversations and return only the ones that are currently
 * actionable, each annotated with its last message. Note: this makes one
 * extra request per conversation to fetch messages -- fine for the small
 * volumes a single physician handles, but be mindful of Spruce API rate
 * limits if you raise `limit` significantly.
 */
async function listActionableConversations({ limit = 50 } = {}) {
  const { conversations } = await listConversations({ limit });
  const results = [];
  for (const conversation of conversations) {
    const id = conversation.id;
    const messages = await listMessages(id);
    const last = getLastMessage(messages);
    if (!last || last.direction !== 'inbound') continue;
    const handled = getHandledEntry(id);
    const actionable = !handled || new Date(last.createdAt).getTime() > new Date(handled.lastInboundAt).getTime();
    if (actionable) {
      results.push({ conversation, messages, lastMessage: last });
    }
  }
  return results;
}

module.exports = {
  BASE_URL,
  listConversations,
  listMessages,
  getLastMessage,
  sendMessage,
  markHandled,
  unmarkHandled,
  getHandledEntry,
  isActionable,
  isActionableFromMessages,
  listActionableConversations,
};

// --- CLI: `node client.cjs list` for a quick manual check ---
if (require.main === module) {
  try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  } catch (err) {
    // optional
  }
  const cmd = process.argv[2];
  (async () => {
    if (cmd === 'list') {
      const actionable = await listActionableConversations();
      console.log(`${actionable.length} actionable conversation(s):`);
      for (const { conversation, lastMessage } of actionable) {
        console.log(`- ${conversation.id} -- last inbound at ${lastMessage.createdAt}`);
      }
    } else {
      console.log('Usage: node spruce/client.cjs list');
      process.exitCode = 1;
    }
  })().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
