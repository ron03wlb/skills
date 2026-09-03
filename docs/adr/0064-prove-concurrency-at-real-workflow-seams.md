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
- a close wait timeout preserves progress without consuming an Issue retry or execution slot.

Lease tests use the real filesystem store rather than mocked task state. Contract tests separately enforce the 700-word Router and 1,500-word Operational entry budgets, required progressive-disclosure pointers, and one authoritative owner for each receipt schema and validation rule. Tests stay focused on observable seams and do not duplicate the workflow implementation.
