import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { conflict, digest, isRejectedStatus, uncertain } from "./gitlab-producer-transport.mjs";

function locations(connection, key, payload) {
  const root = join(connection.gitCommonDir, "matt-workflow-control", "gitlab-producer-intents");
  const id = digest(`${connection.repositoryId}:${key}`).slice(7);
  return { root, intent: join(root, `${id}.json`), attempts: join(root, `${id}.attempts`), fingerprint: digest(JSON.stringify(payload)) };
}
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const append = (path, value) => {
  try { writeFileSync(path, JSON.stringify(value), { flag: "wx", flush: true }); }
  catch (error) { if (error.code === "EEXIST") throw conflict("Mutation attempt already claimed; read its result before retrying"); throw error; }
};
export function readMutation(connection, { key, payload }) {
  const paths = locations(connection, key, payload);
  const base = { key, fingerprint: paths.fingerprint, attempt: 0, result: null };
  if (!existsSync(paths.intent)) {
    if (existsSync(paths.attempts)) throw conflict("Mutation attempts exist without their intent");
    return { ...base, state: "UNATTEMPTED" };
  }
  const intent = readJson(paths.intent);
  if (intent.schema !== "gitlab-producer-intent:v1" || intent.key !== key || intent.fingerprint !== paths.fingerprint) throw conflict("Mutation intent differs from the requested retry");
  if (!existsSync(paths.attempts)) return { ...base, state: "UNRESOLVED" }; // Legacy evidence is never reinterpreted as rejection.
  const names = readdirSync(paths.attempts).sort();
  if (names.some(name => !/^[0-9]{6}\.(?:attempt|result)\.json$/u.test(name))) throw conflict("Unknown mutation attempt evidence");
  const attempts = names.filter(name => name.endsWith(".attempt.json"));
  let result = null;
  for (const [index, name] of attempts.entries()) {
    const number = index + 1;
    if (name !== `${String(number).padStart(6, "0")}.attempt.json`) throw conflict("Mutation attempt sequence is incomplete");
    if (index > 0 && result?.state !== "REJECTED") throw conflict("A mutation retry lacks a terminal rejection");
    const expected = { schema: "gitlab-producer-attempt:v1", key, fingerprint: paths.fingerprint, attempt: number };
    if (JSON.stringify(readJson(join(paths.attempts, name))) !== JSON.stringify(expected)) throw conflict("Mutation attempt binding differs");
    const resultName = name.replace(".attempt.json", ".result.json");
    result = names.includes(resultName) ? readJson(join(paths.attempts, resultName)) : null;
    if (result && (Object.keys(result).some(key => !["schema", "key", "fingerprint", "attempt", "state", "httpStatus", "requestId"].includes(key))
      || result.schema !== "gitlab-producer-result:v1" || result.key !== key || result.fingerprint !== paths.fingerprint
      || result.attempt !== number || !["ACKNOWLEDGED", "REJECTED", "UNRESOLVED"].includes(result.state)
      || !(result.httpStatus === null || Number.isInteger(result.httpStatus) && result.httpStatus >= 100 && result.httpStatus <= 599)
      || !(result.requestId === null || /^[a-zA-Z0-9_.-]{1,128}$/u.test(result.requestId))
      || result.state === "REJECTED" && !isRejectedStatus(result.httpStatus))) throw conflict("Mutation result binding differs");
  }
  if (names.filter(name => name.endsWith(".result.json")).some(name => !names.includes(name.replace(".result.json", ".attempt.json")))) throw conflict("Mutation result lacks its attempt");
  return { ...base, attempt: attempts.length, result, state: result?.state ?? "UNRESOLVED" };
}
const rejected = result => Object.assign(new Error(`GitLab rejected the mutation (HTTP ${result.httpStatus}); inspect the exact mutation and explicitly request retryRejected after repair.`),
  { code: "GITLAB_PRODUCER_REJECTED", httpStatus: result.httpStatus, requestId: result.requestId });

// Every write is claimed durably. Only a recorded rejection permits an explicitly requested next attempt.
export async function mutateOnce(connection, { key, payload, observe, write, retryRejected = false }) {
  if (typeof retryRejected !== "boolean") throw conflict("retryRejected must be an explicit boolean");
  const state = readMutation(connection, { key, payload });
  const prior = await observe(state.state !== "UNATTEMPTED");
  if (prior) return prior;
  if (state.state !== "UNATTEMPTED" && !(retryRejected && state.state === "REJECTED")) {
    if (state.state === "REJECTED") throw rejected(state.result);
    throw uncertain();
  }
  const paths = locations(connection, key, payload);
  mkdirSync(paths.root, { recursive: true });
  if (state.state === "UNATTEMPTED") append(paths.intent, { schema: "gitlab-producer-intent:v1", key, fingerprint: paths.fingerprint });
  const attempt = state.attempt + 1;
  if (attempt > 999999) throw conflict("Mutation attempt limit exceeded");
  mkdirSync(paths.attempts, { recursive: true });
  const stem = join(paths.attempts, String(attempt).padStart(6, "0"));
  append(`${stem}.attempt.json`, { schema: "gitlab-producer-attempt:v1", key, fingerprint: paths.fingerprint, attempt });
  let outcome = { state: "ACKNOWLEDGED", httpStatus: null, requestId: null };
  try { await write(); }
  catch (error) {
    const known = error.code === "GITLAB_PRODUCER_TRANSPORT";
    outcome = { state: known && error.outcome === "REJECTED" && isRejectedStatus(error.httpStatus) ? "REJECTED" : "UNRESOLVED",
      httpStatus: known && Number.isInteger(error.httpStatus) ? error.httpStatus : null,
      requestId: known && /^[a-zA-Z0-9_.-]{1,128}$/u.test(error.requestId ?? "") ? error.requestId : null };
  }
  append(`${stem}.result.json`, { schema: "gitlab-producer-result:v1", key, fingerprint: paths.fingerprint, attempt, ...outcome });
  const result = await observe(true);
  if (result) return result;
  if (outcome.state === "REJECTED") throw rejected(outcome);
  throw uncertain();
}
