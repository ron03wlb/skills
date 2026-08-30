---
status: superseded by ADR-0039
---

# Discover prerequisites after Spec publication

The repository resolver makes the authoritative prerequisite decision after the exact Tracker Spec or child Issue is fully published and before worktree creation or product implementation. A proactive `pre-execute-issue` or direct `execute-issue` Entry calls the same read-only `discover` once with the complete Acceptance Criteria, Implementation Plan, repository rules, and current evidence; planning may flag likely migrations but does not embed a second SQL verdict, and implementation is too late for the primary decision.
