// Offline test suite for PR Risk Radar. No network.
const assert = require('assert');
const { scorePr, band, renderComment, bar } = require('../dist/index.js');

let pass = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  pass++;
};

const f = (filename, added = [], extra = {}) => ({
  filename,
  status: 'modified',
  changes: added.length,
  patch: added.length ? '@@ +1 @@\n' + added.map((l) => '+' + l).join('\n') : '',
  ...extra,
});

// --- clean PR → Low ----------------------------------------------------------
let r = scorePr([f('src/app.js', ['const x = 1;'])]);
ok(r.score === 0 && r.band.name === 'Low', 'clean PR scores 0 / Low');
ok(renderComment(r).includes('No notable risk'), 'clean comment');

// --- risky SQL ---------------------------------------------------------------
r = scorePr([f('db/V7.sql', ['UPDATE users SET a=1 WHERE active=1;'])]);
ok(r.hits.some((h) => h.id === 'risky-sql'), 'risky SQL detected');
ok(r.score === 30, `risky SQL = 30 (got ${r.score})`);

// --- secret ------------------------------------------------------------------
r = scorePr([f('app.js', ['const k = "ghp_0123456789012345678901234567890123AB";'])]);
ok(r.hits.some((h) => h.id === 'secret') && r.score === 35, 'secret = 35');

// --- dependency + critical file ----------------------------------------------
r = scorePr([f('package-lock.json', ['"lodash": "4.17.21"']), f('Dockerfile', ['FROM node:20'])]);
ok(r.hits.some((h) => h.id === 'dependency-change'), 'dependency change detected');
ok(r.hits.some((h) => h.id === 'critical-file'), 'critical file detected');
ok(r.score === 27, `dep(15)+critical(12)=27 (got ${r.score})`);

// --- per-signal cap ----------------------------------------------------------
r = scorePr([f('a.sql', ['DROP TABLE x;']), f('b.sql', ['DROP TABLE y;']), f('c.sql', ['DROP TABLE z;'])]);
ok(r.score === 45, `risky-sql capped at 45 across files (got ${r.score})`);

// --- global signals: large diff + many files ---------------------------------
const many = [];
for (let i = 0; i < 30; i++) many.push(f(`file${i}.js`, [], { changes: 40 }));
r = scorePr(many);
ok(r.hits.some((h) => h.id === 'many-files'), 'many-files signal');
ok(r.hits.some((h) => h.id === 'large-diff'), 'large-diff signal (1200 changes)');

// --- score is capped at 100 --------------------------------------------------
r = scorePr([
  f('a.sql', ['UPDATE t SET x=1 WHERE y=2;']),
  f('s.js', ['password = "supersecretvalue123";']),
  f('Dockerfile', ['FROM x'], { changes: 2500 }),
  f('package.json', ['{}']),
  f('deploy.sh', ['docker restart app']),
]);
ok(r.score <= 100, 'score capped at 100');

// --- band thresholds ---------------------------------------------------------
ok(band(0).name === 'Low' && band(20).name === 'Medium' && band(50).name === 'High' && band(80).name === 'Critical', 'band thresholds');

// --- bar ---------------------------------------------------------------------
ok(bar(50).length === 10 && bar(100) === '██████████', 'progress bar length');

console.log(`✓ ${pass} assertions passed`);
