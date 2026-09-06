import { createCoordinator } from "./run-coordinator.mjs";
import { createRunAuthorityAdapters } from "./run-authority-adapters.mjs";
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
  tasks,
  leaf,
  environment,
  browser,
  controls,
  cleanup,
  now,
  sleep,
  authoritySources,
  workflowVersion,
  compatibleRecordedVersion,
}) {
  for (const method of ["readEvents", "readStatus", "previewCleanup", "applyCleanup"]) {
    requireMethod(store, method);
  }
  requireMethod(browser, "open");
  if (controls !== undefined) requireMethod(controls, "connect");
  requireMethod(cleanup, "listRuns");
  if (authoritySources === undefined) {
    throw new TypeError("Workflow runtime requires repository-owned authoritySources");
  }
  const authorityAdapters = createRunAuthorityAdapters({ sources: authoritySources, store, tasks });
  requireMethod(authorityAdapters.handoff, "read");

  let active = false;
  const actionStops = new Map();
  let cleanupInspected = false;
  return {
    async run(request = {}) {
      if (active) throw new Error("WORKFLOW_RUNTIME_ALREADY_ACTIVE");
      active = true;
      if (!["snapshot", "step"].includes(request.mode)) cleanupInspected = false;
      let panelState = { opened: false, closed: false, origin: null };
      let cleanupPreview = null;
      let cleanupResult = null;
      const inspectCleanup = async (selectedRequest, current, apply) => {
        if (cleanupInspected) return;
        const runs = await cleanup.listRuns({ request: selectedRequest });
        const cleanupAt = now();
        const protectedRunIds = current?.runIdentity?.runId ? [current.runIdentity.runId] : [];
        cleanupPreview = store.previewCleanup({ now: cleanupAt, runs, protectedRunIds });
        cleanupInspected = true;
        cleanupResult = apply && selectedRequest.cleanupPreview !== true
          ? store.applyCleanup({ now: cleanupAt, runs, protectedRunIds })
          : null;
      };
      const panel = {
        async open({ readStatus, appendEvent, rebuildStatus }) {
          const waiters = [];
          let controlFailure = null;
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
          const textControl = controls
            ? await controls.connect({
              readStatus,
              submitControl,
              onDisconnect(error) {
                controlFailure = error;
                for (const waiter of waiters.splice(0)) waiter.reject(error);
              },
            })
            : null;
          if (textControl) requireMethod(textControl, "close");
          let bridge;
          try {
            bridge = await startRunPanelBridge({ readStatus, submitControl });
            panelState = { opened: true, closed: false, origin: bridge.origin };
            await browser.open(bridge.panelUrl);
          } catch (error) {
            await bridge?.close();
            bridge = null;
            panelState = { ...panelState, closed: true };
            if (!textControl) throw error;
            panelState = { opened: false, closed: false, origin: null, mode: "text" };
          }
          return {
            async waitForControl(afterRevision) {
              if (controlFailure) throw controlFailure;
              const current = await readStatus();
              if (current.run.controlRevision > afterRevision) return;
              if (controlFailure) throw controlFailure;
              await new Promise((resolve, reject) => waiters.push({ afterRevision, resolve, reject }));
            },
            async close() {
              try {
                await bridge?.close();
              } finally {
                await textControl?.close();
                panelState = { ...panelState, closed: true };
              }
            },
          };
        },
      };
      const coordinator = createCoordinator({
        store,
        workflowVersion,
        compatibleRecordedVersion,
        actionStops,
        tracker: authorityAdapters.tracker,
        tasks,
        selector: authorityAdapters.selector,
        reconcile: authorityAdapters.reconcile,
        handoff: authorityAdapters.handoff,
        leaf,
        environment,
        panel: ["step", "snapshot"].includes(request.mode) ? undefined : panel,
        onSelected: ({ request: selectedRequest, current }) => inspectCleanup(selectedRequest, current, true),
        now,
        sleep,
      });
      try {
        const status = await coordinator.run(request);
        if (cleanupPreview === null) await inspectCleanup(request, null, false);
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
