import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGitHubProducer, configurationFromRemote, conflict, validateConfiguration } from "./github-producer-transport.mjs";
import { createGitHubProducerAdapters } from "./github-producer-adapters.mjs";

const readConfiguration = path => {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch { throw conflict("GitHub producer configuration is unreadable"); }
};

export async function configureGitHubProducer({ repository, configuration, transport }) {
  repository = realpathSync.native(repository);
  const path = join(repository, "docs/agents/github-producer.json");
  const candidate = validateConfiguration(configuration ?? (existsSync(path) ? readConfiguration(path) : configurationFromRemote(repository)));
  const connected = await connectGitHubProducer({ repository, configuration: candidate, transport });
  if (existsSync(path)) {
    const existing = validateConfiguration(readConfiguration(path));
    if (existing.repository !== candidate.repository) throw conflict("Existing binding differs; review it explicitly before replacement");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
  }
  return { state: "CONFIGURED", path, repositoryId: connected.repositoryId, publicationMode: "READ_WRITE_READBACK" };
}

export async function inspectGitHubProducer({ repository, transport }) {
  const path = join(repository, "docs/agents/github-producer.json");
  if (!existsSync(path)) return { state: "MISSING", owningSource: path, nextAction: "Explicitly run github-producer-entry.mjs configure for this repository." };
  const configuration = readConfiguration(path);
  const connected = await connectGitHubProducer({ repository, configuration, transport });
  return { state: "PRESENT", owningSource: fileURLToPath(new URL("./github-producer-adapters.mjs", import.meta.url)),
    configuration: path, repositoryId: connected.repositoryId, repositoryName: connected.repositoryName, publicationMode: "READ_WRITE_READBACK",
    support: { producer: "to-spec@v2", modes: ["primary", "revision"], planning: "registered-documents-and-tracker-only", automaticRunHost: false } };
}

export async function invokeGitHubProducer({ repository, input, transport, execute, capability }) {
  const configuration = readConfiguration(join(repository, "docs/agents/github-producer.json"));
  const allowed = {
    read: ["tracker", "read"], reserve: ["tracker", "reserve"], baseline: ["planning", "readBaseline"], seal: ["planningSeal", "read"],
    "lane-register": ["planning", "registerLane"], "lane-read": ["planning", "readLane"], "seal-write": ["planningSeal", "write"],
    identity: ["checkpoint", "identity"], "checkpoint-read": ["checkpoint", "read"], "checkpoint-create": ["checkpoint", "create"],
    "checkpoint-advance": ["checkpoint", "advance"], publish: ["tracker", "publish"], "mutation-read": ["tracker", "readMutation"],
    "handoff-read": ["handoff", "read"], "handoff-append": ["handoff", "append"],
  };
  if (!Object.hasOwn(allowed, input?.action)) throw conflict("Unknown producer action");
  const adapter = await createGitHubProducerAdapters({ repository, configuration, transport, execute, capability,
    specId: input.specId, target: input.target, publication: input.publication });
  const [group, method] = allowed[input.action];
  return adapter[group][method](input.request);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  const [action, repository] = process.argv.slice(2);
  try {
    if (!repository) throw conflict("Usage: github-producer-entry.mjs <configure|inspect|invoke> <repository>; invoke reads one JSON request from stdin.");
    const result = action === "configure" ? await configureGitHubProducer({ repository })
      : action === "inspect" ? await inspectGitHubProducer({ repository })
        : action === "invoke" ? await invokeGitHubProducer({ repository, input: JSON.parse(readFileSync(0, "utf8")) })
          : (() => { throw conflict("Unknown producer entry action"); })();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ state: "BLOCKED", code: error.code ?? "GITHUB_PRODUCER_ERROR", reason: error.message })}\n`);
    process.exitCode = 1;
  }
}
