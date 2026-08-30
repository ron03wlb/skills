import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { CONTROL_COMMANDS, STATUS_SCHEMA } from "./run-core.mjs";

const template = readFileSync(new URL("./run-panel.html", import.meta.url), "utf8");

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, canonicalize(child)]));
  }
  return value;
};

const stableJson = (value) => JSON.stringify(canonicalize(value));

export const statusDigest = (status) => createHash("sha256").update(stableJson(status)).digest("hex");

const escapeHtml = (value) => String(value ?? "—")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const display = (value) => escapeHtml(value === null || value === undefined || value === "" ? "—" : value);
const yesNoUnknown = (value) => value === true ? "Yes" : value === false ? "No" : "Unknown";
const issueList = (values) => values.length === 0
  ? '<span class="muted">None</span>'
  : values.map((value) => `<code>#${escapeHtml(value)}</code>`).join(", ");
const textList = (values) => values.length === 0
  ? '<li class="muted">None</li>'
  : values.map((value) => `<li>${escapeHtml(value && typeof value === "object" ? stableJson(value) : value)}</li>`).join("");

const renderTaskRef = (ref) => {
  if (!ref || typeof ref !== "object" || Array.isArray(ref)) return '<span class="muted">None</span>';
  return Object.entries(ref)
    .map(([key, value]) => `<code>${escapeHtml(key)}=${escapeHtml(value)}</code>`)
    .join(" ");
};

const renderNode = (node) => {
  const blockers = Array.isArray(node.blockers) ? node.blockers : [];
  const task = node.task ?? {};
  const close = node.close ?? {};
  const edges = blockers.length === 0
    ? '<span class="muted">No blockers</span>'
    : blockers.map((blocker) => `<code>#${escapeHtml(blocker)}</code> <span aria-hidden="true">→</span> <code>#${escapeHtml(node.issueId)}</code>`).join("<br>");
  return `<article class="card">
    <h3>Issue #${escapeHtml(node.issueId)} <span class="state">${display(node.state)}</span></h3>
    <p><strong>Blocker edges:</strong> ${edges}</p>
    <h4>Task</h4>
    <p>${renderTaskRef(task.ref)}</p>
    <dl><dt>Task state</dt><dd>${display(task.state)}</dd><dt>Attempts</dt><dd>${display(task.attempt)}</dd><dt>Retries</dt><dd>${display(task.retryCount)}</dd><dt>Remediations</dt><dd>${display(task.remediationCount)}</dd></dl>
    <h4>Close progress</h4>
    <dl><dt>Completion</dt><dd>${display(close.completionState)}</dd><dt>Candidate reachable</dt><dd>${yesNoUnknown(close.candidateReachable)}</dd><dt>Worktree</dt><dd>${display(close.worktreeState)}</dd><dt>Tracker</dt><dd>${display(close.trackerState)}</dd></dl>
  </article>`;
};

const renderDiagnosis = (item) => `<article class="card">
  <h3>${display(item.reasonCode)}</h3>
  <dl><dt>Class</dt><dd>${display(item.limitationClass)}</dd><dt>Retries</dt><dd>${display(item.retryCount)}</dd><dt>Next owner</dt><dd>${display(item.nextOwner)}</dd><dt>Affected</dt><dd>${issueList(item.affectedNodes ?? [])}</dd><dt>Unaffected</dt><dd>${issueList(item.unaffectedNodes ?? [])}</dd></dl>
  <h4>Exact evidence</h4><ul>${textList(item.evidence ?? [])}</ul>
  <h4>Attempted recovery</h4><ul>${textList(item.attemptedRecovery ?? [])}</ul>
  <p><strong>No automatic transition:</strong> ${display(item.noAutomaticTransition)}</p>
  <h4>Resume predicates</h4><ul>${textList(item.resumePredicates ?? [])}</ul>
</article>`;

const renderControls = (legalControls) => {
  const controls = CONTROL_COMMANDS
    .filter((command) => legalControls.includes(command))
    .map((command) => `<button type="button" data-control="${command}">${command[0]}${command.slice(1).toLowerCase()}</button>`)
    .join("");
  const refresh = legalControls.includes("REFRESH")
    ? '<button type="button" data-refresh>Refresh</button>'
    : "";
  return controls || refresh ? `${controls}${refresh}` : '<span class="muted">No controls are legal.</span>';
};

export function renderRunPanel(status) {
  if (status?.schema !== STATUS_SCHEMA || !status.run || !Array.isArray(status.nodes)
    || !status.frontier || !Array.isArray(status.diagnoses) || !Array.isArray(status.legalControls)) {
    throw new TypeError(`Panel status must use ${STATUS_SCHEMA}`);
  }
  const { run, frontier } = status;
  const blocked = status.nodes.filter(({ state }) => state === "BLOCKED").map(({ issueId }) => issueId);
  const content = `<main>
    <header><p class="muted">DAG Run control panel</p><h1>${display(run.runId)} <span class="state">${display(run.state)}</span></h1></header>
    <p id="bridge-status" class="banner" role="status" aria-live="polite">Bridge reachable — snapshot is current.</p>
    <section aria-labelledby="identity-heading"><h2 id="identity-heading">Run identity</h2><dl><dt>Spec</dt><dd>${display(run.specId)}</dd><dt>Target</dt><dd>${display(run.target)}</dd><dt>Classification</dt><dd>${display(run.classification)}</dd><dt>Decomposition</dt><dd>${display(run.decompositionIdentity)}</dd><dt>Approved scope hash</dt><dd><code>${display(run.approvedScopeHash)}</code></dd><dt>Control revision</dt><dd>${display(run.controlRevision)}</dd><dt>Control command</dt><dd>${display(run.controlCommand)}</dd><dt>Max parallel</dt><dd>${display(run.maxParallel)}</dd></dl></section>
    <section aria-labelledby="controls-heading"><h2 id="controls-heading">Controls</h2>${renderControls(status.legalControls)}</section>
    <section aria-labelledby="frontier-heading"><h2 id="frontier-heading">Frontier</h2><div class="grid"><div class="card"><h3>Ready</h3>${issueList(frontier.ready ?? [])}</div><div class="card"><h3>Running</h3>${issueList(frontier.active ?? [])}</div><div class="card"><h3>Blocked</h3>${issueList(blocked)}</div><div class="card"><h3>Closeable</h3>${issueList(frontier.closeable ?? [])}</div></div></section>
    <section aria-labelledby="nodes-heading"><h2 id="nodes-heading">DAG nodes and blocker edges</h2><div class="grid">${status.nodes.length === 0 ? '<p class="muted">No nodes.</p>' : status.nodes.map(renderNode).join("")}</div></section>
    <section aria-labelledby="diagnoses-heading"><h2 id="diagnoses-heading">Evidence and recovery</h2><div class="grid">${status.diagnoses.length === 0 ? '<p class="muted">No active diagnoses.</p>' : status.diagnoses.map(renderDiagnosis).join("")}</div></section>
  </main>`;

  return template
    .replace("<!--RUN_PANEL_DIGEST-->", statusDigest(status))
    .replace("<!--RUN_PANEL_CONTENT-->", content);
}
