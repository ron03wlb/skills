# Delivery substrate cutover and measurement evidence

This reference publishes the Spec #96 delivery-substrate cutover evidence and the carried Issue #91
measurement requirements (per ADR-0078). It is reproducible: every command below is re-runnable from the
recorded checkout, and every objective the current substrate cannot exercise is reported `unavailable`
rather than inferred. It makes no speed, cost, or quality parity claim without paired candidate-matched
evidence.

## Substrate cutover evidence

The cutover is serialized (ADR-0077): the retired Codex-native host and the pi-workflow delivery host
never schedule one repository concurrently. Read back at the shared checkout target `features/ron`:

```text
$ git -C /home/ron/code/skills rev-parse --git-common-dir
/home/ron/code/skills/.git

$ find /home/ron/code/skills/.git/matt-workflow-control -maxdepth 2 -type d | sort
/home/ron/code/skills/.git/matt-workflow-control
/home/ron/code/skills/.git/matt-workflow-control/close-writers
/home/ron/code/skills/.git/matt-workflow-control/planning-seals
/home/ron/code/skills/.git/matt-workflow-control/planning-seals/intents
/home/ron/code/skills/.git/matt-workflow-control/planning-seals/lanes
/home/ron/code/skills/.git/matt-workflow-control/workflow-checkpoint-writers
/home/ron/code/skills/.git/matt-workflow-control/workflow-checkpoints

$ find /home/ron/code/skills/.git/matt-workflow-control -type d -name runs | wc -l
0

$ find /home/ron/code/skills -maxdepth 3 -type d -name .pi | wc -l
0

$ ls -la /home/ron/code/skills/.pi/workflows
ls: cannot access '/home/ron/code/skills/.pi/workflows': No such file or directory

$ git -C /home/ron/code/skills worktree list
/home/ron/code/skills                                  88e0255 [features/ron]
/home/ron/code/skills-issue-103-serialize-cutover      88e0255 [codex/issue-103-serialize-cutover]
/home/ron/code/skills-planning-lanes/pi-workflow-port  fdd9472 (detached HEAD)
```

Result: zero authority-journal DAG Runs (`matt-workflow-control/runs/` absent) and zero pi-workflow run
records (`<checkout>/.pi/workflows/` absent). There is therefore no repository holding a non-terminal Run
on both substrates at once, and every pre-existing non-terminal Run is, vacuously, terminal or explicitly
closed out. The detached planning-lane worktree is pre-seal and is not a delivery Run.

## Recovery and delivery matrix

The authoritative owner matrix is [the recovery routing table](recovery.md#compact-outcomes-and-progress-diagnosis).
The carried Issue #91 matrix requirement is satisfied by that single owner matrix: every disposition has
one non-coordinator owner, an unknown input normalizes to `UNCLASSIFIED` with one scoped read-only
diagnosis, and no row grants the host repair authority. The delivery host materializes only the actions the
Domain action reducer returns; it never invents a recovery owner.

## Per-phase measurement ontology

Each phase is reported separately and is never summed into another. A phase the current substrate cannot
exercise is recorded `unavailable`, never inferred from a fixture, blocker, dispatch, or heartbeat.

| Phase | Reporting rule |
| --- | --- |
| detection | `unavailable` — no live Run was scheduled on the delivery substrate |
| classification | `unavailable` — no live Run was scheduled |
| diagnosis | exercised by component tests; delivery-time value `unavailable` |
| repair | exercised by component tests; delivery-time value `unavailable` |
| verification | exercised by component tests (recorded in the bounded evidence report below); delivery-time value `unavailable` |
| installation | exercised by component tests (package version `1.2.3`, `install-workflow.mjs`); delivery-time value `unavailable` — the retired WSL qualification fixtures are superseded per ADR-0078, not exercised |
| continuation | `unavailable` — no live Run was scheduled |
| completion publication | `unavailable` — no live Run was scheduled |
| terminal observation | `unavailable` — no live Run was scheduled |
| evidence validation | `unavailable` — no live Run was scheduled |
| close eligibility | `unavailable` — no live Run was scheduled |
| request intent | `unavailable` — no live Run was scheduled |
| native acceptance | `unavailable` by definition — the pi-workflow host has no Codex-native acceptance |
| lease acquisition | exercised by close-issue component tests; delivery-time value `unavailable` |
| close completion | `unavailable` — no live Run was scheduled |

## Bounded evidence report

Recorded commands and identities (re-runnable):

```text
$ node --test tests/ron-workflow/*.test.mjs
ℹ tests 315  ℹ pass 307  ℹ fail 0  ℹ skipped 8 (Windows-only fixtures)

$ pi -p --no-session "/workflow validate skills/personal/run-issue-workflow/workflows/deliver-tracker-spec/spec.json"
Workflow spec valid: deliver-tracker-spec

$ npm run check-plugin-version
plugin.json version is 1.2.3 (already in sync)
```

- Package identity: `package.json` version `1.2.3`; `.claude-plugin/plugin.json` version `1.2.3`.
- Cutover target HEAD: `88e0255ce1d77a728784b5f4f30bb59702d8fec3` on `features/ron`.
- Authority-store byte counts (no Run records; planning/checkpoint records only): planning-seals/intents
  `1577` bytes, planning-seals/lanes `2441` bytes, workflow-checkpoints `2242` / `2615` / `2615` bytes.
- Receipt bounds (enforced, from the journal schema): `task.outcome` receipt `16 KiB`; encoded host response
  `1 MiB`; exceptional owner history `256 KiB` across at most four reads.
- Delivery-time measurement: every delivery-time phase above is `unavailable`; no live Run, no native
  acceptance, no completed-delivery interval is claimed on the delivery substrate.
