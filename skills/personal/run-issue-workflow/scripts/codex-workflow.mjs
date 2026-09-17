// The installed composition surface. The Codex-native host boundary (the desktop bridge, the task
// lifecycle adapter, and the loopback panel) was retired; the delivery host is the pi-workflow bundle at
// `workflows/deliver-tracker-spec/`, whose controller reaches the domain halves `scripts/pi-workflow-host.mjs`
// and `scripts/issue-lane.mjs` through the bundle-local authority entry. This module keeps only the
// compatibility decision that installed entries re-export, so an installed composition never re-implements
// recovery authority or reopens a retired host boundary.
export { assessRecoveryCompatibility } from "./delivery-authority.mjs";

export const supportsCompletedRunReentry = true;
