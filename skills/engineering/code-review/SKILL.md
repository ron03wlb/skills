---
name: code-review
description: Review a concrete committed or WIP diff against a fixed point and applicable Standards and Spec. Use for a requested code review or before integration with material security, data, concurrency, migration, contract, or cross-module risk; not general prose feedback.
---

Two-axis review of the committed or WIP candidate changes since a fixed point:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / spec?

Keep the axes separate. Material security, data, concurrency, migration, contract, or cross-module risk requires independent reviewers, using parallel sub-agents when available. For a low-risk requested review, one agent may perform both applicable axes and record that mode. If required independent evidence is unavailable, report review incomplete. Use the task's configured model and appropriate reasoning; no blanket highest-reasoning requirement.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they did not specify one and asked to review work-in-progress or current changes, use `HEAD` as the fixed point. Otherwise ask for it.

Choose the candidate form once:

- **Committed candidate** — resolve the supplied candidate ref, or `HEAD` when none is supplied, once to a full `<candidate-sha>`. Capture `git diff <fixed-point>...<candidate-sha>` (three-dot, against the merge-base), or the exact comparison explicitly requested by the user. Report both resolved endpoints; later branch movement cannot change this candidate.
- **WIP candidate** — capture `git diff <fixed-point>` for tracked committed, staged, and unstaged changes. Also capture `git status --short`, inspect every in-scope untracked path as candidate input, and explicitly list excluded unrelated paths.

For committed work, note `git log <fixed-point>..<candidate-sha> --oneline`; for WIP, record current `HEAD` and the observed working-tree inputs. Confirm the fixed point resolves with `git rev-parse <fixed-point>`. The candidate is non-empty when its tracked diff or at least one in-scope untracked path contains reviewable changes. A bad ref or empty candidate should fail here — not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

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

For independent review, give each reviewer only its inputs. For a low-risk inline review, use the same evidence checks separately.

**Standards reviewer brief** — include:

- The candidate diff command, commit list, in-scope untracked path contents, and explicit unrelated-path exclusions.
- The list of standards-source files you found in step 3, the applicable smell-baseline reference from step 3.
- The prospective `workflowArtifacts` declaration when supplied, including an explicit empty list.
- The brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; and (c) any workflow-artifact path, requirement source, purpose, or Issue-contribution ownership that is missing, false, duplicate, ambiguous, or inconsistent with repository instructions. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec reviewer brief** — include:

- The candidate diff command, commit list, in-scope untracked path contents, and explicit unrelated-path exclusions.
- The path or fetched contents of the spec.
- The prospective `workflowArtifacts` declaration when supplied, including an explicit empty list.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong; and (d) any declared workflow artifact that changes runtime, public contract, routing, Acceptance Criteria, governance, or otherwise remains arbitrary, ambiguous, or unowned ordinary material scope. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 6. Classify observations from exact evidence

After both reports return, the Coordinator classifies every observation as a Confirmed code review finding or Code review advisory, verifies it against the cited source and candidate, and keeps Standards and Spec separate:

- A **Confirmed code review finding** is a Standards violation proved by exact repository-standard evidence or a Spec mismatch proved by exact Spec evidence. The Coordinator must verify that the evidence applies to the cited candidate hunk.
- A **Code review advisory** is a smell, preference, suggestion, duplicate, unsupported inference, or tool failure that lacks the exact repository or Spec evidence required to prove a violation. It remains visible in the current axis report but does not fail review, consume a repair wave, or trigger repair. An advisory never creates a persistent dismissal, tracker waiver, Git note exception, or SHA allowlist. A later fresh review may independently confirm a real violation from exact evidence.

### 7. Aggregate

Present the classified observations under `## Standards` and `## Spec` headings. Report confirmed findings and advisories with candidate, governing source, axis, and review mode. Keep full reviewer reports available through evidence pointers; load or quote them when a disputed finding or audit needs the detail. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

An axis is clean when it has no Confirmed code review finding; Code review advisories may remain visible in a clean result. End with a one-line summary giving confirmed and advisory counts per axis and the worst confirmed issue within each axis, if any. Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
