import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { openWindowsCleanupSession } from "../../skills/engineering/close-issue/scripts/windows-cleanup-session.mjs";
import { recoverPendingHostCleanup } from "../../skills/engineering/close-issue/scripts/pending-host-cleanup.mjs";
import { createRunStore } from "../../skills/personal/run-issue-workflow/scripts/run-store.mjs";
import { verifyIntegratedCandidate } from "../../skills/engineering/close-issue/scripts/merge-candidate.mjs";
import { deriveExecuteIssueOperationIdentity } from "../../skills/personal/run-issue-workflow/scripts/workflow-operation-identity.mjs";

function fixturePaths(root) {
  const local = join(root, "local"), hostExe = join(local, "OpenAI", "Codex", "bin", "fixture", "codex.exe");
  const helperExe = join(local, "OpenAI", "Codex", "runtimes", "cua_node", "fixture", "bin", "node_repl.exe");
  for (const path of [hostExe, helperExe]) { mkdirSync(join(path, ".."), { recursive: true }); copyFileSync(process.execPath, path); }
  const unrelated = join(root, "unrelated"); mkdirSync(unrelated, { recursive: true });
  return { hostExe, helperExe, unrelated, env: { ...process.env, LOCALAPPDATA: local } };
}

async function hostFixture(root, target, foreignChild = false, ownedCount = 1) {
  const { hostExe, helperExe, unrelated, env } = fixturePaths(root);
  const helperCode = foreignChild
    ? `const {spawn}=require('node:child_process'); const child=spawn(${JSON.stringify(process.execPath)},['-e','process.stdin.resume()'],{cwd:${JSON.stringify(unrelated)},stdio:['pipe','ignore','ignore'],windowsHide:true}); process.stdin.resume();const stop=()=>{child.kill();process.exit()};process.stdin.on('end',stop);process.stdin.on('data',stop);process.stdout.write('ready\\n');`
    : "process.stdin.resume();process.stdout.write('ready\\n');process.stdin.on('end',()=>process.exit());process.stdin.on('data',()=>process.exit());";
  const code = `const {spawn}=require('node:child_process');let children=[];let ready=0;for(const cwd of ${JSON.stringify([...Array(ownedCount).fill(target), unrelated])}){const child=spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(helperCode)}],{cwd,detached:true,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdin.on('error',()=>{});children.push(child);child.stdout.once('data',()=>{if(++ready===${ownedCount + 1})console.log(JSON.stringify(children.map(c=>c.pid)))});}process.stdin.resume();const stop=()=>{for(const c of children)if(c.exitCode===null)c.stdin.end('stop\\n');setTimeout(()=>{for(const c of children)if(c.exitCode===null)c.kill();process.exit()},1000)};process.stdin.on('end',stop);process.stdin.on('data',stop);`;
  const host = spawn(hostExe, ["-e", code], { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: host.stdout });
  const [line] = await once(lines, "line"); const pids = JSON.parse(line), unrelatedPid = pids.pop(), ownedPid = pids[0];
  return { env, host, helperExe, ownedPid, ownedPids: pids, unrelatedPid, async dispose() {
    lines.close(); if (host.exitCode !== null || host.signalCode !== null) return;
    const exited = once(host, "exit"); host.stdin.end("stop\n"); await exited;
  } };
}

async function holdDirectory(executable, cwd) {
  const child = spawn(executable, ["-e", "process.stdin.resume();process.stdout.write('ready');process.stdin.on('end',()=>process.exit());"],
    { cwd, detached: true, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  await once(child.stdout, "data");
  return { child, async dispose() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit"); child.stdin.end(); await exited;
  } };
}

async function nestedHostFixture(root, target) {
  const { hostExe, helperExe, unrelated, env } = fixturePaths(root);
  // The nested launcher exits naturally with its child, matching the
  // computer-use launcher / Node REPL topology.
  const leafCode = "process.stdin.resume();console.log(process.pid);process.stdin.on('end',()=>process.exit());";
  const launcherCode = `const {spawn}=require('node:child_process');const child=spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(leafCode)}],{cwd:${JSON.stringify(target)},detached:true,windowsHide:true,stdio:['pipe','pipe','ignore']});child.stdout.pipe(process.stdout);child.once('exit',()=>process.exit());process.stdin.resume();process.stdin.on('end',()=>child.stdin.end());`;
  const code = `const {spawn}=require('node:child_process');const other=spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(leafCode)}],{cwd:${JSON.stringify(unrelated)},detached:true,windowsHide:true,stdio:['pipe','ignore','ignore']});const launcher=spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(launcherCode)}],{cwd:${JSON.stringify(target)},detached:true,windowsHide:true,stdio:['pipe','pipe','ignore']});launcher.stdout.once('data',data=>console.log(JSON.stringify({launcher:launcher.pid,leaf:Number(data.toString().trim()),unrelatedPid:other.pid})));launcher.once('exit',()=>console.log('launcher-exited'));process.stdin.resume();process.stdin.on('end',()=>{launcher.stdin.end();other.stdin.end();setTimeout(()=>process.exit(),1000)});`;
  const host = spawn(hostExe, ["-e", code], { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
  const lines = createInterface({ input: host.stdout });
  const [line] = await once(lines, "line");
  const pids = JSON.parse(line);
  const launcherExited = once(lines, "line");
  return { env, host, ...pids, launcherExited, async dispose() {
    lines.close(); if (host.exitCode !== null || host.signalCode !== null) return;
    const exited = once(host, "exit"); host.stdin.end(); await exited;
  } };
}

test("a frozen launcher exiting with its released child is observed through its retained handle", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "nested-helper-exit-"))), target = join(root, "issue"); mkdirSync(target);
  let fixture, session;
  try {
    fixture = await nestedHostFixture(root, target);
    session = await openWindowsCleanupSession({ worktree: target, cwd: root, env: fixture.env });
    assert.deepEqual(session.proof.processes.map(item => item.Pid).sort(), [fixture.launcher, fixture.leaf].sort());
    const release = await session.release(async outcome => {
      if (outcome.Pid === fixture.leaf && outcome.State === "EXITED") await fixture.launcherExited;
    });
    assert.equal(release.state, "RELEASED", JSON.stringify(release));
    assert.deepEqual(release.outcomes.map(item => [item.Pid, item.State, item.TerminationRequested]),
      [[fixture.leaf, "EXITED", true], [fixture.launcher, "EXITED", false]]);
    assert.doesNotThrow(() => process.kill(fixture.host.pid, 0));
    assert.doesNotThrow(() => process.kill(fixture.unrelatedPid, 0));
    rmdirSync(target);
  } finally { await session?.close(); await fixture?.dispose(); rmSync(root, { recursive: true, force: true }); }
});

// Real Git ownership is checked on both sides of every yielding task read; Windows
// process startup makes these end-to-end checks much slower than the native probe.
test("real Windows current-directory recovery releases only the exact helper and preserves its host and unrelated helper", { skip: process.platform !== "win32", timeout: 600000 }, async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "exact-helpers-")));
  const repository = join(root, "repository"), worktree = join(root, "issue"); mkdirSync(repository);
  const git = (...args) => execFileSync("git", ["-C", repository, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  let fixture, blocker;
  try {
    git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
    git("-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "baseline");
    git("branch", "issue"); mkdirSync(worktree);
    const candidate = git("rev-parse", "HEAD");
    fixture = await hostFixture(root, worktree);
    let failure;
    assert.throws(() => rmdirSync(worktree), error => { failure = { code: error.code, message: error.message }; return ["EBUSY", "EPERM", "EACCES"].includes(error.code); });
    const store = createRunStore({ gitCommonDir: join(repository, ".git") });
    const leaseInput = { store, target: "main", repositoryId: "github:example/repo", specId: "spec", approvedPublicationIdentity: "publication", issueId: "issue" };
    const completion = { issueId: "issue", specId: "spec", target: "main", targetWorktree: repository, topic: "issue", worktree, candidate };
    const taskRef = { threadId: "task", hostId: "local" };
    let reads = 0, started = false;
    const readTask = async () => ({ thread: { id: "task", hostId: "local", cwd: worktree, status: { type: started ? "active" : "notLoaded" } }, turns: [{ status: started ? "inProgress" : "completed" }] });
    const input = { leaseInput, completion, taskRef, failure, readTask: async () => { reads++; return readTask(); },
      verifyIntegration: leases => verifyIntegratedCandidate({ leases, targetWorktree: repository, candidate, issueId: "issue",
        operationId: deriveExecuteIssueOperationIdentity(leases.operationIdentity).key, checks: [] }),
      openSession: options => openWindowsCleanupSession({ ...options, env: fixture.env }) };
    // A task becoming active while native discovery yields cancels the retained handle session.
    const blocked = await recoverPendingHostCleanup({ ...input, openSession: async options => {
      const session = await input.openSession(options); started = true; return session;
    } });
    assert.equal(blocked.reasonCode, "host_task_ownership_unproven", JSON.stringify(blocked));
    assert.doesNotThrow(() => process.kill(fixture.ownedPid, 0));
    assert.ok(existsSync(worktree)); started = false;
    // Simulate a native result whose audit path also failed. Native partial-effect
    // behavior has separate real-process tests; this covers the owning return path.
    const partial = { state: "UNKNOWN", reason: "Fixture progress write failed", outcomes: [{ State: "EXITED", Pid: fixture.ownedPid }] };
    const auditFailure = await recoverPendingHostCleanup({ ...input,
      leaseInput: { ...leaseInput, issueId: "audit" }, completion: { ...completion, issueId: "audit" },
      verifyIntegration: leases => verifyIntegratedCandidate({ leases, targetWorktree: repository, candidate, issueId: "audit",
        operationId: deriveExecuteIssueOperationIdentity(leases.operationIdentity).key, checks: [] }),
      openSession: async () => ({ proof: { processes: [] }, async release() {
        const records = join(repository, ".git", "workflow-host");
        const reservation = readdirSync(records).find(name => /^helper-recovery-[a-f0-9]+\.json$/u.test(name));
        mkdirSync(join(records, `${reservation}.result`));
        return partial;
      }, async close() {} }) });
    assert.equal(auditFailure.state, "HOST_CLEANUP_BLOCKED");
    assert.ok(auditFailure.observations.some(item => item.message === JSON.stringify(partial)), "Known effects survive result-audit failure");
    const recovered = await recoverPendingHostCleanup(input);
    assert.equal(recovered.state, "HOST_CLEANUP_RECOVERED", JSON.stringify(recovered));
    assert.equal(recovered.directoryState, "ABSENT");
    assert.equal(recovered.processes.length, 1);
    assert.equal(recovered.processes[0].Pid, fixture.ownedPid);
    assert.ok(reads >= 6, "ownership is refreshed across every yielding boundary");
    assert.equal(existsSync(worktree), false);
    assert.doesNotThrow(() => process.kill(fixture.unrelatedPid, 0));
    assert.doesNotThrow(() => process.kill(fixture.host.pid, 0));
    assert.equal(git("rev-parse", "HEAD"), candidate);
    assert.equal(git("status", "--porcelain=v1"), "");
    assert.equal(store.observeRepositoryCloseLease().state, "ABSENT");
    assert.equal(store.readTargetMutationWriterLock("main"), null);
    // A respawn/recreated directory never authorizes a second batch for the same completion.
    mkdirSync(worktree);
    blocker = await holdDirectory(process.execPath, worktree);
    const repeated = await recoverPendingHostCleanup({ ...input, taskRef: { hostId: "local", threadId: "task", unrelated: "ignored" } });
    assert.equal(repeated.reasonCode, "host_helper_recovery_failed");
    assert.ok(repeated.observations.some(item => item.code === "RECOVERY_ALREADY_ATTEMPTED"));
    await blocker.dispose(); blocker = null;
    const unlocked = await recoverPendingHostCleanup({ ...input, openSession: () => assert.fail("An unlocked directory needs no process batch") });
    assert.equal(unlocked.state, "HOST_CLEANUP_RECOVERED");
    assert.deepEqual(unlocked.processes, []);
    assert.equal(existsSync(worktree), false);
  } finally { await blocker?.dispose(); await fixture?.dispose(); rmSync(root, { recursive: true, force: true }); }
});

test("new directory ownership between helper stops preserves partial effects and the remaining helpers", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "changed-helper-set-"))), target = join(root, "issue"); mkdirSync(target);
  let fixture, newcomer, session;
  try {
    fixture = await hostFixture(root, target, false, 2);
    session = await openWindowsCleanupSession({ worktree: target, cwd: root, env: fixture.env });
    const recorded = [];
    const release = await session.release(async outcome => {
      recorded.push(outcome);
      if (recorded.length === 1) newcomer = await holdDirectory(fixture.helperExe, target);
    });
    assert.equal(release.state, "BLOCKED", JSON.stringify(release));
    assert.deepEqual(release.outcomes, recorded);
    assert.equal(recorded.length, 2);
    assert.equal(recorded[0].State, "EXITED");
    assert.equal(recorded[0].TerminationRequested, true);
    assert.equal(recorded[1].State, "NOT_RELEASED");
    assert.equal(recorded[1].TerminationRequested, false);
    assert.match(recorded[1].Reason, /New or missing directory holder/u);
    assert.doesNotThrow(() => process.kill(recorded[1].Pid, 0));
    assert.doesNotThrow(() => process.kill(newcomer.child.pid, 0));
    assert.doesNotThrow(() => process.kill(fixture.unrelatedPid, 0));
  } finally { await session?.close(); await newcomer?.dispose(); await fixture?.dispose(); rmSync(root, { recursive: true, force: true }); }
});

test("a failed durable progress write stops the batch with its completed effect retained", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "helper-audit-failure-"))), target = join(root, "issue"); mkdirSync(target);
  let fixture, session;
  try {
    fixture = await hostFixture(root, target, false, 2);
    session = await openWindowsCleanupSession({ worktree: target, cwd: root, env: fixture.env });
    const release = await session.release(() => { throw new Error("Fixture audit write failed"); });
    assert.equal(release.state, "UNKNOWN");
    assert.match(release.reason, /audit write failed/u);
    assert.equal(release.outcomes.length, 1);
    assert.equal(release.outcomes[0].State, "EXITED");
    const remaining = fixture.ownedPids.find(pid => pid !== release.outcomes[0].Pid);
    assert.doesNotThrow(() => process.kill(remaining, 0));
    assert.doesNotThrow(() => process.kill(fixture.host.pid, 0));
  } finally { await session?.close(); await fixture?.dispose(); rmSync(root, { recursive: true, force: true }); }
});

test("real Windows helper recovery refuses an unknown child before terminating its parent", { skip: process.platform !== "win32", timeout: 60000 }, async () => {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "foreign-helper-child-"))), target = join(root, "issue"); mkdirSync(target);
  let fixture;
  try {
    fixture = await hostFixture(root, target, true);
    await assert.rejects(openWindowsCleanupSession({ worktree: target, cwd: root, env: fixture.env }), /Foreign child/u);
    assert.doesNotThrow(() => process.kill(fixture.ownedPid, 0));
    assert.doesNotThrow(() => process.kill(fixture.unrelatedPid, 0));
  } finally { await fixture?.dispose(); rmSync(root, { recursive: true, force: true }); }
});
