## What it does

`confirm-understanding` calibrates your mental model against an explicit Evidence Set using a short multiple-choice assessment, then records whether the two align.

It declares `ALIGNED` only when every Core Proposition in the named scope is demonstrated and no core Evidence Gap remains. A plausible summary or partial score never substitutes for that evidence.

## When to reach for it

You invoke this by typing `/confirm-understanding` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it after a [spec](https://www.aihero.dev/ai-coding-dictionary/spec) discussion, [grill-with-docs](https://aihero.dev/skills-grill-with-docs), [grill-me](https://aihero.dev/skills-grill-me), a lesson, or a meeting when you want to verify that your understanding matches the source rather than merely receive another summary.

## Calibration, not a quiz

An **Evidence Set** is the material chosen as authoritative for one run. The skill derives only the Core Propositions whose misunderstanding would matter, then tests meaning, consequences, boundaries, and application instead of wording or trivia.

The calibration normally takes three to seven questions and never exceeds ten. If ten questions cannot cover the scope reliably, the scope is split; the result never claims alignment beyond what was actually assessed.

## Three honest outcomes

`ALIGNED` means every assessed Core Proposition passed. `NOT_ALIGNED` starts a focused explanation and retest of only the mismatches; stopping during that repair keeps the result `NOT_ALIGNED`. `INCONCLUSIVE` means the Evidence Set is inaccessible, missing, ambiguous, or contradictory, yields no assessable Core Proposition, or the first assessment round was not completed.

Correct answers stay hidden until a round is complete. After repair, a fresh equivalent question — not exposure to the answer — proves that the gap closed.

## It's working if

- The Evidence Set and assessment scope are named before the first question.
- Questions arrive one at a time, with no correctness feedback mid-round.
- Evidence Gaps are separated from user misunderstandings.
- The final Alignment Record states exactly what was and was not confirmed.

## Where it fits

`confirm-understanding` is a reach-for-it-anytime standalone used after learning or discussion. [grilling](https://aihero.dev/skills-grilling) resolves decisions and builds shared understanding; this skill checks whether your resulting mental model matches the chosen evidence. See [ask-matt](https://aihero.dev/skills-ask-matt) for the wider skill map.
