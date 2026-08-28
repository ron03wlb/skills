# Findings & Decisions: `pre-execute-issue`

## Requirements

- Add a generic promoted `pre-execute-issue` skill in `C:\Workspace\open_source\skills`.
- Add a generic promoted `setup-pre-execute-issue` skill for explicit one-time consumer-repository adoption.
- Prepare and verify repository-declared prerequisites for exactly one tracker Issue before `execute-issue`.
- Pause before manual or external mutation; the skill must not perform that mutation.
- Persist and read back non-sensitive receipts, then hand only a valid `READY` state to `execute-issue`.
- Preserve the legacy `execute-issue` path when a repository declares no prerequisites.
- Fail closed on missing, stale, mismatched, unreadable, or unenforceable prerequisite evidence.
- Keep consumer-specific execution policy, database, OS, resource lane, capacity, and timeout details outside the generic skill.
- Maintain promoted-skill parity across skill metadata, docs, router, READMEs, manifests, and contract tests.
- Do not modify consumer repositories, tracker Issues, databases, or other external state.
- Write the new skill, metadata, synchronized docs, router text, and contract-test descriptions in English.
- Publish the settled aggregate as a Multi-Issue parent because runtime prerequisite handling and repository adoption are independently executable outcomes with a blocking edge.

## Research Findings

- Repository instructions classify promoted skills under `skills/engineering` or `skills/productivity`; promoted changes require docs, root and bucket README entries, Claude plugin manifest parity, `ask-matt` routing, and contract validation.
- The supplied handoff recommends a five-state generic lifecycle: `NOT_REQUIRED`, `PREPARED`, `WAITING_MANUAL`, `READY`, `BLOCKED`.
- The handoff identifies artifact ownership as the first blocking decision and recommends preparation plus static/read-only validation, stopping if reliable preparation would require product implementation.
- `execute-issue` currently owns one Issue implementation/review in a dedicated worktree and ends at a clean candidate; `close-issue` separately integrates and closes.
- Current worktree state matches the handoff snapshot: `features/ron`, one modified ADR, and unrelated untracked files under `superpowers/docs`.
- `docs/adr/0022-use-issue-native-execution-and-closeout.md` may overlap workflow routing, so any later edit must preserve existing user hunks.
- The earlier generic execution-policy handoff establishes a related but distinct repository-defined policy catalog: repository owns policy/resource semantics and enforcement; generic workflow owns discovery, reference validation, fail-closed enforcement, and non-sensitive receipts.
- That earlier handoff did not authorize implementation and left policy discovery schema unresolved. The current request authorizes designing a new skill, while `grill-with-docs` still requires explicit shared-understanding confirmation before implementation.
- Existing `CONTEXT.md` already distinguishes `Issue worktree`, `Planning Seal`, execution completion evidence, and closeout receipts; prerequisite receipt terminology must avoid collapsing those concepts.
- Repository search found no existing `pre-execute-issue` or generic prerequisite lifecycle implementation.
- ADR-0023 supersedes ADR-0022's routing and closeout decisions. The pre-existing ADR-0022 edit is unrelated preservation-receipt work and should not be extended for this feature.
- Current `execute-issue` creates or reuses the Issue worktree from the execution baseline, treats migration companions as possible Necessary discovery, owns coherent candidate commits, and records the final candidate. A pre-execution artifact owner therefore changes the beginning of the candidate identity chain and must be explicit.
- Current routing is `to-spec` or `to-tickets` directly to `execute-issue`; adding `pre-execute-issue` requires conditional routing rather than making every repository produce empty prerequisite state.
- Current `execute-issue` is explicit-only and its human-facing docs promise implementation from Planning Seal through candidate; the new seam must update both the skill contract and public route wording.
- The repository has no current general workflow-config host. Its active setup pattern uses small `docs/agents/*.md` authorities plus repository instructions, while the old Ron workflow configuration is intentionally retired from generic Issue delivery.
- Reintroducing a universal `execution` configuration object would create a new generic configuration subsystem; the smaller existing seam is a repository instruction that points to a repository-owned resolver.
- Every currently supported tracker exposes appendable, readable Issue comments: GitHub comments, GitLab notes with stable IDs, and local Markdown `## Comments`; repository guidance already requires mutation read-back.
- An append-only Issue receipt can therefore reuse the existing tracker abstraction, while a repository file would incorrectly mix environment-specific manual-action state into the candidate source tree.

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Treat prerequisite handling as a distinct lifecycle seam pending user confirmation. | It can pause and resume independently of product implementation and has separate external-action authority. |
| Keep the adapter repository-declared rather than generic-domain-aware. | The generic module should expose a small interface while repositories own their concrete prerequisite semantics. |
| Defer implementation. | `grilling` forbids enacting the plan before explicit shared-understanding confirmation. |
| Add only already-confirmed prerequisite vocabulary to `CONTEXT.md`. | Artifact ownership, adapter discovery, and candidate mutation remain unresolved and were deliberately excluded. |
| Let `pre-execute-issue` prepare repository-declared prerequisite artifacts under a narrow stop rule. | The user confirmed some repositories need SQL functionality manually applied first; verify-only would leave artifact creation unowned, while product implementation remains `execute-issue` work. |
| Keep `pre-execute-issue` an optional user-invoked inspection after Spec publication. | The user decides whether to check for SQL generation/manual execution; `to-spec` delivery classification remains unchanged. |
| Keep optional invocation safe with a read-only `execute-issue` Entry gate. | The user agreed that missing or stale required prerequisite evidence stops execution and points to `pre-execute-issue`, without automatic invocation or mutation. |
| Use repository instructions to discover a repository-owned prerequisite resolver. | The user accepted the smallest existing seam instead of adding a universal workflow config; missing declaration means `NOT_REQUIRED`, while a broken declaration blocks. |
| Standardize one resolver command with three operations. | The user accepted `discover`, `prepare`, and `verify` so `execute-issue` can stay read-only while `pre-execute-issue` owns the bounded prepare/resume lifecycle. |
| Use append-only tracker comments as canonical receipts, but keep the lifecycle minimal. | The user selected option A and explicitly rejected extra verification whose cost could exceed implementation; no generic receipt engine, polling, or duplicate read-backs. |
| Share resolver `discover` and gate handoff on repository-defined artifact validation. | The user chose one detection implementation for both skills and requires SQL syntax/static failures to be repaired until valid before delivery. |
| Cap prerequisite artifact repair at five material waves per invocation. | The user selected five; initial generation, no-edit retries, and tool failures do not consume a wave, while a fifth failed repair blocks handoff. |
| Share one Issue worktree and create it lazily only for `REQUIRED`. | The user accepted one worktree/topic branch and a validated prerequisite-only commit; `NOT_REQUIRED` and discovery-time blockers must not create empty worktrees. |
| Bind `READY` narrowly to prerequisite identity. | The user accepted exact prerequisite commit/path/hash, resolver/policy, non-sensitive manual target, and ancestry checks while allowing later candidate commits without revalidation. |
| Make post-publication `discover` the authoritative need decision. | The user selected A: proactive pre-execution and direct execution Entry call the same resolver before worktree creation; planning hints are non-authoritative. |
| Persist only `WAITING_MANUAL` and `READY`. | The user formally accepted two durable receipts; `NOT_REQUIRED`, `REQUIRED`, and `BLOCKED` remain transient resolver results. |
| Gate `READY` with one read-only target check. | The user requires repository-defined outcome verification after manual execution; failure preserves `WAITING_MANUAL` without a failure receipt or heavy revalidation. |
| Stop and classify late prerequisite discovery. | The user accepted same-worktree recovery for unchanged scope and mandatory replanning when schema outcome or acceptance changes, with no auto-invocation or rollback. |
| Standardize resolver semantics, not transport. | The user accepted repository-declared executable invocations and machine-readable evidence while rejecting a universal config, resolver, or JSON schema engine. |
| Give repository adoption to `setup-pre-execute-issue`. | The user wants a skill, not manual advice or a revived `ask-ron`; explicit invocation authorizes only minimal repo-local instructions, policy, resolver, and fixture changes, followed by safe validation and stop. |
| Require atomic adoption. | The user rejected partial enablement: missing validation, verification, or repository evidence stops setup without leaving an active instruction declaration, placeholder resolver, or TODO contract. |
| Make setup a no-op when no concrete manual prerequisite exists. | The user confirmed repositories without SQL or another manual prerequisite do not invoke setup and may execute Issues directly; absence remains the compatible `NOT_REQUIRED` route. |
| Classify the Tracker Spec as Multi-Issue. | The runtime lifecycle and `execute-issue` gate define the upstream semantic contract; the separately reviewable setup skill consumes that contract and may be adopted independently. |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Existing dirty ADR may overlap future routing documentation. | Inspect its current source and diff before proposing or applying any hunk. |
| PowerShell/Windows `rg` rejected wildcard filenames supplied as positional paths. | Use the containing directory with `--glob` or explicit filenames. |
| A broad `apply_patch` failed because one `progress.md` context line did not match. | Re-read the exact files and split the edit into smaller hunks; the failed patch was atomic. |

## Resources

- `C:\Users\ron.chang\AppData\Local\Temp\pre-execute-issue-skill-handoff-2026-08-27.md`
- `C:\Users\ron.chang\AppData\Local\Temp\generic-execution-policy-handoff-2026-08-26.md`
- `C:\Workspace\open_source\skills\CLAUDE.md`
- `C:\Workspace\open_source\skills\CONTEXT.md`
- `C:\Workspace\open_source\skills\skills\engineering\execute-issue\SKILL.md`
- `C:\Workspace\open_source\skills\tests\ron-workflow\skill-contracts.test.mjs`
- `https://github.com/ron03wlb/skills/issues/2`

## Visual/Browser Findings

- None.
