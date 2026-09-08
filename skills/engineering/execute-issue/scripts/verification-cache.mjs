import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, realpathSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

// Integration outcomes are obligations, including failed/unknown attempts, rather than a PASS cache.
export function createIntegrationVerification({ gitCommonDir, operationId, issueId, candidate }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(operationId)
    || typeof issueId !== "string" || !issueId || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(candidate)) throw new TypeError("Exact integration operation, Issue and candidate required");
  const directory = join(gitCommonDir, "workflow-verification", operationId);
  const path = join(directory, `integration-${digest(JSON.stringify({ issueId, candidate }))}.json`);
  const attemptIdentity = item => `sha256:${digest(JSON.stringify(canonical({ operationId, issueId, candidate,
    targetHead: item.targetHead, index: item.index, command: item.command, inputs: item.inputs })))}`;
  const resultIdentity = item => `sha256:${digest(JSON.stringify({ operationId, issueId, candidate,
    targetHead: item.targetHead, obligationIdentity: item.obligationIdentity, results: item.results }))}`;
  const outcome = results => results.some(item => item.state === "FAIL") ? "FAIL"
    : results.some(item => item.state !== "PASS") ? "UNKNOWN" : "PASS";
  const read = () => {
    if (!existsSync(path)) return null;
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (record.schema !== "issue-integration-verification:v1" || record.operationId !== operationId
      || record.issueId !== issueId || record.candidate !== candidate || !Array.isArray(record.attempts)
      || !Array.isArray(record.obligation) || record.obligationIdentity !== digest(JSON.stringify(canonical(record.obligation)))
      || new Set(record.attempts.map(item => item.identity)).size !== record.attempts.length
      || record.attempts.some(attempt => !["PASS", "FAIL", "UNKNOWN"].includes(attempt.state)
        || !Number.isInteger(attempt.index) || attempt.index < 0 || attempt.index >= record.obligation.length
        || JSON.stringify(attempt.command) !== JSON.stringify(record.obligation[attempt.index].command)
        || attempt.identity !== attemptIdentity(attempt)
        || attempt.state === "PASS" && attempt.exitCode !== 0
        || attempt.state === "FAIL" && (!Number.isInteger(attempt.exitCode) || attempt.exitCode === 0))) throw new Error("Integration verification evidence differs or is malformed");
    const current = record.current;
    if (current && (current.operationId !== operationId || current.issueId !== issueId || current.candidate !== candidate
      || current.obligationIdentity !== record.obligationIdentity || !Array.isArray(current.results)
      || current.results.length !== record.obligation.length || current.identity !== resultIdentity(current)
      || current.state !== outcome(current.results) || current.results.some((item, index) => item.index !== index
        || item.targetHead !== current.targetHead
        || !record.attempts.some(attempt => JSON.stringify(attempt) === JSON.stringify(item))))) throw new Error("Integration summary omits or contradicts its exact obligation evidence");
    return record;
  };
  const write = record => {
    mkdirSync(directory, { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(record), { flag: "wx", flush: true });
    renameSync(temporary, path);
    return read();
  };
  return {
    read,
    async verify({ targetHead, checks, assertCurrent, repository }) {
      assertCurrent();
      if (!Array.isArray(checks)) throw new TypeError("Explicit integration check obligation required");
      const obligation = checks.map(check => {
        if (!Array.isArray(check.command) || !check.command.length || !check.command.every(v => typeof v === "string")
          || !check.environment || !Object.keys(check.environment).length || typeof check.readExternalInputs !== "function") throw new TypeError("Integration check requires command, environment and external inputs");
        return { command: check.command, configFiles: check.configFiles ?? [] };
      });
      const obligationIdentity = digest(JSON.stringify(canonical(obligation)));
      let record = read();
      if (record && record.obligationIdentity !== obligationIdentity) throw new Error("Integration obligation changed for the same candidate; preserve its evidence");
      record ??= { schema: "issue-integration-verification:v1", operationId, issueId, candidate, obligationIdentity, obligation, attempts: [] };
      delete record.current; // An interrupted reevaluation cannot leave an earlier PASS authorizing cleanup.
      write(record); // Persist all required checks before the first command, including an explicit empty obligation.
      const results = [];
      for (const [index, check] of checks.entries()) {
        assertCurrent();
        const inputs = async () => ({ environment: check.environment, external: await check.readExternalInputs(), configuration: (check.configFiles ?? []).map(file => {
          if (typeof file !== "string" || /^[A-Za-z]:|^[/\\]/u.test(file) || file.split(/[/\\]/u).some(part => !part || part === "." || part === "..")) throw new TypeError("Exact relative configuration path required");
          return { file, digest: digest(readFileSync(join(repository, file))) };
        }) });
        const before = JSON.parse(JSON.stringify(await inputs()));
        const identity = attemptIdentity({ targetHead, index, command: check.command, inputs: before });
        let attempt = record.attempts.findLast(item => item.identity === identity);
        if (!attempt) {
          attempt = { identity, targetHead, index, command: check.command, inputs: before, state: "UNKNOWN", at: new Date().toISOString() };
          record.attempts.push(attempt); write(record);
          try {
            const outcome = check.run ? await check.run(check.command) : (() => {
              try { execFileSync(check.command[0], check.command.slice(1), { cwd: repository, stdio: "pipe" }); return { exitCode: 0 }; }
              catch (error) { return { exitCode: error.status, evidence: String(error.stderr ?? error.message).slice(-4000) }; }
            })();
            assertCurrent();
            const after = await inputs();
            if (before.external == null || after.external == null || JSON.stringify(canonical(before)) !== JSON.stringify(canonical(after))) {
              attempt.evidence = "Necessary verification inputs are unknown or changed during the check";
            } else {
              attempt.state = outcome.exitCode === 0 ? "PASS" : Number.isInteger(outcome.exitCode) ? "FAIL" : "UNKNOWN";
              attempt.exitCode = outcome.exitCode ?? null;
              attempt.evidence = outcome.evidence ?? `Command exit ${outcome.exitCode ?? "unknown"}`;
            }
          } catch (error) { attempt.evidence = error.message; }
          write(record);
        }
        results.push(attempt);
      }
      assertCurrent();
      const state = outcome(results);
      const result = { state, operationId, issueId, candidate, targetHead, obligationIdentity,
        identity: `sha256:${digest(JSON.stringify({ operationId, issueId, candidate, targetHead, obligationIdentity, results }))}`, results };
      record.current = result; write(record);
      return result;
    },
  };
}

// Owner-local successful verification evidence. External inputs are read on every call.
export function createVerificationCache({ repository, operationId }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(operationId)) throw new TypeError("Exact operation ID required");
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trim();
  const common = realpathSync(resolve(repository, git("rev-parse", "--git-common-dir")));
  const directory = join(common, "workflow-verification", operationId);
  return {
    async verify({ candidate, command, configFiles = [], environment, readExternalInputs, run }) {
      if (!Array.isArray(command) || command.length === 0 || !command.every(value => typeof value === "string")
        || !environment || typeof environment !== "object" || Object.keys(environment).length === 0
        || typeof readExternalInputs !== "function") throw new TypeError("Verification requires its exact command, environment and external-input reader");
      if (git("rev-parse", "HEAD") !== candidate || git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Verification candidate must be the exact clean worktree HEAD");
      const readConfiguration = () => configFiles.map(path => {
        if (typeof path !== "string" || path.startsWith("/") || path.split(/[\\/]/u).some(part => !part || part === "." || part === "..")) throw new TypeError("Configuration must use exact repository paths");
        return { path, digest: digest(readFileSync(join(repository, path))) };
      });
      const configuration = readConfiguration();
      const environmentIdentity = JSON.stringify(canonical(environment));
      const externalInputs = await readExternalInputs();
      // null means unknown validity: run the check, never reuse or publish cache evidence.
      const key = digest(JSON.stringify(canonical({ candidate, command, configuration, environment, externalInputs })));
      const path = join(directory, `${key}.json`);
      if (externalInputs != null) {
        try {
          const prior = JSON.parse(readFileSync(path, "utf8"));
          if (prior.schema === "issue-verification:v1" && prior.key === key && prior.candidate === candidate && prior.exitCode === 0) return { ...prior, reused: true };
        } catch { /* Missing or unreadable cache never proves a passing result. */ }
      }
      const result = run ? await run(command) : (() => {
        try { execFileSync(command[0], command.slice(1), { cwd: repository, stdio: "inherit" }); return { exitCode: 0 }; }
        catch (error) { return { exitCode: Number.isInteger(error.status) ? error.status : 1 }; }
      })();
      const evidence = { schema: "issue-verification:v1", key, candidate, command, exitCode: result.exitCode, at: new Date().toISOString() };
      if (result.exitCode === 0 && externalInputs != null) {
        // A check which mutates the candidate cannot seed successful reusable evidence.
        if (git("rev-parse", "HEAD") !== candidate || git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Verification changed its candidate");
        const freshExternal = await readExternalInputs();
        if (freshExternal == null || JSON.stringify(canonical(freshExternal)) !== JSON.stringify(canonical(externalInputs))
          || JSON.stringify(readConfiguration()) !== JSON.stringify(configuration)
          || JSON.stringify(canonical(environment)) !== environmentIdentity) throw new Error("Verification inputs changed during the check");
        mkdirSync(directory, { recursive: true });
        const temporary = `${path}.${randomUUID()}.tmp`;
        writeFileSync(temporary, JSON.stringify(evidence), { flag: "wx" });
        renameSync(temporary, path);
      }
      return { ...evidence, reused: false };
    },
  };
}
