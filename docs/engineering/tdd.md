## What it does

`tdd` builds one approved behavior through a **red → green** loop: observe a failing test through a public interface, implement the smallest change, and observe it pass. Tests describe externally observable behavior so they survive internal refactoring.

The agent selects an existing **seam** from approved requirements autonomously. A new interface or unresolved requirement needs a decision when it changes the contract; an already approved interface needs no repeated confirmation.

## When to reach for it

Type `/tdd`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reaches for it for test-first behavior or a meaningful regression test. Routine wording edits do not need behavioral tests.

## One behavior at a time

Each test is a tracer bullet through a useful public interface. Expected results come from the requirement or a worked example, not a duplicate of the implementation. Run one red → green slice before choosing the next. Examples and mocking guidance are available when the test design needs them.

If the interface itself needs design, [codebase-design](https://aihero.dev/skills-codebase-design) helps choose its shape. Respect an explicit request to confirm first; otherwise state the existing seam and proceed within the approved behavior.

## It's working if

- You see the new test fail for the intended reason before the fix passes it.
- The test names a behavior you requested and uses the interface its callers use.
- Approved behavior proceeds without repeated seam-approval questions.
- A new contract decision is surfaced before implementation depends on it.

## Where it fits

`tdd` is the implementation loop used by [implement](https://aihero.dev/skills-implement) and [execute-issue](https://aihero.dev/skills-execute-issue). [code-review](https://aihero.dev/skills-code-review) checks the resulting fixed candidate. [ask-matt](https://aihero.dev/skills-ask-matt) maps the surrounding flow.
