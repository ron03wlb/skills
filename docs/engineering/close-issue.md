Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` takes one clean `execute-issue` worktree, refreshes it from the original local target, fast-forwards that target to the reviewed candidate, removes the worktree, and closes the Issue. It does not repair product code.

## When to reach for it

Type `/close-issue` after [execute-issue](https://aihero.dev/skills-execute-issue) records a clean completion note. The agent won't reach for it on its own; a human invokes this separate closeout phase and starts only one target integration at a time.

## Safe local integration

If target refresh changes the candidate, verification and Standards/Spec review run again and the clean completion note is refreshed before integration. A confirmed finding leaves the Issue open for a separate execution; closeout never edits product code.

The target advances only by fast-forward to the reviewed candidate. Cleanup removes the exact clean registered worktree but keeps the topic branch. A retry recognizes an already integrated candidate, an already removed worktree, or an already closed Issue whose completion identities all match; it verifies completed steps instead of repeating them. No rebase, push, remote merge, deploy, unrelated deletion, or automatic command chaining occurs.

## Where it fits

This is the separate integration and cleanup step after [execute-issue](https://aihero.dev/skills-execute-issue). [to-tickets](https://aihero.dev/skills-to-tickets) supplies dependency-ordered work, while [ask-matt](https://aihero.dev/skills-ask-matt) maps the full flow.
