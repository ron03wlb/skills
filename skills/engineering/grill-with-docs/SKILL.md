---
name: grill-with-docs
description: Sharpen one codebase-backed design; isolate any accepted glossary or ADR writes in its Spec planning lane.
disable-model-invocation: true
---

# Grill with Docs

Bind one proposed Tracker Spec, target, starting baseline, and owning Codex task before the interview. Read-only exploration and tracker-only settled scope need no worktree. Before the first accepted glossary or ADR write, create or reuse one **Spec workflow lane**: one Codex task owns one proposed Tracker Spec, one target, and one isolated planning worktree. A mismatched task, Spec, target, worktree, or baseline is a Recoverable blocker; name the lane registry, observed evidence, smallest human action, and preserved stages, then retry the same `/grill-with-docs` command.

Two lanes may grill against the same target without a shared planning checkout, global workflow lock, or cross-lane state mutation. Keep accepted document edits inside the lane; the target checkout and every other lane remain untouched.

Load "grilling" and "domain-modeling" as separate named skills: use the generic Skill tool when available; otherwise use the host-supported mechanism to read and follow each required `SKILL.md`. Keep the selected source and invocation restrictions, passing the same settled scope and, when writing accepted decisions, the same lane identity to each. Work one material decision at a time. `domain-modeling` records each accepted glossary or ADR change in the isolated planning worktree as it settles; unaccepted discussion stays in the conversation.

At the end, create an exact handoff packet containing the task identity, proposed Spec, target, current baseline, an explicit empty change list for tracker-only work or the owned worktree and every accepted glossary or ADR path or hunk with its content identity. Tell the human to run `/to-spec` with that handoff packet. Keep the lane registered through publication. The owning task may dispose of only its exact clean planning worktree after successful `to-spec` handoff read-back; a partial publication, uncommitted accepted decision, identity mismatch, or failed read-back preserves it for the same-command retry.
