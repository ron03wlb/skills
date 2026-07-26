---
name: ask-ron
description: Route work through the Ron Issue delivery workflow.
disable-model-invocation: true
---

# Ask Ron

This is the read-only router for the Ron workflow. Recommend the next skill and explain the gate; do not mutate files, Issues, branches, worktrees, or authorization state.

Because this skill is user-invoked, it does not invoke other user-invoked skills. Tell the user which command to type.

## Main route

```text
/setup-ron                         once per repository
→ /grill-with-docs                 sharpen the change and domain language
→ optional /prototype or /handoff  answer a runnable question or cross sessions
→ /to-spec-ron                     publish the Change Spec at the end
→ /to-tickets-ron                  create bounded Leaf Issues and Grants
→ execute-issue                    implement one authorized Issue
→ close-issue Leaf                 close that Issue
→ repeat one Issue at a time
→ close-issue Parent               one Closeout Preview, one “同意”, then finalize
```

For a small, independently executable change, keep the Change Issue as Standalone and use `execute-issue` followed by `close-issue` under separately named execution and closeout authority.

## Route by current state

- Repository is not configured or `docs/agents/ron-workflow.md` is missing: type `/setup-ron`.
- The desired behavior, terminology, or trade-off is unresolved: type `/grill-with-docs`; use `/grill-me` when there is no repository.
- One live decision is hard to understand: ask for an explanation; `explain-decision` may run as a read-only sidecar, then the same grilling question resumes.
- A runnable experiment is needed: use `/prototype`, optionally bridged with `/handoff`.
- The decisions are settled but no durable Change Spec exists: type `/to-spec-ron`.
- A Change Spec exists but executable slices do not: type `/to-tickets-ron`.
- One Leaf or Standalone Issue has a current execution contract and valid `execute` authority: use `execute-issue`.
- A Leaf is committed with current review and `implemented_on_lane` evidence: use `close-issue` in Leaf mode.
- Every Leaf is closed and the Lane is ready for aggregate reconciliation: use `close-issue` in Parent mode.
- A hard bug is not yet understood: use `/diagnosing-bugs` before entering the Ron spec route.
- A huge effort cannot yet fit into one coherent Change Spec: use `/wayfinder`, then return to `/to-spec-ron`.

## Gates that never collapse

- Change Spec describes intent; an Authorization Record grants named capabilities.
- Authorization is not readiness.
- `execute-issue` commits and records `implemented_on_lane`; it does not close an Issue by itself.
- Leaf closeout does not merge to target or update the Wiki.
- Parent or Standalone closeout reconciles the Wiki, reviews the exact integration candidate, advances only the local target branch, verifies, closes, then cleans the worktree.
- Reviewed, tests passed, committed, implemented on Lane, integrated locally, target-verified, Issue closed, pushed, remotely merged, deployed, and live-verified are distinct claims.
- Push, remote merge, deployment, branch deletion, destructive cleanup, and live-provider actions need separate authority.

When no route is safe, identify the missing artifact or capability instead of guessing.
