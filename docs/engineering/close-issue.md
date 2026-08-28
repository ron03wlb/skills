Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` closes one Issue against the local target branch recorded when its Issue worktree was created. An Executable Issue has exactly three ordered actions: merge its unchanged completed candidate, remove its exact clean worktree, and close the Issue.

The defining constraint is idempotent close progress. Git ancestry, worktree registration, and tracker state say which action comes next, so retries need no custom progress record and target movement never sends a valid candidate back to execution.

## When to reach for it

You invoke this by typing `/close-issue <Issue-ID>` after [execute-issue](https://aihero.dev/skills-execute-issue) records `implementation_complete` — the agent won't reach for it on its own.

Any number of Issue worktrees may execute concurrently. Reach for this once per completed Issue, while keeping one writer at a time for each target branch. Use the same command for a completed Multi-Issue parent after all of its exact children are closed.

## Three observable actions

The merge uses the latest recorded target and exact reviewed candidate. An already reachable candidate makes that action complete; otherwise Git deterministically fast-forwards when possible and creates the ordinary merge only for diverged histories. A dirty target stops before mutation, and a conflict is aborted with the worktree and Issue left open. The human may then retry close, or explicitly rerun execution in the same lane when resolution stays inside the original Acceptance Criteria.

Cleanup removes only the registered clean Issue worktree after candidate reachability is proved. Tracker closure happens last and is read back. A partial run reports the remaining action without repairing product code, rerunning review, pushing, or rolling back a successful merge.

## Parent closure

A Multi-Issue Spec has no candidate to merge. Its parent-only path reads the Decomposition publication record, proves every exact child is closed and every child candidate reaches the same target, then closes only the parent. It does not claim aggregate `push_ready`.

## Where it fits

`close-issue` follows [execute-issue](https://aihero.dev/skills-execute-issue). After the desired Issues are closed, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) performs the one aggregate gate on exact target `HEAD`. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
