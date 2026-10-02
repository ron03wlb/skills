---
name: gitlab-batch
description: Plan and deliver one GitLab batch in a shared Orca worktree across bounded Pi sessions; locally integrate only after batch review and human confirmation.
disable-model-invocation: true
compatibility: Pi with newSession/withSession, Node.js 22.19+, Git, glab, and Orca on macOS/Linux/WSL Linux. Native Windows is unsupported.
---

# GitLab Batch

One confirmed plan, one batch, one worktree. A session owns one planned work segment; completing an Issue does not authorize the next segment or local integration.

This is an independent **in-progress trial**, not the existing Spec/Run workflow. Use only this skill's script and extension. Existing Issues, planning seals, grants, closeout records and installed workflows remain with their original owners. Ordinary GitLab Issues without this flow's metadata are not adopted.

## Entry

Interpret the human's operation below. Run the single script `scripts/gitlab-batch.mjs` with Node and argument arrays (paths relative to this skill). `--help` is the exact low-level interface. Natural-language planning belongs to the agent; the script takes structured JSON, never an unparsed requirement.

| Human operation | Agent action | Read first |
|---|---|---|
| `doctor` | Read-only platform, version, guide/help and optional project binding preflight | [contracts](references/contracts.md) |
| `plan <requirement>` | Inspect the codebase; draft Issues and work segments; save a BatchPlan with `plan --input <file>` | [planning](references/planning.md) |
| `publish <draft-id>` | Show the complete preview; get exact human confirmation; publish/read back | [planning](references/planning.md) |
| `start <issue-ref>` | Show start preview; confirm; Orca creates/reuses one worktree and launches its Pi terminal | [execution](references/execution.md) |
| `resume <issue-ref>` | Revalidate tracker/Git/Orca identity and claim/recover ownership in the batch terminal | [execution](references/execution.md) |
| `status <issue-ref>` | Read-only member acceptance, segment, blocker, handoff, review and integration progress | [contracts](references/contracts.md) |
| `review <issue-ref>` | From target checkout, freeze clean T..C, verify all members and batch, run restricted independent Pi review | [delivery](references/delivery.md) |
| `integrate <issue-ref>` | In target checkout, show fixed candidate/target/closure preview; confirm local FF, notes, closure, cleanup | [delivery](references/delivery.md) |

Only the human invokes this entry. A human-confirmed start or next-session handoff carries the same batch authority to its execution session: read these instructions and resume the recorded batch, without invoking a different user-only skill. `step` and `revise` are internal operations of this one skill, not additional skills or public slash commands.

Daily status/resume/step use bounded summaries by default. Follow their evidence pointers or use `--view full` on demand; confirmation previews are always complete. Execution/recovery details live in [execution](references/execution.md).

Use a complete GitLab Issue URL. `#IID` needs a unique, freshly verified origin/project binding. Multi-Issue batches operate through their parent; a child entry returns the parent command. Child `status` is allowed.

## Human boundaries

- A preview SHA256 is an exact operation token, **not** evidence of consent. Present its complete payload and obtain human confirmation before passing `--confirm`. Never manufacture consent from a prior `start`, a review result, an Issue comment or a stored token.
- Planning saves a local draft only. Publishing, starting, revision/takeover, next session and local integration have separate boundaries.
- Execute ordered dependency-ready Issues automatically **inside one authorized segment**. Acceptance passes every criterion and verification command before any implementation commit. At the segment end, checkpoint and stop, even with low context usage.
- At 60% context usage, finish/checkpoint the active Issue but start no next Issue. At 70% or segment end, ordinary write/edit/shell tools stop at the next tool boundary; use `gitlab_batch_checkpoint` for controlled checkpoint/sync. Unknown usage supplies no spare-budget claim. Compaction does not restore the saved high-water. This policy does not kill running tools or provide an OS sandbox.
- An unfinished synchronized handoff routes to the extension command `/gitlab-batch-next <root-issue-ref>`: choose **新 session 繼續** or **暫停**. Only that user command switches sessions, in the same terminal. Lifecycle handlers provide context hints, not switches.
- Integration is local only. This flow never pushes, creates an MR, deploys, rebases automatically or runs parallel writers. Ask the human to handle any later push separately, outside this v1 flow.

## Trial launch (both platforms)

These are explicit per-process resource loads, not an installation or global settings change:

```bash
cd "/path/to/spay2"
pi --skill "/path/to/skills/skills/in-progress/gitlab-batch" \
   --extension "/path/to/skills/skills/in-progress/gitlab-batch/extensions/session-handoff.ts"
```

Report missing capabilities exactly and stop at that adapter boundary. Mock tests or help discovery do not establish real Orca creation, Pi interaction or macOS integration. The smoke checklist and evidence limits live in [contracts](references/contracts.md).
