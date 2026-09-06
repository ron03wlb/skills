## What it does

`diagnosing-bugs` finds the cause of an unexplained failure or performance regression through a **tight** evidence loop. It chooses source inspection, reproduction, profiling, or a discriminating probe according to the evidence already available.

The loop must eventually verify the reported symptom. A fully minimized reproduction and a fixed number of hypotheses are optional techniques, not prerequisites for reading code or making progress.

## When to reach for it

Type `/diagnosing-bugs`, or the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) selects it for an unexplained failure.

- Unknown cause: use the evidence loop.
- Known mechanical fix or simple explanation: continue directly.
- Diagnosis-only request: report the supported cause and remedy; fixing requires the corresponding user scope.

## A signal that answers the question

A focused test, CLI invocation, HTTP request, or replay should distinguish the failure from success. Performance work starts with a measurement; intermittent failures use a reproduction rate. Source inspection may help build that signal. Minimize only when it helps separate plausible causes.

The agent states the next prediction, runs the probe, and updates its explanation. It redacts secrets from shared evidence and asks for missing access only when that evidence is necessary. Once the cause is supported, it captures the real failure through a practical public interface, applies the fix, and reruns the original symptom check.

## It's working if

- The reported failure and the command or measurement used to check it are explicit.
- Each probe distinguishes a plausible cause; there is no quota of hypotheses or mandatory minimization detour.
- The fix passes the original symptom check and affected verification.
- Temporary instrumentation is removed, and unavailable evidence is reported as a limitation.

## Where it fits

This is a reach-for-it-anytime standalone for unexplained failures. [tdd](https://aihero.dev/skills-tdd) supplies behavioral regression tests; [triage](https://aihero.dev/skills-triage) handles raw reports before the cause is investigated. [ask-matt](https://aihero.dev/skills-ask-matt) is the route map.
