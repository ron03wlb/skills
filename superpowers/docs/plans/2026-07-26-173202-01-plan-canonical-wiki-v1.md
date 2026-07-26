# Ron Canonical Wiki v1 implementation

**Goal:** Deliver one state-aware `/wiki` skill backed by shared, deterministic Ron workflow contracts without creating a second Spec, authorization, or closeout protocol.
**Why planning is required:** This changes promoted skill contracts, durable authorization records, local Git history, and the plugin manifest across several dependent workflow entry points.
**Acceptance:** The accepted Canonical Wiki Spec is executable and self-consistent; the existing Ron/Wiki design is preserved in one scope-only local baseline commit; shared contract tooling passes focused and temporary-repository tests; updated skills and `/wiki` pass forward tests; no unrelated files, push, deployment, installation, release-version change, or remote mutation occurs.

### Outcome 1: Executable Wiki contract

- Work: Update `research/ron-canonical-wiki-docs-as-code-spec.md` as the single Canonical Wiki authority. Define the shared core boundary, strict machine-readable config block, bootstrap baseline exception, pre-Issue delegation sequence, source-resolver profile, shared Change Spec publisher seam, failure states, and forward-test matrix. Reconcile the cross-cutting authorization fields and current implementation authorization in `research/matt-first-issue-delivery-workflow-spec.md` and affected ADRs without creating another product Spec.
- Verify: `git diff --check -- CONTEXT.md docs/adr research superpowers/docs/plans`

### Outcome 2: Scope-only local baseline

- Work: Inspect the exact Ron workflow and Wiki design diff, exclude learning/course artifacts and unrelated dirt, then create one local baseline commit containing only the accepted Ron skills, their docs/routing/manifest entries, shared subagent policy changes, Canonical Wiki research, ADRs, and this implementation plan.
- Risks/open questions: Stop before committing on overlapping unrelated edits, unexpected paths, broken links, or an incoherent promoted-skill set. The commit is local only and does not authorize push, installation, release changes, or publication.
- Verify: `git show --stat --oneline HEAD` and `git status --short`

### Outcome 3: Shared deterministic workflow core

- Work: Add a dependency-free Node command module under `scripts/ron-workflow/` plus fixtures and `node:test` coverage under `tests/ron-workflow/`. It owns canonical JSON/envelope hashing, config and preview validation, source-locator resolution, ledger validation, clean-path delegation validation/derivation, and Change Spec payload construction. It performs no tracker, Git-history, Wiki, or network mutation.
- Verify: `node --test tests/ron-workflow/*.test.mjs`

### Outcome 4: Existing Ron skills use the shared contracts

- Work: Update `setup-ron`, `to-spec-ron`, `to-tickets-ron`, `execute-issue`, and `close-issue` so setup can create its bounded local commit, every Change Spec uses the shared publisher, execution distinguishes bootstrap/ready/not-applicable baseline requirements, closeout requires an aligned ledger, and valid clean-path delegation can derive only exact local Grants. Keep Leaves unable to mutate Wiki.
- Verify: `node --test tests/ron-workflow/*.test.mjs` plus temporary-repository forward tests for setup, specification, execution, and closeout.

### Outcome 5: Thin state-aware `/wiki`

- Work: Add the promoted user-invoked `wiki` skill, OpenAI invocation metadata, docs page, router entries, README entries, and plugin manifest entry. It selects initialization, resume, ready-state sync, or read-only status from verified state and delegates all payload, authorization, execution, and closeout behavior to the shared contracts and existing Ron skills.
- Verify: Forward tests cover missing, bootstrapping, ready, not-configured, not-bounded, findings, and not-verifiable states without unexpected tracked or external mutation.

### Outcome 6: Completion evidence

- Work: Review the final diff against the accepted Spec, run focused and repository-wide structural checks, validate promoted-skill parity and Markdown links, and run `claude plugin validate . --strict` when the required CLI is available. Treat unavailable strict plugin validation as an unverified packaging gate rather than a pass.
- Verify: `git diff --check`, the Ron/Wiki structural validator, `node --test tests/ron-workflow/*.test.mjs`, temporary-repository forward tests, and `claude plugin validate . --strict` when available.
