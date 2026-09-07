# Reusable GitLab Spec producer adapters

**Goal:** Bind tracker-only `to-spec` publication to reusable GitLab adapters without per-Issue scripts.
**Why planning is required:** Cross-system writes, retry identity, and durable producer evidence can otherwise publish to the wrong Issue or duplicate records.
**Acceptance:** Primary reservation and revision publication verify the configured project, native Issue identity, exact version, canonical body and existing labels; retry observes exact durable results or fails closed. Planning, checkpoint and handoff use existing owner contracts. No live Issue, note, label, Run, lease or Git ref is mutated during implementation. Preserve the consumer's existing setup diff. No commit or push is included.

### Outcome 1: Reusable transport and producer composition
- Work: Add installed coordinator modules for structured `glab api` input, project/remote identity checks, tracker-only planning, current checkpoint profiles, native note receipts and mutation recovery. Keep content and classification decisions with `to-spec`. Accepted glossary/ADR writes require a separately supplied owner implementation; never fabricate its proof.
- Verify: `node --test tests/ron-workflow/gitlab-producer-adapters.test.mjs` using temporary Git repositories and an injected GitLab transport.

### Outcome 2: Binding, diagnostics and truthful routing
- Work: Add an explicit configuration/inspection entry and a documented producer API. Configure the consumer with non-secret static project identity. Correct setup/to-spec routing so read-only setup cannot be mistaken for adapter installation. Distinguish producer support from automatic Run host support.
- Verify: Fixture tests for configuration, input handling and read-only inspection; inspect the real consumer without tracker mutation; skill-contract tests.

Installed-state finding: the current personal coordinator resolves to a retained immutable package rather than the source checkout. Candidate configure/inspect can validate the consumer, but installed availability requires a separately authorized commit and the existing exact-source-commit installer. Preserve the retained package and its links until then; do not substitute a WIP snapshot or mutate package contents.

### Outcome 3: Recovery and regression evidence
- Work: Cover stale versions, foreign projects, duplicate/mutated records, lost responses, restart recovery, source drift, independent Specs and unchanged legacy checkpoints. Review the final diff and avoid expanding the opaque checkpoint store.
- Verify: `node --test tests/ron-workflow/*.test.mjs`; strict UTF-8/no BOM and `git diff --check` in both repositories.

Recovery: Persist a secret-free mutation intent before a write. After uncertainty, re-read the exact owner result; if it remains absent or conflicting, stop without automatic repeat, rollback, lease reclamation or success attribution. Fixture failures block completion. Live publication remains a separate `to-spec` action.
