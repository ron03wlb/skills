---
status: accepted
---

# Bind the configured GitLab project inside setup's approved plan

`/setup-matt-pocock-skills` extends the single action set it already presents for approval with one more owner-orchestrated action: for a chosen GitLab tracker it invokes the installed coordinator's `gitlab-producer-entry.mjs configure <repository>` to create or reuse the repository-owned **Tracker project binding** `docs/agents/gitlab-producer.json`, then reads it back through that entry's `inspect` as the plan's evidence. An SSH remote requires the human to supply the HTTPS origin and complete project path, because the owner demands an explicit binding there. Read-only diagnostics keep their prohibition on `configure` and `invoke`; only the one approved plan may bind, and setup never reimplements the owner's origin and project validation by writing that file itself. An absent or foreign installed entry stays a package-installation repair rather than a hand-written binding. This is human-confirmed: option 2B of the 2026-09-18 `/grill-with-docs` session (Pi session `01a0b305-e696-7438-a36c-970cf101dc40`).

This amends [ADR-0072](0072-make-setup-an-approved-operational-bootstrap.md) by naming one concrete owner binding inside its orchestrate-owner-actions-and-verify-receipts clause; it does not supersede that direction, and it preserves [ADR-0079](0079-amend-the-setup-bootstrap-for-the-pi-workflow-substrate.md)'s installation boundary, because binding a project neither installs nor links a package. The binding is why a GitLab repository can reach Run-ready from one `setup` invocation at all: both the GitLab producers and the GitLab **Tracker Run sources** read that same file, and `configure` writes it without touching any tracker object — it reads the remote and the authenticated identity, then writes one local JSON file that carries no credentials, Spec identities, or receipts.

Reversal or validation: confirm that setup reports the binding as an approve-before-write plan action, that a read-only diagnostic still cannot bind, and that a missing package leaves the plan at package-installation repair instead of a hand-written binding.
