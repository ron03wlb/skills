import { execFileSync } from "node:child_process";

// One injected synchronous command adapter. String output is trimmed; pass `encoding: null`
// when a caller needs the exact bytes (for example a `git archive` stream).
export function runWorkflowCommand(name, args, options = {}) {
  const output = execFileSync(name, args, { encoding: "utf8", ...options });
  return typeof output === "string" ? output.trim() : output;
}
