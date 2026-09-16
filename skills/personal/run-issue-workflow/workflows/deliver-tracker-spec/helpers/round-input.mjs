// Bundle-local reader for one Delivery workflow host round.
//
// The workflow's runtime task is the only channel the entry has for handing reconciled evidence to the
// controller. It is a single JSON object; large evidence lives in a file the object points at. Nothing
// here decides authority: it validates the shape and returns it, or refuses the round.
import { readFileSync } from "node:fs";

export const ROUND_INPUT_SCHEMA = "delivery-host-round-input:v1";
export const FACT_SCHEMA = "dag-run-facts:v1";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.length > 0;
const refuse = (message) => {
  throw new TypeError(`Delivery host round input: ${message}`);
};

const parseJson = (text, label) => {
  try {
    return JSON.parse(text);
  } catch {
    refuse(`${label} is not one JSON object`);
  }
};

const checksum = (value) => JSON.stringify(value);

// `text` is the exact runtime task string. An `inputPath` indirection keeps a large reconciled fact set
// out of the workflow task line while still binding the round to one exact file.
export function parseRoundInput(text, { readFile = (path) => readFileSync(path, "utf8") } = {}) {
  if (!isText(text)) refuse("the runtime task is empty");
  const payload = parseJson(text, "the runtime task");
  if (!isRecord(payload)) refuse("the runtime task must be one JSON object");
  let source = payload;
  if (payload.inputPath !== undefined) {
    if (!isText(payload.inputPath)) refuse("inputPath must be one file path");
    const evidence = parseJson(readFile(payload.inputPath), `the round input file ${payload.inputPath}`);
    if (!isRecord(evidence)) refuse("the round input file must contain one JSON object");
    // The file owns the reconciled evidence it declares; the runtime task still owns routing fields
    // such as the stage id that the file has no reason to repeat.
    source = { ...payload, ...evidence };
  }
  const facts = source.facts;
  if (!isRecord(facts) || facts.schema !== FACT_SCHEMA) refuse(`facts must be one ${FACT_SCHEMA} record`);
  if (!isRecord(facts.run) || !isText(facts.run.runId) || !isText(facts.run.specId) || !isText(facts.run.target)) {
    refuse("facts must bind a Run id, one Spec id and one target branch");
  }
  const blockedHostRun = source.blockedHostRun ?? null;
  if (blockedHostRun !== null && !isRecord(blockedHostRun)) refuse("blockedHostRun must be one host run record");
  const recorded = source.recorded ?? [];
  if (!Array.isArray(recorded) || !recorded.every((entry) => isRecord(entry) && isText(entry.id))) {
    refuse("recorded must be an array of host operations with an id");
  }
  const at = source.at ?? null;
  if (at !== null && !isText(at)) refuse("at must be one canonical ISO instant");
  const gitCommonDir = source.gitCommonDir ?? null;
  if (gitCommonDir !== null && !isText(gitCommonDir)) refuse("gitCommonDir must be one absolute directory");
  const stageId = isText(source.stageId) ? source.stageId : null;
  return Object.freeze({
    facts,
    blockedHostRun,
    recorded,
    at,
    gitCommonDir,
    stageId,
    digest: checksum({ runId: facts.run.runId, specId: facts.run.specId, target: facts.run.target }),
  });
}

// The recorded operations the host already materialized for this Run, in recorded order, with the
// request shape it proved. The controller re-issues exactly these before anything new.
export function recordedFromRunRecord(runJson, stageId) {
  if (!isRecord(runJson) || !Array.isArray(runJson.tasks)) return [];
  const prefix = isText(stageId) ? `${stageId}.` : null;
  return runJson.tasks
    .filter((task) => isRecord(task) && isText(task.specId)
      && (prefix === null || task.specId.startsWith(prefix)))
    .map((task) => ({
      id: prefix === null ? task.specId : task.specId.slice(prefix.length),
      requestIdentity: isText(task.requestHash) ? `sha256:${task.requestHash}` : null,
      outcome: task.status === "completed" ? "settled" : "recorded",
    }));
}
