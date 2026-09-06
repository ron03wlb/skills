import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createVerificationCache } from "../../skills/engineering/execute-issue/scripts/verification-cache.mjs";

test("verification reuses only unchanged candidate, command, configuration, environment and freshly read external inputs", async () => {
  const root = mkdtempSync(join(tmpdir(), "verification-reuse-"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    git("init", "-b", "main"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.invalid");
    writeFileSync(join(root, "config.json"), "{}\n"); git("add", "config.json"); git("commit", "-m", "baseline");
    const count = join(root, ".git", "executions");
    const command = [process.execPath, "-e", "const fs=require('node:fs');let n=0;try{n=Number(fs.readFileSync(process.argv[1],'utf8'))}catch{}fs.writeFileSync(process.argv[1],String(n+1))", count];
    const cache = createVerificationCache({ repository: root, operationId: "issue-one" });
    let external = { providerRevision: 1 };
    let reads = 0;
    const request = { candidate: git("rev-parse", "HEAD"), command, configFiles: ["config.json"], environment: { host: "local", sandbox: "test" }, readExternalInputs: async () => { reads += 1; return external; } };
    assert.equal((await cache.verify(request)).reused, false);
    assert.equal((await cache.verify(request)).reused, true);
    assert.equal(reads, 3);
    request.environment.sandbox = "different"; await cache.verify(request);
    request.command = [...command, "different-command-argument"]; await cache.verify(request);
    request.configFiles = []; await cache.verify(request);
    external = { providerRevision: 2 }; await cache.verify(request);
    git("commit", "--allow-empty", "-m", "new integration combination"); request.candidate = git("rev-parse", "HEAD"); await cache.verify(request);
    external = null; await cache.verify(request); await cache.verify(request);
    assert.equal(Number(readFileSync(count, "utf8")), 8);
    assert.equal(reads, 15);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
