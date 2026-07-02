# Design decisions — the public record

This page states the project's mission and the reasoning behind its main
architectural choices. It is the public companion to the maintainer's
internal design notes (which are not part of this repository).

## Mission

Free health education/triage guidance and free physician documentation
automation for anyone in the world — self-hosted, no cost to the project's
authors, no monetization, permissively licensed so the methods become
common property.

**Target context, explicit:** this is designed for places with severe
physician scarcity (in some regions roughly 1 doctor per 50,000+ people),
where the realistic alternative is no medical guidance at all — not as a
replacement for accessible healthcare systems in countries that already
have them. Two concrete consequences:

- Guidance must be genuinely actionable (what to do, what to watch for,
  when to travel to the nearest available care), never a reflexive "see a
  doctor" that assumes one is reachable.
- Translation priorities follow physician-scarce regions specifically,
  not global speaker counts.

## "Human Medschool for AI" — why structure is the product

An AI's default answer to a symptom description is free-form text in
whatever shape the model feels like. Medical school does not let a human
reason that way: it imposes targeted history-taking, a differential, and a
structured plan, because unstructured reasoning misses what a checklist
catches. `core/` applies that same discipline to the AI: a structured
intake, a schema-constrained recommendation, and a cross-checking panel.
That structure — not any particular model — is this project's value, and
it holds whichever provider you plug in.

## Why a multi-AI panel is structural, not optional

In a clinic, a physician reviews the AI's output. In a free worldwide
release, there is no physician behind any given deployment. The N-model
panel (minimum 2, default 3–4, self-hoster picks providers) substitutes
for that oversight: independent models must reach consensus, material
disagreement is surfaced to the user (`divergenceFlag`) rather than
silently resolved, red flags are kept if *any* model raised them, and the
panel hard-fails rather than quietly falling back to a single model.

## One codebase, not a shared engine

To its builders this is one system; to each person it is one standalone
tool. Every front-end (`bot/`, `instanthpi/`, `kiosk/`, `epic/`,
`history-insights/`) bundles its own local copy of the engine library
(`core/`) and calls it in-process. Nothing is shared at runtime: no
central server, no hosted instance, no account with the project. Each
audience installs only their own piece, from their own download, following
only their own `start/` page.

**The stable seam:** `core/`'s internals (which providers, how the panel
aggregates, how intake questions are sequenced) can change freely as long
as the `getRecommendation` contract (`core/INTERFACE.md`) is preserved.
Institutions integrating their own front-end (`INTEGRATION.md`) depend on
exactly the same guarantee the bundled front-ends do.

## Positioning: prepare for a doctor visit, not replace a doctor

The patient-facing tools lead with visit preparation — organizing
symptoms, history, and questions into something a clinician can use. This
holds even where the visit is far away: the prepared, portable summary
simply waits until care becomes reachable, and that visit then starts from
an organized history instead of zero.

## Privacy by construction, stated honestly

Session state is ephemeral; no patient identity is persisted by default;
the intake schema structurally excludes identity fields; a local
best-effort filter strips likely identifiers before text leaves the
self-hoster's machine. What remains true and is stated plainly everywhere:
whichever AI provider a self-hoster configures receives the (redacted)
text under that provider's own terms — only a fully local model keeps
everything on-machine — and self-hosting is not, by itself, "HIPAA
compliance." Physicians who need a BAA-covered path have one documented in
`docs/hipaa-bedrock-guide.md`, with `instanthpi/verify-hipaa.cjs` checking
what a script can check and naming what it cannot.

## Provider neutrality, and the cost bet

The project endorses no AI provider (`core/providers/`: Anthropic,
DeepSeek, OpenAI, any OpenAI-compatible local model). Today's practical
default for broad adoption is the cheapest viable option, including local
models; the provider-agnostic design is also a bet that AI compute costs
— including BAA-covered infrastructure — keep falling, so better-resourced
deployments become viable later without any redesign.

## Adoption model

Physician-by-physician, town-by-town: onboarding is written for one
physician adopting this for their own practice, not for a top-down
institutional rollout. The reference figure quoted in the physician
materials — a documentation-workload reduction on the order of 70% — is
one physician's real, ongoing experience with this pattern, stated as
such, not a guaranteed outcome.

## Licensing and distribution

Code is MIT. `core/persona/` is CC BY-NC so the clinical voice cannot be
repackaged into a competing commercial product. The persona style guide
ships **generic-only**, behind a hard PHI-scrub gate: no practice-derived
text enters this repository until an adversarial verification pass
confirms zero patient-identifying content survives. GitHub is canonical;
per-audience zip bundles (`package-releases.cjs`) are built only from
git-tracked files, so credentials and local data can never enter a
download.

## Explicit non-goals

- No hosted or shared instance operated by the project (it would reopen
  the central-liability and data-exposure risks self-hosting exists to
  avoid).
- No monetization of either the patient or physician front-end.
- No anonymous or automated mass-posting distribution; releases are
  openly attributed through official channels.

## Future directions (recorded, not built)

- Coordinated networks of independent self-hosted nodes — families,
  communities, clinics — that keep working regardless of what happens to
  any central system, cooperating with local physicians. What ships today
  is the topology that makes this possible: every deployment already
  stands alone (see `docs/diagrams.md`, diagram 5).
- Connecting patients to licensed human providers for what AI triage
  should not handle alone.
- General daily-living and wellness guidance beyond episodic complaints.
