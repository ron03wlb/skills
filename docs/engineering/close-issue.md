Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` integrates one unchanged reviewed candidate into the current local target, proves inclusion and dirty-target preservation, removes the exact Issue worktree, and closes the Issue.

It does not refresh or re-review the candidate. A candidate that already contains the target is reused; a candidate already contained by a newer target gets a history-only two-parent merge commit with the target's exact tree. If their histories diverge, an isolated no-fast-forward merge commit composes them. Identity ambiguity or conflict stops before the real target or tracker state changes.

## When to reach for it

You invoke this by typing `/close-issue <Issue-ID>` after [execute-issue](https://aihero.dev/skills-execute-issue) records `implementation_complete` — the agent won't reach for it on its own.

Independent Issues may close in any order. Only writes to one target branch are serialized; the Issue does not need to know whether siblings ran concurrently.

## Exact-candidate integration

The target advances once by fast-forward to an integration candidate that contains both the prior target and exact reviewed candidate. A read-back receipt proves candidate ancestry before cleanup and closure, so a successfully closed Issue cannot be omitted from its named local target.

The target may keep unrelated staged, unstaged, and untracked work. Closeout fingerprints it, rejects same-path and path-prefix collisions, and preserves hook evidence. Failed or unproved preservation stops cleanup and closure; recovery needs a new successful execution or an integration-repair Issue.

The receipt binds the latest successful execution-state identity. A newer blocked execution supersedes it, and closeout rechecks that identity plus every blocker before integration, cleanup, and tracker closure.

Closeout never edits product code, reruns expensive verification, pushes, deploys, automatically reopens an Issue, or rolls back a successful local integration.

## One deep preservation seam

Dirty-target inspection is a private read-only module inside `close-issue`, not another workflow step. The skill passes resolved local Git identities to the same atomic inspection before and after integration; the module owns NUL-safe status parsing, fingerprints, rename and path-prefix collision handling, filesystem case semantics, and post-merge hook evidence.

The seam is deliberately narrow and fail-closed: it returns only non-sensitive preservation evidence to `close-issue`, while raw paths and tracker authority stay on their owning side. An unstable or incomplete inspection cannot authorize integration. The helper never reads Issues, writes receipts, integrates code, removes worktrees, or closes the Issue.

## Where it fits

`close-issue` follows [execute-issue](https://aihero.dev/skills-execute-issue). After any desired Issues are closed, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) performs the aggregate gate on the exact target. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
