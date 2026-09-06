---
status: accepted
---

# Prove concurrency at real workflow seams

The workflow uses a small focused proof suite instead of a combinatorial concurrency matrix. At minimum it proves:

- two real `close-issue` leaves for different targets in one Git common directory cannot mutate concurrently, and the waiting leaf can acquire after release;
- a coordinator invokes a real lease-acquiring close leaf without pre-acquiring the same lease;
- close leaves for different Git common directories can hold their repository leases concurrently;
- separate Spec Runs execute Issues concurrently under their own `max_parallel` while repository closeout remains serialized;
- duplicate immutable Spec inputs attach to or resume one operation, while different Specs, Issues, or approved revisions do not collide; and
- a healthy close wait continues beyond thirty seconds without consuming an Issue retry or execution slot, and resumes from fresh authority and readiness after the exact owner releases.

Lease tests use the real filesystem store rather than mocked task state. Contract tests separately enforce the 700-word Router and 1,500-word Operational entry budgets, required progressive-disclosure pointers, and one authoritative owner for each receipt schema and validation rule. Tests stay focused on observable seams and do not duplicate the workflow implementation.

These tests prove their component boundaries. Installed delivery additionally needs the actual native host, one task/worktree per Issue, target integration, exact cleanup and tracker read-back. A Multi-Issue Run succeeds only after every required child and its parent satisfy DoD. Keep the small fixed set of multi-Spec/HEAD, healthy-wait/conflict, interruption/lost-response, version/legacy and scope/ownership cases in the [live evidence](../agents/workflow-live-evidence.md), including unfinished attempts. Superseding #49 or #51 is not implementation proof.

Compare only measured costs with matching model, configuration and workload. Keep failed attempts and recovery interventions; identify missing control, product/review and total token coverage rather than inferring savings. The active host heartbeat bounds dispatch: closing the app does not provide background scheduling, and preserved progress is not successful delivery.

The installed validation now includes completed original Multi-Issue and Single-Issue Runs, a compatible retained legacy Run, and an isolated negative scope case. The evidence records driver interruptions and a host approval rejection as well as successful recovery; it does not claim zero intervention or a comparable end-to-end cost reduction. Pending native requests receive active-task heartbeats, and neither process exit nor an unavailable host response authorizes duplicate dispatch.
