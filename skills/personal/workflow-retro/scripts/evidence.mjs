const text = value => typeof value === "string" && value.length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identity = ({ hostId, taskId }) => JSON.stringify([hostId, taskId]);
const validIdentity = value => value && text(value.hostId) && text(value.taskId);

// Numeric units must come from the source contract or a recorded observation.
export function normalizeTime({ value, unit } = {}) {
  let milliseconds;
  if (unit === "iso" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    milliseconds = Date.parse(value);
  } else if ((unit === "s" || unit === "ms") && typeof value === "number") {
    milliseconds = value * (unit === "s" ? 1000 : 1);
  }
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 8.64e15) {
    throw new TypeError("An explicit valid activity timestamp and unit are required");
  }
  return milliseconds;
}

export function selectTasks({ tasks, sources, cutoff, analyzer }) {
  if (!Array.isArray(tasks) || !Array.isArray(sources) || !validIdentity(analyzer)) {
    throw new TypeError("Inventory, source coverage and analyzer identity are required");
  }
  const until = normalizeTime({ value: cutoff, unit: "iso" });
  const gaps = sources.filter(s => s.complete !== true).map(s => ({ source: s.id, reason: s.reason || "source-incomplete" }));
  if (!sources.length) gaps.push({ reason: "no-sources" });
  const sourceIds = new Set(sources.map(s => s.id));
  const candidates = new Map();
  for (const task of tasks) {
    if (task.kind === "chatgpt" || (validIdentity(task) && identity(task) === identity(analyzer))) continue;
    let at;
    try {
      if (task.kind !== "codex" || !validIdentity(task) || !text(task.title) || !sourceIds.has(task.source)) throw Error();
      at = normalizeTime(task.activity);
    } catch {
      gaps.push({ source: task.source, taskId: task.taskId, reason: "invalid-task" });
      continue;
    }
    if (at > until) {
      // A moving inventory cannot reconstruct this task's last activity at cutoff.
      gaps.push({ source: task.source, taskId: task.taskId, reason: "post-cutoff-activity" });
      continue;
    }
    const key = identity(task);
    const previous = candidates.get(key);
    const selected = { hostId: task.hostId, taskId: task.taskId, title: task.title, activityMs: at,
      source: task.source, sources: [...new Set([...(previous?.sources ?? []), task.source])].sort(compare) };
    if (previous && (previous.activityMs > at || (previous.activityMs === at
      && compare(JSON.stringify([previous.source, previous.title]), JSON.stringify([task.source, task.title])) <= 0))) {
      previous.sources = selected.sources;
    } else candidates.set(key, selected);
  }
  return { cutoff: new Date(until).toISOString(), coverage: gaps.length ? "partial" : "complete", gaps,
    tasks: [...candidates.values()].sort((a, b) => b.activityMs - a.activityMs
      || compare(a.hostId, b.hostId) || compare(a.taskId, b.taskId)).slice(0, 50) };
}

// readPage is a read-only adapter over host history; raw dialogue stays with the caller.
// The output is an allowlist of metadata, not a credential-redaction engine.
export async function readHistory({ hostId, taskId, cutoff, readPage, maxPages = 1000 }) {
  if (!validIdentity({ hostId, taskId }) || typeof readPage !== "function" || !Number.isInteger(maxPages) || maxPages < 1) {
    throw new TypeError("Exact task, read-only page reader and positive page bound are required");
  }
  const until = normalizeTime({ value: cutoff, unit: "iso" });
  const events = [];
  const gaps = [];
  const cursors = new Set();
  const seen = new Set();
  let cursor = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    if (cursors.has(cursor)) { gaps.push({ cursor, reason: "cursor-cycle" }); break; }
    cursors.add(cursor);
    let page;
    try { page = await readPage(cursor); }
    catch { gaps.push({ cursor, reason: "unavailable-page" }); break; }
    if (!page || !Array.isArray(page.events) || !(page.nextCursor === null || text(page.nextCursor))) {
      gaps.push({ cursor, reason: "invalid-page" }); break;
    }
    if (!page.events.length) gaps.push({ cursor, reason: "empty-page" });
    if (page.incomplete) gaps.push({ cursor, reason: "source-incomplete" });
    for (const event of page.events) {
      const locator = { hostId, taskId, turnId: event?.turnId, eventId: event?.id, cursor };
      let at;
      try {
        if (!text(event?.id) || !text(event?.turnId) || !text(event?.type)) throw Error();
        at = normalizeTime(event.at);
      } catch { gaps.push({ locator, reason: "invalid-event" }); continue; }
      if (at > until) continue;
      if (event.truncated) gaps.push({ locator, reason: "truncated-event" });
      const key = JSON.stringify([event.turnId, event.id]);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ locator, at: new Date(at).toISOString(), type: event.type,
        ...(Number.isInteger(event.exitCode) ? { exitCode: event.exitCode } : {}) });
    }
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
    if (pageNumber === maxPages - 1) gaps.push({ cursor, reason: "page-limit" });
  }
  return { hostId, taskId, cutoff: new Date(until).toISOString(), events, gaps, coverage: gaps.length ? "partial" : "complete" };
}
