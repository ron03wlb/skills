Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` closes one Issue against the local target branch recorded when its Issue worktree was created. A direct human request or one valid read-back DAG Run Grant may authorize entry without separate per-Issue approval; the skill never creates the Grant or widens what closeout may do.

The defining constraint is idempotent close progress. An Executable Issue has exactly three ordered actions: merge its unchanged completed candidate, remove its exact clean worktree, and close the Issue. Coordinator membership is exact: a Single-Issue target is the bound Spec, a Multi-Issue child is an exact mapping member, and a parent-only target is the bound Spec itself. Git ancestry, worktree registration, and tracker state say which action comes next, so retries need no custom progress record and target movement never sends a valid candidate back to execution.

## When to reach for it

Type `/close-issue <Issue-ID>` after [execute-issue](https://aihero.dev/skills-execute-issue) records `implementation_complete`, or an authorized coordinator reaches for it when its valid DAG Run Grant binds that exact Issue or completed parent. Without either authority, the agent stops before mutation.

Any number of Issue worktrees may execute concurrently. Reach for this once per completed Issue, while keeping one writer at a time for each target branch whether the writer is a human or authorized coordinator. Use the same command for a completed Multi-Issue parent after all of its exact children are closed.

## Three observable actions

The merge uses the latest recorded target and exact reviewed candidate. An already reachable candidate makes that action complete; otherwise Git deterministically fast-forwards when possible and creates the ordinary merge only for diverged histories. A dirty target stops before mutation; after preserving that work, the human makes the target clean and retries `/close-issue <Issue-ID>`. This does not rerun execution or the full suite. A conflict is aborted with the worktree and Issue left open; only then may the human explicitly rerun execution in the same lane when resolution stays inside the original Acceptance Criteria.

Cleanup removes only the registered clean Issue worktree after candidate reachability is proved. Tracker closure happens last and is read back. A partial run reports the remaining action without repairing product code, rerunning review, pushing, or rolling back a successful merge.

For new completion notes, closeout validates every `workflowArtifacts` path, requirement source, purpose, contribution ownership, and candidate-bound review result before merging. It classifies notes by candidate Git ancestry against cutover commit `b1fcf9930056b1f1b907e380cd9015bd6162899d`: a candidate containing the cutover must have the field, and only a candidate proved to be an ancestor of the cutover may omit it as legacy completion evidence under its original contract. Divergent or unreadable ancestry stops. The declaration classifies required non-contract documentation but never supplies candidate identity, contribution coverage, verification authority, or a closeout bypass.

## Parent closure

A Multi-Issue Spec has no candidate to merge. Its parent-only path reads the Decomposition publication record, proves every exact child is closed and every child candidate reaches the same target, then closes only the parent. It does not claim aggregate `push_ready`.

## Where it fits

`close-issue` follows [execute-issue](https://aihero.dev/skills-execute-issue). After the desired Issues are closed, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) performs the one aggregate gate on exact target `HEAD`. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
