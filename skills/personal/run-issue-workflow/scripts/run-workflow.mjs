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
}) {
  for (const method of ["readEvents", "readStatus", "previewCleanup", "applyCleanup"]) {
    requireMethod(store, method);
  }
  requireMethod(browser, "open");
  requireMethod(cleanup, "listRuns");

  let active = false;
  return {
    async run(request = {}) {
      if (active) throw new Error("WORKFLOW_RUNTIME_ALREADY_ACTIVE");
      active = true;
      let panelState = { opened: false, closed: false, origin: null };
      let cleanupPreview = null;
      let cleanupResult = null;
      const inspectCleanup = async (selectedRequest, apply) => {
        const runs = await cleanup.listRuns({ request: selectedRequest });
        const cleanupAt = now();
        cleanupPreview = store.previewCleanup({ now: cleanupAt, runs });
        cleanupResult = apply && selectedRequest.cleanupPreview !== true
          ? store.applyCleanup({ now: cleanupAt, runs })
          : null;
      };
      const panel = {
        async open({ readStatus, appendEvent, rebuildStatus }) {
          const waiters = [];
          const applyControl = createRunPanelControl({
            readStatus,
            appendEvent,
            rebuildStatus,
            now,
          });
          const submitControl = async (command) => {
            const result = await applyControl(command);
            if (result.changed) {
              for (const waiter of waiters.splice(0)) {
                if (result.revision > waiter.afterRevision) waiter.resolve();
                else waiters.push(waiter);
              }
            }
            return result;
          };
          const bridge = await startRunPanelBridge({ readStatus, submitControl });
          panelState = { opened: true, closed: false, origin: bridge.origin };
          try {
            await browser.open(bridge.panelUrl);
          } catch (error) {
            await bridge.close();
            panelState = { ...panelState, closed: true };
            throw error;
          }
          return {
            async waitForControl(afterRevision) {
              const current = await readStatus();
              if (current.run.controlRevision > afterRevision) return;
              await new Promise((resolve) => waiters.push({ afterRevision, resolve }));
            },
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
        onSelected: (selectedRequest) => inspectCleanup(selectedRequest, true),
        now,
        sleep,
      });
      try {
        const status = await coordinator.run(request);
        if (cleanupPreview === null) await inspectCleanup(request, false);
        const journal = status.run.runId ? store.readEvents(status.run.runId) : [];
        return {
          status,
          journal,
          cleanupPreview,
          cleanupResult,
          panel: { ...panelState },
        };
      } finally {
        active = false;
      }
    },
  };
}
