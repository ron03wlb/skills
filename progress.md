# Progress Log: `pre-execute-issue`

## Session: 2026-08-27

### Phase 1: Requirements and repository discovery

- **Status:** in_progress
- **Started:** 2026-08-27
- Actions taken:
  - Read `grill-with-docs`, its required `grilling` and `domain-modeling` skills, `skill-creator`, `ponytail`, `planning-with-files`, and `codebase-design`.
  - Read repository instructions, RTK guidance, and the supplied handoff.
  - Ran planning session catch-up and read current Git status.
  - Confirmed the current dirty state matches the supplied snapshot and must be preserved.
  - Read the earlier generic execution-policy handoff and searched the current workflow for prerequisite, receipt, adapter, worktree, and candidate concepts.
  - Read `CONTEXT.md`, ADR-0022/0023, the current `execute-issue` and `ask-matt` skill/docs, and the pre-existing ADR-0022 diff.
  - Added confirmed domain terms for repository prerequisites, human-owned external action, and prerequisite receipts without pre-deciding artifact ownership.
  - User accepted bounded prerequisite artifact preparation ownership, specifically to support repositories where SQL must be manually applied before dependent execution.
  - Added the resolved `Prerequisite artifact` term and ADR-0024.
  - User clarified that `pre-execute-issue` is not a mandatory chain step; after the Spec is written, the user may invoke it to discover whether SQL must be generated and manually applied.
  - Added `Prerequisite inspection` and preserved `/to-spec` as the delivery-routing authority.
  - User accepted independent read-only prerequisite discovery in `execute-issue` with fail-closed handling for missing or stale required evidence.
  - Added ADR-0025 and confirmed the repository has no active generic workflow-config object to extend.
  - User accepted `AGENTS.md` or `CLAUDE.md` routing to a repository-owned prerequisite resolver, with no universal workflow config.
  - Added `Prerequisite resolver` and ADR-0026.
  - User accepted one resolver command with `discover`, `prepare`, and `verify` operations after reviewing proactive/reactive SQL and no-SQL flows.
  - Added ADR-0027 and synchronized the resolver relationship in `CONTEXT.md`.
  - Verified that GitHub, GitLab, and local Markdown tracker adapters all support append-only comments plus read-back, providing an existing durable receipt seam.
  - User selected append-only Issue receipts with an explicit constraint that prerequisite verification remain cheaper and simpler than implementation.
  - Added ADR-0028 and narrowed receipts to one read-back per recovery-relevant transition with no polling or duplicate validation layer.
  - User confirmed shared resolver `discover` and required `prepare` to repair SQL syntax/static failures until repository validation passes before handoff.
  - Updated ADR-0024/0027 and the glossary relationships without adding a second validator.
  - User required English skill surfaces and accepted a maximum of five material prerequisite artifact repair waves per invocation.
  - Added `Prerequisite artifact repair wave` and synchronized ADR-0024, planning, and acceptance notes.
  - User accepted one shared Issue worktree/topic branch and asked whether proactive pre-execution creates it.
  - Defined lazy creation: only `REQUIRED` creates or reuses it; validated prerequisite artifacts commit alone before manual handoff. Added ADR-0029.
  - User accepted a narrow `READY` identity boundary that survives later implementation commits but fails on protected prerequisite drift.
  - Added `Protected prerequisite identity` and ADR-0030.
  - User selected post-Spec, pre-worktree resolver discovery as the authoritative SQL-prerequisite decision point.
  - Added ADR-0031 and clarified that planning hints cannot become a second verdict.
  - User formally accepted exactly two durable prerequisite receipts: `WAITING_MANUAL` and `READY`.
  - Updated the glossary and ADR-0028 so discovery and blocker results remain transient.
  - User accepted one repository-defined read-only target verification as the minimum proof for `READY`.
  - Added `Prerequisite target verification` and ADR-0032.
  - User accepted the late prerequisite discovery split between unchanged-scope recovery and planning-required scope change.
  - Added `Late prerequisite discovery` and ADR-0033.
  - User accepted a semantic resolver contract with repository-owned transport and schema details.
  - Added ADR-0034.
  - User requested a dedicated skill to perform consumer-repository adoption instead of relying on manual guidance or reviving `ask-ron`.
  - User accepted `setup-pre-execute-issue` as an explicit, one-time setup skill limited to repository instructions, policy, resolver implementation, fixture, and safe validation.
  - Added `Prerequisite resolver adoption` and ADR-0035.
  - User accepted atomic adoption: setup must establish and validate the complete resolver contract or leave no active declaration or placeholder adoption.
  - Updated ADR-0035 and synchronized the glossary and planning files.
  - User confirmed repositories without SQL or another concrete manual prerequisite do not invoke setup and may run `execute-issue` directly through the undeclared-resolver `NOT_REQUIRED` route.
  - Updated ADR-0035 and advanced the session to the shared-understanding completion gate.
- Files created/modified:
  - `task_plan.md` (created)
  - `findings.md` (created)
  - `progress.md` (created)
  - `CONTEXT.md` (updated with resolved glossary terms)
  - `docs/adr/0024-prepare-prerequisite-artifacts-before-issue-execution.md` (created)
  - `docs/adr/0025-keep-prerequisite-inspection-optional-and-gated.md` (created)
  - `docs/adr/0026-discover-prerequisites-through-repository-instructions.md` (created)
  - `docs/adr/0027-use-one-prerequisite-resolver-with-three-operations.md` (created)
  - `docs/adr/0028-keep-prerequisite-receipts-append-only-and-minimal.md` (created)
  - `docs/adr/0029-share-one-issue-worktree-across-prerequisite-and-execution.md` (created)
  - `docs/adr/0030-bind-ready-to-the-prerequisite-not-the-later-candidate.md` (created)
  - `docs/adr/0031-discover-prerequisites-after-spec-publication.md` (created)
  - `docs/adr/0032-require-one-read-only-target-check-for-ready.md` (created)
  - `docs/adr/0033-pause-and-classify-late-prerequisite-discovery.md` (created)
  - `docs/adr/0034-fix-resolver-semantics-not-a-universal-transport.md` (created)
  - `docs/adr/0035-use-a-dedicated-one-time-prerequisite-setup-skill.md` (created)

### Phase 2: Shared-understanding design

- **Status:** completed
- Actions taken:
  - Resolved the runtime lifecycle, discovery seam, worktree identity, receipt boundary, validation loop, late-discovery behavior, and one-time repository adoption contract one decision at a time.
  - The user invoked `/to-spec`, confirming the settled conversation should become the authoritative Tracker Spec rather than returning to design questions.
  - Classified the outcome as Multi-Issue because runtime prerequisite handling and one-time repository adoption are independently executable and the setup contract depends on the finalized runtime semantics.
  - Created Planning Seal `c6c87caf9337d5d28ea2a395751727093447cf08` with only `CONTEXT.md` and ADRs 0024 through 0035.
  - Published primary GitHub Spec #2, applied `ready-for-agent`, and read back mode, seal, classification, template, constraints, rationale, and `/to-tickets #2` with every contract check passing.
- Files created/modified:
  - `superpowers/docs/plans/2026-08-27-162240-01-plan-publish-pre-execute-issue-spec.md` (created as the High-risk publication plan; excluded from the Planning Seal)
  - GitHub Issue #2 (published Tracker Spec)

### Phase 3: Child decomposition and implementation plans

- **Status:** pending
- Actions taken:
  - None; `/to-tickets #2` has not been invoked.
- Files created/modified:
  - None.

## Test Results

| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Session catch-up | Current repository root | Report prior unsynced session context if present | No prior planning files or unsynced report emitted | Pass |
| Dirty-state inventory | `git status --short --branch` | Preserve handoff-listed user work | Snapshot confirmed | Pass |
| Planning Seal scope | `git diff --cached --check`; staged allowlist; `git show HEAD` | Only `CONTEXT.md` and ADRs 0024-0035 | 13 owned paths; 149 insertions, 1 deletion | Pass |
| Planning Seal ancestry | `git merge-base --is-ancestor e544d7c... c6c87caf...` | Original target is ancestor | Exit 0 | Pass |
| Tracker publication read-back | `gh issue view 2 ... --json ...` | Primary Multi-Issue, created seal, selected template, label, constraints, rationale, exact next command | All 15 checks true | Pass |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-08-27 | None | 1 | N/A |
| 2026-08-27 | `rg` rejected wildcard filenames used as positional paths on Windows | 1 | Use directory plus `--glob` or explicit paths. |
| 2026-08-27 | Multi-file `apply_patch` used stale `progress.md` context | 1 | Re-read exact files and split into smaller verified hunks; no partial change occurred. |

## 5-Question Reboot Check

| Question | Answer |
|----------|--------|
| Where am I? | Published Multi-Issue Spec #2; awaiting child decomposition. |
| Where am I going? | `/to-tickets #2`, then child implementation, verification, and delivery. |
| What's the goal? | Add a safe generic `pre-execute-issue` skill and verified `execute-issue` handoff. |
| What have I learned? | See `findings.md`. |
| What have I done? | Read governing contracts, inspected supplied evidence, confirmed dirty state, and initialized working files. |
