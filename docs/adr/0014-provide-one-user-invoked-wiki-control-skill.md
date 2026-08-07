---
status: superseded by ADR-0021
---

# Provide one user-invoked Wiki control skill

Ron adds one user-invoked `/wiki` skill with a state-aware default:

- `missing` initializes one complete baseline;
- `bootstrapping` resumes the verified active bootstrap;
- `ready` audits drift and synchronizes only affected topics;
- explicit `/wiki status` inspects configuration, baseline state, and validation capabilities without mutation.

The user does not choose `bootstrap`, `audit`, target identity, root, engine, or protocol flags. `/wiki` resolves them from approved configuration and verified state, then fails closed instead of guessing.

The bounded result contract is:

- `ready`
- `missing`
- `bootstrapping`
- `clean`
- `not-bounded`
- `not-configured`
- `not-verifiable`
- `findings`

Clean results use exception-only interaction and show only the result. Non-clean results identify the problem, evidence, available trade-offs, and recommended next action. Exact technical identities remain in durable evidence unless needed for diagnosis.

Direct human invocation of `/wiki` may authorize exactly one bounded clean initialization or sync, selected from verified baseline state. Initialisation may publish one Bootstrap Change Spec through the same shared primitive used by `to-spec-ron`. Ready-state sync reuses the active change-owning Issue; when none exists, it may publish exactly one Wiki-repair Standalone Change Spec after a clean preview.

Both direct `/wiki` sync and normal Parent or Standalone closeout invoke the same reconciliation primitive. It compares the prior Wiki, current Change Spec, code, tests, and ledger, then modifies only the exact affected pages. Any missing Change Spec for a behavioral change, finding, deviation, ambiguity, or scope change stops for human decision.

`/wiki`, `to-spec-ron`, and `close-issue` use one dependency-free shared mechanical core for config extraction, payload hashing, previews, source resolution, ledger validation, clean-path derivation, and Change Spec bytes. The core performs no tracker, Git-history, Wiki, network, or publication mutation; the skills retain those bounded workflow responsibilities.

When no active Issue owns bounded drift, `/wiki` persists a mode-`0600` `workflow-wiki-sync-preview:v1` under repository-local Git metadata. It may feed exactly one Wiki-repair Standalone Change Spec and is deleted only after that Spec is published and read back successfully.

The skill does not modify Canonical Wiki content outside the Issue, Grant, review, and closeout flow. It does not replace `setup-ron` or `close-issue`, define a second Change Spec format, select or install an engine, publish derived outputs, or become another content authority.
