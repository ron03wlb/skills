# Issue 65 Windows maintenance evidence

This is an observed maintenance log, not a workflow contract. Issue 65 and ADR-0066 define acceptance and authority; docs/agents/run-preparation.md owns the continuation instructions.

## Scope and entry

- Date: 2026-09-07; repository: ron03wlb/skills; target: features/ron.
- Execution baseline / successor Planning Seal: caa023bd7ad52827c5103fdc7467986994b5dab0.
- Lane: codex/issue-65-windows-bootstrap in C:/Workspace/open_source/skills/.claude/worktrees/issue-65-windows-bootstrap.
- The original /run-issue-workflow 64 attempt reported spawnSync stty ENOENT and an unavailable source-linked installation before any Run Grant. The user then approved the bounded Spec revision and explicitly invoked /execute-issue 65. This repair therefore does not claim that the historical failed Start automatically executed the new maintenance path.
- The formal GitHub reader now returned EXECUTE / execute-issue for the original approved Spec revision, exact maintenance Issue and current human approval. Its operation key matched the existing execution identity. This read created no task or Grant.

## Observations before installation

Both approved public entries were Junctions to C:/Workspace/open_source/skills/skills/personal/run-issue-workflow:

- C:/Users/ron.chang/.codex/skills/run-issue-workflow
- C:/Users/ron.chang/.agents/skills/run-issue-workflow

A real Windows source-entry TTY probe completed with exit 0 and a structured UNAVAILABLE response for an intentionally nonexistent Run: Selected Run has no recorded grant; preserve its files. It made zero native tool calls. This proves native TTY initialization and restoration, not package availability or product delivery.

The Windows filesystem tests observed directory-symlink EPERM, so directory links use junctions on Windows. The earlier Planning Seal lease-retirement EPERM was not reproducible in 100 real acquisition/release cycles; bounded same-generation retry covers that observed error without claiming its cause. Repeated real target/repository lease release and injected transient/persistent EPERM tests pass while preserving unresolved ownership.

## Verification and pending release evidence

Focused checks passed for LF/CRLF driver forwarding, heartbeat/control and drain, package validation and interrupted-install recovery, exact retry without new backups, bootstrap identity/control rejection, native raw-mode restoration, and real Windows lease release. The GitHub reader fixture also uses actual Git worktrees and native path canonicalization, including Windows short-path aliases.

The pre-review full suite (node --test tests/ron-workflow/*.test.mjs) passed 253/253 on Windows with Node v24.14.0, Git 2.45.1.windows.1 and bsdtar 3.8.4. There is no configured typecheck command. Independent candidate review remains a release gate. Exact reviewed runtime commit, retained package version, public links/backups, installed TTY startup and final candidate verification will be recorded here after those actions actually succeed. Installation itself starts no product Run; #66 owns subsequent concurrent product-delivery validation.
