// FreeEducationHealth -- kiosk/ front-end, server-side PanelConfig.
//
// This builds the `config` argument passed to core/'s getRecommendation()
// (see core/INTERFACE.md#panelconfig-shape). Edit `providers` to match AI
// accounts you actually hold keys for, then set the matching environment
// variables (e.g. in kiosk/.env, loaded by server.cjs via dotenv, or your OS
// environment) -- never paste an actual API key value into this file.
//
// core/INTERFACE.md requires panelSize >= 2 always: independent-model
// consensus/divergence detection is what substitutes for physician review
// between the kiosk submission and the physician actually opening the card.
// Do not drop it to 1.
module.exports = {
  providers: [
    { name: "anthropic", model: "claude-sonnet-5", apiKeyEnvVar: "ANTHROPIC_API_KEY" },
    { name: "openai", model: "gpt-4o", apiKeyEnvVar: "OPENAI_API_KEY" },
    { name: "deepseek", model: "deepseek-chat", apiKeyEnvVar: "DEEPSEEK_API_KEY" }
    // Local/offline example (uncomment and point at your own Ollama, LM Studio, etc):
    // { name: "local", model: "llama3", apiKeyEnvVar: "LOCAL_LLM_API_KEY", baseUrl: "http://localhost:11434/v1" }
  ],
  panelSize: 2,

  // "generic" is the only style guaranteed available pre-PHI-scrub-gate
  // (see core/persona/ and the design spec's PHI-scrub gate section).
  personaStyle: "generic",

  // BCP-47 locale the kiosk collects answers in. kiosk/index.html ships in
  // English; if you translate the page, set this to match.
  locale: "en",

  // The kiosk's output is physician-facing (a carousel card), so a
  // jurisdiction hint for billing-code suggestions is appropriate here,
  // unlike the patient-facing bot/. Leave null to get no billing
  // suggestions, or set e.g. "CA-QC", "US", "KE".
  jurisdiction: null
};
