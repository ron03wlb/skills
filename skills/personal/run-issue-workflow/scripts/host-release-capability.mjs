// The delivery host's helper-release capability. The close-issue host-cleanup owner reads this single
// constant instead of reaching into a host transport module, so the preserved close-issue scripts do
// not depend on the retired Codex-native host boundary.

// The delivery host exposes no helper-release operation or safe-cwd/respawn guarantee. Archive/handoff
// are not release APIs. Change this only with a proven host contract.
export const CODEX_HOST_RELEASE_CAPABILITY = Object.freeze({
  state: "UNAVAILABLE",
  operation: null,
  helperOwnership: "UNAVAILABLE",
  respawnProtection: "UNAVAILABLE",
  reason: "The exposed Codex desktop bridge has no supported exact-task helper release or safe-current-directory lifecycle.",
});
