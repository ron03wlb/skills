const terminal = status => ["SUCCEEDED", "STOPPED"].includes(status?.run?.state);
const occupied = status => (status?.nodes ?? []).filter(node =>
  node.task?.state === "EXECUTING" || node.task?.state === "UNKNOWN").length;

// A bounded, explicitly selected batch. Each lane owns its Run, Grant, journal and controls.
export async function runBatch({ lanes, maxWorkers = 3, sleep, connected = () => true, onRound = async () => {} }) {
  if (!Array.isArray(lanes) || lanes.length === 0 || new Set(lanes.map(lane => lane.specId)).size !== lanes.length) throw new TypeError("Select distinct Specs explicitly");
  if (!Number.isInteger(maxWorkers) || maxWorkers < 1 || maxWorkers > 3) throw new TypeError("Batch worker limit must be between one and three");
  const statuses = new Map();
  let cursor = 0;
  const observe = async lane => {
    try { statuses.set(lane.specId, await lane.run({ mode: "snapshot" })); }
    catch (error) { statuses.set(lane.specId, { ...statuses.get(lane.specId), capacityUnknown: true, run: { state: "UNAVAILABLE", specId: lane.specId }, error: error.message }); }
  };
  while (connected()) {
    // Never allocate from yesterday's projection, including after process interruption.
    for (const lane of lanes) await observe(lane);
    await onRound(statuses);
    if ([...statuses.values()].every(terminal)) break;
    let progressed = false;
    for (let offset = 0; offset < lanes.length; offset += 1) {
      const lane = lanes[(cursor + offset) % lanes.length];
      const status = statuses.get(lane.specId);
      if (terminal(status) || status.run.state === "UNAVAILABLE") continue;
      const used = [...statuses.values()].reduce((count, current) => count + occupied(current), 0);
      const slots = [...statuses.values()].some(current => current.capacityUnknown) ? 0 : Math.max(0, maxWorkers - used);
      if (!(status.legalActions ?? []).some(action => slots > 0 || !["dispatch_issue", "remediate_environment", "repair_issue"].includes(action.type))) continue;
      try {
        statuses.set(lane.specId, await lane.run({ mode: "step", executionSlots: slots }));
        progressed = true;
      } catch (error) {
        // Unknown task creation outcomes are reconciled on the next observation, never repeated here.
        statuses.set(lane.specId, { ...status, capacityUnknown: true, run: { ...status.run, state: "UNAVAILABLE" }, error: error.message });
      }
    }
    cursor = (cursor + 1) % lanes.length;
    if (!progressed && [...statuses.values()].every(status => terminal(status)
      || ["BLOCKED", "UNAVAILABLE"].includes(status.run.state) && occupied(status) === 0)) break;
    await sleep(progressed ? 250 : 1000);
  }
  return { state: [...statuses.values()].every(status => status.run.state === "SUCCEEDED") ? "SUCCEEDED" : "PRESERVED", runs: [...statuses.values()] };
}
