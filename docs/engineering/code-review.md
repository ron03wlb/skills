## What it does

`code-review` reviews committed or WIP candidate changes since a fixed point — a commit, branch, tag, or merge-base — along two separate axes: **Standards** (does the code follow this repo's documented conventions?) and **[Spec](https://www.aihero.dev/ai-coding-dictionary/spec)** (does it implement the applicable requirements?). Requirements explicitly designated by the human or owning workflow govern: a conversation, file, or Issue takes precedence over discovered commit references or repository documents. The review records the candidate, sources, review mode, and axis results side by side, because a change can pass one axis and fail the other.

A **Confirmed code review finding** proves a Standards violation or Spec mismatch from exact governing evidence. A **Code review advisory** lacks that proof and stays visible without failing an assessed axis or creating waiver state. Missing required assessment remains a limitation even when there are no confirmed findings.

## When to reach for it

Type `/code-review`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it automatically when you ask to review a branch, a PR, work-in-progress changes, or anything "since X".
The agent also reaches for this skill before integration when a change has material security, data, concurrency, migration, contract, or cross-module risk.

| Review context | Evidence mode |
| --- | --- |
| Material risk | Independent reviewers, using parallel [subagents](https://www.aihero.dev/ai-coding-dictionary/subagent) when available |
| Low-risk requested review | One agent may assess both applicable axes separately |
| Required independent evidence is unavailable | Report review incomplete |

Reach for this when there is a diff to judge against a known-good point and you want the two questions — *is it built right?* and *is it the right thing?* — answered independently. It runs at the end of the build loop; for actually writing the code test-first, use [tdd](https://aihero.dev/skills-tdd), and for building a whole spec into code use [implement](https://aihero.dev/skills-implement), which runs its own `/code-review` pass before committing.
Automatic risk-based invocation does not relax that gate: the review still requires a fixed point.

- Committed work: resolve the supplied candidate ref, or `HEAD` by default, to one SHA. Review its merge-base diff unless the user explicitly requests another comparison; record both endpoints.
- Work in progress: `HEAD` is the default fixed point when none is named; include tracked changes and explicitly in-scope untracked files, preserving unrelated dirt.

## Prerequisites

The **Standards** axis needs nothing set up — it uses the disclosed Fowler smell baseline when judging source changes, even in a repo that documents no conventions. Tracker wiring from [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) is required only when the chosen source or owning workflow requires it.

| Requirement basis | Review behavior |
| --- | --- |
| Explicit conversation, file, or Issue | Use that source first and freeze the applicable statements with provenance |
| No designated source | Check discovered material for applicability; do not infer requirements from a coincidental reference |
| Required source unavailable or conflicting | Name the limitation; retain unassessed requirements without substituting guesses |
| Standalone general review with no applicable Spec | Complete Standards and report `Spec not assessed`; this is not a Spec pass or complete acceptance |
| Formal Issue delivery | Require the governing published Spec and clean applicable Standards and Spec axes |

Explicit human requirements and accepted decisions in conversation are enough for a review. Each reviewer receives exact statements, speaker/source references, and acceptance evidence, with assumptions and unaccepted assistant proposals labeled separately. This works even without inherited conversation and requires no new physical Spec, Issue, or renewed approval merely to review. Conversation cannot silently change a published Issue's scope; material changes retain the existing planning/revision route.

## Two axes, never merged

The defining idea is the **two axes**. **Standards** asks whether the diff conforms to how this repo writes code — its `CODING_STANDARDS.md` or `CONTRIBUTING.md`, plus a fixed baseline of ~12 Fowler code smells (Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, …). Two rules keep the baseline safe: a documented repo standard always overrides it, and every smell is a judgement call, never a hard violation. **Spec** asks the orthogonal question — does the code implement the frozen applicable requirements without missing behavior or smuggling in scope creep?

Independent review keeps reviewer [context](https://www.aihero.dev/ai-coding-dictionary/context) separate where risk requires it; the final report always presents applicable results under separate `## Standards` and `## Spec` headings with a per-axis summary. There is deliberately no single winner across axes. The compact report names its candidate, sources, review mode, confirmed findings, and advisories. Full reports remain available through evidence pointers when a finding or audit needs detail.

During Issue execution, both axes also receive the prospective `workflowArtifacts` declaration. Standards validates each exact path, requirement source, purpose, and Issue-contribution ownership. Spec verifies that the artifact is a required non-contract plan, execution log, or equivalent rather than public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, or unowned scope. File extensions decide nothing, and the declaration grants no coverage or verification authority.

## Evidence decides what blocks

The Coordinator checks every observation against its cited candidate hunk and governing source. Exact repository or Spec evidence makes a violation a Confirmed code review finding. Unsupported smells, preferences, suggestions, duplicates, and [tool](https://www.aihero.dev/ai-coding-dictionary/tool) failures are Code review advisories: they remain visible, but do not fail a clean axis, trigger repair, consume a repair wave, or create a persistent dismissal, tracker waiver, Git note exception, or SHA allowlist. A later review can still confirm a real violation from fresh exact evidence.

## It's working if

- It pins and confirms the fixed point first (`git rev-parse`), failing fast on a bad ref or empty candidate; a WIP candidate may consist only of explicitly in-scope untracked files.
- Standards and Spec findings arrive in two distinct blocks, each citing its source — a repo standard or baseline smell for one, a quoted spec line for the other.
- Each observation is labelled confirmed or advisory; an assessed axis is clean when it has no Confirmed code review finding, even when Code review advisories remain visible.
- Spec findings quote the applicable requirement and its provenance; assumptions and unaccepted proposals never become approved scope.
- Missing requirements produce `Spec not assessed` or an explicitly partial assessment with the source limitation. Neither is presented as a clean overall Spec axis or full acceptance.

## Where it fits

`code-review` checks a fixed candidate produced by the appropriate execution owner:

- Tracker Spec: [to-spec](https://aihero.dev/skills-to-spec) publishes its Run or [to-tickets](https://aihero.dev/skills-to-tickets) route; [execute-issue](https://aihero.dev/skills-execute-issue) runs implementation review before completion.
- Standalone Spec or explicit current-branch work: [implement](https://aihero.dev/skills-implement) invokes review for its candidate.

[ask-matt](https://aihero.dev/skills-ask-matt) maps the surrounding flows.
