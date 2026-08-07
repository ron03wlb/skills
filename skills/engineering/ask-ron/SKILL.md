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
→ optional /wiki                   initialize or synchronize a Canonical Wiki
→ /grill-with-docs                 sharpen the change and domain language
→ optional /prototype or /handoff  answer a runnable question or cross sessions
→ /to-spec-ron                     publish the Change Spec at the end
→ /to-tickets-ron                  create bounded Leaf Issues and Grants
→ execute-issue                    implement one authorized Issue
→ close-issue Leaf                 close that Issue
→ repeat one Issue at a time
→ close-issue Parent               reconcile and finalize under exact clean-path authority
```

For a small, independently executable change, keep the Change Issue as Standalone and use `execute-issue` followed by `close-issue` under separately named execution and closeout authority.

## Route by current state

- Repository is not configured or `docs/agents/ron-workflow.md` is missing: type `/setup-ron`.
- Ron config is present but the Canonical Wiki baseline is `missing`: use Wiki-optional delivery and type `/grill-with-docs`; type `/wiki` only when you want to initialize one complete baseline.
- Wiki initialization is active or state is unclear: type `/wiki status`; the same `/wiki` command resumes only a verified active bootstrap.
- The baseline is `ready` and you explicitly want to audit or repair bounded Wiki drift: type `/wiki`.
- The desired behavior, terminology, or trade-off is unresolved: type `/grill-with-docs`; use `/grill-me` when there is no repository.
- One live decision is hard to understand: ask for an explanation; `explain-decision` may run as a read-only sidecar, then the same grilling question resumes.
- A runnable experiment is needed: use `/prototype`, optionally bridged with `/handoff`.
- The decisions are settled but no durable Change Spec exists: type `/to-spec-ron`.
- A Change Spec exists but executable slices do not: type `/to-tickets-ron`.
- One Leaf or Standalone Issue has a current execution contract and valid `execute` authority: use `execute-issue`.
- A Leaf's ordered local commits have current review and `implemented_on_lane` evidence: use `close-issue` in Leaf mode.
- Every Leaf is closed and the Lane is ready for aggregate reconciliation: use `close-issue` in Parent mode.
- A hard bug is not yet understood: use `/diagnosing-bugs` before entering the Ron spec route.
- A huge effort cannot yet fit into one coherent Change Spec: use `/wayfinder`, then return to `/to-spec-ron`.

## Gates that never collapse

- Change Spec describes intent; an Authorization Record grants named capabilities.
- Authorization is not readiness.
- `execute-issue` may commit each coherent verified slice, repair confirmed review findings up to the Grant's ten-wave limit, and record `implemented_on_lane`; it does not close an Issue by itself.
- Leaf closeout does not merge to target or update the Wiki.
- Parent or Standalone closeout skips Wiki-specific work for Wiki-optional delivery; otherwise it reuses the same `/wiki` reconciliation primitive. In both cases it reviews the exact integration candidate, advances only the local target branch, verifies, closes, then cleans the worktree.
- A valid bounded clean-path delegation continues without routine approval; in-contract execution findings use the Grant's ten repair waves, while ambiguity, expanded scope, a persistent finding after the limit, a closeout finding, or missing capability returns to the human with trade-offs.
- Reviewed, tests passed, committed, implemented on Lane, integrated locally, target-verified, Issue closed, pushed, remotely merged, deployed, and live-verified are distinct claims.
- Push, remote merge, deployment, branch deletion, destructive cleanup, and live-provider actions need separate authority.

When no route is safe, identify the missing artifact or capability instead of guessing.
