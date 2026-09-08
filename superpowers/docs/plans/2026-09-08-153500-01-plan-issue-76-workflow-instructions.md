# Issue 76: Align workflow instructions with implemented recovery

**Goal:** Align reachable instruction owners with Issues 73–75 and record bounded live model scenario evidence for Issue 76.
**Why planning is required:** High-risk authority and recovery instructions affect cross-owner workflow actions.
**Acceptance:** Issue 76 AC-1 through AC-5 and parent Spec 72 constraints; unchanged authority, original owners, honest host limits, six model scenarios with exact prompts and limitations, preserved Issue 67 reading reductions, required candidate verification and independent Standards/Spec review.

## Execution binding

- Target: `features/ron`; baseline: `49951f9b63434a1712f937c984785ac8cb966098`.
- Sole lane: `C:/Users/ron.chang/.codex/worktrees/5024/skills`, topic `codex/issue-76-workflow-instructions`, task `01a07fe4-ece7-7ef0-83b6-5fef46ea0c90`.
- Common directory: `C:/Workspace/open_source/skills/.git`.
- Run: `workflow-op-v1-542b78a33fd30e920bc2483be65d394f83e88dd84d176daebd70f7e313040bb2`; pinned workflow `db130a91219ef4df4a7339b0a6c3b9149b6fc66692768ce32be656f0529bda37`.
- Grant, parent/decomposition and unchanged Issue body read back; blockers 73–75 closed and their current candidates target-reachable. Planning Seal `0dd5111da99b2a719b8085ef76be0c2818e95e1a` is ancestral; initial lane and target are clean.
- Scope excludes runtime redesign, package installation, integration, closure, push, deployment and unrelated cleanup. Stop at reviewed `implementation_complete` read-back.

### Outcome 1: One accurate instruction owner per recovery rule

- Work: Audit Run entry, driver, lifecycle/recovery, execute/close, preparation, routing and affected human docs against prerequisite implementations. Record an owner map; replace proven conflicts at their source. Preserve planning-only Spec requests and real authority/scope/ownership/host gates. Covers AC-1, AC-2, AC-3.
- Verify: Source trace plus independent Standards and Spec review of the baseline-to-candidate diff.

### Outcome 2: Bounded model behavior evidence

- Work: Run approved-bootstrap, completed-re-entry, pending-native-result, changed-scope, unavailable-host-release and unchanged-verification scenarios using the available live model/harness. Preserve exact prompts, model, outputs/actions and limitations. Synthetic state and deterministic mocks remain labelled separately from actual model observations. Covers AC-2, AC-3, AC-4, AC-5.
- Verify: Inspect each live transcript against its expected outcome; record unavailable evaluation as unproved. No replay of closed product workflows and no mutation of live Run authority.

### Outcome 3: Proportional candidate verification and completion

- Work: Preserve existing reading-load measurement and reduction checks. Run required focused checks and full suite on the committed candidate, using the pinned execution verification cache with fresh inputs. Classify only this required non-contract plan as a workflow artifact; the audit/evaluation report is ordinary Issue scope. Covers AC-1, AC-5.
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/operational-reading-load.test.mjs`; `node scripts/measure-operational-reading-load.mjs`; repository `node --test` with every test file explicitly enumerated; `git diff --check`. No configured typechecking in package.json.
- Recovery: Preserve candidate and failed evidence; repair confirmed in-scope review findings under the persistent ten-wave budget. Changed scope or uncertain ownership stops before dependent actions. Final completion requires clean worktree, clean independent review axes and exact passing verification inputs.
