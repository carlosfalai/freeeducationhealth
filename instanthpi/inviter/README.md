# instanthpi/inviter/ -- NOT built in v1 (phase 2 / optional module)

This directory intentionally contains no code. It documents what "the
Inviter" would do and why it's scoped out of this release, per
`docs/physician-brain-components.md` section 3.

## What it would do

In Carlos's own production system, the Inviter is the pipeline that gets a
patient from "not yet on Spruce" to "actively reachable on Spruce":

1. Send a Spruce platform invite to the patient.
2. Follow up with an email pointing them to the invite.
3. Poll/verify whether the patient actually joined Spruce.
4. For patients who don't join within some window, place an outbound AI
   voice call (natural-language, not a robotic IVR) that explains the
   invite and offers to walk them through joining.
5. Apply a capped recall policy so non-joiners aren't called indefinitely.

## Why it's out of scope for this release

Every other module in `instanthpi/` (`carousel/`, `spruce/`, `fax/`, `pdf/`)
is a script or small local server a physician can run on their own laptop
alongside their own Claude Code session, on demand, with no infrastructure
commitment. The Inviter's voice-calling step breaks that model:

- It needs an **always-on host** (not "run when the physician asks"), since
  outbound calls and the webhook callbacks that drive a voice conversation
  need a stable, reachable endpoint.
- It needs a **Twilio phone number** and account, which is a real recurring
  cost and a second third-party credential set beyond Spruce/SRFax/AI
  providers.
- It needs a **realtime voice AI integration** (e.g. a Gemini Live-style
  bidirectional audio session bridged through Twilio's media streams),
  which is meaningfully more infrastructure than a REST call.
- It carries its own consent/robocall-law surface (e.g. TCPA-style rules in
  the US, equivalents elsewhere) that a generic self-hosted tool cannot
  respons­ibly default into "on" for every jurisdiction a self-hoster might
  operate in.

None of that fits "clone this repo, put in your API keys, run it from your
coding agent." It's real, valuable functionality -- just a separate,
heavier undertaking than everything else in `instanthpi/`.

## If you want to build it yourself

The shape of a self-hosted Inviter, if someone wants to extend this project:

1. **Invite step**: use `instanthpi/spruce/client.cjs` as a starting point
   for the Spruce REST calls -- an invite endpoint following the same
   Bearer-auth REST pattern already established there (verify the exact
   path against your account's Spruce API reference).
2. **Email step**: any transactional email API (or plain SMTP) the
   self-hoster already has credentials for; keep it bring-your-own like
   every other credential in this project.
3. **Join verification**: poll the same Spruce conversations/contacts
   endpoints `spruce/client.cjs` already uses, checking for the patient's
   contact reaching an "active"/"joined" state.
4. **Voice fallback**: this is the piece that needs an always-on host --
   a small always-running server (not something a coding agent starts
   on demand) bridging Twilio's telephony/media-stream APIs to a realtime
   voice-capable model. Treat it as its own deployable service with its
   own README, separate from the rest of this repo's "clone and run"
   model, and gate it behind the same explicit-consent principles as
   `bot/` (see the root design spec) -- never auto-call anyone without
   clear, logged consent to be contacted this way.
5. **Recall cap**: a simple local JSON counter per patient (same
   no-cloud-DB pattern used throughout this project) that stops retrying
   after a fixed number of attempts.

If you build this, please keep it as an *additional*, clearly optional
module (e.g. `instanthpi/inviter/server.cjs` plus its own setup docs) rather
than a dependency the rest of `instanthpi/` requires -- the goal is that a
physician with no Twilio account and no always-on host can still use
everything else in this folder.
