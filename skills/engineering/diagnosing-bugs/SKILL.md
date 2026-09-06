---
name: diagnosing-bugs
description: Diagnose a failure or performance regression whose cause is still unknown. Use for evidence-led debugging, not a known mechanical fix or a simple explanation.
---

# Diagnosing Bugs

Find the cause through the shortest reliable evidence path. Read source, inspect logs, reproduce, bisect, or instrument according to what is already known; phases are tools, not mandatory gates. Search relevant domain definitions and ADRs when needed.

## Establish a tight signal

Capture the user's exact symptom and a useful pass/fail signal. Prefer a focused test, CLI invocation, HTTP request, or replay that exercises the real failure. For performance, measure a baseline before changing code. For intermittent failures, measure reproduction rate and control inputs where practical.

Read code before or while building the loop when it helps locate the path. Reduce the repro only enough to distinguish likely causes; complete minimization is optional. Record the command and observed result so the eventual fix can be checked against the original symptom.

Redact secrets from commands, logs, and captured artifacts before sharing them. Keep credentials in environment variables. When essential evidence is inaccessible, name the gap and request only the access or redacted artifact needed; label untested explanations as hypotheses.

## Test explanations

Use the evidence to choose the next discriminating probe. State the prediction, change one relevant variable, and compare the result. Consider competing explanations when the evidence is ambiguous; neither a fixed hypothesis count nor a separate confirmation is required.

Prefer debugger inspection or targeted logs over broad logging. Tag temporary instrumentation with a unique prefix so it can be removed. If only a human can run the necessary step, use `scripts/hitl-loop.template.sh` for that step.

## Fix and verify

When a behavioral regression test can capture the real bug pattern through a public interface, write it before the fix and observe red → green. Choose an existing seam within the approved requirement autonomously. If no practical seam exists, record the limitation and verify at the highest practical surface; a shallow test does not substitute for the real symptom.

Apply the smallest supported fix, rerun the original symptom check and affected verification, remove temporary instrumentation, and explain the cause. Completion requires evidence the reported failure is resolved, or an explicit unresolved state with the preserved findings and next necessary input.
