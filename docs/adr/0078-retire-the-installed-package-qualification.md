---
status: accepted
---

# Retire the installed-package qualification and carry its measurement ontology forward

Issue 91's installed-package qualification — WSL-bound immutable package binding, the package-owned component fixture, and the three retained qualification samples — is retired together with its substrate, because the package, checkpoint, control-file, and installed-entry surfaces it qualifies do not survive the move to `pi-workflow`. Issue 91 closes with those criteria marked superseded rather than implemented, and no further evidence is produced on the retired host boundary.

Its substrate-independent requirements are carried into the delivery-substrate Spec as acceptance evidence: the recovery and delivery matrix; the truthful-measurement ontology that keeps detection, classification, diagnosis, repair, verification, installation, continuation, completion publication, terminal observation, evidence validation, close eligibility, request intent, native acceptance, lease acquisition, and close completion separately reported; the rule that an objective the fixture cannot exercise is reported `unavailable` and never inferred from a fixture, blocker, dispatch, or heartbeat; and the bounded reproducible-evidence requirements covering exact commands, identities, byte counts, and unavailable metrics.

This supersedes [ADR-0075](0075-reimplement-issue-91-for-wsl.md) entirely.

Basis: human decision A in the `grill-with-docs` session of 2026-09-15 (Pi session `01a0a417-5fc9-7443-9212-f2084dbbe124`). Completing Issue 91 first was rejected because its remaining evidence would be produced on the substrate being retired, and closing it as wholly superseded was rejected because it would drop the measurement ontology as a stated acceptance requirement.

Reversal or validation: confirm that no carried requirement depends on the retired package-binding or checkpoint/control-file surface, and that each carried requirement has a named substrate-independent owner before the Spec is published.
