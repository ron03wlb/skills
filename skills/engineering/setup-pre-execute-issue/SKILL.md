---
name: setup-pre-execute-issue
description: Adopt one repository-owned prerequisite resolver when a concrete manual prerequisite exists.
disable-model-invocation: true
---

# Setup Pre-Execute Issue

Explicitly adopt prerequisite handling in one consumer repository. This is a one-time setup workflow, not a runtime Issue step.

## Establish applicability

Before writing, inspect repository instructions, code, tests, and evidence of a concrete Manual prerequisite. Do not infer a need from a generic risk, another repository, or a hypothetical future workflow.

If no concrete Manual prerequisite exists, report that setup is unnecessary and stop. Leave the repository unchanged with no resolver declaration, placeholder, or TODO.

## Define one complete adoption

When adoption is necessary, change only the minimum existing `AGENTS.md` or `CLAUDE.md` routing instruction, prerequisite policy, repository-owned resolver implementation, and test fixture. Do not add another setup surface.

The routing instruction must name one exact executable command and the exact `discover`, `prepare`, and `verify` invocations. Their results must be machine-readable and internally consistent:

- `discover` is read-only. It returns `NOT_REQUIRED`, `REQUIRED`, or `BLOCKED` and the protected evidence required by the runtime contract. A `REQUIRED` result identifies the Prerequisite artifact, resolver or policy identity, non-sensitive manual target identity, and repository-owned validation commands; `BLOCKED` reports an exact reason.
- `prepare` writes only the declared Prerequisite artifact and reports its paths and SHA-256 hashes without performing the Manual prerequisite action.
- `verify` is read-only and checks only the declared outcome against the non-sensitive target identity.

The repository owns resolver transport, field names, policy, validation commands, target semantics, and safe extensions. Never install a universal resolver or configuration schema, and do not copy a consumer-specific resolver from another repository.

## Validate atomically

Before writing, capture the exact preimages and index state of every intended adoption path plus the current staged, unstaged, and untracked status. Stop on dirty overlap, concurrent drift, or ambiguous ownership of an adoption path.

Build the complete prospective adoption in a temporary validation workspace. Run only safe repository-local syntax, static, and fixture validation there before adding an active declaration to the consumer worktree. Validation may inspect fixtures, but it must not perform the Manual prerequisite action or contact its target.

After the prospective state passes, apply the already validated files as one change set, then run the same validation post-apply. Success leaves the instruction, policy, resolver, and fixture complete and internally consistent.

On any generation, validation, or application failure, leave no active declaration, partial resolver, placeholder, or TODO. Discard the prospective state; if the validated change set was applied, remove its unchanged declaration first and restore only the exact setup-owned preimages. Preserve unrelated staged, unstaged, and untracked work, and never stash, reset, clean, stage, or commit it.

## Stop at setup

Setup never executes SQL, mutates a database or external environment, or stores credentials. It never changes an Issue or Prerequisite receipt.

Never invoke `pre-execute-issue`, `execute-issue`, or another runtime skill. Never rerun `ask-matt` or act as a router. Never push, integrate, deploy, or perform the Manual prerequisite action.

When implementing or publishing this generic skill itself, never run adoption against or modify a consumer repository; define and verify only the generic contract in the skills source repository.
