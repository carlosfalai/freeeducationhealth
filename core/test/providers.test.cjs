'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const callAnthropic = require('../providers/anthropic.cjs');
const callDeepseek = require('../providers/deepseek.cjs');
const callOpenAI = require('../providers/openai.cjs');
const callLocal = require('../providers/local.cjs');

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
});

test('anthropic adapter throws a clear error when the API key env var is unset', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(
    () => callAnthropic({ systemPrompt: 's', userPrompt: 'u' }, {}),
    /ANTHROPIC_API_KEY/
  );
});

test('anthropic adapter sends the expected request shape and parses the reply', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let capturedUrl;
  let capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'hello from claude' }] }), {
      status: 200,
    });
  };

  const text = await callAnthropic({ systemPrompt: 'sys', userPrompt: 'usr' }, { model: 'claude-sonnet-5' });

  assert.equal(text, 'hello from claude');
  assert.equal(capturedUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(capturedOptions.headers['x-api-key'], 'test-key');
  const body = JSON.parse(capturedOptions.body);
  assert.equal(body.model, 'claude-sonnet-5');
  assert.equal(body.system, 'sys');
  assert.equal(body.messages[0].content, 'usr');
});

test('anthropic adapter surfaces a non-2xx response as a thrown error', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401 });

  await assert.rejects(
    () => callAnthropic({ systemPrompt: 's', userPrompt: 'u' }, {}),
    /invalid api key/
  );
});

test('deepseek adapter uses OpenAI-compatible chat-completions shape', async () => {
  process.env.DEEPSEEK_API_KEY = 'ds-key';
  let capturedOptions;
  global.fetch = async (url, options) => {
    capturedOptions = options;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hi from deepseek' } }] }), {
      status: 200,
    });
  };

  const text = await callDeepseek({ systemPrompt: 'sys', userPrompt: 'usr' }, { model: 'deepseek-chat' });
  assert.equal(text, 'hi from deepseek');
  assert.equal(capturedOptions.headers.authorization, 'Bearer ds-key');
  const body = JSON.parse(capturedOptions.body);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'usr' },
  ]);
});

test('openai adapter uses OpenAI chat-completions shape', async () => {
  process.env.OPENAI_API_KEY = 'oa-key';
  global.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'hi from gpt' } }] }), { status: 200 });

  const text = await callOpenAI({ systemPrompt: 'sys', userPrompt: 'usr' }, {});
  assert.equal(text, 'hi from gpt');
});

test('local adapter throws when no baseUrl is configured anywhere', async () => {
  delete process.env.LOCAL_MODEL_BASE_URL;
  await assert.rejects(
    () => callLocal({ systemPrompt: 's', userPrompt: 'u' }, {}),
    /no baseUrl configured/
  );
});

test('local adapter uses LOCAL_MODEL_BASE_URL env var as a fallback and needs no API key', async () => {
  process.env.LOCAL_MODEL_BASE_URL = 'http://localhost:11434/v1';
  let capturedUrl;
  let capturedOptions;
  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'hi from llama' } }] }), {
      status: 200,
    });
  };

  const text = await callLocal({ systemPrompt: 's', userPrompt: 'u' }, {});
  assert.equal(text, 'hi from llama');
  assert.equal(capturedUrl, 'http://localhost:11434/v1/chat/completions');
  assert.equal(capturedOptions.headers.authorization, undefined);
});
