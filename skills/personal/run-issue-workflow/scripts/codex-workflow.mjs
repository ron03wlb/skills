// The installed composition surface. The Codex-native host boundary (the desktop bridge, the task
// lifecycle adapter, and the loopback panel) was retired; the delivery host is the pi-workflow bundle
// whose launch spec is `deliver-tracker-spec.json` at the package root and whose stage controller lives in
// `workflows/deliver-tracker-spec/`. The launch spec sits at the root because pi-workflow refuses a
// launched bundle whose module graph escapes the directory holding its spec, and that controller reaches
// the domain halves `scripts/pi-workflow-host.mjs` and `scripts/issue-lane.mjs` through the bundle-local
// authority entry. This module keeps only the compatibility decision that installed entries re-export,
// so an installed composition never re-implements recovery authority or reopens a retired host boundary.
export { assessRecoveryCompatibility } from "./delivery-authority.mjs";

export const supportsCompletedRunReentry = true;
