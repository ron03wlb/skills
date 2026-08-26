Quickstart:

```bash
npx skills add mattpocock/skills --skill=verify-target-before-push
```

```bash
npx skills update verify-target-before-push
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/verify-target-before-push)

## What it does

`verify-target-before-push` proves one exact aggregate local target contains every relevant closed-Issue candidate, passes Standards and multi-Spec review, and passes focused plus full verification.

It emits a current-HEAD `push_ready` receipt but never pushes. Any target movement invalidates that receipt.

## When to reach for it

You invoke this by typing `/verify-target-before-push <target>` — the agent won't reach for it on its own.

Reach for it after independently closing the Issues you want in a target and immediately before a separate push. It does not wait for unrelated Issues to finish.

## Aggregate gate

The leading idea is **aggregate** proof: per-Issue review establishes each exact candidate, while this gate proves their composition. It enumerates closed Issues for the target, validates their integration receipts and reachability, reviews the combined diff against all member Specs, then runs deduplicated focused commands and the repository full suite in a clean isolated worktree.

Failures withhold `push_ready` without rollback or automatic reopening. Correction goes through an explicit integration-repair Issue or an explicitly reopened owner Issue.

## It's working if

- Missing or omitted closed candidates stop the gate.
- The receipt names the exact target SHA and every member candidate/integration commit.
- Moving the target requires a fresh gate.

## Where it fits

This is the pre-push gate after one or more [close-issue](https://aihero.dev/skills-close-issue) runs. It consumes evidence originating in [execute-issue](https://aihero.dev/skills-execute-issue) and performs aggregate [code-review](https://aihero.dev/skills-code-review). Push remains outside the skill; see [ask-matt](https://aihero.dev/skills-ask-matt) for the whole flow.
