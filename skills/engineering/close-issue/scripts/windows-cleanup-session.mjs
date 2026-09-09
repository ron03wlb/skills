import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// One private child retains process handles between discovery and fresh owner approval.
// Killing this child only cancels our inspector; it never terminates an unapproved helper.
export async function openWindowsCleanupSession({ worktree, cwd, env = process.env }) {
  if (process.platform !== "win32") throw new Error("Exact helper recovery requires Windows x64");
  const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-cleanup-processes.ps1", import.meta.url))],
    { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const reader = createInterface({ input: child.stdout });
  const messages = [], waiters = [];
  let failure, closed = false, released = false;
  const fail = error => { failure = error; for (const waiter of waiters.splice(0)) waiter.reject(error); };
  // The bound includes the owner's fresh Git checks between native process stops.
  const timer = setTimeout(() => { fail(new Error("Bounded Windows helper inspection expired")); child.kill(); }, 300000);
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
  child.stdin.write(`${JSON.stringify({ target: worktree })}\n`);
  try {
    const proof = await next();
    if (proof.state !== "READY" || !Array.isArray(proof.processes) || !proof.processes.length) throw new Error(proof.reason ?? "Exact helper ownership unproved");
    return { proof,
      async release(onProgress = () => {}, beforeRelease = () => {}) {
        if (released || closed) throw new Error("The frozen helper set can be released only once");
        released = true;
        child.stdin.write(`${JSON.stringify({ action: "release" })}\n`);
        const outcomes = [];
        try {
          while (true) {
            const result = await next();
            if (result.state === "BEFORE_RELEASE") {
              await beforeRelease(result.processId);
              child.stdin.write(`${JSON.stringify({ action: "proceed" })}\n`);
            } else if (result.state === "PROGRESS") {
              outcomes.push(result.outcome); await onProgress(result.outcome);
              child.stdin.write(`${JSON.stringify({ action: "recorded" })}\n`);
            } else { await exited; return { ...result, outcomes }; }
          }
        } catch (error) { child.kill(); await exited; return { state: "UNKNOWN", reason: error.message, outcomes }; }
      }, close };
  } catch (error) { await close(); throw error; }
}
