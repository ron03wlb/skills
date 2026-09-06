import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const sameOwner = (a, b) => a?.generation === b?.generation
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
      if (!sameOwner(current, owner)) return;
      writeFileSync(temporary, JSON.stringify({ schema: "workflow-lease-health:v1", owner, pid: process.pid, at: now() }), { flag: "wx" });
      // Recheck generation before publishing. A successor rejects any late old-generation pulse.
      if (!sameOwner(JSON.parse(readFileSync(join(directory, "owner.json"), "utf8")), owner)) return;
      renameSync(temporary, join(directory, "health.json"));
    } catch { /* Missing or unreadable evidence stays UNKNOWN to observers. */ }
    finally { try { unlinkSync(temporary); } catch { /* Already renamed or absent. */ } }
  };
  pulse();
  const timer = setInterval(pulse, intervalMs);
  timer.unref();
  return { pulse, stop() { stopped = true; clearInterval(timer); } };
}

export function readLeaseHealth(directory, owner, { now = Date.now, maxAgeMs = 15000, alive = pid => process.kill(pid, 0) } = {}) {
  try {
    const current = JSON.parse(readFileSync(join(directory, "owner.json"), "utf8"));
    const health = JSON.parse(readFileSync(join(directory, "health.json"), "utf8"));
    const age = now() - health.at;
    if (health.schema !== "workflow-lease-health:v1" || !sameOwner(current, owner)
      || !sameOwner(health.owner, owner) || !Number.isInteger(health.pid) || health.pid <= 0
      || !Number.isFinite(age) || age < 0 || age > maxAgeMs) return "UNKNOWN";
    alive(health.pid);
    return "HEALTHY";
  } catch { return "UNKNOWN"; }
}
