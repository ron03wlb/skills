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
A dedicated Git worktree and topic branch that contain the implementation for exactly one dependency-ready **Issue** before integration into the original local target branch.
_Avoid_: Shared execution lane, authorization workspace

**Issue target branch**:
The local branch recorded in an **Issue** when its **Issue worktree** is created, identifying the branch from which the Issue work began. It is the default and only implicit merge destination for `close-issue`; choosing another destination requires an explicit workflow decision rather than inference.
_Avoid_: Current checked-out branch, latest moving branch, inferred merge destination

**Execution baseline**:
The exact target-branch commit captured once when one explicit `execute-issue` attempt starts. It is that attempt's fixed point for Standards and Spec review; a human-authorized rerun after a real merge conflict starts a new attempt from the latest target without creating another Issue branch or worktree.
_Avoid_: Per-wave hash confirmation, lifecycle Grant

**Planning Seal**:
The local target-branch commit selected as the planning baseline before Spec or ticket work becomes executable. When a new seal commit is needed, it contains only approved glossary and ADR changes owned by that scope. When there is no relevant planning-artifact delta, the current target commit is reused without claiming that all of its contents are planning artifacts; unrelated or mixed dirt remains untouched.
_Avoid_: Dirty-doc commit, lifecycle authorization, execution checkpoint

**Execution completion note**:
The compact human-readable terminal execution state written after one `execute-issue` candidate passes Standards, Spec, and verification. It names the Issue and linked Spec, **Issue target branch**, worktree, topic branch, attempt baseline, final candidate, verification results, and repair-wave count so `close-issue` can resume separately. Target-branch movement alone does not supersede it; a later successful explicit attempt publishes the new current note.
_Avoid_: Hashed envelope, per-wave checkpoint, full conversation transcript

**Issue contribution**:
The exact commit range from one **Execution baseline** to the reviewed candidate bound to an Issue by its **Execution completion note**. Git SHA and ancestry define the mapping; valid contribution ranges may overlap, and commit-message text is ignored.
_Avoid_: Commit-message tag, merge-message ownership, guessed Issue mapping

**Workflow-required documentation artifact**:
A non-contract plan, execution log, or equivalent documentation artifact required by repository or skill instructions while executing one Issue. When created or changed only in that Issue worktree and committed inside its reviewed candidate range, the **Issue contribution** owns it without expanding product scope.
_Avoid_: Public-contract documentation, arbitrary Markdown change, direct target edit

**Workflow artifact declaration**:
The prospective `workflowArtifacts` list in an **Execution completion note**, containing one exact repository-relative path, requirement source, and purpose for each **Workflow-required documentation artifact**, or an explicit empty list. It supplies reviewable scope classification, not separate contribution authority.
_Avoid_: Path glob, coverage receipt, legacy-note requirement

**Closed Issue evidence reconciliation**:
The append-only, human-authorized correction that may admit one already-closed **Issue contribution** to a **Target verification set** without declaring its historical candidate implementation-complete. Its original **Execution completion note** remains immutable and invalid when that note records non-passing final verification.
_Avoid_: Retroactive completion, verification waiver, Direct target contribution recovery

**Closed Issue reconciliation recovery**:
The confirmation-gated recovery prepared while `verify-target-before-push` derives members after freezing its exact range, only after read-only diagnostics and remedy evidence satisfy **Closed Issue evidence reconciliation** eligibility. After exact human confirmation, the verifier automatically invokes model-invoked `record-closed-issue-reconciliation`, then starts fresh from Entry and runs aggregate verification once without requiring another slash command.
_Avoid_: Separate public command, attest-target-contribution, in-place gate continuation

**Closed Issue reconciliation record**:
The append-only read-back `closed_issue_evidence_reconciliation:v1` tracker comment written only to the affected closed Issue's ordered history. It binds that Issue and immutable completion note, its target branch, execution baseline, candidate and single failure, one **Reconciliation remedy Issue** and candidate, and exact human authority; aggregate range refs and verification results are omitted so each fresh verifier independently proves current reachability and quality.
_Avoid_: Push-ready receipt, range-bound exception, historical completion replacement, edited correction

**Closed Issue command representation reconciliation**:
The narrow append-only, human-confirmed recovery for one immutable completion entry that is non-executable only because it contains one unambiguous placeholder. The existing reconciliation helper may map it to the unique repository-required literal command only when a later descendant Issue records that exact command passing and current target verification reruns it successfully; the original note remains invalid, and the record grants selected-range eligibility only.
_Avoid_: Command guessing, prose normalization, retroactive completion

**Reconciliation diagnostic**:
A non-authorizing exact-baseline and exact-candidate probe that compares one failed command through a human-readable structured fingerprint: exit code, failure count, ordered failure identities, source locators, and assertion or error identities. Variable timing, duration, temporary paths, and stack noise are excluded; an expected matching failure is provenance evidence, never passing verification or merge authority.
_Avoid_: Verification result, baseline-failure waiver, normal closeout gate

**Reconciliation verification**:
The authorization-bearing exact-target verification for one **Closed Issue evidence reconciliation**. Every command must pass before the affected **Issue contribution** may enter the **Target verification set**.
_Avoid_: Candidate diagnostic, partial pass, historical completion proof

**Reconciliation remedy Issue**:
The exact closed **Executable Issue** whose published scope and delivered diff explicitly correct the historical failure named by a **Closed Issue evidence reconciliation**. Its valid passing candidate and the affected candidate must both be reachable from the reconciliation's exact aggregate target.
_Avoid_: Coincidental target pass, human cause attestation, Direct target contribution

**Direct target contribution**:
An exact material target-branch commit or commit set containing only explicit human-directed, non-product workflow or governance maintenance that is outside an **Executable Issue** by design and not explained by an **Issue contribution**, referenced **Planning Seal**, or necessary merge topology. A matching **Direct target contribution record** may admit it to a **Target verification set**, but active behavior, source, tests, configuration, dependencies, migrations, security, data, public APIs, and every mixed commit are ineligible.
_Avoid_: Product implementation, partial-path attestation, SHA allowlist, retroactive completion note

**Direct target contribution record**:
The append-only read-back `direct_target_contribution:v1` tracker comment on the exact **Tracker Spec** or **Issue** that owns a **Direct target contribution**. It binds explicit human authority, scope, target, and commit identity without claiming review, verification, or push readiness; Git owns ancestry and the aggregate gate proves quality.
_Avoid_: Local Git note, repository manifest, verifier-created exception, historical test claim

**Direct target contribution recovery**:
The confirmation-gated recovery triggered only when a frozen `verify-target-before-push` coverage check reports exact uncovered material commits and every proposed commit satisfies **Direct target contribution** eligibility. The active workflow prepares the owner, scope, target, commit identities, and record draft; after one exact human confirmation, a separate model-invoked attestation helper writes and reads back the **Direct target contribution record**, then automatically starts a fresh target verification from Entry.
_Avoid_: Silent or proactive attestation, manual slash-command requirement, non-coverage failure recovery, in-place gate continuation

**Target integration serialization**:
The target-scoped rule that permits only one `close-issue` writer for the same **Issue target branch** at a time, whether started directly by a human or by an authorized **DAG Run**. Issue executions and writers for other targets may proceed concurrently; advancing the target does not invalidate successful execution state.
_Avoid_: Global execution lock, concurrent writers for the same target branch

**DAG Run**:
A bounded orchestration attempt for one **Tracker Spec** and exact **Issue target branch**. A Single-Issue Spec forms one node bound directly to the Spec; a Multi-Issue Spec uses one read-back **Decomposition publication record**, dispatches its dependency-ready frontier in parallel, serializes closeout per target, and recomputes readiness after every **DAG node success**.
_Avoid_: Separate Single-Issue runner, background repository automation, unbounded worker pool, UI session

**DAG Run Grant**:
The explicit human authority binding one **DAG Run** to its **Tracker Spec**, **Issue target branch**, and **Decomposition publication record** when the Spec is Multi-Issue. It permits automatic Issue execution and closeout until success or a defined stop, but never grants push, deploy, external-prerequisite execution, scope expansion, or ambiguous-state repair.
_Avoid_: Per-child close approval, push authorization, blanket repository authority

**DAG node success**:
The child state in which its reviewed candidate is reachable from the **Issue target branch**, its registered **Issue worktree** is absent, and its Issue is closed. Only this state releases its outgoing blocker edges; `implementation_complete` or `worker_done` alone does not.
_Avoid_: Execution completion, worker completion, passing tests alone

**DAG run state**:
The run-level lifecycle value `RECONCILING`, `RUNNING`, `PAUSING`, `PAUSED`, `BLOCKED`, `STOPPING`, `STOPPED`, or `SUCCEEDED`. It describes coordinator progress and control authority without replacing any Issue's **DAG node state**.
_Avoid_: Aggregate child status, panel status, worker status

**DAG node state**:
The Issue-level lifecycle value `PENDING`, `READY`, `DISPATCHED`, `EXECUTING`, `RETRYING`, `IMPLEMENTATION_COMPLETE`, `CLOSING`, `SUCCEEDED`, `BLOCKED`, or `FAILED`. It is reduced from blocker, dispatch, execution-note, close-progress, Git, worktree, and tracker evidence rather than inherited from the **DAG run state**.
_Avoid_: Run state, UI badge, worker claim

**DAG delivery success**:
The terminal delivery state of one **DAG Run**: a Single-Issue Spec has **DAG node success**, or a Multi-Issue Spec has every child at **DAG node success** and its parent closed after read-back validation. It does not imply aggregate target verification, a **Push-ready receipt**, push, or deployment.
_Avoid_: Last child closed, push ready, deployed

**DAG branch isolation**:
The failure rule that keeps a failed child and its descendants blocked while independent dependency-ready children continue in the same **DAG Run**. A dirty target, merge conflict, changed or expired authority, contract drift, or ambiguous tracker or Git evidence pauses the whole run instead of guessing or repairing state.
_Avoid_: Fail-fast whole run, ignoring failed dependencies, inferred recovery

**DAG scheduling authority**:
The published blocker edges that alone determine which Issues are dependency-ready during a **DAG Run**. Expected path, symbol, or module overlap may be reported as a warning but never creates an inferred edge or changes execution order.
_Avoid_: Path-overlap dependency, scheduler-invented blocker, title-based ordering

**DAG retry budget**:
The maximum of three dispatch attempts allowed for one Issue after transient worker or terminal failure inside a **DAG Run**. `implementation_blocked`, merge conflict, Scope change, authority or contract mismatch, and ambiguous evidence stop immediately and never consume or trigger an automatic retry.
_Avoid_: Review repair wave, semantic retry, unlimited restart

**DAG concurrency limit**:
The **DAG Run Grant** value `max_parallel` limiting simultaneous Issue execution dispatches, with a default of three. Serialized `close-issue` work does not consume an execution slot and still permits only one writer per **Issue target branch**.
_Avoid_: Worker count guess, close-writer limit, unlimited fan-out

**DAG control revision**:
A monotonic read-back record of a deliberate control-setting change made while a **DAG Run** is paused. `max_parallel` and other mutable run controls never change silently while the run is active.
_Avoid_: Live configuration drift, UI-local setting, unrecorded override

**DAG run reconciliation**:
The re-entrant entry behavior of `/run-issue-workflow <Spec-ID>` or an unambiguous no-argument resume that rebuilds one run's current state from the Spec, any **Decomposition publication record**, tracker history, Git ancestry, registered worktrees, and Codex task evidence. It recognizes valid manual progress, resumes partial closeout, skips **DAG node success**, and selects only the current dependency-ready unfinished Issues without trusting stale worker or UI state.
_Avoid_: Run reset, replay from the first Issue, stale task-status resume

**DAG run selection**:
The entry rule that `/run-issue-workflow <Spec-ID>` starts or resumes that exact Spec, while no-argument `/run-issue-workflow` resumes only the repository's unique non-terminal Run. Zero candidates require a Spec ID, and multiple candidates require explicit selection; the command never guesses a new Spec from the global `ready-for-agent` set.
_Avoid_: Global queue picker, most-recent guess, title-based selection

**DAG run identity**:
The immutable tuple binding a **DAG Run** to one Spec ID and approved scope, one **Issue target branch**, one Single-Issue or Multi-Issue classification, and, for Multi-Issue, one exact **Decomposition publication record** with its child mapping and blocker edges. Any tuple change invalidates the current **DAG Run Grant** rather than mixing work across revisions.
_Avoid_: Run title, current UI selection, latest tracker contents

**DAG cooperative pause**:
The control state that immediately prevents new Issue dispatches and new `close-issue` actions while allowing already-dispatched workers to reach a stable completion, blocked, or failed result. It never kills a worker or removes a worktree; Resume re-reads Git, tracker, grant, and DAG evidence before taking another action.
_Avoid_: Forced cancellation, process suspension, UI-only pause

**DAG graceful stop**:
The terminal control transition that revokes the current **DAG Run Grant**, starts no new execution or closeout, and lets already-dispatched workers settle before the control engine records stopped state and closes its **DAG control bridge**. It never kills workers, removes worktrees or branches, rolls back candidates, or closes unfinished Issues; a later explicit invocation may reconcile the evidence and create a new grant.
_Avoid_: Force abort, repository cleanup, permanent cancellation

**DAG stop diagnosis**:
The read-back explanation attached to every blocked, failed, or run-paused state, binding a stable reason code, exact evidence, attempted recovery and retry count, why no legal automatic transition remains, affected and unaffected nodes, the next owner, and the predicates required for Resume.
_Avoid_: Free-form error log, red status alone, agent guess

**Workflow limitation class**:
The **DAG stop diagnosis** classification that distinguishes an instance blocker, control-engine defect, skill-contract gap, or unresolved evidence. It decides whether the remedy belongs to the current Issue, the control engine, the shared skills, or a human evidence decision.
_Avoid_: Generic failure, automatic skill rewrite, UI diagnosis

**Shared workflow repair isolation**:
The rule that a `skill-contract-gap` or control-engine defect pauses the product **DAG Run** and is repaired through a separate scoped, reviewed, and verified workflow change. Product workers never edit or install their own governing skills or coordinator; after the repaired version is installed, the original Run may continue only through explicit **DAG run reconciliation**.
_Avoid_: Self-modifying run, product-worktree skill repair, silent coordinator patch

**Codex-native coordinator**:
The active Codex task that owns DAG reduction and uses Codex-native task create, read, wait, and message capabilities to dispatch and observe the child Codex tasks explicitly authorized by one **DAG Run Grant**. It does not require Orca or a Codex App Server client in v1; re-entry reconstructs state through **DAG run reconciliation** instead of treating the coordinator task's memory as durable authority.
_Avoid_: Orca runtime, standalone Node task client, UI task list as scheduler

**Coordinator liveness boundary**:
The v1 rule that automatic scheduling and closeout exist only while the **Codex-native coordinator** task is actively running. If that task or the Codex app execution disappears, no new Issue is dispatched or closed; already-created child Codex tasks may settle, but their evidence is adopted only by a later explicit `/run-issue-workflow <Spec-ID>` reconciliation. Independent execution after coordinator loss requires a future Codex App Server design.
_Avoid_: Hidden daemon authority, panel-owned execution, assumed background continuation

**Codex Issue lane**:
The one-to-one binding between an executable Issue and one sidebar-visible child Codex task running in the saved project's local environment. The child invokes `execute-issue`, which alone creates or reuses the dedicated **Issue worktree** and performs every product edit, verification, and candidate commit there; the shared checkout remains read-only except for ordinary worktree registration. A transient retry reuses the same child task when reachable, and a replacement requires proof that the prior task cannot continue plus a journaled supersession link.
_Avoid_: Codex-managed nested worktree, product edits in shared checkout, duplicate Issue task

**Workflow evidence ownership**:
The rule that each workflow fact is decided only by its owning source: tracker and decomposition evidence for scope and blockers, completion notes for Issue-to-candidate review evidence, Git and worktree state for integration and cleanup, Codex task lifecycle evidence for dispatch liveness, and the control engine for grants and controls. Cross-source contradiction pauses the run; no source wins outside its domain, and UI state owns no fact.
_Avoid_: Global source priority, last-write-wins, panel authority

**Bounded environment remediation**:
The automatic use of one named recovery skill or adapter after an exact environment-failure fingerprint, limited to reversible process-local changes and followed by rerunning the exact failed command. It never changes persistent project or machine configuration, expands workflow authority, or converts a real build or test failure into success.
_Avoid_: Generic auto-fix, persistent environment repair, ignored command failure

**Environment remediation cycle**:
The single fingerprint-bound **Bounded environment remediation** allowed within one Issue dispatch attempt, followed by the exact command rerun. It does not consume the **DAG retry budget**; a repeated fingerprint becomes `environment_unresolved`, while a different real failure is classified on its own evidence.
_Avoid_: Workaround loop, hidden retry, successful wrapper means successful build

**Tracker outage gate**:
The fail-closed suspension of new dispatch and closeout when current tracker evidence cannot be read. The engine makes three health/read probes after 5, 15, and 30 seconds without consuming the **DAG retry budget**; recovery triggers full evidence reconciliation, while continued failure yields run-level `BLOCKED` with reason `tracker_unavailable`. Already-running workers may settle local work, but no candidate becomes authoritative `IMPLEMENTATION_COMPLETE` and no new close step starts without tracker read-back.
_Avoid_: Cached tracker authority, worker retry, offline Issue close

**DAG control panel**:
The Codex browser-panel projection of one **DAG Run**'s authoritative status and named Pause, Resume, Stop, and Refresh controls. It renders DAG progress, child Codex task state, close progress, and **DAG stop diagnosis** records through the **DAG control bridge** but never starts a Run or owns workflow state, scheduling authority, or failure classification.
_Avoid_: Workflow source of truth, scheduler, permanent sidebar

**DAG control bridge**:
The active control engine's ephemeral `127.0.0.1` HTTP interface, protected by one random per-run control token and limited to status plus named Pause, Resume, Stop, and Refresh commands. It exposes no Start authority, arbitrary shell execution, persistent database, or remote listener.
_Avoid_: Public API, daemon database, command console

**DAG run journal**:
The append-only `events.jsonl` stored under `${git-common-dir}/matt-workflow-control/runs/<run-id>/` by the single control-engine writer. It records only engine-owned grants, control revisions, Codex task dispatch-attempt references, bounded-remediation records, and pause or stop transitions; tracker, Git, worktree, and Codex task facts remain references to their owning sources and are re-read during reconciliation. The per-run control token is never written to the journal.
_Avoid_: `.git/ron-workflow/` reuse, duplicate tracker database, mutable checkpoint

**DAG status snapshot**:
The atomically replaced, versioned `status.json` projection derived from one **DAG run journal** plus current authoritative evidence for the **DAG control panel**. It is disposable and rebuildable, owns no workflow fact, and never contains the per-run control token.
_Avoid_: Resume authority, append-only audit record, UI-owned state

**DAG run-state cleanup**:
An auditable startup retention sweep that may remove eligible terminal-run journals and snapshots from `${git-common-dir}/matt-workflow-control/runs/`. A Run is eligible only when it is `SUCCEEDED` or `STOPPED`, is older than 30 days, and is outside the newest ten terminal Runs; uncertain engine-lock or active Codex task evidence makes it ineligible. Each deletion is first recorded in append-only `cleanup.jsonl`, while `--cleanup-preview` reports the same selection without deleting. It never deletes an active, pausing, paused, blocked, or stopping Run, and it never touches tracker history, branches, worktrees, candidates, or product files.
_Avoid_: Automatic active-run deletion, repository cleanup, tracker-history retention

**Workflow interface**:
The user-visible skills and explicit handoffs that represent distinct human-owned authority transitions in the development flow. A user invokes `close-issue` with an Issue ID; `close-issue` resolves the tracker state and local identities before calling its internal module. Interface size is judged by the decisions the human must own, not by skill count or Markdown length.
_Avoid_: Workflow implementation, internal helper layout, shortest command chain

**Ron repository footprint**:
The repository-local Ron configuration, Ron-only instruction text, and inactive or completed `.git/ron-workflow/` metadata left by the retired setup or prior runs. It excludes a current recoverable draft, the Canonical Wiki, tracker history, branches, worktrees, and installed skills.
_Avoid_: All Ron-related history, Wiki content, execution branches

**Ron removal**:
The explicit `/remove-ron` cleanup of one **Ron repository footprint**. It removes only owned local artifacts, commits an actual tracked cleanup diff, and stops on active execution, dirty overlap, or ambiguous ownership without touching external history or delivery state.
_Avoid_: Plugin uninstall, branch cleanup, Issue deletion, full purge

**Close progress**:
The directly observable ordered progress of one idempotent `close-issue`: the reviewed candidate is reachable from the **Issue target branch**, the registered clean **Issue worktree** is absent, and the Issue is closed. A retry skips only the satisfied prefix and stops on contradictory or out-of-order state without writing a custom success or failure receipt.
_Avoid_: Issue integration receipt, closeout journal, retry checkpoint

**Target verification set**:
The aggregate delivery set frozen by `verify-target-before-push` from one exact baseline `B`, target `V`, Issue **Execution completion notes**, and **Direct target contribution records**. The default source is the target's local unpushed range from its unique upstream tip to local `HEAD`; already-pushed work requires an explicit merge request, pull request, or exact base/head comparison. A candidate reachable from `V` but not `B` is a member and must belong to a closed Issue; an open unreachable candidate remains concurrent work outside the set, while a closed unreachable candidate is contradictory delivery evidence that blocks verification. Every material range commit must be covered by a member **Issue contribution**, a matching **Direct target contribution**, its referenced Planning Seal, or necessary merge topology.
_Avoid_: Closeout receipt union, explicit Issue manifest, merge-message discovery

**Successor verification evidence**:
The proof that a later member of one **Target verification set** makes an earlier path-specific focused command inapplicable at exact target `V`: the later candidate descends from the earlier candidate, its Acceptance Criteria explicitly retire every repository path named by that command, its completion evidence proves those paths absent and current replacement behavior passing, and the paths remain absent at `V`. It replaces only that command's final-target applicability and never waives the earlier candidate, completion note, review, or contribution evidence.
_Avoid_: Ignored failed command, inferred deletion, historical evidence rewrite

**Verification command**:
A literal command line recorded with its exact result and executable unchanged from the repository root. Natural-language observations, summaries, placeholders, and inferred expansions remain non-authorizing history and never enter an aggregate command set.
_Avoid_: Prose check, `<...>` placeholder, reconstructed invocation

**Push-ready receipt**:
The local read-back `push_ready` record produced only when a non-empty local unpushed **Target verification set**, aggregate Standards/multi-Spec review, required verification, and closed-candidate reachability all pass on one exact target `HEAD`. It is never issued retroactively for an already-pushed range, and later target movement invalidates it.
_Avoid_: Issue integration receipt, push command, production verification

**Push target operation**:
The explicit human-invoked remote-delivery action that consumes one current **Push-ready receipt** for an exact local target whose verified baseline still matches its uniquely configured fetched upstream, performs only an ordinary non-force push of the verified commit, and confirms the resulting remote ref. Any target or upstream drift stops the operation; it adds no review, repair, tracker, deployment, or automatic-push authority.
_Avoid_: Automatic verifier push, generic unchecked push, force push

**Range verification result**:
The non-push-readiness result produced when `verify-target-before-push` validates one explicit already-pushed merge request, pull request, or exact base/head range. It proves only that frozen range and never retroactively grants a **Push-ready receipt**.
_Avoid_: Retroactive push-ready receipt, guessed comparison, unbounded branch review

**Execution readiness**:
The state in which an open **Issue** has resolved blockers, clear acceptance and Spec scope, an identifiable original target, and no conflicting worktree owner.
_Avoid_: Approved

**Manual prerequisite**:
A human-owned external action named by one exact repository artifact path that must be completed before affected Issue implementation continues.
_Avoid_: Agent-executed migration, resolver-driven preflight, automatic environment mutation

**Prerequisite inspection**:
The optional public prerequisite workflow after a Tracker Spec or child Issue is published, entered only for an exact **Manual prerequisite** artifact declared by that Issue or Spec or discovered and resolved to an exact path during execution. It may invoke **Prerequisite preparation** when the artifact is not ready, then pauses until the human performs the prerequisite and records one **Manual execution attestation**; an Issue with no exact declaration skips this workflow, and arbitrary `.sql` files never trigger it.
_Avoid_: Mandatory delivery stage, target verification, automatic external execution

**Prerequisite preparation**:
A bounded model-invoked `prepare-prerequisite-artifact` operation automatically invoked by `pre-execute-issue` when one exact declared **Prerequisite artifact** is not ready. It calls the repository adapter to discover evidence, create or repair the artifact, and rerun static validation after each material edit, then stops after at most ten repair waves. The adapter is repository code consumed by this operation, not a skill or a human command. A passing result makes the artifact ready for human execution but supplies no **Manual execution attestation**.
_Avoid_: Database execution, human attestation, unlimited repair loop

**Prerequisite preparation profile**:
Versioned consumer-repository evidence installed and validated once during repository onboarding or an explicitly authorized setup Issue, naming one repository-owned adapter with read-only `discover`, artifact-writing `prepare`, and read-only `validate` operations. The adapter owns database-product-and-version-appropriate executable assertions for preconditions, backup integrity, and postconditions, plus the locking and transaction strategy needed to prevent state drift during execution. Runtime prerequisite workflows only consume it; a missing, broken, or incomplete profile stops without creating or modifying adapter infrastructure inside the product Issue.
_Avoid_: Per-run user inventory, runtime adapter bootstrap, guessed SQL dialect

**Prerequisite artifact**:
The exact repository file prepared and statically validated for one Issue's **Manual prerequisite**, then named by the human when execution or application is complete.
_Avoid_: Target-state evidence, external credential, ambiguous path

**Operator SQL**:
The single primary **Prerequisite artifact** presented for normal human database execution, ordered into exactly three sections: read-only preflight that aborts on a failed execution condition; backup of the exact affected data plus validated recovery SQL kept commented and inert; and only then the authorized mutation or insertion with applicable postcondition checks. It is safe to invoke repeatedly under a three-state preflight: an absent backup plus repository-defined pre-mutation state permits the first backup and mutation; an integrity-valid existing backup plus complete postconditions returns successful no-op without another write; every partial, contradictory, or unproved combination aborts. Each precondition, backup-integrity check, and postcondition is a database-native fail-closed assertion emitted by the **Prerequisite preparation profile**: mismatch terminates execution with an error, while diagnostic `SELECT` output is supplemental and never authorizes progress through human inspection. After the persistent backup is created and validated, the adapter revalidates and locks the exact target state immediately before mutation. Transaction-capable DML runs in an explicit transaction and commits only after every postcondition passes; any error rolls back the mutation while retaining the backup. A DDL or other change that cannot provide an equivalent safe transaction and recovery boundary stops and returns to planning or a human decision. Successful completion emits exactly one **Operator SQL outcome**; an error or missing outcome is unsuccessful. The primary SQL never deletes or overwrites the backup. Safe recovery is a readiness condition for data-changing SQL: UPDATE or DELETE restores exact backed-up rows, INSERT removes only stable keys created by this operation, and an artifact without truthful recovery stops rather than disguising irreversibility. The same logical backup name may be reused for a separately authorized new operation only after human cleanup and fresh pre-mutation proof. The backup otherwise remains after the primary operation until that cleanup; the artifact and Issue workflow neither generate nor retain cleanup SQL.
_Avoid_: Mutation before backup, unlocked target drift, partial DML commit, visual-only gate, active recovery statement, unsafe or fictional recovery, backup overwrite, repeated mutation, embedded or automatic cleanup

**Operator SQL outcome**:
The single database-emitted terminal value `APPLIED` or `NO_OP`. `APPLIED` means the authorized mutation committed after every postcondition passed; `NO_OP` means an integrity-valid existing backup and complete postconditions proved that no write was needed. Either is a successful prerequisite outcome; an SQL error, missing value, or any other value is not. The human reports only the exact emitted value; no database version, path, hash, or complete log is required. A generic success statement without the outcome receives one focused clarification, while a failure needs only its error text.
_Avoid_: Free-form success text, inferred outcome, partial-success status

**Prerequisite artifact readiness**:
The state of one exact **Prerequisite artifact** after every repository-declared deterministic validation passes and independent Standards and Spec review has no **Confirmed code review finding**. Validation and confirmed-finding repairs share one ten-wave **Prerequisite preparation** budget; readiness authorizes only presentation for human execution and does not attest an external outcome.
_Avoid_: Syntax-only pass, advisory blocker, execution receipt

**Prerequisite candidate**:
The clean local checkpoint commit in the exact Issue worktree that contains one ready **Prerequisite artifact** and binds its repository-relative path and Git blob identity. A direct prerequisite invocation may create or reuse that Issue branch and worktree and commit only the declared artifact; the human executes that committed content, and later Issue execution must reuse the worktree and retain the candidate in its ancestry.
_Avoid_: Uncommitted SQL, path-only identity, target-branch commit

**Manual execution attestation**:
The append-only tracker note that records the human's statement that one exact **Prerequisite artifact** completed with one successful **Operator SQL outcome** for one Issue. Legacy `manual_prerequisite_complete:v1` remains path-bound; a newly generated artifact uses content-bound `manual_prerequisite_complete:v2` referencing its exact **Prerequisite candidate**, Git blob, path, and reported outcome. Either successful outcome authorizes workflow continuation but does not independently prove the external target state.
_Avoid_: Database verification receipt, path-only generated artifact, environment audit

**Prerequisite execution failure**:
The human-reported unsuccessful execution, SQL error, or missing or unknown **Operator SQL outcome** for one exact **Operator SQL**, which produces no **Manual execution attestation** or **Prerequisite continuation**. It stops automatic progress, retry, and rollback until read-only diagnosis establishes the external state and a separately authorized correction creates a newly validated and reviewed **Prerequisite candidate**.
_Avoid_: Automatic retry, assumed rollback, partial-success attestation

**Prerequisite continuation**:
The return from a completed **Prerequisite inspection** to the same active `execute-issue` lane that invoked it, after exact **Manual execution attestation** read-back and fresh Issue, target, and artifact checks. A directly invoked prerequisite workflow has no implementation authority and stops after attestation.
_Avoid_: Implicit execute grant, stale-state resume, second manual command

**Executable Issue**:
An open **Issue** that is one dependency-ready execution unit with numbered **Acceptance Criteria**, one embedded **Implementation Plan**, a valid **Planning Seal**, and the target identity needed by `execute-issue`. A **Single-Issue Spec** is executable itself; `/to-tickets` produces executable child Issues for a **Multi-Issue Spec**.
_Avoid_: Parent Multi-Issue Spec, implementation prompt, ready label alone

**Issue decomposition**:
The stable mapping from one **Multi-Issue Spec** to its exact child **Executable Issues**, blocking edges, and current dependency-ready frontier. Repeated publication reconciles the same mapping instead of creating another set of children.
_Avoid_: One-shot ticket split, duplicate child publication

**Decomposition key**:
The immutable child-owned `<Spec-ID>/<NN>` identity of one **Executable Issue** within an **Issue decomposition**. It lets `/to-tickets` reconcile the same child across retries and trackers; execution still uses the tracker Issue ID.
_Avoid_: Tracker Issue ID, Issue title, execution command

**Decomposition publication record**:
The minimal versioned parent record written and read back only after one **Issue decomposition** is fully published. It binds the parent, Planning Seal, target, exact **Decomposition key** to Issue mapping, and blocking edges so parent closeout can prove completeness without making the record a child identity authority.
_Avoid_: Child identity source, mutable implementation plan, push-ready receipt

**External blocker**:
An existing readable **Issue** outside one **Issue decomposition** whose open state prevents a child from entering the dependency-ready frontier. `/to-tickets` verifies the reference but never creates, edits, or closes that Issue.
_Avoid_: Sibling blocker, guessed dependency, cross-Spec mutation

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
Source evidence found during implementation that reveals an undeclared **Manual prerequisite**. It pauses prerequisite-dependent verification until the human records the exact artifact attestation, or becomes a **Scope change** when behavior or schema outcome changes.
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

**Code review advisory**:
A reported smell, preference, or suggestion that lacks the exact repository or Spec evidence required for a **Confirmed code review finding**. It remains visible to the current review but cannot block a clean result, trigger repair, or create durable waiver authority.
_Avoid_: Confirmed finding, permanent dismissal, SHA allowlist

**Aggregate repair Issue**:
A new **Executable Issue** that owns one or more **Confirmed code review findings** discovered only after their contributing Issues are integrated and closed. It targets the same branch and binds the exact aggregate finding plus affected Issue and Spec identities; the earlier Issues remain closed unless a human explicitly authorizes reopening one.
_Avoid_: Automatic Issue reopening, verifier-owned repair, implicit historical owner

**Material repair wave**:
One bounded pass in which the single writable owner addresses confirmed Standards or Spec findings inside the unchanged Issue scope, verifies the repair, and produces a new candidate. One `execute-issue` invocation permits at most ten waves; only an explicit later invocation starts a new limit, and no durable counter is maintained.

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
- `pre-execute-issue` never creates or reuses an **Issue worktree**; it only records a **Manual execution attestation**
- `/to-spec` creates or reuses the primary or revised **Planning Seal** before a Spec becomes ready
- `/to-spec` is the sole owner of **Delivery routing**: it routes a **Single-Issue Spec** directly to `/execute-issue <Spec-ID>` and routes a **Multi-Issue Spec** to `/to-tickets <Spec-ID>`
- After a Tracker Spec or child Issue is written, the human may invoke `/pre-execute-issue <Issue-ID> <artifact-path>` to record one **Manual execution attestation** without making it a mandatory delivery stage
- The human's exact artifact-path statement is the prerequisite authority; generic skills do not require target identity, credentials, DB access, resolver adoption, postflight output, hashes, or environment verification
- `/to-spec` classifies automatically from Spec and source evidence; only material ambiguity that can change **Delivery routing** permits one blocking question with a recommendation, and uncertainty never defaults to either Single-Issue or Multi-Issue
- `ask-matt`, `/to-tickets`, and `execute-issue` consume **Delivery routing** without duplicating or overriding its classification criteria
- `/implement` accepts an explicitly selected **Standalone Spec** for direct-branch work, while every **Tracker Spec**, including a local-file tracker record, follows `/to-spec`-owned **Delivery routing**
- A **Single-Issue Spec** owns one embedded **Implementation Plan** in the same tracker record; no separate plan artifact or comment carries execution authority
- A **Multi-Issue Spec** keeps only the overall outcome, cross-Issue constraints, and decomposition rationale; `/to-tickets` gives each child **Executable Issue** its own compact **Acceptance Criteria**, **Implementation Plan**, verification, blocking edges, and Planning baseline
- Each child in an **Issue decomposition** owns one immutable **Decomposition key**; `/to-tickets` reconciles by that key, while `/execute-issue <Issue-ID>` resolves the parent and key from the child
- Reconciliation creates a missing **Decomposition key**, reuses one matching child, and stops without mutation on duplicate keys or conflicting parent, target, Planning Seal, or executable contract evidence
- One `/to-tickets <Spec-ID>` invocation automatically validates every tracker-supported identity source; matching evidence needs no per-child approval, while conflicting native relation, body, or **Decomposition key** evidence stops before repair
- Owned blocking edges in an **Issue decomposition** are acyclic; a child may reference a verified **External blocker**, whose state gates the frontier without becoming `/to-tickets`-owned work
- `/to-tickets` writes and reads back one **Decomposition publication record** only after every child and blocking edge matches; publication failure before that record remains recoverable through child-owned **Decomposition keys**
- `/to-tickets` outputs `/execute-issue <Issue-ID>` only for the dependency-ready frontier and never prompts execution of blocked Issues
- A **DAG Run Grant** authorizes one **DAG Run** to dispatch every dependency-ready Issue, invoke `close-issue` after valid `implementation_complete`, and continue without per-Issue approval while its bound Spec, any required decomposition record, target, and scope remain unchanged
- A Single-Issue **Tracker Spec** is a one-node **DAG Run**: the coordinator invokes `execute-issue`, validates `implementation_complete`, invokes `close-issue`, and requires **DAG node success** without a **Decomposition publication record**
- A child releases its outgoing blocker edges only after **DAG node success**; a coordinator recomputes the dependency-ready frontier from read-back tracker and Git evidence rather than trusting worker or UI state
- A **DAG run state** remains `RUNNING` while any unaffected legal execution or closeout can progress, even when other nodes are `BLOCKED` or `FAILED`; it becomes `BLOCKED` only when unfinished nodes remain and no legal work is active or available
- `PAUSING`, `PAUSED`, `STOPPING`, and `STOPPED` never overwrite a node's **DAG node state**; `SUCCEEDED` at either level requires authoritative Git, worktree, and tracker read-back rather than a worker or UI declaration
- After every child of a Multi-Issue Spec reaches **DAG node success**, the same **DAG Run Grant** authorizes the coordinator to invoke parent-only `close-issue`, validate the publication record and child reachability again, and require the parent to be closed before declaring **DAG delivery success**
- A v1 **DAG Run** enters run-level `SUCCEEDED` at **DAG delivery success** and stops; `/verify-target-before-push`, aggregate target review and verification, **Push-ready receipt**, push, and deployment remain outside its grant and lifecycle
- **DAG branch isolation** keeps unrelated ready branches eligible after one child fails, while that child and every descendant remain blocked
- A target-wide dirty state, merge conflict, authority mismatch, contract drift, or ambiguous tracker or Git evidence pauses the entire **DAG Run** and requires human resolution before resumption
- **DAG scheduling authority** comes only from published blocker edges; path, symbol, or module overlap never creates an inferred dependency or blocks an otherwise ready Issue
- A transient worker or terminal failure may consume one **DAG retry budget** attempt and retry the same Issue, but the third failed attempt marks that node failed, blocks its descendants, and leaves unrelated ready branches eligible
- `implementation_blocked`, merge conflict, Scope change, authority or contract mismatch, and ambiguous evidence bypass the **DAG retry budget** and enter their defined blocked or run-paused state immediately
- A **DAG Run** dispatches ready Issues only while active execution dispatches are below its **DAG concurrency limit**; the default `max_parallel` is three
- Changing `max_parallel` requires a paused run and a read-back **DAG control revision** before Resume; running-state UI or process-local values never alter scheduling authority
- A **DAG cooperative pause** starts no new execution or closeout, lets current workers settle without force, and holds completed candidates until Resume revalidates all authoritative evidence
- A **DAG graceful stop** revokes the active grant, lets current workers settle without destructive cleanup, records terminal stopped state, and requires a later explicit invocation plus **DAG run reconciliation** before work can continue
- `/run-issue-workflow <Spec-ID>` is the exact user-facing start or resume entrypoint; every invocation performs **DAG run reconciliation** before renewing authority or taking an action
- No-argument `/run-issue-workflow` applies **DAG run selection**: it automatically resumes one unique non-terminal Run, but zero candidates require a Spec ID and multiple candidates require explicit selection
- After no-argument selection, reconciliation adopts valid manual completion and partial close progress, then automatically dispatches only the selected Run's remaining dependency-ready frontier
- Invoking `/run-issue-workflow <Spec-ID>` is the sole Start authority: after a valid Single-Issue classification or Multi-Issue **Decomposition publication record** is reconciled, it opens the panel and immediately begins automatic execution without a second confirmation
- **DAG run reconciliation** skips manually completed nodes only after proving **DAG node success**, resumes an existing valid `implementation_complete` or partial **Close progress**, and dispatches only the remaining dependency-ready frontier without duplicating Issues, workers, or execution lanes
- **DAG run reconciliation** resumes the same run only when its **DAG run identity** is unchanged; identity drift invalidates the old grant and reports `contract_drift` without selecting a mixed frontier
- After new planning or decomposition resolves identity drift, only another explicit `/run-issue-workflow <Spec-ID>` invocation may create the next run revision and grant
- Every blocked, failed, or run-paused state requires a **DAG stop diagnosis**; the Codex panel renders that record but never invents, weakens, or repairs its evidence
- A **Workflow limitation class** identifies whether progress requires instance resolution, control-engine repair, shared-skill contract change, or a human decision on unresolved evidence
- **Shared workflow repair isolation** requires every skill-contract or control-engine repair to occur outside the affected product Run with its own scope, review, verification, and installation; the product Run resumes only through a later explicit reconciliation
- The **Codex-native coordinator** is the v1 execution adapter for a **DAG Run**; the Run Grant's explicit child-task authority permits native Codex task creation, while Orca and Codex App Server remain outside v1
- The **Coordinator liveness boundary** keeps the **DAG Run** automatic only while its coordinator task is active; coordinator loss is fail-closed and a later explicit invocation reconciles settled child-task evidence without duplicate dispatch
- The **DAG control bridge** may record bounded panel commands while the coordinator is active, but it never continues scheduling or closeout after coordinator loss
- Each executable Issue has one **Codex Issue lane**: its child task runs against the saved project while `execute-issue` owns one separate dedicated **Issue worktree**, so `close-issue` retains its existing exact merge, worktree-removal, and tracker-close sequence
- A **Codex Issue lane** performs no product-file write in the shared checkout; replacement is legal only after the prior task is proved unable to continue and the **DAG run journal** records their supersession relationship
- **Workflow evidence ownership** assigns scope and blocker facts to tracker/decomposition read-back, candidate and review facts to completion notes, integration and cleanup facts to Git/worktrees, dispatch liveness to Codex task lifecycle read-back, and grant or control facts to the control engine; contradiction across these domains pauses instead of choosing a winner
- **Bounded environment remediation** is allowed only for an exact recognized fingerprint, records the selected skill and process-local action, reruns the exact failed command, and preserves the command's real result
- One **Environment remediation cycle** is allowed per Issue dispatch attempt and exact fingerprint; it consumes no **DAG retry budget**, never repeats for the same fingerprint, and records `environment_unresolved` when the exact rerun still fails
- A different failure after remediation is classified independently, and only a later worker or terminal restart consumes another **DAG retry budget** attempt
- On Windows, `gradle-loopback-safe` may remediate only a `Selector.open()` probe that returns `java.io.IOException: Unable to establish loopback connection`; every other Gradle or JVM failure remains untouched and follows ordinary diagnosis
- The **Tracker outage gate** forbids cached tracker state from authorizing dispatch, `implementation_complete`, or closeout; after three failed probes at 5, 15, and 30 seconds, the Run becomes `BLOCKED` with `tracker_unavailable`
- While the **Tracker outage gate** is active, already-running workers may preserve local candidates and worktrees but must stop at the next tracker-dependent evidence boundary; tracker recovery causes full reconciliation before automatic progress resumes
- Tracker health probes do not consume the **DAG retry budget**; Resume or a new `/run-issue-workflow` invocation repeats current evidence acquisition rather than trusting the earlier outage result
- The **DAG control panel** is a replaceable projection over the control engine's versioned status interface; opening, closing, or reopening it never starts a **DAG Run**, while its explicit Pause, Resume, and Stop actions create idempotent control events and Refresh is read-only
- The **DAG control bridge** binds only to loopback for the active run, requires its per-run token for Pause, Resume, or Stop, and offers no Start endpoint, arbitrary command execution, or durable state of its own
- Each **DAG Run** has one **DAG run journal** under the repository's common Git directory; `/run-issue-workflow` reconstructs current state from that journal plus live tracker, Git, worktree, and Codex task evidence instead of replaying a mutable checkpoint
- The **DAG status snapshot** is an atomic, disposable panel projection; deleting or corrupting it cannot authorize, resume, or complete a Run because the engine must rebuild it from the journal and owning evidence sources
- **DAG run-state cleanup** runs only when `/run-issue-workflow` is explicitly invoked, retains every terminal Run from the last 30 days and at least the newest ten terminal Runs, and skips any Run whose terminal state, engine-lock release, or absence of active Codex tasks cannot be proved
- Before deleting an eligible Run directory, **DAG run-state cleanup** appends its Run ID, Spec ID, terminal state, deletion time, and retention reason to `cleanup.jsonl`; `--cleanup-preview` performs the same proof and selection without deletion
- **DAG run-state cleanup** never runs as a side effect of Stop, Issue closeout, repository cleanup, or panel closure
- A Spec may contain at most three non-authoritative **User Outcomes**, while its numbered **Acceptance Criteria** are the only done and traceability authority
- **Acceptance Criteria**, **Implementation Plan** steps, and verification use compact many-to-many `Covers: AC-n` references: every criterion has at least one step and verification, every step covers at least one criterion, and no separate matrix or orphan is allowed
- Before publication, `/to-spec` compares the criterion IDs with the IDs covered by plan steps and verification and stops on any missing ID or uncovered step; this is a prompt-level invariant backed by contract tests, not a separate parser or matrix artifact
- `execute-issue` applies **Necessary discovery** automatically without duplicating the candidate's path list in tracker evidence, records only **Material plan deviations**, and returns every **Scope change** to planning
- A **Late prerequisite discovery** preserves coherent checkpoints and stops before schema-dependent verification; unchanged scope routes the exact discovered artifact through `pre-execute-issue`, while changed schema outcome or acceptance returns to planning
- A one-outcome Spec that cannot fit one execution and review cycle is still a **Multi-Issue Spec**; `/to-tickets` prefers independently verifiable vertical slices and uses expand-contract when no single wide change can remain green as a vertical slice
- `/to-tickets` reuses that seal or creates one successor for approved in-Spec planning changes; public scope expansion returns to `/to-spec`
- `execute-issue` verifies the **Planning Seal** is an ancestor of its execution baseline and never creates or repairs the seal
- `execute-issue` reads the Issue and comments at Entry: no exact declared **Manual prerequisite** preserves the ordinary route, while a matching **Manual execution attestation** permits execution
- When one exact declared or late-discovered prerequisite lacks a matching attestation, `execute-issue` automatically invokes `pre-execute-issue` in the same authorized lane; arbitrary `.sql` files never trigger it, and neither skill executes the artifact or performs the external prerequisite
- **Execution readiness** requires satisfied blockers and clear Issue or linked-Spec scope
- A direct `/pre-execute-issue <Issue-ID>` invocation and an active `execute-issue` handoff both resolve only the exact artifact declared by the Issue or Spec or exact late-discovery evidence; missing or consequentially contradictory identity stops for one focused decision
- When that artifact is not ready, `pre-execute-issue` automatically invokes model-invoked `prepare-prerequisite-artifact`, which consumes the repository adapter's `discover`, `prepare`, and `validate` operations and shares one ten-wave deterministic-validation and Standards/Spec-review repair budget
- A ready generated **Operator SQL** is a clean committed **Prerequisite candidate** presented for human execution; the workflow never connects to or mutates the database, automatically retries a failed execution, runs recovery, or performs cleanup
- A human-reported `APPLIED` or `NO_OP` records and reads back content-bound `manual_prerequisite_complete:v2`; legacy path-only v1 remains readable but cannot authorize a newly generated artifact
- A matching existing attestation is reused without a duplicate note; direct `pre-execute-issue` stops after attestation, while an active `execute-issue` handoff resumes the same lane only after fresh exact identity and ancestry checks
- Tracker write or read-back failure is reported as unresolved persistence and never misrepresented as a completed attestation
- An **Issue Context Packet** may be rebuilt from the Issue and latest **Issue Progress Checkpoint**
- An **Execution completion note** hands one unchanged reviewed candidate from `execute-issue` to separately invoked `close-issue`
- An **Execution completion note** is the sole Issue-to-commit mapping authority and binds one **Issue contribution** through exact Issue, **Execution baseline**, candidate SHA, and ancestry; commit-message text is never used as identity or fallback
- **Issue contribution** coverage is many-to-many: every material range commit needs at least one valid explanation, but overlapping candidate ancestry never requires a unique commit owner
- The **Workflow interface** keeps distinct human-owned authority transitions explicit; optimization deepens internal implementation rather than merging transitions only to reduce skill count or Markdown length
- The public `close-issue` invocation accepts an Issue ID, resolves its **Issue target branch**, latest valid **Execution completion note**, unchanged candidate, and registered **Issue worktree**, requires the target worktree to be clean, then owns exactly three ordered actions: merge the candidate, remove the clean Issue worktree, and close the Issue
- **Target integration serialization** permits one `close-issue` writer per **Issue target branch** while any number of `execute-issue` runs continue; target movement alone never supersedes their successful execution state
- A merge conflict is aborted and leaves the worktree and Issue open; `close-issue` writes no failure receipt and never reruns execution, while the human may explicitly start a new `execute-issue` attempt in the same branch and worktree from the latest target when resolution stays within the original Acceptance Criteria
- A successful conflict-repair attempt publishes a new **Execution completion note** whose latest-target **Execution baseline** and candidate become current authority; ordinary target movement creates neither a new attempt nor a superseding state
- Conflict resolution that changes behavior, Acceptance Criteria, target, exclusions, or ownership returns to `/to-spec` or `/to-tickets` instead of being treated as integration repair
- A dirty target worktree stops the next ordered closeout action without stash, cleanup, or candidate invalidation; after the human makes it clean, retry resumes through `close-issue` rather than `execute-issue`
- **Close progress** is derived from Git ancestry, worktree registration, and tracker state; retry skips only a satisfied ordered prefix, while missing identities, a dirty Issue worktree, or contradictory and out-of-order state stops without automatic repair
- `close-issue` performs no aggregate review, test suite, push-readiness proof, product-code repair, queueing, or target-drift gate
- `/close-issue <Parent-ID>` dispatches a **Multi-Issue Spec** to a parent-only path with no candidate integration; it requires the matching **Decomposition publication record**, every exact child closed, and every child candidate reachable from the same target before closing and reading back the parent
- A missing, unreadable, stale, or conflicting **Decomposition publication record** stops parent closeout and returns to `/to-tickets <Parent-ID>` reconciliation; `close-issue` never infers completeness from visible children or grants a legacy bypass
- Closing the final child never closes its parent implicitly, and parent closure never claims aggregate `push_ready`
- `/verify-target-before-push` keeps one public name: by default it freezes the non-empty local unpushed range from the target's unique upstream tip to local `HEAD`, while already-pushed work requires an explicit merge request, pull request, or exact base/head comparison and never uses a guessed baseline
- `/verify-target-before-push` derives one **Target verification set** from completion notes plus candidate reachability; a reachable member still open or a closed candidate no longer reachable stops before review, while open unreachable work remains outside the selected range
- Every material commit in a **Target verification set** must be explained by a member **Issue contribution**, matching **Direct target contribution**, referenced Planning Seal, or necessary merge topology; an uncovered commit stops without guessing from commit messages
- **Direct target contribution recovery** is available only after frozen-range coverage failure when every proposed uncovered commit is eligible; matching existing records are reused, while review, test, cleanliness, ref, tracker, normal execution, and closeout states never trigger attestation
- Recovery requires one exact human confirmation before its separate model-invoked helper writes authority evidence, then automatically starts a fresh `/verify-target-before-push`; the failed gate neither writes the record nor continues from its stopping point
- A **Direct target contribution** is eligible only for explicit human-directed, non-product workflow or governance maintenance outside an **Executable Issue** by design; active behavior, source, tests, configuration, dependencies, migrations, security, data, public APIs, and mixed commits return to normal Issue delivery without partial-path attestation
- **Successor verification evidence** may replace only an earlier path-specific focused command that is inapplicable at exact `V`; every referenced path requires explicit later-member retirement, absence proof, passing current-behavior evidence, and descendant ancestry, while partial, inferred, renamed, or non-path-specific cases stop
- A **Verification command** enters aggregate verification only as one literal repository-root command; prose, summaries, placeholders, and inferred expansions are non-authorizing
- One **Closed Issue command representation reconciliation** may recover selected-range eligibility only for an unambiguous historical placeholder with later-descendant exact-command success, fresh target success, and explicit human confirmation; it never edits or validates the original completion note
- `/verify-target-before-push` performs aggregate Standards, every member Spec, deduplicated focused verification, and the repository full suite once on exact target `V`; local-ahead mode writes a current **Push-ready receipt**, while explicit already-pushed mode returns only a **Range verification result**
- A **Code review advisory** remains visible but cannot block aggregate review, trigger repair, or create waiver authority; only a Coordinator-confirmed exact Standards or Spec violation is a **Confirmed code review finding**
- A confirmed aggregate finding withholds push readiness and defaults to a new human-created **Aggregate repair Issue**; the verifier never creates or executes repairs, and earlier Issues remain closed unless the human explicitly authorizes reopening one
- A human-invoked `/push-target <target>` consumes only a current local-ahead **Push-ready receipt**, fetches and rechecks the unique upstream and exact target, performs one ordinary non-force push, and reads the remote ref back; any drift stops without pull, merge, rebase, force push, or automatic reverification
- A **Subagent Task Brief** is derived from one **Issue Context Packet**
- A **Decision Explanation Packet** produces a non-authoritative **Decision Card**
- A **Wiki validation result** combines a deterministic **Wiki validation pipeline** result with an independent **Wiki semantic review** result without merging their proof authority
- The **Wiki control skill** resolves a root, validates and semantically reviews bounded Wiki-only edits, and commits only a clean Wiki diff
- Issue delivery does not invoke the **Wiki control skill** or inherit its validation and review obligations
- A **Wiki auxiliary tool** may consume the **Canonical Wiki** but never inherits Wiki mutation or review authority
- Final execution review and the **Execution completion note** bind the unchanged reviewed Issue candidate; closeout merges that exact candidate directly and proves it reachable from the **Issue target branch**
- **Execution code review** supplies the Standards and Spec results used by `execute-issue`
- `execute-issue` owns implementation, Standards/Spec review, and the **Material repair wave** loop for one Issue

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
- "Issue Execution Packet" and "Issue Execution Checkpoint" were previously used for overlapping context concepts — resolved as **Issue Context Packet** for ephemeral input and **Issue Progress Checkpoint** for durable recovery output.
