# Worked example: the form-to-report robot (Google Forms + Apps Script)

This is the original form-based InstantHPI method, published as a worked
example any physician can rebuild in an afternoon. A patient fills a
structured intake form; the answers land in a spreadsheet; a small script
wakes up, sends the structured answers to an AI model, and emails the
physician a fixed four-section report; then it deletes the row so the
spreadsheet never accumulates patient data. The physician reads the report
and takes over.

It needs no server of yours beyond your own Google account, and it runs on
a few cents of computing per consultation.

## What you need

- **A Google account** (a Workspace account if you handle identifiable
  patient data — see Security below).
- **A structured intake form** feeding a spreadsheet. Google Forms does
  this natively; any Formsite-class form builder that can write rows to a
  sheet also works. The form asks the fixed intake battery (chief
  complaint, onset, trigger, location, description, aggravating/relieving,
  severity, evolution, associated symptoms, treatments tried and their
  effect, chronic conditions, allergies, pregnancy/breastfeeding if
  applicable, anything else).
- **Your own AI API key** — never anyone else's, never shared, never
  pasted into code (stored in Script Properties, below).
- **Your professional email address** — the report is delivered only
  there.
- About 15 minutes.

## How it works

```
Patient fills the form
        │
        ▼
Row appears in the spreadsheet ──► onChange trigger fires
        │
        ▼
Script reads the row's structured fields
        │
        ▼
One AI call turns them into a fixed 4-section report:
  1. Horizontal timeline of the illness (exact dates, day counts)
  2. Clinical reasoning decision flow (known / unknown / must-rule-out)
  3. Teaching block (pearls, differentials, management, board-style Q&A)
  4. Patient confirmation paragraph, second person, plain language,
     in the patient's own language, ending with 10 gentle follow-up
     questions
        │
        ▼
Report emailed to the physician ──► row DELETED from the sheet
```

Two design choices carry the method:

- **The output is a template, not a free essay.** The model must fill an
  exact structure. Structure is what makes AI output reviewable at a
  glance and consistent across hundreds of cases.
- **The spreadsheet is a conveyor belt, not a chart.** The row is deleted
  the moment the report is sent. The medical record lives where it
  belongs — in the physician's chart system — and the form pipeline holds
  nothing.

## The script (sanitized — keys live in Script Properties, never in code)

In the Apps Script editor: Project Settings → Script Properties → add
`AI_API_KEY` (and optionally `DOCTOR_EMAIL`). Then:

```javascript
// Form-to-report robot — published worked example (FreeEducationHealth).
// Fill the CONFIG for your practice. The API key is NEVER written in code:
// it is read from Script Properties (Project Settings -> Script Properties).

const CONFIG = Object.freeze({
  API_URL: 'https://api.anthropic.com/v1/messages', // or your provider's endpoint
  API_VERSION: '2023-06-01',
  MODEL: 'claude-haiku-4-5', // see the cost notes for choosing a model
  MAX_TOKENS: 8000,
  DOCTOR_EMAIL:
    PropertiesService.getScriptProperties().getProperty('DOCTOR_EMAIL') ||
    'you@your-practice.example',
  SENDER_NAME: 'intake-robot',
});

function getApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('AI_API_KEY');
  if (!key) throw new Error('Set AI_API_KEY in Script Properties first.');
  return key;
}

// Map your sheet's columns here (0-based indexes into the row).
// Adjust to match YOUR form's column order.
const FIELDS = [
  { label: 'Patient ID', index: 3 },
  { label: 'Gender', index: 4 },
  { label: 'Age', index: 5 },
  { label: 'Chief complaint', index: 6 },
  { label: 'Start date', index: 7 },
  { label: 'Trigger', index: 8 },
  { label: 'Location', index: 9 },
  { label: 'Description', index: 10 },
  { label: 'Aggravating', index: 11 },
  { label: 'Relieving', index: 12 },
  { label: 'Severity', index: 13 },
  { label: 'Evolution', index: 14 },
  { label: 'Associated symptoms', index: 15 },
  { label: 'Treatments tried', index: 16 },
  { label: 'Treatment effectiveness', index: 17 },
  { label: 'Chronic conditions', index: 18 },
  { label: 'Allergies', index: 19 },
  { label: 'Pregnant/breastfeeding', index: 20 },
  { label: 'Additional', index: 21 },
];
const LAST_COLUMN = 22;

function setupTrigger() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onNewRow').forSpreadsheet(sheet).onChange().create();
  SpreadsheetApp.getUi().alert('Enabled', 'Auto-processing active.', SpreadsheetApp.getUi().ButtonSet.OK);
}

function onNewRow(e) {
  try {
    if (e?.changeType !== 'INSERT_ROW') return;
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    const rowData = sheet.getRange(lastRow, 1, 1, LAST_COLUMN).getValues()[0];
    if (!rowData || rowData.length < LAST_COLUMN) throw new Error('Invalid row');
    sendEmail(callModel(createPrompt(rowData)), rowData);
    // Data minimization: the pipeline keeps nothing. The chart lives in
    // your record system, not in this spreadsheet.
    sheet.deleteRow(lastRow);
  } catch (error) {
    console.error('Error:', error);
  }
}

function createPrompt(rowData) {
  return FIELDS.map(({ label, index }) => `${label}: ${rowData[index] ?? ''}`).join('\n');
}

function getSystemPrompt() {
  // The full report template: four fixed sections.
  // 1. Horizontal ASCII timeline (exact dates, Day N markers; text-safe
  //    Unicode only so email clients render it).
  // 2. Clinical reasoning decision flow (what we know / what we need /
  //    must rule out / decision / action).
  // 3. Teaching block: diagnostic pearls, presentation hallmarks, three
  //    differentials with distinguishing clues, evidence-based management,
  //    follow-up, and a board-style question with answer and explanation.
  // 4. Patient confirmation paragraph in the PATIENT'S OWN LANGUAGE,
  //    SECOND person, plain everyday words, starting with a "just to
  //    confirm, you are..." recap and ending with 10 gentle follow-up
  //    questions. No medical jargon, no third person.
  //
  // Write this template to match your language and practice. The one used
  // in the originating practice renders sections 1-3 in English for the
  // physician and section 4 in the patient's language (French there), and
  // bans color emoji in favor of text Unicode so email clients render it.
  return 'Output ONLY valid HTML starting with <!DOCTYPE html>. ' +
    'Generate a report with EXACTLY these 4 sections... (your template here)';
}

function callModel(prompt) {
  const response = UrlFetchApp.fetch(CONFIG.API_URL, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey_(),
      'anthropic-version': CONFIG.API_VERSION,
    },
    payload: JSON.stringify({
      model: CONFIG.MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: 0.1,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });
  const result = JSON.parse(response.getContentText());
  if (result.error) throw new Error(result.error.message);
  return (result.content?.[0]?.text ?? '')
    .replace(/```html\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
}

function sendEmail(htmlContent, rowData) {
  GmailApp.sendEmail(
    CONFIG.DOCTOR_EMAIL,
    `Intake report for "${rowData[3] ?? 'Unknown'}"`,
    'See HTML.',
    { htmlBody: htmlContent, name: CONFIG.SENDER_NAME }
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('IntakeRobot')
    .addItem('Setup', 'setupTrigger')
    .addToUi();
}
```

Always test with obviously fake data first (a made-up patient), never with
a real case.

## Choosing the model, and what a consultation actually costs

Prices move; check the providers' current pages. As of mid-2026, with a
typical consultation of roughly 2,500 input tokens (template + form
answers) and about 4,000 output tokens (the full report):

| Path | Approx. price | Cost per consultation | When to choose it |
|---|---|---|---|
| **Claude Haiku 4.5 on AWS Bedrock** | ~$1 / M input, ~$5 / M output | **≈ 2–3 cents** | **Recommended whenever identifiable patient data is involved and your jurisdiction has a compliance framework** — Bedrock offers a signed BAA (HIPAA path in the US), IAM key management, audit logging, and regional data residency. AWS's newer Bedrock API keys make simple bearer-token calls feasible from environments like Apps Script; otherwise route the call through your instanthpi/ setup. |
| Claude Haiku 4.5, direct API | same prices | ≈ 2–3 cents | Same model without the BAA/governance wrapper — fine for de-identified or educational use. |
| DeepSeek (current chat model) | ~$0.28 / M input, ~$0.42 / M output | **≈ a quarter of a cent** | The economical default for education-mode and de-identified use, and for the multi-AI panel's second/third seats. Roughly 10× cheaper than Haiku; no BAA. |

Two readings of that table matter:

- **The moral one:** even the *expensive* path is about three cents per
  consultation. This is the number behind the manifesto's claim that
  leaving the poorest without structured guidance is a choice, not a
  resource problem.
- **The practical one:** pick by data sensitivity, not by price. With
  identifiable patient data in a covered jurisdiction, the ~10× premium
  for the BAA-covered Bedrock path is three cents well spent. Without
  identifiable data, DeepSeek-class pricing makes even a 3–4 model panel
  cost under a cent.

## The security basis of this system

What this design gets right, and what you must still do:

**Built into the design:**

- **No third-party server of ours.** The pipeline is your form, your
  spreadsheet, your script, your email — all inside your own accounts.
  The only outside party is the AI provider you chose.
- **Data minimization by construction.** The row is deleted after the
  report is sent. The spreadsheet is a conveyor belt; nothing accumulates
  there to be breached later. The record of care lives in your chart
  system, where records belong.
- **One recipient.** The report goes to the physician's address only.
  Patients receive nothing automatically; you decide what reaches them.
- **A fixed template resists prompt games.** The model must fill a strict
  structure, which also makes tampering or drift easy to spot on review.

**Your responsibilities (the part no script can do):**

- **Never hardcode an API key.** In code, a key is one paste, one screen
  share, or one repository push away from being public — and a leaked key
  lets strangers spend on your account. Keys go in Script Properties
  (or a secret manager), get rotated if ever exposed, and are treated as
  burned the moment they appear anywhere outside.
- **Know where the patient text travels.** Form → Google's
  infrastructure → the AI provider → your inbox. If you handle
  identifiable data in a jurisdiction with a compliance framework, cover
  each hop: a Google Workspace agreement for forms/sheets/mail, and a
  BAA-covered AI path (this is the Bedrock recommendation above). If you
  cannot cover a hop, don't send identifiable data through it — intake
  can run on a case number, with identity joined only inside your chart
  system.
- **Restrict the form and the sheet.** The form link is for patients; the
  spreadsheet and script are for you alone. Review who has access.
- **Email is the weakest hop.** The report lands in an inbox; that inbox
  needs strong authentication (and ideally a professional, encrypted
  mail system) because it briefly holds clinical content.
- **The physician remains the reviewer.** Nothing in this pipeline is
  sent to a patient by a machine. The report is a draft for your
  judgment; the method's safety is your review, kept structurally in the
  loop.
