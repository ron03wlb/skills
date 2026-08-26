# Spec: Simplify Matt–Ron Delivery Routing

**Status:** Approved primary publication source; no execution authority until tracker read-back succeeds

**Artifact:** Primary Tracker Spec publication source

**Delivery shape:** Single-Issue Spec

**Classification rationale:** The change has one cohesive outcome: make a planned unit directly executable through one authoritative route. Although it crosses several skill and documentation files, it can be implemented, reviewed, and closed as one candidate without an independently releasable child outcome or blocking edge.

## Problem Statement

The current flow spreads delivery decisions across `/ask-matt`, `/to-spec`, `/to-tickets`, `/implement`, and `/execute-issue`. `/to-spec` captures design decisions but does not produce an implementation-ready plan; `/to-tickets` decomposes behavior without producing implementation plans; and the default `/implement` guidance conflicts with the desired tracker-governed `/execute-issue` route. As a result, a cohesive change can require unnecessary ticket decomposition while still lacking an executable plan.

File or symbol lists in an early plan are also necessarily incomplete. Treating them as a fixed allowlist would stop valid implementation when source, test, configuration, migration, generated-code, or companion-file dependencies are discovered later.

## Proposed Outcome

`/to-spec` becomes the sole authority for classifying a Spec as Single-Issue or Multi-Issue. A Single-Issue Tracker Spec contains its own compact Implementation Plan and ends with a copy-ready `/execute-issue <Spec-ID>`. A Multi-Issue Spec sends only decomposition work to `/to-tickets`; each child Issue then contains its own compact plan, and only dependency-ready children receive execution commands.

Execution consumes the published classification. It may follow necessary source-grounded dependencies and record material plan deviations when Acceptance Criteria remain unchanged. Any change to behavior, Acceptance Criteria, target, exclusions, independent outcomes, or ambiguous ownership stops execution and returns to planning.

Closeout is a deterministic integration gate rather than a second execution workflow. `/close-issue` continues only when the current target is already an ancestor of the reviewed candidate recorded by the completion note. If the target has advanced beyond that candidate, closeout stops before merge, tests, review, or receipt mutation and returns the Issue to `/execute-issue` for refresh, verification, review, and a new completion note.

## User Outcomes

1. A planner can turn one cohesive product outcome into an executable Spec without creating artificial child tickets.
2. An implementer can change all source-grounded files required by the approved Acceptance Criteria without treating an initial path list as an allowlist.
3. A reviewer can trace every planned change and verification item back to stable Acceptance Criteria, while a closer can integrate a still-current candidate without unexpectedly rerunning the execution workflow.

## Acceptance Criteria

- **AC-1 — Authoritative classification:** `/to-spec` alone classifies the delivery shape. Single-Issue means one cohesive outcome that fits one Issue worktree, execution context, reviewed candidate, and closeout. Multi-Issue means multiple independently executable outcomes or blocking edges, or work that cannot fit one such cycle.
- **AC-2 — Bounded ambiguity:** When repository evidence is sufficient, classification is automatic. Only material ambiguity that could change routing permits one blocking question with a recommendation; uncertainty never defaults to Single-Issue or Multi-Issue.
- **AC-3 — Single-Issue plan:** A Single-Issue Spec body contains at most three non-authoritative User Outcomes, stable `AC-n` Acceptance Criteria, expected touchpoints, ordered implementation steps, and verification items. Every AC is covered by at least one step and one verification item, and every step covers at least one AC.
- **AC-4 — Tracker handoff:** Publishing a Single-Issue Tracker Spec ends with the exact copy-ready command `/execute-issue <Spec-ID>`. A tracker-backed local `.scratch` record is still a Tracker Spec and uses `/execute-issue`.
- **AC-5 — Multi-Issue decomposition:** A Multi-Issue parent contains only the overall outcome, cross-Issue constraints, and decomposition rationale. `/to-tickets` gives every child its own Acceptance Criteria, mapped Implementation Plan, verification, blocking edges, and planning baseline; it outputs `/execute-issue <Issue-ID>` only for the dependency-ready frontier.
- **AC-6 — Executor boundary:** `/execute-issue` consumes the published delivery classification and does not reclassify. It owns candidate refresh, verification, review, and completion-note replacement after target drift. `/implement` is limited to an approved Standalone Spec or explicitly requested direct current-branch work and is not the executor for a published Tracker Spec.
- **AC-7 — Discovery behavior:** Expected paths and symbols are non-exhaustive planning evidence, not an allowlist. Necessary discovery continues automatically; material plan deviation continues only when Acceptance Criteria and public behavior are unchanged and records a concise reason plus covered AC; scope change stops and returns to planning.
- **AC-8 — One compact traceability model:** User Stories are replaced by up to three User Outcomes for actor/value context. Acceptance Criteria are the sole done and traceability authority. Mapping uses inline `Covers: AC-n` references and a prompt-level pre-publication set check, without a parser or separate matrix.
- **AC-9 — Shorter coherent flow:** Duplicated routing and planning rules are removed from consumers. No new skill or dependency is introduced. The aggregate word count of `/ask-matt`, `/to-spec`, `/to-tickets`, `/execute-issue`, and `/close-issue` decreases from the current 6,125-word baseline; `/close-issue` decreases from its current 1,618 words; and no edited skill exceeds the repository's current 141-line maximum.
- **AC-10 — Documentation and regression safety:** Matching engineering docs and contract tests describe and enforce the same route. `close-issue` dirty-target protection, same-path/path-prefix collision stop, receipt read-back, partial-state recovery, exact worktree cleanup, and tracker closure remain intact. Unrelated dirty or untracked work remains unchanged.
- **AC-11 — Predictable closeout:** `/close-issue` continues only when the current target is already an ancestor of the completion-note candidate. Otherwise it stops before merge, verification, review, or receipt mutation; leaves the Issue and worktree intact; and outputs `/execute-issue <Issue-ID>` with the reason that target advancement requires candidate refresh and revalidation. After a new completion note, a later explicit `/close-issue` invocation applies the same gate again.

## Implementation Plan

Expected touchpoints are source-grounded starting points, not an allowlist:

- `CONTEXT.md`
- a new ADR after `docs/adr/0022-use-issue-native-execution-and-closeout.md`
- `skills/engineering/ask-matt/SKILL.md`
- `skills/engineering/to-spec/SKILL.md`
- `skills/engineering/to-tickets/SKILL.md`
- `skills/engineering/implement/SKILL.md`
- `skills/engineering/execute-issue/SKILL.md`
- `skills/engineering/close-issue/SKILL.md`
- affected `agents/openai.yaml` descriptions
- matching pages under `docs/engineering/`
- `tests/ron-workflow/skill-contracts.test.mjs`

### Step 1: Canonicalize the contract

Keep only durable vocabulary in `CONTEXT.md`. Add an ADR that supersedes the affected routing portions of ADR 0022 and owns publication shape, delivery shape, routing responsibility, ambiguity handling, discovery tiers, and the execution-versus-closeout refresh boundary. Preserve unrelated edits already present in ADR 0022. **Covers: AC-1, AC-2, AC-6, AC-7, AC-10, AC-11.**

### Step 2: Make `/to-spec` produce the execution contract

Replace extensive User Stories and open-ended Implementation Decisions with compact User Outcomes, stable Acceptance Criteria, expected touchpoints, ordered steps, verification items, and the inline mapping completeness check. Emit either the Single-Issue execution handoff or the Multi-Issue decomposition handoff. **Covers: AC-1, AC-2, AC-3, AC-4, AC-8.**

### Step 3: Make `/to-tickets` produce executable child Issues

Limit the parent to cross-Issue information. Define vertical, independently executable child slices; give each child its own mapped plan and planning baseline; and output commands only for unblocked frontier Issues. **Covers: AC-5, AC-8.**

### Step 4: Enforce execution and closeout responsibilities

Shorten `/ask-matt` to a routing map. Make `/implement` explicitly standalone/direct-current-branch only. Make `/execute-issue` trust the Tracker Spec classification, apply the three discovery tiers, and own refresh/revalidation after target drift. Make `/close-issue` use the target-ancestor gate and fail-fast handoff while retaining preservation, integration, recovery, cleanup, and closure safety. **Covers: AC-4, AC-6, AC-7, AC-9, AC-10, AC-11.**

### Step 5: Synchronize docs and lock the route with tests

Update only affected public descriptions and engineering pages. Replace tests that encode `/implement` as the general default with assertions for the new route, mapping completeness, frontier-only commands, Standalone Spec behavior, non-allowlist discovery, and fail-fast closeout on target drift. Measure the edited skill set against the size baseline. **Covers: AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11.**

## Verification

- Inspect the final skill and documentation diff for a single classification owner, absence of contradictory executor defaults, and no changed-candidate verification inside closeout. **Covers: AC-1, AC-2, AC-4, AC-5, AC-6, AC-10, AC-11.**
- Run `node --test tests/ron-workflow/skill-contracts.test.mjs`. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-10, AC-11.**
- Compare every published `AC-n` set with step and verification references; fail publication on missing or orphan references. **Covers: AC-3, AC-5, AC-8.**
- Exercise contract fixtures for both target-is-ancestor and target-advanced states; only the former may reach preservation and integration. **Covers: AC-6, AC-10, AC-11.**
- Recalculate skill word and line counts and confirm the stated bounds. **Covers: AC-9.**
- Run `git diff --check` and inspect `git status --short` to prove formatting and unrelated-work preservation. **Covers: AC-10.**

## Out of Scope

- Changing `close-issue` dirty-target preservation, collision, receipt, FAILED/RECONCILED recovery, cleanup, or tracker-closure safety after the entry gate.
- Adding a new skill, parser, dependency, or traceability artifact.
- Implementing the skill changes, invoking `/execute-issue`, pushing, merging, deploying, or cleaning unrelated work.
- Defining product-specific estimation, story points, or file-level allowlists.

## Execution Gate

This repository file is a publication source, not a second authority. After the GitHub Issue body, `ready-for-agent` label, mode, Planning Seal SHA, and seal state are read back successfully, the published Single-Issue Tracker Spec becomes executable through `/execute-issue <Spec-ID>` and is not eligible for `/implement`. Publication does not authorize push, remote merge, deployment, or unrelated cleanup.
