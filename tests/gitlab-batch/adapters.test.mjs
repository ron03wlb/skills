import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { Orca, GitLab, verifyBinding } from '../../skills/in-progress/gitlab-batch/scripts/lib/adapters.mjs';
import { fixture, MockTracker } from './helpers.mjs';
import { main } from '../../skills/in-progress/gitlab-batch/scripts/gitlab-batch.mjs';

test('mock CLI uses spawn argv arrays and stdin JSON, preserving Unicode/spaces', async t => {
  const f = await fixture(t), exe = path.join(f.root, 'mock CLI 中文.mjs');
  await writeFile(exe, `import fs from 'node:fs';const data=fs.readFileSync(0,'utf8');console.log(JSON.stringify({args:process.argv.slice(2),data:JSON.parse(data)}));`);
  const runner = async (_file, args, options) => {
    const { run } = await import('../../skills/in-progress/gitlab-batch/scripts/lib/platform.mjs');
    return run(process.execPath, [exe, ...args], options);
  };
  const gl = new GitLab('https://gitlab.example', 17, f.git.cwd, runner);
  const result = await gl.api('projects/17/issues', 'POST', { title: '中文 title with spaces' });
  assert.deepEqual(result.args, ['api', 'projects/17/issues', '--hostname', 'gitlab.example', '--method', 'POST', '--input', '-']);
  assert.equal(result.data.title, '中文 title with spaces');
});
test('selected Orca failure never falls through to another executable', async () => {
  const calls = [];
  const orca = new Orca('.', { env: { ORCA_CLI_COMMAND: 'selected-orca' }, runner: async (file, args) => { calls.push([file, args]); throw new Error('selected-orca ENOENT'); } });
  await assert.rejects(orca.preflight(), /selected-orca ENOENT/);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'selected-orca');
});
test('missing --comment capability fails closed before Orca mutation', async () => {
  const calls = [];
  const orca = new Orca('.', { env: { ORCA_CLI_COMMAND: 'mock' }, runner: async (file, args) => {
    calls.push({ file, args });
    if (args.includes('skills')) return Buffer.from(JSON.stringify({ markdown: 'worktree terminal guide' }));
    return Buffer.from('--base-branch --no-parent --setup');
  } });
  await assert.rejects(orca.preflight(), /required capability/);
  assert.ok(calls.every(c => c.args.includes('--help') || c.args.includes('skills')));
});
test('Orca version guide and help gates, identity mismatch and truncated list fail closed', async t => {
  const f = await fixture(t); let truncated = false;
  const orca = new Orca(f.git.cwd, { env: { ORCA_CLI_COMMAND: 'mock' }, runner: async (_file, args) => {
    if (args.includes('--help')) return Buffer.from('--base-branch --no-parent --setup --comment --command --worktree --timeout-ms --for --wait-submit --retry-request');
    if (args.includes('--version')) return Buffer.from('mock-1');
    if (args.includes('skills')) return Buffer.from(JSON.stringify({ markdown: 'version-matched worktree terminal guide' }));
    return Buffer.from(JSON.stringify({ ok: true, result: { truncated, worktrees: [{ id: 'r::x', repoId: 'r', path: f.git.cwd, branch: 'refs/heads/main', identity: { key: 'wt2:x', executionHostId: 'local' } }] } }));
  } });
  assert.equal((await orca.preflight()).version, 'mock-1');
  await assert.rejects(orca.verify({ id: 'r::x', repoId: 'r', path: f.git.cwd, branch: 'main', identity: 'different' }), /identity changed/);
  truncated = true; await assert.rejects(orca.list('r'), /incomplete/);
});
test('GitLab note and Issue ambiguous response is recovered only by exact markers', async t => {
  const f = await fixture(t), s = await f.batch.store.load('demo'), gl = f.tracker;
  let fail = true;
  const original = gl.api.bind(gl);
  gl.api = async (...args) => {
    const r = await original(...args);
    if (fail && args[1] === 'POST' && args[0].includes('/notes')) { fail = false; throw new Error('lost response after successful POST'); }
    return r;
  };
  await assert.rejects(gl.note(s, 101, 'same-note', 'Checkpoint', f.batch.save), /lost response/);
  await gl.note(s, 101, 'same-note', 'Checkpoint', f.batch.save);
  assert.equal(gl.notes.get(101).length, 1);
  await assert.rejects(gl.note(s, 101, 'same-note', 'Changed', f.batch.save), /content changed/);
});
test('origin/project drift, local plan tampering and unsupported command fail closed', async t => {
  const f = await fixture(t);
  await f.git.text(['remote', 'set-url', 'origin', 'https://gitlab.example/other/repo.git']);
  await assert.rejects(f.batch.status(f.ref), /origin/);
  await f.git.text(['remote', 'set-url', 'origin', 'https://gitlab.example/team/app.git']);
  const s = await f.batch.store.load('demo'); s.plan.title = 'Unconfirmed change'; await f.batch.save(s);
  await assert.rejects(f.batch.status(f.ref), /confirmed revision/);
  await assert.rejects(main(['push', '--cwd', f.git.cwd]), /No push/);
});
test('revision preview leaves state unchanged and matching confirmation republishes without duplication', async t => {
  const f = await fixture(t); await f.step('checkpoint', { summary: 'pause', completed: [], remaining: [], verification: [], blockers: [], decisions: [], next: [] });
  const next = structuredClone(f.p); next.revision = 2; next.issues[0].scope = 'Revised scope';
  const preview = await f.batch.revise('demo', next);
  assert.equal((await f.batch.store.load('demo')).plan.revision, 1);
  const publication = await f.batch.revise('demo', next, preview.confirm);
  await f.batch.publish('demo', publication.confirm); assert.equal(f.tracker.rows.size, 1);
  assert.equal((await f.batch.status(f.ref)).revision, 2);
});
