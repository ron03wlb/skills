import { createCoordinator } from "./run-coordinator.mjs";
import {
  createRunPanelControl,
  startRunPanelBridge,
} from "./run-panel-bridge.mjs";

const requireMethod = (owner, name) => {
  if (typeof owner?.[name] !== "function") {
    throw new TypeError(`Workflow runtime adapter requires ${name}()`);
  }
};

export function createWorkflowRuntime({
  store,
  tracker,
  tasks,
  selector,
  reconcile,
  leaf,
  environment,
  browser,
  cleanup,
  now,
  sleep,
  startBridge = startRunPanelBridge,
}) {
  for (const method of ["readEvents", "readStatus", "previewCleanup"]) requireMethod(store, method);
  requireMethod(browser, "open");
  requireMethod(cleanup, "listRuns");
  if (typeof startBridge !== "function") throw new TypeError("Workflow runtime requires startBridge()");

  let active = false;
  return {
    async run(request = {}) {
      if (active) throw new Error("WORKFLOW_RUNTIME_ALREADY_ACTIVE");
      active = true;
      let panelState = { opened: false, closed: false, origin: null };
      const panel = {
        async open({ readStatus, appendEvent, rebuildStatus }) {
          const submitControl = createRunPanelControl({
            readStatus,
            appendEvent,
            rebuildStatus,
            now,
          });
          const bridge = await startBridge({ readStatus, submitControl });
          panelState = { opened: true, closed: false, origin: bridge.origin };
          try {
            await browser.open(bridge.panelUrl);
          } catch (error) {
            await bridge.close();
            panelState = { ...panelState, closed: true };
            throw error;
          }
          return {
            async close() {
              await bridge.close();
              panelState = { ...panelState, closed: true };
            },
          };
        },
      };
      const coordinator = createCoordinator({
        store,
        tracker,
        tasks,
        selector,
        reconcile,
        leaf,
        environment,
        panel,
        now,
        sleep,
      });
      try {
        const status = await coordinator.run(request);
        const journal = status.run.runId ? store.readEvents(status.run.runId) : [];
        const runs = await cleanup.listRuns({ status, journal });
        const cleanupPreview = store.previewCleanup({ now: now(), runs });
        return {
          status,
          journal,
          cleanupPreview,
          panel: { ...panelState },
        };
      } finally {
        active = false;
      }
    },
  };
}
