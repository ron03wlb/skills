# GitLab payload encoding

This is the GitLab encoding of the same producer and implementation owner payloads. It adds no approval,
review, completion or Run authority. It keeps the existing record kinds and the existing
`` `` ```workflow-record `` `` fence; what differs from [GitHub payload encoding](github-payloads.md) is
only the identity a note can offer. Read exact evidence with the installed package's
`scripts/gitlab-workflow-records.mjs`, and never treat prose as completion.

## Identity, trust and one record per note

A record is identified by its native note id plus the exact SHA-256 of the note body:
`<Issue web URL>#note_<note id>`. The GitLab Issue identity every producer records is that Issue's web URL,
and the Run repository identity is `gitlab:<host>/<project>`.

A note contains exactly one `workflow-record` fenced JSON block. `readWorkflowRecords` stops rather than
shrinking evidence: a malformed record, a note carrying more than one record, a record whose `repositoryId`
is another project, a note whose bytes changed between the list read and its own read, and a note authored
by anyone below a current project Developer (`access_level >= 30`) all fail the read. Author trust is a live
membership read through the existing producer transport, never a cached claim.

## Append and read back

The owning skill renders its already-verified payload with `renderWorkflowRecord(record)` and appends it
through `appendWorkflowRecord({ connection, issueIid, issueIdentity, record })`. That helper claims the
attempt durably through the existing producer mutation owner (`gitlab-producer-mutations.mjs`) and proves
the exact native note on read-back before it reports success:

- an identical existing record for the same kind and key is reused instead of appended twice;
- a record for that key whose content differs stops as a conflict;
- a rejected attempt reports `GITLAB_PRODUCER_REJECTED` with its HTTP status and request id, and the
  owning producer may explicitly request `retryRejected` after repair;
- an attempt whose result cannot be read back reports `GITLAB_PRODUCER_UNKNOWN`.

An unresolved write is never reported as success. Never interpolate a multiline JSON payload into a shell
argument; pass a body file or a structured request. The Run host itself never writes to the tracker: it
reads notes, and the lane's own owner appends them.

## Kinds

`spec_publication`, `producer_handoff` and `decomposition:v1` are written by the configured producers (see
[GitLab Spec producer binding](gitlab-producer-adapters.md) and
[GitLab Decomposition producer binding](gitlab-to-tickets-adapters.md)); a consumer reads them and never
rewrites them.

An implementation lane writes `implementation_complete`, `implementation_repair_progress`,
`implementation_progress` or `implementation_blocked` with the fields its own skill already verifies. In
each, `repositoryId` is `gitlab:<host>/<project>`, `issueId` is the Issue's web URL, `specId` is the Spec's
web URL, and `target` is the recorded Issue target branch. An empty `workflowArtifacts` array, or an exact
entry list, follows the same compatibility rules as the GitHub encoding; the two
`workflow_*_contract_adopted:v1` records compare `repository` against the project path and `tracker` against
`gitlab:<host>/<project>`.

Dependency authority is the published `decomposition:v1` body graph. A GitLab project publishes no native
blocking relation and carries no Issue hierarchy, so a lane never probes or writes one, and an adopted
completion for a Multi-Issue revision carries the same fields the GitHub encoding defines.
