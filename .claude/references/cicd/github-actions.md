# GitHub Actions — Syntax, Contexts, and Limits

Factual reference. For *how to design* a pipeline see `skills/cicd/`; for *what must never
happen* see `rules/security.md`.

---

## Workflow Skeleton

```yaml
name: CI

on:                              # the trigger
  push:
    branches: [main]
    paths: ['src/**']            # only run when these change
  pull_request:
  workflow_dispatch:             # manual "Run workflow" button
    inputs:
      environment:
        type: choice
        options: [dev, staging]
  schedule:
    - cron: '0 3 * * 1'          # UTC only — no timezone support

permissions:                     # ALWAYS declare explicitly
  contents: read

concurrency:                     # cancel superseded runs
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 15          # always set — default is 6 HOURS
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
```

---

## Triggers

| Trigger | Fires when | Note |
|---|---|---|
| `push` | Commit pushed | Filter with `branches`, `tags`, `paths` |
| `pull_request` | PR opened/updated | **Runs against the merge commit.** No secrets on forked PRs |
| `pull_request_target` | Same, but with **base-repo context and secrets** | ⚠ **Combined with checking out PR code = direct secret exfiltration.** See `rules/security.md` |
| `workflow_dispatch` | Manual button | Supports typed `inputs` |
| `schedule` | Cron | **UTC only.** Can be delayed or skipped under load — not for anything time-critical |
| `workflow_run` | Another workflow finishes | Runs in base-repo context |
| `release`, `issues`, `deployment` | Repo events | |

**`paths` / `paths-ignore`** limit *when* a workflow runs — useful in a monorepo so a docs change
does not rebuild everything. **Caution:** required status checks that never run leave a PR
permanently pending.

---

## Contexts — What's Actually In Them

The variables people reach for most:

| Expression | Contains |
|---|---|
| `github.sha` | Commit SHA. **On a PR this is the *merge* commit**, not the head commit |
| `github.event.pull_request.head.sha` | The actual PR head commit — use this for image tags |
| `github.ref` | `refs/heads/main`, `refs/pull/42/merge`, `refs/tags/v1.0.0` |
| `github.ref_name` | Short form: `main`, `v1.0.0` |
| `github.event_name` | `push`, `pull_request`, `workflow_dispatch` … |
| `github.repository` | `owner/repo` |
| `github.actor` | Who triggered it |
| `github.run_id` / `run_number` | Unique run id / incrementing counter |
| `github.workspace` | Checkout directory |
| `runner.os` | `Linux`, `Windows`, `macOS` |
| `secrets.*` | Repository / environment / org secrets |
| `vars.*` | Non-secret configuration variables |
| `env.*` | Environment variables |
| `job.status` | `success`, `failure`, `cancelled` |
| `steps.<id>.outputs.<name>` | Output of an earlier step |
| `needs.<job>.outputs.<name>` | Output of an earlier **job** |

> **Tagging images with `github.sha` on a `pull_request` trigger tags the merge commit**, which
> does not exist in your branch history. For a traceable tag use
> `github.event.pull_request.head.sha`.

---

## Expressions and Conditions

```yaml
if: github.ref == 'refs/heads/main'
if: github.event_name == 'push' && !cancelled()
if: contains(github.event.head_commit.message, '[skip deploy]') == false
if: failure()                     # run only if a previous step failed
if: always()                      # run even if cancelled — use for cleanup
```

| Function | Use |
|---|---|
| `success()` | Default — implicit on every step |
| `failure()` | Only when something earlier failed |
| `always()` | Always, including cancellation. **Careful: hides failures** |
| `cancelled()` | Run was cancelled |
| `contains(a, b)`, `startsWith`, `endsWith` | String/array tests |
| `fromJSON(str)` | Parse JSON — how a dynamic matrix is built |
| `hashFiles('**/package-lock.json')` | Cache keys |

`${{ }}` is required in `if:` only when mixing with literals — `if: success()` works bare.

---

## Jobs, Dependencies, and Outputs

**Jobs run in parallel unless `needs:` says otherwise. Jobs do not share a filesystem.**

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tag }}
    steps:
      - id: meta
        run: echo "tag=sha-${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

  deploy:
    needs: build                              # sequential
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: echo "deploying ${{ needs.build.outputs.image-tag }}"
```

**Step outputs** are written to the `$GITHUB_OUTPUT` file, not echoed:

```bash
echo "key=value" >> "$GITHUB_OUTPUT"          # step output
echo "KEY=value" >> "$GITHUB_ENV"             # env var for later steps
echo "## Summary" >> "$GITHUB_STEP_SUMMARY"   # markdown on the run page
echo "::add-mask::$value"                     # redact a value from logs
```

---

## Matrix Builds

```yaml
strategy:
  fail-fast: false                 # let other combinations finish
  max-parallel: 4
  matrix:
    node: ['18', '20', '22']
    os: [ubuntu-latest, windows-latest]
    include:
      - node: '22'
        os: ubuntu-latest
        coverage: true             # extra property for one combination
    exclude:
      - node: '18'
        os: windows-latest
```

Produces one job per combination. **`fail-fast: true` (the default) cancels every other job the
moment one fails** — usually not what you want when you are trying to see which platforms break.

**Dynamic matrix** from a previous job:

```yaml
strategy:
  matrix: ${{ fromJSON(needs.discover.outputs.matrix) }}
```

---

## Caching

```yaml
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-npm-
```

Most `setup-*` actions do this for you — prefer that:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '20'
    cache: 'pnpm'                  # or npm, yarn
```

**Behaviour that surprises people:**
- Caches are **immutable** — a key that already exists is never overwritten. Change the key to
  change the content
- **Branch scoping:** a branch can read caches from itself and from the default branch, but not
  from sibling branches
- Unused caches are evicted after ~7 days; there is a repository size limit
- Docker layer caching needs Buildx with `cache-from`/`cache-to: type=gha` — `actions/cache`
  alone does not cache image layers

---

## Artifacts

```yaml
- uses: actions/upload-artifact@v4
  with:
    name: dist
    path: dist/
    retention-days: 7

- uses: actions/download-artifact@v4
  with:
    name: dist
```

**This is how jobs pass files to each other**, since they do not share a filesystem.

> **v4 is not compatible with v3** — artifacts uploaded by one cannot be downloaded by the other,
> and in v4 an artifact name must be unique within a run (upload once, not once per matrix leg,
> unless you vary the name).

---

## Service Containers

For integration tests needing a real database:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_PASSWORD: postgres
    ports: ['5432:5432']
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

**The `--health-*` options are what make this reliable.** Without them the job starts before the
database accepts connections, and the tests fail intermittently — the most common cause of a
"flaky" integration suite.

Reachable at `localhost:<mapped-port>` from steps; by service name from other containers.

---

## Reusable Workflows vs Composite Actions

| | Reusable workflow | Composite action |
|---|---|---|
| Called with | `uses:` at **job** level | `uses:` at **step** level |
| Contains | Whole jobs | Steps only |
| Runner | Its own | The caller's |
| Secrets | Passed explicitly, or `secrets: inherit` | Inherits the job's env |

```yaml
jobs:
  deploy:
    uses: ./.github/workflows/deploy.yml       # reusable workflow
    with:
      environment: staging
    secrets: inherit
```

Nesting limit is 4 levels; a reusable workflow cannot call itself.

---

## Runners

| Label | Spec (hosted, public repos) |
|---|---|
| `ubuntu-latest` | 4 vCPU · 16 GB RAM · 14 GB SSD |
| `windows-latest` | Same class, slower start, ~2× minute cost |
| `macos-latest` | ARM by default now · ~10× minute cost |

- `-latest` **moves**. Pin (`ubuntu-24.04`) when a build is sensitive to the image
- Linux minutes are the cheapest; **macOS is ~10× and Windows ~2×** on private repos
- Public repositories get unlimited free minutes on standard runners
- Self-hosted runners: never use on a public repo with `pull_request` from forks — untrusted code
  runs on your machine

---

## Limits Worth Knowing

| Limit | Value |
|---|---|
| Job execution time | **6 hours** (killed at the cap) |
| Workflow run time | 35 days including waits |
| `timeout-minutes` default | None — inherits the 6h job cap |
| Queued job wait | 24 hours |
| Concurrent jobs | Plan-dependent |
| Matrix jobs per workflow run | 256 |
| API rate limit for `GITHUB_TOKEN` | 1,000 requests/hour/repository |
| Environment secrets per environment | 100 |
| Secret size | 48 KB |
| Log retention | 90 days (default) |
| Artifact retention | 90 days default, configurable to 400 |

**Always set `timeout-minutes` per job.** A hung job otherwise burns runner minutes for six hours.

---

## Commonly Used Actions

Prefer official `actions/*` and vendor-published actions.

| Action | Purpose |
|---|---|
| `actions/checkout` | Clone the repo. `fetch-depth: 0` for full history |
| `actions/setup-node` / `setup-python` / `setup-go` / `setup-java` | Toolchain + dependency cache |
| `actions/cache` | Manual caching |
| `actions/upload-artifact` / `download-artifact` | Pass files between jobs |
| `actions/github-script` | Run JS against the GitHub API inline |
| `aws-actions/configure-aws-credentials` | **OIDC** → temporary AWS credentials |
| `aws-actions/amazon-ecr-login` | Docker login to ECR |
| `docker/setup-buildx-action` + `docker/build-push-action` | Buildx with GHA layer cache |
| `pnpm/action-setup` | pnpm before `setup-node`'s cache |

> **Version numbers move.** Check the action's repository for the current major before writing a
> workflow, and **pin third-party actions by commit SHA** — a moving tag on a compromised action
> runs with your credentials. Official `actions/*` by major tag is a defensible middle ground;
> state the trade-off.

---

## Debugging

| Technique | How |
|---|---|
| Re-run with debug logs | Re-run failed jobs → "Enable debug logging" |
| Debug locally | `act` (approximation only — not identical to hosted runners) |
| Print context | `- run: echo '${{ toJSON(github) }}'` |
| Step summary | `echo "..." >> "$GITHUB_STEP_SUMMARY"` |
| Mask a value | `echo "::add-mask::$secret"` |
| Group log output | `echo "::group::Name"` … `echo "::endgroup::"` |

**Secrets are masked in logs automatically**, but only exact matches — a base64-encoded or
partially-printed secret is **not** masked.

---

## Failure Modes and Their Causes

| Symptom | Usual cause |
|---|---|
| Works locally, fails in CI | Different runtime version · missing env var · case-sensitive filesystem on Linux · something uncommitted |
| Flaky integration tests | No `--health-cmd` on the service container |
| "Cache never hits" | Key does not include the right lockfile, or `path` is wrong |
| `Unable to locate credentials` | Missing `id-token: write` · trust policy `sub` does not match |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` mismatch — compare character by character |
| Secret is empty | Environment secret referenced from a job without `environment:` · forked PR |
| Job skipped unexpectedly | An `if:` condition, or a `needs:` dependency failed |
| Deploy "succeeds", nothing changed | No stability wait — the job did not check the rollout |
| PR stuck pending forever | A required status check on a workflow that `paths` filtering prevented from running |
