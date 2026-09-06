## What it does

`tdd` builds one approved behavior through a **red → green** loop: observe a failing test through a public interface, implement the smallest change, and observe it pass. Tests describe externally observable behavior so they survive internal refactoring.

The agent selects an existing **seam** from approved requirements autonomously; existing approval is enough to start a behavioral test.

## When to reach for it

Type `/tdd`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) selects it for test-first behavior or a meaningful regression test.

- Approved behavior at an existing public interface: state the seam and proceed.
- New interface or unresolved contract decision: settle the material choice first.
- Explicit request to confirm first: follow that request.
- Routine wording edit: no behavioral test is needed.

## One behavior at a time

Each test is a tracer bullet through a useful public interface. Expected results come from the requirement or a worked example, not a duplicate of the implementation. Run one red → green slice before choosing the next. Examples and mocking guidance are available when the test design needs them.

[codebase-design](https://aihero.dev/skills-codebase-design) supports the interface-design branch when the seam itself is unsettled.

## It's working if

- You see the new test fail for the intended reason before the fix passes it.
- The test names a behavior you requested and uses the interface its callers use.
- Approved behavior proceeds without repeated seam-approval questions.
- A new contract decision is surfaced before implementation depends on it.

## Where it fits

`tdd` is the implementation loop used by [implement](https://aihero.dev/skills-implement) and [execute-issue](https://aihero.dev/skills-execute-issue). [code-review](https://aihero.dev/skills-code-review) checks the resulting fixed candidate. [ask-matt](https://aihero.dev/skills-ask-matt) maps the surrounding flow.
