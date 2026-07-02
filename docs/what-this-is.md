# What this is: AI-prepared medical visits where doctors are scarce

A plain-language explanation of FreeEducationHealth for patients, community
health workers, clinics, and ministries in regions with severe physician
scarcity — and for anyone deciding whether to deploy it.

## The problem it addresses

In parts of the world there is roughly one physician for every 50,000
people. At that ratio, the scarcest resource in the entire health system is
a doctor's attention. Patients may travel hours or days for a visit that
lasts minutes, and much of that visit is spent on something no doctor is
needed for: assembling the story — when the symptoms started, what makes
them better or worse, what medications were tried, what the patient is most
afraid of, what questions they need answered before they leave.

## A communication tool that prepares the visit before it happens

FreeEducationHealth uses AI as a **communication tool between the patient
and the doctor**, not as a replacement for the doctor.

Before the visit — from a phone (Telegram bot), a waiting-room tablet
(kiosk), or a desktop app — the AI interviews the patient with the same kind
of structured questions a clinician would open with: chief complaint,
targeted follow-ups, relevant history. It then organizes the answers into
two outputs:

1. **For the patient**: plain-language education — what their symptoms may
   relate to, warning signs that mean "travel to the nearest facility now,"
   sensible self-care while waiting, and the questions worth asking when
   they do reach a doctor. Written to be actionable even when no doctor is
   reachable nearby — never a bare "go see a doctor."
2. **For the doctor**: a prepared, structured summary — the history already
   taken, considerations already organized, red flags already surfaced — so
   the consultation starts at the decision, not at the beginning of the
   story.

The effect is that each scarce physician-hour goes further: the doctor
walks into every visit with the preparation already done, and the patient
arrives already understanding their own situation better.

## The doctor guides treatment and keeps oversight

Nothing in this system decides treatment. Its role ends where the
physician's begins:

- The AI **prepares** — history, education, draft documentation,
  considerations with confidence levels.
- The physician **decides** — diagnosis, treatment, follow-up — and
  reviews every AI-drafted document before it goes anywhere. In the
  physician-facing front-end, every draft is a review card the doctor
  approves, edits, or rejects; the physician remains the author of record.

This makes the system an **oversight multiplier**: one physician can
meaningfully supervise the care journey of far more patients when the
collection, organization, and drafting work is done before their review,
rather than during it.

## Why several AIs triangulate instead of one AI answering

Medicine has never trusted a single opinion for anything that matters.
Second opinions, case conferences, multidisciplinary team reviews, and the
discipline of the differential diagnosis all exist because independent
perspectives catch what one perspective misses. That is standard modern
practice.

This project applies the same principle to AI:

- Every question is put **independently to at least two — normally three or
  four — separate AI models** from different providers (a panel).
- Their answers are **consolidated**: where the models agree, that
  consensus becomes the recommendation, with a confidence level.
- Where they **materially disagree, the disagreement itself is surfaced**
  as an explicit divergence flag — never silently resolved by picking one
  model's answer. A flagged divergence is a signal that this case needs a
  human's judgment.

A single AI model can be confidently wrong. Several independent models
being confidently wrong *in the same way* is much rarer — and when they
split, the system says so instead of guessing. In a deployment where no
physician can review every interaction, this triangulation is the
substitute for that oversight; where a physician is present, it makes their
review faster and better-informed.

### What a debated case costs

In medicine, doctors discuss difficult cases together — case conferences,
tumor boards, corridor consults. That discussion is exactly what a panel
run is: several advanced models independently working the same case, their
answers debated and consolidated. At current provider pricing, a fully
debated multi-model case costs on the order of **one Canadian cent**. The
models involved have matched or exceeded physician performance on
structured diagnostic-reasoning studies
(see [`evidence-ai-vs-physicians.md`](evidence-ai-vs-physicians.md) for the
actual studies and their limits — benchmark performance is not the same as
bedside care). At roughly a cent per case, a region that cannot afford one
doctor per town can still afford several independent expert-level opinions
on every single case, every time.

## Works with any LLM system online — you bring your own

The intelligence behind the panel is **any large language model available
online (cloud-based)**: Anthropic (Claude), OpenAI, DeepSeek, Google
Gemini, or any OpenAI-compatible endpoint. The application itself runs on
your own computer or clinic hardware; the language models run on their
providers' servers online, accessed with **your own accounts and API
keys**.

- No central FreeEducationHealth server exists. Nobody in this project can
  see your data, because nothing passes through us — there is no "us" at
  runtime.
- No provider is endorsed over another. Pick the models you have access to
  and can afford; the panel design works with any mix.
- If internet access or data-sovereignty rules require it, the same panel
  can run against a locally hosted model (Ollama / any OpenAI-compatible
  server) instead of, or alongside, the online providers.

## Make it fit your clinic: hand it to an AI coding agent

This repository is deliberately structured so that an AI coding agent —
built and tested with **Claude Code** — can take it apart and rebuild it to
fit you. Open the repo in the agent and ask, in your own words:

- *"Set this up for me"* — `CLAUDE.md` is a complete runbook; the agent
  will install, configure, and verify everything, asking you only for your
  own API keys.
- *"Break this down and adapt it to my clinic's structure"* — reshape the
  intake questions to your patient population, translate every
  patient-facing message into your language, connect it to your record
  system (`INTEGRATION.md`), keep only the front-ends you need.
- *"Make the reports match our format"* — restyle the education reports and
  PDFs to your own templates.

The architecture (one side-effect-free engine, independent front-ends,
JSON-schema contracts) exists precisely so these modifications are safe to
make: whatever the agent restructures, the multi-model panel rule
(`panelSize >= 2`), the physician-approval gates, and the no-central-server
design stay intact.

## What it is not

- Not a doctor, and not a diagnosis service — it prepares visits and
  educates; treatment decisions belong to clinicians.
- Not a hosted product — there is nothing to subscribe to, nobody to pay,
  and no server to trust. It is free, open-source, and self-hosted.
- Not a compliance claim — self-hosting does not by itself make a
  deployment "HIPAA compliant" or equivalent; that depends on your own
  arrangements with the AI providers you configure.
