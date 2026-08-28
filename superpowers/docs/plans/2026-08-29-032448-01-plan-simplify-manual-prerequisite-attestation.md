# Simplify manual prerequisite attestation

**Goal:** Make one human statement naming an already executed repository artifact sufficient to continue Issue execution.
**Why planning is required:** This changes a promoted public workflow contract, removes a setup skill, changes tracker evidence authority, and affects Issue execution routing.
**Acceptance:** One `/pre-execute-issue <Issue-ID> <artifact-path>` invocation appends and reads back one minimal `manual_prerequisite_complete:v1` tracker note, or reuses an exact existing note. It never requires resolver adoption, artifact preparation, an artifact-only checkpoint, target identity, credentials, DB access, postflight evidence, `WAITING_MANUAL`, `READY`, or a second invocation. `execute-issue` consumes that attestation and continues; only a missing or ambiguous artifact statement asks the human for the exact path. The obsolete `setup-pre-execute-issue` public surface is removed. Existing unrelated modified and untracked files remain untouched. No tracker mutation, push, integration, deployment, or consumer-repository change occurs while implementing this generic contract.

### Outcome 1: Replace the prerequisite domain contract
- Work: Define one Manual execution attestation in `CONTEXT.md` and record a superseding ADR that explains why human authority replaces resolver-driven target proof.
- Risks/open questions: The attestation authorizes workflow continuation but does not prove the external target outcome; the skill must state that boundary without recreating verification requirements.
- Verify: `rg -n "Manual execution attestation|Prerequisite resolver|WAITING_MANUAL|READY" CONTEXT.md docs/adr`

### Outcome 2: Reduce the runtime skills to one attestation step
- Work: Rewrite `pre-execute-issue` to accept the human's exact artifact path, append/read back one minimal note, and stop without worktree or external verification. Rewrite `execute-issue` to consume that note and remove resolver discovery. Remove `setup-pre-execute-issue` because no repository adoption remains.
- Risks/open questions: Tracker write/read-back failure remains an honest persistence failure; it must not be misreported as a completed attestation.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Resynchronize every public surface
- Work: Update metadata, docs, router text, READMEs, plugin manifest, and contract tests; remove obsolete setup documentation and metadata.
- Verify: `python C:/Users/ron.chang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/engineering/pre-execute-issue && python C:/Users/ron.chang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/engineering/execute-issue`

### Outcome 4: Prove the simplified contract and preservation
- Work: Run focused contracts, repository-required manifest review, stale-term search, diff checks, and final status inspection without staging or committing.
- Verify: `git diff --check && node --test tests/ron-workflow/skill-contracts.test.mjs`
