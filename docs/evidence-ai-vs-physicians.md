# What does the evidence actually say about AI vs. physicians?

This project exists because, in many parts of the world, the realistic
choice isn't "AI guidance vs. a doctor's appointment" — it's "AI guidance
vs. nothing." That context matters for reading the evidence below. None of
it means an AI panel is a doctor. It means AI reasoning has gotten good
enough, on certain measurable tasks, that offering it for free where no
physician is reachable is worth doing carefully rather than not at all.

## Passing medical licensing exams

The first widely cited result was simple: could a general-purpose AI model
pass the exam a human must pass to become a licensed physician? In 2023,
researchers tested ChatGPT against USMLE-style questions (the U.S. Medical
Licensing Examination) and found it performed at or near the ~60% passing
threshold — notable because the model received no medical-specific
training for the test (Kung et al., "Performance of ChatGPT on USMLE,"
*PLOS Digital Health*, 2023). Google's Med-PaLM 2 went further: physician
reviewers rated its long-form answers to medical questions as preferable
to physician-written answers on several quality dimensions, in what the
authors describe as the first model to reach "expert level" on USMLE-style
question sets (Singhal et al., "Toward expert-level medical question
answering with large language models," *Nature Medicine*, 2025). These are
exam-style benchmarks — a different task from talking to a real patient.

## Diagnosing real published case records

A more clinically realistic test is whether a model can work through an
actual diagnostic case the way a physician does: gathering findings one
step at a time and revising a differential diagnosis as new information
arrives, rather than being handed the whole case at once. Microsoft
Research's "Sequential Diagnosis with Language Models" (Nori, Horvitz, et
al., arXiv preprint, June 2025) built a benchmark of 304 diagnostically
difficult cases drawn from the *New England Journal of Medicine*'s
published clinicopathological conference case records, and had an AI
system (MAI-DxO, orchestrating multiple underlying models) work through
each one step-by-step, ordering tests and questions much like a physician
would, under a cost budget. Their best configuration reached correct
diagnoses on up to 85.5% of cases, versus roughly 20% for a comparison
group of practicing physicians working the same cases under matched
conditions, while using fewer resources per case. **This is an important,
but not yet independently peer-reviewed, preprint** — the authors state it
was submitted for external review — and it measures performance on
retrospective, published, deliberately hard teaching cases, not real-time,
unsupervised interaction with an actual patient.

## Does AI help, or does it need to work alongside a physician?

A separate, peer-reviewed randomized trial asked a more practical
question: does giving a physician access to an AI tool actually improve
their own diagnostic accuracy? Goh et al. ("Large Language Model Influence
on Diagnostic Reasoning: A Randomized Clinical Trial," *JAMA Network
Open*, 2024) randomized 50 physicians (26 attendings, 24 residents) to
diagnose clinical vignettes with their usual resources, with or without an
LLM added. The result was sobering for a simple "AI-assists-doctor" story:
physicians using the LLM scored a median 76% versus 74% without it — not
a statistically significant difference. In the same study, the LLM
working alone scored a median 92%, outperforming both physician groups.
The authors' own interpretation is not "AI beats doctors" so much as
"handing a physician a chat tool, with no training in how to use it well,
doesn't automatically improve their reasoning" — a caution about tool
design, not just raw model capability. The study used written vignettes,
not live patients, missing real interviewing and data-gathering skill.

## What this justifies, and what it doesn't

Taken together, these findings support one specific, narrow claim: current
AI models, on retrospective written case material, reason through
diagnostic problems at a level that is at minimum competitive with, and on
some hard-case benchmarks exceeds, practicing physicians. They do **not**
show that an AI is safe to run unsupervised on a live, undifferentiated
patient with no clinician anywhere in the loop — none of these studies
tested that. That is exactly why this project uses a multi-model panel
that must reach consensus and flags disagreement rather than trusting one
model's confident answer, why it frames its output as preparation for a
future visit rather than a diagnosis, and why it states plainly, every
time, that it is not a physician. Where no physician is reachable at all,
structured, panel-checked AI reasoning is a meaningfully better starting
point than an unstructured web search or nothing — that is the bar this
evidence supports, and the only bar this project claims to clear.

## References

- Kung TH, Cheatham M, Medenilla A, et al. "Performance of ChatGPT on
  USMLE: Potential for AI-assisted medical education using large language
  models." *PLOS Digital Health*, 2023;2(2):e0000198.
- Singhal K, Tu T, Gottweis J, et al. "Toward expert-level medical
  question answering with large language models." *Nature Medicine*,
  2025;31:943–950 (originally released as a preprint, "Towards
  Expert-Level Medical Question Answering with Large Language Models,"
  arXiv:2305.09617, 2023).
- Nori H, Daswani M, Kelly C, et al. "Sequential Diagnosis with Language
  Models." Microsoft Research / arXiv:2506.22405, June 2025.
  Preprint, not yet published in a peer-reviewed journal.
- Goh E, Gallo R, Hom J, et al. "Large Language Model Influence on
  Diagnostic Reasoning: A Randomized Clinical Trial." *JAMA Network Open*,
  2024;7(10):e2440969.
