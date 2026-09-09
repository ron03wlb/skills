---
name: code-review
description: Review a concrete committed or WIP diff against a fixed point and applicable Standards and Spec. Use for a requested code review or before integration with material security, data, concurrency, migration, contract, or cross-module risk; not general prose feedback.
---

Two-axis review of the committed or WIP candidate changes since a fixed point:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the applicable requirements, including explicit human requirements and accepted decisions retained in conversation?

Keep the axes separate. Material security, data, concurrency, migration, contract, or cross-module risk requires independent reviewers, using parallel sub-agents when available. For a low-risk requested review, one agent may perform both applicable axes and record that mode. If required independent evidence is unavailable, report review incomplete. Use the task's configured model and appropriate reasoning; no blanket highest-reasoning requirement.

Use tracker setup only when the chosen source or owning workflow requires it. If that route requires missing `docs/agents/issue-tracker.md`, report the limitation and tell the user to run `/setup-matt-pocock-skills`; standalone conversation or file review needs no tracker setup.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they did not specify one and asked to review work-in-progress or current changes, use `HEAD` as the fixed point. Otherwise ask for it.

Choose the candidate form once:

- **Committed candidate** — resolve the supplied candidate ref, or `HEAD` when none is supplied, once to a full `<candidate-sha>`. Capture `git diff <fixed-point>...<candidate-sha>` (three-dot, against the merge-base), or the exact comparison explicitly requested by the user. Report both resolved endpoints; later branch movement cannot change this candidate.
- **WIP candidate** — capture `git diff <fixed-point>` for tracked committed, staged, and unstaged changes. Also capture `git status --short`, inspect every in-scope untracked path as candidate input, and explicitly list excluded unrelated paths.

For committed work, note `git log <fixed-point>..<candidate-sha> --oneline`; for WIP, record current `HEAD` and the observed working-tree inputs. Confirm the fixed point resolves with `git rev-parse <fixed-point>`. The candidate is non-empty when its tracked diff or at least one in-scope untracked path contains reviewable changes. A bad ref or empty candidate should fail here — not inside two parallel sub-agents.

### 2. Resolve and freeze the requirements

Requirements explicitly designated by the human or owning workflow take precedence over automatically discovered commit references or repository documents. A conversation, a file, or an Issue can supply the Spec. Use the designated source and its applicable scope first; consult commit references and matching repository specs only when no source was designated or as supporting context. Verify discovered material applies to this change before treating it as requirements.

Freeze the exact applicable requirement statements and their provenance before review. A concise packet in the reviewer brief is sufficient:

- Identify each source and its observed version: conversation/task and message or turn reference with speaker and exact excerpt; file path and revision or captured content; Issue identity and fetched body/comment version or captured content. Include any accepted decision and the human acceptance that makes it applicable. Use available locators truthfully; never invent message IDs or approval.
- Separate **accepted requirements**, **assumptions**, and **unaccepted assistant proposals**. Only applicable human requirements and accepted decisions establish conversational Spec authority; assumptions and proposals remain context and cannot prove a mismatch.
- Supply the same frozen statements and provenance to every reviewer, including reviewers without inherited conversation. A source pointer alone is insufficient when that reviewer cannot read its exact contents. No physical Spec, new Issue, or renewed approval is needed merely to review already specified requirements.

For an explicitly required unavailable or conflicting source, report the exact limitation and do not substitute guessed requirements or silently select among conflicting designated sources. Assess any separable supported requirements with their limits visible; affected requirements remain unassessed. A standalone general review with no applicable requirement basis may complete Standards and report `Spec not assessed` with the reason, without a mandatory clarification round. This is neither a Spec pass nor complete acceptance.

Formal `execute-issue` delivery still requires its governing published Spec and clean applicable Standards and Spec axes. Conversation cannot silently replace published Issue scope; a material scope change follows the existing planning/revision route. Missing or conflicting governing requirements leave formal review incomplete, even if a separate conversation-based assessment is possible.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** reference — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

When the Standards axis judges source changes, read [the smell baseline](references/smell-baseline.md). It is heuristic evidence, not an additional mandatory whole-repository scan. Other axes and callers need not load it.

### 4. Validate prospective workflow artifacts

When `execute-issue` supplies a prospective `workflowArtifacts` declaration, include its exact entries in both axes. An explicit empty list means no workflow artifact is claimed. Otherwise require each unique repository-relative `path` to appear in the candidate, with one truthful `requirementSource` and `purpose`. Only a repository- or skill-required non-contract plan, execution log, or equivalent artifact inside this Issue contribution qualifies.

Classification is behavioral, never extension-based. The Standards axis checks the requirement source, exact path ownership, and repository-instruction compliance. The Spec axis checks that the file stays non-contract and inside the published scope. Public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, falsely sourced, or unowned documentation is ordinary material scope; report it rather than accepting the declaration. The field never supplies coverage, review, or verification authority.

### 5. Run the applicable review axes

For independent review, give each reviewer its axis inputs and the frozen requirement packet. For a low-risk inline review, use the same frozen statements, provenance, limitations, and evidence checks separately.

**Standards reviewer brief** — include:

- The candidate diff command, commit list, in-scope untracked path contents, and explicit unrelated-path exclusions.
- The list of standards-source files you found in step 3, the applicable smell-baseline reference from step 3.
- The frozen requirement packet from step 2 for source attribution and scope context; Standards findings still require repository-standard evidence.
- The prospective `workflowArtifacts` declaration when supplied, including an explicit empty list.
- The brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; and (c) any workflow-artifact path, requirement source, purpose, or Issue-contribution ownership that is missing, false, duplicate, ambiguous, or inconsistent with repository instructions. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec reviewer brief** — include:

- The candidate diff command, commit list, in-scope untracked path contents, and explicit unrelated-path exclusions.
- The frozen requirement statements, provenance, acceptance evidence, source limitations, and separately labeled assumptions and unaccepted proposals from step 2; include the governing published Spec for a formal Issue caller.
- The prospective `workflowArtifacts` declaration when supplied, including an explicit empty list.
- The brief: "Report: (a) applicable requirements that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; and (d) any declared workflow artifact that changes runtime, public contract, routing, Acceptance Criteria, governance, or otherwise remains arbitrary, ambiguous, or unowned ordinary material scope. Quote the exact frozen requirement and its provenance for each finding. Keep assumptions, unaccepted proposals, and unassessed requirements distinct from violations. Under 400 words."

If no applicable requirements can be assessed, skip the Spec sub-agent and carry `Spec not assessed` and its limitation into aggregation. Partial assessment must identify the unassessed requirements; it cannot yield a clean overall Spec axis.

### 6. Classify observations from exact evidence

After both reports return, the Coordinator classifies every observation as a Confirmed code review finding or Code review advisory, verifies it against the cited source and candidate, and keeps Standards and Spec separate:

- A **Confirmed code review finding** is a Standards violation proved by exact repository-standard evidence or a Spec mismatch proved by exact Spec evidence. The Coordinator must verify that the evidence applies to the cited candidate hunk.
- A **Code review advisory** is a smell, preference, suggestion, duplicate, unsupported inference, or tool failure that lacks the exact repository or Spec evidence required to prove a violation. It remains visible in the current axis report but does not fail review, consume a repair wave, or trigger repair. An advisory never creates a persistent dismissal, tracker waiver, Git note exception, or SHA allowlist. A later fresh review may independently confirm a real violation from exact evidence.

### 7. Aggregate

Present the classified observations under `## Standards` and `## Spec` headings. Report confirmed findings and advisories with candidate, governing source, axis, and review mode. Keep full reviewer reports available through evidence pointers; load or quote them when a disputed finding or audit needs the detail. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

An assessed axis is clean when its applicable requirements were assessed and it has no Confirmed code review finding; Code review advisories may remain visible in a clean result. Report `Spec not assessed` or a partial assessment with its exact source limitation; an unassessed axis is not a zero-finding pass. Missing required independent evidence also remains review incomplete. End with a one-line summary giving assessment status, confirmed and advisory counts per assessed axis, and the worst confirmed issue within each axis, if any. Do not report full acceptance when a required axis is unassessed or incomplete. Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
