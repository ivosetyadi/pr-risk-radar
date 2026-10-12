// PR Risk Radar — zero-dependency GitHub Action (Node 20).
// Scores a pull request 0–100 across several risk dimensions (risky SQL,
// leaked secrets, dependency & infra changes, diff size) and posts a single
// verdict comment. No npm install required.

const fs = require('fs');
const SIGNALS = require('./signals.js');

const log = (m) => process.stdout.write(m + '\n');
const setOutput = (name, val) => {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${name}<<__EOF__\n${val}\n__EOF__\n`);
};

// ---- Patch parsing ------------------------------------------------------------
function addedLines(patch) {
  if (!patch) return [];
  return patch
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

// ---- Scoring (pure, testable) -------------------------------------------------
function band(score) {
  if (score >= 80) return { name: 'Critical', emoji: '🔴' };
  if (score >= 50) return { name: 'High', emoji: '🟠' };
  if (score >= 20) return { name: 'Medium', emoji: '🟡' };
  return { name: 'Low', emoji: '🟢' };
}

function scorePr(files, signals = SIGNALS) {
  const stats = {
    fileCount: files.length,
    changes: files.reduce((s, f) => s + (f.changes || 0), 0),
  };
  const hits = [];
  let score = 0;

  for (const sig of signals) {
    if (sig.scope === 'global') {
      if (sig.detect(stats)) {
        score += sig.weight;
        hits.push({ id: sig.id, label: sig.label, detail: sig.detail, points: sig.weight, where: `${stats.fileCount} files, ${stats.changes} lines` });
      }
    } else {
      let matched = 0;
      const where = [];
      for (const f of files) {
        if (f.status === 'removed') continue;
        if (sig.detect(f, addedLines(f.patch))) {
          matched++;
          where.push(f.filename);
        }
      }
      if (matched > 0) {
        const pts = Math.min(sig.weight * matched, sig.cap || sig.weight);
        score += pts;
        hits.push({ id: sig.id, label: sig.label, detail: sig.detail, points: pts, where: where.slice(0, 4).join(', ') + (where.length > 4 ? ` +${where.length - 4}` : '') });
      }
    }
  }

  score = Math.min(100, score);
  return { score, band: band(score), hits, stats };
}

// ---- Comment rendering --------------------------------------------------------
const MARKER = '<!-- pr-risk-radar -->';

function bar(score) {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function renderComment(result) {
  const { score, band, hits } = result;
  if (hits.length === 0) {
    return `${MARKER}\n### 📡 PR Risk Radar — ${band.emoji} ${band.name} risk · ${score}/100\n\n\`${bar(score)}\`\n\nNo notable risk signals. 👍`;
  }
  const rows = hits
    .sort((a, b) => b.points - a.points)
    .map((h) => `| +${h.points} | ${h.label} | ${h.detail} | \`${h.where}\` |`)
    .join('\n');
  return (
    `${MARKER}\n### 📡 PR Risk Radar — ${band.emoji} ${band.name} risk · ${score}/100\n\n` +
    `\`${bar(score)}\`\n\n` +
    `| Points | Signal | Why | Where |\n|---|---|---|---|\n${rows}\n\n` +
    `<sub>Score is advisory — higher means review more carefully. Part of [DevGuard Tools](https://ivosetyadi.github.io).</sub>`
  );
}

// ---- GitHub API ---------------------------------------------------------------
const GH = 'https://api.github.com';
const ghHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'pr-risk-radar',
});

async function getPrContext() {
  const token = process.env.GITHUB_TOKEN || process.env.INPUT_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('No GITHUB_EVENT_PATH — run on a pull_request event.');
  const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const pr = event.pull_request;
  if (!pr) {
    log('::notice::PR Risk Radar only runs on pull_request events. Skipping.');
    return null;
  }
  return { token, repo: process.env.GITHUB_REPOSITORY, number: pr.number };
}

async function getChangedFiles(ctx) {
  const files = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${GH}/repos/${ctx.repo}/pulls/${ctx.number}/files?per_page=100&page=${page}`, {
      headers: ghHeaders(ctx.token),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    files.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return files;
}

async function upsertComment(ctx, body) {
  const listRes = await fetch(`${GH}/repos/${ctx.repo}/issues/${ctx.number}/comments?per_page=100`, { headers: ghHeaders(ctx.token) });
  if (listRes.ok) {
    const existing = (await listRes.json()).find((c) => c.body && c.body.includes(MARKER));
    if (existing) {
      await fetch(`${GH}/repos/${ctx.repo}/issues/comments/${existing.id}`, { method: 'PATCH', headers: ghHeaders(ctx.token), body: JSON.stringify({ body }) });
      return;
    }
  }
  await fetch(`${GH}/repos/${ctx.repo}/issues/${ctx.number}/comments`, { method: 'POST', headers: ghHeaders(ctx.token), body: JSON.stringify({ body }) });
}

// ---- Main ---------------------------------------------------------------------
async function run() {
  const ctx = await getPrContext();
  if (!ctx) return;

  const files = await getChangedFiles(ctx);
  const result = scorePr(files);

  log(`::notice::PR Risk Radar — ${result.band.name} risk, score ${result.score}/100`);
  setOutput('score', String(result.score));
  setOutput('band', result.band.name);

  if ((process.env.INPUT_COMMENT || 'true') === 'true') {
    try {
      await upsertComment(ctx, renderComment(result));
    } catch (e) {
      log(`::warning::Could not post PR comment: ${e.message}`);
    }
  }

  const failAt = parseInt(process.env.INPUT_FAIL_ABOVE || '101', 10); // default: never fail
  if (result.score >= failAt) {
    log(`::error::Risk score ${result.score} ≥ fail-above ${failAt}`);
    process.exit(1);
  }
}

if (require.main === module) {
  run().catch((e) => {
    log(`::error::PR Risk Radar failed: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { scorePr, band, renderComment, bar };
