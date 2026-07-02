# Start here: physicians

You are setting up the **physician brain** — the tool this whole project
grew out of. Your own AI coding-agent session reads your Spruce inbox,
drafts replies, referral PDFs, and faxes using a multi-AI panel, and
presents each case to you as a review card. **Nothing is ever sent until
you approve it** — the AI drafts, you remain the author of record, exactly
as with a scribe or dictation service.

One physician's real, ongoing experience with this pattern (the author's):
on the order of a 70% reduction in documentation workload. That is one
practice's experience, stated as such — not a promise.

## What you need

- Your own Spruce Health account and API token.
- At least 2 AI provider API keys (Anthropic, DeepSeek, OpenAI, or a local
  model via Ollama).
- Optional: your own SRFax account for outbound faxing.
- Optional: your own signature image, kept outside the repo, if you want
  PDFs pre-signed. Default is a blank signature line — and that default is
  the safe one.

## Step 1 — download your piece (only this one)

Download and unzip:
**[freeeducationhealth-instanthpi-only.zip](https://github.com/carlosfalai/freeeducationhealth/releases/latest/download/freeeducationhealth-instanthpi-only.zip)**

## Step 2 — install an AI coding agent (this tool is DRIVEN by one)

Unlike the other pieces, the physician brain is not a server you leave
running — **the coding agent IS the runtime.** It reads
`instanthpi/RUNBOOK.md` and works your inbox with you. Built and tested
with **Claude Code**; any capable coding agent can follow the same runbook.

Install Claude Code:

- **Windows** (PowerShell): `irm https://claude.ai/install.ps1 | iex`
- **macOS / Linux**: `curl -fsSL https://claude.ai/install.sh | bash`
- Or via Node.js: `npm install -g @anthropic-ai/claude-code`

Then open a terminal **inside the unzipped folder**, run `claude`, sign
in, and type:

> Set this up for me. I am a physician. Read instanthpi/RUNBOOK.md, walk
> me through my .env credentials, generate the sample PDF so I can see the
> output quality, and then run verify-hipaa and explain the results.

## Step 3 — the two commands worth knowing from day one

- **"run verify-hipaa and tell me if my setup is compliant"** — the agent
  runs `node verify-hipaa.cjs` and explains, in plain language, what
  passed, what failed, and the one thing no script can check (accepting
  the AWS Business Associate Addendum is a manual, legal step only you can
  do — see `docs/hipaa-bedrock-guide.md`).
- **"show me what good output looks like"** — the worked-example gallery
  (`docs/examples/` in the docs bundle, or on GitHub) shows a well-filled
  referral, a review card, and a recommendation object, with lessons on
  what to reject.

## Step 4 — or read it yourself first

`instanthpi/RUNBOOK.md` is the complete operating manual, and `SETUP.md`
section **"Setting up instanthpi/ (physicians)"** covers the credentials.
Patient-identifying data never belongs in what goes to the AI panel; the
runbook's hard rules spell this out.

## The safety posture, in one paragraph

Every reviewable action lands as a card; you approve, edit, dismiss, or
choose "none" (you handle it off-tool — the system then sends nothing).
PDFs arrive unsigned unless you configured your own signature. The panel
hard-fails rather than silently falling back to a single model, and shows
you when its models disagreed instead of hiding it.
