# Spec: Simplify Matt-Ron Delivery Routing

**Status:** Approved successor primary publication source; no execution authority until tracker read-back succeeds

**Artifact:** Primary Tracker Spec publication source

**Delivery shape:** Single-Issue Spec

**Classification rationale:** The change has one cohesive outcome: make a planned unit directly executable through one authoritative route while keeping per-Issue integration and aggregate push verification distinct. Although it crosses several promoted skills and documentation files, it is one workflow-contract candidate rather than independently releasable product outcomes.

## Problem Statement

The current flow spreads delivery decisions across `/ask-matt`, `/to-spec`, `/to-tickets`, `/implement`, and `/execute-issue`. `/to-spec` captures design decisions but does not produce an implementation-ready plan; `/to-tickets` decomposes behavior without producing implementation plans; and the default `/implement` guidance conflicts with the desired tracker-governed `/execute-issue` route. A cohesive change can therefore require unnecessary decomposition while still lacking an executable plan.

File or symbol lists in an early plan are necessarily incomplete. Treating them as a fixed allowlist stops valid implementation when source, test, configuration, migration, generated-code, or companion-file dependencies are discovered later.

The current closeout contract also assumes the target can fast-forward to one reviewed candidate. Parallel independent Issues invalidate that assumption: after one candidate advances the target, another reviewed candidate may diverge. Returning every divergent Issue to `/execute-issue` repeats expensive work, while accepting a merge without any later aggregate gate leaves cross-Issue interactions unproved.

## Proposed Outcome

`/to-spec` becomes the sole authority for classifying a Spec as Single-Issue or Multi-Issue. A Single-Issue Tracker Spec contains its own compact Implementation Plan and ends with a copy-ready `/execute-issue <Spec-ID>`. A Multi-Issue Spec delegates only decomposition to `/to-tickets`; every dependency-ready child contains its own mapped executable plan and does not need awareness of concurrent siblings.

`/execute-issue` owns one Issue's implementation, exact candidate, final verification, complete Standards/Spec review, bounded repair, and completion evidence. Necessary source-grounded dependencies may be added without treating expected paths as an allowlist; behavior or Acceptance Criteria changes return to planning.

`/close-issue` always means local integration plus tracker closure. It composes the exact reviewed candidate with the current target in an isolated integration worktree. When the current target is already an ancestor, the candidate itself remains the integration candidate; when histories diverge, closeout creates a merge commit whose parents preserve the current target and exact reviewed candidate. Conflict or ambiguity stops without target mutation or Issue closure. After preservation checks, the real target fast-forwards once to that integration candidate; candidate reachability, receipt read-back, cleanup, and tracker closure are proved before completion. Closeout never refreshes product code, reruns Matt review or expensive full verification, pushes, or deploys.

Before any push, the human explicitly invokes `/verify-target-before-push <target>`. It proves that the exact current target contains every closed Issue candidate represented by the selected integration receipts, performs one aggregate Standards/multi-Spec review and required aggregate verification, and writes a current-HEAD `push_ready` receipt. It never pushes. Target drift invalidates that receipt.

## User Outcomes

1. A planner can turn one cohesive outcome into an executable Spec without artificial child Issues.
2. Independent Issues can execute concurrently and close in any order without repeating `/execute-issue`; every successful close proves its candidate is reachable from the target.
3. Before push, one explicit aggregate gate detects omitted closed Issues and cross-Issue regressions against the exact target `HEAD`.

## Acceptance Criteria

- **AC-1 - Authoritative classification:** `/to-spec` alone classifies delivery shape. Single-Issue means one cohesive outcome that fits one Issue worktree, execution context, reviewed candidate, and closeout. Multi-Issue means multiple independently executable outcomes or blocking edges, or work that cannot fit one such cycle.
- **AC-2 - Bounded ambiguity:** When repository evidence is sufficient, classification is automatic. Only material ambiguity that could change routing permits one blocking question with a recommendation; uncertainty never defaults to Single-Issue or Multi-Issue.
- **AC-3 - Single-Issue plan:** A Single-Issue Spec contains at most three non-authoritative User Outcomes, stable `AC-n` Acceptance Criteria, non-exhaustive expected touchpoints, ordered implementation steps, and verification items. Every AC is covered by at least one step and one verification item, and every step covers at least one AC.
- **AC-4 - Tracker handoff:** Publishing a Single-Issue Tracker Spec ends with the exact copy-ready command `/execute-issue <Spec-ID>`. A tracker-backed local `.scratch` record remains a Tracker Spec and uses `/execute-issue`.
- **AC-5 - Multi-Issue decomposition:** A Multi-Issue parent contains the overall outcome, cross-Issue constraints, and decomposition rationale. `/to-tickets` gives every child its own Acceptance Criteria, mapped Implementation Plan, verification, blockers, and planning baseline; it outputs `/execute-issue <Issue-ID>` only for the dependency-ready frontier. Children never require awareness of concurrently executing siblings.
- **AC-6 - Executor trust boundary:** `/execute-issue` consumes the published classification and owns the exact candidate's implementation, affected and final verification, complete Standards/Spec review, bounded repair, and terminal completion evidence. It declares `implementation_complete` only when required verification passes, both axes are clean, the worktree is clean, and `HEAD` equals the recorded candidate. A later blocked execution state supersedes that Issue's older successful evidence without affecting other Issues.
- **AC-7 - Discovery behavior:** Expected paths and symbols are non-exhaustive planning evidence. Necessary discovery continues automatically; material plan deviation continues only while Acceptance Criteria and public behavior remain unchanged and records a concise reason plus covered AC; scope change stops and returns to planning.
- **AC-8 - Compact traceability:** User Outcomes provide actor/value context but never define done. Acceptance Criteria are the sole done and traceability authority. Inline `Covers: AC-n` references and a pre-publication set check provide mapping without a parser or separate matrix.
- **AC-9 - Bounded promoted surface:** Add exactly one user-invoked `/verify-target-before-push` skill and no external dependency, parser, global queue, or automatic push. Remove duplicated routing and changed-candidate revalidation text from consumers; `/close-issue` must become shorter than its 1,618-word baseline, and no edited skill may exceed the repository's current 141-line maximum.
- **AC-10 - Preservation continuity:** Existing dirty-target snapshot, same-path/path-prefix collision stop, hook evidence, receipt read-back, partial-state recovery, exact worktree cleanup, and tracker closure safety remain effective when the target advances to an integration candidate. Unrelated dirty or untracked work remains unchanged.
- **AC-11 - Arbitrary-order integration:** `/close-issue` captures current target `T` and exact reviewed candidate `C` without asking whether another Issue runs concurrently. In an isolated temporary integration worktree it selects `I=C` when `T` is an ancestor of `C`; otherwise it creates a no-fast-forward merge commit `I` that has both `T` and `C` as ancestors. Conflict, candidate ambiguity, changed scope, or inability to prove ancestry stops before real-target mutation, receipt preparation, worktree cleanup, or Issue closure. Closeout never invokes `/execute-issue`, repairs product code, or reruns Standards/Spec review or expensive full verification.
- **AC-12 - Integrated closure proof:** After collision and preservation preflight, the real target may advance only by `git merge --ff-only` from `T` to exact integration candidate `I`. Cleanup and tracker closure require read-back proof that target `HEAD == I`, `C` is an ancestor of `I`, the matching integration/preservation receipt is verified, blockers remain closed, and the exact Issue worktree is clean. A successfully closed Issue is therefore never omitted from its named local target.
- **AC-13 - Aggregate pre-push gate:** `/verify-target-before-push <target>` reads a fixed verification baseline, exact current target `HEAD`, and the relevant integration receipts. It fails on missing, unreadable, mismatched, or omitted closed-Issue candidates; performs aggregate repository Standards and multi-Spec review; runs required union-focused and full verification; requires a clean verification worktree; and writes/read-backs one `push_ready` receipt bound to the exact target `HEAD`, member Issue/candidate/integration identities, commands, and results. It never closes Issues, changes product code, pushes, or deploys.
- **AC-14 - Push freshness:** A `push_ready` claim is valid only while the selected target `HEAD` equals the receipt SHA and every recorded member candidate remains reachable. Any target movement invalidates it and requires `/verify-target-before-push` again. Push remains a separate explicit action.
- **AC-15 - Aggregate failure ownership:** Aggregate conflict, review finding, test failure, missing receipt, or omitted candidate withholds `push_ready` and reports the exact evidence. It does not automatically roll back the integrated target, reopen closed Issues, rewrite receipts, or repair product code. Product correction requires an explicit integration-repair Issue or explicit authority to reopen the owning Issue.

## Implementation Plan

Expected touchpoints are source-grounded starting points, not an allowlist:

- `CONTEXT.md`
- a new ADR superseding affected portions of ADR 0022
- `skills/engineering/ask-matt/SKILL.md`
- `skills/engineering/to-spec/SKILL.md`
- `skills/engineering/to-tickets/SKILL.md`
- `skills/engineering/implement/SKILL.md`
- `skills/engineering/execute-issue/SKILL.md`
- `skills/engineering/close-issue/SKILL.md`
- new `skills/engineering/verify-target-before-push/SKILL.md`
- affected `agents/openai.yaml` descriptions
- matching pages under `docs/engineering/`
- promoted-skill READMEs, router, and plugin manifest
- `tests/ron-workflow/skill-contracts.test.mjs`

### Step 1: Canonicalize the contract

Keep durable vocabulary in `CONTEXT.md`. Add an ADR that supersedes affected routing and closeout portions of ADR 0022 and owns classification, discovery tiers, execution completion, integration candidate, per-Issue receipt, aggregate verification, push readiness, and failure ownership. Preserve unrelated edits already present in ADR 0022. **Covers: AC-1, AC-2, AC-6, AC-7, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15.**

### Step 2: Make `/to-spec` produce the execution contract

Replace extensive User Stories and open-ended Implementation Decisions with compact User Outcomes, stable Acceptance Criteria, expected touchpoints, ordered steps, verification items, and inline mapping completeness. Emit the Single-Issue execution handoff or Multi-Issue decomposition handoff. **Covers: AC-1, AC-2, AC-3, AC-4, AC-8.**

### Step 3: Make `/to-tickets` produce independent executable children

Limit the parent to cross-Issue information. Give every child its own mapped plan, verification, blockers, planning baseline, and command when dependency-ready. Do not make child execution depend on discovering concurrent siblings. **Covers: AC-5, AC-8.**

### Step 4: Enforce execution and per-Issue integration boundaries

Shorten `/ask-matt`, restrict `/implement` to Standalone Specs or explicit direct work, and make `/execute-issue` publish trustworthy terminal evidence. Replace closeout candidate refresh with isolated integration-candidate construction, conflict stop, candidate ancestry proof, dirty-target preservation, target fast-forward, receipt read-back, exact cleanup, and tracker closure. **Covers: AC-4, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12.**

### Step 5: Add the aggregate pre-push gate

Add `/verify-target-before-push` as one user-invoked promoted skill. Discover and validate the selected target's integration receipt set, prove no closed candidate is omitted, run aggregate Standards/multi-Spec review and required verification on exact target `HEAD`, and emit only a current-HEAD `push_ready` receipt. Keep push separate. **Covers: AC-9, AC-13, AC-14, AC-15.**

### Step 6: Synchronize docs and lock the route with tests

Update affected metadata, docs, READMEs, router, manifest, and contract tests. Enforce classification, mapping, discovery, terminal evidence, arbitrary close order, integration ancestry, preservation, aggregate omission detection, failure behavior, current-HEAD receipt freshness, and size bounds. **Covers: AC-1, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15.**

## Verification

- Compare every `AC-n` with Step and Verification references; fail publication on missing or orphan mappings. **Covers: AC-3, AC-5, AC-8.**
- Exercise contract fixtures for direct fast-forward, divergent no-fast-forward merge, arbitrary close order, conflict stop, candidate reachability, dirty-target preservation, and close/read-back. **Covers: AC-6, AC-10, AC-11, AC-12.**
- Exercise pre-push fixtures for complete receipts, an omitted closed candidate, aggregate review/test failure, exact-HEAD success, and stale-receipt invalidation. **Covers: AC-13, AC-14, AC-15.**
- Run `node --test tests/ron-workflow/skill-contracts.test.mjs`. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15.**
- Recalculate edited skill word and line counts and confirm the stated bounds. **Covers: AC-9.**
- Run `git diff --check` and inspect `git status --short` to prove formatting and unrelated-work preservation. **Covers: AC-10.**

## Out of Scope

- Automatically resolving merge conflicts, changing product code during closeout or pre-push verification, or silently reassigning aggregate findings.
- Automatically reopening closed Issues, rolling back a successful local integration, rewriting history, or deleting topic branches.
- Pushing, remote merging, deploying, or treating `push_ready` as production verification.
- Adding a parser, external dependency, global queue, automatic close chain, or automatic push.
- Defining product-specific estimation, story points, or exhaustive file allowlists.

## Execution Gate

This repository file is a publication source, not a second authority. After the GitHub Issue body, `ready-for-agent` label, mode, successor Planning Seal SHA, and seal state are read back successfully, the published Single-Issue Tracker Spec becomes executable through `/execute-issue <Spec-ID>` and is not eligible for `/implement`. Publication does not authorize push, remote merge, deployment, or unrelated cleanup.

## Next command

`/execute-issue #1`
