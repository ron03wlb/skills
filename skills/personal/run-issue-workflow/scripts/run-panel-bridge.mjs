import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { planControl, STATUS_SCHEMA } from "./run-core.mjs";

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

const send = (response, statusCode, contentType, body) => {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": contentType,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
};

const sendJson = (response, statusCode, value) => {
  send(response, statusCode, "application/json; charset=utf-8", `${JSON.stringify(value)}\n`);
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
  return (command) => {
    const pending = tail.then(async () => {
      const current = requireStatus(await readStatus());
      const decision = planControl(current, command, now());
      let projected = current;
      if (decision.changed) {
        await appendEvent(decision.event);
        projected = requireStatus(await rebuildStatus());
      }
      return {
        accepted: decision.accepted,
        changed: decision.changed,
        revision: decision.revision,
        ...(decision.reason ? { reason: decision.reason } : {}),
        status: projected,
      };
    });
    tail = pending.catch(() => {});
    return pending;
  };
}

export async function startRunPanelBridge({ readStatus, submitControl, renderPanel, port = 0 }) {
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
        sendJson(response, 200, requireStatus(await readStatus()));
        return;
      }
      if (request.method === "POST" && controlRoutes.has(url.pathname)) {
        if (!await requestBodyIsEmpty(request)) {
          sendJson(response, 413, { error: "control_body_not_allowed" });
          return;
        }
        const result = await submitControl(controlRoutes.get(url.pathname));
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
