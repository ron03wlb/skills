# Task Plan: Add `pre-execute-issue`

## Goal

Design, confirm, implement, and verify a promoted generic `pre-execute-issue` skill plus a one-time `setup-pre-execute-issue` adoption skill. Runtime preparation pauses for manual external actions and hands a verified `READY` state to `execute-issue`; setup installs only the minimal repository-owned resolver contract without performing external mutations.

## Current Phase

Published Multi-Issue Spec; awaiting `/to-tickets #2`

## Phases

### Phase 1: Requirements and repository discovery

- [x] Read the supplied handoff and repository instructions.
- [x] Confirm the current branch and preserve unrelated dirty work.
- [x] Inspect current workflow, domain glossary, ADRs, docs, packaging, and contract tests.
- [x] Resolve the first blocking design decision with the user.
- **Status:** completed

### Phase 2: Shared-understanding design

- [x] Walk the design tree one blocking question at a time.
- [x] Update the glossary as terms become stable.
- [x] Record only durable, hard-to-reverse trade-offs as ADRs.
- [x] Obtain explicit confirmation that shared understanding has been reached.
- **Status:** completed

### Phase 3: Child decomposition and implementation plans

- [ ] Invoke `/to-tickets #2` to publish independently executable child contracts and blockers.
- [ ] Create the required High-risk implementation plan after design confirmation.
- [ ] Define focused contract tests for lifecycle, fail-closed behavior, legacy fallback, and promotion parity.
- [ ] Review the intended file and hunk scope against unrelated dirty work.
- **Status:** pending

### Phase 4: Minimal implementation

- [ ] Add both promoted skills and invocation metadata.
- [ ] Keep `setup-pre-execute-issue` limited to explicit, one-time repository adoption.
- [ ] Integrate the smallest repository adapter interface and `execute-issue` handoff.
- [ ] Synchronize router, docs, READMEs, manifest, and contract tests.
- **Status:** pending

### Phase 5: Verification and delivery

- [ ] Run focused contract tests and repository-prescribed validation.
- [ ] Apply the High-risk claim-to-evidence completion gate.
- [ ] Review the exact final diff and confirm unrelated dirty work is preserved.
- [ ] Report deliverables without committing or pushing unless separately authorized.
- **Status:** pending

## Key Questions

1. Does `pre-execute-issue` own preparation of repository-declared prerequisite artifacts, or only verify artifacts prepared elsewhere?
2. What is the smallest durable receipt interface shared by `pre-execute-issue` and `execute-issue`?
3. Where does the repository declare its prerequisite adapter and how is absence represented?
4. Which candidate changes invalidate a `READY` receipt?
5. Must `pre-execute-issue` always share the later `execute-issue` worktree and topic branch?
6. When optional prerequisite inspection is skipped, must `execute-issue` independently discover required prerequisites and fail closed?

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep the generic skill consumer-agnostic. | Consumer policy names, database products, capacity, platforms, and timeouts belong to repository adapters. |
| Do not implement until shared understanding is explicitly confirmed. | Required by `grilling`; the handoff also identifies an unresolved ownership decision. |
| Preserve all pre-existing modified and untracked paths. | They are unrelated user work; `docs/adr/0022...` may overlap and therefore requires hunk-level care. |
| `pre-execute-issue` owns bounded prerequisite artifact preparation. | Some repositories need an artifact such as SQL prepared before a human applies it; the skill stops if preparation requires the remaining product implementation. |
| `pre-execute-issue` is optional and user-invoked after the Spec or child Issue is written. | The human chooses whether to inspect for SQL or another repository prerequisite; the skill is not inserted as a mandatory delivery stage. |
| `execute-issue` independently discovers required prerequisites and fails closed when required evidence is absent or stale. | Optional invocation must not allow dependent implementation to proceed against an unapplied prerequisite; discovery stays read-only and never auto-invokes or mutates. |
| Repository instructions declare the repository-owned prerequisite resolver. | This reuses an existing discovery seam, keeps full consumer rules local, treats absence as `NOT_REQUIRED`, and fails closed when a declared resolver is unusable. |
| One resolver command exposes `discover`, `prepare`, and `verify`. | A small declaration surface still separates read-only Entry discovery, bounded artifact writes, and read-only post-manual verification. |
| Canonical prerequisite receipts are minimal append-only Issue comments or terminal states. | Existing trackers support append/read-back; one read-back per recovery-relevant transition preserves resume and stale safety without a parallel state system. |
| Both skills share resolver `discover`; `prepare` must repair and revalidate the prerequisite artifact before handoff. | One detection implementation avoids drift, and invalid SQL must never reach the human manual-action gate. |
| Author the promoted skill and all synchronized public/contract surfaces in English. | The user explicitly requires English skill content; repository source and existing promoted documentation are English. |
| Limit prerequisite artifact repair to five material waves per invocation. | Count only waves where a confirmed validation failure causes an artifact edit; invalid artifacts never reach `WAITING_MANUAL`, and wave five still failing blocks. |
| Create or reuse the shared Issue worktree only after `discover` returns `REQUIRED`. | No-SQL and discovery-blocked paths stay write-free; a validated artifact is committed alone and later execution reuses the same identity chain. |
| Bind `READY` to the protected prerequisite identity rather than the evolving candidate `HEAD`. | Artifact, resolver/policy, manual target, and ancestry drift invalidate readiness; later implementation commits do not cause redundant SQL execution or verification. |
| Run authoritative prerequisite discovery after Spec/child Issue publication and before worktree creation. | Complete scope and repository evidence are available, both entry paths share one verdict, and `/to-spec` remains free of consumer SQL logic. |
| Persist only `WAITING_MANUAL` and `READY` prerequisite receipts. | These are the only cross-session milestones; discovery and failure results stay transient and produce no tracker noise. |
| Require one repository-defined read-only target verification for `READY`. | Human attestation is insufficient, but SQL replay, polling, and full-suite verification would exceed the minimal safety need. |
| Pause and classify late prerequisite discovery. | Unchanged scope preserves checkpoints and uses the same-worktree pre-flow; changed schema outcome or acceptance returns to planning before dependent verification. |
| Fix resolver semantics while leaving transport and schema repository-owned. | Exact executable commands and machine-readable required evidence are mandatory, but a universal resolver or schema engine would add unnecessary framework cost. |
| Add `setup-pre-execute-issue` as the one-time adoption owner. | An explicit setup skill may write the consumer repository's minimal instructions, policy, resolver, and fixture; it is not a router and never performs runtime SQL, Issue, or database actions. |
| Make prerequisite resolver adoption atomic. | If a complete, validated `discover`/`prepare`/`verify` contract cannot be established, setup leaves no active declaration or placeholder resolver and reports the missing evidence instead. |
| Keep repositories without concrete manual prerequisites unchanged. | They skip setup, declare no resolver, and continue directly through `execute-issue` with the legacy `NOT_REQUIRED` result. |

## Errors Encountered

| Error | Attempt | Resolution |
|-------|---------|------------|
| None | 1 | N/A |
| `rg` rejected wildcard filenames passed as literal positional paths on Windows. | 1 | Use a directory plus `--glob` or explicit file paths. |
| A multi-file `apply_patch` used a stale `progress.md` context. | 1 | Re-read exact files and apply smaller verified hunks; no partial change occurred. |

## Notes

- `grill-with-docs` is active: ask one question at a time and write resolved domain terms immediately.
- `ponytail` is active: prefer one small repository adapter interface and no generic schema engine, database runner, or speculative state-machine framework.
- Planning files are session artifacts; determine their delivery status during final diff review.
- Primary Multi-Issue Tracker Spec: https://github.com/ron03wlb/skills/issues/2
- Planning Seal: `c6c87caf9337d5d28ea2a395751727093447cf08` (`created`).
