Quickstart:

```bash
npx skills add mattpocock/skills --skill=verify-target-before-push
```

```bash
npx skills update verify-target-before-push
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/verify-target-before-push)

## What it does

`verify-target-before-push` freezes one exact target range and runs the aggregate Standards, multi-Spec, focused, and full-suite gate without pushing.

It has two evidence modes. Local-ahead starts at the target's unique upstream tip; already-pushed work requires an explicit merge request, pull request, or exact range. Neither mode guesses a comparison.

## When to reach for it

You invoke this by typing `/verify-target-before-push <target-or-explicit-range>` — the agent won't reach for it on its own.

Reach for it after Issue closeout when you need aggregate evidence for a local push or an explicit range that has already been pushed. It does not replace [close-issue](https://aihero.dev/skills-close-issue) and never changes Issue state.

## Completion-note coverage

The leading idea is **aggregate coverage**. Completion notes plus Git reachability derive the member set; every material range commit must be covered by a member contribution, its Planning Seal or prerequisite, or necessary merge topology before aggregate review begins.

Overlapping Issue contributions are valid. Reachable open Issues, closed unreachable candidates, invalidated completion evidence, or unexplained commits stop the gate without repair.

**Successor verification evidence** handles one narrow retirement case. A later member may retire an earlier path-specific command only when its candidate descends from the earlier candidate, its Acceptance Criteria own every required path, its completion proves those paths absent and names passing current-behavior commands, those commands run at the final target, and the paths remain absent there. Partial ownership, inferred deletion or rename, missing proof, ambiguous ancestry, or a non-path-specific command makes the gate fail closed.

## Honest results

A `push_ready` result belongs only to local-ahead mode and exact current target `HEAD`. A **Range verification result** belongs only to the explicit already-pushed comparison and never grants retroactive push readiness.

Both results bind exact baseline, target, members, coverage, review, executed verification, and every accepted successor disposition. The disposition preserves the old completion note and records the superseded command, retired paths, successor Issue and candidate, Acceptance Criteria, absence proof, and current-behavior results. Target movement invalidates local readiness but never sends an Issue back to execution.

## It's working if

- A local-ahead run rejects a missing, ambiguous, or empty upstream range.
- An already-pushed run requires an explicit immutable comparison and writes no `push_ready` note.
- Completion-note membership and every material commit are proved before one aggregate gate runs.

## Where it fits

This is the pre-push or explicit-range aggregate gate after [execute-issue](https://aihero.dev/skills-execute-issue) and [close-issue](https://aihero.dev/skills-close-issue). It uses [code-review](https://aihero.dev/skills-code-review) but never repairs findings. Push remains a separate human action; see [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
