// FreeEducationHealth -- epic/ front-end, client-side SMART on FHIR config.
//
// Every self-hoster registers their OWN app at https://fhir.epic.com and
// pastes their OWN Non-Production Client ID below. This file intentionally
// ships with placeholders only -- see epic/README.md for the registration
// walkthrough. Epic sandbox client IDs identify a public SMART client (PKCE,
// no client secret), but treat this file as yours to own and edit regardless
// of that: there is no shared/hosted app here, by design.
window.EPIC_CONFIG = {
  // Paste the "Non-Production Client ID" Epic gives you after you create an
  // app in the Epic on FHIR developer portal (Connection Hub).
  clientId: "YOUR_EPIC_NON_PRODUCTION_CLIENT_ID",

  // Epic's public R4 sandbox FHIR base. Leave this as-is to test against the
  // sandbox. A real EHR launch (from inside a live Epic instance) supplies
  // its own `iss` at launch time and this value is ignored for that flow.
  fhirBase: "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",

  // Must exactly match the redirect URI you registered with Epic.
  redirectUri: "index.html",

  // Read-only scopes only (see docs/physician-brain-components.md and
  // epic/README.md). Do NOT add patient/DocumentReference.write here --
  // write-back is a separate, explicitly gated capability that requires a
  // site to sponsor it; this repo only implements the read+draft path.
  scope: [
    "openid",
    "fhirUser",
    "patient/Patient.read",
    "patient/Condition.read",
    "patient/MedicationRequest.read",
    "patient/AllergyIntolerance.read",
    "patient/Observation.read"
  ].join(" ")
};
