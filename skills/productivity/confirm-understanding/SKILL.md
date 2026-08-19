---
name: confirm-understanding
description: Confirm that your understanding matches chosen evidence through a bounded multiple-choice calibration.
disable-model-invocation: true
argument-hint: "[spec, lesson, meeting record, or conversation]"
---

# Confirm Understanding

Run a bounded **calibration** of the user's understanding against an explicit Evidence Set. This is evidence checking, not a general quiz or a new summary of the material.

## 1. Set the evidence boundary

Ask the user to identify the exact Evidence Set when it is not already explicit. It may contain a spec, lesson, meeting record, transcript, or a named part of the current conversation.

Read the Evidence Set, then state:

- the sources being treated as authoritative for this run;
- the exact scope being calibrated;
- any inaccessible, ambiguous, missing, or contradictory material as an **Evidence Gap**.

Derive the material **Core Propositions**: decisions, causal relationships, boundaries, and practical implications whose misunderstanding would matter. Each assessed Core Proposition must have one unambiguous answer grounded in the Evidence Set. A Core Proposition blocked by an Evidence Gap is not a question and cannot count against the user.

Determine whether at least one Core Proposition is assessable. If none can be derived, record that absence as a core Evidence Gap and skip the question steps.

Use the fewest Core Propositions that cover the named scope. A result applies only to the stated scope.

This step is complete only when the Evidence Set and bounded scope are explicit and either (a) at least one assessed Core Proposition exists and every assessed Core Proposition is answerable from that evidence, or (b) no Core Proposition is assessable and that absence is recorded as a core Evidence Gap.

## 2. Build one calibration round

Create the fewest questions that reliably cover every assessed Core Proposition, normally 3–7, with a hard cap of 10 questions. If that budget cannot provide reliable coverage, ask the user to narrow or split the scope. Each question:

- tests one Core Proposition through meaning, consequences, boundaries, or a concrete scenario;
- offers plausible multiple-choice answers plus an explicit `Not sure` choice;
- has one answer supported by a precise Evidence Set pointer;
- avoids verbatim recall, trivia, compound propositions, and answer cues from wording or formatting.

Every initial or repair calibration round follows one **Round Protocol**: ask questions one at a time, record each answer, and keep the answer key and correctness feedback private until every question in that round has an answer.

This step is complete when every assessed Core Proposition maps to exactly one question and one evidence-backed answer.

## 3. Run the round without coaching

Run the first round using the Round Protocol. If the user stops before completing it, mark that round incomplete and proceed to classification.

After the first round completes, evaluate the recorded answers.

## 4. Classify and repair

Classify in this order and use exactly one current status:

- `INCONCLUSIVE` if a core Evidence Gap exists or the first round is incomplete.
- `NOT_ALIGNED` otherwise, if at least one answer is incorrect or `Not sure`, with sufficient evidence to show the mismatch.
- `ALIGNED` otherwise: every assessed Core Proposition has a correct answer and no core Evidence Gap remains.

For `NOT_ALIGNED`, cite the relevant Evidence Set pointer, explain the mismatch, and start a new calibration round containing only the failed Core Propositions. Use different scenarios or wording rather than repeating the disclosed answer. A failed proposition becomes confirmed only after the user answers its fresh question correctly; seeing the answer never counts as alignment.

Continue repair rounds until the result is `ALIGNED`, an Evidence Gap makes it `INCONCLUSIVE`, or the user stops. If the user stops during a repair round, end with the current `NOT_ALIGNED` status.

## 5. Return the Alignment Record

Return a concise record in the conversation:

```markdown
## Alignment Record

- Evidence Set: <sources>
- Scope: <what was and was not calibrated>
- Status: ALIGNED | NOT_ALIGNED | INCONCLUSIVE
- Confirmed Core Propositions: <concise list>
- Resolved mismatches: <none or concise list>
- Remaining mismatches: <none or concise list with evidence pointers>
- Evidence Gaps: <none or concise list>
```

The Alignment Record is read-only. Writing a file or changing a spec, lesson, or meeting record is a separate action requiring explicit user authorization.
