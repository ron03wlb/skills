---
status: accepted
supersedes: ADR-0022 routing and closeout decisions
---

# Integrate Issues independently and verify before push

`to-spec` is the sole delivery-shape authority. A Single-Issue Tracker Spec is itself executable; a Multi-Issue Spec delegates decomposition to `to-tickets`, whose dependency-ready children each carry their own mapped Acceptance Criteria, Implementation Plan, verification, blockers, and Planning baseline. Tracker Specs execute through `execute-issue`; `implement` is reserved for approved Standalone Specs or explicit direct current-branch work.

Each successful `close-issue` integrates its exact reviewed candidate into the current local target before closing the tracker Issue. It creates an isolated integration candidate from the captured target: use the reviewed candidate directly when it already contains the target, otherwise create a no-fast-forward merge commit containing both histories. Conflict or ambiguity stops without changing the real target or closing the Issue. The real target then advances once by fast-forward to that integration candidate, and a read-back receipt proves candidate ancestry and dirty-target preservation before cleanup and closure. Closeout does not rerun implementation, Standards/Spec review, or expensive verification.

Independent Issues may execute and close in any order; one human still serializes writes to the same target branch. A clean Git merge proves lineage and composition, not aggregate semantics. Before push, `/verify-target-before-push` therefore reviews and verifies the exact aggregate target, proves every relevant closed-Issue candidate is reachable, and writes a local `push_ready` receipt bound to that exact `HEAD`. Target movement invalidates the receipt. Failure withholds `push_ready` without automatic rollback, Issue reopening, product repair, push, or deploy.
