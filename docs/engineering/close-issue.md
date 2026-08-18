Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` takes one clean `execute-issue` worktree, refreshes it from the original local target, fast-forwards that target to the reviewed candidate, removes the worktree, and closes the Issue. The candidate worktree must be clean, but the target may keep unrelated staged, unstaged, and untracked work; closeout proves that work is unchanged instead of making you clear it first.

## When to reach for it

Type `/close-issue` after [execute-issue](https://aihero.dev/skills-execute-issue) records a clean completion note. The agent won't reach for it on its own; a human invokes this separate closeout phase and starts only one integration into the same target branch at a time. Other Issue worktrees and target branches can continue independently.

## Safe local integration

If target refresh changes the candidate, verification and Standards/Spec review run again. Before fast-forwarding, closeout fingerprints existing target dirt, rejects same-path or path-prefix collisions, and requires read-back preservation evidence. Target drift, dirty-state drift, tracker failure, or ambiguous recovery stops the invocation; closeout never stashes, commits, cleans, re-baselines, or edits product code.

The target advances only by fast-forward to the reviewed candidate. Preservation proof gates worktree cleanup and Issue closure, and retries resume only while their recorded evidence still matches. The topic branch remains, and no rebase, push, remote merge, deploy, unrelated deletion, or automatic command chaining occurs.

## Where it fits

This is the separate integration and cleanup step after [execute-issue](https://aihero.dev/skills-execute-issue). [to-tickets](https://aihero.dev/skills-to-tickets) supplies dependency-ordered work, while [ask-matt](https://aihero.dev/skills-ask-matt) maps the full flow.
