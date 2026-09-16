# Issue 98: pi-workflow fit evidence

Five delivery-substrate assumptions (E1-E5) were probed on the installed packages, in this environment, before any controller design is frozen. Every verdict below comes from an observed run of the probe recorded with it; package documentation is used only to state the boundary being tested. The probes are throwaway: they ran in a scratch Git project outside this repository, and this Issue's only repository change is this document.

Probe time: 2026-09-16 (Asia/Taipei). Target branch: `features/ron`.

## Environment

| Component | Observed identity | How observed |
| --- | --- | --- |
| Pi | `0.85.1` | `pi --version` |
| `@agwab/pi-workflow` | `0.13.8` | `package.json` of the installed package |
| `pi-subagents` | `0.68.0` | `package.json` of the installed package |
| Node.js | `v24.21.0` | `node --version` |
| npm | `11.19.0` | `npm --version` |
| Probe model | `deepseek/deepseek-flash` | `--model` on every probe launch |
| Probe project | `/tmp/piwf-probe-98`, baseline `b75a8f509e9864b9f64bbca584acef568c2a7dae` | `git init` + one commit (below) |

Pi documents `0.85.0` as blocked and does not state `0.85.1`. The probes below establish what `0.85.1` actually does.

## Method

- One bounded probe per assumption, each launched as a real workflow run through `pi -p --no-session "/workflow run ..."` and driven to terminal by an in-process Pi scheduler (`/workflow wait`) or by the detached supervisor.
- The probe fixtures are reproduced verbatim in this document, so every claimed result can be re-run from here.
- Controller behaviour is selected by an external mode file (`probe-state/mode.txt`) so that the *same* recorded run can be resumed with a divergent re-issue.

### Bootstrap

```bash
rm -rf /tmp/piwf-probe-98 && mkdir -p /tmp/piwf-probe-98/.pi/workflows /tmp/piwf-probe-98/.pi/agents
cd /tmp/piwf-probe-98
git init -q -b probe-target
git config user.name Probe && git config user.email probe@example.invalid && git config core.autocrlf false
printf 'probe target baseline\n' > README.md
git add -A && git commit -q -m "probe baseline"
# write the fixture files below, then:
mkdir -p probe-state && printf 'replay\n' > probe-state/mode.txt
```

### Driver `run-probe.sh`

```bash
#!/usr/bin/env bash
# usage: run-probe.sh <workflow-name> "<task>"
set -u
cd "$(dirname "$0")"
launch=$(pi -p --no-session "/workflow run --no-route --model deepseek/deepseek-flash $1 \"$2\"" 2>&1)
printf '%s\n' "$launch"
run=$(printf '%s' "$launch" | sed -n 's/^Run: \(workflow_[A-Za-z0-9_]*\).*$/\1/p' | head -1)
echo "LAUNCHED=$run"
if [ -n "$run" ]; then
  pi -p --no-session "/workflow wait $run 780000" 2>&1 | tail -8
fi
echo "RUN_ID=$run"
```

### Shared dynamic spec (`.pi/workflows/probe-dynamic/spec.json`)

`probe-worktree/spec.json` and `probe-concurrency/spec.json` are the same shape with the `name`, `description` and `budget` values shown after it.

```json
{
  "schemaVersion": 1,
  "name": "probe-dynamic-replay",
  "description": "Probe E1/E3/E5: dynamic controller replay order, duplicate-prevention and attempt accounting.",
  "defaults": {
    "agent": "scout",
    "readOnly": true,
    "tools": ["read", "grep", "find", "ls"]
  },
  "artifactGraph": {
    "stages": [
      {
        "id": "adaptive",
        "type": "dynamic",
        "dynamic": {
          "uses": "./helpers/controller.mjs",
          "mode": "graph-splice",
          "permissions": { "approval": "auto" },
          "budget": { "maxAgents": 8, "maxConcurrency": 4, "maxRuntimeMs": 600000 }
        },
        "output": {
          "analysis": { "required": true },
          "refs": { "required": true }
        }
      }
    ]
  }
}
```

```json
{
  "schemaVersion": 1,
  "name": "probe-managed-worktree",
  "description": "Probe E2: a mutation-capable generated agent's managed worktree is retained, re-addressable and removable.",
  "defaults": {
    "agent": "scout",
    "readOnly": true,
    "tools": ["read", "grep", "find", "ls"]
  },
  "artifactGraph": {
    "stages": [
      {
        "id": "adaptive",
        "type": "dynamic",
        "dynamic": {
          "uses": "./helpers/controller.mjs",
          "mode": "graph-splice",
          "permissions": { "approval": "auto" },
          "budget": { "maxAgents": 4, "maxConcurrency": 2, "maxRuntimeMs": 600000 }
        },
        "output": {
          "analysis": { "required": true },
          "refs": { "required": true }
        }
      }
    ]
  }
}
```

```json
{
  "schemaVersion": 1,
  "name": "probe-concurrency",
  "description": "Probe E4: host concurrency honours a three-agent cap.",
  "defaults": {
    "agent": "scout",
    "readOnly": true,
    "tools": ["read", "grep", "find", "ls"]
  },
  "artifactGraph": {
    "stages": [
      {
        "id": "adaptive",
        "type": "dynamic",
        "dynamic": {
          "uses": "./helpers/controller.mjs",
          "mode": "graph-splice",
          "permissions": { "approval": "auto" },
          "budget": { "maxAgents": 8, "maxConcurrency": 3, "maxRuntimeMs": 900000 }
        },
        "output": {
          "analysis": { "required": true },
          "refs": { "required": true }
        }
      }
    ]
  }
}
```

### E1/E3/E5 controller (`.pi/workflows/probe-dynamic/helpers/controller.mjs`)

```js
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
// The controller worker inherits the project invocation directory as its cwd.
const ROOT = `${process.cwd()}/probe-state`;
const MODE = `${ROOT}/mode.txt`;
const LOG = `${ROOT}/invocations.log`;
const mode = () => {
  try { return readFileSync(MODE, "utf8").trim(); } catch { return "replay"; }
};
const childPrompt = (id, value) =>
  `Do not read any file. Reply with exactly these three sections and nothing else: ` +
  `<control>{"probe":"${id}","value":"${value}"}</control>` +
  `<analysis>probe child ${id} replied with ${value}</analysis>` +
  `<refs>[]</refs>`;

export default async function controller(ctx) {
  mkdirSync(ROOT, { recursive: true });
  appendFileSync(LOG, `${new Date().toISOString()} mode=${mode()}\n`);
  const count = readFileSync(LOG, "utf8").trim().split("\n").length;
  const divergent = mode() === "diverge" && count >= 2;
  ctx.log("controller invocation", { count, mode: mode(), divergent });
  const first = await ctx.agent({
    id: "w1", agent: "scout", tools: ["read", "ls"],
    prompt: childPrompt("w1", divergent ? "DIVERGED" : "alpha"),
  });
  const second = await ctx.agent({
    id: "w2", agent: "scout", tools: ["read", "ls"],
    prompt: childPrompt("w2", "beta"),
  });
  return {
    control: {
      probe: "probe-dynamic-replay", mode: mode(), divergent, invocations: count,
      generatedTaskIds: ctx.graph.generatedTaskIds(),
      budgetRemaining: ctx.budget.remaining(),
      first: typeof first === "object" ? "settled" : String(first),
      second: typeof second === "object" ? "settled" : String(second),
    },
    analysis: `controller completed after ${count} invocation(s) in ${mode()} mode`,
    refs: [],
  };
}
```

### E2 fixtures

`.pi/agents/probe-writer.md` — a project agent, because the workflow can only use an agent whose own frontmatter ceiling allows mutation:

```markdown
---
name: probe-writer
description: Probe agent with mutation-capable tools for the E2 managed-worktree probe.
tools: read, write, edit, bash, ls, grep, find
readOnly: false
---

# probe-writer

You are `probe-writer`, a mutation-capable probe subagent. Perform exactly the requested
file operation in your working directory, then reply with the requested sections only.
```

`.pi/workflows/probe-worktree/spec.json` is the `probe-managed-worktree` spec shown above.

`.pi/workflows/probe-worktree/helpers/controller.mjs`:

```js
export default async function controller(ctx) {
  const writer = await ctx.agent({
    id: "writer", agent: "probe-writer", tools: ["read", "write", "bash"],
    prompt:
      "In your working directory create a file named probe-managed-worktree.txt containing exactly the single line: managed-worktree-probe. " +
      "Then reply with exactly these three sections and nothing else: " +
      "<control>{\"probe\":\"managed-worktree\",\"written\":true}</control>" +
      "<analysis>wrote probe-managed-worktree.txt</analysis>" +
      "<refs>[]</refs>",
  });
  return {
    control: { probe: "probe-managed-worktree", generatedTaskIds: ctx.graph.generatedTaskIds(), writerSettled: typeof writer === "object" },
    analysis: "controller generated one mutation-capable agent and settled it",
    refs: [],
  };
}
```

### E4 fixtures

`.pi/workflows/probe-concurrency/spec.json` is the `probe-concurrency` spec shown above.

`.pi/workflows/probe-concurrency/helpers/controller.mjs`:

```js
const child = (id) =>
  `Do not read any file. Reply with exactly these three sections and nothing else: ` +
  `<control>{"probe":"${id}"}</control><analysis>concurrency probe child ${id}</analysis><refs>[]</refs>`;

export default async function controller(ctx) {
  const ids = ["c1", "c2", "c3", "c4", "c5"];
  const settled = await ctx.parallel(ids.map((id) => () => ctx.agent({
    id, agent: "scout", tools: ["read", "ls"], prompt: child(id),
  })));
  return {
    control: { probe: "probe-concurrency", requested: ids, settled: settled.length, generatedTaskIds: ctx.graph.generatedTaskIds(), budgetRemaining: ctx.budget.remaining() },
    analysis: "controller requested five concurrent agents under a three-agent cap",
    refs: [],
  };
}
```

## E1 — controller re-issue order on resume, and fail-closed divergence

**Commands**

```bash
printf 'replay\n' > /tmp/piwf-probe-98/probe-state/mode.txt
rm -f /tmp/piwf-probe-98/probe-state/invocations.log
cd /tmp/piwf-probe-98 && ./run-probe.sh probe-dynamic "Probe E1: exercise dynamic controller replay ordering."
# negative control against the same op id:
printf 'diverge\n' > /tmp/piwf-probe-98/probe-state/mode.txt
rm -f /tmp/piwf-probe-98/probe-state/invocations.log
cd /tmp/piwf-probe-98 && ./run-probe.sh probe-dynamic "Probe E1 fail-closed: divergent re-issue on resume."
```

**Observed (run `workflow_mu3o65x1_ee15ba`, `replay`)**

- Run reached `status: completed`, 3/3 tasks completed.
- The controller was invoked 4 times (`probe-state/invocations.log`: 05:37:57.301Z, 05:38:10.328Z, 05:38:12.239Z, 05:38:21.737Z; `dynamic/controller.log` records the same 4 invocations), once per suspension/resume around each generated child.
- `dynamic/events.jsonl` records exactly two generation events, in recorded order: seq 3 `task.generated adaptive.controller:agent:w1` (task `adaptive.w1`), seq 7 `task.generated adaptive.controller:agent:w2` (task `adaptive.w2`), each preceded by a `controller.status: suspended_waiting_children` and followed by `controller.status: running`. The re-issued op carries the same `opId` and `requestHash` as the original generation.
- `dynamic/state.json` projection: `status: complete`, `generatedTaskIds: ["adaptive.w1","adaptive.w2"]`, counters `agents: 2`.

**Observed (negative control, run `workflow_mu3o7t2p_97bab2`, `diverge`)**

- The run fails closed instead of re-generating the divergent op. The driver reported:

```text
⚠ Degraded: final rendered, 1/2 tasks failed
  • adaptive.controller — dynamic
    dynamic agent request changed for opId "adaptive.controller:agent:w1";
    previous hash fdb4746c72791479e4bdaa8ff7313ee898ee1e961e017e22a08a098487147c69,
    new hash c6038f67c08197a263bf29b7452c55a33ceb3a945378d555ca97fe79fc076289
```

- `pi-workflow` CLI: `status: failed`, `tasks: 2`, `completion: incomplete`; `dynamic/events.jsonl` contains one `task.generated` for `adaptive.controller:agent:w1` and no second generation for that op id.

**Verdict: `proven`.** A dynamic controller re-issues already-journaled dispatch operations in recorded order on resume (4 invocations, ordered re-issue, one generation event per op id), and an out-of-order/changed re-issue of a recorded op fails closed with an explicit previous/new request-hash error.

## E2 — retained managed worktree re-addressed by a later close stage, then removed

**Command**

```bash
cd /tmp/piwf-probe-98 && ./run-probe.sh probe-worktree "Probe E2: managed worktree retention and removal."
```

**Observed (run `workflow_mu3o9xvu_eeca35`)**

- The mutation-capable generated task `adaptive.writer` was assigned a managed worktree in its run record:

```text
worktree { enabled: true,
           path: "/tmp/piwf-probe-98/.pi/workflows/workflow_mu3o9xvu_eeca35/worktrees/task-2",
           branch: "pi-workflow/workflow_mu3o9xvu_eeca35-task-2",
           baseCwd: "/tmp/piwf-probe-98" }
```

- The agent wrote `/tmp/piwf-probe-98/.pi/workflows/workflow_mu3o9xvu_eeca35/worktrees/task-2/probe-managed-worktree.txt` containing `managed-worktree-probe`. The target checkout did **not** contain that file, confirming the documented "no auto-merge; managed worktree output is recorded for human review".
- Re-addressing from the target checkout succeeded: `git -C /tmp/piwf-probe-98 worktree list` listed the worktree on its `pi-workflow/...-task-2` branch, and the file was read back through that path.
- Removal: `git -C /tmp/piwf-probe-98 worktree remove .pi/workflows/workflow_mu3o9xvu_eeca35/worktrees/task-2` failed with `fatal: '.../worktrees/task-2' contains modified or untracked files, use --force to delete it`; `git -C /tmp/piwf-probe-98 worktree remove --force .pi/workflows/workflow_mu3o9xvu_eeca35/worktrees/task-2` exited 0. Afterwards the registration count for `worktrees/task-2` was `0` and the directory was `ABSENT`; the topic branch `pi-workflow/workflow_mu3o9xvu_eeca35-task-2` remained.
- Caveat: the task never settled. The driver reported `raw artifact ownership/link contract could not be established`, so the mutation-capable path failed at artifact publication and the run stayed `running` until `/workflow stop workflow_mu3o9xvu_eeca35` returned `Interrupted 2 task(s)`. The worktree outlived the interrupted run, which is what the close-stage re-addressing above exercised.

**Verdict: `proven`** for the worktree lifecycle (created, retained after the run stopped, re-addressable from the target checkout, removable). The removal requires an explicit `--force` because the retained output is uncommitted, and the mutation-capable artifact-publication failure is recorded under AC-2.

## E3 — create-intent reservation prevents duplicate agent generation under replay

**Command** — same as E1 `replay`, plus the audit below:

```bash
cd /tmp/piwf-probe-98 && python3 - <<'EOF'
import json, collections
for R in ['workflow_mu3o4k0x_b7dc4f','workflow_mu3o65x1_ee15ba','workflow_mu3o7t2p_97bab2','workflow_mu3obh2c_3af021','workflow_mu3ociqo_eacef0']:
    gen = collections.Counter()
    for line in open(f'.pi/workflows/{R}/dynamic/events.jsonl'):
        e = json.loads(line)
        if e['type'] == 'task.generated':
            gen[e['opId']] += 1
    print(R, dict(gen))
EOF
```

**Observed**

```text
workflow_mu3o4k0x_b7dc4f {'adaptive.controller:agent:w1': 1, 'adaptive.controller:agent:w2': 1}
workflow_mu3o65x1_ee15ba {'adaptive.controller:agent:w1': 1, 'adaptive.controller:agent:w2': 1}
workflow_mu3o7t2p_97bab2 {'adaptive.controller:agent:w1': 1}
workflow_mu3obh2c_3af021 {'adaptive.controller:agent:c1': 1, 'adaptive.controller:agent:c2': 1, 'adaptive.controller:agent:c3': 1, 'adaptive.controller:agent:c4': 1, 'adaptive.controller:agent:c5': 1}
workflow_mu3ociqo_eacef0 {'adaptive.controller:agent:c1': 1, 'adaptive.controller:agent:c2': 1, 'adaptive.controller:agent:c3': 1, 'adaptive.controller:agent:c4': 1, 'adaptive.controller:agent:c5': 1}
```

Each op id produced exactly one `task.generated` event and exactly one task record (`adaptive.w1`, `adaptive.w2`, `adaptive.c1`-`adaptive.c5`), even though the controller re-issued every recorded op on each of its resumptions (`workflow_mu3o95t3_e9dfc2`/`workflow_mu3o65x1_ee15ba` both re-ran the controller four times). Re-issue returned the recorded outcome; it did not create a second generation.

**Verdict: `proven`.** The host's recorded request-hash identity for a generated task is the reservation: a replayed generation for an already-recorded op id resolves to the existing generation instead of creating a duplicate.

## E4 — host concurrency expresses a three-agent cap, and close-wait placement

**Commands**

```bash
cd /tmp/piwf-probe-98 && ./run-probe.sh probe-concurrency "Probe E4: five concurrent generated agents under a three-agent cap."
cd /tmp/piwf-probe-98 && python3 - <<'EOF'
import json, datetime
R = 'workflow_mu3obh2c_3af021'
d = json.load(open(f'.pi/workflows/{R}/run.json'))
p = lambda t: datetime.datetime.fromisoformat(t.replace('Z', '+00:00'))
events = []
for t in d['tasks']:
    if t['specId'] == 'adaptive.controller': continue
    print(f"{t['specId']:14} {t['startedAt']} -> {t['completedAt']}")
    events += [(p(t['startedAt']), 1), (p(t['completedAt']), -1)]
events.sort()
cur = mx = 0
for _, delta in events:
    cur += delta; mx = max(mx, cur)
print('max observed concurrent generated agents =', mx)
EOF
```

**Observed (run `workflow_mu3obh2c_3af021`, `maxConcurrency: 3`, five agents requested)**

```text
adaptive.c1    2026-09-16T05:42:05.221Z -> 2026-09-16T05:42:18.582Z
adaptive.c2    2026-09-16T05:42:06.202Z -> 2026-09-16T05:42:20.488Z
adaptive.c3    2026-09-16T05:42:07.135Z -> 2026-09-16T05:42:20.461Z
adaptive.c4    2026-09-16T05:42:19.193Z -> 2026-09-16T05:42:30.786Z
adaptive.c5    2026-09-16T05:42:21.235Z -> 2026-09-16T05:42:32.738Z
max observed concurrent generated agents = 3
```

Run `status: completed`, 6/6 tasks completed, controller counters `agents: 5`.

- The cap is honoured exactly: three agents run at once, and `adaptive.c4` does not start until `adaptive.c1` completes.
- The admitted unit is a *generated agent task*. `ctx.parallel` generated all five ops, but only three were admitted at a time; a generated agent that is waiting for a slot still holds one of the three.

**Verdict: `proven`**, with the placement constraint stated explicitly: the host expresses "three at a time" as a generated-agent cap, and it exposes no separate wait class, so a domain "close wait" must stay outside the host's generated-agent set rather than being modelled as a fourth kind of agent. Close waits are therefore a domain-placement requirement that the measured host does not obstruct, not a host capability that was observed to exist by itself.

## E5 — host retry and `/workflow resume` do not bypass dispatch accounting

**Commands**

```bash
cd /tmp/piwf-probe-98
printf 'replay\n' > probe-state/mode.txt && rm -f probe-state/invocations.log
pi -p --no-session "/workflow run --no-route --detach --model deepseek/deepseek-flash probe-dynamic \"Probe E1: exercise dynamic controller replay ordering.\""
pi -p --no-session "/workflow resume <run-id>"      # first resume, mode=diverge on purpose
pi -p --no-session "/workflow wait <run-id> 780000"
printf 'replay\n' > probe-state/mode.txt
pi -p --no-session "/workflow resume <run-id>"      # second resume
pi -p --no-session "/workflow wait <run-id> 780000"
```

**Observed (run `workflow_mu3o4k0x_b7dc4f`)**

- Original attempt (detached; see AC-2): `adaptive.w1` completed `2026-09-16T05:36:42.409Z -> 05:36:54.701Z`; `adaptive.w2` failed `launch_failed`; `adaptive.controller` failed `dynamic_failed`.
- First resume: `Reset 2 task(s) and scheduled remaining work.` Only the two failed tasks were reset; the completed `adaptive.w1` kept its original `startedAt`/`completedAt`. The controller re-ran (`05:39:38.276Z -> 05:39:38.381Z`) and failed closed because `mode.txt` was `diverge` (same request-hash error as E1), and `adaptive.w2` re-ran and completed `05:39:38.452Z -> 05:39:49.800Z`.
- Second resume with `mode.txt` restored to `replay`: `Reset 1 task(s) and scheduled remaining work.` — only the failed controller re-ran; the run finished `completed`, 3/3 tasks, `Usage: 16230 tokens`.
- Documented retry counters were readable at every step (`pi-workflow inspect <run-id>` prints `retries: output=N, launch=N, resumes=N, contextLimitFailures=N`), and each re-dispatch appears as a fresh task time range rather than a silent reuse of the previous one.

**Verdict: `proven`.** Resume re-dispatches only failed/unfinished work, records each re-dispatch, never re-dispatches already-completed work, and does not bypass the controller's fail-closed replay validation.

## AC-2 — what Pi `0.85.1` actually supports

| Capability | Verdict | Observed evidence |
| --- | --- | --- |
| Extension loading and spec compilation | supported | `pi -p --no-session "/workflow validate deep-research"` → `Workflow spec valid: deep-research`, backend `local-pi/headless`, tasks 10; the same for all three probe specs. |
| Dynamic controller (`type: "dynamic"`, `graph-splice`) | supported | Runs `workflow_mu3o65x1_ee15ba`, `workflow_mu3obh2c_3af021` completed with real generated agents; `dynamic/events.jsonl`, `state.json` and `controller.log` were written; budgets, suspend/resume and replay all behaved as documented. |
| Child subagent launch while a Pi process drives the scheduler | supported | Every child launched during a run's initial in-process pass completed with exit 0 (e.g. `adaptive.w1`, `adaptive.c1`-`adaptive.c3`, and all six tasks of `workflow_mu3obh2c_3af021`). |
| Child subagent launch from the detached supervisor / standalone `pi-workflow` process | **blocked** | Every launch attempted after detachment failed with `Cannot find package '@earendil-works/pi-coding-agent' imported from /home/ron/.pi/accounts/b/npm/node_modules/@agwab/pi-workflow/dist/subagent-backend.js`. Reproduced in two independent runs: `workflow_mu3o4k0x_b7dc4f` (`adaptive.w2` `launch_failed`) and `workflow_mu3ociqo_eacef0`, where the three initial-pass children (`c1`, `c2`, `c3`) completed and the two post-detach children (`c4`, `c5`) both failed `launch_failed` with that exact error. |
| Detached supervisor process | starts, cannot finish a run | `--detach` spawned the supervisor (`supervise.log`: `supervising workflow_mu3ociqo_eacef0 in /tmp/piwf-probe-98 (poll 2000ms)` … `done: … failed`) and it did drive scheduling, but it cannot launch children, so a detached run can only finish work that was already launched before detachment. |
| Managed worktrees | supported | E2 below: worktree created, retained, re-addressable from the target checkout, removable (`--force`). |
| Mutation-capable task artifact publication | **blocked** | `workflow_mu3o9xvu_eeca35` reported `raw artifact ownership/link contract could not be established`; the task never settled and the run remained `running` until explicitly stopped. |

**Verdict for the documented blocked combination:** Pi `0.85.1` does **not** support the dynamic controller, managed worktrees and the detached supervisor *together* end to end. The extension loads, the controller runs, and managed worktrees exist, but the standalone supervisor process cannot resolve `@earendil-works/pi-coding-agent` from `pi-workflow/dist`, so no child the supervisor must launch after detachment can start. The `0.85.x` block documented for `0.85.0` therefore still applies to `0.85.1` for every path that needs a child launch outside an in-process Pi scheduler.

## Unexercised capabilities

Named so they are not mistaken for proven:

- Any detached run that must launch new children after detachment (blocked above; only pre-detachment launches were observed to complete).
- Batch/`--all` supervision, `pi-workflow prune`, run retention, and topology-lease behaviour.
- Nested dynamic workflows (`ctx.workflow`), dynamic helpers (`ctx.helper`), `dynamic.decisionLoop`, and `approval: "ask"` (which needs an interactive UI; the probes used `approval: "auto"`).
- Loop stages, streaming foreach, and the bundled workflows' evidence gates (only `validate` was run on `deep-research`).
- Windows/WSL path translation and the `durable-launch-barrier-v2` revocation races; no revocation or crash-interruption path was forced.
- Model/provider parity: one model (`deepseek/deepseek-flash`) was used, so nothing here is a speed, cost, or quality claim.

## Reproduction pass

In the final pass the fixtures were extracted programmatically from this document (the three spec JSON blocks, both controller files, the agent file and the driver), written into a freshly bootstrapped project (`/tmp/piwf-probe-98-doc`, baseline `d2dfdacd08f1a3662a2aca6d062e2d26272f35b1`), and executed with the commands recorded above. Every verdict reproduced:

| Probe | Run id | Observed in this pass |
| --- | --- | --- |
| E1/E3 replay | `workflow_mu3ome9a_f91040` | `completed`, 3/3 tasks, 4 controller invocations, one `task.generated` per op id |
| E1 fail-closed | `workflow_mu3on4ln_d0867c` | `failed`; same op id and the same previous/new request hashes as the original control |
| E4 concurrency | `workflow_mu3onhpp_cc0c27` | `completed`, 6/6 tasks, max observed concurrent generated agents 3 |
| E2 managed worktree | `workflow_mu3oobiw_a5677c` | worktree on branch `pi-workflow/workflow_mu3oobiw_a5677c-task-2`; retained output re-addressed from the target checkout; absent from the target checkout; plain removal exit 128; forced removal exit 0; directory `ABSENT` |
| AC-2 detached launch | `workflow_mu3oorzl_6577e9` | initial-pass children `c1`-`c3` completed; post-detach `c4` and `c5` both failed `launch_failed` with the SDK resolution error |

An earlier pass in a separately bootstrapped project (`/tmp/piwf-probe-98-repro`, baseline `7f47c41bcf4e7eb2aed96b6e2d25c5d02f6a490b`) produced the same E1, E1-fail-closed, E2 and E4 verdicts, and the detached-launch failure was also reproduced in the original probe project and again in the detached run above.

## Reproduction

1. Run the bootstrap, write the fixture files, and `chmod +x run-probe.sh` in a scratch directory.
2. `cd <scratch> && ./run-probe.sh probe-dynamic "<task>"` for E1/E3/E5; `printf 'diverge\n' > probe-state/mode.txt` before a second launch reproduces the fail-closed result.
3. `./run-probe.sh probe-worktree "<task>"` then `git worktree list` and `git worktree remove [--force] <path>` for E2.
4. `./run-probe.sh probe-concurrency "<task>"` then run the concurrency audit script for E4.
5. `pi -p --no-session "/workflow run --no-route --detach ..."` reproduces the detached-supervisor launch failure; `pi -p --no-session "/workflow resume <run-id>"` and `/workflow wait <run-id>` reproduce the resume accounting.
6. Read each run with `node <pi-workflow>/src/cli.mjs inspect <run-id> --failures --results` and `.pi/workflows/<run-id>/`.
