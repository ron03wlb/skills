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

## Reviewed installation and read-back

- Reviewed runtime source: 91ff565cd89cbdee6aa17af663f7b45e8ac47cec. Standards and Spec runtime reviews were clean after one recorded repair wave.
- Source repository: C:/Workspace/open_source/skills; cache: C:/Users/ron.chang/.codex/workflow-packages.
- Actual retained version: 80a8d83f421b92e25a7ff8666be1dc8e05e9f147352f2fb5e548075b858d8451; protocol 1; 243 manifest files verified. Both links resolve to C:/Users/ron.chang/.codex/workflow-packages/versions/80a8d83f421b92e25a7ff8666be1dc8e05e9f147352f2fb5e548075b858d8451/skills/personal/run-issue-workflow.
- The reviewed installWorkflow operation used these exact source/commit/cache/entry paths and the freshly verified previous source target. Both exact retries returned reused: true and backup: null; the backup inventory stayed unchanged. Package selection through the retained implementation returned AVAILABLE; pending intent and installer lock were absent.

| Public entry | Retained original-link backup |
| --- | --- |
| C:/Users/ron.chang/.codex/skills/run-issue-workflow | C:/Users/ron.chang/.codex/skills/run-issue-workflow.before-8513e6ee-9af3-4a7d-8d48-0fb4214bc711 |
| C:/Users/ron.chang/.agents/skills/run-issue-workflow | C:/Users/ron.chang/.agents/skills/run-issue-workflow.before-e437bd8a-0354-4516-b091-138a0b1dd19d |

Each backup still resolves to the original source target stated above. No older package was removed.

For each installed public entry, the real host ran node <public-entry>/scripts/installed-entry.mjs C:/Workspace/open_source/skills 64 issue65-installed-startup-probe with tty: true. Both probes exited 0, returned structured UNAVAILABLE (Selected Run has no recorded grant; preserve its files), and made zero native tool calls. The intentionally nonexistent Run checks native TTY startup/restore without dispatch; the independent package/content check above proves installation availability.

The retained GitHub reader independently returned EXECUTE for the exact approved #65 handoff with the same deterministic operation key. Existing Run/Grant inventory was identical before and after installation/probes, with no #64 Grant. Target and repository close leases remained ABSENT. This execution preserves its worktree and does not perform closeout. After the completion note is published, the existing owner must read it before choosing the close stage; actual subsequent product delivery belongs to #66.

## Verification and limits

- Exact committed runtime 91ff565cd89cbdee6aa17af663f7b45e8ac47cec: node --test tests/ron-workflow/*.test.mjs passed 253/253 (exit 0), recorded by execute-issue/scripts/verification-cache.mjs with fresh configuration/toolchain inputs. Node v24.14.0, Git 2.45.1.windows.1, bsdtar 3.8.4; no configured typecheck command.
- Focused package/driver/bootstrap checks passed; after the single Standards repair, the affected authority/contract checks passed 3/3. Independent Standards and Spec runtime reviews then reported zero confirmed findings and zero advisories.
- Fixtures cover both LF and CRLF forwarding/heartbeat/control/drain, valid and escaped/tampered packages, interrupted installation and exact retry, stale/foreign/missing authority, Pause/Stop/disconnection, same-operation completion stages, accepted-task response loss, partial close and ordinary Grant reconciliation. The GitHub fixture exercises actual Git worktrees and Windows path aliases with a substituted tracker; it does not claim live tracker delivery.
- Necessary Windows discovery: preserve archive content regardless of core.autocrlf, invoke the test tracker CLI through Node, and canonicalize native Git worktree paths. These repair the observed Windows verification/ownership seams within AC-1/2/6/7; no scope change was made.
- The final candidate may advance only for this evidence log; its exact SHA, fresh final verification, two-axis review and completion are bound by the owner-produced Issue 65 completion note. The installed runtime remains the reviewed commit above. Neither fixture success nor these startup probes claims two-Spec product delivery.
