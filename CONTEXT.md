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

**Issue worktree**:
A dedicated Git worktree and topic branch that contain the implementation for exactly one dependency-ready **Issue** before it is integrated into the original local target branch.
_Avoid_: Shared execution lane, authorization workspace

**Execution baseline**:
The original target-branch commit captured once when `execute-issue` starts. It is the fixed point for the first Standards and Spec review, not an authorization hash.
_Avoid_: Per-wave hash confirmation, lifecycle Grant

**Execution completion note**:
The compact human-readable tracker record written after one `execute-issue` candidate passes Standards, Spec, and verification. It names the Issue and linked Spec, original target, worktree, topic branch, baseline, final candidate, verification results, and repair-wave count so `close-issue` can resume separately.
_Avoid_: Hashed envelope, per-wave checkpoint, full conversation transcript

**Manual integration serialization**:
The operating rule that a human starts only one `close-issue` integration into the same target branch at a time; integrations into other target branches may proceed concurrently. The skill protects the candidate and target through refresh, collision checks, preservation evidence, and current-target gates; it does not add a queue or lock.
_Avoid_: Automatic closeout chain, workflow scheduler, concurrent writers for the same target branch

**Ron repository footprint**:
The repository-local Ron configuration, Ron-only instruction text, and inactive or completed `.git/ron-workflow/` metadata left by the retired setup or prior runs. It excludes a current recoverable draft, the Canonical Wiki, tracker history, branches, worktrees, and installed skills.
_Avoid_: All Ron-related history, Wiki content, execution branches

**Ron removal**:
The explicit `/remove-ron` cleanup of one **Ron repository footprint**. It removes only owned local artifacts, commits an actual tracked cleanup diff, and stops on active execution, dirty overlap, or ambiguous ownership without touching external history or delivery state.
_Avoid_: Plugin uninstall, branch cleanup, Issue deletion, full purge

**Target Integration Candidate**:
The exact post-target-sync commit reviewed before the local target branch advances. Target integration is a fast-forward to this same reviewed commit.
_Avoid_: Pre-merge candidate, target verification

**Target refresh**:
The closeout-entry merge of the latest original local target branch into one **Issue worktree** without rebasing. A changed candidate reruns verification and Standards/Spec review; conflict, scope expansion, or a confirmed finding leaves the Issue open for a separate `execute-issue` run.
_Avoid_: Automatic conflict resolution, closeout repair commit

**Execution readiness**:
The state in which an open **Issue** has resolved blockers, clear acceptance and Spec scope, an identifiable original target, and no conflicting worktree owner.
_Avoid_: Approved

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

**Local checkpoint commit**:
An Issue-owned local commit made after one coherent vertical slice or review repair passes its relevant verification. Push, target integration, deployment, and unrelated paths remain excluded during `execute-issue`.

## Relationships

- An **Issue tracker** holds many **Issues**
- An **Issue** carries one **Triage role** at a time
- A **Decision ticket** is an **Issue** (a child of a `wayfinder:map`)
- **Ron removal** deletes only the exact **Ron repository footprint** and leaves historical or active delivery objects intact
- A dependency-ready **Issue** receives one **Issue worktree**, **Execution baseline**, and writable owner
- **Execution readiness** requires satisfied blockers and clear Issue or linked-Spec scope
- An **Issue Context Packet** may be rebuilt from the Issue and latest **Issue Progress Checkpoint**
- An **Execution completion note** hands one unchanged reviewed candidate from `execute-issue` to separately invoked `close-issue`
- **Manual integration serialization** permits only one integration into the same target branch at a time; other target branches may proceed concurrently
- A changed **Target Integration Candidate** is reverified and re-reviewed before target advancement
- `close-issue` fast-forwards the target, removes the clean registered **Issue worktree**, and closes the Issue without repairing product code
- A **Subagent Task Brief** is derived from one **Issue Context Packet**
- A **Decision Explanation Packet** produces a non-authoritative **Decision Card**
- A **Wiki validation result** combines a deterministic **Wiki validation pipeline** result with an independent **Wiki semantic review** result without merging their proof authority
- The **Wiki control skill** resolves a root, validates and semantically reviews bounded Wiki-only edits, and commits only a clean Wiki diff
- Issue delivery does not invoke the **Wiki control skill** or inherit its validation and review obligations
- A **Wiki auxiliary tool** may consume the **Canonical Wiki** but never inherits Wiki mutation or review authority
- Final review and the **Execution completion note** bind the resulting **Target Integration Candidate**
- **Execution code review** supplies the Standards and Spec results used by `execute-issue`
- `execute-issue` owns implementation, Standards/Spec review, and the **Material repair wave** loop for one Issue

## Flagged ambiguities

- "backlog" was previously used to mean both the *tool* hosting issues and the *body of work* inside it — resolved: the tool is the **Issue tracker**; "backlog" is no longer used as a domain term.
- "backlog backend" / "backlog manager" — resolved: collapsed into **Issue tracker**.
- "Issue Execution Packet" and "Issue Execution Checkpoint" were previously used for overlapping context concepts — resolved as **Issue Context Packet** for ephemeral input and **Issue Progress Checkpoint** for durable recovery output.
