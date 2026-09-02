## What it does

`push-target` consumes one current local-ahead `push_ready` receipt, fetches the target's unique configured upstream, performs one ordinary non-force push of the exact verified ref, and requires exact remote read-back before success.

The receipt is the boundary: the skill cannot create readiness, repair stale evidence, choose another destination, or turn push success into deployment evidence.

## When to reach for it

You invoke this by typing `/push-target <target>` — the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

Reach for it only after [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) returns a current local-ahead `push_ready` receipt. If the target, upstream, or receipt has drifted, run verification again explicitly instead of asking this skill to reconcile the state.

## Prerequisites

- An explicitly named local target whose `HEAD` matches a current local-ahead `push_ready` receipt.
- One unique configured upstream whose fetch and push URLs resolve to the same endpoint.

## Drift stops delivery

The operation freezes the receipt, target, upstream, baseline, destination ref, and endpoint as one identity set. Any ambiguity or drift stops delivery instead of repairing state or choosing a substitute destination.

Only the verified branch ref may change remotely. Local files, commits, branches, worktrees, tracker state, Git notes, tags, and every other remote ref remain untouched.

## It's working if

- One current local-ahead receipt names the exact target `HEAD`.
- Fetch and push resolve to the same frozen endpoint, with tags excluded.
- The fetched upstream tip still equals the receipt baseline.
- One ordinary push is followed by exact remote-ref equality.
- Any drift or ambiguity stops without repair or a second push.

## Where it fits

This is the final remote-delivery step after [execute-issue](https://aihero.dev/skills-execute-issue), [close-issue](https://aihero.dev/skills-close-issue), and [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push). It proves Git ref delivery only; deployment and production verification remain separate. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full route.
