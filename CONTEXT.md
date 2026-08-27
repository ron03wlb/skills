# Matt Pocock Skills

A collection of agent skills (slash commands and behaviors) loaded by Claude Code. Skills are organized into buckets and consumed by per-repo configuration emitted by `/setup-matt-pocock-skills`.

## Language

**Issue tracker**:
The tool that hosts a repo's issues — GitHub Issues, Linear, a local `.scratch/` markdown convention, or similar. Skills like `to-tickets`, `to-spec`, `triage`, and `qa` read from and write to it.
_Avoid_: backlog manager, backlog backend, issue host

**Issue**:
A single tracked unit of work inside an **Issue tracker** — a bug, task, spec, or slice produced by `to-tickets`.
_Avoid_: ticket (use only when quoting external systems that call them tickets, or for a **Decision ticket** — see below)

**Decision ticket**:
A `wayfinder` unit — a child **Issue** of a `wayfinder:map` holding a *question* whose resolution is a decision, not a slice of a build to execute. The **decision** qualifier is what keeps it distinct from an implementation ticket; `wayfinder` introduces the term, then uses "ticket".

**Triage role**:
A canonical state-machine label applied to an **Issue** during triage (e.g. `needs-triage`, `ready-for-afk`). Each role maps to a real label string in the **Issue tracker** via `docs/agents/triage-labels.md`.

### Understanding calibration

**Evidence Set**:
The explicitly named sources treated as authoritative for one bounded understanding calibration.
_Avoid_: Model summary, assumed context, answer key

**Core Proposition**:
One material decision, causal relationship, boundary, or practical implication derived unambiguously from an **Evidence Set** and necessary to calibrate the named scope.
_Avoid_: Trivia, wording recall, compound question

**Evidence Gap**:
An inaccessible, missing, ambiguous, or contradictory part of an **Evidence Set** that prevents one **Core Proposition** from having a reliable answer. It is uncertainty in the evidence, not a user misunderstanding.
_Avoid_: Wrong answer, failed question, knowledge gap

**Alignment Record**:
The read-only result of one bounded understanding calibration, naming its **Evidence Set**, scope, confirmed **Core Propositions**, mismatches, **Evidence Gaps**, and current status.
_Avoid_: Test score, source update, meeting minutes

### Issue delivery

**Issue worktree**:
A dedicated Git worktree and topic branch that contain prerequisite artifact preparation, when required, and the remaining implementation for exactly one dependency-ready **Issue** before integration into the original local target branch.
_Avoid_: Shared execution lane, authorization workspace

**Execution baseline**:
The original target-branch commit captured once when `execute-issue` starts. It is the fixed point for the first Standards and Spec review, not an authorization hash.
_Avoid_: Per-wave hash confirmation, lifecycle Grant

**Planning Seal**:
The local target-branch commit selected as the planning baseline before Spec or ticket work becomes executable. When a new seal commit is needed, it contains only approved glossary and ADR changes owned by that scope. When there is no relevant planning-artifact delta, the current target commit is reused without claiming that all of its contents are planning artifacts; unrelated or mixed dirt remains untouched.
_Avoid_: Dirty-doc commit, lifecycle authorization, execution checkpoint

**Execution completion note**:
The compact human-readable terminal execution state written after one `execute-issue` candidate passes Standards, Spec, and verification. It names the Issue and linked Spec, original target, worktree, topic branch, baseline, final candidate, verification results, and repair-wave count so `close-issue` can resume separately. A later blocked execution state supersedes it.
_Avoid_: Hashed envelope, per-wave checkpoint, full conversation transcript

**Manual integration serialization**:
The operating rule that a human starts only one `close-issue` integration into the same target branch at a time; Issue execution and integrations into other target branches may proceed concurrently. The skill protects the target through isolated composition, collision checks, preservation evidence, and current-target gates; it does not add a queue or lock.
_Avoid_: Automatic closeout chain, workflow scheduler, concurrent writers for the same target branch

**Workflow interface**:
The user-visible skills and explicit handoffs that represent distinct human-owned authority transitions in the development flow. A user invokes `close-issue` with an Issue ID; `close-issue` resolves the tracker state and local identities before calling its internal module. Interface size is judged by the decisions the human must own, not by skill count or Markdown length.
_Avoid_: Workflow implementation, internal helper layout, shortest command chain

**Closeout preservation module**:
The internal read-only module owned and invoked by `close-issue` through one atomic inspection to derive deterministic target identity, dirty-target, candidate-delta, collision, case-semantics, and hook evidence directly from the repository and filesystem. `close-issue` does not precompute and pass those observations separately. Each invocation exchanges schema-versioned JSON through unique strict-UTF-8 input and output files: the final output path must not already exist, and the helper publishes a complete `closeout-preservation-inspection:v1` result only by atomically renaming a helper-owned sibling temporary file. The result contains only inspection status, observed target identity, dirty digest and counts, hook fingerprint, collision outcome, and a stable reason code; it is not a tracker receipt and contains no Issue, execution-state, candidate, receipt-phase, raw-path, or file-content fields. Only a complete trustworthy `SAFE` inspection is successful; classified `COLLISION` or `BLOCKED` results and untrusted output fail closed. It never becomes a **Workflow interface** step and never performs integration, worktree cleanup, receipt mutation, or Issue closure.
_Avoid_: Preservation skill, integration runner, closeout authority, receipt engine

**Ron repository footprint**:
The repository-local Ron configuration, Ron-only instruction text, and inactive or completed `.git/ron-workflow/` metadata left by the retired setup or prior runs. It excludes a current recoverable draft, the Canonical Wiki, tracker history, branches, worktrees, and installed skills.
_Avoid_: All Ron-related history, Wiki content, execution branches

**Ron removal**:
The explicit `/remove-ron` cleanup of one **Ron repository footprint**. It removes only owned local artifacts, commits an actual tracked cleanup diff, and stops on active execution, dirty overlap, or ambiguous ownership without touching external history or delivery state.
_Avoid_: Plugin uninstall, branch cleanup, Issue deletion, full purge

**Integration candidate**:
The exact commit prepared in an isolated temporary worktree from current target `T` and one unchanged reviewed Issue candidate `C`. It is `C` when `C` contains `T`; a history-only two-parent merge with `T`'s exact tree and parents `T`, `C` when `T` already contains `C`; otherwise it is a no-fast-forward merge commit containing both histories.
_Avoid_: Refreshed Issue candidate, conflict-resolution commit, aggregate verification

**Issue integration receipt**:
The read-back closeout record binding one Issue, its latest successful execution-state identity, target-before, reviewed candidate, **Integration candidate**, candidate ancestry, and dirty-target preservation evidence. A verified receipt proves local inclusion and gates exact worktree cleanup and Issue closure; it does not prove aggregate semantics.
_Avoid_: Execution completion note, push authorization, test report

**Push-ready receipt**:
The local read-back `push_ready` record produced only after aggregate Standards/multi-Spec review, required verification, and closed-candidate reachability all pass on one exact target `HEAD`. Any target movement invalidates it.
_Avoid_: Issue integration receipt, push command, production verification

**Execution readiness**:
The state in which an open **Issue** has resolved blockers, clear acceptance and Spec scope, an identifiable original target, and no conflicting worktree owner.
_Avoid_: Approved

**Repository prerequisite**:
A repository-declared condition that must be prepared and verified before affected `execute-issue` work may proceed. A repository that declares none retains the ordinary Issue execution route.
_Avoid_: Generic mandatory preflight, consumer-specific policy

**Prerequisite inspection**:
The optional user-invoked check after a Tracker Spec or child Issue is written that determines whether a **Repository prerequisite** applies and may begin its preparation. It does not replace or change **Delivery routing**.
_Avoid_: Mandatory delivery stage, Spec classification, automatic preflight

**Prerequisite resolver**:
The repository-owned interface named by repository instructions that discovers, prepares, and verifies that repository's **Repository prerequisites** without exposing consumer-specific rules to generic skills. No declaration means prerequisites are not required; a declared but unusable resolver is a blocker.
_Avoid_: Universal workflow config, generic database runner, free-form fallback guess

**Prerequisite resolver adoption**:
The explicit, one-time `setup-pre-execute-issue` change that atomically adds or updates the minimum repository instructions, policy, resolver implementation, and test fixture needed for a consumer repository to declare a **Prerequisite resolver**. It performs only safe repository-local validation and never executes SQL, mutates a database, changes an Issue, or becomes a runtime router. If no concrete manual prerequisite exists, setup is unnecessary and the repository remains unchanged. If the complete resolver contract cannot be validated, no active declaration or placeholder adoption is left behind.
_Avoid_: `ask-ron`, automatic setup, runtime prerequisite execution, generic resolver framework

**Prerequisite artifact**:
An Issue-owned repository artifact explicitly required to prepare a **Repository prerequisite** before the related **Manual prerequisite action**. It may begin the Issue candidate identity chain only when it can be prepared without crossing into the remaining product implementation and passes repository-defined static validation.
_Avoid_: External-action evidence, full Issue implementation, generated scratch output

**Manual prerequisite action**:
An external mutation that the repository requires a human to perform after preparation and before prerequisite readiness can be verified. The Issue workflow may pause for and verify its evidence but never performs the action itself.
_Avoid_: Agent-applied prerequisite, implementation step

**Prerequisite target verification**:
The single repository-defined read-only check that proves the declared outcome of a **Manual prerequisite action** on its non-sensitive target identity. Human attestation may trigger the check but cannot grant readiness by itself.
_Avoid_: SQL replay, polling loop, full integration suite

**Prerequisite receipt**:
A minimal append-only `WAITING_MANUAL` or `READY` tracker record proving the current state of one Issue's **Repository prerequisite** against its **Protected prerequisite identity**. It is read back once when written, authorizes only prerequisite handoff, and becomes invalid when protected evidence drifts.
_Avoid_: Execution completion note, Issue integration receipt, production credential

**Protected prerequisite identity**:
The exact Issue, prerequisite commit, artifact paths and hashes, resolver or policy identity, and non-sensitive manual target identity protected by a `READY` **Prerequisite receipt**. Later candidate commits are allowed while the prerequisite commit remains an ancestor and every protected value still matches.
_Avoid_: Entire candidate HEAD, implementation commit, database credential

**Executable Issue**:
An open **Issue** that is one dependency-ready execution unit with numbered **Acceptance Criteria**, one embedded **Implementation Plan**, a valid **Planning Seal**, and the target identity needed by `execute-issue`. A **Single-Issue Spec** is executable itself; `/to-tickets` produces executable child Issues for a **Multi-Issue Spec**.
_Avoid_: Parent Multi-Issue Spec, implementation prompt, ready label alone

**Necessary discovery**:
An unplanned caller, test, configuration, migration companion, generated file, or similar dependency proved necessary to complete an existing plan step and unchanged **Acceptance Criterion**. `execute-issue` includes it automatically, and the candidate diff remains the path evidence.
_Avoid_: Scope expansion, exhaustive path update, tracker path inventory

**Material plan deviation**:
An in-scope change to the planned seam, implementation steps, data path, or risk handling that preserves the existing behavior and **Acceptance Criteria**. Execution continues and the completion note records the reason and covered criteria.
_Avoid_: Necessary discovery, scope change, silent redesign

**Scope change**:
A discovery that changes behavior, **Acceptance Criteria**, target, exclusions, independently deliverable outcomes, or ownership. Execution stops and returns to `/to-spec` or `/to-tickets` instead of treating it as implementation freedom.
_Avoid_: Material plan deviation, necessary dependency, review repair

**Late prerequisite discovery**:
Source evidence found after Entry that contradicts an earlier `NOT_REQUIRED` prerequisite result. It pauses execution for the same-worktree prerequisite flow when scope and schema outcome remain unchanged, or becomes a **Scope change** when they do not.
_Avoid_: Silent migration, automatic pre-execution, schema-dependent verification

**Tracker Spec**:
A Spec published by `/to-spec` into the configured **Issue tracker**, including a tracker implemented as local `.scratch/` files. It participates in **Delivery routing**, Planning Seal, execution, and closeout regardless of storage medium.
_Avoid_: Remote Spec, local file means standalone, untracked plan

**Standalone Spec**:
An approved local Spec or plan that has not been published into the configured **Issue tracker** and does not participate in tracker delivery lifecycle. It may be implemented directly through `/implement`.
_Avoid_: Local Tracker Spec, Executable Issue, unpublished draft mistaken for tracker authority

**Single-Issue Spec**:
A Spec whose complete acceptance scope is one cohesive outcome that one **Issue worktree**, one execution context, one reviewed candidate, and one closeout can complete. Cross-module reach, risk, file count, or estimated effort alone do not make it multi-Issue.
_Avoid_: Small feature, simple change, one-file Spec

**Multi-Issue Spec**:
A Spec that requires more than one independently executable **Issue** because its outcomes are independently verifiable or deliverable, have blocking edges, or cannot be completed safely in one execution, review, and closeout cycle.
_Avoid_: Large feature, complex change, multi-file Spec

**Implementation Plan**:
The ordered, source-grounded execution design embedded in the authoritative tracker body of a **Single-Issue Spec**. Its file paths and symbols are non-exhaustive expected touchpoints, not an allowlist; it maps that Spec's acceptance scope to implementation and verification work that one `execute-issue` run can complete.
_Avoid_: Separate plan file, planning comment, ticket breakdown, implementation decision list, exhaustive file manifest

**Delivery routing**:
The `/to-spec`-owned classification of a published Spec as **Single-Issue Spec** or **Multi-Issue Spec** and selection of its one executable next command. Other skills consume that result without independently reclassifying the Spec.
_Avoid_: Router suggestion, duplicated sizing rule, executor routing guess

**User Outcome**:
An optional concise statement of actor and value that preserves why a Spec matters. A Spec uses at most three when they add context not already clear from its problem and solution; they never define done.
_Avoid_: Extensive user-story inventory, Acceptance Criterion, implementation requirement

**Acceptance Criterion**:
A stable-ID, objectively verifiable observable condition that defines when Spec scope is done. It is the sole authority mapped by the **Implementation Plan**, verification, review, and `execute-issue`; negative, error, boundary, and cross-system behavior are included when material.
_Avoid_: User story, implementation step, test case, unnumbered requirement

### Context and delegation

**Issue Context Packet**:
An ephemeral, rebuildable, non-authoritative set of pointers needed to execute one **Issue** in a bounded context.
_Avoid_: Context dump, execution checkpoint

**Issue Progress Checkpoint**:
A durable **Issue** comment written only at a recovery-relevant event or final completion, allowing another session to resume without replaying conversation history.
_Avoid_: Activity log, Issue Context Packet

**Subagent Task Brief**:
A dynamic delegation contract generated from an **Issue Context Packet**, defining one goal, ownership, constraints, evidence, and return format for one subagent.
_Avoid_: Subagent spec

**Decision Explanation Packet**:
The minimal non-authoritative input given to a fresh read-only sidecar to explain one unresolved decision without loading the full workflow context.

**Decision Card**:
A bounded plain-language comparison returned by a decision-explanation sidecar; it informs the user but does not become a decision until the user selects an option.

**Canonical Wiki**:
The reviewed repository-local Markdown that owns the current business-knowledge baseline on the target branch, independently of the tool that proposed its content.
_Avoid_: Native Wiki, generated copy, publication site, engine state

**Canonical Wiki root**:
The repository-local directory selected for the **Canonical Wiki** from an explicit user path, the single unambiguous existing knowledge root, or the default `wiki/` path when none exists. Multiple plausible roots require a user decision; selection does not require a workflow configuration file or config hash.
_Avoid_: Ron-configured Wiki path, generated branch, native Wiki repository

**Wiki control skill**:
The single user-invoked `/wiki` entry that inspects or updates the **Canonical Wiki** independently of Issue delivery. A direct invocation authorizes one bounded Wiki-only local edit, validation, independent review, repair, and commit cycle.
_Avoid_: Issue delivery stage, closeout prerequisite, implicit background updater

**Wiki validation pipeline**:
A deterministic check that validates the Wiki page contract, claim-to-source mappings, source-locator syntax and resolvability, links, navigation, and any existing docs build. It may generate temporary comparison artifacts but never judges semantic correctness or publishes.
_Avoid_: Semantic reviewer, auto-fix commit, semantic generator, publication job

**Wiki semantic review**:
An independent read-only human or agent review of one fixed Wiki candidate that judges whether it agrees with the prior Wiki and current repository code and tests. The content author or writable Coordinator cannot self-accept; a fresh reviewer produces the semantic result, and the Coordinator verifies its evidence.
_Avoid_: CI pass, author self-review, engine approval, unfixed working tree, generic clean result

**Wiki validation result**:
A compact result-first report backed internally by the exact candidate or target identity while reporting mechanical and semantic proof separately. A generic `clean` result is valid only when deterministic validation is `clean` and independent semantic review is `reviewed-clean`. The default human view says only that validation passed; technical identities stay in durable evidence and appear only on request or when needed to explain a finding.
_Avoid_: Workflow recap, mandatory SHA explanation, evidence dump, combined unproved clean status

**Confirmed Wiki finding**:
A deterministic validation failure or a semantic claim contradicted by specific current repository evidence and verified by the Coordinator. Reviewer preference, unsupported inference, duplicate reporting, and tool failure do not qualify.
_Avoid_: Reviewer opinion, majority vote, retry count

**Wiki repair wave**:
One pass in which the Wiki writer addresses one or more **Confirmed Wiki findings**, reruns the affected checks, and produces a new fixed candidate for review. One direct `/wiki` invocation permits at most ten waves before stopping without a clean commit.
_Avoid_: New delivery authorization, unlimited repair loop, reviewer retry

**Canonical Wiki scope**:
The current behavior, rules, roles, states, exceptions, and source-linked technical context needed to plan future changes. It links to, but does not duplicate, glossary, ADR, feature Spec, API, user, or operational authorities.
_Avoid_: Documentation archive, spec store, API reference, runbook collection

**Wiki topic page**:
A Canonical Wiki page organized around one stable business topic or end-to-end flow, independently of code-directory boundaries, with links to the implementation sources that support its current-behavior claims.
_Avoid_: Code-module mirror, file inventory, Issue diary

**Wiki page contract**:
The minimum review shape shared by every **Wiki topic page**: purpose and scope, current behavior, rules and invariants, applicable states and exceptions, dependencies, and sources.
_Avoid_: Generator-specific template, optional evidence, empty boilerplate

**Wiki material claim**:
A statement about current behavior, a rule, invariant, state, exception, role, permission, ownership boundary, or dependency that could affect change planning or acceptance. Each material claim maps explicitly to one or more source entries.
_Avoid_: Every prose sentence, unsupported summary, page-level bibliography only

**Wiki source locator**:
A structured source reference with required `path`, `kind`, and `value` fields plus an optional non-authoritative `line_hint`. `path` is a normalized repository-relative file path; `kind` is one of `symbol`, `test`, `config-key`, `json-pointer`, or `heading`; `value` is the stable within-file identifier resolved by the matching deterministic adapter. It identifies committed `HEAD` evidence for a **Wiki material claim**. A missing or unsupported resolver produces `not-verifiable`, never a pass.
_Avoid_: Line number only, free-form locator text, duplicated per-citation commit SHA, external-only implementation evidence

**Wiki source boundary**:
The committed `HEAD` code, tests, and configuration that an independent `/wiki` run may describe. Relevant uncommitted source changes or pre-existing edits under the **Canonical Wiki root** stop the run; unrelated dirty files remain untouched.
_Avoid_: Uncommitted behavior, clean-whole-repository requirement, unrelated staging

**Wiki source resolver profile**:
The deterministic capability set that maps a **Wiki source locator** kind and file type to one exact syntactic target. The bundled resolver supports Markdown/MDX headings, strict-JSON pointers, exact JSON/YAML/TOML/`.env` config keys, and Python/JavaScript/TypeScript declaration and test names. Unsupported adapters fail closed.
_Avoid_: Semantic proof, fuzzy search, comments as declarations, unpinned external parser

**Wiki sync**:
The bounded local operation in which the **Wiki control skill** updates only affected Wiki topics from repository evidence, validates them, obtains independent semantic review, repairs confirmed findings for at most ten **Wiki repair waves**, and records the clean result in one local commit.
_Avoid_: Issue closeout stage, full regeneration, silent target drift

**Wiki auxiliary tool**:
An optional, non-authoritative interface or derived index used to read, visually edit, review, or search the **Canonical Wiki**. It does not validate completion, publish canonical content, or turn its own UI state into review evidence.
_Avoid_: Wiki authority, review authority, required runtime

**Execution code review**:
The existing Matt `code-review` workflow run against one fixed implementation candidate and its originating Issue or linked Spec. It reports Standards and Spec separately; an Issue is clean only when both axes have no **Confirmed code review finding**, without any Wiki review axis.
_Avoid_: Custom execute reviewer protocol, focused/full profile, Wiki review

**Confirmed code review finding**:
A Standards violation or Spec mismatch supported by exact repository or Spec evidence and verified by the Coordinator. Reviewer preference, unsupported inference, duplicate reporting, and tool failure do not qualify.
_Avoid_: Reviewer opinion, Wiki finding, majority vote

**Material repair wave**:
One bounded pass in which the single writable owner addresses confirmed Standards or Spec findings inside the unchanged Issue scope, verifies the repair, and produces a new candidate. One `execute-issue` invocation permits at most ten waves; only an explicit later invocation starts a new limit, and no durable counter is maintained.

**Prerequisite artifact repair wave**:
One bounded pass in which `pre-execute-issue` repairs confirmed repository-defined syntax or static-validation failures inside the declared **Prerequisite artifact** and reruns the affected check. One invocation permits at most five waves; initial generation, retries without an artifact edit, and tool failures do not count.

**Local checkpoint commit**:
An Issue-owned local commit made after one coherent vertical slice or review repair passes its relevant verification. Push, target integration, deployment, and unrelated paths remain excluded during `execute-issue`.

## Relationships

- An **Evidence Set** grounds the **Core Propositions** for one bounded calibration
- A core **Evidence Gap** prevents an **Alignment Record** from claiming full alignment
- An **Alignment Record** reports only the scope actually calibrated
- An **Issue tracker** holds many **Issues**
- An **Issue** carries one **Triage role** at a time
- A **Decision ticket** is an **Issue** (a child of a `wayfinder:map`)
- **Ron removal** deletes only the exact **Ron repository footprint** and leaves historical or active delivery objects intact
- A dependency-ready **Issue** receives one **Issue worktree**, **Execution baseline**, and writable owner
- `pre-execute-issue` creates or reuses the **Issue worktree** only after `discover` returns `REQUIRED`; `NOT_REQUIRED` and discovery-time `BLOCKED` create no worktree
- `/to-spec` creates or reuses the primary or revised **Planning Seal** before a Spec becomes ready
- `/to-spec` is the sole owner of **Delivery routing**: it routes a **Single-Issue Spec** directly to `/execute-issue <Spec-ID>` and routes a **Multi-Issue Spec** to `/to-tickets <Spec-ID>`
- After a Tracker Spec or child Issue is written, the human may invoke `pre-execute-issue` for **Prerequisite inspection** without making it a mandatory delivery stage
- Authoritative `discover` runs only after the exact Tracker Spec or child Issue is fully published and before worktree creation or product implementation; planning may note a risk but never supplies a second prerequisite verdict
- Repository instructions are the discovery seam for a **Prerequisite resolver**; generic skills neither require a universal workflow config nor guess a missing declared adapter
- `setup-pre-execute-issue` owns **Prerequisite resolver adoption** only when explicitly invoked; existing repositories do not rerun `ask-matt`, and no parallel `ask-ron` router is introduced
- **Prerequisite resolver adoption** is atomic: an incomplete `discover`/`prepare`/`verify` contract leaves no active repository declaration, placeholder resolver, or TODO adoption state
- A repository without a concrete manual prerequisite performs no **Prerequisite resolver adoption** and follows the ordinary `execute-issue` route with an undeclared resolver yielding `NOT_REQUIRED`
- A **Prerequisite resolver** exposes one repository-owned command with `discover`, `prepare`, and `verify` operations; `pre-execute-issue` and `execute-issue` share the same read-only `discover`, while only `pre-execute-issue` may use the other operations
- `prepare` may write and repair only the declared **Prerequisite artifact**, and cannot produce `WAITING_MANUAL` until repository-defined syntax and static validation pass
- `/to-spec` classifies automatically from Spec and source evidence; only material ambiguity that can change **Delivery routing** permits one blocking question with a recommendation, and uncertainty never defaults to either Single-Issue or Multi-Issue
- `ask-matt`, `/to-tickets`, and `execute-issue` consume **Delivery routing** without duplicating or overriding its classification criteria
- `/implement` accepts an explicitly selected **Standalone Spec** for direct-branch work, while every **Tracker Spec**, including a local-file tracker record, follows `/to-spec`-owned **Delivery routing**
- A **Single-Issue Spec** owns one embedded **Implementation Plan** in the same tracker record; no separate plan artifact or comment carries execution authority
- A **Multi-Issue Spec** keeps only the overall outcome, cross-Issue constraints, and decomposition rationale; `/to-tickets` gives each child **Executable Issue** its own compact **Acceptance Criteria**, **Implementation Plan**, verification, blocking edges, and Planning baseline
- `/to-tickets` outputs `/execute-issue <Issue-ID>` only for the dependency-ready frontier and never prompts execution of blocked Issues
- A Spec may contain at most three non-authoritative **User Outcomes**, while its numbered **Acceptance Criteria** are the only done and traceability authority
- **Acceptance Criteria**, **Implementation Plan** steps, and verification use compact many-to-many `Covers: AC-n` references: every criterion has at least one step and verification, every step covers at least one criterion, and no separate matrix or orphan is allowed
- Before publication, `/to-spec` compares the criterion IDs with the IDs covered by plan steps and verification and stops on any missing ID or uncovered step; this is a prompt-level invariant backed by contract tests, not a separate parser or matrix artifact
- `execute-issue` applies **Necessary discovery** automatically without duplicating the candidate's path list in tracker evidence, records only **Material plan deviations**, and returns every **Scope change** to planning
- A **Late prerequisite discovery** preserves coherent checkpoints and stops before schema-dependent verification; unchanged scope routes to user-invoked `pre-execute-issue`, while changed schema outcome or acceptance returns to planning
- A one-outcome Spec that cannot fit one execution and review cycle is still a **Multi-Issue Spec**; `/to-tickets` prefers independently verifiable vertical slices and uses expand-contract when no single wide change can remain green as a vertical slice
- `/to-tickets` reuses that seal or creates one successor for approved in-Spec planning changes; public scope expansion returns to `/to-spec`
- `execute-issue` verifies the **Planning Seal** is an ancestor of its execution baseline and never creates or repairs the seal
- `execute-issue` performs read-only **Prerequisite inspection** at Entry: undeclared prerequisites preserve the ordinary route, a current required receipt permits execution, and missing or stale required evidence stops with an instruction to invoke `pre-execute-issue`
- `execute-issue` never invokes `pre-execute-issue`, prepares its artifact, or performs its **Manual prerequisite action** automatically
- **Execution readiness** requires satisfied blockers and clear Issue or linked-Spec scope
- A required **Repository prerequisite** reaches `execute-issue` only through a current read-back **Prerequisite receipt**; absence of repository declaration preserves the ordinary route
- A **Prerequisite receipt** records only recovery-relevant transitions in the existing Issue tracker; Issue body and repository source never become mutable environment-state stores
- `NOT_REQUIRED`, `REQUIRED`, and `BLOCKED` are transient resolver results, never empty or failure **Prerequisite receipts**
- `READY` binds the **Protected prerequisite identity**, not the evolving candidate `HEAD`; unrelated implementation commits do not trigger repeated manual action or verification
- `pre-execute-issue` may prepare a **Prerequisite artifact** but stops if doing so requires the remaining product implementation
- A validated **Prerequisite artifact** is committed alone on the Issue topic branch before `WAITING_MANUAL`; later `execute-issue` reuses that exact worktree and candidate ancestry
- `pre-execute-issue` permits at most five **Prerequisite artifact repair waves** and never hands an invalid artifact to the human
- A **Manual prerequisite action** remains human-owned even when prerequisite preparation and verification are agent-assisted
- `READY` requires one successful **Prerequisite target verification**; failure or unavailable access preserves `WAITING_MANUAL`, returns transient `BLOCKED`, and creates no failure receipt
- An **Issue Context Packet** may be rebuilt from the Issue and latest **Issue Progress Checkpoint**
- An **Execution completion note** hands one unchanged reviewed candidate from `execute-issue` to separately invoked `close-issue`
- The **Workflow interface** keeps distinct human-owned authority transitions explicit; optimization deepens internal implementation rather than merging transitions only to reduce skill count or Markdown length
- The public `close-issue` invocation accepts an Issue ID and owns tracker lookup, execution-state identity `E`, blocker checks, candidate `C`, integration candidate `I`, receipts, cleanup, and closure; its **Closeout preservation module** receives only the already resolved repository/worktree location and immutable local identities needed for inspection and never reads the Issue tracker
- **Manual integration serialization** permits only one integration into the same target branch at a time; other target branches may proceed concurrently
- The **Closeout preservation module** supplies read-only deterministic evidence to `close-issue`; `close-issue` alone owns merge, receipt transitions, exact worktree cleanup, and Issue closure
- `close-issue` uses the same single atomic **Closeout preservation module** inspection before and after integration; the module never exposes separate snapshot, collision, or hook operations that could observe different repository states
- The **Closeout preservation module** derives target identity, dirty state, the complete candidate delta, repository/filesystem case semantics, collisions, and effective hook evidence itself; `close-issue` never supplies separately precomputed path lists or fingerprints
- `close-issue` continues only when the **Closeout preservation module** exits successfully with the expected schema, `SAFE` status, and every required field; classified unsafe state, command failure, missing fields, malformed output, or schema mismatch stops without inference
- Each **Closeout preservation module** invocation uses unique strict-UTF-8 input and output files, rejects a pre-existing final output, and publishes the complete JSON result by atomically renaming a helper-owned sibling temporary file; stdout and a reusable repository-local result file are not evidence transports
- A classified `COLLISION` or `BLOCKED` result may publish complete diagnostic JSON with a non-zero exit but never authorizes continuation; a crash or untrusted failure leaves the final output absent, and `close-issue` removes only files owned by that invocation
- The **Closeout preservation module** returns its own narrow `closeout-preservation-inspection:v1` evidence schema; `close-issue` combines that evidence with the Issue ID, execution-state identity `E`, target branch, candidate `C`, integration candidate `I`, and receipt phase to write and read back the separate `dirty-target-preservation:v1` tracker receipt
- `close-issue` prepares one **Integration candidate** without changing the reviewed Issue candidate, fast-forwards the target, proves the **Issue integration receipt**, removes the clean registered **Issue worktree**, and closes the Issue without repairing product code
- `/verify-target-before-push` proves all relevant closed candidates are reachable, performs aggregate review and verification on exact target `HEAD`, and writes a current **Push-ready receipt** without pushing
- A **Subagent Task Brief** is derived from one **Issue Context Packet**
- A **Decision Explanation Packet** produces a non-authoritative **Decision Card**
- A **Wiki validation result** combines a deterministic **Wiki validation pipeline** result with an independent **Wiki semantic review** result without merging their proof authority
- The **Wiki control skill** resolves a root, validates and semantically reviews bounded Wiki-only edits, and commits only a clean Wiki diff
- Issue delivery does not invoke the **Wiki control skill** or inherit its validation and review obligations
- A **Wiki auxiliary tool** may consume the **Canonical Wiki** but never inherits Wiki mutation or review authority
- Final execution review and the **Execution completion note** bind the unchanged reviewed Issue candidate; closeout separately binds the resulting **Integration candidate**
- **Execution code review** supplies the Standards and Spec results used by `execute-issue`
- `execute-issue` owns implementation, Standards/Spec review, and the **Material repair wave** loop for one Issue

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
- "Issue Execution Packet" and "Issue Execution Checkpoint" were previously used for overlapping context concepts — resolved as **Issue Context Packet** for ephemeral input and **Issue Progress Checkpoint** for durable recovery output.
