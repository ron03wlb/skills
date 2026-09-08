import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGitLabProducer, configurationFromRemote, conflict, validateConfiguration } from "./gitlab-producer-transport.mjs";
import { createGitLabProducerAdapters } from "./gitlab-producer-adapters.mjs";

export async function configureGitLabProducer({ repository, configuration, transport }) {
  repository = realpathSync.native(repository);
  const path = join(repository, "docs/agents/gitlab-producer.json");
  const candidate = validateConfiguration(configuration ?? (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : configurationFromRemote(repository)));
  const connected = await connectGitLabProducer({ repository, configuration: candidate, transport });
  if (existsSync(path)) {
    const existing = validateConfiguration(JSON.parse(readFileSync(path, "utf8")));
    if (existing.baseUrl !== candidate.baseUrl || existing.project !== candidate.project) throw conflict("Existing binding differs; review it explicitly before replacement");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
  }
  return { state: "CONFIGURED", path, repositoryId: connected.repositoryId, publicationMode: "READ_WRITE_READBACK" };
}

export async function inspectGitLabProducer({ repository, transport }) {
  const path = join(repository, "docs/agents/gitlab-producer.json");
  if (!existsSync(path)) return { state: "MISSING", owningSource: path, nextAction: "Explicitly run gitlab-producer-entry.mjs configure for this repository." };
  const configuration = JSON.parse(readFileSync(path, "utf8"));
  const connected = await connectGitLabProducer({ repository, configuration, transport });
  return { state: "PRESENT", owningSource: fileURLToPath(new URL("./gitlab-producer-adapters.mjs", import.meta.url)),
    configuration: path, repositoryId: connected.repositoryId, projectId: connected.projectId, publicationMode: "READ_WRITE_READBACK",
    support: { producer: "to-spec@v2", modes: ["primary", "revision"], planning: "tracker-only", automaticRunHost: false } };
}

export async function invokeGitLabProducer({ repository, input, transport }) {
  const configuration = JSON.parse(readFileSync(join(repository, "docs/agents/gitlab-producer.json"), "utf8"));
  const allowed = {
    read: ["tracker", "read"], reserve: ["tracker", "reserve"], baseline: ["planning", "readBaseline"], seal: ["planningSeal", "read"],
    identity: ["checkpoint", "identity"], "checkpoint-read": ["checkpoint", "read"], "checkpoint-create": ["checkpoint", "create"],
    "checkpoint-advance": ["checkpoint", "advance"], publish: ["tracker", "publish"], "mutation-read": ["tracker", "readMutation"],
    "handoff-read": ["handoff", "read"], "handoff-append": ["handoff", "append"],
  };
  if (!Object.hasOwn(allowed, input?.action)) throw conflict("Unknown producer action");
  const adapter = await createGitLabProducerAdapters({ repository, configuration, transport,
    specId: input.specId, target: input.target, publication: input.publication });
  const [group, method] = allowed[input.action];
  return adapter[group][method](input.request);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, repository] = process.argv.slice(2);
  try {
    if (!repository) throw conflict("Usage: gitlab-producer-entry.mjs <configure|inspect|invoke> <repository>; invoke reads one JSON request from stdin.");
    const result = action === "configure" ? await configureGitLabProducer({ repository })
      : action === "inspect" ? await inspectGitLabProducer({ repository })
        : action === "invoke" ? await invokeGitLabProducer({ repository, input: JSON.parse(readFileSync(0, "utf8")) })
          : (() => { throw conflict("Unknown producer entry action"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "GITLAB_PRODUCER_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
