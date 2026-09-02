---
name: implement
description: Implement an approved Standalone Spec or explicit direct work on the current branch.
disable-model-invocation: true
---

# Implement

Use this only for an approved **Standalone Spec** or explicitly requested direct current-branch work. A **Tracker Spec**, including a local-file tracker record, follows its published `/to-spec` route; do not implement it here.

Treat the selected plan and Acceptance Criteria as scope. Call the Skill tool with "tdd" at pre-agreed seams where behavior can be captured, run focused checks regularly and the full required suite at the end, then call the Skill tool with "code-review" against the fixed baseline. Repair confirmed findings before committing only the intended current-branch changes.

Do not create tracker lifecycle state, a dedicated Issue worktree, integration receipts, push, or deploy.
