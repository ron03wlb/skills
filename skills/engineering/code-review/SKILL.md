---
name: code-review
description: Review changes since a fixed point along independent Standards and Spec axes, using parallel sub-agents. Use when the user wants a branch, PR, work-in-progress, or "since X" review, or before integrating a change with material security, data, concurrency, migration, contract, or cross-module risk.
---

Two-axis review of the committed or WIP candidate changes since a fixed point:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they did not specify one and asked to review work-in-progress or current changes, use `HEAD` as the fixed point. Otherwise ask for it.

Choose the candidate form once:

- **Committed candidate** — capture `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base).
- **WIP candidate** — capture `git diff <fixed-point>` for tracked committed, staged, and unstaged changes. Also capture `git status --short`, inspect every in-scope untracked path as candidate input, and explicitly list excluded unrelated paths.

For either form, note the commit list via `git log <fixed-point>..HEAD --oneline`. Confirm the fixed point resolves with `git rev-parse <fixed-point>`. The candidate is non-empty when its tracked diff or at least one in-scope untracked path contains reviewable changes. A bad ref or empty candidate should fail here — not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation — and, like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Validate prospective workflow artifacts

When `execute-issue` supplies a prospective `workflowArtifacts` declaration, include its exact entries in both axes. An explicit empty list means no workflow artifact is claimed. Otherwise require each unique repository-relative `path` to appear in the candidate, with one truthful `requirementSource` and `purpose`. Only a repository- or skill-required non-contract plan, execution log, or equivalent artifact inside this Issue contribution qualifies.

Classification is behavioral, never extension-based. The Standards axis checks the requirement source, exact path ownership, and repository-instruction compliance. The Spec axis checks that the file stays non-contract and inside the published scope. Public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, falsely sourced, or unowned documentation is ordinary material scope; report it rather than accepting the declaration. The field never supplies coverage, review, or verification authority.

### 5. Spawn both sub-agents in parallel

**Standards sub-agent prompt** — include:

- The candidate diff command, commit list, in-scope untracked path contents, and explicit unrelated-path exclusions.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full — the sub-agent has no other access to it.
- The prospective `workflowArtifacts` declaration when supplied, including an explicit empty list.
- The brief: "Report — per file/hunk where relevant — (a) every place the diff violates a documented standard: cite the standard (file + the rule); (b) any baseline smell you spot: name it and quote the hunk; and (c) any workflow-artifact path, requirement source, purpose, or Issue-contribution ownership that is missing, false, duplicate, ambiguous, or inconsistent with repository instructions. Distinguish hard violations from judgement calls — documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** — include:

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

Present the classified observations under `## Standards` and `## Spec` headings. Keep each sub-agent's text visible, adding only the Coordinator's confirmed or advisory label and evidence check. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

An axis is clean when it has no Confirmed code review finding; Code review advisories may remain visible in a clean result. End with a one-line summary giving confirmed and advisory counts per axis and the worst confirmed issue within each axis, if any. Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
