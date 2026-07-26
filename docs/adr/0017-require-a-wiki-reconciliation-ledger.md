---
status: accepted
---

# Require a Wiki reconciliation ledger

Every semantic Parent or Standalone closeout creates a Wiki reconciliation ledger before Canonical Wiki content changes. Each row records the affected topic or material claim, prior Wiki state, current Change Spec disposition (`inherit`, `add`, `change`, or `remove`), supporting code and test locators, conformance result (`aligned`, `deviation`, or `unverified`), and proposed Wiki action (`none`, `add`, `update`, or `remove`).

The Closeout Preview includes the ledger and the Parent Closeout Grant binds its hash. Only an entirely `aligned` ledger may authorize semantic Wiki mutation. A `deviation` or `unverified` result ends the clean path and reports the problem and trade-offs. After human decision, the resolution may be code repair, an explicitly superseding Change Spec, or additional evidence. Any resolution invalidates the ledger and requires a fresh preview and Grant.

After the Wiki patch, the final reviewer checks the previous Wiki, current Change Spec, code and tests, ledger, and candidate Wiki against the same integration candidate SHA. Closeout evidence binds the verified ledger hash.

This prevents the Wiki from silently following accidental code behavior while still ensuring that approved, implemented requirements become the new current-business baseline.
