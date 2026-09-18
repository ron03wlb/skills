# Installed readiness evidence

Installed readiness is owned by `skills/personal/run-issue-workflow/scripts/workflow-installation.mjs` and stated in [OPERATOR.md](../../skills/personal/run-issue-workflow/OPERATOR.md): an installation receipt is complete only when it re-reads the selected package manifest, binds its source commit and manifest SHA-256, proves every managed entry the current environment resolves points at that exact package directory, and invokes the one kept package-owned capability probe (`--qualification-identity`) through that selected `installed-entry.mjs`. This page records the verdict that owner's own evidence produces for the installed version the environment resolved at the time it was read, together with the re-runnable read that produced it.

- Issue: [#128](https://github.com/ron03wlb/skills/issues/128), decomposition key `125/02` of Spec [#125](https://github.com/ron03wlb/skills/issues/125).
- Target branch: `features/ron`; execution baseline: `7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b`.
- Recorded: 2026-09-18 (Asia/Taipei), against the installed version named below.

Classification: this page is the recorded run the Issue's Verification section requires, so the completion note declares it in `workflowArtifacts`; the proof module is ordinary Issue scope. Sibling evidence pages differ deliberately — `docs/agents/pi-workflow-fit-evidence.md` declares its own page as ordinary Issue scope with an explicit empty list, because that page is the Issue's deliverable rather than a recorded run.

This is a read-only record. It grants no install, close, integration, aggregate-verification, push or deployment authority, and it makes no claim about the retired component fixture or its retained samples [ADR-0078](../adr/0078-retire-the-installed-package-qualification.md), [ADR-0079](../adr/0079-amend-the-setup-bootstrap-for-the-pi-workflow-substrate.md).

## The recorded proof

`skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs` (Issue #128) re-reads the installation owner's evidence and reports the state of every required seam with the source that owns it:

- `selected-package-version` — owner `workflow-installation.mjs#selectWorkflowVersion`
- `package-manifest-integrity` — owner `workflow-installation.mjs#verifyPackage`
- `environment-resolved-managed-entries` — owner `workflow-installation.mjs#readWorkflowInstallationEvidence`
- `installed-capability-probe` — owner the selected `installed-entry.mjs --qualification-identity`

It reads no remembered result: every run re-reads the trusted installation, so an unchanged installation returns the same report byte for byte. A seam reads `PRESENT` only when the owner's own read proved it, `MISSING` only when the owner proved it does not hold, and `UNKNOWN` when the stopped read proved nothing either way. The proof exits `0` for `READY`, `1` for `NOT_READY` with exactly one blocker naming the owning source and the smallest human action there, and `2` for an invocation it cannot read. It writes nothing.

```text
node skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs \
  --cache-directory <trusted-installation-cache> \
  --expected-source-commit <reviewed-source-commit> [--json]
```

## Recorded runs — 2026-09-18 (Asia/Taipei)

Environment read: trusted installation cache `/home/ron/.codex/workflow-packages`, whose catalog selected package version `3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d` with `sourceCommit` `7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b` and `sourceRepository` `/home/ron/code/skills`.

```text
node skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs --cache-directory /home/ron/.codex/workflow-packages --expected-source-commit 7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b
```

```text
installed readiness proof (installed-readiness-proof:v1)
cache directory: /home/ron/.codex/workflow-packages
expected source commit: 7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b
seam selected-package-version: PRESENT (owner skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#selectWorkflowVersion)
seam package-manifest-integrity: PRESENT (owner skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#verifyPackage)
seam environment-resolved-managed-entries: PRESENT (owner skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#readWorkflowInstallationEvidence)
seam installed-capability-probe: PRESENT (owner /home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow/scripts/installed-entry.mjs --qualification-identity)
verdict: READY
```

The same command with `--json` was run twice, unchanged, and both runs exited `0` with byte-identical output (`sha256:aa81b12f07b906b61f2d3edfeeebf1e4805f1955e87b16d6f52c4ef40257e77f`, 104 lines). The first run's report:

```json
{
  "schema": "installed-readiness-proof:v1",
  "cacheDirectory": "/home/ron/.codex/workflow-packages",
  "expectedSourceCommit": "7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b",
  "seams": [
    {
      "seam": "selected-package-version",
      "owner": "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#selectWorkflowVersion",
      "state": "PRESENT",
      "observed": {
        "version": {
          "id": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d",
          "sourceCommit": "7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b",
          "sourceRepository": "/home/ron/code/skills",
          "protocolVersion": 1
        },
        "packageRoot": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d",
        "expectedSourceCommit": "7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b",
        "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
      }
    },
    {
      "seam": "package-manifest-integrity",
      "owner": "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#verifyPackage",
      "state": "PRESENT",
      "observed": {
        "manifestSha256": "sha256:a2f44c2d85b6c72874ebc8a3611bfe71e9b3088bb37e5d365972786de8117681",
        "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
      }
    },
    {
      "seam": "environment-resolved-managed-entries",
      "owner": "skills/personal/run-issue-workflow/scripts/workflow-installation.mjs#readWorkflowInstallationEvidence",
      "state": "PRESENT",
      "observed": {
        "expectedPaths": [
          "/home/ron/.codex/skills/run-issue-workflow",
          "/home/ron/.agents/skills/run-issue-workflow"
        ],
        "entries": [
          {
            "path": "/home/ron/.codex/skills/run-issue-workflow",
            "target": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow",
            "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
          },
          {
            "path": "/home/ron/.agents/skills/run-issue-workflow",
            "target": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow",
            "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
          }
        ]
      }
    },
    {
      "seam": "installed-capability-probe",
      "owner": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow/scripts/installed-entry.mjs --qualification-identity",
      "state": "PRESENT",
      "observed": {
        "entryPath": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow/scripts/installed-entry.mjs",
        "capability": {
          "platform": "linux",
          "arch": "x64",
          "node": "v24.21.0",
          "kernelRelease": "6.18.33.2-microsoft-standard-WSL2",
          "wslDistro": "Ubuntu",
          "posixCleanup": true
        }
      }
    }
  ],
  "verdict": "READY",
  "evidence": {
    "schema": "codex-workflow-effective-evidence:v3",
    "candidate": "7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b",
    "packageVersion": {
      "id": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d",
      "sourceCommit": "7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b",
      "sourceRepository": "/home/ron/code/skills",
      "protocolVersion": 1
    },
    "manifestSha256": "sha256:a2f44c2d85b6c72874ebc8a3611bfe71e9b3088bb37e5d365972786de8117681",
    "entries": [
      {
        "path": "/home/ron/.codex/skills/run-issue-workflow",
        "target": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow",
        "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
      },
      {
        "path": "/home/ron/.agents/skills/run-issue-workflow",
        "target": "/home/ron/.codex/workflow-packages/versions/3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d/skills/personal/run-issue-workflow",
        "packageVersionId": "3b24d57de02a2ea7864ae085482aa88f9292304a8446398a13496ef192cee65d"
      }
    ],
    "capability": {
      "platform": "linux",
      "arch": "x64",
      "node": "v24.21.0",
      "kernelRelease": "6.18.33.2-microsoft-standard-WSL2",
      "wslDistro": "Ubuntu",
      "posixCleanup": true
    }
  },
  "blocker": null
}
```

Both recorded runs read the owner's one kept capability probe; neither invoked the retired live qualification (`--qualify-repair-package`). The trusted store at `/home/ron/.codex/workflow-packages/qualification` held three retained samples at the time of these runs (dated 2026-09-16 and 2026-09-17), none of them naming the installed version, and the runs neither read nor wrote one.

### Second record — after Run preparation advanced the installation

Run preparation installs a reviewed package version after each child closes, so the environment had moved by the time this Issue's repair wave re-ran the proof. The trusted catalog then selected `1f320a1a02915e6ccb22116d7bb61f8a144c61549179ef210ec2721d00dc5225` (`sourceCommit` `c0caf6b044f83dfc85f841bcbba155764e610981`, this Run's advanced target head), and both managed entries resolve to it.

```text
node skills/personal/run-issue-workflow/scripts/installed-readiness-proof.mjs --cache-directory /home/ron/.codex/workflow-packages --expected-source-commit c0caf6b044f83dfc85f841bcbba155764e610981
```

| Required seam | Owning source | State |
| --- | --- | --- |
| `selected-package-version` | `workflow-installation.mjs#selectWorkflowVersion` | `PRESENT` — package version `1f320a1a…`, source commit `c0caf6b…` |
| `package-manifest-integrity` | `workflow-installation.mjs#verifyPackage` | `PRESENT` — `sha256:c7f1ce987c8b581f3b09be56d513eb8c98a366d79f0cd36ea66e56e87f0d9e0e` |
| `environment-resolved-managed-entries` | `workflow-installation.mjs#readWorkflowInstallationEvidence` | `PRESENT` — both entries (`/home/ron/.codex/skills/run-issue-workflow`, `/home/ron/.agents/skills/run-issue-workflow`) resolve to that exact package version |
| `installed-capability-probe` | the installed `installed-entry.mjs --qualification-identity` | `PRESENT` — linux-x64, Node v24.21.0, kernel `6.18.33.2-microsoft-standard-WSL2`, distro Ubuntu, POSIX cleanup proven |

Verdict `READY`, exit 0, and two unchanged runs again returned byte-identical output (`sha256:63a971b37fd9b40e0474e57849a0c87aba6987090adfe0e68191dc89c5deb6a3`, 104 lines, receipt `codex-workflow-effective-evidence:v3`). The installation owner's own module is byte-identical between the two installed versions (`sha256:cf3a7b405754be9c9d89d8c0f8947d9bb0fe79e3283a1c3328a7d5e152529f1a`), so both records were read through the same owner logic, and the retained-sample store was again neither read nor written.

Bound to this Issue's execution baseline instead (`--expected-source-commit 7ea5a8a9b04c3680074ed0f2d2d8010d37a7bd7b`), the same command returns `NOT_READY` with exactly one blocker at `selected-package-version` naming `workflow-installation.mjs`. That is the owner's candidate binding working as designed rather than an environment fault: the environment now resolves a newer reviewed version than the expectation it was given.

## Not-ready behaviour

A required seam that does not hold returns `NOT_READY` with exactly one blocker naming the owning source and the smallest human action there. That path is recorded from installed fixtures in `tests/ron-workflow/installed-readiness-proof.test.mjs` rather than from this host: breaking the live installation or the environment's managed entries to observe it is not an operation any authority here grants. The recorded cases are a foreign, a misdirected and a missing managed entry (owner `workflow-installation.mjs`, seam `environment-resolved-managed-entries`, no capability probe reached); an installed version that is not the reviewed source commit (owner `workflow-installation.mjs`, seam `selected-package-version`); and an unknown, unreadable and incomplete capability probe (owner the installed `installed-entry.mjs --qualification-identity`, the owning source's own blocker code `installed_workflow_capability_unproven`). Every recorded case family also asserts a second, unchanged read that returns the same `NOT_READY` report — the managed-entry cases, the unbound version and the three capability faults alike — and the failing capability seam names the same owning source as its blocker, once.

## What this record does not claim

- It is not the whole of setup readiness: `READY` additionally requires the lane-settlement seam, read through its own owner ([installed-workflow-diagnostics.md](../../skills/engineering/setup-matt-pocock-skills/installed-workflow-diagnostics.md), [ADR-0080](../adr/0080-deliver-issue-lanes-through-native-subagent-lanes.md)); this page covers only the installation owner's receipt and capability probe.
- It is not a readiness prerequisite: readiness still requires exactly the seams and owners above, and the proof adds no verdict of its own beyond the state that owner read proved.
- It does not claim the reviewed candidate is installed. The candidate that adds this page is not the installed version until Run preparation installs it and both managed entries read back to it; this record covers the version the environment resolves now.
- It is not a retained qualification sample, an unattended-delivery, terminal-recognition, close-acceptance or tracker-mutation claim, and it measures no cost or reliability.
