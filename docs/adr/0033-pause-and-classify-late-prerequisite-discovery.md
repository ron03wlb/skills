---
status: accepted
---

# Pause and classify late prerequisite discovery

When implementation evidence contradicts an Entry `NOT_REQUIRED` result, `execute-issue` preserves coherent checkpoints and stops before any verification that depends on the missing prerequisite. If the prerequisite remains a Necessary discovery under unchanged Acceptance Criteria and approved schema outcome, the human invokes `pre-execute-issue` in the same worktree and later resumes execution after `READY`; if schema outcome, acceptance, target, exclusions, or ownership changes, the flow returns to `/to-spec` or `/to-tickets`. It never auto-invokes, rolls back, or silently expands scope.
