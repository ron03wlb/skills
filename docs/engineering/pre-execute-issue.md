Quickstart:

```bash
npx skills add mattpocock/skills --skill=pre-execute-issue
```

```bash
npx skills update pre-execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/pre-execute-issue)

## What it does

`pre-execute-issue` resolves one exact declared prerequisite, creates or reuses its Issue worktree, and produces or reuses a clean content-bound Prerequisite candidate. It presents the committed Operator SQL for human execution and records only the emitted `APPLIED` or `NO_OP` outcome.

The human remains the only database operator. The skill never executes SQL, connects to the database, runs recovery or cleanup, retries a failure, or treats a path alone as generated-content identity.

## When to reach for it

Type `/pre-execute-issue <Issue-ID>`, or `execute-issue` automatically reaches it from an active authorized lane for one exact unresolved Manual prerequisite.

Reach for it when a published Issue declares one exact artifact that must be prepared and run by a human before implementation can continue. An arbitrary `.sql` file never starts this flow.

## Prerequisites

The Issue or linked Spec must declare the exact repository-relative artifact and recorded target. Artifact preparation also requires the repository-owned adapter consumed by [prepare-prerequisite-artifact](https://aihero.dev/skills-prepare-prerequisite-artifact); the runtime flow never installs or repairs that adapter.

## One content-bound handoff

The skill reconciles the unique Issue topic branch and worktree. It reuses an exact clean Prerequisite candidate when candidate, Git blob, path, deterministic validation, and clean review evidence all match; otherwise it invokes `prepare-prerequisite-artifact` for that one declared file.

You execute the committed Operator SQL and report only `APPLIED` or `NO_OP`. The resulting `manual_prerequisite_complete:v2` note binds the Issue, candidate, blob, path, and outcome without claiming that the agent verified the external target. Legacy path-only v1 notes remain readable but cannot authorize newly generated content.

## Direct stop or active return

A direct invocation stops after the attestation is read back. An active handoff returns only to the same authorized execution lane after fresh Issue, linked Spec, target, Planning Seal, artifact, candidate, blob, branch, worktree, blocker, scope, and ancestry checks. `execute-issue` independently repeats those checks and retains the Prerequisite candidate in final ancestry. Neither route grants integration, closeout, push, deployment, or database authority.

## It's working if

- Exactly one declared artifact and one Issue worktree are selected.
- The human sees committed Operator SQL with its candidate and blob identity.
- `APPLIED` or `NO_OP` records or reuses one exact content-bound attestation.
- Failure or identity drift writes no attestation and resumes no execution.

## Where it fits

`pre-execute-issue` is the public prerequisite chain step between a published [to-spec](https://aihero.dev/skills-to-spec) or [to-tickets](https://aihero.dev/skills-to-tickets) Issue and [execute-issue](https://aihero.dev/skills-execute-issue). It delegates artifact construction to [prepare-prerequisite-artifact](https://aihero.dev/skills-prepare-prerequisite-artifact) while retaining the human-only execution boundary. See [ask-matt](https://aihero.dev/skills-ask-matt) for the whole route.
