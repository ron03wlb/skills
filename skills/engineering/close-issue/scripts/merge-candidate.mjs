import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

// The close owner calls this while holding its own two leases. No tracker receipt is written.
export function mergeCandidate({ leases, targetWorktree, candidate }) {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(candidate)) throw new TypeError("Exact candidate commit required");
  const git = (...args) => execFileSync("git", ["-C", targetWorktree, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const ancestor = (left, right) => {
    const result = spawnSync("git", ["-C", targetWorktree, "merge-base", "--is-ancestor", left, right]);
    if (![0, 1].includes(result.status)) throw new Error("Git ancestry is unreadable");
    return result.status === 0;
  };
  const assertTarget = () => {
    leases.assertCurrent();
    if (git("symbolic-ref", "HEAD") !== `refs/heads/${leases.target}`
      || realpathSync(resolve(targetWorktree, git("rev-parse", "--git-common-dir"))) !== realpathSync(leases.gitCommonDir)) throw new Error("Target checkout differs from the close owner's lease");
  };
  assertTarget();
  const before = git("rev-parse", "HEAD");
  if (ancestor(candidate, before)) return { state: "ALREADY_MERGED", candidate, targetHead: before };
  if (git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Target is dirty; preserve it");
  try { git("merge", ...(ancestor(before, candidate) ? ["--ff-only"] : ["--no-ff", "--no-edit"]), candidate); }
  catch (error) {
    assertTarget();
    if (ancestor(candidate, git("rev-parse", "HEAD"))) {
      // The mutation completed despite a failed response; read-back determines progress.
    } else if (existsSync(resolve(targetWorktree, git("rev-parse", "--git-path", "MERGE_HEAD")))) {
      if (git("rev-parse", "HEAD") !== before) throw new Error("Target moved unexpectedly during failed merge; preserve exact Git state");
      const conflictedPaths = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
      git("merge", "--abort");
      assertTarget();
      if (git("rev-parse", "HEAD") !== before || git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Merge abort did not restore the target");
      return { state: "CONFLICT", candidate, targetHead: before, targetRestored: true, conflictedPaths };
    } else throw error;
  }
  assertTarget();
  if (!ancestor(candidate, git("rev-parse", "HEAD")) || git("status", "--porcelain=v1", "--untracked-files=all")) throw new Error("Post-merge state requires preservation");
  return { state: "MERGED", candidate, targetHead: git("rev-parse", "HEAD") };
}
