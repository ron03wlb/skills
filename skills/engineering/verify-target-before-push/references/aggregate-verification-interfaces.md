# Aggregate verification interfaces

Use these owner-local interfaces when `verify-target-before-push` derives and verifies one frozen range. They describe evidence shape; they do not create Issue completion, coverage, review, verification, push readiness, or push authority.

## Frozen range

- Input: mode, named target or explicit comparison, baseline `B`, target `V`, and a clean exact-`V` verification worktree.
- Read-back: full refs, ancestry, non-empty range when local-ahead, and the unchanged comparison source.
- Drift: any changed ref, mode, upstream, comparison, or worktree identity stops the current gate.

## Member evidence

Normalize each candidate member from its immutable tracker history and Git ancestry. Keep exact Issue, linked Spec, target, Execution baseline, candidate, Planning Seal, topic branch and worktree, explicit `manualAttestations`, explicit `workflowArtifacts`, Standards result, Spec result, and literal verification commands together. Adoption, manual-attestation, Direct target contribution, and reconciliation records remain references to their owning tracker locations and are re-read before use.

Candidate reachability alone selects the member set; it never validates completion. Contribution coverage remains the union of member contribution ranges, referenced Planning Seals, necessary merge topology, and valid Direct target contribution records. No fifth coverage source exists.

## Aggregate gate

Review committed `B...V` once with separate Standards and Spec axes. Deduplicate exact focused commands, apply only fully proved Successor verification evidence, run the repository full suite once, require a clean verification worktree, and re-read the frozen refs and closed member state before returning a result.

## Results

- Local-ahead: one exact `push_ready:v1` Git note on `V`, read back once. It binds range, members, coverage, review, executed commands, successor dispositions, and clean worktree evidence.
- Already-pushed: one read-only Range verification result with the same evidence and no Git note.

Recovery records remain narrow tracker-native inputs described by the public skill's human confirmation gates. They never rewrite a completion note, repair product code, authorize a push, or allow the stopped gate to resume in place.
