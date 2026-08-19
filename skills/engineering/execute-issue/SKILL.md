---
name: execute-issue
description: Validate planning context and implement one tracker Issue in a dedicated worktree, repairing Standards and Spec findings before separate integration.
disable-model-invocation: true
---

# Execute Issue

Implement exactly one open Issue in a dedicated Git worktree. This skill owns implementation plus the existing Matt `code-review`; it stops after a clean completion note and never invokes `close-issue`.

## Entry

Read the exact Issue, its parent or linked Spec when present, repository instructions, acceptance criteria, blockers, and exclusions. The Issue and linked Spec define scope; unresolved blockers or materially ambiguous acceptance stop implementation.

Identify the original target branch and worktree, then read its current `HEAD` as the prospective execution baseline before creating the Issue worktree. If any identity is ambiguous, ask once before writing. Preserve unrelated work and do not repeatedly ask for authorization or re-confirm commit hashes during an unchanged run.

When the Issue or linked Spec records a Planning baseline, require its Planning Seal commit to exist locally and be an ancestor of the execution baseline. A source produced by `/to-spec` or `/to-tickets` with a missing, mismatched, or unreachable seal stops before worktree creation.

As part of validation, perform a seal-currency check: require that the target has no uncommitted planning-artifact delta already owned by this Issue or Spec. This detects a stale seal; it is not scope authority and does not authorize `execute-issue` to classify new scope, commit artifacts, or repair the baseline. Ambiguous ownership stops and returns to the source skill. An older or externally created Issue without a Planning baseline may proceed only when no relevant planning artifact requires sealing; record the seal as `not-applicable`.

`execute-issue` never creates or repairs a Planning Seal, stages planning artifacts on the target, or modifies the parent to make the check pass. Missing or expanded planning scope stops execution. Tell the human to invoke `/to-spec` or `/to-tickets` as appropriate.

Use or create one dedicated worktree and topic branch for the Issue from the verified execution baseline. Identify the worktree path and topic branch once.

## Implement

Trace the real behavior and verification seam, then implement only the Issue outcome. Use TDD when a focused behavioral test can capture the change. Commit coherent, verified slices on the topic branch without touching unrelated paths.

New public behavior, acceptance, target, or exclusions require the Issue or linked Spec to be updated before continuing. They are not review repairs.

## Review and repair

Commit the current candidate and invoke the existing Matt `code-review` against the recorded baseline and Issue or linked Spec. Require both axes to be clean:

- Standards: repository-documented standards are satisfied.
- Spec: the implementation matches the current Issue acceptance criteria and linked Spec.

Confirm findings against source, tests, and the Spec. If any confirmed in-scope finding remains, fix every finding, run affected verification, commit the repair, and rerun the full `code-review` with both Standards and Spec. Continue until both axes report no confirmed findings.

Allow at most 10 repair waves per invocation. A wave counts only when code repair begins. Tool failure, duplicate feedback, and unsupported findings do not count. If wave 10 still has a confirmed finding, preserve the latest verified commit, leave the Issue open, and stop. A later explicit `/execute-issue` invocation receives a new ten-wave limit; do not persist a counter.

## Completion note

Run final verification, require a clean Issue worktree, and ensure its `HEAD` is the reviewed candidate. Record one compact, human-readable completion note on the configured tracker, using a comment or local ticket section, containing:

- Issue and linked Spec references;
- original target branch, worktree path, topic branch, baseline, and final candidate commit;
- Planning baseline commit and seal state (`created`, `reused`, `successor`, or `not-applicable`);
- `standards: clean` and `spec: clean`;
- exact verification commands and results;
- repair-wave count;
- confirmation that the worktree is clean.

Read the note back once, report `implementation_complete`, and stop. The human separately invokes `/close-issue`; execution never integrates the target, removes the worktree, closes the Issue, pushes, or deploys.
