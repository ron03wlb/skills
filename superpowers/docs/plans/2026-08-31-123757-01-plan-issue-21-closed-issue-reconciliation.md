# Deliver Issue 21 closed-Issue evidence reconciliation

**Goal:** Add one fail-closed, confirmation-bound historical completion-evidence reconciliation path while preserving immutable Issue history and existing target-verification authority boundaries.
**Why planning is required:** This changes a public workflow contract, introduces append-only tracker mutation authority, and affects aggregate push-readiness evidence.
**Acceptance:** The candidate satisfies Issue #21 AC-1 through AC-5, keeps Issues #13 and #14 read-only during implementation, adds no public reconciliation command, stops on any identity or diagnostic drift, passes the exact focused/contract/full-suite checks, receives clean independent Standards and Spec reviews, and stops after a read-back `implementation_complete` note without integration, worktree removal, Issue closure, push, or deployment.

### Outcome 1: Freeze eligibility and deterministic diagnostics
- Work: Extend frozen-range verification so only one otherwise-valid closed affected completion with one failed command can enter recovery; compare exact baseline/candidate fingerprints and prove one closed remedy Issue owns the complete correction and both candidates are target-reachable.
- Risks/open questions: Any open Issue, registered worktree, later valid completion, coverage/review failure, extra failure, mismatched fingerprint, partial remedy, or ambiguous owner must retain its existing failure owner and stop without tracker mutation.
- Verify: `rtk node --test --test-name-pattern="closed Issue evidence reconciliation|target verification" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Add the confirmation-bound record helper
- Work: Add promoted model-invoked `record-closed-issue-reconciliation` instructions and metadata that accept only the verifier's exact human-confirmed packet, revalidate all bound identities and diagnostics, reuse one exact record or append/read back one record on the affected closed Issue, and perform no review, verification, reopening, readiness, or unrelated mutation.
- Risks/open questions: Unavailable, malformed, duplicate, edited, conflicting, drifting, partial, or ambiguous evidence stops; tracker write/read-back uncertainty never claims success.
- Verify: `rtk node --test --test-name-pattern="record-closed-issue-reconciliation" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Restart aggregate verification from fresh Entry
- Work: After exact helper read-back, discard the stopped gate, re-freeze the target range, validate the record and both candidates, collect/deduplicate every exact affected-note command, run the repository full suite once in its normal stage, and preserve local-ahead versus already-pushed result boundaries.
- Risks/open questions: Reconciliation must not bypass contribution coverage, Standards, Spec, cleanliness, ref-stability, ordinary open-Issue blockers, or direct-target contribution authority.
- Verify: `rtk node --test --test-name-pattern="closed Issue evidence reconciliation|target verification" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Synchronize promoted publication and regression contracts
- Work: Synchronize helper docs, invocation metadata, promoted READMEs/plugin manifest, `ask-matt` routing, verifier docs, and contract assertions in English; keep `verify-target-before-push` as the sole public recovery entrypoint.
- Risks/open questions: Packaging or invocation drift can expose unauthorized manual mutation; exact parity is required before review.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 5: Review, repair, and publish completion evidence
- Work: Run the repository full suite and diff checks, commit the candidate, execute independent Standards and Spec reviews, repair confirmed findings for at most 10 waves, rerun affected/final checks, verify clean fixed refs and workflow-artifact ownership, then write/read back one completion note.
- Risks/open questions: A tenth unclean repair wave, candidate/ref drift, dirty worktree, failed final command, or tracker ambiguity stops with Issue #21 open and the candidate preserved.
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs` and `rtk git diff --check c10c602c90064019e0aaf54806360cfb6ed51823...HEAD`
