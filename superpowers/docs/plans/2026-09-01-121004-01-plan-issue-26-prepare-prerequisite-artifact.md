# Prepare Fail-Closed Prerequisite Artifacts

**Goal:** Add the promoted model-invoked `prepare-prerequisite-artifact` helper that turns one exact declared Manual prerequisite into a clean, committed, adapter-validated and independently reviewed Operator SQL candidate without touching an external environment.
**Why planning is required:** Issue #26 changes a promoted public workflow contract and defines safety boundaries for data-changing SQL, so the repository High-risk tier requires a durable plan.
**Acceptance:** GitHub Issue #26 AC-1 through AC-5 pass; the candidate changes only the Issue-owned skill, metadata, documentation, routing, packaging, tests, and this plan; every adapter ambiguity and unsafe SQL state fails closed; no SQL, database, tracker, integration, push, deployment, cleanup, or unrelated mutation occurs; focused and full repository checks pass; Standards and Spec reviews are clean; the reviewed worktree is clean at the final candidate; `implementation_complete` is appended and read back without closing Issue #26.

### Outcome 1: Exact adapter-bound helper entry
- Work: Add `skills/engineering/prepare-prerequisite-artifact/` as a model-invoked helper. Bind one active handoff to the exact Issue, target, Issue worktree, approved scope, declared repository-relative artifact, and repository-owned `discover`, `prepare`, and `validate` adapter operations. Stop on missing, broken, incomplete, ambiguous, or contradictory evidence without runtime setup, dialect guessing, infrastructure creation, or edits outside the artifact.
- Verify: `node --test --test-name-pattern="prepare-prerequisite-artifact|prerequisite adapter" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Fail-closed Operator SQL and shared repair budget
- Work: Specify the exact three ordered Operator SQL sections, three-state repeatability, database-native assertions, persistent exact backup, revalidation and locking, safe transaction boundary, postconditions, truthful inert recovery, and terminal `APPLIED` or `NO_OP` outcome. Require deterministic adapter validation plus independent Standards and Spec review after material edits under one maximum of ten material repair waves; advisories, tool failures, and no-edit retries do not consume a wave.
- Verify: `node --test --test-name-pattern="Operator SQL|repair wave" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Clean content-bound candidate and synchronized publication
- Work: Return the full Prerequisite candidate commit, exact Git blob, and repository-relative path only from a clean exact Issue worktree. Synchronize the English skill body, `agents/openai.yaml`, human docs, model-invoked README entries, plugin manifest, `ask-matt` skill and docs, and executable contracts. Keep consumer adapters, product SQL, external execution, attestation, closeout, integration, push, deployment, and cleanup outside the helper.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Final verification, two-axis review, and completion evidence
- Work: Run the complete Ron workflow suite and packaging review, inspect the exact baseline-to-candidate diff, classify every review observation from exact Standards or Spec evidence, repair confirmed in-scope findings for at most ten waves, and publish `implementation_complete` only for the unchanged clean reviewed candidate. Declare this plan as the sole `workflowArtifacts` entry required by the repository High-risk tier.
- Verify: `node --test tests/ron-workflow/*.test.mjs`; `codex exec --ignore-user-config --ephemeral --sandbox read-only "Review only the manifest and promoted-skill packaging contract; verify parity, paths, docs, and invocation metadata. Ignore unrelated working-tree files. Do not modify files or spawn subagents. Report only actionable findings."`; `git diff --check`
