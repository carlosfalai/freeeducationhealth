# Everyone runs their own — the "Healthcare Blockchain" idea

**In one sentence:** this is a free health helper you run on your own
computer — your family describes symptoms, several different AIs check
each other's answers, and you get plain-language information plus a
one-page summary you can bring to a real doctor.

It is **not** a coin, a token, or a cryptocurrency, and there is nothing
to buy from anyone. The word "blockchain" borrows just one idea from
Bitcoin: instead of one company running one big service for everyone,
**every person keeps their own complete copy of the software.** Like
everyone owning their own copy of a cookbook instead of depending on a
single restaurant — no shared kitchen, no waiting list, and no one who
can close it on you. There is no shared network and no central ledger
here; each person simply owns and runs the whole tool themselves.

## Multiple AIs checking each other — the biggest difference from an ordinary health chatbot

A typical free health chatbot is **one AI answering alone** — and
whatever that one AI gets wrong goes straight to the person asking. This
tool works differently. Every copy runs a **panel** of two or more
*different* AIs (minimum 2, default 3–4 — you choose which, for example
OpenAI's ChatGPT, Google's Gemini, and DeepSeek):

- The same set of symptom answers goes to **each AI separately.**
- They have to **agree** before the tool shows you anything.
- When they **disagree** in a way that matters, the tool **says so** to
  your face — it never hides one AI's confident guess.
- If any single AI flags a warning sign, that warning is **kept**, even
  if the others missed it.
- If too few of them answer properly, the tool **refuses to answer**
  rather than quietly falling back to just one.

This cross-check is the tool's stand-in for a second and third opinion,
and it is built in: no copy of this tool will run with fewer than two
AIs. (The setup assistant helps you connect your own accounts with each
AI service — some are pay-as-you-go, and there is also a free option that
runs an AI entirely on your own computer. More on that below.)

## What "running your own" can look like

You install **only the piece that fits you** — each has its own download
and its own simple instructions ([start here](../start/)):

- **A Telegram chat helper for your family** — anyone in the household
  messages it, answers a short set of symptom questions (the same kind a
  nurse asks at check-in), and gets back plain-language information about
  what the symptoms could mean, checked by the multi-AI panel. This is
  the "InstantHPI" health-intake helper this project provides.
- **Set up by a free AI assistant app** — you do not need to know how to
  code. You install a free assistant (this project is built and tested
  with Claude Code; any capable one works), open the downloaded folder,
  and type *"set this up for me"* — the assistant does the installation
  and asks you only for the things that must be yours.
- **A clinic waiting-room check-in** — patients answer the questions on a
  tablet while they wait, and the doctor gets a ready-made summary before
  the visit.
- **A personal health-history helper** (experimental) — paste your own
  past records and get a plain-language education report and a summary PDF
  to keep.
- **A hospital chart reader** — for institutions on the Epic records
  system: it reads a chart (read-only) and shows the clinician an
  AI-panel-reviewed set of considerations.

Every piece includes everything it needs to run. There is **no account
with this project and no subscription to us** — the only accounts you
create are your own, directly with the AI services you choose (and, for
the family chat helper, a free Telegram bot).

## Why "your own copy" instead of one big service

Because your copy keeps working **no matter what happens anywhere else.**

A centralized health service depends on a company staying in business, a
server staying online, a bill staying paid, and the rules staying
friendly. Your own copy depends only on your computer turning on. Once
you have downloaded it, it is saved locally and it is yours: if the wider
world — a vendor, a network, even this project — has a bad year, your
family still has symptom intake, a multi-AI second opinion, warning-sign
screening, and a portable health summary.

And it spreads the way sturdy things spread: sideways. The software is
free to copy and share, so **any copy can start new ones** — put it on a
relative's laptop and they have their own. No central list of who is
running it exists, and none is needed; copies don't have to know about
each other to work.

## Working with real doctors — alongside them, not instead

Your copy does the **preparation before a visit**: it organizes symptoms
and history the way a careful check-in would, has several independent AIs
cross-check what those symptoms could mean, flags warning signs, and
produces a standardized one-page summary the patient carries themselves
(on a phone, no printer needed).

That preparation makes a local doctor *more* effective, not less needed.
A doctor who receives a prepared patient starts from an organized history
instead of a blank page. A doctor who runs the physician version reviews
and approves every AI-drafted message, referral, and fax — nothing goes
out without them. And because every copy speaks the same format — the
same questions, the same summary — a group of family copies and one
doctor's copy can work together from day one, anywhere, whether or not
any larger system is running around them.

## What this is not

- **Not a doctor, and not emergency care.** Every session for a patient
  opens with that warning, and it cannot be switched off. In an
  emergency, get real help immediately.
- **Not a place your records pile up.** By default no patient identity is
  stored; the summary belongs to the patient, not to the tool.
- **Not automatically private from the AI companies.** Running it on your
  own computer means no company server keeps your family's records. But
  unless you choose the runs-entirely-on-your-computer AI option, the AI
  services you connect to *do* see the text of the questions (names,
  phone numbers, and ID numbers are stripped out automatically first).
  If you want nothing to ever leave your machine, you can run the AIs
  locally with a free program called Ollama. (Note: the **Telegram**
  family helper still passes chat through Telegram itself either way — for
  a setup where nothing leaves your computer at all, use the clinic
  check-in or the personal history helper instead.)
- **Not "HIPAA compliant" just because you self-host.** What compliance
  means depends on your own arrangements with whichever AI service you
  use.

## Start your own

Pick who you are and follow only that page:
[patients and families](../start/patients.md) ·
[physicians](../start/physicians.md) ·
[clinics](../start/clinics.md) ·
[hospitals](../start/hospitals.md) ·
[individuals](../start/individuals.md)

The recommended path on every page is the same: download your one file,
install a free AI assistant app (installers are listed on each page — no
coding needed), open the folder, and say **"set this up for me."** The
assistant walks you through connecting your own AIs, including the choice
between pay-as-you-go services and the free run-it-on-your-own-computer
option.
