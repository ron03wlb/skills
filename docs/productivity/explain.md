## What it does

`explain` turns confusing bugs, requirements, design tradeoffs, and questions into a plain-language explanation of the situation, causes, alternatives, and expected effects. It is read-only: it helps you understand without implementing a fix or making your decision.

The explanation is in Traditional Chinese by default, unless you explicitly request another language. Confirmed facts, suspected causes, and unknowns stay separate, so an expected improvement never reads as a verified fix.

## When to reach for it

You invoke this by typing `/explain`, and the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) won't reach for it on its own.

- Use it when you cannot understand an issue or the options behind a question you need to answer. Name the target, or let it use the preceding message and outstanding questions.
- For a quick re-pitch of a message that did not land, use [wait-what](https://aihero.dev/skills-wait-what) instead.
- For active bug diagnosis, experiments, and a tested fix, use [diagnosing-bugs](https://aihero.dev/skills-diagnosing-bugs) instead.

## Explanation, not action

You get four sections: 問題情境, 為甚麼會有問題, 有什麼解決方案, and 解決後的結果. Each problem gets a few bullets per section, local definitions of jargon, and a concrete example. Multiple questions are consolidated where they overlap; distinct problems keep the same short labels throughout, with dependencies made visible.

One fresh-context [subagent](https://www.aihero.dev/ai-coding-dictionary/subagent) does the scoped reading and returns a compact summary with source pointers. The main conversation receives the explanation, not the raw investigation. If delegation is unavailable, the agent says so briefly and reads directly. Neither path requires a report file or changes to your workspace.

## Common questions

**Can it explain the questions before I answer them?**

Yes. With no explicit target, it uses the preceding message and questions waiting for your reply or decision. It explains all identified problems together rather than making you choose one or re-asking the questionnaire.

**Does the final section mean it fixed the problem?**

No. It describes what each feasible option is expected to change, along with costs and uncertainties. You still choose what to do, and any implementation or verification is separate work.

## It's working if

- You can explain the issue back in your own words using the concrete example.
- Every distinct problem appears under all four headings, with consistent labels and visible dependencies.
- You can compare the alternatives and their costs without being pushed into one.
- You can tell what is confirmed, what is suspected, and what remains unknown; no files or fixes appear as a side effect.

## Where it fits

`explain` is a reach-for-it-anytime standalone, including when a question interrupts another flow. [wait-what](https://aihero.dev/skills-wait-what) is its lighter neighbour because it re-pitches a message; [diagnosing-bugs](https://aihero.dev/skills-diagnosing-bugs) goes further because it actively diagnoses and fixes a bug. [ask-matt](https://aihero.dev/skills-ask-matt) routes you over the whole set.
