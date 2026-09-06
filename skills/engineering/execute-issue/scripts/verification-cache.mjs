import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, renameSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const digest = value => createHash("sha256").update(value).digest("hex");
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

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
