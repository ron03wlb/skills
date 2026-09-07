# Issue 65: Windows workflow and approved bootstrap

**Goal:** Repair the installed Windows workflow and implement bounded pre-Run authority continuity defined by Spec 64 and ADR-0066.
**Why planning is required:** Workflow authority, retained package installation and concurrent lease behavior are consequential public contracts.
**Acceptance:** AC-1 through AC-8 in Issue 65; exact IDs, target features/ron and baseline caa023bd7ad52827c5103fdc7467986994b5dab0 remain bound. Preserve user work and old packages/known links. No product Run is started by installation, and this execution ends at reviewed completion evidence.

### Outcome 1: Portable installation and host
- Work: package containment/link paths, LF/CRLF driver extraction and TTY startup; reproduce and repair source-proven Windows lease release failures.
- Verify: workflow-installation, codex-host-driver, codex-host-bridge and real Windows target/close lease tests (AC-1 through AC-4, AC-7).
### Outcome 2: Bounded authority continuity
- Work: reuse planning approval and operation owners; exact pre-Run human handoff, refusal on unknown scope/control/ownership, completion adoption and fresh return to normal READY/Grant path. Consolidate documentation in Run preparation.
- Verify: owning public seams for approved and rejected requests, controls, stale revision, interrupted/uncertain progress and duplicate suppression (AC-5 through AC-8).
### Outcome 3: Reviewed package and installation evidence
- Work: commit candidate, independent Standards and Spec review; exact approved cache and two public links installed from reviewed source; retain backups and version identity. Add docs/agents/workflow-windows-evidence.md.
- Verify: repository full test suite, current candidate-bound checks, retained package content/catalog/entry read-back and native Windows TTY probe. Distinguish future #66 product delivery from maintenance proof.
- Recovery: stop before unknown target/link/pending ownership; observe uncertain writes before retry and preserve the exact original operation. Repair confirmed review findings within the same ten-wave budget. Publish no completion until actual installation and required reviews pass.
