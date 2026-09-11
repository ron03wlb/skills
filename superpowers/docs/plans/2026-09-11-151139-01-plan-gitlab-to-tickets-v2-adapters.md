# Concrete GitLab to-tickets v2 adapters

**Goal:** Add one installable coordinator release that supplies concrete GitLab `to-spec@v2` and `to-tickets@v2` producer adapters.
**Why planning is required:** The change adds a tracker-writing public workflow contract with durable retry identity, partial-publication recovery, and cross-system read-back requirements.
**Acceptance:** The candidate remains isolated from the original checkout; GitLab configuration and inspection are read-only until an explicitly invoked producer action; body and native blocker representations fail closed according to ADR 0065; GitLab parent evidence follows accepted ADR 0073 without `relates_to`; every mutation is followed by exact provider read-back and uses the existing durable mutation/checkpoint owners; the package exposes both concrete adapter entries with synchronized English routing and diagnostics; focused tests, contract tests, UTF-8 checks, diff review, and independent Standards/Spec review are clean. No live tracker mutation, commit, push, installation, or branch integration occurs in this authorization.

### Outcome 1: Concrete decomposition adapter and entry
- Work: Add a GitLab `to-tickets@v2` adapter over the existing transport, mutation journal, checkpoint store, and operation identity. Bind the configured repository, exact parent/upstream authority, Planning Seal, canonical child mapping and blocker graph; provide deterministic discovery, child publication, canonical parent fallback read-back, body/native blocker handling, decomposition record, ready-state, and composite handoff read-backs. Do not substitute `relates_to` for unavailable native Issue hierarchy. Add a CLI entry whose `inspect` is read-only and whose mutations require explicit structured `invoke` actions.
- Risks/open questions: GitLab notes are editable and writes are not atomic, so exact IDs, digests, versions, intent fingerprints, and immediate read-back must remain the evidence boundary. Native relation support must never be inferred from an HTTP error.
- Verify: `node --test tests/ron-workflow/gitlab-to-tickets-adapters.test.mjs`

### Outcome 2: Public routing and setup diagnostics
- Work: Document the installed binding and CLI actions; update `to-tickets`, setup diagnostics, GitLab setup guidance, human docs, and router wording so the concrete adapter is discoverable without implying that setup may create or invoke it. Keep `blockingRepresentation` owned by repository tracker configuration and preserve existing `to-spec` behavior.
- Verify: `node --test --test-name-pattern "GitLab|to-tickets|adapter" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Release-quality evidence
- Work: Review the complete WIP candidate from baseline `62244d056b360808435c38660afd45bda36dd9b3`, repair confirmed Standards and Spec findings, and leave only the approved files ready for a later explicit commit.
- Verify: `node --test tests/ron-workflow/gitlab-producer-adapters.test.mjs tests/ron-workflow/gitlab-producer-recovery.test.mjs tests/ron-workflow/gitlab-to-tickets-adapters.test.mjs tests/ron-workflow/skill-contracts.test.mjs`; `git diff --check`
