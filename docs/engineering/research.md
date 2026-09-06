## What it does

`research` answers a question by reading the sources that own the answer, then leaves a cited Markdown file in the repo. It works only from **[primary sources](https://www.aihero.dev/ai-coding-dictionary/primary-source)**: official docs, source code, specs, first-party APIs. It follows every claim back to the source that owns it, so it will not repeat a blog post's account of an API when the API's own docs are reachable.

It does not answer you in the conversation. The output is a file, written where the repo already keeps such notes, with a link on each claim. That is the point: a document you can react to, hand to another agent, or throw away, rather than an answer that vanishes when the [session](https://www.aihero.dev/ai-coding-dictionary/session) ends.

## When to reach for it

- Source comparison with a durable cited repository note: use this skill.
- Quick fact lookup: continue directly.
- Useful independent local work can continue: delegate the bounded research.
- No useful parallel work: complete the research directly.

Type `/research`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it automatically when a task needs source comparison and a durable cited note.

Reach for it when the next step is *finding something out* from outside the working directory (how a third-party API behaves, what a spec actually says, whether a version claim holds), and you'd rather not stall your own thread doing the reading. What you need decides which skill:

| What you need | Reach for |
| --- | --- |
| A decision needs primary-source comparison and a cited note | `research` |
| One quick external fact | Direct lookup |
| A decision made *with* you, by interview | [grilling](https://aihero.dev/skills-grilling) |
| A durable architecture decision, written into `CONTEXT.md` and ADRs | [grill-with-docs](https://aihero.dev/skills-grill-with-docs) |
| To find out whether an approach works in your codebase | [prototype](https://aihero.dev/skills-prototype) |
| A plan too big to hold in one session | [wayfinder](https://aihero.dev/skills-wayfinder) |

The line between `research` and `grill-with-docs` is the **shelf life of what comes back**. Research produces short-lived assets: what this library's auth mechanism does as of this week. An ADR records a decision you keep. If what you are producing is a decision rather than a fact, you are [grilling](https://www.aihero.dev/ai-coding-dictionary/grilling), not researching.

## Delegated legwork

The defining output is one cited repository note. When delegation is useful, one **background agent** owns the bounded reading and file while the caller continues independent work. The caller remains responsible for interpreting the findings.

A delegated researcher performs its task directly and does not create nested research agents.

Where the file lands is decided by the repo, not by the skill: it matches whatever convention already exists for notes, and if there is none it picks somewhere sensible and tells you where. It writes one file per run.

## When a source page is blocked

Blocked-page recovery looks for a usable copy or another route to the same primary source. Archives come first, followed by a live reader when configured, then first-party APIs or feeds and browser access. The recovery guide and bundled script help reject redirect stubs and bot-check pages that look like successful fetches.

Recovered evidence keeps its provenance. An archived copy is cited with its snapshot date; live retrieval is identified as live. A historical snapshot can explain past behavior, but current prices or availability still need current evidence. If no usable source is recovered, the finding remains unresolved.

## Common questions

**It spawned a second research agent. Is that meant to happen?**

No. The current instruction contract gives one researcher ownership of the note and forbids nested delegation. The historical duplicate-agent reports motivated that guardrail; they are not the current intended behavior.

If the host cannot delegate, the caller can perform the bounded research directly. Report the actual mode rather than claiming a background task ran.

**Where should the file live, and should I commit it?**

The skill puts the file where the repo already keeps notes and does not have an opinion beyond that. The community one is fairly settled: ADRs are kept, research files are not. The sharpest version of it, from a Discord thread on exactly this question: "ADRs yes. Everything else archive or delete after done. It otherwise becomes cruft of work and can poison future repo reads if you've drifted away from the spec/research." A research file records what was true on the day it was written, so a stale one is worse than none. On balance these artifacts don't really belong in git, and there is no canonical home for them: people use Obsidian, a separate knowledge repo, or the issue tracker instead.

**What counts as a "high-trust" primary source, and who decides?**

The [model](https://www.aihero.dev/ai-coding-dictionary/model) does. The skill names the *kinds* of source that qualify (official docs, source code, specs, first-party APIs), and there is no allowlist, no domain gate, and no verification pass. This was the loudest objection when the skill was first proposed and it has never been answered publicly: "Five research subagents pointed at junk just gives you five confident wrong answers faster. How are you gating what counts as high-trust sources?" The mitigation you actually have is the citation on each claim. Follow two or three of them. If they land on a summary of the thing rather than the thing, the run failed at its one job.

**Does a later session reuse what an earlier run found?**

No. Nothing auto-loads a past research file; it is a document sitting in the repo until a human or a skill points at it. This was raised early as the strongest challenge to the design: "the value's the markdown becoming context the agent re-reads later, not the fetch itself. A write-once dead file is just a fancy search." The shipped skill does not solve it. In practice the file earns its keep by being fed into the next step deliberately: attach it to a spec, quote it into a grilling session, point a [ticket](https://www.aihero.dev/ai-coding-dictionary/ticket) at it.

**Why not just ask the agent to go read the docs?**

A quick question can stay a direct lookup. This skill earns its use when primary-source comparison and a durable cited note help the next decision; background execution is optional.

**When does it stop reading?**

There is no stopping criterion in the skill, and this shows up as two complaints that look opposite but are the same gap: agents that go far too deep, and agents that cover a topic broadly while missing the one specific detail that mattered. One practitioner put it as "deep-research skills are a bit too deep sometimes. And telling an agent to research usually results in missing crucial details." Scoping is on you. A narrow, answerable question (one API, one behaviour, one version claim) comes back far better than "research X".

**`/wayfinder` created research tickets. Do I resolve those myself?**

No, it now fires them for you. In the unreleased changes since v1.1, a charting session spawns a `/research` subagent per research ticket and burns them down in parallel, capturing findings on a throwaway `research/<name>` branch with a [context pointer](https://www.aihero.dev/ai-coding-dictionary/context-pointer) from the ticket. Research tickets are the one exception to wayfinder's one-ticket-per-session rule, because they are [AFK](https://www.aihero.dev/ai-coding-dictionary/afk): nothing waits on you. Two known snags with those branches: the subagent has been seen opening a draft PR from a branch that is never meant to merge ([issue #576](https://github.com/mattpocock/skills/issues/576)), and deleting the branch later breaks the context pointers the tickets hold.

## It's working if

- When research is delegated, your own session keeps going on useful independent work.
- Delegated research has one owner and does not create nested agents.
- One new Markdown file shows up, in the folder the repo already uses for notes, and the agent tells you the path.
- Every claim in it carries a link, and following two at random lands you on an official doc, a spec, or the actual source file, not on someone's write-up of it.
- You can make the decision you were stuck on from the file alone, without going back to the sources yourself.

## Where it fits

A reach-for-it-anytime standalone that feeds the thinking skills rather than sitting in the build chain. Its file is something to take *into* the flow: [grilling](https://aihero.dev/skills-grilling) and [grill-with-docs](https://aihero.dev/skills-grill-with-docs) ask sharper questions when the facts are already on the table, and [to-spec](https://aihero.dev/skills-to-spec) can synthesise against it. [wayfinder](https://aihero.dev/skills-wayfinder) is the one skill that invokes it directly, resolving each research ticket on its map with a `/research` subagent. For the whole map, see [ask-matt](https://aihero.dev/skills-ask-matt).
