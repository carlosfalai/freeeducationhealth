# The physician brain — component mapping

Verified 2026-07-01 against Carlos's live production system (read-only
survey, no PHI). This is the source-of-truth mapping from what already
works in production to what gets generalized/ported into `instanthpi/` for
any self-hosting physician.

## 1. Carousel — the review/approval UI

Production: `_carousel/cards-server.cjs`, PIN-gated, serves cards rendered
by `_build-cards.cjs` from a per-case fiche. A live gate
(`_unread-gate.cjs` + a Spruce API check) confirms the patient is still
inbound-last before a card is even shown — a handled case is evicted the
instant the physician replies. One-click approve dispatches via
`_dispatch.cjs`/`_work-ledger.cjs` (state machine: CREATED -> DONE).

Port as: `instanthpi/carousel/` — same card spec, gate logic, and
work-ledger state machine, generalized to run against the self-hoster's own
Spruce account. PIN gate stays mandatory (this is what stands between a
public Telegram-bot-style exposure and a private single-physician tool).

## 2. Spruce integration — read/triage/draft/gate

Production: `_real-unread.cjs` (authoritative unread worklist, shared rule
in `_lib-actionable.cjs`), `_voice-gate.cjs` (gates outbound sends). Direct
HTTPS to `api.sprucehealth.com`, no SDK.

Port as: `instanthpi/spruce/` — thin REST client + the actionable-message
rule, parameterized on the self-hoster's own Spruce token. Known gap in the
original (contact-field PATCH not built) is not a blocker for v1; note it
as a documented gap, not a silent omission.

## 3. The Inviter — patient onboarding to Spruce (PHASE 2 / optional)

Production: full pipeline in `SPRUCE-PLAYBOOK.md` — Spruce invite -> Gmail
email -> join verification -> Gemini Live + Twilio voice call for
non-joiners -> capped recall policy. Requires an always-on host (EC2) for
the voice bridge plus a Twilio number.

This does not fit "clone the repo, run it on your laptop." It's real and
valuable, but it's infra-heavy relative to everything else here. Scoping it
as an optional phase-2 module (`instanthpi/inviter/`, documented but not
required for v1) rather than blocking the core release on it.

## 4. Faxing — outbound + inbound routing

Production: outbound via SRFax REST (`_fax.cjs`, `Queue_Fax` action).
Inbound: `_route-pdfs.cjs` pulls from a Google Drive/OneDrive folder, OCRs
via `pdftotext`, files by matching identifiers.

Port as: `instanthpi/fax/` — outbound is a straightforward SRFax client,
generalized to the self-hoster's own SRFax account (bring-your-own
credentials, per the no-shared-infra principle). Inbound routing needs the
Drive/OneDrive folder made configurable rather than hardcoded to Carlos's
own folder layout.

## 5. PDF generation and PDF form-filling — two distinct tools

- Generate-from-scratch: `instanthpi-site/lib/forms-engine.cjs`, pdf-lib.
- Fill-an-existing-blank-form: `_fill-external-form.py`, PyMuPDF (fitz),
  handles comb-field dates/phones and a logo "brand-patch" step for
  mismatched insurer headers.

Port both as `instanthpi/pdf/` (`generate.js` and `fill.py`). Neither
carries Carlos's real signature image — the self-hoster supplies their own,
or the module ships with signing left as an explicit manual step (matching
Carlos's own current practice: he signs manually even with automated
filling).

## What this means for the flagship design

Every one of these (Carousel, Spruce, fax, PDF) is already proven, running
code — this is a port-and-generalize job, not new invention. The Inviter's
voice-calling half is the one piece that's genuinely a separate, heavier
undertaking and is scoped out of v1 accordingly.
