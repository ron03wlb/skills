---
name: grill-with-docs
description: Sharpen one codebase-backed design in an isolated Spec planning lane while recording accepted glossary and ADR decisions.
disable-model-invocation: true
---

# Grill with Docs

Bind one **Spec workflow lane** before the interview: one Codex task owns one proposed Tracker Spec, one target, one starting baseline, and one isolated planning worktree. Create or reuse only that task's exact lane. A mismatched task, Spec, target, worktree, or baseline is a Recoverable blocker rather than authority to reuse another lane. Name the lane registry as the owning source, report the observed evidence, smallest human action, and preserved stages, then tell the human to retry the same `/grill-with-docs` command.

Two lanes may grill against the same target without a shared planning checkout, global workflow lock, or cross-lane state mutation. Keep source exploration and accepted document edits inside the lane; the target checkout and every other lane remain untouched.

Call the Skill tool twice, once with "grilling" and once with "domain-modeling", passing the same lane identity to each. Work one material decision at a time. `domain-modeling` records each accepted glossary or ADR change in the isolated planning worktree as it settles; unaccepted discussion stays in the conversation.

At the end, create an exact handoff packet containing the lane's task identity, proposed Spec, target, current baseline, worktree, and every accepted glossary or ADR path or hunk with its content identity. Tell the human to run `/to-spec` with that handoff packet. Keep the lane registered through publication. The owning task may dispose of only its exact clean planning worktree after successful `to-spec` handoff read-back; a partial publication, uncommitted accepted decision, identity mismatch, or failed read-back preserves it for the same-command retry.
