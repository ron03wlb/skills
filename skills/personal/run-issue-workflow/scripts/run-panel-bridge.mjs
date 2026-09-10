import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { planControl, STATUS_SCHEMA } from "./run-core.mjs";
import { renderRunPanel, statusDigest } from "./run-panel.mjs";

const LOOPBACK_HOST = "127.0.0.1";
const controlRoutes = new Map([
  ["/api/control/pause", "PAUSE"],
  ["/api/control/resume", "RESUME"],
  ["/api/control/stop", "STOP"],
]);

const requireFunction = (value, label) => {
  if (typeof value !== "function") throw new TypeError(`${label} must be a function`);
};

const requireStatus = (value) => {
  if (value?.schema !== STATUS_SCHEMA || !value.run) {
    throw new TypeError(`Panel status must use ${STATUS_SCHEMA}`);
  }
  return value;
};

const sameToken = (candidate, expected) => {
  if (typeof candidate !== "string") return false;
  const left = Buffer.from(candidate, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};

const bearerToken = (request) => {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
};

const controlIdentity = (request) => {
  const id = request.headers["x-workflow-control-id"];
  const encodedRevision = request.headers["x-workflow-control-revision"];
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(id)
    || typeof encodedRevision !== "string" || !/^[1-9][0-9]*$/u.test(encodedRevision)) return null;
  const revision = Number(encodedRevision);
  return Number.isSafeInteger(revision) ? { id, revision } : null;
};

const send = (response, statusCode, contentType, body, headers = {}) => {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(body);
};

const sendJson = (response, statusCode, value) => {
  send(response, statusCode, "application/json; charset=utf-8", `${JSON.stringify(value)}\n`);
};

const sendStatus = (request, response, status) => {
  const etag = `"${statusDigest(status)}"`;
  if (request.headers["if-none-match"] === etag) {
    send(response, 304, "application/json; charset=utf-8", "", { etag });
  } else {
    send(response, 200, "application/json; charset=utf-8", `${JSON.stringify(status)}\n`, { etag });
  }
};

const requestBodyIsEmpty = (request) => new Promise((resolve) => {
  const declaredLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 0) {
    request.resume();
    resolve(false);
    return;
  }

  let settled = false;
  const finish = (empty) => {
    if (settled) return;
    settled = true;
    request.off("data", onData);
    request.off("end", onEnd);
    request.off("aborted", onAborted);
    resolve(empty);
  };
  const onData = (chunk) => {
    if (chunk.length > 0) {
      request.resume();
      finish(false);
    }
  };
  const onEnd = () => finish(true);
  const onAborted = () => finish(false);
  request.on("data", onData);
  request.on("end", onEnd);
  request.on("aborted", onAborted);
});

export function createRunPanelControl({ readStatus, appendEvent, rebuildStatus, now = () => new Date().toISOString() }) {
  requireFunction(readStatus, "readStatus");
  requireFunction(appendEvent, "appendEvent");
  requireFunction(rebuildStatus, "rebuildStatus");
  requireFunction(now, "now");

  let tail = Promise.resolve();
  return (command, controlIdentity = {}) => {
    const pending = tail.then(async () => {
      const current = requireStatus(await readStatus());
      const hasIdentity = controlIdentity.id !== undefined || controlIdentity.revision !== undefined;
      if (hasIdentity && (typeof controlIdentity.id !== "string" || !controlIdentity.id
        || !Number.isInteger(controlIdentity.revision) || controlIdentity.revision < 1)) {
        throw new TypeError("Text control identity requires its request ID and expected revision");
      }
      const recordedRequestRevision = current.run.controlRequestRevision ?? current.run.controlRevision;
      const recordedRequestCommand = current.run.controlRequestCommand ?? current.run.controlCommand;
      if (hasIdentity && controlIdentity.revision === recordedRequestRevision
        && controlIdentity.id === current.run.controlRequestId && command === recordedRequestCommand) {
        return { accepted: true, changed: false, revision: current.run.controlRevision, reconciled: true, status: current };
      }
      if (hasIdentity && controlIdentity.revision !== current.run.controlRevision + 1) {
        return { accepted: false, changed: false, revision: current.run.controlRevision,
          reason: "stale_control_revision", status: current };
      }
      const decision = planControl(current, command, now(), controlIdentity.id);
      let projected = current;
      if (decision.event) {
        await appendEvent(decision.event);
        projected = requireStatus(await rebuildStatus());
      }
      return {
        accepted: decision.accepted,
        changed: decision.changed,
        revision: decision.revision,
        ...(decision.reconciled ? { reconciled: true } : {}),
        ...(decision.reason ? { reason: decision.reason } : {}),
        status: projected,
      };
    });
    tail = pending.catch(() => {});
    return pending;
  };
}

export async function startRunPanelBridge({ readStatus, submitControl, renderPanel = renderRunPanel, port = 0 }) {
  requireFunction(readStatus, "readStatus");
  requireFunction(submitControl, "submitControl");
  requireFunction(renderPanel, "renderPanel");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("port must be an integer from 0 to 65535");
  }

  const token = randomBytes(32).toString("base64url");
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`);
      const authorized = url.pathname === "/"
        ? sameToken(url.searchParams.get("token") ?? bearerToken(request), token)
        : sameToken(bearerToken(request), token);
      if (!authorized) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/") {
        const current = requireStatus(await readStatus());
        send(response, 200, "text/html; charset=utf-8", renderPanel(current));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/status") {
        sendStatus(request, response, requireStatus(await readStatus()));
        return;
      }
      if (request.method === "POST" && controlRoutes.has(url.pathname)) {
        if (!await requestBodyIsEmpty(request)) {
          sendJson(response, 413, { error: "control_body_not_allowed" });
          return;
        }
        const identity = controlIdentity(request);
        if (!identity) {
          sendJson(response, 400, { error: "control_identity_required" });
          return;
        }
        const result = await submitControl(controlRoutes.get(url.pathname), identity);
        sendJson(response, result.accepted ? 200 : 409, result);
        return;
      }
      sendJson(response, 404, { error: "not_found" });
    } catch {
      if (!response.headersSent) sendJson(response, 503, { error: "panel_unavailable" });
      else response.end();
    }
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to resolve loopback panel address");
  }
  const origin = `http://${LOOPBACK_HOST}:${address.port}`;
  let closing;

  return {
    address,
    origin,
    panelUrl: `${origin}/?token=${encodeURIComponent(token)}`,
    token,
    close() {
      if (!closing) {
        closing = new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
      return closing;
    },
  };
}
