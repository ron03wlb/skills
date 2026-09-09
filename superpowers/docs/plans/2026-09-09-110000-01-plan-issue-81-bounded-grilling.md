# Bound grilling to unresolved material decisions

**Goal:** Implement Issue #81 against parent Spec #80 without changing sibling outcomes.
**Why planning is required:** The changed skill is a public instruction contract; repository High-risk rules require a durable plan and independent Standards and Spec review.
**Acceptance:** AC-1 through AC-4 of Issue #81: bounded material questions, continuity of accepted decisions, preserved final confirmation and caller/permission/prerequisite constraints, and consistent English guidance with honest evidence labels. Complete at a clean reviewed commit and read-back completion note; integration and closure belong to the later close owner.

## Execution identity

- Repository: `github:ron03wlb/skills`; Git common directory: `C:/Workspace/open_source/skills/.git`.
- Spec: `I_kwDOTh5gv88AAAABQYNACg`; Issue: `I_kwDOTh5gv88AAAABQYRmcQ` (`80/01`); published classification: `MULTI`.
- Approved scope: `sha256:5dbbbc36dd05cf7589c519ec1b088d3cc686fbc4211c3a58ffab659803381b36`; decomposition: `IC_kwDOTh5gv88AAAABTXqDaw`.
- Execution operation: `workflow-op-v1-2e9d1c2df845a02f060d26b83fad8e18f004833a05dfcde78320e16edfc75103`.
- Run: `workflow-op-v1-5e41dc510b96e50a503ec758448a92148504e67dd6dbf97dd5606564442d66bf`; its `grant.recorded` event was read and matched before mutation.
- Owning task: `01a08412-4f1c-7870-bec9-01db9ce81fd5`; sole adopted worktree: `C:/Users/ron.chang/.codex/worktrees/3409/skills`; branch: `codex/issue-81-bounded-grilling`.
- Baseline and reused Planning Seal: `4d40439f1f50578b0d7ad836b044814c6b012022`; target: `features/ron`. Initial task worktree and target were clean; initial task HEAD was detached at the baseline. The native creation intent names this exact Issue lane, and the branch is attached in that same worktree.
- Workflow package: `852bd245fbd94b8a7a815de4a52e036cfa691f97c1169fddff6e604ef53ea90f`. Workflow owners/references use that package; generic planning/verification helpers use the host catalog as permitted by the parent Spec.
- No blockers or Manual prerequisites. No prior implementation/repair evidence; cumulative repair waves start at zero.

### Outcome 1: Bounded interview contract

- Work: Update the existing grilling frontier, continuity, and completion rules. Preserve dependency rounds, one-material-decision callers, Run preparation ownership, permissions and Manual prerequisites. Scope remains the published Issue.
- Verify: Focused structural regression tests in `tests/ron-workflow/grilling-contract.test.mjs`, first against the baseline contract and then the change.

### Outcome 2: Consistent guidance

- Work: Synchronize grilling docs, UI metadata, catalog entries, and contradictory router wording. Inspect `grill-with-docs` as a caller; its metadata and host-loading changes remain sibling `80/03` ownership. Keep all public text in English.
- Verify: Focused contract checks, UTF-8 without BOM, documentation links/section order, and final baseline-to-candidate diff review.

### Outcome 3: Trustworthy completion evidence

- Work: Define bounded continuation scenarios with expected outcomes. Structural assertions inspect instructions; they do not establish observed model behavior. Record unrun model scenarios as unverified. Supply this required non-contract plan as the sole prospective workflow artifact to both independent reviewers.
- Verify: `node --check tests/ron-workflow/grilling-contract.test.mjs`; `node --test tests/ron-workflow/grilling-contract.test.mjs`; `node --test tests/ron-workflow/skill-contracts.test.mjs`; `node --test tests/ron-workflow/*.test.mjs`. No typechecking script/config is configured in this JavaScript/Markdown repository. Use the pinned execution-owned verification cache only for the exact clean candidate and freshly read inputs. Require independent Standards and Spec review with no confirmed findings, then write and read back one `implementation_complete` note.
