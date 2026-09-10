import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const sameLeaseOwner = (a, b) => a?.generation === b?.generation
  && a?.coordinatorInstanceId === b?.coordinatorInstanceId
  && (a?.operationId ?? a?.runId) === (b?.operationId ?? b?.runId);

// Health is separate from ownership. It never authorizes releasing or reclaiming a lease.
export function maintainLeaseHealth(directory, owner, { now = Date.now, intervalMs = 5000 } = {}) {
  let stopped = false;
  const pulse = () => {
    if (stopped) return;
    const temporary = join(directory, `health-${randomUUID()}.tmp`);
    try {
      const current = JSON.parse(readFileSync(join(directory, "owner.json"), "utf8"));
      if (!sameLeaseOwner(current, owner)) return;
      writeFileSync(temporary, JSON.stringify({ schema: "workflow-lease-health:v1", owner, pid: process.pid, at: now() }), { flag: "wx" });
      // Recheck generation before publishing. A successor rejects any late old-generation pulse.
      if (!sameLeaseOwner(JSON.parse(readFileSync(join(directory, "owner.json"), "utf8")), owner)) return;
      renameSync(temporary, join(directory, "health.json"));
    } catch { /* Missing or unreadable evidence stays UNKNOWN to observers. */ }
    finally { try { unlinkSync(temporary); } catch { /* Already renamed or absent. */ } }
  };
  pulse();
  const timer = setInterval(pulse, intervalMs);
  timer.unref();
  return { pulse, stop() { stopped = true; clearInterval(timer); } };
}

export function readLeaseHealthEvidence(directory, owner, { now = Date.now, maxAgeMs = 15000, alive = pid => process.kill(pid, 0) } = {}) {
  let current;
  try {
    current = JSON.parse(readFileSync(join(directory, "owner.json"), "utf8"));
  } catch { return { state: "UNKNOWN", reason: "OWNER_UNREADABLE", owner }; }
  if (!sameLeaseOwner(current, owner)) return { state: "UNKNOWN", reason: "OWNER_CHANGED", owner };
  let health;
  try {
    health = JSON.parse(readFileSync(join(directory, "health.json"), "utf8"));
  } catch { return { state: "UNKNOWN", reason: "HEARTBEAT_UNREADABLE", owner }; }
  if (health.schema !== "workflow-lease-health:v1" || !sameLeaseOwner(health.owner, owner)
    || !Number.isInteger(health.pid) || health.pid <= 0) {
    return { state: "UNKNOWN", reason: "HEARTBEAT_IDENTITY_UNKNOWN", owner };
  }
  const age = now() - health.at;
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
    return { state: "UNKNOWN", reason: "HEARTBEAT_AGE_OR_CLOCK_UNKNOWN", owner };
  }
  try {
    alive(health.pid);
  } catch (error) {
    if (error?.code === "ESRCH") return { state: "INACTIVE", reason: "PROCESS_CONFIRMED_ABSENT", owner };
    return { state: "UNKNOWN", reason: "PROCESS_LIVENESS_UNKNOWN", owner };
  }
  return { state: "HEALTHY", reason: "EXACT_OWNER_GENERATION_HEALTHY", owner };
}

export function readLeaseHealth(directory, owner, options) {
  return readLeaseHealthEvidence(directory, owner, options).state;
}
