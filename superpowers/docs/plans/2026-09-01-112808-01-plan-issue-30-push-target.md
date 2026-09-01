# Add the push-target receipt consumer

**Goal:** Add one user-invoked `push-target` skill that consumes an exact current local-ahead `push_ready:v1` receipt for one verified ordinary push and remote read-back.
**Why planning is required:** This changes a promoted public workflow contract and defines the only authorized remote Git mutation in the Issue-delivery route.
**Acceptance:** The skill must stop before remote mutation on missing, duplicate, malformed, stale, mismatched, already-pushed, ambiguous, or drifting evidence; resolve and fetch exactly one configured upstream; issue at most one ordinary non-force push for the exact verified target; require remote-ref equality before success; never pull, merge, rebase, force-push, rewrite evidence, reverify, deploy, or mutate local product, tracker, branch, worktree, or completion state. Verification must use isolated local remotes only and must never push to the configured GitHub remote.

### Outcome 1: Publish the exact user-only receipt consumer

- Work: Add the promoted `skills/engineering/push-target` contract and Codex metadata, describing exact target and `refs/notes/matt-push-ready` parsing, strict receipt validation, and current-HEAD binding without adding a runtime dependency or unrelated abstraction.
- Risks/open questions: Prompt language is executable authority; any fallback, inferred identity, or implicit invocation would widen the remote-mutation boundary.
- Verify: `node --test --test-name-pattern="push-target|push_ready|non-force push|upstream drift" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Define the fetch, push, and read-back gates

- Work: Require one unique configured upstream, an immediate fetch, exact receipt-baseline and target-SHA equality, ancestor and non-empty-range proof, one explicit ordinary push refspec, and exact remote read-back; classify rejection, transport failure, mismatch, or ambiguity as an unresolved stop with no retry or wider Git authority.
- Risks/open questions: Tests must never exercise the user's configured remote; all behavioral fixtures use temporary repositories and local bare remotes.
- Verify: `node --test --test-name-pattern="push-target|push_ready|non-force push|upstream drift" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Synchronize routing, docs, packaging, and regression evidence

- Work: Add the human docs page, update `ask-matt`, promoted READMEs, plugin manifest, and contract tests so execution, closeout, and target verification remain non-pushing and `push-target` is the separate final delivery step.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`, `node --test tests/ron-workflow/*.test.mjs`, `codex exec --ignore-user-config --ephemeral --sandbox read-only "Review only the manifest and promoted-skill packaging contract; verify parity, paths, docs, and invocation metadata. Ignore unrelated working-tree files. Do not modify files or spawn subagents. Report only actionable findings."`, and `git diff --check`
