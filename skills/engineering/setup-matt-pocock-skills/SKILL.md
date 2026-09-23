---
name: setup-matt-pocock-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
disable-model-invocation: true
---

# Setup Matt Pocock's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage labels**: the strings used for the five canonical triage roles
- **Domain docs**: where `CONTEXT.md` and ADRs live, and the consumer rules for reading them
- **Installed workflow diagnostics**: read-only discovery of the configured tracker, public skills, the bundled local Planning Lane Provider, deterministic operation identity, repository close lease, per-Run execution capacity, the selected delivery substrate's lane settlement, separately installed producer/Run adapter seams, the GitLab **Tracker project binding** that makes a configured GitLab project Run-ready, and the lane worker agent the selected substrate resolves

This is a prompt-driven skill, not a deterministic script. Explore, settle the sections with the user, present one bounded plan, and write only after it is accepted.

## Boundaries

Setup is the single approved operational bootstrap of [ADR-0072](../../../docs/adr/0072-make-setup-an-approved-operational-bootstrap.md) as amended by [ADR-0079](../../../docs/adr/0079-amend-the-setup-bootstrap-for-the-pi-workflow-substrate.md). It:

- resolves its preflight and presents **one bounded plan**, and performs **no mutation before one explicit human acceptance**; a changed source, target, binding, external effect or recovery action needs a new acceptance, while an operation the human already accepted is never re-asked;
- **sequences the existing owners** in dependency order and reads every receipt back through its authoritative surface, and never reproduces their package building, installation, binding, tracker mutation, recovery or receipt logic (ADR-0059);
- reduces readiness **truthfully**: `READY` only while every required seam in [installed-workflow-diagnostics.md](./installed-workflow-diagnostics.md) reads `PRESENT`, otherwise one attributable not-ready verdict per unproven prerequisite naming its owning source and the smallest human action there. Setup neither repairs another owner's seam nor claims that owner's verdict as its own;
- never replaces its own running bytes, creates or closes product Issues, starts or grants a product Run, pushes, deploys, or performs database work.

## Process

### 1. Explore and preflight

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `CONTEXT.md` and `CONTEXT-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section B runs at all.
- `docs/agents/gitlab-producer.json`: is a **Tracker project binding** already present, and does it match `git remote get-url origin`? A missing binding for a GitLab origin, a binding that does not match the origin, and a GitHub origin carrying a GitLab binding are each stated as observed, because the Run entry selects its tracker composition from exactly this evidence and fails closed on it.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

Read [installed-workflow-diagnostics.md](./installed-workflow-diagnostics.md) and inspect only the current harness's resolved installed surfaces. Report each installed workflow seam with its owning source, observed evidence, and `PRESENT`, `MISSING`, or `UNKNOWN` state, together with the re-derived criterion it supports and the prerequisite that criterion depends on. This diagnostic is read-only and non-authorizing: never create or repair a skill, adapter, transaction, receipt, writer lease, or tracker object, never probe an owner's seam on its behalf, and never use aggregate setup health as another skill's gate.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next. Those answers settle the plan's contents; they mutate nothing.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `triage` isn't installed, Section C when there's no monorepo).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section B: Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you), since an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names (e.g. `bug:triage` for `needs-triage`), collect the overrides so `triage` applies existing labels instead of creating duplicates.

**Section C: Domain docs.** Default to **single-context** (one `CONTEXT.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `CONTEXT-MAP.md` pointing to per-context `CONTEXT.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

**Section D: Tracker project binding.** Only for a GitLab tracker. When `docs/agents/gitlab-producer.json` is present and matches the origin, the plan lists the binding as already satisfied and reads it back; when it is missing, the plan lists one owner-orchestrated action that creates it. Ask nothing here that exploration already answered; the section settles which owner action the plan carries, not whether an owner exists.

### 3. Present one bounded plan and take one acceptance

Show the user a draft of one bounded plan: the section answers, every owner action with its owning source, its exact effect, its recovery rule and its read-back check, and the observed state of every prerequisite the plan depends on. **A GitLab project binding action is listed before every write in that plan** — it binds the project the rest of the GitLab trackers work against, so presenting it after a write would offer an action the plan cannot legally perform. Its owning source is the installed personal coordinator's `gitlab-producer-entry.mjs`; its exact effect is `configure <repository>`, which validates the origin and the authenticated identity and writes one credential-free local JSON file; its read-back is that same entry's `inspect <repository>`, whose `repositoryId` must equal `gitlab:<host>/<project>`; its recovery is the entry's own failure output, never a hand-written binding. For an SSH remote it asks the human for the HTTPS origin and the complete project path, because the owner requires an explicit binding there, and it passes those two values to the owner rather than writing the file itself. A missing or foreign installed entry is package-installation repair, not a binding setup writes by hand.

Then show:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)

Let them edit before writing, and perform no mutation of any kind before that one explicit acceptance. An unchanged accepted plan is never re-asked; a changed source, target, binding, external effect or recovery action requires a fresh acceptance of the changed plan.

### 4. Write, and sequence the owners

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa); always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section B ran. When it isn't, both are omitted.

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): domain doc consumer rules + layout

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

Repository configuration is the one write this skill owns, so it performs that write itself. Every other action the accepted plan contains stays with its existing owner: call that owner in dependency order and read its receipt back through the owner's own authoritative surface. Label creation, package installation, managed entries, producer bindings and tracker effects each have their owner, and setup never reproduces their package building, installation, binding, tracker mutation, recovery or receipt logic, never substitutes a passing diagnostic for a missing receipt, and preserves a successful partial effect rather than repeating it. Changed owner evidence stops with the exact blocker and the next owner named.

The GitLab **Tracker project binding** is the plan action that names its own owner most precisely: `configure` is the only call that creates or reuses the binding and `inspect` is the only call that reads it back, the binding write touches no tracker object, and read-only diagnostics keep their prohibition on both — a diagnostic that called `configure` would bind a project nobody approved. `invoke` is never a binding call in either mode.

### 5. Done

Tell the user the repository configuration is complete and which engineering skills will now read from these files. Then report readiness as one verdict: `READY` only while every required seam reads `PRESENT`, and otherwise a not-ready verdict with exactly one attributable blocker per unproven prerequisite, the owning source, and the smallest human action at that owner — for lane settlement, that is the selected substrate's own lane record read through its owning probe, and setup neither repairs it nor claims its verdict. Report the read-only installed workflow diagnostic separately, including the exact owning source and smallest human action for each missing or unknown seam. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch. Never imply that a passing diagnostic authorized publication, execution, integration, aggregate verification, or push.
