# Manual prerequisites

Read this reference only when Entry finds one exact declared human-executed or human-applied artifact, or implementation evidence proves one unchanged-scope Late prerequisite discovery. This file solely owns declaration selection, attestation validation, the `pre-execute-issue` handoff, and return-to-lane gates. It never grants external execution authority.

## Manual prerequisite attestation

At Entry, inspect the published Issue, linked Spec, and ordered comments for an exact repository-relative artifact declared as a human-executed or human-applied Manual prerequisite. No declared Manual prerequisite preserves ordinary Issue execution. Arbitrary `.sql` files, undeclared paths, and repository scanning never trigger prerequisite routing.

Resolve at most one exact declaration. Missing path identity, multiple declarations, ambiguous ownership, conflicting Issue or Spec evidence, and changed-scope declarations stop without guessed selection, worktree cleanup, tracker repair, or artifact preparation.

For one exact declared artifact, first search the ordered history for a matching successful attestation. A `manual_prerequisite_complete:v2` is valid only when its tracker-native immutable identity and exact Issue, Prerequisite candidate, Git blob, normalized artifact path, and `APPLIED` or `NO_OP` outcome read back unchanged. Require that candidate and blob to exist locally, that the path at the candidate resolves to the blob, and later require that candidate to be an ancestor of the final implementation candidate. A legacy `manual_prerequisite_complete:v1` may authorize only its exact path-bound legacy non-generated artifact; it cannot authorize generated content or substitute for an existing Prerequisite candidate.

When one exact declared artifact has no matching valid attestation, invoke the model-invoked `pre-execute-issue` skill in the same direct-human or DAG-authorized lane. Pass the unchanged lane authority, exact Issue and linked Spec, recorded target and execution baseline, approved scope, declaration, and any already-selected branch or worktree identity. Never stop merely to ask for a second slash command, write a prerequisite-only `implementation_blocked` note, execute the artifact, or broaden the Grant.

After exact attestation read-back returns control, independently re-read the original direct-human authority or exact DAG Run Grant and freshly validate the Issue, linked Spec, target, Planning Seal, Prerequisite candidate, blob, artifact, outcome, topic branch, worktree, blockers, scope, and ancestry. Return only to the original lane. Reuse the same Issue topic branch and worktree, require the Prerequisite candidate to remain an ancestor of the final implementation candidate, and run the cheap relevant baseline check there. Any drift or a direct `pre-execute-issue` invocation without this active caller stops without implementation.

## Completion-time fresh read-back

Before completion, re-read every consumed Manual execution attestation from its owning tracker source. Require its tracker-native immutable identity and exact Issue to read back unchanged, plus its outcome wherever that schema records one. For v2, require the Prerequisite candidate, blob, normalized artifact path, and `APPLIED` or `NO_OP` outcome to match, and require that candidate to remain an ancestor of the final implementation candidate. For v1, require its exact legacy non-generated artifact path to read back unchanged. Missing, conflicting, edited, unreachable, or path/blob-mismatched evidence stops completion.

## Late prerequisite discovery

If implementation evidence reveals a **Late prerequisite discovery**, stop before prerequisite-dependent verification and preserve coherent checkpoint commits in the existing Issue worktree. When behavior, Acceptance Criteria, target, exclusions, schema outcome, and ownership remain unchanged, bind the one exact discovered artifact as a Necessary discovery and automatically invoke `pre-execute-issue` in the same active lane. After exact attestation read-back, repeat the fresh authority, identity, worktree, blocker, scope, and ancestry checks above and continue from the same branch. A change to any of those scope dimensions is a Scope change that returns to `/to-spec` or `/to-tickets` without artifact preparation or silent expansion. Never execute the artifact, run recovery, roll back external state, create a second lane, or convert failure into an attestation.
