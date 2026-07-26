# Matt-first Issue Delivery Workflow Spec

**Status:** Core seven-skill Ron flow and Canonical Wiki v1 are locally implemented. `/wiki`, shared contracts, reconciliation-ledger enforcement, bounded clean-path delegation, and the exact pre-implementation baseline commit have focused and temporary-repository evidence. Codex-native packaging review passed; Claude CLI is not a validation dependency. The implementation is not installed, staged, committed, pushed, or published.

## Purpose

Define a development workflow that keeps Matt Pocock's idea-to-ship flow as the visible backbone while adding explicit Issue authorization, resumable context, execution-lane isolation, bounded subagent orchestration, and evidence-based closeout.

The workflow should complete one Issue at a time with minimal human interruption, preserve reliable cross-session state in the Issue tracker, and reserve enough context for review and verification.

## Source authority

This workflow preserves three distinct product authorities:

1. **Wiki** — reviewed current business-knowledge baseline.
2. **Change Spec comment** — append-only Issue comment containing the historical contract for the intended change; it may explicitly override the Wiki.
3. **Code and tests** — implementation evidence; they cannot silently redefine either authority.

Authorization is a fourth, separate Issue-comment record. This workflow spec defines how work moves between those authorities. It does not authorize a product change by itself.

The Taiwan stock-selection Umbrella Spec at
`/Users/ron/Documents/Workspace/obsidian_daily/35_AGENTS/hermes-workspaces/stocks/docs/matt/specs/2026-07-12-taiwan-stock-selection-system-design.md`
is the reference example for separating Umbrella coordination, Child execution, implementation claims, operational claims, and historical-validation claims.

## Goals

- Keep Matt's main flow recognizable.
- Execute and close one bounded Issue at a time.
- Allow sequential Leaf Issues to reuse one isolated worktree safely.
- Minimize repeated human approvals without allowing authorization to become implicit.
- Make authorization recoverable and revocable across sessions.
- Keep Issue context small, rebuildable, and independent of conversation history.
- Use subagents only when they improve speed, context isolation, or independent review.
- Preserve distinct proof states for commit, integration, push, deployment, and live validation.
- Keep per-Issue specs and decision-process artifacts out of the repository after closeout.

## Non-goals

- Do not invoke or depend on Superpowers skills.
- Do not introduce a competing product-spec authority.
- Do not create a generic agent framework or a large user-facing skill stack.
- Do not parallelize writable Leaf Issues.
- Do not automatically push, merge a remote pull request, deploy, delete a branch, remove legacy data, or perform live provider actions.
- Do not treat labels, plans, test output, or code-review approval as execution authorization.
- Do not retain a repository copy of each feature's Change Spec when the canonical Issue comment is readable.

## Visible workflow

```text
setup-ron (once per repository)
→ /wiki (once when the reviewed baseline is missing; later for explicit sync)
→ ask-ron (when routing is unclear)
→
grill-with-docs
→ optional prototype / handoff
→ to-spec-ron
→ to-tickets-ron
→ [execute-issue → close-issue (Leaf mode)] × one Leaf at a time
→ close-issue (Parent stop and closeout)
```

For a small Standalone Issue:

```text
grill-with-docs
→ to-spec-ron
→ execute-issue
→ close-issue under a separately named or pre-recorded close capability
```

For a user who does not understand a live decision:

```text
grill-me or grill-with-docs
→ explain-decision sidecar
→ return a bounded Decision Card
→ resume the same decision question
```

## Skill architecture

### Existing Matt skills

The workflow continues to use Matt's existing names and responsibilities:

- `grill-me` and `grill-with-docs` sharpen the idea.
- `domain-modeling` maintains terminology and ADRs.
- `tdd` drives red-green implementation slices.
- `code-review` supplies the Standards and Spec review concepts.
- `research`, `prototype`, `handoff`, and `wayfinder` remain optional branches.

Matt's `to-spec` and `to-tickets` supply the product-story, test-seam, tracer-bullet, and dependency ideas, but the Ron route uses custom versions so specification status is not confused with execution readiness.

The Ron route does not directly invoke Matt's `code-review`: its fixed-point, model-routing, Wiki, and candidate-invalidation behavior is not sufficient for the Ron closeout contract. `execute-issue` and `close-issue` reuse its review concepts through the shared subagent protocol. The original Matt skills are not renamed or filled with this workflow's authorization, tracker-authority, and lane policy.

### Custom extensions

Eight custom skills are required:

| Skill | Responsibility |
| --- | --- |
| `setup-ron` | Idempotently configure the durable Issue tracker, Wiki baseline, domain docs, target branch, worktree convention, authorization records, and Ron workflow pointers. |
| `ask-ron` | Route the user through Matt's idea flow and Ron's specification, authorization, execution, and closeout gates without mutating state. |
| `to-spec-ron` | Maintain a recoverable local Working Spec while synthesis is incomplete, then create or reuse one Change Issue, publish the append-only Change Spec comment, read it back, and remove the draft. |
| `to-tickets-ron` | Create dependency-ordered Executable Issues with bounded execution contracts, sizing, Lane, target, baseline, evidence, and authorization placeholders. |
| `execute-issue` | Execute exactly one authorized Executable Issue; build its context packet; select inline or subagent execution; run TDD and review; commit and write `implemented_on_lane` evidence without changing tracker closure state. |
| `close-issue` | Close a verified Leaf, or complete Standalone/Parent baseline reconciliation, final review, local target integration, verification, Issue closure, and safe worktree cleanup. |
| `explain-decision` | Explain one unresolved decision in a context-isolated read-only sidecar and return a bounded Decision Card. |
| `wiki` | State-aware Canonical Wiki entry: initialize a missing baseline, synchronize only affected ready-baseline topics, or report explicit read-only status through the existing Issue, Grant, review, and closeout flow. |

`setup-ron`, `ask-ron`, `to-spec-ron`, and `to-tickets-ron` are Coordinator-led and do not spawn implementation agents. `ask-ron` is the canonical router for this workflow; Matt's `ask-matt` remains the upstream router and gains only a pointer for users who selected the Ron workflow.

`setup-ron`, `ask-ron`, `to-spec-ron`, and `to-tickets-ron` are user-invoked entry points. `execute-issue` and `close-issue` remain user-reachable and model-reachable, but neither may mutate state without a direct invocation covering the exact bounded action or a valid pre-recorded Grant. A Lane batch approval may record distinct `execute` and `close_leaf` capabilities per Leaf so the successful path can continue without another prompt. A Parent creates an exact Closeout Preview; a valid bounded clean-path delegation may derive its exact Parent Closeout Grant, otherwise the Parent stops for human authorization. `explain-decision` is narrowly model-invoked only when the user asks to understand a live decision.

Do not add separate `/authorize`, `/checkpoint`, `/execution-lane`, `/delegate`, or `/subagent-policy` skills. Those are workflow concepts, not user-facing entry points.

The static subagent policy lives once in
[`docs/agents/codex-subagent-protocol.md`](../docs/agents/codex-subagent-protocol.md).
The custom skills contain only their routing and enforcement steps.

### Repository setup contract

`setup-ron` is an independent, idempotent superset of Matt's setup behavior; it does not invoke the user-invoked `setup-matt-pocock-skills`. It reuses the shared `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and optional `docs/agents/triage-labels.md` files instead of creating Ron-specific duplicates.

Ron-only configuration lives in one `docs/agents/ron-workflow.md` file containing the workflow schema version, GitHub capability-probe result, canonical Wiki root, `baseline_state: missing | ready`, page and source contract versions, protocol and optional engine pins, validation commands, `wiki_support_write_set`, `interaction.policy: exception_only`, target branch, worktree convention, and target-integration policy. Runtime `bootstrapping` is derived from a hash-valid active Bootstrap Issue and is never persisted in target configuration.

A clean direct `/setup-ron` invocation may create one local setup commit containing only the exact approved Ron configuration and instruction paths, then fast-forward and verify the named local target. Dirty overlap, unexpected paths, conflict, or failed verification stops. The setup commit never includes Wiki baseline content or product changes, and it never implies push or another external capability.

Ron v1's Canonical Wiki is reviewed repository-local Markdown, not an engine. No executable Wiki engine is required or currently accepted by this specification. Ron records `context_mode: staging` and `mutation_policy: closeout_only`; setup does not generate or mutate a baseline.

Ron v1 may pin an upstream compile protocol as a design reference without claiming that its repository is installed or executable. Any future engine adoption requires a separate compatibility Issue, exact version and commit pin, protocol hash, bounded staging and write-set verification, and successful closeout. Automatic engine upgrades are disabled. Microsoft Deep Wiki and Nimbalyst remain optional non-authoritative future publication, authoring, or retrieval candidates rather than required workflow components.

Bootstrap and closeout remain engine-independent. A human or agent may author Markdown directly, while an optional verified engine may only propose patches inside staging and the granted write sets. Leaf execution never generates or writes the Wiki. Any proposed semantic page or support artifact outside the granted sets stops closeout.

## Issue model

### Change Issue

The single Issue created or reused when `to-spec-ron` finishes. It owns the Change Spec lineage before hierarchy is known. `to-tickets-ron` later turns it into a Parent when it creates Leaf Issues, or leaves it as a Standalone Issue when no split is required.

### Parent Issue

Coordinates a set of dependent Leaf Issues. It does not directly implement product behavior. It owns aggregate review, target integration, business-baseline reconciliation, and final closeout.

### Leaf Issue

An independently verifiable vertical outcome under a Parent. A completed Leaf has a final local commit and completion evidence on its Execution Lane, but is not yet integrated into the target branch.

### Standalone Issue

An independently executable Issue without a Parent closeout boundary. One Authorization Record may contain separately named execution and closeout capabilities.

### Executable Issue

Only a Leaf or qualified Standalone Issue is executable. A Parent is never directly executable.

An Executable Issue must satisfy all of the following:

- one coherent vertical outcome;
- one highest clear behavioral test seam;
- one Issue-specific Grant;
- one consistent risk, baseline, and target;
- one writable owner;
- enough context budget for implementation, review, repair, verification, and closeout;
- one final local commit and one final completion-evidence record.

Split an Issue before execution when it has independent outcomes, incompatible authorization scopes, different targets or baselines, multiple writable owners, separable acceptance boundaries, external waiting time, or too little review reserve.

Do not split only because it touches multiple layers or files, requires several checks, or benefits from bounded read-only research.

## Execution Lane and worktree policy

An Execution Lane is the ordered run of related Leaf Issues toward one Parent and target lineage. It owns at most one active writable worktree.

A new worktree is required when:

- the current checkout is dirty with unrelated work;
- the work is high-risk or long-lived;
- the target branch or baseline differs;
- another writable Issue is active;
- a writable subagent is used;
- path ownership overlaps another writer.

Sequential Leaf Issues may reuse a Lane worktree only when:

- they have the same Parent, target, and lineage;
- the previous Leaf is committed and the worktree is clean;
- no other writer owns the worktree;
- the next Issue receives a fresh Context Packet and preflight.

The Lane worktree is not removed after each Leaf. It is removed only after successful Parent closeout, or after a Standalone Issue completes its target integration. Worktree cleanup never implies branch deletion.

## Wiki readiness and write ownership

`setup-ron` registers and verifies a canonical Wiki location; it does not invent a business-knowledge structure for a repository that has none.

- A business-semantic, domain, user-behavior, or public-contract change requires a reviewed Wiki baseline before an Execution Grant can become ready.
- A purely technical Issue may proceed without one only when its Change Spec records `wiki_impact: none` and a valid exact Grant accepts that classification.
- `close-issue` checks the actual aggregate diff before accepting `wiki_impact: none`.

Complete-Issue Wiki writes use two explicit sets:

- `wiki_semantic_write_set` contains exact pages whose business meaning may change and is approved in the Parent or Standalone Closeout Grant.
- `wiki_support_write_set` contains preconfigured mechanical outputs such as existing navigation, indexes, and `llms.txt`.

The closeout owner performs a zero-write preview in staging before Wiki mutation. An optional verified engine may propose content within those bounds, but it never decides Issue hierarchy, completion, authorization, semantic correctness, or the authoritative affected-page set. A new semantic page, unexpected support file, or changed set invalidates the exact Closeout Grant.

## Tracker and Change Spec model

### Durable remote tracker requirement

The complete Ron v1 workflow requires GitHub Issues with durable comments, stable comment identifiers, API read-back, Issue relationships, and closure verification. `setup-ron` performs a capability probe before enabling full mode.

GitLab, Linear, other remote trackers, and local Markdown are unsupported or degraded in v1. They must not claim the authorization, comment-integrity, or cleanup guarantees described here. A second adapter is added only after a real need and its own forward tests.

Tracker unavailability fails closed for specification, authorization, execution, and closeout mutations.

### Change Spec comment

While synthesis is incomplete, `to-spec-ron` stores a non-authoritative Working Spec at the repository-specific path resolved by:

```text
git rev-parse --git-path ron-workflow/drafts/<draft-id>.md
```

The draft uses user-only permissions, does not enter the worktree, and exists only for local cross-session recovery. When synthesis finishes, `to-spec-ron` creates or reuses the Change Issue, writes the resolved change contract as an append-only comment beginning with `workflow-change-spec:v1`, reads the exact comment back, verifies its hash, and immediately removes the Working Spec. A publish or read-back failure preserves the draft and does not claim specification completion.

The comment records at least:

```yaml
workflow-change-spec: v1
spec_id: <stable-id>
status: specified
issue: <tracker-and-issue-id>
created_at: <timestamp>
wiki_context:
  - <topic-and-source-reference>
explicit_overrides:
  - <confirmed-rule-change>
acceptance:
  - <observable-outcome>
verification_seams:
  - <public-boundary>
out_of_scope:
  - <excluded-behavior>
supersedes: <spec-id-or-null>
payload_sha256: <exact-payload-content-hash>
```

The human-visible body also contains the Problem, Solution, behavior-distinct User Stories, Implementation Decisions, Testing Decisions, proof-claim boundaries, and Further Notes. It is complete without being padded with redundant story permutations.

The hash covers only the exact UTF-8 payload between fixed record delimiters, with LF line endings and one terminal newline. It excludes the hash field and GitHub transport metadata, avoiding a self-referential hash. Change Spec comments are append-only by policy. A correction creates a new comment that explicitly supersedes the prior `spec_id`; editing or deleting historical Spec comments is forbidden. Any later edit causes read-back hash mismatch and invalidates dependent Grants.

### Leaf execution contract

`to-tickets-ron` creates each Leaf Issue with a bounded execution-contract comment. It references the Parent `spec_id`, comment ID, and hash instead of copying the full Change Spec, and records the Leaf outcome, acceptance, verification, target, baseline, Lane, dependencies, exclusions, and expected proof state.

Every Issue therefore contains enough durable contract information to rebuild its Context Packet, while the full historical Change Spec remains single-sourced on the Parent or Standalone Issue.

Fetched Context Packets, Decision Explanation details, and subagent scratch live only under task-specific directories in `/private/tmp`; they are rebuildable and explicitly removed after bounded use. The OS cleaner is not a lifecycle guarantee. Grilling transcripts and intermediate decision-process notes are not repository artifacts; only the final selected decision and concise rationale enter the Change Spec comment.

## Authorization model

### System of record

The Issue tracker is the cross-session authorization system of record. The human grant is stored as a structured Issue comment beginning with `workflow-authorization:v1`.

- The product spec defines intended content.
- The Change Spec comment records intended content.
- A separate Authorization Record comment records authority to perform named capabilities.
- Labels are routing hints, never authority.
- Plans, checklists, commits, tests, and reviews are evidence, never authority.

Each Executable Issue has its own Authorization Record. A Parent grant does not implicitly cascade to children.

### Batch Grant Recording

A human may approve a fixed list of Leaf Grants in one interaction before the Lane starts. The Coordinator then writes and reads back a separate Authorization Record on every named Leaf.

Batch recording is not inheritance:

- each Leaf remains bound to its own Issue, artifact hash, scope, capabilities, and exclusions;
- an unlisted or newly created Leaf has no Grant;
- a changed artifact hash invalidates only the affected Leaf's readiness;
- execution may continue from one completed Leaf to the next only when the next Leaf already has a valid Grant.

### Authorization Record

The canonical comment records at least:

```yaml
workflow-authorization: v1
record_id: <stable-id>
status: active
approver: <identity>
approved_at: <timestamp>
origin: direct-human | derived-clean-path
derived_by: <coordinator-identity-or-null>
delegated_from: <record-id-or-null>
delegated_from_kind: issue-record | pre-issue-record | null
delegated_from_payload_sha256: <hash-or-null>
binds:
  issue: <tracker-and-issue-id>
  spec_id: <change-spec-id>
  spec_comment_id: <tracker-comment-id>
  spec_payload_sha256: <hash>
  contract_id: <execution-contract-id>
  contract_comment_id: <tracker-comment-id>
  contract_payload_sha256: <hash>
  target_branch: <branch>
  target_sha: <expected-baseline>
  lane_sha: <required-for-closeout-or-null>
  closeout_preview_sha256: <required-for-closeout-or-null>
  evidence_sha256: <required-for-derived-grant-or-null>
  scope_ceiling_sha256: <required-for-clean-path-delegation-or-null>
  wiki_operation: none | bootstrap | reconcile
  wiki_baseline_requirement: not-applicable | missing-with-bootstrap-preview | ready
  wiki_preview_id: <preview-id-or-null>
  wiki_preview_payload_sha256: <hash-or-null>
  wiki_semantic_write_set_sha256: <required-for-wiki-closeout-or-null>
  wiki_support_write_set_sha256: <configured-set-hash-or-null>
grants:
  - <named-capability>
excludes:
  - <named-capability>
preconditions:
  - <machine-checkable-condition>
delegation:
  clean_path: denied | bounded
  derive_exact_grants:
    - <named-local-capability>
  target_refresh: denied | same-branch-fast-forward-revalidate
  read_only_subagents: allowed_when_independent
  writable_subagent: one_worker_with_exclusive_worktree
  nested_clean_path: denied
  nested_delegation: denied
supersedes: <record-id-or-null>
payload_sha256: <exact-payload-content-hash>
```

Authorization Records are append-only:

- never edit or delete an existing Grant;
- add `supersedes` when replacing it;
- add a revocation record with `revokes` when withdrawing it;
- revocation or supersession invalidates every unconsumed Grant derived from that delegation;
- rebuild the full chain in a new session;
- fail closed when two conflicting active Grants have no supersession relationship.

The latest valid chain member authorizes execution only when Issue, hashes, scope, capabilities, target, and preconditions all match.

### Recording conversational approval

When the human explicitly approves a prepared Grant, the Coordinator may write the structured comment to the named Issue without a second permission prompt. It must immediately read the record back.

Execution cannot start when the write or read-back fails. Tracker unavailability also fails closed because revocation cannot be ruled out.

Direct skill invocation counts as approval when either its exact scope is already known or the command explicitly defines one bounded clean-path derivation contract:

- naming one Leaf or Standalone with a current execution contract may authorize that Issue's standard `execute` capability;
- `close_leaf` is a separate capability that must be directly named or pre-recorded;
- a Lane batch first presents one exact Grant preview per Leaf, then one human approval may record all named Grants;
- direct `/wiki` invocation may authorize exactly one clean bounded initialization or sync whose exact Preview or ledger, paths, validators, and exclusions are derived before external mutation;
- when that operation needs a new Issue, the exact ceiling is first written as a mode-`0600`, hash-verified pre-Issue delegation under repository-local Git metadata; only its one named publish capability may create/reuse the Issue, and no Lane starts until the Change Spec and execution contract both read back and a derived Issue Authorization Record binds them plus the local delegation hash;
- Parent or Standalone complete closeout creates one exact Closeout Preview containing Lane SHA, target SHA, Wiki ledger and write sets, verification commands, capabilities, exclusions, and the bounded candidate-creation/repair envelope; a valid clean-path delegation derives its exact Grant, otherwise the workflow asks only for compact human authorization;
- the Grant binds those exact inputs and permitted mutations, while review and completion evidence bind the resulting `integration_candidate_sha`;
- a changed contract hash, target SHA, write set, code scope, or new Repair Leaf invalidates the exact Grant. The workflow may rebuild and derive a replacement only when the original clean-path delegation still covers every input and revalidation passes; otherwise it stops for human decision. A candidate SHA changed only by an approved Wiki repair wave invalidates prior review evidence, not the Grant.

### Authorization is not readiness

A valid Grant does not make an Issue executable. Readiness additionally requires:

- Leaf or qualified Standalone type;
- current artifact and baseline hashes;
- coherent acceptance and verification commands;
- satisfied dependencies;
- valid worktree and ownership;
- no conflicting or revoked Grant;
- sufficient context and review reserve.

Wiki readiness additionally requires one valid combination:

- `none + not-applicable` with explicit `wiki_impact: none`;
- `bootstrap + missing-with-bootstrap-preview` on one Standalone Bootstrap Issue with a matching bounded Preview and delegation chain;
- `reconcile + ready` for normal semantic work.

The bootstrap combination is the only semantic execution allowed while target config is `missing`. It never makes a Leaf writable to Wiki and cannot bypass a previously ready baseline.

## Grant capability sets

### Leaf Bounded Execution Grant

May include:

- read the Issue, spec, Wiki, glossary, ADRs, and repository;
- create or reuse the named Lane worktree;
- modify only Issue-owned paths;
- run focused tests and verification;
- use allowed subagents;
- stage exact owned paths;
- create one final local commit;
- write event-driven checkpoints and final completion evidence;
- invoke `close-issue` in Leaf mode through a separately named `close_leaf` capability.

The `execute` capability never closes the Issue by itself. It does not include target-branch merge, Lane cleanup, push, remote merge, deployment, branch deletion, legacy deletion, or live-provider operations.

### Parent Closeout Grant

After the final Leaf, the workflow creates an exact Closeout Preview from aggregate evidence, hashes, target, and baseline state. A valid bounded clean-path delegation may derive the exact Parent Closeout Grant; without one, the workflow stops for compact human authorization. One Parent Closeout Grant may include:

- the exact Closeout Preview hash, Lane SHA, and target SHA;
- required Wiki baseline reconciliation;
- exact `wiki_semantic_write_set` and configured `wiki_support_write_set`;
- target synchronization and creation of a Target Integration Candidate;
- final full review against the exact integration-candidate SHA;
- a closeout commit only when Wiki, domain, ADR, navigation, or explicitly approved tracked cleanup changes the tree;
- fast-forward of the named local target branch to the reviewed candidate;
- verification on the target branch;
- Parent Issue closure;
- Lane worktree cleanup after every prior step succeeds.

Failure preserves the Parent Issue and Lane worktree and writes a checkpoint. Push, remote merge, deployment, branch deletion, and live-provider operations remain excluded.

### Standalone Bounded Execution Grant

A Standalone Authorization Record may contain separately named execution and closeout capabilities. When both were explicitly approved and every binding remains valid, the workflow may carry the Issue through local target integration, verification, closure, and worktree cleanup without another prompt. Execution never implies closeout.

## Issue Context Packet

An Issue Context Packet is ephemeral, rebuildable, and non-authoritative. It should normally live under `/private/tmp`.

It contains pointers and hashes rather than copied documents:

- Issue identity and type;
- resolved Authorization Record chain;
- Change Spec and Leaf execution-contract comment IDs and hashes;
- target and baseline;
- relevant Wiki, `CONTEXT.md`, and ADR pointers;
- owned paths and worktree;
- acceptance seams and verification commands;
- stop conditions;
- latest Issue Progress Checkpoint, if any.

Do not copy full conversation history, the entire Wiki, or the entire spec unless the Issue genuinely requires it.

Use a soft context allocation:

- 20% for preflight and orientation;
- 45% for implementation and TDD;
- 35% reserved for review, repair, verification, and closeout.

Every Issue receives logical context isolation. A physical fresh session or worker is required when the remaining context cannot preserve the review reserve, the domain or target changes, a prior checkpoint is unresolved, or delegation materially improves isolation. Small Issues may remain inline in the same user-facing task.

## Issue Progress Checkpoint

An Issue Progress Checkpoint is a durable Issue comment used for cross-session recovery. It is not a periodic activity log.

Write one only when:

- a session ends while the Issue remains incomplete;
- a human decision or external dependency blocks progress;
- a consequential non-repeatable mutation occurred;
- artifact, baseline, ownership, or authorization became invalid;
- final completion evidence is ready.

Do not write a checkpoint for every TDD cycle, test command, phase, or subagent message. If one session completes the Issue, write only final completion evidence.

## Leaf execution loop

The Change Spec and Leaf execution contract carry the human-confirmed behavioral seams into Matt's `tdd` discipline. `execute-issue` does not ask again for an unchanged seam. Test cases, fixtures, and mocks inside that seam are implementation choices; a newly discovered public behavior or expanded acceptance boundary stops execution for a superseding Spec and Grant.

For every ready Leaf:

1. Resolve and read back the valid Authorization Record.
2. Build a fresh Issue Context Packet.
3. Verify the Lane worktree, clean predecessor commit, ownership, target, and hashes.
4. Select inline or subagent execution.
5. Run TDD at the agreed seams.
6. Freeze a review candidate and run the approved focused or full review profile.
7. Repair findings through the single writable owner and invalidate stale reviews.
8. Run final focused verification.
9. Stage exact Issue-owned paths.
10. Create one final local commit.
11. Write completion evidence with `implemented_on_lane`, not `integrated_to_target`.
12. Stop unless a valid `close_leaf` capability can be read back.
13. Invoke `close-issue` in Leaf mode to verify the commit, review, evidence, and clean Lane; close the Issue and read back the closed state.
14. Continue only after closure to the next ready, already authorized Leaf.

Do not merge individual Leaf commits into the target branch.

After the last Leaf, return to the Parent, prepare aggregate evidence, and stop for the Parent Closeout Grant.

## Standalone execution loop

A ready Standalone follows the same implementation and review loop. Under a separately approved and valid closeout capability it may continue through:

1. exact Wiki write-set resolution and baseline reconciliation when required;
2. target synchronization and Target Integration Candidate creation;
3. final full review against the integration-candidate SHA;
4. a conditional closeout commit when the tree changed;
5. local target fast-forward to the reviewed SHA;
6. target identity, test, Wiki-build, and artifact-absence verification;
7. Issue closure;
8. worktree cleanup.

Any target drift, authorization mismatch, semantic ambiguity, or failed verification stops the flow and preserves recoverable state.

## Closeout Artifact Retention Policy

### Artifact manifest

`execute-issue` records every workflow-created local artifact in a task-owned manifest outside the worktree. `close-issue` may delete only exact paths present in that manifest or exact temporary paths declared by the configured workflow. Wildcards and broad cleanup commands are forbidden.

### Delete after successful reconciliation

Normal execution never places the following in the worktree:

- temporary Change Spec mirrors;
- Issue Context Packets accidentally materialized inside the worktree;
- Decision explanation detail;
- subagent scratch notes and raw reports;
- temporary plans, checklists, manifests, and generated validation artifacts;
- disposable prototypes that are not product deliverables.

Task-specific copies under `/private/tmp` are explicitly removed after bounded use rather than left to the operating-system cleaner. An accidentally materialized or tracked intermediate blocks closeout unless its exact cleanup was separately approved; routine closeout must not normalize accidental repository pollution. If closeout fails, retain recovery-relevant artifacts and the worktree until the failure is resolved.

A Parent does not create an empty commit. Each Executable Issue has one final implementation commit, while a coordination-only Parent records completion against `integration_candidate_sha`. A Parent closeout commit exists only when approved Wiki, domain, ADR, navigation, or tracked-cleanup changes produce a real tree diff.

### Retain as durable authority or product output

Never delete:

- Change Spec, Authorization, Checkpoint, and completion-evidence comments in the Issue tracker;
- final code and tests;
- the reconciled Wiki;
- current `CONTEXT.md` and accepted ADRs;
- required API, migration, operational, compliance, or user documentation.

### Wiki reliability gate

Issue closure is allowed only after final Wiki reconciliation and integration review:

1. verify every Leaf is closed with `implemented_on_lane` evidence and present in the Lane history;
2. build a Wiki reconciliation ledger from the prior Wiki, current Change Spec dispositions, code and test evidence, and reviewer judgement; stop on `deviation` or `unverified`;
3. derive `wiki_semantic_write_set` and `wiki_support_write_set` from the fully `aligned` ledger;
4. create one Closeout Preview containing the Lane SHA, target SHA, ledger hash, both exact Wiki sets, verification commands, capabilities, exclusions, and bounded repair envelope; derive and read back its exact Grant only when a valid clean-path delegation covers every input, otherwise stop for compact human authorization;
5. synchronize the latest target into the Lane; a conflict stops, while an allowed same-branch fast-forward refresh triggers complete recalculation and revalidation;
6. update only approved pages according to the ledger, or record an explicit no-semantic-change reconciliation;
7. verify the page contract, source-locator resolution, claim mappings, internal links, navigation, configured Wiki build, and tracked-tree cleanliness;
8. confirm no unresolved `pending-baseline-update`, stale citation, or unapproved Spec/Wiki conflict remains;
9. create a closeout commit only when the tracked tree changed, then freeze `integration_candidate_sha`;
10. run the final full Standards, Spec, and independent applicable Wiki review against that exact SHA and the Parent fixed point;
11. after a bounded human repair Grant, repair approved Wiki-only findings within the write sets and ledger actions, create a new SHA, and re-review; any code or test finding becomes a separately authorized Repair Leaf;
12. fast-forward the local target branch to the reviewed SHA;
13. verify target HEAD identity, tests, Wiki build, citations, and absence of task intermediates;
14. close the Issue and remove the worktree only after target verification.

If the target moves after the Closeout Preview, the exact Grant is invalid. A valid clean-path delegation may authorize a same-branch, fast-forward-only, conflict-free refresh followed by a rebuilt Preview, derived Grant, and complete revalidation; otherwise Ron stops for human decision. A merge conflict always stops. Rebase is never automatic because it would rewrite completed Leaf commit identities.

The Wiki stores the reliable current business baseline. The Issue tracker retains historical Change Specs and decisions. Neither substitutes for the other.

## Subagent delegation policy

The canonical static policy is
[`docs/agents/codex-subagent-protocol.md`](../docs/agents/codex-subagent-protocol.md).

### Inline-first decision

Default to zero subagents. Delegate only when all are true:

- the task is completely expressible by the Issue Context Packet;
- it needs no human decision;
- its result remains independently valuable;
- output, ownership, and evidence are exact;
- expected time or context benefit exceeds delegation cost.

Keep grilling, authorization, tracker updates, target merge, final acceptance, and cleanup with the Coordinator.

### Model routing

| Subagent task | Model | Reasoning |
| --- | --- | --- |
| Research and `wayfinder` fact work | `gpt-5.6-terra` | `medium` |
| Read-only codebase exploration | `gpt-5.6-terra` | `medium` |
| Standards review | `gpt-5.6-sol` | `high` |
| Spec or Wiki conformance review | `gpt-5.6-sol` | `high` |
| Codebase-design proposal | `gpt-5.6-sol` | `high` |
| Writable implementation worker | `gpt-5.6-sol` | `high` |
| Decision explanation sidecar | `gpt-5.6-sol` | `high` |

Do not use `low` merely to justify delegation; trivial work stays inline. `xhigh`, `max`, and `ultra` are exceptional overrides requiring a recorded reason, not routine defaults.

Until custom agent-role configuration is deliberately introduced, each `spawn_agent` call supplies `model` and `reasoning_effort` explicitly. Conceptual roles such as explorer or worker are expressed through the Task Brief and ownership, not assumed from unavailable runtime metadata.

### Review profiles and repair budget

Every Leaf execution contract and Grant fixes one review profile before implementation:

- **Focused** applies only to a single-seam, low-risk Leaf without shared-contract, migration, permission, security, data-integrity, or concurrency impact. One fresh `gpt-5.6-sol/high` reviewer returns separate Standards and Spec sections. An independent Wiki reviewer is added only when `wiki_impact` is not `none`.
- **Full** uses separate Standards, Spec, and applicable Wiki reviewers. It is required for high-risk or cross-cutting work.

The Parent or Standalone Target Integration Candidate always receives a full review for every applicable axis. A missing Wiki axis is skipped with an evidence-backed reason rather than a fabricated review.

Any confirmed finding ends the clean-path delegation and returns the problem and trade-offs to the human. After a bounded repair Grant is issued, one candidate may enter at most two material repair waves. Each wave uses the single writable owner to address all confirmed findings and produces a new SHA. Re-review covers the affected axes, or the full profile for high-risk repairs. Tool failure, duplicate findings, and unsupported reviewer claims do not consume a repair wave. A persistent material finding after the second wave, or evidence that the Spec, seam, or Issue sizing is wrong, writes a checkpoint and stops with the worktree preserved.

A Parent final-review code or test finding ends the clean-path delegation and does not consume closeout repair waves. Ron presents the problem and trade-offs; only after human authorization may it create a Repair Leaf with its own execution contract, Grant, one final commit, and closure. The changed Lane SHA invalidates the Parent Closeout Grant and requires a fresh Closeout Preview and integration candidate.

### Subagent Task Brief

Each spawn receives a dynamic brief containing:

- one goal;
- Issue, Grant, artifact, and candidate identifiers;
- minimal source pointers;
- read-only or exact writable ownership;
- constraints and forbidden actions;
- acceptance and evidence;
- expected return format;
- explicit model and reasoning effort.

The brief is generated from the current Packet. It is not another product spec and does not copy the full Change Spec comment.

## Agent Orchestration State Machine

Reserve one of the four available slots for the Coordinator. Use the remaining slots in bounded waves:

| Wave | Agents | Barrier |
| --- | --- | --- |
| Preflight | Up to three independent read-only agents | Required facts and cited artifacts are returned. |
| Implementation | One writable worker; optionally up to two read-only agents that do not inspect a mutable diff | Writable ownership remains exclusive. |
| Review | After fixing `candidate_sha`, the approved focused or full read-only review profile | Every applicable axis returns against the same SHA. |
| Repair | The single writable owner | Any edit produces a new `candidate_sha`. |
| Re-review | Reviewers for affected axes; all axes for high-risk changes | No accepted result references a stale SHA. |
| Finalize | Coordinator only | Evidence, commit, tracker, integration, verification, and cleanup gates pass in order. |

Every delegated task is bound to `wave_id`, `issue_id`, `grant_id`, `candidate_sha` when applicable, ownership, model, and reasoning effort.

Rules:

- no nested delegation;
- no parallel writable Leaf Issues;
- no speculative implementation of the next Leaf;
- do not create agents merely to fill slots;
- interrupt agents and discard their results when Grant, artifact hash, baseline, or candidate SHA changes;
- retry one failed agent once with a narrower task, then complete inline or fail closed;
- resolve reviewer conflicts by inspecting evidence, never by majority vote;
- cap returned findings and place lengthy detail in a bounded artifact;
- the Coordinator independently verifies subagent claims.

## Decision explanation sidecar

`explain-decision` triggers only when the user asks to understand, compare, or question the current unresolved choice. It must not run for every grilling question.

The Coordinator pauses the current question and sends a fresh read-only subagent a minimal Decision Explanation Packet:

- exact decision question;
- two or three current options;
- confirmed constraints and facts;
- current recommendation;
- only necessary spec or glossary pointers.

The subagent returns a Decision Card of about 300 words covering:

- the question in plain language;
- main trade-offs;
- short- and long-term consequences;
- reversibility;
- recommended choice and reason;
- remaining uncertainty.

Detailed explanation may be written under `/private/tmp`; the main workflow reads only the bounded card unless the user asks for more. The sidecar does not update the spec, Issue, glossary, ADR, or authorization state.

The user's final selection and concise rationale are the only authoritative outputs. For a genuinely long interactive exploration, the user may explicitly request a separate Codex task and later return only a compact decision handoff.

## Proof-state boundaries

Always distinguish:

- reviewed;
- tests passed;
- locally committed;
- implemented on the Lane;
- merged to the local target branch;
- verified on the target branch;
- Issue closed;
- worktree removed;
- pushed;
- remotely merged;
- deployed;
- verified against a live provider or production environment;
- historically validated.

No earlier state implies a later one.

## Stop conditions

Stop and preserve recoverable state when:

- no valid Authorization Record can be read back;
- no valid Change Spec or Leaf execution-contract comment can be read back;
- a revocation or conflicting Grant exists;
- Issue, spec, target, or baseline hashes drift;
- dependencies are incomplete;
- owned paths overlap another writer;
- the worktree is dirty outside Issue ownership;
- the Issue no longer fits the Executable Issue sizing gate;
- review results are stale or materially disputed;
- two material repair waves do not produce an acceptable candidate;
- an actual Wiki write falls outside the approved semantic or configured support set;
- target integration or verification fails;
- target SHA differs from the approved Closeout Preview;
- tracker closure fails;
- a requested capability is outside the Grant.

## Acceptance scenarios

1. A batch approval writes a distinct, readable Grant to every named Leaf; an unlisted Leaf remains blocked.
2. Three sequential Leaf Issues reuse one Lane worktree, each producing one commit, then closing through a separately granted `close_leaf` capability before the next begins.
3. A changed Leaf spec hash invalidates that Leaf without invalidating unrelated valid Grants.
4. Tracker unavailability prevents execution even when a local copy of an old Grant exists.
5. One writable worker and two independent read-only agents can run concurrently without shared writable ownership.
6. Focused and full review profiles preserve separate logical axes, and every applicable reviewer receives the same fixed candidate SHA.
7. A repair creates a new candidate SHA and invalidates prior review evidence.
8. A reviewer disagreement remains unresolved until the Coordinator checks evidence; two approvals do not outvote one supported defect.
9. Parent closeout creates one exact Closeout Preview; a valid bounded clean-path delegation derives and records its exact Grant without another prompt, while a missing or exceeded delegation stops for compact human authorization.
10. A target-verification failure leaves the Parent open and the Lane worktree recoverable.
11. Separately approved Standalone execution and closeout capabilities can complete through local target integration without a second prompt when every binding remains valid.
12. `explain-decision` receives only the current decision packet and returns a bounded card without changing durable state.
13. An Issue that would consume the review reserve is split or moved to fresh context before implementation continues.
14. Push, remote merge, deployment, branch deletion, and live-provider actions remain blocked unless separately authorized.
15. `to-spec-ron` keeps an incomplete Working Spec in Git metadata, writes and reads back an append-only Change Spec comment at completion, then deletes the draft without creating a worktree spec file.
16. Every Leaf references one Parent Spec comment and contains its own bounded execution contract without copying the full Spec.
17. Local Markdown tracking is reported as degraded and cannot claim full Ron workflow guarantees.
18. A successful closeout removes only manifest-owned external intermediates after Wiki verification and never relies on operating-system temporary-file cleanup.
19. A Wiki build, citation, or pending-baseline failure preserves the Issue, artifacts, and worktree.
20. Target verification proves that target HEAD equals the reviewed `integration_candidate_sha`, the reconciled Wiki is present, and temporary per-Issue spec files are absent.
21. A Parent final-review code finding creates a separately authorized Repair Leaf instead of changing code inside `close-issue`.
22. A third material repair wave is refused; the workflow writes a checkpoint and preserves the worktree.
23. A coordination-only Parent with no tracked closeout diff records completion without an empty commit.
24. An unexpected Wiki semantic page or support file invalidates the Closeout Grant before target advancement.
25. GitHub comment edits, missing comment IDs, or payload-hash mismatch invalidate dependent authorization.
26. The complete Wiki flow works with human- or agent-authored Markdown when no executable Wiki engine is installed.
27. Direct `/wiki` invocation may publish exactly one clean bounded initialization or repair Change Spec and complete the local flow; any finding or changed scope stops for human decision.
28. Wiki reconciliation requires an `aligned` ledger before mutation; `deviation` or `unverified` blocks closeout.
29. Deterministic CI proves only mechanical validity; an independent read-only Wiki reviewer proves semantic correctness.
30. Clean human-facing results omit technical identities by default while durable evidence retains them.
31. Clean `/setup-ron` creates and verifies one local setup commit containing only exact approved configuration paths; dirty overlap or unexpected paths stop before commit.
32. A Bootstrap Standalone with a matching Preview is executable while Wiki baseline state is `missing`; normal semantic execution in the same state remains blocked.
33. A direct `/wiki` invocation that needs a new Issue records and verifies one pre-Issue delegation before Issue creation, then records a derived Issue Grant before Lane creation.
34. `/wiki` and `to-spec-ron` use byte-identical Change Spec construction and verification for identical input.
35. Unsupported or ambiguous source resolvers stop with `not-verifiable` instead of weakening the locator contract.
36. A Bootstrap or Wiki-repair derived Grant cannot create a Lane until both its Change Spec and execution contract have stable IDs, verified bytes, and matching hashes.

## Core implementation record

The previously authorized core implementation scope was:

- add `skills/engineering/execute-issue/`;
- add `skills/engineering/close-issue/`;
- add `skills/engineering/setup-ron/`;
- add `skills/engineering/ask-ron/`;
- add `skills/engineering/to-spec-ron/`;
- add `skills/engineering/to-tickets-ron/`;
- add `skills/productivity/explain-decision/`;
- update promoted-skill READMEs, plugin manifest, docs pages, and add the minimal `ask-matt` pointer;
- adapt `docs/agents/codex-subagent-protocol.md` as the shared runtime policy;
- validate manifests and forward-test the seven skills against a temporary repository, fake durable Issue tracker, and fake Wiki engine;
- leave installation pending until separately authorized; the approved installation path is the existing maintainer symlink workflow after checking exact destination conflicts;
- leave release-version bumping, commit, push, marketplace publication, and a separate Ron plugin identity outside this implementation.

No existing Matt skill should be behaviorally rewritten merely to hide these extensions under an upstream name.

The Canonical Wiki v1 extension, `/wiki`, shared Change Spec and execution-contract builders, reconciliation-ledger enforcement, bounded clean-path delegation, and the scope-only local baseline commit were authorized on 2026-07-26. The new focused and temporary-repository forward tests now prove the local implementation contracts. Final implementation commit, installation, push, release bump, marketplace publication, and deployment remain outside this authorization.

The repository currently reports `.claude-plugin/plugin.json` version `1.2.0` and `package.json` version `1.1.0`. This pre-existing drift does not block local symlink implementation or forward tests, but it must be resolved under separate release authorization before any managed plugin publication.

## Local validation record

- Promoted-skill parity passed across 29 skill directories, `.claude-plugin/plugin.json`, top-level and bucket READMEs, docs pages, and invocation metadata.
- Historical provider-native validation covered the earlier seven-skill manifest; it does not validate the current `/wiki` manifest change.
- Ron frontmatter, `agents/openai.yaml`, default prompts, docs links, final newlines, trailing whitespace, and `git diff --check` passed.
- A disposable `/private/tmp` Git repository, fake durable tracker, and fake Wiki verified comment hashing, real target/Lane SHAs, target drift, stale Grant rejection, first/non-first Leaf readiness, and exact Wiki sets.
- Fresh read-only forward tests covered setup/spec/tickets, execute/Leaf close, Parent/Standalone closeout, and the decision sidecar. Findings about Lane serialization, rerun idempotency, Grant supersession, Standalone capability naming, and first-Leaf baseline binding were repaired and re-reviewed to PASS.
- The temporary fixture is removed after the validation record is captured; the operating-system cleaner is not relied upon.

Canonical Wiki v1 local validation on 2026-07-26:

- 26 focused, contract, CLI, Git zero-mutation, fake-tracker Bootstrap, and documentation-structure forward tests passed.
- Shared-core syntax, promoted-skill parity, current docs routing, invocation metadata, and `git diff --check` passed.
- The system quick validator cannot validate this repository's user-invoked frontmatter contract because it does not accept the project-required `disable-model-invocation` key; the project contract test verifies that key together with `policy.allow_implicit_invocation: false`.
- The current manifest uses the repository's deterministic packaging contract test plus scoped read-only Codex CLI review; no Claude CLI validation is required.
