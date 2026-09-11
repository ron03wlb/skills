import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const OUTCOME_FIELDS = ["Pid", "Reason", "Started", "State", "TerminationRequested"];
const validOutcome = outcome => outcome && typeof outcome === "object" && !Array.isArray(outcome)
  && JSON.stringify(Object.keys(outcome).sort()) === JSON.stringify(OUTCOME_FIELDS)
  && Number.isInteger(outcome.Pid) && /^\d+$/u.test(outcome.Started)
  && ["EXITED", "EXIT_UNPROVEN", "NOT_RELEASED"].includes(outcome.State)
  && (outcome.Reason === null || typeof outcome.Reason === "string")
  && typeof outcome.TerminationRequested === "boolean";

// One private child retains process handles between discovery and fresh owner approval.
// Killing this child only cancels our inspector; it never terminates an unapproved helper.
export async function openWindowsCleanupSession({ worktree, cwd, env = process.env, expectedProcesses, inspectionTimeoutMs = 300000 }) {
  if (process.platform !== "win32") throw new Error("Exact helper recovery requires Windows x64");
  if (!Number.isInteger(inspectionTimeoutMs) || inspectionTimeoutMs < 1) throw new TypeError("A positive Windows inspection timeout is required");
  const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-cleanup-processes.ps1", import.meta.url))],
    { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const reader = createInterface({ input: child.stdout });
  const messages = [], waiters = [];
  let failure, closed = false, released = false;
  const fail = error => {
    failure ??= error;
    for (const waiter of waiters.splice(0)) waiter.reject(failure);
  };
  // Each frozen-helper boundary has one bounded window for the owner's fresh task/Git checks.
  // Valid protocol progress resets that window; the finite frozen set bounds the full session.
  let timer;
  const armTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { fail(new Error("Bounded Windows helper inspection expired")); child.kill(); }, inspectionTimeoutMs);
  };
  armTimer();
  const exited = new Promise(resolve => child.once("close", code => {
    closed = true; clearTimeout(timer); reader.close(); fail(new Error(`Windows cleanup inspector ended (${code})`)); resolve(code);
  }));
  child.once("error", fail);
  child.stdin.on("error", fail);
  child.stderr.resume(); // Raw compiler/runtime output may contain commands; public errors stay bounded.
  reader.on("line", line => {
    try {
      const message = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(message); else messages.push(message);
    } catch { fail(new Error("Windows cleanup inspector returned invalid JSON")); }
  });
  const next = () => messages.length ? Promise.resolve(messages.shift()) : failure ? Promise.reject(failure)
    : new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  const close = async () => {
    if (!closed) { child.stdin.end(`${JSON.stringify({ action: "cancel" })}\n`); }
    await exited;
  };
  child.stdin.write(`${JSON.stringify({ target: worktree, ...(expectedProcesses ? { expectedProcesses } : {}) })}\n`);
  try {
    const proof = await next();
    if (proof.state !== "READY" || !Array.isArray(proof.processes) || !proof.processes.length) throw new Error(proof.reason ?? "Exact helper ownership unproved");
    armTimer();
    return { proof,
      async release(onProgress = () => {}, beforeRelease = () => {}) {
        if (released || closed) throw new Error("The frozen helper set can be released only once");
        released = true;
        child.stdin.write(`${JSON.stringify({ action: "release" })}\n`);
        const outcomes = [], completed = new Set();
        let pendingProcessId;
        try {
          while (true) {
            const result = await next();
            if (result.state === "BEFORE_RELEASE") {
              if (pendingProcessId !== undefined || !Number.isInteger(result.processId) || completed.has(result.processId)
                || !proof.processes.some(process => process.Pid === result.processId)) {
                throw new Error("Windows cleanup inspector returned an invalid release boundary");
              }
              pendingProcessId = result.processId;
              armTimer();
              await beforeRelease(result.processId);
              child.stdin.write(`${JSON.stringify({ action: "proceed" })}\n`);
            } else if (result.state === "PROGRESS") {
              if (!validOutcome(result.outcome) || result.outcome.Pid !== pendingProcessId) {
                throw new Error("Windows cleanup inspector returned invalid progress");
              }
              completed.add(pendingProcessId); pendingProcessId = undefined;
              armTimer();
              outcomes.push(result.outcome); await onProgress(result.outcome);
              child.stdin.write(`${JSON.stringify({ action: "recorded" })}\n`);
            } else {
              if (pendingProcessId !== undefined || !["RELEASED", "RESPAWNED", "BLOCKED"].includes(result.state)) {
                throw new Error("Windows cleanup inspector returned an invalid terminal state");
              }
              armTimer();
              await exited; return { ...result, outcomes };
            }
          }
        } catch (error) { child.kill(); await exited; return { state: "UNKNOWN", reason: error.message, outcomes }; }
      }, close };
  } catch (error) { await close(); throw error; }
}
