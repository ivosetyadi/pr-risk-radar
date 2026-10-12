// Risk signals for PR Risk Radar. Each signal contributes points toward a
// 0–100 risk score. Required by dist/index.js and the test suite.
//
// scope 'file'   → detect(file, addedLines) runs per changed file; `weight`
//                  is added once per matching file, capped at `cap` total.
// scope 'global' → detect(stats) runs once on aggregate stats; adds `weight`.

const reAny = (lines, re) => lines.some((l) => re.test(l));

module.exports = [
  {
    id: 'risky-sql',
    scope: 'file',
    label: 'Risky SQL / migration',
    weight: 30,
    cap: 45,
    detail: 'Mass UPDATE/DELETE without LIMIT, or TRUNCATE/DROP/ALTER on a table.',
    detect: (file, lines) =>
      /\.sql$/i.test(file.filename) &&
      (lines.some((l) => /\b(update|delete)\b/i.test(l) && /\bwhere\b/i.test(l) && !/\blimit\b/i.test(l)) ||
        reAny(lines, /\b(truncate|drop\s+table|alter\s+table)\b/i)),
  },
  {
    id: 'secret',
    scope: 'file',
    label: 'Possible leaked secret',
    weight: 35,
    cap: 35,
    detail: 'A credential-looking value appears in the diff.',
    detect: (file, lines) =>
      reAny(lines, /\b(AKIA|ASIA)[A-Z0-9]{16}\b/) ||
      reAny(lines, /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/) ||
      reAny(lines, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/) ||
      reAny(lines, /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*['"][^'"\s]{12,}['"]/i),
  },
  {
    id: 'infra-restart',
    scope: 'file',
    label: 'Service restart in deploy script',
    weight: 12,
    cap: 12,
    detail: 'docker restart/stop can trigger pending migrations or cascades.',
    detect: (file, lines) => /\.(sh|ya?ml|bat|ps1)$/i.test(file.filename) && reAny(lines, /docker\s+(restart|stop)\b/i),
  },
  {
    id: 'dependency-change',
    scope: 'file',
    label: 'Dependency change',
    weight: 15,
    cap: 20,
    detail: 'A dependency manifest or lockfile changed — review for new CVEs.',
    detect: (file) =>
      /(^|\/)(package\.json|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|poetry\.lock|go\.mod|go\.sum|Gemfile(\.lock)?|pom\.xml|build\.gradle|Cargo\.(toml|lock)|composer\.(json|lock))$/i.test(
        file.filename
      ),
  },
  {
    id: 'critical-file',
    scope: 'file',
    label: 'Critical infra file',
    weight: 12,
    cap: 24,
    detail: 'Edits to CI, container, or infrastructure config.',
    detect: (file) =>
      /(^|\/)(Dockerfile|docker-compose\.ya?ml|\.github\/workflows\/.+\.ya?ml|.+\.tf|nginx.*\.conf|Procfile|.+\.k8s\.ya?ml|deploy\.(sh|ps1))$/i.test(
        file.filename
      ),
  },
  {
    id: 'large-diff',
    scope: 'global',
    label: 'Large diff',
    weight: 15,
    detail: 'The PR changes a lot of lines — harder to review well.',
    detect: (stats) => stats.changes > 800,
  },
  {
    id: 'huge-diff',
    scope: 'global',
    label: 'Very large diff',
    weight: 10,
    detail: 'Over 2000 lines changed — consider splitting the PR.',
    detect: (stats) => stats.changes > 2000,
  },
  {
    id: 'many-files',
    scope: 'global',
    label: 'Touches many files',
    weight: 10,
    detail: 'More than 25 files changed.',
    detect: (stats) => stats.fileCount > 25,
  },
];
