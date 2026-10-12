# 📡 PR Risk Radar

A GitHub Action that **scores every pull request 0–100** across several risk dimensions and comments a single verdict — so reviewers know where to look first.

Part of [DevGuard Tools](https://ivosetyadi.github.io). Zero-dependency, Node 20, no bundling.

## What it weighs

| Signal | Points | What it catches |
|--------|-------:|-----------------|
| Risky SQL / migration | up to 45 | mass `UPDATE`/`DELETE` without `LIMIT`, `TRUNCATE`/`DROP`/`ALTER` |
| Leaked secret | 35 | credential-looking values in the diff |
| Critical infra file | up to 24 | Dockerfile, CI workflows, Terraform, nginx, deploy scripts |
| Dependency change | up to 20 | changed manifest/lockfile (review for new CVEs) |
| Service restart | 12 | `docker restart`/`stop` in a deploy script |
| Large / very large diff | 15 / +10 | hard-to-review change sizes |
| Touches many files | 10 | > 25 files changed |

Score bands: 🟢 **Low** (0–19) · 🟡 **Medium** (20–49) · 🟠 **High** (50–79) · 🔴 **Critical** (80+).

## Usage

```yaml
# .github/workflows/risk-radar.yml
name: PR Risk Radar
on: pull_request
permissions:
  contents: read
  pull-requests: write
jobs:
  radar:
    runs-on: ubuntu-latest
    steps:
      - uses: ivosetyadi/pr-risk-radar@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          fail-above: 80   # optional: block Critical PRs
```

## Example comment

> ### 📡 PR Risk Radar — 🟠 High risk · 57/100
> `█████▒▒▒▒▒`
>
> | Points | Signal | Why | Where |
> |---|---|---|---|
> | +30 | Risky SQL / migration | Mass UPDATE/DELETE without LIMIT… | `db/V7.sql` |
> | +15 | Dependency change | A lockfile changed — review for CVEs | `package-lock.json` |
> | +12 | Critical infra file | Edits to CI/container config | `Dockerfile` |

## Outputs

- `score` — 0–100
- `band` — Low / Medium / High / Critical

## License

MIT © Ivo Setyadi
