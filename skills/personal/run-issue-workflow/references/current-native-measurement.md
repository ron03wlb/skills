# Current native delivery evidence

This page separates what the native substrate proves from what has not been measured.

## Component evidence

The repository suite exercises the reducer, journal, budgets, native lane planning, generation pointers,
installer transactions, capability identity, provider adapters, and close settlement. These tests prove
component contracts only; they do not prove a tracker delivery interval or a substrate saving.

## Transport probe

On 2026-09-20 the current Pi harness launched one bounded native `delegate` child with no file or command
authority. The child returned the exact marker `NATIVE_TRANSPORT_PROBE_OK`; mission
`1def6051-5458-4b5d-959c-0b3f18461293` reached `completed`. This proves only current native launch and
result transport. It created no Issue, tracker mutation, worktree, or durable workflow lane and did not
exercise resume.

The source-bound scratch test `native-lane-launch.test.mjs` separately creates a temporary Git repository,
commits a mutation-capable lane candidate, settles it onto a durable topic branch, removes the worktree,
and proves reachability. `native-coordinator-step.test.mjs` covers generation-1 bind and exact same-lane
generation-2 resume deterministically. Those component tests do not turn the transport probe into a real
tracker Run.

## Local installation migration

`scripts/maintain-workflow-installation.mjs` produces a content-bound preview before it changes local
entries, backups, package versions, retired qualification data, or terminal optional-host records. Its
apply receipt is evidence for that local migration only.

On 2026-09-20, after the complete repository suite passed, the local working tree was captured as the
unpublished Git commit object `fd19ea1f1a0a66ada04fe0b902490b588f10db6c`. Installation selected package
`b8cee28e5536e05a89ecb7d62b3d2edd893e8c4b773871c33560f890d50e9e4d`; all `.codex`, `.agents`, and
`.claude` discovery entries read back to it and the minimal capability proof returned `READY`. Preview
`sha256:6b8b573636867c4b8db4e52fbcdf33b3317f8a534327f1a455fa24b166f4aa47` then removed 25 unreferenced
package versions, 21 obsolete managed backup links, and the retired qualification directory. It retained
16 current, journal-referenced, or rollback versions, six protected managed backups, one foreign backup,
and all three optional host records because each still named active or pending work. Receipt:
`/home/ron/.codex/workflow-packages/maintenance/receipts/1789862436976-6b8b57363686.json`.

The snapshot commit is a local installation identity, not a branch commit, release, or publication claim.

## Unavailable measurements

A real tracker Run has not been authorized by this probe. Detection-to-close duration, tracker delivery
success, worker-token savings, cost savings, and quality parity are `unavailable`. Neither historical
worker counters nor temporary-repository timings may be reported as current tracker delivery success or
savings.
