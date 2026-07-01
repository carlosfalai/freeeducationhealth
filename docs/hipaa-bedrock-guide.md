# Running instanthpi/ HIPAA-compliant on AWS Bedrock

This applies to `instanthpi/` (the physician brain, which handles real,
identifiable patient data) — not `bot/`, which never persists patient
identity and doesn't need a BAA in the first place.

## Why Bedrock, and why not mix providers for this tier

`core/providers/` supports multiple AI backends by design, and that's the
right choice for `bot/` (patient-facing, no PHI at rest, cost matters more
than compliance paperwork). For `instanthpi/`, where real patient data is
involved, the recommendation is different: **pick one BAA-covered path —
AWS Bedrock — and stay on it consistently**, rather than switching between
Bedrock and a non-BAA provider (direct Anthropic API, DeepSeek, etc.)
depending on convenience or cost. Every switch is a chance for real PHI to
end up routed to a provider with no BAA in place. One compliant path,
used consistently, is simpler to reason about and safer than a system that
can jump back and forth.

## Getting the BAA in place (verified against AWS's own docs, 2026)

Amazon Bedrock has been HIPAA-eligible since 2024. To use it compliantly:

1. Sign in to the AWS Console → **AWS Artifact** → **Agreements** → **AWS
   Business Associate Addendum**.
2. Accept it. This is self-service and free, and takes about ten minutes.
3. This is account-scoped — if you later have multiple AWS accounts (e.g.
   an AWS Organization), the management account can accept an
   organization-wide BAA in AWS Artifact so every current and future
   member account is automatically covered, instead of repeating this
   per account.
4. PHI sent to Bedrock for inference is covered under the BAA once
   accepted — but only if you also implement the required controls under
   AWS's shared-responsibility model (encryption in transit/at rest,
   access controls, logging) and only send PHI to services on AWS's
   HIPAA-eligible services list (Bedrock is on it; not every AWS service
   is).

Sources: [AWS Artifact BAA activation](https://repost.aws/knowledge-center/activate-artifact-baa-agreement), [AWS HIPAA compliance overview](https://aws.amazon.com/compliance/hipaa-compliance/), [AWS Artifact FAQ](https://aws.amazon.com/artifact/faq/).

## Sonnet 5 on Bedrock: verified current pricing

Direct from AWS's own pricing page as of this writing:

- **Promotional pricing (through August 31, 2026):** $2 per million input
  tokens, $10 per million output tokens.
- **Standard pricing (from September 1, 2026):** $3 per million input
  tokens, $15 per million output tokens.

Source: [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/).

## What that costs per consultation (estimate, not a guarantee)

A full `instanthpi/` consultation — structured intake, multi-AI panel
reasoning, and note/PDF generation — runs roughly 3,000 input tokens and
4,000 output tokens through the model, depending on complexity. At current
promotional pricing:

- (3,000 / 1,000,000) x $2 = $0.006
- (4,000 / 1,000,000) x $10 = $0.04
- **≈ $0.046 per consultation**

For a physician doing 500-750 consultations a month, that's roughly
**$23-$35/month** on Bedrock at current promotional pricing (rising to
roughly $35-$52/month once standard pricing takes effect after August 31,
2026). This is an estimate based on typical token usage, not a guaranteed
figure — actual cost scales with how long each consultation runs.

## Running Claude Code itself in Bedrock/BAA mode for the patient-data parts

Since `instanthpi/`'s intended operating model is a physician running Claude
Code directly against this repo (see `instanthpi/RUNBOOK.md`), the same
"one compliant path, used consistently" rule applies to Claude Code itself,
not just to `core/providers/`. Claude Code has built-in support for running
through Bedrock instead of the default Anthropic API (verified against
Anthropic's own docs):

```
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
```

Claude Code then authenticates via the standard AWS SDK credential chain
(the same AWS credentials used for the BAA'd account above), and does not
read region from `~/.aws/config` for this purpose — `AWS_REGION` must be
set explicitly. Restart Claude Code after setting these; an already-running
session won't pick up the change.

The practical recommendation: keep two clearly separate profiles rather
than one session that sometimes has these variables set and sometimes
doesn't — a default profile for everything that isn't real patient data,
and a distinct "claude-phi"-style profile (these env vars set) reserved for
the parts of `instanthpi/` that actually touch real patient information.
Never rely on remembering to toggle it mid-session.

Source: [Claude Code on Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock).

## What this repo does NOT automate

Creating an AWS account, accepting the BAA, and generating API
credentials all require the physician's own AWS account and their own
legal acceptance of the BAA — that's a real agreement between AWS and
the physician's own practice/entity, not something a script should accept
on someone's behalf without them actually seeing and agreeing to it. A
setup helper can walk a physician through navigating to the right AWS
Console screens while they're logged into their own account, but the
actual review-and-accept step stays a deliberate action the physician
takes themselves, not something automated around them.
