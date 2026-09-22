# Workflow simplification audit

**Date:** 2026-09-22
**Status:** Read-only recommendation; no workflow behavior changed.

## Decision frame

The desired floor is deliberately small:

1. One explicit human confirmation for the selected scope or external operation.
2. Git and tracker read-back at a mutation boundary.

Every other workflow rule must prove that it prevents a failure which those two controls cannot catch. This audit treats a rule that merely repeats another durable record, pushes recovery to the human, or exposes package internals as friction rather than safety.

## Coverage

- **70 skills** under `skills/`: 39 promoted (`engineering/`, `productivity/`), 10 personal, 8 in-progress, 5 misc, and 4 deprecated.
- Companion surfaces checked: root `README.md`, bucket READMEs, `.claude-plugin/plugin.json`, `ask-matt`, and the shared planning/publication/run scripts and references.
- Critical route traced: `grill-with-docs` → `to-spec` / `to-tickets` → `run-issue-workflow` → `execute-issue` → `close-issue`.
- Incident used as a concrete friction trace: SPAY #188. It required an Orca lane repair, an adapter lane allocation/registration, a Planning Seal, a frozen canonical-body recovery from a session log, publication checkpoint resumption, lane disposal, and then stopped before Run because installation metadata was unavailable.

### Evidence gaps

This is a static/document-and-source audit, not a new fault-injection run. It does not claim that every current recovery branch is unused. In particular, deprecated and in-progress skills need usage and dependency evidence before removal. Existing live evidence does show that the delivery host is expensive: the documented restored batch used 43 native requests and 694 observed CLI calls over about 11 minutes, while the final successful read-back still used 16 requests and 160 calls. That validates prioritising coordinator simplification, but not deleting verification or closeout checks.

## Current-state diagnosis

### Gates that earn their cost

| Boundary | Keep | Why |
| --- | --- | --- |
| Human scope choice | One explicit confirmation | Prevents unapproved external effects or scope expansion. |
| Git mutation | Read target and candidate state before/after the mutation | Prevents merging or closing the wrong result. |
| Tracker mutation | Read/write/read-back the exact Issue/body/labels | Prevents duplicate or misattributed publication and closure. |
| SQL/external prerequisite | Separate human-attested execution | Git and tracker state cannot prove an external database effect. |
| Concurrent closeout | One scoped target writer / close lease | Prevents two closers from mutating the same target. |

### Gates that do not currently earn their cost

| Finding | Evidence | User impact | Recommended disposition |
| --- | --- | --- | --- |
| Planning has two lane systems | `grill-with-docs` issues an adapter planning lane while #188 first created an Orca worktree and later needed a separate adapter lane. | A valid ADR had to be copied between worktrees and provenance became a recovery problem. | **Replace** with one planner-owned temporary workspace record; the writer owns its lifecycle. |
| `to-spec` persists a checkpoint identity but not its canonical body | The #188 transaction required an exact body hash but recovery needed manual extraction from a Pi session log. | A recoverable publication became impossible to resume safely without archaeology. | **Replace** with one transaction envelope that stores the canonical body and its digest atomically before any tracker write. |
| Installation selection is an invisible precondition of Run | `workflow-installation.mjs` requires `<cache>/installation.json`; #188 attempted Run and received an unavailable-version error referring to `/home/ron/installation.json`. | A ready Spec cannot start; the user is sent to a distinct maintenance authority with no obvious one-command repair. | **Merge** package selection, installation verification, and repair preview into the Run entry's preflight; allow the same confirmation to install a reviewed current package. |
| Ownership is represented in multiple artifacts | Current flow has allocation IDs, task IDs, planning registrations, Planning Seals, producer transactions, publication records, handoff notes, Run Grants, journals, native lane records, and disposal receipts. | The human cannot tell which record is authoritative or which retry is safe. | **Merge** into one operation record per selected Spec, with append-only mutation receipts rather than separate cross-owned checkpoints. |
| Recovery is distributed across many references | `to-spec`, `run-issue-workflow`, `recovery.md`, OPERATOR, maintenance guidance, and leaf skills each return separate owners and retry commands. | The correct fix is often a documentation hunt, not a normal continuation. | **Defer internally**: the entry command should route ordinary repair automatically and expose one actionable blocker only when confirmation or missing credentials is needed. |
| Router exposes implementation topology | `ask-matt` presents a multi-step build flow plus native-step, Grant, package and maintenance detail. | A person seeking “implement this” must learn internal workflow vocabulary. | **Optimize** to present only direct intent routes and one concise status/retry message. |
| Documentation-only decisions take the full execution-shaped path | #188 required a planning lane, seal, publisher transaction, and Run handoff despite delivering one ADR. | Documentation decisions are slower and more failure-prone than the work itself. | **Replace** with a single `publish-decision` route: confirmation → scoped ADR write/read-back → tracker read/write/read-back. |

## Proposed vNext interaction

The target is not an unverified free-for-all. It is a **single operation envelope** with fewer visible stages:

1. The user selects a task and confirms the scoped external effects once.
2. The entry reads the tracker and target, creates or resumes one operation envelope, and stores the canonical plan/body before mutation.
3. The owner performs the next legal mutation and immediately reads it back. A recoverable local/package failure repairs or retries from that envelope; it never asks the user to reconstruct identities or recover body text.
4. Planning-document-only work finishes after the document and tracker read-backs. Executable work continues into one Issue lane and uses its existing Git/test/review checks.
5. The entry prints one concise status: completed, waiting, needs one confirmation, or blocked with the exact missing external credential/capability.

The envelope replaces planning lane IDs, separate producer checkpoints, handoff reconstruction, and package-selection indirection for normal operations. It contains the selected Issue, target, baseline, canonical body/plan, exact approved effects, and read-back receipts. It must be durable before the first mutation and is the only retry input.

## Ranked action queue

| Priority | Change | Friction removed | Safety retained | Affected surfaces |
| --- | --- | --- | --- | --- |
| P0 | Persist canonical publication body inside the producer transaction. | Eliminates session-log recovery. | Digest check and tracker read-back remain. | `to-spec`, GitLab/GitHub producer adapters, checkpoint store. |
| P0 | Make `run-issue-workflow` discover/repair a missing reviewed installation from one approved install path. | Eliminates the dead-end missing-metadata handoff. | Exact source/package manifest and capability read-back remain. | installation scripts, `run-entry`, setup diagnostics. |
| P1 | Collapse planning allocation, registration, handoff, and disposal into one planner-owned operation envelope. | Removes copied ADRs and opaque lane IDs from user-facing recovery. | Isolated writer plus path/content read-back remains. | `grill-with-docs`, `to-spec`, planning adapter, router. |
| P1 | Make documentation-only decisions a direct publish route. | Avoids execution-shaped Run machinery for an ADR-only outcome. | Explicit confirmation and Git/Tracker read-backs remain. | `grill-with-docs`, `to-spec`, `ask-matt`, docs. |
| P2 | Reduce the router and operator output to intent/status language. | Hides Grants, package versions, task IDs, and checkpoint profile names from normal users. | Internal records stay available for diagnosis. | `ask-matt`, OPERATOR, setup docs, README. |
| P2 | Consolidate recovery policy into the command owner. | Removes manual owner/document discovery for routine failures. | Hard stops remain for changed scope, credentials, external SQL, and conflicting mutations. | `to-spec`, `run-issue-workflow`, recovery references. |
| P3 | Review leaf-level evidence duplication after the envelope exists. | Potentially removes redundant identity reads. | Tests, review, candidate reachability, and close lease stay. | `execute-issue`, `close-issue`, verify/push flow. |

## Compatibility and migration constraints

- Existing journal, Grant, publication, and Planning Seal records remain readable until every active operation has completed or been explicitly retired.
- New commands must accept existing published Specs and resume them through a compatibility adapter; they must not regenerate a canonical body from a hash alone.
- A migration cannot delete an installed package or a planning workspace until its operation envelope reports a terminal read-back.
- SQL and deployment remain outside the simplified automatic path; they retain explicit scope confirmation and external-effect attestation.

## Verdict matrix

Verdicts apply to the current audit scope. **Keep** means no workflow-simplification defect was evidenced, not that the skill is immutable. **Investigate** means the lifecycle bucket or dependencies are insufficient evidence for removal.

| Skill | Bucket | Verdict | Smallest next action |
| --- | --- | --- | --- |
| design-an-interface | deprecated | Investigate | Prove all routes and docs are retired before removal. |
| qa | deprecated | Investigate | Prove tracker-reporting successor coverage before removal. |
| request-refactor-plan | deprecated | Investigate | Prove `wayfinder`/architecture successor coverage before removal. |
| ubiquitous-language | deprecated | Investigate | Prove `domain-modeling` migration and user-path removal. |
| ask-matt | engineering | Optimize | Replace topology-heavy route text with intent-first routes. |
| attest-target-contribution | engineering | Investigate | Re-evaluate after operation-envelope migration removes recovery receipts. |
| close-issue | engineering | Keep | Retain ordered merge/worktree/tracker read-back and lease. |
| code-review | engineering | Keep | Retain focused Standards/Spec review. |
| codebase-design | engineering | Keep | No delivery-workflow overlap evidenced. |
| diagnosing-bugs | engineering | Keep | No delivery-workflow overlap evidenced. |
| domain-modeling | engineering | Keep | Keep ADR/glossary discipline; consume the simplified planner record. |
| execute-issue | engineering | Optimize | Consume one operation envelope instead of repeated upstream identity records. |
| grill-with-docs | engineering | Replace | Replace planning-lane lifecycle with one planner-owned envelope. |
| implement | engineering | Keep | Preserve as the simpler direct route for standalone approved work. |
| improve-codebase-architecture | engineering | Keep | No delivery-workflow overlap evidenced. |
| pre-execute-issue | engineering | Keep | Keep explicit external SQL prerequisite boundary. |
| prepare-prerequisite-artifact | engineering | Keep | Keep as a non-executing SQL artifact preparation step. |
| prototype | engineering | Keep | No delivery-workflow overlap evidenced. |
| push-target | engineering | Keep | Keep one remote-ref read-back. |
| record-closed-issue-reconciliation | engineering | Investigate | Re-evaluate once recovery receipts are consolidated. |
| remove-ron | engineering | Keep | No delivery-workflow overlap evidenced. |
| research | engineering | Keep | No delivery-workflow overlap evidenced. |
| rss-feeds | engineering | Keep | No delivery-workflow overlap evidenced. |
| resolving-merge-conflicts | engineering | Keep | No delivery-workflow overlap evidenced. |
| setup-matt-pocock-skills | engineering | Optimize | Surface install repair as an executable approved preflight, not a dead-end diagnostic. |
| tdd | engineering | Keep | Preserve implementation feedback loop. |
| to-spec | engineering | Replace | Persist canonical body and unify planning/publication records. |
| to-tickets | engineering | Optimize | Consume the same envelope; retain only decomposition-specific records. |
| triage | engineering | Keep | No delivery-workflow overlap evidenced. |
| verify-target-before-push | engineering | Keep | Keep aggregate verification and push-ready read-back. |
| wayfinder | engineering | Optimize | Reduce duplicated route/handoff wording after router simplification. |
| wiki | engineering | Keep | No delivery-workflow overlap evidenced. |
| wizard | engineering | Keep | Retain human-only external setup guidance. |
| batch-grill-me | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| claude-handoff | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| implement-spec | in-progress | Investigate | Compare its direct route to `implement` before promotion/removal. |
| loop-me | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| retro | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| setup-ts-deep-modules | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| writing-beats | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| writing-fragments | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| writing-shape | in-progress | Investigate | Establish supported lifecycle and routing before promotion/removal. |
| git-guardrails-claude-code | misc | Investigate | Confirm whether current hosts still need the Claude-only guardrail. |
| migrate-to-shoehorn | misc | Investigate | Confirm a supported migration owner before removal. |
| scaffold-exercises | misc | Investigate | Confirm continuing educational use before removal. |
| setup-pre-commit | misc | Investigate | Confirm current setup ownership before removal. |
| daily-journal | personal | Keep | No delivery-workflow overlap evidenced. |
| edit-article | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-architecture-patterns | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-cost-model | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-mvp-plan | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-product-strategy | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-risk-review | personal | Keep | No delivery-workflow overlap evidenced. |
| greenfield-technical-decisions | personal | Keep | No delivery-workflow overlap evidenced. |
| learn-professional-topics | personal | Keep | No delivery-workflow overlap evidenced. |
| obsidian-vault | personal | Keep | No delivery-workflow overlap evidenced. |
| run-issue-workflow | personal | Replace | Own installation preflight and use the operation envelope as normal retry state. |
| start-project | personal | Keep | No delivery-workflow overlap evidenced. |
| workflow-retro | personal | Keep | Use it to measure the vNext workflow after rollout. |
| clarify-needs | productivity | Keep | No delivery-workflow overlap evidenced. |
| confirm-understanding | productivity | Keep | No delivery-workflow overlap evidenced. |
| explain-decision | productivity | Keep | No delivery-workflow overlap evidenced. |
| grill-me | productivity | Keep | No delivery-workflow overlap evidenced. |
| grilling | productivity | Keep | Preserve decision aperture; simplify only its callers. |
| handoff | productivity | Keep | No delivery-workflow overlap evidenced. |
| skill-gardener | productivity | Keep | Keep as the recurring catalog audit owner. |
| teach | productivity | Keep | No delivery-workflow overlap evidenced. |
| to-questionnaire | productivity | Keep | No delivery-workflow overlap evidenced. |
| wait-what | productivity | Keep | No delivery-workflow overlap evidenced. |
| writing-for-agents | productivity | Keep | Use for all approved instruction/routing changes. |

## Recommended implementation slices

1. **Durable producer state:** add canonical body storage to the producer transaction and a compatibility reader for old hash-only transactions.
2. **Run preflight:** consolidate workflow-installation selection, repair preview, and exact evidence read-back behind `run-issue-workflow`.
3. **Single planner record:** replace the planning allocation/registration/handoff/disposal chain while preserving a scoped document writer and content read-back.
4. **Direct decision publication:** add the documentation-only path and update router/README/docs.
5. **Recovery and compatibility cleanup:** retain only the one envelope and mutation receipts for new operations; remove legacy records after their active-operation retention window.

No change is approved by this audit itself. Each slice needs its own implementation plan, migration decision, tests, and package/manifest validation.
