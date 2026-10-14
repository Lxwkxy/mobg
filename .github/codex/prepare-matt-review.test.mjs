import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, test } from 'node:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareReview } from './prepare-matt-review.mjs';

const root = mkdtempSync(join(tmpdir(), 'mobg-matt-review-'));
after(() => rmSync(root, { recursive: true, force: true }));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('init', '--initial-branch=main');
git('config', 'user.name', 'CI fixture');
git('config', 'user.email', 'ci@example.test');
for (const path of ['.agents/skills/code-review', '.github/codex', 'docs/agents', 'docs/specs']) {
  mkdirSync(join(root, path), { recursive: true });
}
for (const path of ['.agents/skills/code-review/SKILL.md', '.github/codex/matt-review.md', 'docs/agents/issue-tracker.md',
  'docs/specs/MobG_Trello_Tasks_Detailed.md']) {
  writeFileSync(join(root, path), readFileSync(path, 'utf8'));
}
writeFileSync(join(root, 'feature.txt'), 'before\n');
git('add', '.');
git('commit', '-m', 'Base fixture');
const base = git('rev-parse', 'HEAD');
writeFileSync(join(root, 'feature.txt'), 'after\n');
git('add', 'feature.txt');
git('commit', '-m', 'Implement the feature');
const head = git('rev-parse', 'HEAD');

const makeEvent = (body = '') => ({ pull_request: {
  number: 12, title: 'Feature PR', body, author_association: 'COLLABORATOR',
  base: { sha: base }, head: { sha: head, repo: { full_name: 'example/mobg' } },
} });
const prepare = (event, outputName, execute) => prepareReview({
  event, cwd: root, repository: 'example/mobg', outputPath: join(root, outputName), execute,
});

test('real Git history produces the exact diff, original skill hash and explicit invocation', () => {
  const context = prepare(makeEvent(), 'no-spec.md');
  assert.equal(context.fixedPoint, base);
  assert.equal(context.head, head);
  assert.equal(context.changedFiles, 'feature.txt');
  assert.deepEqual(context.issues, []);
  assert.match(context.skillSha256, /^[a-f0-9]{64}$/);
  assert.equal(context.spec.path, 'docs/specs/MobG_Trello_Tasks_Detailed.md');
  assert.match(context.spec.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(context.spec.cards, []);
  const prompt = readFileSync(join(root, 'no-spec.md'), 'utf8');
  assert.match(prompt, /Use \$code-review/);
  assert.match(prompt, /separate parallel sub-agents/);
  assert.match(prompt, /Spec review skipped/);
});

test('Trello-only PRs use real plan card IDs without requiring a GitHub issue', () => {
  const context = prepare(makeEvent('Trello cards: W2-Pai-01, w2-pai-02, W2-Pai-01'), 'trello.md');
  assert.deepEqual(context.spec.cards, ['W2-Pai-01', 'W2-Pai-02']);
  assert.deepEqual(context.issues, []);
  const prompt = readFileSync(join(root, 'trello.md'), 'utf8');
  assert.match(prompt, /explicitly supplied, primary/);
  assert.match(prompt, /Work scheduled for other weeks or owners/);
});

test('unknown Trello card references fail before generating an AI prompt', () => {
  assert.throws(() => prepare(makeEvent('Trello cards: W2-Pai-99'), 'unknown-card.md'), /Unknown Trello card/);
  assert.equal(existsSync(join(root, 'unknown-card.md')), false);
});

test('issue context is fetched through gh arguments; PR text is never a shell command', () => {
  const calls = [];
  const execute = (command, args, options) => {
    if (command !== 'gh') return execFileSync(command, args, options);
    calls.push(args);
    return JSON.stringify({ number: 42, title: 'Feature spec', body: 'Expected feature behavior', comments: [], labels: [] });
  };
  const body = 'Spec issue: #42\nCloses #42\n$(echo injected) `echo injected`';
  const context = prepare(makeEvent(body), 'with-spec.md', execute);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ['issue', 'view', '42', '--repo', 'example/mobg', '--json', 'number,title,body,comments,labels,url']);
  assert.equal(context.issues[0].number, 42);
  assert.equal(context.body, body);
});

test('forks and untrusted authors are rejected before commands run', () => {
  const forbidden = () => assert.fail('No command should execute');
  const fork = makeEvent();
  fork.pull_request.head.repo.full_name = 'outsider/mobg';
  assert.throws(() => prepare(fork, 'fork.md', forbidden), /trusted collaborators/);
  const outsider = makeEvent();
  outsider.pull_request.author_association = 'CONTRIBUTOR';
  assert.throws(() => prepare(outsider, 'outsider.md', forbidden), /trusted collaborators/);
  assert.equal(existsSync(join(root, 'fork.md')), false);
});

test('wrong checkout, invalid SHA, missing base and empty diff cannot start a review', () => {
  const mismatch = makeEvent();
  mismatch.pull_request.head.sha = base;
  assert.throws(() => prepare(mismatch, 'mismatch.md'), /exact PR head/);
  const invalid = makeEvent();
  invalid.pull_request.base.sha = '--bad-ref';
  assert.throws(() => prepare(invalid, 'invalid.md'), /full base and head/);
  const missing = makeEvent();
  missing.pull_request.base.sha = '0'.repeat(40);
  assert.throws(() => prepare(missing, 'missing.md'));
  const empty = makeEvent();
  empty.pull_request.base.sha = head;
  assert.throws(() => prepare(empty, 'empty.md'), /diff is empty/);
});

test('an inaccessible referenced issue fails preparation instead of hiding missing requirements', () => {
  const execute = (command, args, options) => {
    if (command === 'gh') throw new Error('Issue inaccessible');
    return execFileSync(command, args, options);
  };
  assert.throws(() => prepare(makeEvent('Closes #42'), 'inaccessible.md', execute), /Issue inaccessible/);
  assert.equal(existsSync(join(root, 'inaccessible.md')), false);
});
