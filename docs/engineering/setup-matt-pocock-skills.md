## What it does

`setup-matt-pocock-skills` answers three questions about one repo: where issues live, what the triage labels are called, and where the domain docs sit. It records the answers as markdown files under `docs/agents/`, then reports read-only installed workflow diagnostics for the public skills and separately installed producer/Run adapters visible to the current harness.

Those files are the only thing that varies between repos. The skills themselves are identical everywhere; they read `docs/agents/issue-tracker.md` at run time and do what it says. That is why the set is not tied to GitHub, and why no skill file ever needs editing to point it somewhere else. Invoking it with "link the skills to a custom issue tracker" works with anything you can connect to programmatically, with zero changes to the skills.

It is a prompt-driven skill, not a deterministic script. It reads your `git remote`, your existing `CLAUDE.md`, your existing `CONTEXT.md`, proposes what it found, and waits for you to confirm before writing anything.

## When to reach for it

You invoke this by typing `/setup-matt-pocock-skills`; the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own. It is deliberately marked non-invokable, so no other skill can fire it for you.

Reach for it once per repo, before the first use of any other engineering skill. If [triage](https://aihero.dev/skills-triage), [to-spec](https://aihero.dev/skills-to-spec), [to-tickets](https://aihero.dev/skills-to-tickets) or [wayfinder](https://aihero.dev/skills-wayfinder) start guessing where your issues go, or apply labels your tracker doesn't have, they have not been set up here yet. A repo already halfway through a project is a fine place to run it; the skill reads what is already there and no earlier work is wasted.

## Prerequisites

It writes into the repo you run it in:

| It writes | Where |
| --- | --- |
| `issue-tracker.md` | `docs/agents/` |
| `domain.md` | `docs/agents/` |
| `triage-labels.md` | `docs/agents/`, only when the `triage` skill is installed |
| An `## Agent skills` block | whichever of `CLAUDE.md` / `AGENTS.md` already exists |

All of it is committed markdown. There is no user-level or global mode: the config lives in the repo, so every repo gets its own copy.

The readiness prerequisites setup reports are a separate list. Each one is a read-only probe of an owner that is not setup, so no row of this table is a prerequisite for them and none of them writes anything here.

## The three decisions

It leads each section with the recommended answer, and skips whatever exploration already settled. Most runs settle every section in two answers; the resolved plan is then accepted once before anything is written.

| Decision | What it proposes | When it actually asks |
| --- | --- | --- |
| **Issue tracker** | the one matching your `git remote` | always: this is the one real choice |
| **Triage labels** | keep the five canonical names (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) | only if the `triage` skill is installed |
| **Domain docs** | single-context: one `CONTEXT.md` plus `docs/adr/` at the root | only if it spots monorepo signals, and then it offers a multi-context `CONTEXT-MAP.md` |

The tracker options:

| Option | Where issues live | Needs |
| --- | --- | --- |
| **GitHub** | the repo's GitHub Issues | the `gh` CLI |
| **GitLab** | the repo's GitLab Issues | the `glab` CLI |
| **Local markdown** | files under `.scratch/<feature>/` in this repo | nothing: no remote at all |
| **Other** | wherever you say | one paragraph from you describing the workflow |

The first three ship as templates in the skill and work out of the box. Local markdown is a first-class option, not a fallback: a solo project with no remote is fully supported. One caveat is worth repeating: don't use local markdown if you're using GitHub. They are alternatives, not layers.

"Other" is not a stub either. It is the reason Jira, Linear, Azure DevOps and Beads all work: you describe the workflow, the skill records your prose in `docs/agents/issue-tracker.md`, and the downstream skills follow the prose. The community has already done this: a Jira-over-[MCP](https://www.aihero.dev/ai-coding-dictionary/mcp) variant, a Gitea CLI shaped like `gh`, a hand-built local dashboard.

## Installed workflow diagnostics

After configuration, setup reads the current harness's resolved installations and reports the configured tracker, triage labels when applicable, required public skill surfaces, operation-scoped producer store, producer handoff, concrete GitLab Spec and Decomposition producers when applicable, target reader, shared target writer, deterministic operation identity, repository close lease, per-Run execution capacity, lane settlement on the selected delivery substrate, and Run composition, plus the lane worker agent the selected substrate resolves. For hosted trackers it compares every configured triage label with the provider's read-only label listing; the local-file adapter validates its `Status:` mappings because it has no separate label registry. A missing or unknown seam names its owning source, observed evidence, and the smallest human action there, such as repairing tracker access, installing a substrate release that settles a mutation-capable lane, or updating the package that owns the adapter. A required seam that is missing or unknown leaves readiness not-ready; a settled read-only lane is never proof that a mutation-capable lane settles.

The diagnostic carries the re-derived bootstrap criteria for the substrate ADR-0080 selects. Each criterion names the prerequisite it depends on and the owning source that proves or repairs it, so readiness is never claimed from a probe set that cannot detect the failure class the selected substrate exhibits. The prerequisites the retired `pi-workflow` materialization needed are retired or replaced rather than reused: the delivered bundle root, `@earendil-works/pi-coding-agent` resolution from that package, and the target repository ignoring its run area are gone from the criteria, while the lane worker agent is re-derived against the root the selected substrate actually declares, and `gh api --paginate --slurp` stays as the tracker publication capability with setup as the owner that repairs it. Setup reports the seam the substrate owns rather than probing it on the substrate's behalf.

The diagnostic is deliberately read-only. It does not install or repair a separately owned coordinator, create a producer transaction, derive or adopt an operation identity, create a Run, acquire either closeout lease, mutate the tracker, or authorize publication, execution, integration, aggregate verification, or push. Aggregate setup health is orientation for the human; every later skill reads its own authority at its own boundary.

## One plan, one acceptance, one owner per seam

Setup resolves its preflight and presents one bounded plan: the section answers, every owner action with its owning source, its exact effect, its recovery rule and its read-back check, and the observed state of every prerequisite the plan depends on. It performs no mutation of any kind before one explicit human acceptance, and a changed source, target, binding, external effect or recovery action requires a fresh acceptance, while an operation already accepted is never re-asked.

Repository configuration is the one write setup owns; every other action in the accepted plan stays with its existing owner. Setup calls each owner in dependency order, reads every receipt back through that owner's own authoritative surface, and never reproduces their package building, installation, binding, tracker mutation, recovery or receipt logic. A missing or unproven prerequisite is reported as the not-ready verdict described above, not repaired inside setup.

## Common questions

**A producer says its adapter is missing. Will re-running setup install it?**

No. Setup writes tracker, label and domain-document configuration, and inspects installed workflow capabilities. A missing concrete producer adapter needs its owning package's installation or explicit repository binding. GitLab tracker-only Spec and Decomposition publication use separate entries in the personal coordinator; the latter also reads the repository-owned `Blocking representation`. For a GitLab tracker the approved plan also binds the project through that producer owner, and with that binding in place the Run entry composes its GitLab tracker sources, so the repository reaches Run-ready from the one bootstrap. An interface document marked present is not evidence that a concrete GitLab implementation is configured.

**Do I have to use GitHub?**

No. GitHub, GitLab and local markdown under `.scratch/` all ship as ready-made templates, and anything else works through the "other" path. This is the most-repeated question in the record, in roughly these words: *"hard locked to github"*, *"can I use GitLab / Jira"*, *"what about Azure DevOps"*. The answer every time is that the tracker is a setup answer, not a skill property.

**Do I need to re-run it after updating the skills?**

Direct guidance after v1.1 was to re-run it. The skill's own closing message is softer: it tells you re-running is only needed to switch trackers or start over. Both are defensible and the reason for the gap is real: the seed templates change between versions, so a `docs/agents/issue-tracker.md` written by an older release can go stale against the skills now reading it. If a downstream skill starts doing something the docs describe differently, re-running is the cheap fix.

**It wrote to `CLAUDE.md`, but I'm on Codex.**

Known gap, still open. The file-selection rule is "edit `CLAUDE.md` if it exists, else `AGENTS.md`": it checks which file exists, not which [harness](https://www.aihero.dev/ai-coding-dictionary/harness) is running. A repo with a `CLAUDE.md` left over from Claude Code will get its `## Agent skills` block somewhere Codex never reads. Two workarounds are in circulation: move the block to `AGENTS.md` by hand, or keep `AGENTS.md` canonical and make `CLAUDE.md` a one-line pointer at it. If neither file exists, the skill asks you which to create rather than picking, which has confused people who expected it to just decide.

**It didn't create my triage labels.**

It doesn't. `docs/agents/triage-labels.md` is a *mapping*: it tells `/triage` which strings in your tracker correspond to the five canonical roles. It does not run `gh label create`. On a fresh GitHub repo the labels genuinely do not exist yet, and this has been filed as a bug more than once. Two follow-ons:

- If your tracker already uses the canonical names, the mapping is an identity table and there is nothing to configure. That is the intended common case, not a missing step.
- [wayfinder](https://aihero.dev/skills-wayfinder)'s `wayfinder:map` and `wayfinder:<type>` labels are not created here either, and `gh issue create --label <missing>` fails outright rather than creating the label. Create them by hand before the first wayfinder run on a GitHub repo.

**Can I configure the other skills' behaviour here ([grilling](https://www.aihero.dev/ai-coding-dictionary/grilling) cadence, question format, tone)?**

No. It configures three things: tracker, labels, doc layout. There have been direct requests to make it the home for per-user preferences, and the standing answer is that skills stay opinionated: *"Config is death."* Preferences belong in your `CLAUDE.md` as plain instructions, which every skill already reads.

**Can I keep the config in `~/.claude` instead of committing it to every repo?**

Not today. There is an open request for exactly this from someone running the skills across many repos, and no user-level mode exists. Every repo carries its own `docs/agents/`.

**Isn't it strange to have a skill that configures the other skills?**

One long-standing complaint says yes, in these words: *"having a skill to set up the other skill does not feel right to me: that means the LLM is configuring its own skills."* The trade is real and acknowledged: the alternative to a setup step is duplicating tracker instructions into every skill that touches issues. The output is inspectable, editable markdown, which is the mitigation: you can read every file it wrote and change it by hand, and day-to-day tweaks are exactly that, not another run.


Installed workflow diagnostics distinguish a resolvable package version and current-host tool availability from a proven delivery. Setup can inspect those sources without installing a package or starting a Run.

## It's working if

- `docs/agents/issue-tracker.md` and `docs/agents/domain.md` exist, plus `triage-labels.md` if `triage` is installed — **prerequisite**: the configured tracker's read-only read, owned by `docs/agents/issue-tracker.md` and the provider it names.
- An `## Agent skills` section appears in the instruction file your harness actually reads, with a one-line summary pointing at each of those files — **prerequisite**: the instruction file the harness reads, owned by the repository.
- The tracker it proposed matches the remote you really use, and the label strings match labels that really exist in your tracker — **prerequisite**: the provider's read-only label listing, owned by the configured tracker.
- The report shows every required seam `PRESENT`, including the lane worker agent at the root the selected substrate declares and lane settlement, whose `PRESENT` comes only from its owning probe's `PROVEN` verdict — **prerequisite**: the selected substrate's own records, read by their owning probes and never re-derived by setup.
- `gh api --paginate --slurp` is proven before any publication, and where the report cannot prove something it names the owning source and the smallest human action there instead — **prerequisite**: the GitHub producer's capability probe, repaired at setup, and the installed package and harness inventory behind the rest.
- A blocked run reports a not-ready verdict with one attributable blocker per unproven prerequisite rather than `READY` — **prerequisite**: each seam owner's own verdict, which setup reads and never upgrades. Setup reports the bootstrap's readiness; the selected Run's own entry re-reads its authority at its own boundary, so that verdict is never the Run's.
- Afterwards, `/to-tickets` publishes without asking you where issues live, and `/triage` applies labels rather than inventing them — **prerequisite**: the configuration this run wrote, owned by setup, and the tracker read behind it, owned by the configured provider.
- Nothing in the skill files themselves changed. If setup edited a `SKILL.md`, something went wrong — **prerequisite**: this run's own read-only boundary, owned by setup.

## Where it fits

`setup-matt-pocock-skills` is the **run-once setup** for the engineering flow, the precondition everything else assumes rather than a step in the chain. Its neighbours are its readers: [triage](https://aihero.dev/skills-triage), which applies the label vocabulary written here; [to-spec](https://aihero.dev/skills-to-spec) and [to-tickets](https://aihero.dev/skills-to-tickets), which publish into the tracker named here; and [wayfinder](https://aihero.dev/skills-wayfinder), which reads the "Wayfinding operations" section of the same tracker file to know how maps and child [tickets](https://www.aihero.dev/ai-coding-dictionary/ticket) are stored. The domain-doc layout it records is the one [domain-modeling](https://aihero.dev/skills-domain-modeling) fills in later: it creates `CONTEXT.md` and ADRs lazily, when a term or decision actually gets resolved, so an empty repo after setup is the expected state. For which skill to reach for next, [ask-matt](https://aihero.dev/skills-ask-matt) routes the whole set.
