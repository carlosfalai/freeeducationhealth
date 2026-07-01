'use strict';

/**
 * Builds a `PanelConfig` (see core/INTERFACE.md#panelconfig-shape) from
 * environment variables. `core/` never reads env vars directly for provider
 * selection -- resolving `apiKeyEnvVar` names into concrete provider
 * entries is a front-end responsibility, done here so core/ stays testable
 * with mock credentials.
 *
 * Env vars consumed (see .env.example):
 *   PANEL_PROVIDERS  Comma-separated "name:model:apiKeyEnvVar[:baseUrl]" entries.
 *   PANEL_SIZE       Minimum independent model responses required (default 2, must be >= 2).
 *   PERSONA_STYLE    Style guide name passed through to core/persona/ (default "generic").
 *   BOT_LOCALE       Fallback BCP-47 locale used when a session has none (default "en").
 *
 * jurisdiction is intentionally never set here -- the patient-facing bot
 * normally omits it per core/INTERFACE.md, leaving billing-code suggestions
 * to physician-facing front-ends (instanthpi/, epic/) only.
 */

/**
 * @param {string} raw value of PANEL_PROVIDERS
 * @returns {Array<{name: string, model: string, apiKeyEnvVar: string, baseUrl?: string}>}
 */
function parseProviders(raw) {
  if (!raw || !raw.trim()) {
    throw new Error(
      'PANEL_PROVIDERS is not set. Configure at least two AI providers, e.g.\n' +
        '  PANEL_PROVIDERS=anthropic:claude-sonnet-5:ANTHROPIC_API_KEY,deepseek:deepseek-chat:DEEPSEEK_API_KEY\n' +
        'See bot/.env.example.'
    );
  }

  return raw.split(',').map((entry) => {
    const trimmed = entry.trim();
    // Only the first three colons are field separators -- everything after
    // the third belongs to an optional baseUrl, which itself contains
    // colons (e.g. "http://localhost:11434/v1"). A plain split(':') would
    // shred that URL, so split into at most 4 parts instead.
    const parts = trimmed.split(':');
    const name = parts[0];
    const model = parts[1];
    const apiKeyEnvVar = parts[2];
    const baseUrl = parts.length > 3 ? parts.slice(3).join(':') : undefined;
    if (!name || !model || !apiKeyEnvVar) {
      throw new Error(
        `Malformed PANEL_PROVIDERS entry "${trimmed}". Expected "name:model:apiKeyEnvVar[:baseUrl]".`
      );
    }
    const provider = { name, model, apiKeyEnvVar };
    if (baseUrl) provider.baseUrl = baseUrl;
    return provider;
  });
}

/**
 * @param {NodeJS.ProcessEnv} [env] defaults to process.env; injectable for tests.
 * @returns {object} PanelConfig
 */
function buildPanelConfigFromEnv(env = process.env) {
  const providers = parseProviders(env.PANEL_PROVIDERS);
  const parsedPanelSize = Number.parseInt(env.PANEL_SIZE, 10);
  const panelSize = Number.isFinite(parsedPanelSize) ? parsedPanelSize : 2;

  if (panelSize < 2) {
    throw new Error(
      'PANEL_SIZE must be at least 2 -- a single-model answer has no divergence detection ' +
        '(see core/INTERFACE.md, panelSize).'
    );
  }
  if (providers.length < panelSize) {
    throw new Error(
      `PANEL_PROVIDERS configures ${providers.length} provider(s) but PANEL_SIZE requires ${panelSize}. ` +
        'Add more providers to PANEL_PROVIDERS or lower PANEL_SIZE.'
    );
  }

  return {
    providers,
    panelSize,
    personaStyle: env.PERSONA_STYLE || 'generic',
    locale: env.BOT_LOCALE || 'en',
  };
}

module.exports = { buildPanelConfigFromEnv, parseProviders };
