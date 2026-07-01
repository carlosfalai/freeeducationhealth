'use strict';

const { buildPanelConfigFromEnv, parseProviders } = require('../config.cjs');

describe('config.cjs parseProviders', () => {
  test('parses a single provider without a baseUrl', () => {
    const providers = parseProviders('anthropic:claude-sonnet-5:ANTHROPIC_API_KEY');
    expect(providers).toEqual([
      { name: 'anthropic', model: 'claude-sonnet-5', apiKeyEnvVar: 'ANTHROPIC_API_KEY' },
    ]);
  });

  test('parses multiple comma-separated providers', () => {
    const providers = parseProviders(
      'anthropic:claude-sonnet-5:ANTHROPIC_API_KEY,deepseek:deepseek-chat:DEEPSEEK_API_KEY'
    );
    expect(providers).toHaveLength(2);
    expect(providers[1].name).toBe('deepseek');
  });

  test('includes baseUrl when provided (e.g. local/Ollama)', () => {
    const providers = parseProviders(
      'openai-compatible:llama3:LOCAL_API_KEY:http://localhost:11434/v1'
    );
    expect(providers[0].baseUrl).toBe('http://localhost:11434/v1');
  });

  test('throws on an empty value', () => {
    expect(() => parseProviders('')).toThrow(/PANEL_PROVIDERS is not set/);
  });

  test('throws on a malformed entry missing a required part', () => {
    expect(() => parseProviders('anthropic:claude-sonnet-5')).toThrow(/Malformed PANEL_PROVIDERS entry/);
  });
});

describe('config.cjs buildPanelConfigFromEnv', () => {
  const baseEnv = {
    PANEL_PROVIDERS: 'anthropic:claude-sonnet-5:ANTHROPIC_API_KEY,deepseek:deepseek-chat:DEEPSEEK_API_KEY',
  };

  test('builds a valid PanelConfig with defaults applied', () => {
    const config = buildPanelConfigFromEnv(baseEnv);
    expect(config.providers).toHaveLength(2);
    expect(config.panelSize).toBe(2);
    expect(config.personaStyle).toBe('generic');
    expect(config.locale).toBe('en');
    expect(config).not.toHaveProperty('jurisdiction');
  });

  test('respects PANEL_SIZE, PERSONA_STYLE, and BOT_LOCALE overrides', () => {
    const config = buildPanelConfigFromEnv({
      ...baseEnv,
      PANEL_SIZE: '2',
      PERSONA_STYLE: 'custom-clinic',
      BOT_LOCALE: 'fr-CA',
    });
    expect(config.panelSize).toBe(2);
    expect(config.personaStyle).toBe('custom-clinic');
    expect(config.locale).toBe('fr-CA');
  });

  test('throws when PANEL_SIZE is below the required minimum of 2', () => {
    expect(() => buildPanelConfigFromEnv({ ...baseEnv, PANEL_SIZE: '1' })).toThrow(/at least 2/);
  });

  test('throws when fewer providers are configured than PANEL_SIZE requires', () => {
    expect(() =>
      buildPanelConfigFromEnv({
        PANEL_PROVIDERS: 'anthropic:claude-sonnet-5:ANTHROPIC_API_KEY',
        PANEL_SIZE: '2',
      })
    ).toThrow(/configures 1 provider/);
  });

  test('throws when PANEL_PROVIDERS is missing entirely', () => {
    expect(() => buildPanelConfigFromEnv({})).toThrow(/PANEL_PROVIDERS is not set/);
  });
});
