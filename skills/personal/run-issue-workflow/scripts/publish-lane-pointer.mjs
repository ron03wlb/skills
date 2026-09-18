// The coordinator's one launch step: bind a recorded lane to the native run its harness created.
// Publishing the pointer is the whole effect; this entry never launches, dispatches, or journals.
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publishLanePointer } from "./native-lane-launch.mjs";

export function publishLanePointerFromCli({ argv = process.argv.slice(2), now = () => new Date().toISOString() } = {}) {
  const [laneRef, nativeRunId, cwd, runsDir, recordDir = null] = argv;
  if (!laneRef || !nativeRunId || !cwd || !runsDir) {
    throw new Error("Usage: publish-lane-pointer.mjs <laneRef> <nativeRunId> <cwd> <runsDir> [recordDir]");
  }
  return publishLanePointer({ laneRef, nativeRunId, cwd, runsDir,
    ...(recordDir === null ? {} : { recordDir }), at: now() });
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(publishLanePointerFromCli())}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "LANE_POINTER_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
