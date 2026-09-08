import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { CODEX_HOST_RELEASE_CAPABILITY } from "../../../personal/run-issue-workflow/scripts/codex-host-bridge.mjs";

// Read-only failure boundary, called by the existing close owner inside its two leases.
// There is deliberately no process-release callback: the current host has no such contract.
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
    if (!taskRef?.threadId || !taskRef.hostId || snapshot?.thread?.id !== taskRef.threadId
      || snapshot.thread.hostId !== taskRef.hostId || snapshot.thread.status?.type !== "idle"
      || snapshot.turns?.[0]?.status !== "completed" || !isAbsolute(snapshot.thread.cwd ?? "")
      || resolve(snapshot.thread.cwd) !== resolve(completion.worktree)) return result("host_task_ownership_unproven");
    // Native reads can yield; recheck the exact directory, Git ownership and leases afterward.
    if (!ownsPendingDirectory()) return result("host_cleanup_ownership_unproven");
    return { ...result("host_release_unavailable"), directoryState: "EMPTY_UNREGISTERED" };
  } catch (error) {
    observations.push({ code: error.code ?? "HOST_CLEANUP_READ_FAILED", message: error.message });
    return result("host_cleanup_ownership_unproven");
  }
}
