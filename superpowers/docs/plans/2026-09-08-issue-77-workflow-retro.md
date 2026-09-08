# Issue 77 execution plan

Authority: https://github.com/ron03wlb/skills/issues/77 (Single-Issue), approved scope
`sha256:21c0f5d806d52be4b3a7218f3f6af5730017c75dcc0c585780a2a83d632ca497`.
This non-contract plan is required by the task's AGENTS.md High-risk discipline.
The published Issue remains the acceptance authority.

## Lane and assumptions

- Task: `01a07ef5-3899-76c1-8e82-2f87d5d2c59e`; Run: `workflow-op-v1-f4a8656ea5a315fe1b7168ea8c00b9802fd5fa68648213657a30263757617ea5`.
- Common directory: `C:/Workspace/open_source/skills/.git`.
- Adopted sole worktree: `C:/Users/ron.chang/.codex/worktrees/bdea/skills`.
- Topic: `codex/issue-77-workflow-retro`; target: `features/ron` at `C:/Workspace/open_source/skills`.
- Baseline and reused Planning Seal: `0dd5111da99b2a719b8085ef76be0c2818e95e1a`.
- Operation: `workflow-op-v1-3419283b6dab26d43e1dbdd08ffbf7a1513112dff758c26695c67873c3751a83`.
- Grant and dispatch read from the Run's `events.jsonl`; Issue body hash matches; initial lane and target are clean; seal is an ancestor; no accepted planning delta or prerequisite exists.
- Workflow owner package: `db130a91219ef4df4a7339b0a6c3b9149b6fc66692768ce32be656f0529bda37`. Use its execute/review/evidence and writing-for-agents contracts.
- Diagnostic skill only. No retrospective is run against private histories as a test. No recovery, global policy change, installation or external mutation is part of the delivered skill.

## Steps and checks

1. Add failing synthetic selection/history fixtures (AC-1, AC-2). Implement one small pure module for explicit timestamp normalization, deterministic sample selection and cursor walking. Verify more than 50 tasks, ties, duplicates, capped sources, small complete inventories, cutoff races and missing/truncated history.
2. Write concise skill instructions and conditional source/recovery/decision references (AC-3 through AC-6). Exercise contrasting synthetic episodes and a resumed decision dialogue with an independent reviewer; retain expected outcomes in fixture data. The helper performs no causal classification or workflow execution.
3. Add English Codex metadata, personal listing and human router entry (AC-7). Re-sync ask-matt's existing docs page as required by CLAUDE.md; add no promoted workflow-retro page or manifest entry.
4. Run focused tests, skill contracts, all `tests/ron-workflow/*.test.mjs`, syntax checks and diff checks. No configured typecheck exists in package.json; the new code is dependency-free JavaScript. Commit the candidate, bind final checks through the pinned verification cache, and independently review Standards and Spec from this baseline. Repair confirmed in-scope findings using the execution owner's recorded wave count.
5. Verify all ACs against the exact clean reviewed candidate, publish/read required compatibility records and exactly one `implementation_complete`, and stop before integration or push.

## Verification limits

Pure helper tests prove selection and cursor behavior. Contract checks prove packaging and required instruction boundaries. Synthetic agent walkthroughs evaluate diagnosis and decision behavior; they are not a guarantee about future model judgments or live host coverage. Real unavailable history remains a gap. No live-data test dependency is introduced.

## Prospective workflow artifacts

- Path: this file. Requirement source: task AGENTS.md, Work Risk Classification / High-risk. Purpose: record the bounded implementation plan and candidate verification strategy.

The existing ask-matt docs page is necessary discovery under Step 4 / AC-7 due to CLAUDE.md's promoted router documentation rule; it is ordinary reviewed scope, not a workflow artifact exemption.
