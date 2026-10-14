import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillPath = '.agents/skills/code-review/SKILL.md';
const specPath = 'docs/specs/MobG_Trello_Tasks_Detailed.md';

export function prepareReview({ event, repository, cwd, outputPath, execute = execFileSync }) {
  const pr = event.pull_request;
  if (!pr || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('A valid repository and pull_request event are required.');
  }
  if (pr.head?.repo?.full_name !== repository ||
      !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(pr.author_association)) {
    throw new Error('Only PRs from trusted collaborators in this repository are supported.');
  }
  const base = pr.base?.sha;
  const head = pr.head?.sha;
  if (![base, head].every(sha => /^[0-9a-f]{40}$/.test(sha ?? ''))) {
    throw new Error('The PR must supply full base and head commit SHAs.');
  }
  const run = (command, args) => execute(command, args, {
    cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (run('git', ['rev-parse', 'HEAD']) !== head) {
    throw new Error('The checkout must be at the exact PR head commit.');
  }
  run('git', ['rev-parse', '--verify', `${base}^{commit}`]);
  const changedFiles = run('git', ['diff', '--name-only', `${base}...HEAD`]);
  if (!changedFiles) throw new Error('The PR diff is empty.');
  const commits = run('git', ['log', `${base}..HEAD`, '--format=%h %B']);
  const skill = readFileSync(join(cwd, skillPath), 'utf8');
  readFileSync(join(cwd, 'docs/agents/issue-tracker.md'), 'utf8');
  const template = readFileSync(join(cwd, '.github/codex/matt-review.md'), 'utf8');
  const spec = readFileSync(join(cwd, specPath), 'utf8');
  const availableCards = [...spec.matchAll(/^####\s+\[?((?:W[1-5]|R)-(?:Bar|Book|Pai)-\d{2})\]?(?:\s|$)/gm)]
    .map(match => match[1]);
  const scopeText = `${pr.title ?? ''}\n${pr.body ?? ''}\n${commits}`;
  const requestedCards = [...new Set([...scopeText.matchAll(/\b(?:W[1-5]|R)-(?:Bar|Book|Pai)-\d{2}\b/gi)]
    .map(match => match[0].toLowerCase()))];
  const cards = requestedCards.map(card => {
    const canonical = availableCards.find(known => known.toLowerCase() === card);
    if (!canonical) throw new Error(`Unknown Trello card: ${card}`);
    return canonical;
  });
  // Issues provide supplemental context; the shared Trello document is the primary spec.
  const explicit = [...(pr.body ?? '').matchAll(/\b(?:closes|fixes|resolves|spec\s+issue\s*:?)\s+#([1-9]\d*)\b/gi)];
  const references = explicit.length ? explicit : [...commits.matchAll(/(?:^|\s)#([1-9]\d*)\b/g)];
  const issueNumbers = [...new Set(references.map(match => match[1]))];
  if (issueNumbers.length > 5) {
    throw new Error('Reference at most five spec issues explicitly in the PR body.');
  }
  const issues = issueNumbers.map(number => {
    const result = run('gh', ['issue', 'view', number, '--repo', repository,
      '--json', 'number,title,body,comments,labels,url']);
    return JSON.parse(result);
  });
  const context = {
    repository, prNumber: pr.number, title: pr.title, body: pr.body ?? '',
    fixedPoint: base, head, changedFiles, commits, skillPath,
    skillSha256: createHash('sha256').update(skill).digest('hex'),
    spec: { path: specPath, sha256: createHash('sha256').update(spec).digest('hex'), cards },
    issues,
  };
  writeFileSync(outputPath, `${template}\n\n## Supplied review context (source data)\n\n` +
    JSON.stringify(context, null, 2) + '\n', 'utf8');
  return context;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.GITHUB_EVENT_PATH || !process.env.RUNNER_TEMP) {
      throw new Error('GITHUB_EVENT_PATH and RUNNER_TEMP are required.');
    }
    const context = prepareReview({
      event: JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')),
      repository: process.env.GITHUB_REPOSITORY,
      cwd: process.cwd(),
      outputPath: join(process.env.RUNNER_TEMP, 'matt-review-prompt.md'),
    });
    console.log(`Prepared PR #${context.prNumber}; Trello spec ${context.spec.sha256}; cards: ${context.spec.cards.join(', ') || 'not specified'}; skill ${context.skillSha256}.`);
  } catch {
    // gh error output can contain private issue data; inspect access/ref settings first.
    console.error('Review preparation failed. Verify trusted PR origin, full history, committed skill/Trello spec/docs, valid card IDs, and accessible issue references.');
    process.exitCode = 1;
  }
}
