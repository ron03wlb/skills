import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync, rmdirSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { isAbsolute, relative, resolve, join, sep } from "node:path";
import { CODEX_HOST_RELEASE_CAPABILITY } from "../../../personal/run-issue-workflow/scripts/codex-host-bridge.mjs";
import { withCloseIssueLeases } from "./close-lease.mjs";
import { openWindowsCleanupSession } from "./windows-cleanup-session.mjs";

const ownsSettledTask = (snapshot, taskRef, worktree) => taskRef?.threadId && taskRef.hostId
  && snapshot?.thread?.id === taskRef.threadId && snapshot.thread.hostId === taskRef.hostId
  && ["idle", "notLoaded"].includes(snapshot.thread.status?.type) && snapshot.turns?.[0]?.status === "completed"
  && isAbsolute(snapshot.thread.cwd ?? "") && resolve(snapshot.thread.cwd) === resolve(worktree);

const PROCESS_FIELDS = ["CommandHash", "Cwd", "Executable", "Kind", "ParentPid", "Pid", "Started"];
const OUTCOME_FIELDS = ["Pid", "Reason", "Started", "State", "TerminationRequested"];
const samePath = (left, right) => typeof left === "string" && typeof right === "string"
  && resolve(left).toLowerCase() === resolve(right).toLowerCase();
const hasExactFields = (value, fields) => value && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(fields);
const sameProcess = (left, right) => left.Pid === right.Pid && left.ParentPid === right.ParentPid
  && left.Started === right.Started && samePath(left.Executable, right.Executable)
  && left.CommandHash === right.CommandHash && samePath(left.Cwd, right.Cwd) && left.Kind === right.Kind;
const sameOutcome = (left, right) => OUTCOME_FIELDS.every(field => left[field] === right[field]);

function readInterruptedRecovery({ recordPath, recoveryIdentity, leases, completion, taskRef, targetHead, failure }) {
  const regularFile = path => {
    const item = lstatSync(path, { throwIfNoEntry: false });
    if (!item?.isFile() || item.isSymbolicLink()) throw new Error("Interrupted recovery audit file is missing or unsafe");
    return JSON.parse(readFileSync(path, "utf8"));
  };
  const record = regularFile(recordPath);
  if (record.schema !== "exact-helper-recovery:v1" || record.state !== "ATTEMPTED"
    || record.recoveryIdentity !== recoveryIdentity || record.operationId !== leases.operationId
    || record.candidate !== completion.candidate || !isAbsolute(record.worktree ?? "") || !samePath(record.worktree, completion.worktree)
    || record.taskRef?.threadId !== taskRef.threadId || record.taskRef?.hostId !== taskRef.hostId
    || record.targetHead !== targetHead || record.failure?.code !== failure.code || record.failure?.message !== failure.message
    || !Array.isArray(record.processes) || !record.processes.length || record.processes.length > 64) {
    throw new Error("Interrupted recovery reservation does not match current close authority");
  }
  const identities = new Set();
  for (const process of record.processes) {
    if (!hasExactFields(process, PROCESS_FIELDS) || !Number.isInteger(process.Pid) || process.Pid < 1
      || !Number.isInteger(process.ParentPid) || process.ParentPid < 1 || !/^\d+$/u.test(process.Started)
      || !isAbsolute(process.Executable) || !/^[a-f0-9]{64}$/u.test(process.CommandHash)
      || !samePath(process.Cwd, completion.worktree) || !["node-repl", "computer-use", "template-picker", "codebase-memory"].includes(process.Kind)) {
      throw new Error("Interrupted recovery contains an invalid process identity");
    }
    const key = `${process.Pid}:${process.Started}`;
    if (identities.has(key)) throw new Error("Interrupted recovery contains duplicate process identities");
    identities.add(key);
  }
  const progressPath = `${recordPath}.progress`, resultPath = `${recordPath}.result`;
  const progressFile = lstatSync(progressPath, { throwIfNoEntry: false });
  if (!progressFile?.isFile() || progressFile.isSymbolicLink()) throw new Error("Interrupted recovery progress is missing or unsafe");
  const progressText = readFileSync(progressPath, "utf8");
  if (!progressText.endsWith("\n")) throw new Error("Interrupted recovery progress is incomplete");
  const progress = progressText.trimEnd().split("\n").map(line => JSON.parse(line));
  const exited = new Set();
  for (const outcome of progress) {
    const process = record.processes.find(item => item.Pid === outcome.Pid && item.Started === outcome.Started);
    const key = `${outcome.Pid}:${outcome.Started}`;
    if (!hasExactFields(outcome, OUTCOME_FIELDS) || outcome.State !== "EXITED" || outcome.Reason !== null
      || typeof outcome.TerminationRequested !== "boolean" || !process || exited.has(key)) {
      throw new Error("Interrupted recovery progress is not an exact completed effect");
    }
    exited.add(key);
  }
  const resultFile = lstatSync(resultPath, { throwIfNoEntry: false });
  const result = resultFile ? regularFile(resultPath) : { state: "UNKNOWN",
    reason: "Interrupted cleanup owner ended before publishing its durable result", outcomes: progress };
  if (result.state !== "UNKNOWN" || typeof result.reason !== "string" || !result.reason
    || !Array.isArray(result.outcomes) || result.outcomes.length !== progress.length
    || result.outcomes.some((outcome, index) => !sameOutcome(outcome, progress[index]))) {
    throw new Error("Interrupted recovery result does not match durable progress");
  }
  const remaining = record.processes.filter(process => !exited.has(`${process.Pid}:${process.Started}`));
  if (!remaining.length) throw new Error("Interrupted recovery has no reserved process left to resume");
  const resumePath = `${recordPath}.resume.json`;
  if (lstatSync(resumePath, { throwIfNoEntry: false }) || lstatSync(`${resumePath}.result`, { throwIfNoEntry: false })
    || lstatSync(`${resumePath}.progress`, { throwIfNoEntry: false })) throw new Error("Interrupted recovery resume was already attempted");
  return { record, progress, result, remaining, resumePath };
}

function assertResumedProof(proof, remaining) {
  if (proof?.state !== "READY" || !Array.isArray(proof.processes) || !proof.processes.length) {
    throw new Error("Interrupted recovery found no exact reserved helper");
  }
  const seen = new Set();
  for (const process of proof.processes) {
    const key = `${process.Pid}:${process.Started}`;
    if (!hasExactFields(process, PROCESS_FIELDS) || seen.has(key)
      || !remaining.some(expected => sameProcess(process, expected))) {
      throw new Error("Current helper set is not an exact subset of the interrupted reservation");
    }
    seen.add(key);
  }
}

// Read-only failure boundary, called by the existing close owner inside its two leases.
// Native desktop release remains unavailable; the separate owner entry below uses a bounded Windows adapter.
export async function assessPendingHostCleanup({ leases, completion, taskRef, readTask, failure }) {
  if (typeof failure?.code !== "string" || !failure.code || typeof failure.message !== "string" || !failure.message) {
    throw new TypeError("The exact failed cleanup observation is required");
  }
  leases.assertCurrent();
  const observations = [{ code: failure.code, message: failure.message }];
  const result = reasonCode => ({ state: "HOST_CLEANUP_BLOCKED", reasonCode,
    candidate: completion.candidate, worktree: completion.worktree, taskRef,
    directoryState: "UNPROVEN", capability: CODEX_HOST_RELEASE_CAPABILITY, observations });
  if (failure.code === "POLICY_REJECTED") return result("host_cleanup_policy_rejected");
  const git = (...args) => execFileSync("git", ["-C", completion.targetWorktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const ownsPendingDirectory = () => {
    leases.assertCurrent();
    if (leases.operationIdentity?.issueId !== completion.issueId || leases.operationIdentity?.specId !== completion.specId
      || leases.target !== completion.target || !isAbsolute(completion.worktree)
      || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(completion.candidate)) return false;
    const directory = lstatSync(completion.worktree, { throwIfNoEntry: false });
    if (!directory?.isDirectory() || directory.isSymbolicLink()
      || realpathSync.native(completion.worktree) !== resolve(completion.worktree)
      || readdirSync(completion.worktree).length !== 0) return false;
    if (git("symbolic-ref", "HEAD") !== `refs/heads/${completion.target}`
      || realpathSync.native(resolve(completion.targetWorktree, git("rev-parse", "--git-common-dir"))) !== realpathSync.native(leases.gitCommonDir)
      || git("status", "--porcelain=v1", "--untracked-files=all")) return false;
    const topic = `refs/heads/${completion.topic}`;
    git("check-ref-format", topic);
    if (git("rev-parse", "--verify", `${topic}^{commit}`) !== completion.candidate) return false;
    const path = resolve(completion.worktree).replaceAll("\\", "/");
    const registration = git("worktree", "list", "--porcelain", "-z").split("\0");
    if (registration.includes(`worktree ${path}`) || registration.includes(`branch ${topic}`)) return false;
    return spawnSync("git", ["-C", completion.targetWorktree, "merge-base", "--is-ancestor", completion.candidate, "HEAD"]).status === 0;
  };
  try {
    if (!ownsPendingDirectory()) return result("host_cleanup_ownership_unproven");
    const snapshot = await readTask(taskRef);
    leases.assertCurrent();
    if (!ownsSettledTask(snapshot, taskRef, completion.worktree)) return result("host_task_ownership_unproven");
    // Native reads can yield; recheck the exact directory, Git ownership and leases afterward.
    if (!ownsPendingDirectory()) return result("host_cleanup_ownership_unproven");
    return { ...result("host_release_unavailable"), directoryState: "EMPTY_UNREGISTERED" };
  } catch (error) {
    observations.push({ code: error.code ?? "HOST_CLEANUP_READ_FAILED", message: error.message });
    return result("host_cleanup_ownership_unproven");
  }
}

// This is a close-issue owner entry, not a coordinator-preacquired lease or a new task.
// Call from outside the idle Issue task. Fresh native reads are required, not cached snapshots.
export async function recoverPendingHostCleanup({ leaseInput, completion, taskRef, readTask, failure, verifyIntegration,
  openSession = openWindowsCleanupSession }) {
  if (typeof verifyIntegration !== "function" || typeof readTask !== "function") throw new TypeError("Fresh task and integration readers are required");
  const within = relative(resolve(completion.worktree), process.cwd());
  if (!within || within !== ".." && !within.startsWith(`..${sep}`) && !isAbsolute(within)) throw new Error("Recovery must run outside the Issue directory");
  return withCloseIssueLeases(leaseInput, async leases => {
    const input = { leases, completion, taskRef, readTask, failure };
    let assessment = await assessPendingHostCleanup(input);
    if (assessment.reasonCode !== "host_release_unavailable") return assessment;
    if (!["EBUSY", "EPERM", "EACCES"].includes(failure.code)) return assessment;
    const git = (...args) => execFileSync("git", ["-C", completion.targetWorktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const targetHead = git("rev-parse", "HEAD");
    const recoveryIdentity = createHash("sha256").update(JSON.stringify({ operationId: leases.operationId,
      candidate: completion.candidate, worktree: resolve(completion.worktree),
      taskRef: { threadId: taskRef.threadId, hostId: taskRef.hostId } })).digest("hex");
    const recordPath = join(leases.gitCommonDir, "workflow-host", `helper-recovery-${recoveryIdentity}.json`);
    const assertVerification = async () => {
      const proof = await verifyIntegration(leases);
      leases.assertCurrent();
      if (git("rev-parse", "HEAD") !== targetHead || proof?.state !== "PASS" || proof.candidate !== completion.candidate
        || proof.issueId !== completion.issueId || proof.targetHead !== targetHead) throw new Error("Current integration PASS is required before host recovery");
    };
    let session, auditProcesses = [], activeRecordPath = null;
    const observations = [...assessment.observations];
    const confirmAbsence = async () => {
      await assertVerification();
      const snapshot = await readTask(taskRef);
      leases.assertCurrent();
      if (!ownsSettledTask(snapshot, taskRef, completion.worktree)) throw new Error("Task ownership changed after directory removal");
      if (lstatSync(completion.worktree, { throwIfNoEntry: false })) throw new Error("Exact Issue directory reappeared during verification");
      return { state: "HOST_CLEANUP_RECOVERED", candidate: completion.candidate, worktree: completion.worktree, taskRef,
        directoryState: "ABSENT", targetHead, recoveryIdentity, recordPath: activeRecordPath,
        processes: auditProcesses, observations };
    };
    try {
      await assertVerification();
      // Verification/native reads may yield; reacquire every ownership fact before process discovery.
      assessment = await assessPendingHostCleanup(input);
      if (assessment.reasonCode !== "host_release_unavailable") return assessment;
      // The original lock may already have gone. An ordinary directory retry does
      // not consume or repeat a process batch, even after an earlier reservation.
      let removed = false;
      try { rmdirSync(completion.worktree); removed = true; }
      catch (error) {
        if (!["EBUSY", "EPERM", "EACCES"].includes(error.code)) throw error;
        observations.push({ code: error.code, message: error.message });
      }
      if (removed) return await confirmAbsence();
      const existingRecord = lstatSync(recordPath, { throwIfNoEntry: false });
      let interrupted, progressPath, resultPath;
      if (existingRecord) {
        try { interrupted = readInterruptedRecovery({ recordPath, recoveryIdentity, leases, completion, taskRef, targetHead, failure }); }
        catch (error) { return { ...assessment, reasonCode: "host_helper_recovery_failed",
          observations: [...observations, { code: "RECOVERY_ALREADY_ATTEMPTED", message: `${error.message}; retain ${recordPath}` }] }; }
        // This durable marker is the only automatic continuation authority. A
        // lost response cannot reserve a second resume or a newly discovered set.
        writeFileSync(interrupted.resumePath, JSON.stringify({ schema: "exact-helper-recovery-resume:v1", recoveryIdentity,
          state: "ATTEMPTED", operationId: leases.operationId, candidate: completion.candidate, worktree: completion.worktree,
          taskRef: { threadId: taskRef.threadId, hostId: taskRef.hostId }, targetHead, failure,
          priorProgress: interrupted.progress, remaining: interrupted.remaining, at: new Date().toISOString() }), { flag: "wx", flush: true });
        activeRecordPath = recordPath;
        auditProcesses = interrupted.record.processes;
        progressPath = `${interrupted.resumePath}.progress`;
        resultPath = `${interrupted.resumePath}.result`;
        observations.push({ code: "WINDOWS_HELPERS_UNKNOWN", message: JSON.stringify(interrupted.result) });
        session = await openSession({ worktree: completion.worktree, cwd: completion.targetWorktree,
          expectedProcesses: interrupted.remaining });
        assertResumedProof(session.proof, interrupted.remaining);
      } else {
        session = await openSession({ worktree: completion.worktree, cwd: completion.targetWorktree });
        auditProcesses = session.proof.processes;
        activeRecordPath = recordPath;
        progressPath = `${recordPath}.progress`;
        resultPath = `${recordPath}.result`;
      }
      await assertVerification();
      assessment = await assessPendingHostCleanup(input);
      if (assessment.reasonCode !== "host_release_unavailable") return assessment;
      mkdirSync(join(leases.gitCommonDir, "workflow-host"), { recursive: true });
      if (!interrupted) {
        // Reservation survives lost responses. Only its exact remaining members
        // can receive the one interrupted continuation above.
        writeFileSync(recordPath, JSON.stringify({ schema: "exact-helper-recovery:v1", recoveryIdentity, state: "ATTEMPTED",
          operationId: leases.operationId, candidate: completion.candidate, worktree: completion.worktree, taskRef,
          targetHead, failure, processes: session.proof.processes, at: new Date().toISOString() }), { flag: "wx", flush: true });
      }
      const release = await session.release(outcome => appendFileSync(progressPath, `${JSON.stringify(outcome)}\n`, { flush: true }), async () => {
        const snapshot = await readTask(taskRef);
        leases.assertCurrent();
        if (!ownsSettledTask(snapshot, taskRef, completion.worktree)) throw new Error("Task ownership changed before next helper");
        if (git("rev-parse", "HEAD") !== targetHead || git("symbolic-ref", "HEAD") !== `refs/heads/${completion.target}`
          || git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Target changed before next helper");
        const directory = lstatSync(completion.worktree, { throwIfNoEntry: false });
        if (!directory?.isDirectory() || directory.isSymbolicLink() || readdirSync(completion.worktree).length
          || realpathSync.native(completion.worktree) !== resolve(completion.worktree)) throw new Error("Directory ownership changed before next helper");
      });
      observations.push({ code: `WINDOWS_HELPERS_${release.state}`, message: JSON.stringify(release) });
      writeFileSync(resultPath, JSON.stringify(release), { flag: "wx", flush: true });
      if (release.state !== "RELEASED") return { ...assessment, reasonCode: "host_helper_recovery_failed", observations };
      // A new turn or new files after termination must not be mistaken for successful cleanup.
      await assertVerification();
      assessment = await assessPendingHostCleanup(input);
      if (assessment.reasonCode !== "host_release_unavailable") return { ...assessment, observations: [...observations, ...assessment.observations.slice(1)] };
      leases.assertCurrent();
      rmdirSync(completion.worktree); // Nonrecursive: a concurrent file creation prevents removal.
      if (lstatSync(completion.worktree, { throwIfNoEntry: false })) throw new Error("Exact Issue directory reappeared");
      return await confirmAbsence();
    } catch (error) {
      observations.push({ code: error.code ?? "HOST_HELPER_RECOVERY_FAILED", message: error.message });
      return { ...assessment, state: "HOST_CLEANUP_BLOCKED", directoryState: "UNPROVEN", reasonCode: "host_helper_recovery_failed", observations };
    } finally { await session?.close(); }
  });
}
