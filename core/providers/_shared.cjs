'use strict';

/**
 * Shared plumbing for core/providers/* adapters.
 *
 * This file is NOT a provider itself -- every provider adapter
 * (anthropic.cjs, deepseek.cjs, openai.cjs, local.cjs) is a thin wrapper
 * around one HTTP call to that provider's own API, and they share this
 * small amount of boilerplate (timeouts, consistent error messages, and
 * env-var credential lookup) so each provider file can stay focused on its
 * own request/response shape.
 *
 * Credential model: PanelConfig.providers[] (see ../INTERFACE.md) names an
 * `apiKeyEnvVar` per provider entry rather than a raw secret, so a
 * self-hoster's config file/repo never contains an actual key. Each
 * provider adapter resolves that named variable at call time via
 * `resolveApiKey()` below -- core/ never hardcodes a key and never talks to
 * any shared/hosted infrastructure.
 */

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Read an API key out of `process.env` by name, with a clear error if it's
 * missing rather than a confusing downstream 401.
 *
 * @param {string} envVarName - Name of the environment variable to read.
 * @param {string} providerLabel - Provider id, used only in error text.
 * @param {{ required?: boolean }} [opts]
 * @returns {string|undefined}
 */
function resolveApiKey(envVarName, providerLabel, { required = true } = {}) {
  const value = envVarName ? process.env[envVarName] : undefined;
  if (required && !value) {
    throw new Error(
      `[core/providers/${providerLabel}] missing API key: environment variable ` +
        `"${envVarName}" is not set. Every self-hoster brings their own credentials -- ` +
        `set it in your own .env (see core/INTERFACE.md, PanelConfig.providers[].apiKeyEnvVar).`
    );
  }
  return value;
}

/**
 * fetch() with a hard timeout so one slow provider can't hang the whole panel.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse a fetch Response as JSON, throwing a descriptive error on non-2xx
 * status or unparsable bodies instead of letting `.json()` throw something
 * opaque.
 *
 * @param {Response} response
 * @param {string} providerLabel
 * @returns {Promise<any>}
 */
async function readJsonOrThrow(response, providerLabel) {
  const raw = await response.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `[core/providers/${providerLabel}] non-JSON response (HTTP ${response.status}): ` +
        raw.slice(0, 500)
    );
  }
  if (!response.ok) {
    const message =
      (parsed && parsed.error && (parsed.error.message || parsed.error)) ||
      raw.slice(0, 500) ||
      response.statusText;
    throw new Error(`[core/providers/${providerLabel}] HTTP ${response.status}: ${message}`);
  }
  return parsed;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  resolveApiKey,
  fetchWithTimeout,
  readJsonOrThrow,
};
