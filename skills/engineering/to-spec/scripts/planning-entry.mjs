// The producer owns policy; adapters own current tracker, source, and lane reads.
export async function readPlanningBaseline({ request, adapter }) {
  if (!Array.isArray(request.acceptedChanges)) throw new TypeError("acceptedChanges must be explicit");
  const current = await adapter.readCurrent(request);
  for (const field of ["repositoryId", "specId", "target", "approvedScopeIdentity", "trackerVersion"]) {
    if (typeof request[field] !== "string" || !request[field] || current?.[field] !== request[field]) {
      throw new Error(`Planning identity mismatch: ${field}`);
    }
  }
  for (const sha of [request.baseline, current.head]) {
    if (!/^[a-f0-9]{40,64}$/u.test(sha ?? "")) throw new Error("Planning baseline is unreadable");
  }
  if (!request.relevantFacts || typeof request.relevantFacts !== "object" || Array.isArray(request.relevantFacts)) {
    throw new TypeError("relevantFacts must be an explicit source declaration");
  }
  for (const [source, expected] of Object.entries(request.relevantFacts)) {
    const observed = current.relevantFacts?.[source];
    if (typeof expected !== "string" || typeof observed !== "string") throw new Error(`Planning fact unreadable: ${source}`);
    if (observed !== expected) return { disposition: "DRIFTED", owningSource: source, expected, observed };
  }
  const requiresPlanningLane = request.acceptedChanges.length > 0;
  if (requiresPlanningLane) {
    if (!request.lane) throw new Error("Accepted document writes require a planning lane");
    const lane = await adapter.readLane(request.lane);
    if (lane?.registered !== true || lane.isolated !== true) throw new Error("A registered isolated planning lane is required");
    const expectedLane = {
      repositoryId: request.repositoryId, specId: request.specId, target: request.target,
      baseline: request.baseline, taskId: request.lane.taskId, worktree: request.lane.worktree,
    };
    for (const [field, expected] of Object.entries(expectedLane)) {
      if (typeof expected !== "string" || !expected || lane[field] !== expected) throw new Error(`Planning lane mismatch: ${field}`);
    }
    const paths = new Set();
    for (const change of request.acceptedChanges) {
      if (!change || typeof change.path !== "string" || !change.path || change.path.startsWith("/")
        || change.path.split(/[\\/]/u).includes("..") || paths.has(change.path)
        || typeof change.contentIdentity !== "string" || !change.contentIdentity) {
        throw new Error("Malformed accepted content declaration");
      }
      paths.add(change.path);
    }
    if (JSON.stringify(lane.acceptedChanges) !== JSON.stringify(request.acceptedChanges)) throw new Error("Planning lane accepted content mismatch");
  }
  return { disposition: "COMPATIBLE", baseline: current.head, requiresPlanningLane };
}
