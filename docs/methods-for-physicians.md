# Intake and automation methods, published

These are the intake and automation methods used in the originating
practice, written down so that any physician, anywhere in the world, can
adopt them. Everything here is generalized: there is no patient content, no
proprietary data, and nothing tied to one country's health system. The
tools referenced (`core/`, `instanthpi/`, `kiosk/`, `bot/`) are the free,
self-hosted implementations of these methods, but the methods themselves
work with whatever a physician already has — a form tool, a messaging
channel, a tablet, and an AI panel they run on their own accounts.

Two framing points before the methods:

- **Who this serves first.** The order of service is deliberate: first the
  places where no help is coming — regions with one physician for tens of
  thousands of people — then self-reliant families preparing for the day
  care is out of reach, and only then convenience. A structured,
  cross-checked AI consultation costs on the order of a few cents of
  computing. Keeping that from the people who need it most is no longer a
  resource problem; it is a choice. Publishing these methods is part of
  refusing to keep making it.
- **What this never claims.** None of this replaces a physician. In the
  physician version, the physician reviews and approves everything and
  remains the author of record. Nothing here is emergency care, and nothing
  here tells anyone to medicate themselves — self-medication is one of the
  documented drivers of drug resistance worldwide.

## 1. Why structured intake

Free-form chat is a poor way to take a medical history — for a human
trainee and for an AI alike. Medicine solved this problem long ago: every
medical school teaches a fixed architecture for the history of present
illness, and a careful clinician asks roughly the same skeleton of
questions in roughly the same order, every time, precisely so nothing is
missed. The insight behind all three methods below is to give the AI the
same schooling — a fixed question architecture that runs *before* any
reasoning happens, instead of letting a conversation wander and hoping the
important facts surface.

A good intake battery, whatever its exact wording, covers this sequence:

1. **Chief complaint** — the main problem, in the patient's own words.
2. **Onset and duration** — when it started, how it has evolved.
3. **Severity** — a 0–10 scale, or a functional equivalent.
4. **Modifiers** — what makes it better, what makes it worse.
5. **Red-flag screen** — the small set of symptoms that mean *seek care
   now*, asked explicitly rather than waited for.
6. **Context** — medications, allergies, relevant history, and what the
   patient themselves thinks, fears, and expects.

Fixed architecture beats free chat for three reasons: completeness (the
red-flag screen is always asked, not sometimes volunteered), comparability
(every case arrives in the same shape, so the physician's review is fast
and the AI panel's input is consistent), and teaching (patients who go
through a structured intake learn to describe their own health clearly, to
anyone, anywhere — which was always the point).

The three methods below are the same battery delivered through three
different doors. The battery is the constant; the channel is whatever the
practice and the patient actually have.

## 2. Method A — Form-based intake (the original method)

The original and simplest method: send the patient a link to a fixed,
structured web form. Any form tool works — Formsite-class hosted form
builders, Google Forms, or the kiosk module's own self-hosted page. The
essential property is not the tool; it is that every answer comes back as a
**named, structured field** rather than a paragraph to be mined.

The flow:

1. Patient requests a consultation (by phone, message, or in person).
2. The practice sends one link to the intake form.
3. The patient completes the battery at their own pace.
4. The answers return as structured fields.
5. The AI panel turns the fields into a draft HPI narrative plus a set of
   considerations (possible explanations with stated confidence, red flags
   restated, suggested next steps).
6. The physician reviews the draft against the raw answers, edits what
   needs editing, and decides. Nothing goes to the patient until then.

### A generic 16-question general intake battery

This is a **starting template**, not a prescription. Physicians adapt the
wording, the language, and the emphasis to their own population and
jurisdiction; specialty practices replace the middle questions with their
own. What should survive any adaptation is the skeleton: complaint → onset
→ course → severity → modifiers → associated symptoms → red flags →
context → the patient's own perspective.

1. What is the main problem you would like help with today?
2. When did it start?
3. Since it started, has it been getting better, worse, or staying the
   same?
4. On a scale of 0 to 10, how severe is it at its worst?
5. What makes it better?
6. What makes it worse?
7. Have you noticed any other symptoms along with it?
8. Do you currently have any of the following: difficulty breathing, chest
   pain, fainting, new confusion, heavy bleeding, or the worst pain of
   your life? If yes, which?
9. Have you had a fever? If it was measured, how high?
10. Has anything like this ever happened before? What happened then?
11. What medications do you take, including anything over the counter or
    herbal?
12. Do you have any allergies to medications?
13. Do you have any ongoing medical conditions?
14. Have you had any surgeries or hospital stays relevant to this problem?
15. If it could apply to you: is there any chance of pregnancy?
16. What do you think might be going on, is there anything you are
    especially worried about, and what are you hoping can be done today?

Question 8 is the red-flag screen and is the one question that should never
be cut. Question 16 (ideas, concerns, expectations) is the one most often
cut and most worth keeping — it routinely changes what the right reply is.

## 3. Method B — Messaging-based intake

The same battery, delivered over secure messaging when a form link is not
the natural channel — because the patient is already in a message thread,
or because a form tool is not available.

The mechanics that make it work:

- **The battery goes out as one message**, all questions together, not as a
  drip-fed interrogation. The patient answers everything in one sitting, in
  their own words, on their own time.
- **On reply, the system drafts two things for the physician's review**:
  first, a short recap paragraph that restates the case *in the patient's
  own words* — a faithful summary the patient could read and say "yes,
  that's what I said"; second, a **short** set of targeted follow-up
  questions, chosen specifically to discriminate between the leading
  possibilities the panel raised. Five to ten questions that actually
  narrow the field, not another generic battery.
- **Never re-ask what was answered.** A follow-up that repeats an already
  answered question tells the patient nobody read their message. The
  follow-up set contains only what is genuinely missing or genuinely
  discriminating.
- **Photos are requested only when the presentation is visible** — a rash,
  a wound, a swelling. Not speculatively, and never as a substitute for
  examination when examination is what the case needs.

One refinement worth adopting: when a patient's *first* message already
contains a detailed history — timeline, symptoms, modifiers — skip the full
battery. Send the recap paragraph confirming what they said plus only the
targeted questions that are actually missing. The battery is for thin
openers ("I need a consultation"), not a wall every patient must climb.

## 4. Method C — Waiting-room kiosk intake

The same battery on a tablet at reception. A patient walks in, answers the
questions on a browser page with large touch targets — one question per
screen, every question after the first skippable — and is told to have a
seat. By the time the physician calls them in, a premade pre-visit card is
waiting in the review queue: the patient's answers, the AI panel's
considerations and red flags, and a drafted set of talking points.

Safety properties any kiosk implementation should keep:

- **A YES on the red-flag screen tells the patient to alert reception staff
  immediately, in person** — it does not wait for any AI.
- **The AI's output is never shown on the kiosk.** The patient sees only a
  thank-you screen; the reasoning goes to the physician's queue.
- **No identity fields.** The intake has nowhere to put a name, phone
  number, or health-card number; reception already has identity, and the
  physician matches the card to the person they call in.
- **The screen clears itself** after submission and wipes half-finished
  answers after inactivity, so no patient sees another's entries.
- The kiosk endpoint is write-only: it accepts submissions and cannot list
  or return cases.

See `kiosk/README.md` for the reference implementation.

## 5. The review-card pattern

Every AI draft, from any of the three methods, becomes exactly one
reviewable unit: a **card**. The card format is documented in full in
`instanthpi/carousel/card-schema.md`; the pattern is what matters and is
worth adopting even in a completely different implementation.

One card carries:

- **What the patient said** — the structured intake answers, kept verbatim
  for audit, plus a short case summary written for the physician's eyes.
- **The panel output** — the considerations with confidence, a divergence
  flag when the independent models disagreed, red flags, and suggested
  next steps. Disagreement is shown, never hidden.
- **Numbered plan options** — the realistic actions for this specific case
  (reply only; reply plus a document; reply plus a fax; or "none," meaning
  the physician handles it outside the tool). When red flags are present,
  the urgent option is option 1, never buried.
- **A pre-drafted reply** — patient-facing text the physician can approve
  as written, edit, or discard.

The physician's verbs are: **approve** (optionally editing the reply),
**dismiss** (with a reason), or choose **none**. Nothing sends itself. A
card that is never approved never acts. Approval and execution are recorded
separately, so there is always an audit trail of who decided what and what
was actually sent. The review queue is gated behind the physician's own
PIN, and if a new message arrives from the patient after a card was built,
the case correctly re-enters the queue instead of being silently treated as
handled.

This is the whole trust model in one sentence: the AI prepares, the
physician disposes.

## 6. Document generation and fax

Approved cards often need paper: a referral letter, a lab requisition, a
completed form. Two distinct tools cover this:

- **Generate from scratch** — a drafted letter or requisition rendered as a
  PDF from the card's content.
- **Fill an existing blank form** — when a third party supplies its own
  fillable PDF, the tool fills the actual original form field-for-field
  from what the chart documents, leaving unknowns blank rather than
  guessing.

Two rules apply everywhere:

- **PDFs are unsigned by default.** No signature image ships with the
  tools, and automation never applies one. The physician signs — that act
  stays human, deliberate, and theirs.
- **Faxing goes through the physician's own fax account** — their own
  credentials with their own provider, consistent with the project's
  no-shared-infrastructure principle. A fax is sent only as the execution
  of an approved card, never speculatively.

## 7. Adoption notes for different countries

Nothing in these methods depends on one country's messaging platform, form
vendor, fax provider, or billing system. To adopt them:

- **Any messaging channel works** — whatever secure messaging is lawful and
  usual in your jurisdiction. The reference implementation speaks to one
  such platform; the client is deliberately thin and documented for
  adaptation.
- **Any form tool works** — hosted form builders, Google Forms, or the
  self-hosted kiosk page. The requirement is structured fields out, not any
  particular vendor.
- **Any fax or document channel works**, or none — some systems have
  abandoned fax entirely; the card's plan options simply reflect what is
  actually possible locally.
- **Translate the battery, keep the skeleton.** The 16 questions are a
  template; the sequence (complaint → onset → course → severity →
  modifiers → red flags → context → the patient's perspective) is the
  invariant.
- **Check your own rules.** Privacy law, telemedicine rules, and
  professional obligations differ by jurisdiction. The tools carry a
  jurisdiction field through to the AI panel and keep identity out of AI
  inputs by design, but compliance is the adopting physician's to verify,
  as it is for any tool in their practice.

The constants — the three things that do not change no matter the country
or the channel — are:

1. **The battery**: a fixed question architecture asked before any
   reasoning.
2. **The panel**: more than one independent AI cross-checking every draft,
   with disagreement shown, never a single model presented as an oracle.
3. **Physician review**: every draft becomes a card, every card waits for
   the physician, and nothing sends itself. The physician approves
   everything and is the author of record.

These methods were built and tested with Claude Code driving the tooling;
any capable AI assistant works. The point was never the assistant — it is
that a careful intake, a cross-checked panel, and a physician who remains
in charge fit together into a practice any physician can run on their own
machines, for the cost of a few cents of computing per case.

## Lesson: text beats voice for an AI-assisted practice

If you are choosing how to run consultations, choose a **secure,
text-based messaging platform** (Spruce-class) over speech-first
consultation. The reason is structural: AI can do far more with text.

- **Text is already machine-readable.** Every message is instantly
  available to the intake battery, the panel, and the drafting pipeline —
  no transcription step, no transcription errors, no audio to store.
- **Automation reaches further.** The whole review-card pipeline —
  drafted replies, prescriptions, referrals, PDFs, faxes — hangs directly
  off the message thread. A voice visit must be converted to text before
  any of that can start.
- **Asynchronous by nature.** The patient writes when they can; the
  physician reviews when they can; the AI works in between. No
  scheduling, no waiting room, and the thread itself is documentation.
- **Every language.** Text handles whatever language the patient writes
  in, and the templates answer in kind.

## Lesson: collect your proof of work, systematically

A messaging practice produces something a waiting room never did: a
clean, natural moment right after each completed consultation to ask one
non-bothering question — *please share your experience of consulting
with our clinic here.* Sent systematically as part of a warm exit
message, this builds a public, verifiable track record of your work,
review by review. After thousands of patients, the originating practice's
collected thanks became a public wall of them:
[www.instanthpi.ai/thankyou](https://www.instanthpi.ai/thankyou).

The exit message has a fixed anatomy: a light signature line; the review
invitation with a public review link; an optional introduction of a free
educational bot patients can keep; a plain statement of the practice's
scope and limits; a sign-off. A generic template — adapt language, links,
and scope to your practice; every bracket is yours to fill:

```
[emoji storyline of your service: symptoms -> message -> care -> relief]

[Your clinic name] à votre service.

Merci de partager votre expérience avec notre clinique : cela aide
d'autres personnes à comprendre nos services. Vous pouvez laisser votre
avis ici : [your public review link]

J'ai créé [your bot handle], un outil éducatif gratuit, disponible 24/7,
dans n'importe quelle langue.

C'est pour qui? Tout le monde. Les gens sur la route, les familles sans
médecin de famille, les personnes qui ne parlent pas encore la langue
locale, n'importe qui qui a des symptômes et ne sait pas par où
commencer, les personnes sans accès aux médecins.

Ça fait quoi? C'est un peu comme votre consultation ici, mais à titre
éducatif seulement et sans médecin derrière. 100% IA. Vous décrivez vos
symptômes, et l'assistant vous génère un bilan éducatif complet : résumé
de votre situation, exemples de documents médicaux, raisonnement
clinique, chronologie, et questions fréquentes, tout ça en quelques
minutes.

Ça aide comment? Quand vous arrivez chez un médecin avec un résumé clair
de vos symptômes, la consultation va plus vite et rien n'est oublié.

Combien ça coûte? Gratuit. Zéro. Rien. Une consultation de ce type coûte
quelques fractions de cent en calcul.

Essayez-le : [your bot link]

[Plain statement of your scope: what you treat, what you do not, and who
should seek a family physician or urgent care instead.]

À bientôt.
```

Why it works: it asks once, at the natural moment of gratitude; it never
pressures; it gives the patient something free and useful in the same
breath; and the scope paragraph does double duty as expectation-setting
for the next consultation. The reviews it gathers are the practice's
proof of work — public, dated, in patients' own words.
