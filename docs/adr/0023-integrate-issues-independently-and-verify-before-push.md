---
status: superseded by ADR-0038
supersedes: ADR-0022 routing and closeout decisions
---

# Integrate Issues independently and verify before push

`to-spec` is the sole delivery-shape authority. A Single-Issue Tracker Spec is itself executable; a Multi-Issue Spec delegates decomposition to `to-tickets`, whose dependency-ready children each carry their own mapped Acceptance Criteria, Implementation Plan, verification, blockers, and Planning baseline. Tracker Specs execute through `execute-issue`; `implement` is reserved for approved Standalone Specs or explicit direct current-branch work.

Each successful `close-issue` integrates its exact reviewed candidate into the current local target before closing the tracker Issue. It consumes only the latest terminal execution state; every blocked `execute-issue` exit records a newer state that supersedes older success. It creates an isolated integration candidate from captured target `T` and reviewed candidate `C`: use `C` directly when it contains `T`; when `T` already contains `C`, create a history-only two-parent merge with `T`'s exact tree and parents `T`, `C`; otherwise create a no-fast-forward merge commit containing both histories. Conflict or identity ambiguity stops without changing the real target or closing the Issue. The real target then advances once by fast-forward to that integration candidate, and a read-back `VERIFIED` receipt binds that execution state while proving candidate ancestry and dirty-target preservation before cleanup and closure. Closeout does not rerun implementation, Standards/Spec review, or expensive verification.

Independent Issues may execute and close in any order; one human still serializes writes to the same target branch. A clean Git merge proves lineage and composition, not aggregate semantics. Before push, `/verify-target-before-push` therefore takes the union of closed-Issue execution histories and closeout receipts for the target, fails when either side is missing or superseded, reviews and verifies the exact aggregate target, proves every relevant candidate is reachable, and writes a local `push_ready` receipt bound to that exact `HEAD`. Target movement invalidates the receipt. Failure withholds `push_ready` without automatic rollback, Issue reopening, product repair, push, or deploy.
