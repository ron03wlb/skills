Quickstart:

```bash
npx skills add mattpocock/skills --skill=push-target
```

```bash
npx skills update push-target
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/push-target)

## What it does

`push-target` consumes one current local-ahead `push_ready` receipt, fetches the target's unique configured upstream, performs one ordinary non-force push of the exact verified ref, and requires exact remote read-back before success.

The receipt is the boundary: the skill cannot create readiness, repair stale evidence, choose another destination, or turn push success into deployment evidence.

## When to reach for it

You invoke this by typing `/push-target <target>` — the agent won't reach for it on its own.

Reach for it only after [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) returns a current local-ahead `push_ready` receipt. If the target, upstream, or receipt has drifted, run verification again explicitly instead of asking this skill to reconcile the state.

## Drift stops delivery

The operation freezes the receipt, target, upstream remote, baseline, and destination ref. Its configured fetch and push URLs must resolve to the same single endpoint. It fetches only the exact upstream ref with `--no-tags`, then compares every identity again. A split endpoint, missing or ambiguous upstream, stale or malformed receipt, moved ref, empty range, rejection, transport error, or remote mismatch stops without pull, merge, rebase, force push, or retry.

The push uses the frozen endpoint, `--no-follow-tags`, and one explicit refspec. Only the exact configured branch ref may change remotely. Local files, commits, branches, worktrees, tracker state, Git notes, tags, and every other remote ref remain untouched.

## It's working if

- One current local-ahead receipt names the exact target `HEAD`.
- Fetch and push resolve to the same frozen endpoint, with tags excluded.
- The fetched upstream tip still equals the receipt baseline.
- One ordinary push is followed by exact remote-ref equality.
- Any drift or ambiguity stops without repair or a second push.

## Where it fits

This is the final remote-delivery step after [execute-issue](https://aihero.dev/skills-execute-issue), [close-issue](https://aihero.dev/skills-close-issue), and [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push). It proves Git ref delivery only; deployment and production verification remain separate. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full route.
