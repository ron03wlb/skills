## What it does

`code-review` reviews committed or WIP candidate changes since a fixed point — a commit, branch, tag, or merge-base — along two separate axes: **Standards** (does the code follow this repo's documented conventions?) and **[Spec](https://www.aihero.dev/ai-coding-dictionary/spec)** (does it implement what the originating issue or spec asked for?). Material risk requires independent reviewers, using parallel [subagents](https://www.aihero.dev/ai-coding-dictionary/subagent) when available. A low-risk requested review may use one agent for both applicable axes, recording that mode and reporting them side by side. It never merges or re-ranks the two sets of findings — keeping them separate is the whole point, because a change can pass one axis and fail the other, and a single blended verdict lets one mask the other.

Only a **Confirmed code review finding** blocks: the Coordinator must verify exact repository evidence for a Standards violation or exact Spec evidence for a mismatch. A **Code review advisory** lacks that proof and stays visible without failing the review or creating waiver state.

## When to reach for it

Type `/code-review`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it automatically when you ask to review a branch, a PR, work-in-progress changes, or anything "since X".
The agent also reaches for this skill before integration when a change has material security, data, concurrency, migration, contract, or cross-module risk.

Reach for this when there is a diff to judge against a known-good point and you want the two questions — *is it built right?* and *is it the right thing?* — answered independently. It runs at the end of the build loop; for actually writing the code test-first, use [tdd](https://aihero.dev/skills-tdd), and for building a whole spec into code use [implement](https://aihero.dev/skills-implement), which runs its own `/code-review` pass before committing.
Automatic risk-based invocation does not relax that gate: the review still requires a fixed point.

For committed work, the candidate is the merge-base diff through `HEAD`. For work in progress, `HEAD` is the default fixed point when none is named, and the candidate includes tracked changes plus explicitly in-scope untracked files while excluding unrelated dirt.

## Prerequisites

The **Spec** axis needs somewhere to find the originating spec — an issue reference in the commit messages, a path you pass in, or a spec under `docs/`/`specs/`. That issue-tracker wiring comes from [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills); without a spec the Spec axis simply skips and says so. The **Standards** axis needs nothing set up — it uses the disclosed Fowler smell baseline when judging source changes, even in a repo that documents no conventions.

## Two axes, never merged

The defining idea is the **two axes**. **Standards** asks whether the diff conforms to how this repo writes code — its `CODING_STANDARDS.md` or `CONTRIBUTING.md`, plus a fixed baseline of ~12 Fowler code smells (Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, …). Two rules keep the baseline safe: a documented repo standard always overrides it, and every smell is a judgement call, never a hard violation. **Spec** asks the orthogonal question — does the code do what the issue or spec actually asked, without missing requirements or smuggling in scope creep?

Independent review keeps reviewer [context](https://www.aihero.dev/ai-coding-dictionary/context) separate where risk requires it; the final report always presents applicable results under separate `## Standards` and `## Spec` headings with a per-axis summary. There is deliberately no single winner across axes. The compact report names its candidate, sources, review mode, confirmed findings, and advisories. Full reports remain available through evidence pointers when a finding or audit needs detail.

During Issue execution, both axes also receive the prospective `workflowArtifacts` declaration. Standards validates each exact path, requirement source, purpose, and Issue-contribution ownership. Spec verifies that the artifact is a required non-contract plan, execution log, or equivalent rather than public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, or unowned scope. File extensions decide nothing, and the declaration grants no coverage or verification authority.

## Evidence decides what blocks

The Coordinator checks every observation against its cited candidate hunk and governing source. Exact repository or Spec evidence makes a violation a Confirmed code review finding. Unsupported smells, preferences, suggestions, duplicates, and [tool](https://www.aihero.dev/ai-coding-dictionary/tool) failures are Code review advisories: they remain visible, but do not fail a clean axis, trigger repair, consume a repair wave, or create a persistent dismissal, tracker waiver, Git note exception, or SHA allowlist. A later review can still confirm a real violation from fresh exact evidence.

## It's working if

- It pins and confirms the fixed point first (`git rev-parse`), failing fast on a bad ref or empty candidate; a WIP candidate may consist only of explicitly in-scope untracked files.
- Standards and Spec findings arrive in two distinct blocks, each citing its source — a repo standard or baseline smell for one, a quoted spec line for the other.
- Each observation is labelled confirmed or advisory; an axis is clean when it has no Confirmed code review finding, even when Code review advisories remain visible.
- When no spec can be found, the Spec axis reports "no spec available" instead of inventing requirements.

## Where it fits

`code-review` is the review step at the tail of the main build chain:

```txt
grill-with-docs → to-spec → to-tickets → implement → code-review
```

Its closest neighbour is [implement](https://aihero.dev/skills-implement), which drives the build and calls this as its own review pass before committing; upstream, the spec it checks against is produced by [to-spec](https://aihero.dev/skills-to-spec) and [to-tickets](https://aihero.dev/skills-to-tickets). When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
