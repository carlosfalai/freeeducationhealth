# Method D — the template method (any chatbot + voice + strict templates)

The zero-infrastructure method, and the ancestor of everything else in
this project. It needs nothing installed: a physician talks or dictates,
a transcription tool turns speech into text, and a general-purpose chatbot
(ChatGPT, Claude, Gemini — any capable one; none is endorsed) formats the
case into the physician's own strict clinical templates. The intelligence
of this method is not the chatbot — it is the **template discipline**: the
model is never allowed to freestyle, only to fill known-good structures
that the physician has refined case after case.

## The flow

1. **Capture.** During or after the consult, the physician records or
   dictates the case: many use a chatbot's voice mode, which records,
   transcribes, and holds the case in the conversation; any transcription
   system works as well (dictaphone + transcription, phone dictation).
2. **Discuss.** The physician reasons about the case in the same chat —
   differential, plan, what to prescribe, what to rule out.
3. **Format.** The physician pastes the **template pack** (below) and asks
   for the documents needed: SOAP note, prescriptions, labs, referral,
   imaging requisition, work leave, timeline, decision flow, and the
   patient explanation paragraph.
4. **Review and use.** Every output is a draft; the physician reviews,
   corrects, and only then uses it. Nothing is sent to anyone by a machine.

## Why the strictness matters

Free-form AI output drifts: it wraps text in code boxes, decorates with
bold and bullets, re-summarizes the wrong case, mixes an example with the
current patient. Each rule in the pack exists because that failure
happened at least once. The two most important disciplines:

- **Context control.** Filled examples inside the pack are FORMAT ONLY.
  The model must apply the structure to the current case — the most
  recently discussed patient — and never reuse an example's demographics,
  diagnosis, or treatment.
- **Formatting bans.** No wrapping in code blocks, no bold, no dashes
  used as punctuation, labs one per line without bullets, patient-facing
  text in the patient's language, clinical documents never referencing
  the messaging medium.

## Privacy rules for this method

A general chatbot is a consumer service: what you paste travels to that
provider under consumer terms, not a healthcare agreement. So:

- Work on **case numbers, never names** or identifying numbers; keep
  identity only in your own chart system.
- If you must process identifiable data, use a BAA-covered route (see the
  form-robot page's Bedrock notes) instead of a consumer chatbot.
- Disable chat history/training options where offered, and treat the
  transcript like clinical scratch paper: it is not the chart.

## The template pack

Everything below is a FORMAT EXAMPLE with fabricated content — no real
patient appears here. The physician adapts wording, language, and
letterhead to their own practice and jurisdiction.

### Global instructions to the model

```
IMPORTANT CONTEXT CONTROL
The case we are working on is the last patient discussed immediately
before this message. Any SOAP / prescription / referral / imaging
templates I provide are FORMAT EXAMPLES ONLY.
DO NOT reuse the demographics, diagnosis, or treatment from the examples.
DO NOT mix cases. DO NOT summarize or restate the example case.
Apply the example template structure, populated only with data from the
current case. If ambiguous, default to the most recently discussed
patient and plan, not the example.
FORMATTING, ALWAYS: no code-block wrapping, no bold, no dashes as
punctuation, no extra commentary around the documents. Patient-facing
text is written in the patient's own language. Clinical documents never
mention the messaging medium.
```

### SOAP note (S / A / P)

```
S: Homme de 24 ans consultant pour une toux productive persistante depuis
le 20 juillet 2025. Expectorations claires à blanches, adhérentes dans la
gorge, soulagées temporairement par l'eau et l'expectoration. Aucun
symptôme systémique associé. N'a pas tenté de traitement pharmacologique.
Pas de fièvre, dyspnée, douleur thoracique, exposition connue, antécédent
d'asthme, allergies ou RGO. Symptômes constants, non aggravés la nuit ou
en position couchée. État général bon.
A: Toux chronique probablement post-infectieuse avec hypersécrétion
bronchique. Composante bactérienne persistante possible.
P: Azithromycine (Z-Pak) x 5 jours et Ventolin PRN. Prescription à faxer
à sa pharmacie dès que l'information sera transmise. Suivi recommandé
dans 7 jours. Si amélioration <70 %, envisager CXR.
```

### Prescriptions (ordonnances)

One numbered block per medication; drug, strength, route, schedule,
duration; quantity; renewals. Never split one visit into several
prescription documents.

```
1. Azithromycine (Z-Pak)
500 mg PO jour 1, puis 250 mg PO DIE jours 2 à 5
Quantité: 6 comprimés
Renouvellements: 0
2. Gelomyrtol forte 300 mg
1 capsule PO TID x 5 jours
Quantité: 15 capsules
Renouvellements: 0
3. Ventolin (Salbutamol) 100 mcg inhalateur-doseur
2 inhalations PO q4-6h PRN toux ou oppression
Quantité: 1 inhalateur (200 doses)
Renouvellements: 0
```

### Laboratory requests

One test per line. No bullets, no explanations in parentheses, no
wrapping, no blank lines between tests.

```
FSC
CRP
ESR
HLA-B27
Uric acid
TSH
Free T4
Creatinine
```

### Referrals (three-block structure)

Block 1: specialty, then the explicit ask in one or two sentences.
Block 2: brief clinical summary (age, sex, presentation, relevant
treatment). Block 3: urgency with a concrete window. **Telemedicine
routing rule:** when a telemedicine patient needs in-person evaluation,
the referral goes to primary care / family medicine — not a specialist —
unless the physician specifies otherwise.

```
Chirurgie générale: Merci d'évaluer cette patiente pour cholécystectomie
laparoscopique élective. Bilan préopératoire et imagerie en cours.

Femme de 25 ans présentant des douleurs abdominales post-prandiales
typiques de colique biliaire depuis 6 mois, avec progression de la
fréquence des épisodes, intensité 7/10, déclenchées par les aliments
gras, associées à des nausées. Traitement actuel: citalopram 30mg pour
anxiété.

Semi-urgent - consultation dans les 2-4 semaines
```

### Imaging requisitions

Study name and views, colon, then what to look for; a clinical summary
paragraph; an urgency line with a window. Separate multiple studies with
a line of X's.

```
Échographie abdominale complète: Recherche de lithiase vésiculaire,
évaluation de l'épaisseur de la paroi vésiculaire, recherche de signes de
cholécystite chronique, évaluation du parenchyme hépatique et des voies
biliaires intra et extra-hépatiques, évaluation du pancréas.

Femme de 25 ans présentant des douleurs abdominales post-prandiales
déclenchées par les aliments gras depuis 6 mois, avec progression de la
fréquence des épisodes, nausées associées, intensité 7/10.

Urgent - dans les 48-72 heures
```

### Work-leave notes (two variants, one sentence each)

With diagnosis:

```
Absence justifiée du 14/10/2025 au 16/10/2025 inclus pour
gastro-entérite aiguë nécessitant repos et hydratation à domicile.
Reprise du travail/cours/activités prévue le 17/10/2025 sous réserve
d'amélioration clinique.
```

Without diagnosis (patient privacy):

```
Absence justifiée du 14/10/2025 au 16/10/2025 inclus pour raison
médicale. Reprise du travail/cours/activités prévue le 17/10/2025 sous
réserve d'amélioration clinique.
```

### Case summary (one paragraph, fixed opening)

```
Summary: A 32-year-old pregnant woman at 8.6 weeks gestation presents
with vaginal bleeding, abdominal pain (7/10), fatigue, and night sweats.
The clinical picture is consistent with threatened miscarriage, but
ectopic pregnancy and other serious first-trimester complications must be
excluded urgently. Immediate transvaginal ultrasound and hCG
quantification are essential to determine fetal viability and guide
management.
```

Optionally followed by a one-line thesis of the kind: "The X-ray confirms
what is broken, but not what could be permanently damaged, and those
unanswered questions are exactly why in-person assessment is mandatory."

### Horizontal ASCII timeline

A horizontal timeline of the illness from symptom onset to today: exact
dates, Day-N counts at each event, text symbols marking onset, triggers,
worsening, improvement, and today.

### ASCII decision flow

The diagnostic logic as a vertical flow: presenting problem, what is
known (with check marks), what is unknown, what must be ruled out and
why, the decision threshold, and the resulting action — mirroring how the
case was actually reasoned.

### The patient explanation paragraph ("#7")

One single warm, natural paragraph in the patient's own language, placed
at the top of the reply, never wrapped in a box. Rules: it opens with
what the physician believes is going on; it names each treatment being
proposed, what it is, how it works, how it is taken, the side effects to
watch for and how to minimize them; it uses the future tense ("je vais
vous prescrire"), never the past; it never gives generic promises like
"I'll prescribe you treatment"; it draws only on the plan already
discussed in the case. Telemedicine rules: never offer an in-person
appointment — if in-person evaluation is needed, say a referral note will
be provided so the patient does not have to re-explain everything
(doctor-to-doctor, already organized), note that the patient arranges the
visit themselves, and offer 1 to 3 days of work leave so they can arrange
it without pressure. Never end with promises of follow-up.

## Where this method fits

It is the fastest to start (nothing to install) and the least automated:
every document passes through the physician's hands by design. Practices
that outgrow it move the same templates into the automated methods — the
form robot, the messaging brain, the kiosk — where the identical
discipline runs with less copying and pasting. The templates are the
method; the infrastructure is optional.
