Quickstart:

```bash
npx skills add mattpocock/skills --skill=code-review
```

```bash
npx skills update code-review
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review)

## What it does

`code-review` reviews committed or WIP candidate changes since a fixed point — a commit, branch, tag, or merge-base — along two separate axes: **Standards** (does the code follow this repo's documented conventions?) and **Spec** (does it implement what the originating issue or spec asked for?). It runs each axis as its own parallel sub-agent and reports them side by side. It never merges or re-ranks the two sets of findings — keeping them separate is the whole point, because a change can pass one axis and fail the other, and a single blended verdict lets one mask the other.

## When to reach for it

Type `/code-review`, or the agent reaches for it automatically when you ask to review a branch, a PR, work-in-progress changes, or anything "since X".
The agent also reaches for this skill before integration when a change has material security, data, concurrency, migration, contract, or cross-module risk.

Reach for this when there is a diff to judge against a known-good point and you want the two questions — *is it built right?* and *is it the right thing?* — answered independently. It runs at the end of the build loop; for actually writing the code test-first, use [tdd](https://aihero.dev/skills-tdd), and for building a whole spec into code use [implement](https://aihero.dev/skills-implement), which runs its own `/code-review` pass before committing.
Automatic risk-based invocation does not relax that gate: the review still requires a fixed point.

For committed work, the candidate is the merge-base diff through `HEAD`. For work in progress, `HEAD` is the default fixed point when none is named, and the candidate includes tracked changes plus explicitly in-scope untracked files while excluding unrelated dirt.

## Prerequisites

The **Spec** axis needs somewhere to find the originating spec — an issue reference in the commit messages, a path you pass in, or a spec under `docs/`/`specs/`. That issue-tracker wiring comes from [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills); without a spec the Spec axis simply skips and says so. The **Standards** axis needs nothing set up — it always carries a built-in Fowler smell baseline even in a repo that documents no conventions.

## Two axes, never merged

The defining idea is the **two axes**. **Standards** asks whether the diff conforms to how this repo writes code — its `CODING_STANDARDS.md` or `CONTRIBUTING.md`, plus a fixed baseline of ~12 Fowler code smells (Mysterious Name, Duplicated Code, Feature Envy, Data Clumps, …). Two rules keep the baseline safe: a documented repo standard always overrides it, and every smell is a judgement call, never a hard violation. **Spec** asks the orthogonal question — does the code do what the issue or spec actually asked, without missing requirements or smuggling in scope creep?

They run as parallel sub-agents so neither pollutes the other's context, and the final report presents them under separate `## Standards` and `## Spec` headings with a per-axis summary. There is deliberately no single winner across axes.

During Issue execution, both axes also receive the prospective `workflowArtifacts` declaration. Standards validates each exact path, requirement source, purpose, and Issue-contribution ownership. Spec verifies that the artifact is a required non-contract plan, execution log, or equivalent rather than public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, or unowned scope. File extensions decide nothing, and the declaration grants no coverage or verification authority.

## It's working if

- It pins and confirms the fixed point first (`git rev-parse`), failing fast on a bad ref or empty candidate; a WIP candidate may consist only of explicitly in-scope untracked files.
- Standards and Spec findings arrive in two distinct blocks, each citing its source — a repo standard or baseline smell for one, a quoted spec line for the other.
- When no spec can be found, the Spec axis reports "no spec available" instead of inventing requirements.

## Where it fits

`code-review` is the review step at the tail of the main build chain:

```txt
grill-with-docs → to-spec → to-tickets → implement → code-review
```

Its closest neighbour is [implement](https://aihero.dev/skills-implement), which drives the build and calls this as its own review pass before committing; upstream, the spec it checks against is produced by [to-spec](https://aihero.dev/skills-to-spec) and [to-tickets](https://aihero.dev/skills-to-tickets). When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
