import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isContained = (base, candidate) => {
  const pathFromBase = relative(base, candidate);
  return pathFromBase === "" || (!isAbsolute(pathFromBase)
    && pathFromBase !== ".."
    && !pathFromBase.startsWith(`..${sep}`));
};

export function resolveLaneRecordLocation({ cwd, runsDir, recordDir } = {}) {
  if (!isText(cwd) || CONTROL_CHARACTER.test(cwd)) {
    throw new TypeError("A lane record location needs a valid launch directory");
  }
  if (!isText(runsDir) || CONTROL_CHARACTER.test(runsDir)) {
    throw new TypeError("A lane record location needs a valid run directory root");
  }
  if (!isText(recordDir) || CONTROL_CHARACTER.test(recordDir)) {
    throw new TypeError("A lane record directory must be non-empty text without control characters");
  }
  if (isAbsolute(recordDir) || win32.isAbsolute(recordDir)) {
    throw new TypeError("A lane record directory must be relative");
  }
  if (recordDir.split(/[\\/]+/u).includes("..")) {
    throw new TypeError("A lane record directory must not traverse outside its run root");
  }
  const base = isAbsolute(runsDir) ? resolve(runsDir) : resolve(cwd, runsDir);
  const laneDirectory = resolve(base, recordDir);
  if (!isContained(base, laneDirectory)) {
    throw new TypeError("A lane record directory must resolve inside its run root");
  }
  return Object.freeze({ base, laneDirectory, recordDir });
}

export function realpathIsContained({ base, candidate, realpath } = {}) {
  if (typeof realpath !== "function") throw new TypeError("Realpath containment needs a realpath reader");
  const realBase = realpath(base);
  const realCandidate = realpath(candidate);
  return isContained(realBase, realCandidate);
}
