# Issue 35 to-tickets composite Run handoff

**Goal:** Make `to-tickets` consume the completed `to-spec` handoff, settle and attest its own decomposition-plan checkpoint before tracker publication, preserve complete re-entrant reconciliation, and emit one composite Multi-Issue Run handoff.
**Why planning is required:** The change alters a promoted public workflow contract spanning Git target mutation, tracker mutation ordering, immutable authority evidence, retry recovery, and Run routing.
**Acceptance:** The unchanged #35 Acceptance Criteria remain authoritative. A new operation fails closed before mutation unless the immediate upstream handoff, clean target, and transaction state are exact; a matching incomplete operation resumes without duplication. The plan checkpoint is transaction-bound, committed alone under the shared writer, read back, and attested before child publication. Existing decomposition reconciliation remains complete. Final publication appends one read-back composite handoff and emits only `/run-issue-workflow <Spec-ID>`. Promoted instructions, metadata, docs, router text, README summaries, and executable contracts remain synchronized. No implementation, closeout, push, deploy, task creation, external prerequisite execution, or unrelated state mutation is introduced.

### Outcome 1: Bind entry and checkpoint authority

- Work: Update the `to-tickets` contract so Entry consumes the exact completed `to-spec` handoff and validates parent, target, Planning Seal, classification, approved scope, checkpoint commit, immutable v1 record identity, target cleanliness, and Workflow checkpoint transaction state. Define exact-match resume and fail-closed drift behavior.
- Risks/open questions: Upstream, scope, target, or transaction ambiguity must stop without inventing legacy compatibility or repairing unrelated state.
- Verify: `rtk node --test --test-name-pattern="to-tickets|workflow checkpoint" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Settle and attest the decomposition plan before publication

- Work: Require transaction creation before writing the exact durable decomposition plan, one isolated checkpoint commit under Target mutation serialization, bounded Git/read-back verification, and `attest-target-contribution` read-back before any child, relation, label, or parent-comment mutation. Exact retries reuse already-proven stages.
- Risks/open questions: Partial commit or attestation state must remain recoverable without a second plan, commit, comment, confirmation, or rollback.
- Verify: `rtk node --test --test-name-pattern="to-tickets|workflow checkpoint|decomposition publication" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Preserve reconciliation and publish one composite handoff

- Work: Keep the canonical child, key, native relationship, blocker-first, partial-publication, decomposition-record, and ready-label contracts intact. After exact read-back, append one final `handoff.completed` binding both producer evidence identities, the decomposition record identity and digest, mapping, blocker edges, classification, and approved scope, then report the frontier and only the parent Run command.
- Risks/open questions: Any identity drift, conflicting child evidence, incomplete read-back, or duplicate/malformed handoff stops without tracker repair or scheduling.
- Verify: `rtk node --test --test-name-pattern="to-tickets|decomposition publication|composite handoff|ready frontier" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Synchronize and prove the promoted contract

- Work: Keep `SKILL.md`, `agents/openai.yaml`, human docs, `ask-matt` routing, promoted README summaries, and contract tests aligned in English. Review the exact execution-baseline diff on separate Standards and Spec axes and repair only confirmed in-scope findings.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`, `rtk node --test tests/ron-workflow/*.test.mjs`, `rtk git diff --check`, and the repository-required manifest/promoted-skill packaging review when applicable.
