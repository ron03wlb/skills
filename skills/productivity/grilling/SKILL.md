---
name: grilling
description: Grill unresolved material decisions in a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user about unresolved material decisions within the agreed scope until you reach a shared understanding. A decision is material when its answer could change product behavior, scope, authority, or material risk. Map these decisions and their dependencies as a **design tree**. Resolve routine implementation details from source and existing conventions. Hypothetical branches unrelated to the agreed scope stay outside the tree.

Work the tree in **rounds**. The **frontier** contains the tree's unresolved material decisions whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

When the calling skill limits the session to one material decision at a time, restrict the round to that decision; settle it before opening another.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Carry accepted decisions forward on continuation and re-entry. Reopen a decision only when new evidence invalidates its basis; identify that evidence and the affected decision before asking again. Existing approvals apply only to their settled scope and supply no authority for new scope.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. Unresolved _material decisions_ are the user's — put each to them and wait.

For a requirement that will enter an Issue Run, include the actual operation permissions and declared Manual prerequisites in the design tree. Read existing approvals and prepare concrete installation/task/message/local-close/tracker operations plus read-only host capability evidence before asking once for missing scope. For SQL, settle environment, effect, rights, operator, content identity, recovery and APPLIED/NO_OP validation before Run-ready; no SQL is N/A and adds no question. Follow [Run preparation](../../../docs/agents/run-preparation.md) for the producer handoff. Reuse settled approvals in later leaves and re-entry; only a concrete new scope or irreversible capability opens another decision.

When the frontier is empty and no unresolved material decisions remain, including those waiting on prerequisites, summarize the settled understanding for final confirmation. Do not act on it until the user confirms you have reached a shared understanding. Silence is not agreement or approval. Final confirmation preserves actual permission and Manual prerequisite requirements; it does not replace them.
