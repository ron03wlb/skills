# Decomposition plan for Spec #37

## Purpose

Publish four dependency-ordered, independently verifiable Issues for the approved Multi-Issue Spec "Simplify Ron workflow planning and enable concurrent Specs". This producer creates only tracker decomposition state and its own current workflow checkpoint evidence; it does not start a Run, implement a child, integrate, verify a delivery range, push, or install skills.

## Authority

- Repository: `github:ron03wlb/skills`
- Parent: `#37`
- Target: `features/ron`
- Post-Seal baseline: `7ca47376ec0476aad34fc016d93c8c169afed24b`
- Planning Seal: `41db4697bf67a6fc43ac301b0a253d621c11475b` (reused)
- Classification: `MULTI`
- Approved scope identity: `sha256:4a24bdc031871f8d8ad0e595305c217fc46222b5521859a875fe82b99b33a84d`
- Consumed handoff: `to-spec-handoff:v2:37:MULTI:sha256:4a24bdc031871f8d8ad0e595305c217fc46222b5521859a875fe82b99b33a84d`
- Consumed contribution record: `IC_kwDOTh5gv88AAAABSPuUWQ`
- Consumed publication: `github:issue:37:sha256:4a24bdc031871f8d8ad0e595305c217fc46222b5521859a875fe82b99b33a84d`

## Publication graph

| Order | Key | Title | Blocked by |
| --- | --- | --- | --- |
| 1 | `37/01` | Publish one Spec from an isolated planning lane | None; #38 is a completed foundation |
| 2 | `37/02` | Decompose Multi-Issue Specs without target plan checkpoints | `37/01` |
| 3 | `37/03` | Coordinate concurrent Spec Runs with bounded writer waits | `37/02` |
| 4 | `37/04` | Prove the installed concurrent workflow and push boundary | `37/03` |

The owned graph is the acyclic chain `37/01 -> 37/02 -> 37/03 -> 37/04`. Publish blockers before dependants. GitHub renders body blocker keys as the resolved Issue references and records native sub-issue and dependency relations after each Issue is created.

## Canonical child contracts

### 37/01 - Publish one Spec from an isolated planning lane

## Parent

#37

## Decomposition key

`37/01`

## What to build

Publish one Tracker Spec from one isolated Spec workflow lane. One Codex task owns one planning worktree for exactly one proposed Spec and target, `grill-with-docs` records accepted planning decisions there, and `to-spec` publishes through optimistic baseline revalidation without creating a target-branch operational plan checkpoint or prospective `direct_target_contribution:v1` evidence.

## Acceptance Criteria

- **AC-1 - Isolated concurrent planning lanes:** Each `grill-with-docs` invocation binds one proposed Tracker Spec and target to one isolated planning worktree owned by its Codex task. Two lanes may grill and prepare publication against the same target without a shared planning checkout, global workflow lock, or cross-lane state mutation.
- **AC-2 - Optimistic Planning baseline revalidation:** Before publication or a Planning Seal write, the lane re-reads only relevant glossary, ADR, and source facts. Compatible target movement binds the latest baseline; relevant semantic drift returns a Recoverable blocker for renewed human confirmation. Only accepted glossary or ADR changes may enter one scoped Planning Seal write under the shared target writer.
- **AC-3 - Minimal Spec producer authority:** Ordinary `to-spec` publication uses an exact operation-scoped producer transaction and concrete tracker/checkpoint/handoff adapters, but creates no target operational-plan file or commit and no prospective contribution comment. It publishes the canonical Single- or Multi-Issue body and appends one durable read-back handoff; existing valid incomplete legacy/profile-v1 operations retain frozen exact-resume behavior.
- **AC-4 - Seam-local recovery and synchronized interface:** Entry and mutation checks are explicitly Hard gate, Recoverable blocker, or advisory. Every Recoverable blocker names the owning source, observed evidence, smallest human action, preserved stages, and same `/grill-with-docs` or `/to-spec` retry; there is no generic repair, resume, or force command. Public skill instructions, focused internal references, metadata, docs, router text, and contract tests remain synchronized in English.

## Implementation Plan

### Step 1: Give the planning lane one explicit lifecycle

Update `skills/engineering/grill-with-docs/SKILL.md`, `skills/engineering/domain-modeling/SKILL.md`, their focused references where useful, and `docs/engineering/grill-with-docs.md` so worktree ownership, one-Spec scope, concurrent-lane isolation, accepted-decision writes, and disposal/handoff boundaries are explicit and testable. **Covers: AC-1, AC-2, AC-4.**

### Step 2: Add the minimal current Spec producer profile

Extend `skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs` only with the purpose-specific current profile needed by ordinary Spec publication, leaving existing transaction-v1 and producer-profile-v1 receipts and exact retries unchanged. Update `skills/engineering/to-spec/SKILL.md` and focused internal producer/adapter references so planning seal, publication, and handoff stages have concrete owning-source reads without target operational-plan or prospective-attestation stages. **Covers: AC-2, AC-3, AC-4.**

### Step 3: Keep the public route and recovery boundary small

Synchronize `skills/engineering/to-spec/references/*.md`, `docs/engineering/to-spec.md`, `skills/engineering/ask-matt/SKILL.md`, affected invocation metadata and README summaries, and `tests/ron-workflow/skill-contracts.test.mjs`. Test two planning lanes, compatible and conflicting target movement, seal serialization, fresh publication, exact retry, and unchanged legacy resume. **Covers: AC-1, AC-2, AC-3, AC-4.**

## Verification

- Run `rtk node --test --test-name-pattern="grill-with-docs|planning lane|Planning baseline|to-spec|same-command" tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`; require the focused lane, profile, publication, handoff, and recovery cases to pass. **Covers: AC-1, AC-2, AC-3, AC-4.**
- Run `rtk node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`; require the immediate producer and frozen legacy contracts to remain green. **Covers: AC-3, AC-4.**
- Run `rtk git diff --check` and inspect the baseline-to-candidate diff plus isolated fixtures to prove no operational plan commit, prospective contribution comment, shared planning checkout, or generic bypass was added. **Covers: AC-1, AC-2, AC-3, AC-4.**

## Blocked by

None. Issue #38 is a completed prerequisite consumed as foundation, not an open blocker.

## Planning baseline

- Commit: 41db4697bf67a6fc43ac301b0a253d621c11475b
- Seal: reused

## Target

features/ron

### 37/02 - Decompose Multi-Issue Specs without target plan checkpoints

## Parent

#37

## Decomposition key

`37/02`

## What to build

Decompose one published Multi-Issue Spec through a minimal `to-tickets` producer that consumes the exact `to-spec` handoff, reconciles canonical child contracts and tracker-native relations, and emits one durable composite Run handoff without creating a target-branch operational plan checkpoint or prospective contribution evidence.

## Acceptance Criteria

- **AC-1 - Exact upstream consumption with operation isolation:** `to-tickets` consumes the exact current `to-spec` handoff, parent body, target, Planning Seal, Multi-Issue classification, and approved-scope identity from owning-source read-back. Its producer transaction is scoped by repository, Spec, producer, and opaque operation identity, so unrelated operations on the same target neither conflict nor block.
- **AC-2 - Minimal decomposition producer:** Ordinary decomposition uses a purpose-specific current transaction profile and concrete checkpoint/tracker/handoff adapters with no target operational-plan file or commit and no prospective `direct_target_contribution:v1` comment. Existing valid incomplete legacy/profile-v1 operations keep frozen exact-resume behavior.
- **AC-3 - Canonical reconciliation and ready frontier:** The producer preserves complete Decomposition-key preflight, blocker-first creation, exact child body and native parent/dependency read-back, conflict and duplicate stops, partial-publication reuse, one `decomposition:v1` record, and ready-label derivation from published blockers only.
- **AC-4 - Composite handoff and same-command recovery:** After decomposition and ready-state read-back, one durable handoff binds the upstream publication, operation receipt, exact decomposition record identity/digest, mapping, blocker edges, parent, target, Planning Seal, classification, and approved scope. Recoverable failures report owning source, smallest human action, preserved stages, and the same `/to-tickets` retry; the only next route is `/run-issue-workflow <Spec-ID>`.

## Implementation Plan

### Step 1: Consume the minimal Spec publication interface

Update `skills/engineering/to-tickets/SKILL.md` and a focused internal adapter reference so the producer reads the immediate upstream handoff and operation-scoped state once, classifies only its own input and mutation preconditions, and does not rerun `to-spec` generation or validation. **Covers: AC-1, AC-4.**

### Step 2: Add the minimal current decomposition profile

Extend `skills/personal/run-issue-workflow/scripts/workflow-control-store.mjs` with the purpose-specific current decomposition profile while freezing existing receipts and producer-profile-v1 retry behavior. Remove ordinary plan/checkpoint/attestation stages from `to-tickets` and retain idempotent publication receipts in Git common-dir state. **Covers: AC-1, AC-2, AC-4.**

### Step 3: Preserve tracker reconciliation and publish one handoff

Keep canonical child rendering, native sub-issue/dependency relations, partial-publication recovery, decomposition record, and ready frontier in the producer-owned interface; then emit the concrete composite handoff consumed by Run. Synchronize `docs/engineering/to-tickets.md`, `skills/engineering/ask-matt/SKILL.md`, affected metadata/README summaries, and focused contract fixtures. **Covers: AC-3, AC-4.**

## Verification

- Run `rtk node --test --test-name-pattern="to-tickets|operation isolation|decomposition|ready frontier|composite handoff" tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`; require focused upstream, profile, reconciliation, partial retry, and handoff cases to pass. **Covers: AC-1, AC-2, AC-3, AC-4.**
- Run `rtk node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/run-issue-workflow-core.test.mjs`; require immediate producer and frozen legacy contracts to remain green. **Covers: AC-2, AC-3, AC-4.**
- Run `rtk git diff --check` and inspect tracker fixture histories to prove no operational-plan commit, prospective contribution comment, duplicate child, inferred relation, or child execute route remains. **Covers: AC-1, AC-2, AC-3, AC-4.**

## Blocked by

Decomposition key `37/01` (render as its resolved tracker Issue reference).

## Planning baseline

- Commit: 41db4697bf67a6fc43ac301b0a253d621c11475b
- Seal: reused

## Target

features/ron

### 37/03 - Coordinate concurrent Spec Runs with bounded writer waits

## Parent

#37

## Decomposition key

`37/03`

## What to build

Run one dependency DAG per Spec while allowing separate Spec Runs and their dependency-ready Issues to execute concurrently. Serialize only actual target integration: healthy writer contention waits within a bounded coordinator state, then reacquires current closeout evidence before mutation.

## Acceptance Criteria

- **AC-1 - Per-Spec Run isolation:** Each explicit `/run-issue-workflow <Spec-ID>` owns one runtime instance, one coordinator task, one durable Run identity, and its own `max_parallel`. Separate Spec Runs on the same target may remain active without a process-global runtime guard, global queue, shared execution slot pool, or multi-Spec coordinator.
- **AC-2 - Concrete handoff and authority adapters:** Runtime composition provides repository-owned adapters for producer handoff, checkpoint read-back, tracker/decomposition state, target state, and shared-writer access. Callers do not invent `handoff.read` or reproduce upstream validation; only exact owning-source read-back may authorize Run entry or closeout.
- **AC-3 - Bounded healthy writer wait:** A readable healthy target-writer owner changes closeout contention into a bounded journaled wait that consumes no Issue execution slot and does not stop unrelated Issue work. After release, the coordinator reacquires target, tracker, candidate, completion, control-revision, and Grant evidence before integration or Issue closure.
- **AC-4 - Fail-closed exceptional recovery:** Unknown writer ownership, wait timeout, coordinator loss, merge conflict, or changed evidence never steals a lease or mutates stale state. It returns a Recoverable blocker/operator packet with owning source, evidence, smallest human action, preserved Run/Issue stages, and same `/run-issue-workflow` retry; Hard gates remain limited to mutation identity and durable-state safety.

## Implementation Plan

### Step 1: Make runtime instances and adapters explicit

Update `skills/personal/run-issue-workflow/scripts/run-workflow.mjs` and narrow adjacent adapter modules so the one-active-run guard is instance-local, repository-owned adapter construction is concrete, and two runtime instances can select distinct Specs on the same target without sharing coordinator state. **Covers: AC-1, AC-2.**

### Step 2: Model target-writer waiting as coordinator state

Extend `run-core.mjs`, `run-coordinator.mjs`, and `run-store.mjs` with bounded healthy-owner wait/reconcile transitions. Keep ready Issue execution outside the wait, release no writer owned by another Run, and force full evidence reacquisition after the writer becomes available. **Covers: AC-1, AC-3, AC-4.**

### Step 3: Synchronize operator behavior and focused concurrency tests

Update the personal `SKILL.md`, `OPERATOR.md`, personal README/metadata, and `tests/ron-workflow/run-issue-workflow-core.test.mjs`, `run-issue-workflow-coordinator.test.mjs`, and `run-issue-workflow-end-to-end.test.mjs`. Cover two concurrent Runs, per-Run `max_parallel`, healthy release, timeout, owner ambiguity, coordinator loss, control revision drift, and post-wait evidence change. **Covers: AC-1, AC-2, AC-3, AC-4.**

## Verification

- Run `rtk node --test --test-name-pattern="multiple Runs|runtime instance|handoff adapter|writer wait|closeout contention|coordinator loss" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`; require the focused concurrency and recovery cases to pass. **Covers: AC-1, AC-2, AC-3, AC-4.**
- Run `rtk node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/run-issue-workflow-end-to-end.test.mjs`; require the existing one-Run lifecycle and new cross-Run cases to remain green. **Covers: AC-1, AC-3, AC-4.**
- Run `rtk git diff --check` and inspect journal/adapter call logs to prove only target integration is serialized, waiting consumes no Issue slot, and every post-wait mutation uses freshly reacquired authority. **Covers: AC-2, AC-3, AC-4.**

## Blocked by

Decomposition key `37/02` (render as its resolved tracker Issue reference).

## Planning baseline

- Commit: 41db4697bf67a6fc43ac301b0a253d621c11475b
- Seal: reused

## Target

features/ron

### 37/04 - Prove the installed concurrent workflow and push boundary

## Parent

#37

## Decomposition key

`37/04`

## What to build

Prove the installed Ron workflow as one consumer-visible route across two concurrent Spec lanes and two per-Spec Runs, while keeping setup diagnostic-only, public skills shallow at their owned interfaces, recovery same-command, aggregate verification range-based, and push a separate exact-receipt action.

## Acceptance Criteria

- **AC-1 - Diagnostic setup and installed adapters:** `setup-matt-pocock-skills` installs or verifies the configured tracker, labels, operation-scoped producer store, concrete handoff/target/writer adapters, and required skill surfaces without becoming authority for a later operation. Missing seams are actionable diagnostics; aggregate setup health is never a publication, execution, integration, verification, or push gate.
- **AC-2 - Deep, decoupled skill interfaces:** User-facing `grill-with-docs`, `to-spec`, `to-tickets`, `run-issue-workflow`, `verify-target-before-push`, and `push-target` retain invocation, human authority transitions, major owned gates, operator result, and next route. Schemas, adapter payloads, and detailed recovery mechanics move behind focused references/modules based on responsibility, not Markdown line count; no generic repair or force bypass is added.
- **AC-3 - Consumer-visible concurrent route:** One end-to-end scenario proves two isolated lanes on one moving target, independent producer operations, Multi-Issue decomposition where applicable, concurrent dependency-ready Issues across separate Runs, bounded healthy writer wait, serialized integration, and same-command recovery after a human fixes one owning source. A blocked lane does not prevent valid work in the other lane.
- **AC-4 - Aggregate verification and explicit push boundary:** Existing `verify-target-before-push` freezes the reachable closed-member local-ahead range, excludes open unreachable candidates, and requires every reachable member to remain closed, covered, reviewed, and verified. Later target movement invalidates `push_ready`; only a separate explicit `push-target` consumes the exact receipt-bound target. No Issue child, Run, setup action, or advisory pushes automatically.

## Implementation Plan

### Step 1: Add read-only installed-seam diagnostics

Update `skills/engineering/setup-matt-pocock-skills/SKILL.md`, its tracker/setup references, and `docs/engineering/setup-matt-pocock-skills.md` so installed producer/handoff/target/writer adapters are discoverable and diagnosable without authorizing another skill's mutation. Add exact missing-source guidance only. **Covers: AC-1, AC-2.**

### Step 2: Deepen skill internals behind stable public interfaces

Refactor affected skill instructions into focused references or runtime modules while keeping public invocation and authority transitions visible. Synchronize `skills/engineering/ask-matt/SKILL.md`, public docs, invocation metadata, promoted README/plugin entries where behavior text changes, and personal workflow docs without promoting the personal package. **Covers: AC-1, AC-2.**

### Step 3: Add one cross-seam installed-route fixture

Extend `tests/ron-workflow/skill-contracts.test.mjs`, workflow-control-store tests, and Run end-to-end fixtures with two concurrent Spec lanes and separate Runs on the same target. Assert independent operation keys, continued ready Issue work during writer wait, serialized closeout, post-wait evidence reacquisition, one human repair followed by same-command retry, and no cross-lane mutation. **Covers: AC-1, AC-2, AC-3.**

### Step 4: Preserve the aggregate verifier-to-push receipt contract

Add focused integration coverage around `skills/engineering/verify-target-before-push/SKILL.md`, `skills/engineering/push-target/SKILL.md`, their docs, and existing verifier/push tests. Exercise reachable closed members, open unreachable candidates, target movement invalidation, and exact receipt consumption without changing membership or remote-delivery semantics. **Covers: AC-3, AC-4.**

## Verification

- Run `rtk node --test --test-name-pattern="installed route|concurrent Spec|operation isolation|writer wait|same-command|push_ready" tests/ron-workflow/*.test.mjs`; require the single cross-seam scenario and its exceptional branch to pass. **Covers: AC-1, AC-2, AC-3, AC-4.**
- Run `rtk node --test tests/ron-workflow/*.test.mjs`; require the complete Ron workflow suite to pass once at this integration boundary. **Covers: AC-1, AC-2, AC-3, AC-4.**
- Run `rtk git diff --check` and inspect installed skill links, public routing text, adapter call logs, the frozen verification range, and push receipt read-back. Require no duplicate upstream validation, global coordinator, generic bypass, or automatic push. **Covers: AC-1, AC-2, AC-3, AC-4.**

## Blocked by

Decomposition key `37/03` (render as its resolved tracker Issue reference).

## Planning baseline

- Commit: 41db4697bf67a6fc43ac301b0a253d621c11475b
- Seal: reused

## Target

features/ron

## Publication and verification

1. Preflight all four keys across issue bodies and tracker-native parent/dependency sources; require zero matches or one exact reusable match per key.
2. Create only missing children in graph order. After each create, add parent #37 and the resolved native blocker relation, then read the full body and native relations back exactly.
3. Append or reuse one exact `decomposition:v1` parent comment with the final key mapping and owned blocker edges; read its comment identity and exact-body SHA-256 back.
4. Apply `ready-for-agent` only to the open dependency-ready frontier. Initially that is `37/01`; all later children remain unlabelled while blocked.
5. Append and read back one composite `handoff.completed`, then end at `/run-issue-workflow #37`.
