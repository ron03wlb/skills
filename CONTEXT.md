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

### Issue delivery

**Change Issue**:
The single **Issue** created or reused when `to-spec-ron` completes. It owns the first durable **Change Spec** before `to-tickets-ron` either turns it into a **Parent Issue** or leaves it as a **Standalone Issue**.

**Parent Issue**:
An **Issue** that coordinates related **Leaf Issues** and owns their aggregate integration and closeout; it is not itself an executable implementation unit.

**Leaf Issue**:
An independently verifiable vertical outcome under a **Parent Issue**. Completion means its ordered local implementation commits are reviewed and evidenced on its **Execution Lane**, not yet integrated into the target branch.

**Standalone Issue**:
An **Executable Issue** without a **Parent Issue**; its authorized lifecycle may continue through local target integration and closeout.

**Executable Issue**:
A **Leaf Issue** or qualified **Standalone Issue** with one coherent outcome, one grant, one writable owner, and one or more ordered local implementation commits.
_Avoid_: Parent task, implementation Parent

**Execution Lane**:
The ordered run of related **Leaf Issues** toward one **Parent Issue** and target lineage, normally sharing one isolated worktree and one writer at a time.
_Avoid_: Issue worktree

**Change Spec**:
An append-only **Issue** comment containing the historical contract for an intended change, including resolved decisions, Wiki context, acceptance, verification seams, and exclusions.
_Avoid_: Local spec file, current business baseline, authorization

**Leaf execution contract**:
A bounded **Issue** comment that references its Parent **Change Spec** and defines one Leaf's outcome, acceptance, verification, target, baseline, dependencies, and exclusions.
_Avoid_: Copied Parent spec

**Working Spec**:
A recoverable, non-authoritative draft stored in repository-local Git metadata while `to-spec-ron` is incomplete. It is deleted immediately after the final **Change Spec** is published and read back successfully.
_Avoid_: Change Spec, repository spec file

**Repair Leaf Issue**:
A new **Leaf Issue** created when Parent final review finds a code or test defect. It preserves the one-Executable-Issue/one-final-commit boundary instead of adding code repairs to the Parent closeout.
_Avoid_: Parent repair commit, reopened completed Leaf

### Authorization

**Authorization Record**:
An append-only structured **Issue** comment that records either a direct human grant or an exact derived Grant linked to one human-originated **Bounded clean-path delegation**, together with its bindings, capabilities, exclusions, preconditions, derivation evidence, and supersession or revocation lineage.
_Avoid_: Approval label, approved plan

**Bounded Execution Grant**:
The capabilities authorized for one **Executable Issue**, bound to exact Issue, artifact, scope, target, and baseline identities.
_Avoid_: General approval, blanket authorization

**Bounded clean-path delegation**:
A human-originated `workflow-authorization:v1` capability that lets the Coordinator derive and record exact downstream local Grants without another routine prompt. It binds one repository action or Issue, the current Preview or Spec lineage, target branch and starting identity, exact code, artifact, and Wiki scope ceilings, named local capabilities, required validators, fail-closed conditions, and exclusions. Derivation is permitted only when all evidence is verified, every exact path is within its ceiling, target refresh is conflict-free and fast-forward-only, and there are no findings, ambiguities, unverified claims, or new capabilities.
_Avoid_: Agent self-approval, repository-wide standing grant, implicit push, dynamic scope expansion

**Parent Closeout Grant**:
A bounded exact grant for aggregate reconciliation, local target integration, verification, closure, and conditional worktree cleanup. It may be approved directly by the human or derived from a valid **Bounded clean-path delegation**.

**Closeout Preview**:
The exact pre-authorization summary binding the Lane SHA, target SHA, Wiki write sets, verification commands, capabilities, exclusions, and bounded candidate-creation/repair envelope. A valid **Bounded clean-path delegation** may authorize the Coordinator to record its exact Grant internally; otherwise the preview becomes the compact human authorization stop.

**Target Integration Candidate**:
The exact post-target-sync, post-Wiki-reconciliation commit reviewed before the local target branch advances. Target integration is a fast-forward to this same reviewed SHA.
_Avoid_: Pre-merge candidate, target verification

**Execution readiness**:
The state in which an **Executable Issue** has both a valid **Authorization Record** and satisfied dependency, artifact, baseline, ownership, acceptance, and context preconditions.
_Avoid_: Approved

### Context and delegation

**Issue Context Packet**:
An ephemeral, rebuildable, non-authoritative set of pointers and hashes needed to execute one **Executable Issue** in a bounded context.
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

**Artifact manifest**:
The exact task-owned paths created during Issue execution that may be considered for conditional cleanup during closeout.
_Avoid_: Cleanup glob, repository-wide file list

**Canonical Wiki**:
The reviewed repository-local Markdown that owns the current business-knowledge baseline on the target branch, independently of the tool that proposed its content.
_Avoid_: Native Wiki, generated copy, publication site, engine state

**Canonical Wiki root**:
The exact repository-local directory recorded for the **Canonical Wiki**. Setup may propose an existing root only when it is Git-tracked, present at the fixed target SHA, scoped to current business behavior, has an inventory or index, and has no competing canonical authority. Otherwise Ron proposes bootstrap or migration, defaulting a new root to `wiki/`, without creating or accepting a baseline implicitly.
_Avoid_: Hard-coded Wiki path, generated branch, native Wiki repository

**Wiki root adoption assessment**:
The read-only setup classification of an existing knowledge root as `adoptable` or `needs-bootstrap`. `adoptable` means all Canonical Wiki root criteria are evidenced and the root may be proposed for reuse; it does not by itself prove that the baseline is reviewed or `ready`. `needs-bootstrap` roots may supply source seeds but cannot become canonical without the bootstrap or migration flow.
_Avoid_: Directory-exists check, implicit baseline acceptance, second source of truth

**Ron setup commit**:
The one local commit containing only the exact approved Ron operational configuration paths created by a clean `/setup-ron` run. A bounded clean-path delegation may create it and fast-forward the named local target after exact-diff and verification checks. Dirty overlap, unexpected paths, conflict, or failed verification stops; push remains excluded.
_Avoid_: Uncommitted durable config, mixed product change, setup push, unrelated cleanup

**Wiki baseline state**:
The current proof state of the **Canonical Wiki**: `missing` before an accepted baseline exists, `bootstrapping` only while a current hash-verified **Wiki bootstrap Issue** is actively building one, and `ready` only after the complete baseline passes review and target verification. The target configuration persists only `missing` or `ready`; `/wiki status` derives `bootstrapping` from tracker authority.
_Avoid_: Stored partial baseline, unverified active Issue, generated, directory exists, assumed ready

**Wiki baseline requirement**:
The execution-contract binding that distinguishes `not-applicable`, `missing-with-bootstrap-preview`, and `ready`. Only a Standalone **Wiki bootstrap Issue** with a matching bounded Preview may use `missing-with-bootstrap-preview`; normal semantic work requires `ready`, and explicitly technical `wiki_impact: none` work uses `not-applicable`.
_Avoid_: Baseline-exists boolean, bootstrap bypass, semantic work on missing baseline

**Wiki bootstrap Issue**:
A dedicated **Standalone Issue** that defines the required initial topic inventory and coordinates bounded generation and review batches. Ron v1 does not model bootstrap batches as **Leaf Issues**. Setup never creates this Issue or accepts its content implicitly.
_Avoid_: Setup side effect, Bootstrap Parent, analysis-only Leaf, one-shot bulk acceptance, engine-owned baseline

**Wiki Bootstrap Preview**:
A recoverable, non-authoritative `workflow-wiki-bootstrap-preview:v1` payload stored with mode `0600` under repository-local Git metadata. It binds the internal target identity, proposed root, root-adoption assessment, boundedness, topic inventory, exact page paths, source seeds, batches, validators, exclusions, and protocol pin. It changes no tracked or external state and is deleted only after the matching Change Spec is published and read back successfully.
_Avoid_: Target Wiki content, Change Spec, Authorization Record, worktree artifact, chat-only handoff

**Wiki Sync Preview**:
A recoverable, non-authoritative `workflow-wiki-sync-preview:v1` payload used only when ready-state `/wiki` finds bounded drift without an active change-owning Issue. It binds the prior Wiki, drift evidence, proposed Change Spec dispositions, reconciliation ledger, exact write-set ceilings, validators, exclusions, and internal target identity before one Wiki-repair Standalone Issue is published.
_Avoid_: Code-derived requirements, second active Change Issue, direct Wiki patch, chat-only repair scope

**Wiki pre-Issue delegation**:
A mode-`0600`, hash-verified `workflow-clean-path-delegation:v1` record under repository-local Git metadata that binds one direct `/wiki` invocation, one clean bounded Preview, and exactly one bootstrap- or repair-publish capability before the destination Issue exists. After the shared publisher creates or reuses the Issue, a durable Issue Authorization Record must bind this record's ID and hash before any Lane or execution begins.
_Avoid_: Chat-only authority, self-granted Issue mutation, reusable publish permission, Lane before read-back

**Wiki bootstrap batch**:
A non-authoritative generation and review checkpoint inside one **Wiki bootstrap Issue** and its task-specific staging mirror. It may span sessions but is not an **Issue**, independently executable outcome, target baseline, or partial acceptance unit.
_Avoid_: Bootstrap Leaf, partial baseline, target increment

**Wiki control skill**:
The single user-invoked `/wiki` entry. With no subcommand it dispatches from verified repository state: initialize when the baseline is `missing`, resume when `bootstrapping`, and synchronize only affected topics when `ready`. An explicit `status` request is read-only. Every content change still routes through the existing Ron Issue, Grant, review, and closeout flow.
_Avoid_: Second closeout flow, implicit background updater, engine-specific wrapper

**Wiki workflow core**:
The dependency-free, mutation-free shared Node primitive that validates Ron Wiki config, workflow envelopes, Previews, source locators, reconciliation ledgers, bounded delegation, and exact Change Spec bytes. Skills retain tracker, Git-history, Wiki, network, and publication authority; the core cannot exercise them.
_Avoid_: Second workflow, tracker client, Wiki engine, content authority, network service

**Wiki validation pipeline**:
A deterministic, read-only CI gate that checks the Wiki page contract, claim-to-source mappings, source-locator syntax and resolvability, links, navigation, build, support-output drift, baseline-state consistency, and that validation leaves the tracked tree unchanged. It may generate temporary comparison artifacts but never judges semantic correctness, mutates tracked content, or publishes.
_Avoid_: Semantic reviewer, auto-fix commit, semantic generator, publication job

**Wiki semantic review**:
An independent read-only human or agent review of one fixed candidate SHA that judges whether the Canonical Wiki agrees with the prior Wiki, current Change Spec, code, tests, and Wiki reconciliation ledger. The content author, writable Coordinator, or Wiki engine cannot self-accept; only the allocated independent reviewer may produce `reviewed-clean`, and the Coordinator verifies its evidence.
_Avoid_: CI pass, author self-review, engine approval, unfixed working tree, generic clean result

**Wiki validation result**:
A compact result-first report backed internally by the exact candidate or target identity while reporting mechanical and semantic proof separately. A generic `clean` result is valid only when deterministic validation is `clean` and independent semantic review is `reviewed-clean`. The default human view says only that validation passed; technical identities stay in durable evidence and appear only on request or when needed to explain a finding.
_Avoid_: Workflow recap, mandatory SHA explanation, evidence dump, combined unproved clean status

**Exception-only interaction**:
The Ron presentation policy in which a valid **Bounded clean-path delegation** lets clean, in-scope results continue without another routine confirmation, while findings, ambiguity, changed scope, missing capability, or an authorization boundary stop and present the problem plus trade-offs for human decision.
_Avoid_: Repeated clean-path approval, hidden finding, self-granted external write

**Canonical Wiki scope**:
The current behavior, rules, roles, states, exceptions, and source-linked technical context needed to plan future changes. It links to, but does not duplicate, glossary, ADR, Change Spec, API, user, or operational authorities.
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
A structured source reference with required `path`, `kind`, and `value` fields plus an optional non-authoritative `line_hint`. `path` is a normalized repository-relative file path; `kind` is one of `symbol`, `test`, `config-key`, `json-pointer`, or `heading`; `value` is the stable within-file identifier resolved by the matching deterministic adapter. It identifies evidence for a **Wiki material claim** within the same integration candidate. A missing or unsupported resolver produces `not-verifiable`, never a pass.
_Avoid_: Line number only, free-form locator text, duplicated per-citation commit SHA, external-only implementation evidence

**Wiki source resolver profile**:
The configured deterministic capability set that maps a **Wiki source locator** kind and file type to one exact syntactic target. `ron-source-resolvers:v1` bundles Markdown/MDX headings, strict-JSON pointers, exact JSON/YAML/TOML/`.env` config keys, and Python/JavaScript/TypeScript declaration and test names. Other adapters require an exact setup-approved identity and read-only invocation.
_Avoid_: Semantic proof, fuzzy search, comments as declarations, unpinned external parser

**Wiki reconciliation ledger**:
The closeout mapping that carries each affected Wiki topic or material claim from its prior baseline through the current **Change Spec** disposition (`inherit`, `add`, `change`, or `remove`), supporting code and test evidence, conformance result (`aligned`, `deviation`, or `unverified`), and resulting Wiki action. Semantic Wiki mutation requires every row to be `aligned`.
_Avoid_: Code-driven documentation update, diff summary, page list, unsupported current behavior

**Wiki sync**:
The bounded ready-baseline operation that reconciles only affected Wiki topics through an `aligned` **Wiki reconciliation ledger**. It reuses the active Parent or Standalone Issue when one owns the change; otherwise a directly invoked `/wiki` may create exactly one Wiki-repair Standalone Issue after a clean bounded preview. Normal Parent or Standalone closeout invokes the same sync primitive before target integration.
_Avoid_: Full regeneration, code-only documentation repair, second closeout path, silent target drift

**Wiki semantic write set**:
The exact business-meaning pages approved in a Parent or Standalone closeout grant.

**Wiki support write set**:
The preconfigured mechanical Wiki outputs, such as existing indexes, navigation, or `llms.txt`, that may change as a consequence of an approved semantic update.

**Wiki engine**:
An optional, replaceable tool that proposes generated or incremental patches to the **Canonical Wiki** within approved Wiki write sets. The Wiki maintenance flow remains complete without one. An engine does not own accepted content or decide Issue hierarchy, authorization, completion, or affected-page authority.
_Avoid_: Wiki authority, spec authority, completion authority, always-on workflow

**Wiki auxiliary tool**:
An optional, non-authoritative interface or derived index used to read, visually edit, review, or search the **Canonical Wiki**. It does not generate the Wiki contract, expand an approved write set, validate completion, publish canonical content, or turn its own UI state into review evidence.
_Avoid_: Wiki engine, Wiki authority, review authority, required runtime

**Review profile**:
The pre-approved `focused` or `full` allocation of independent Standards, Spec, and applicable Wiki review work for one candidate.

**Material repair wave**:
One bounded pass in which the single writable owner addresses confirmed review findings inside the unchanged execution contract, creates a local checkpoint commit, and produces a new candidate SHA. The current `execute` Grant binds `max_material_repair_waves: 10`; it authorizes up to ten waves without another human approval but never widens scope, acceptance, seams, target, or exclusions.

**Local checkpoint commit**:
An Issue-owned local commit made after one coherent vertical slice or review repair passes its relevant verification. The `execute` Grant may allow any number through `local_checkpoint_commits: allowed_after_verified_slice`; push, target integration, deployment, and unrelated paths remain excluded.

## Relationships

- An **Issue tracker** holds many **Issues**
- A **Change Issue** becomes a **Parent Issue** when Leaf Issues are created, or remains a **Standalone Issue**
- An **Issue** carries one **Triage role** at a time
- A **Decision ticket** is an **Issue** (a child of a `wayfinder:map`)
- A **Parent Issue** coordinates one or more **Leaf Issues**
- A **Leaf Issue** or **Standalone Issue** may be an **Executable Issue**
- A **Parent Issue** or **Standalone Issue** owns one current **Change Spec** lineage
- A **Working Spec** exists only before its **Change Spec** is successfully published and read back
- A **Leaf Issue** owns a **Leaf execution contract** that references its Parent **Change Spec**
- A Parent final-review code finding creates a **Repair Leaf Issue**
- An **Execution Lane** executes authorized **Leaf Issues** sequentially
- An **Authorization Record** may contain a **Bounded Execution Grant** or **Parent Closeout Grant**
- A **Bounded clean-path delegation** may derive an exact downstream **Bounded Execution Grant** or **Parent Closeout Grant**, but never expand its scope ceiling or exclusions
- **Execution readiness** requires both valid authorization and satisfied execution preconditions
- An **Issue Context Packet** may be rebuilt from durable authority and the latest **Issue Progress Checkpoint**
- A **Subagent Task Brief** is derived from one **Issue Context Packet**
- A **Decision Explanation Packet** produces a non-authoritative **Decision Card**
- An **Artifact manifest** limits closeout cleanup to task-owned paths
- A **Parent Closeout Grant** binds one **Closeout Preview** and its **Wiki semantic write set** and **Wiki support write set**
- A semantic **Parent Issue** or **Standalone Issue** closeout derives its Wiki write sets from an `aligned` **Wiki reconciliation ledger**
- A **Wiki validation result** combines a deterministic **Wiki validation pipeline** result with an independent **Wiki semantic review** result without merging their proof authority
- **Exception-only interaction** uses a **Bounded clean-path delegation** rather than replacing an **Authorization Record**
- A **Wiki root adoption assessment** determines whether an existing directory may be proposed as the **Canonical Wiki root** without proving baseline readiness
- A verified **Ron setup commit** makes the operational Wiki contract durable on the named local target before `/wiki` relies on it
- A **Wiki Bootstrap Preview** supplies the exact recoverable input for the **Wiki bootstrap Issue** without becoming tracker authority
- A **Wiki Sync Preview** supplies the exact recoverable input for one Wiki-repair **Standalone Issue** only when no active Issue already owns the change
- A **Wiki bootstrap Issue** contains one or more **Wiki bootstrap batches** without creating **Leaf Issues**
- The default **Wiki control skill** initializes a missing baseline or runs **Wiki sync** for a ready baseline without requiring the user to choose a technical mode
- Parent or Standalone closeout and direct ready-state `/wiki` invocation reuse the same **Wiki sync** primitive
- The configured **Wiki engine** may reconcile only the Wiki write sets bound by that Grant
- A **Wiki auxiliary tool** may consume the **Canonical Wiki** but never inherits Wiki mutation or review authority
- Final review and completion evidence bind the resulting **Target Integration Candidate**
- A **Review profile** determines reviewer allocation without changing the three logical review axes

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
- "Issue Execution Packet" and "Issue Execution Checkpoint" were previously used for overlapping context concepts — resolved as **Issue Context Packet** for ephemeral input and **Issue Progress Checkpoint** for durable recovery output.
