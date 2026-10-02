#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { Batch } from './lib/runtime.mjs';
import { readJSON } from './lib/store.mjs';
import { assert } from './lib/contracts.mjs';
import { run } from './lib/platform.mjs';

export const usage = `gitlab-batch.mjs <doctor|plan|publish|start|resume|status|review|integrate|step|revise> [draft-id|issue-ref]
  --input <JSON-file>       Structured plan, handoff, acceptance or prerequisite evidence
  --confirm <SHA256>        Exact preview token, only after explicit human confirmation
  --session <Pi-session-id> --generation <integer>  Required execution owner
  --action <begin|accept|checkpoint|sync|regress|prerequisite>  Internal step
  --percent <number>        Current Pi context percent, unknown if omitted
  --inactive-evidence <text> Verified old-executor inactivity for crash takeover
  --cwd <repo>             Defaults to current directory
  --view <summary|full>    Default summary; full retains all evidence; previews always complete
Without --confirm, publish/start/revise/integrate/takeover return a read-only preview.
No push, MR, deployment, raw worktree fallback, or stale-lock timeout takeover.`;
export async function main(argv, { signal } = {}) {
  if (!argv.length || argv.includes('--help')) return { usage };
  const [command, ...rest] = argv, options = {}, positional = [];
  const allowed = new Set(['input', 'confirm', 'session', 'generation', 'action', 'percent', 'inactive-evidence', 'cwd', 'view']);
  for (let n = 0; n < rest.length; n++) {
    if (!rest[n].startsWith('--')) positional.push(rest[n]);
    else {
      const key = rest[n].slice(2); assert(allowed.has(key) && options[key] === undefined && rest[n + 1] !== undefined, 'Unknown/duplicate option or missing value');
      options[key] = rest[++n];
    }
  }
  assert(positional.length <= 1, 'Only one Issue reference/draft ID accepted');
  assert(options.view === undefined || ['summary', 'full'].includes(options.view), 'View must be summary or full');
  const runner = signal ? (file, args, options) => run(file, args, { ...options, signal }) : undefined;
  const batch = await Batch.open(options.cwd, { runner });
  const input = options.input ? await readJSON(path.resolve(options.input)) : undefined;
  if (options.input) assert(input, 'Input JSON file absent');
  const ref = positional[0];
  const execute = async () => { switch (command) {
    case 'doctor': return batch.doctor(input);
    case 'plan': return batch.plan(input);
    case 'publish': return batch.publish(ref, options.confirm);
    case 'revise': return batch.revise(ref, input, options.confirm);
    case 'start': return batch.start(ref, options.confirm);
    case 'resume': return batch.resume(ref, { session: options.session, confirm: options.confirm, inactiveEvidence: options['inactive-evidence'] });
    case 'status': return batch.status(ref);
    case 'review': return batch.review(ref);
    case 'integrate': return batch.integrate(ref, options.confirm);
    case 'step': return batch.step(ref, { action: options.action, input, confirm: options.confirm, session: options.session, generation: Number(options.generation), percent: options.percent === undefined ? undefined : Number(options.percent) });
    default: throw new Error(usage);
  } };
  return batch.view(await execute(), options.view ?? 'summary');
}
const invokedPath = process.argv[1] ? await realpath(path.resolve(process.argv[1])).catch(() => null) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const controller = new AbortController(); let interruptedCode = 1;
  const interrupt = () => { interruptedCode = 130; controller.abort(); };
  const terminate = () => { interruptedCode = 143; controller.abort(); };
  process.once('SIGINT', interrupt); process.once('SIGTERM', terminate);
  try {
    const result = await main(process.argv.slice(2), { signal: controller.signal });
    if (controller.signal.aborted) process.exitCode = interruptedCode;
    else console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ error: error.message })); process.exitCode = interruptedCode;
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
  }
}
