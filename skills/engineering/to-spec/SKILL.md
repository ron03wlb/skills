---
name: to-spec
description: Turn the current conversation into a spec, seal approved planning artifacts, and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed.
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Determine whether this is a primary Spec or a revision. If the conversation or argument references an existing Spec, read its full body and comments, set mode to `revision`, and update the same tracker Spec; do not create a duplicate. Otherwise set mode to `primary`. Draft the Spec using the template below, but do not publish it or apply `ready-for-agent` yet.

4. Select the Planning Seal before publication. It is the target-branch commit recorded as the planning baseline for approved glossary and ADR changes from the settled conversation. A direct `/to-spec` invocation authorizes at most one local commit when those artifacts need sealing; it does not authorize any other commit, push, merge, cleanup, or unrelated path.

Resolve the local target branch and inspect its staged, unstaged, and untracked changes. Classify only the planning artifacts owned by this Spec:

Before classifying the current delta on a retry, read any prior partial-publication state. If its tracker read-back or exact partial-state report records a verified Planning Seal, require that full SHA to exist locally and be an ancestor of the current target `HEAD`, then reuse it. Conflicting or missing retry evidence stops; never replace a previously selected seal with the current target `HEAD`.

- If there is no relevant planning-artifact delta and no verified partial-publication seal was recovered, reuse the current target `HEAD` as the planning baseline and do not create an empty commit.
- If the delta consists of exact approved paths or hunks from the settled conversation, commit only those changes. Preserve unrelated staged entries, working-tree changes, untracked files, file modes, and path status; never use broad staging. If a file mixes owned and unrelated hunks and exact isolation cannot be proved, stop.
- If ownership, target identity, or scope is ambiguous, or the approved delta cannot be isolated from unrelated work, stop before commit or publication and ask only for the missing decision.

Verify the resulting full commit SHA, require the owned planning changes to be committed, and prove the unrelated target snapshot is unchanged. Record `created` when this invocation made the commit and `reused` when no commit was needed. If the commit fails, stop before tracker publication. Any failure or mismatch after the seal is selected—including tracker create or update, label application, or read-back—keeps the verified seal. Report its full SHA with the exact partial state; do not amend, reset, or roll back the Planning Seal.

5. Publish the Spec. In `primary` mode, create the tracker Spec. In `revision` mode, update the same tracker Spec and do not create a duplicate. Populate its Planning baseline fields, apply the `ready-for-agent` triage label, then read the published body back once and require the recorded mode, commit, and seal state to match before reporting completion.

<spec-template>

## Planning baseline

- Mode: <primary or revision>
- Commit: <full local target-branch commit SHA>
- Seal: <created or reused>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
