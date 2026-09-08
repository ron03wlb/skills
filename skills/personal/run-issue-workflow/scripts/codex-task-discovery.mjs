import { createReadStream, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

export function delegatedInput(item) {
  if (item?.namespace !== "codex_app" || !["create_thread", "send_message_to_thread"].includes(item.name)) return null;
  const text = typeof item.output === "string" ? item.output : item.output?.truncated === false ? item.output.text : null;
  return text?.match(/^<codex_delegation>\n  <source_thread_id>[^\n]+<\/source_thread_id>\n  <input>([\s\S]*)<\/input>\n<\/codex_delegation>$/u)?.[1] ?? null;
}

// Discovery hints only: every result still requires current native task and Git read-back.
export async function discoverLocalCodexTasks({ prompt, since, sessionsDirectory = join(homedir(), ".codex", "sessions") }) {
  const dates = new Set([since, new Date().toISOString()].filter(Boolean).map((value) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("Task creation date is unavailable");
    return [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("/");
  }));
  const found = new Map();
  for (const date of dates) {
    const directory = join(sessionsDirectory, date);
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      if (!/^rollout-.*\.jsonl$/u.test(name)) continue;
      let metadata;
      const input = createReadStream(join(directory, name));
      const lines = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of lines) {
          let event;
          try { event = JSON.parse(line); } catch { continue; } // An active rollout may end in a partial line.
          if (event.type === "session_meta") metadata = event.payload;
          if (event.type !== "response_item" || event.payload?.type !== "function_call_output") continue;
          if (delegatedInput(event.payload) !== prompt) continue;
          if (typeof metadata?.id !== "string" || typeof metadata.cwd !== "string") continue;
          found.set(metadata.id, { threadId: metadata.id, hostId: "local", cwd: metadata.cwd });
          break;
        }
      } finally {
        lines.close();
        input.destroy();
      }
    }
  }
  return [...found.values()];
}
