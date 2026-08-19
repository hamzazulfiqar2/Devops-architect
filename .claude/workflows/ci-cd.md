# Workflow — CI/CD

**Defines how CI/CD pipelines are designed and implemented.**

This workflow runs during **IMPLEMENT** in the primary lifecycle in `CLAUDE.md`, after the
architecture is approved and the deployment target is known.

```
CODE → PULL REQUEST → LINT → TEST → SECURITY SCAN → BUILD → DOCKER BUILD
→ IMAGE SCAN → PUSH REGISTRY → STAGING → VALIDATION → PRODUCTION APPROVAL → PRODUCTION
```

Related skills: `cicd` (detailed guidance) · `docker` · `terraform` · `security` · `monitoring`
Parent workflow: `.claude/workflows/deployment.md`

---

## Rules For This Workflow

**Production deployment requires explicit approval.** The pipeline must be *incapable* of
reaching production without a human gate — enforced by a GitHub Environment with required
reviewers, not by convention or discipline. Only build full automation to production if the user
explicitly asks for it, and say plainly what protection that trades away.

**Never store AWS credentials in the repository.** No access keys in files, no long-lived
`AWS_SECRET_ACCESS_KEY` in repository secrets where OIDC is available. If you find committed
credentials, say so immediately — **they are compromised and must be rotated**, not just deleted.

**Use AWS OIDC rather than long-lived credentials whenever appropriate.** Fall back to static
keys only when OIDC is genuinely unavailable, and state why.

**Never commit workflow changes or push without approval.** Propose, explain, wait.

**Never trigger a real deploy to verify the pipeline.** Use `workflow_dispatch` against dev, with
approval.

**Default platform is GitHub Actions** unless the project already uses something else — in which
case use what exists and translate the concepts rather than proposing a migration nobody asked for.

---

## Step 0 — Determine the Deployment Target

**Do this first.** The target shapes the entire second half of the pipeline. It comes from the
approved architecture, not from preference.

| Target | Deploy mechanism | The step people get wrong |
|---|---|---|
| **ECS** | Render image into task definition → register → update service | **Must wait for service stability.** Without it, the job reports green while tasks crash-loop |
| **EKS** | `aws eks update-kubeconfig` → `kubectl apply` / `helm upgrade` | **`kubectl rollout status`** is what turns a fire-and-forget apply into a real gate. The CI IAM principal must be mapped in the cluster's access config |
| **Lambda** | Publish version → shift alias | Alias + weighted routing gives canary almost free. Don't deploy to `$LATEST` |
| **EC2** | CodeDeploy, SSM Run Command, or an ASG instance refresh | Needs a health check and a defined batch size, or you take the whole fleet down |
| **S3 + CloudFront** | `aws s3 sync` → invalidation | Cache headers matter: long max-age for hashed assets, short for `index.html` |

Confirm the target and its region before designing anything else. If the target is undecided,
that is an architecture question — return to `architecture-design`.

---

## Step 1 — CODE

Establish what the pipeline will actually run:

- **The commands that already work locally** — install, lint, test, build. The pipeline runs what
  the developer runs, not a parallel invention that drifts
- **Runtime version**, from a version file or lockfile — pinned in the workflow to match
- **Test reality** — do tests exist, do they need a database or network, are any flaky. A pipeline
  built on tests nobody trusts gets bypassed within a week; say so if that's the situation
- **Branching model** — what triggers what

**Workflow file layout** — separate by purpose rather than one giant file:

| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | `pull_request` | Validate the change. Fast feedback |
| `deploy.yml` | `push` to main, `workflow_dispatch` | Build once, promote through environments |
| `security.yml` | `schedule`, `push` | Scans that don't need to block every PR |

Standing requirements on every workflow:
- Explicit minimal `permissions:` — GitHub's defaults are broader than most jobs need
- `timeout-minutes` on every job — a hung job otherwise burns runner minutes for six hours
- `concurrency` with `cancel-in-progress` for PR builds — **never** for production deploys
- Third-party actions pinned by commit SHA; a compromised action tag runs with your credentials

---

## Step 2 — PULL REQUEST

The PR is the gate that protects the main branch. Everything from here to BUILD runs on every PR.

- Trigger on `pull_request`, not `pull_request_target` — **`pull_request_target` combined with
  checkout of PR code is a direct secret-exfiltration path**
- Forked PRs do not receive secrets, by design. Do not work around this
- Branch protection: required status checks, required review, no direct pushes to main
- Deploy jobs are excluded from PR runs — a PR validates, it does not release

---

## Step 3 — LINT

First, because it is fastest. A developer should learn about a formatting error in 30 seconds,
not 12 minutes.

- Formatting and lint rules the project already defines
- Type checking where the language has it
- Fails the build — a non-blocking linter is decoration

---

## Step 4 — TEST

- **Unit tests** — no external dependencies, parallel where possible, results published
- **Integration tests** — spin real dependencies as service containers (Postgres, Redis) rather
  than mocking the world. **Wait for readiness before running**; a missing readiness wait is the
  most common source of flaky integration jobs
- Cache dependencies keyed on the lockfile hash
- Use the lockfile-respecting install (`npm ci`, not `npm install`) so builds are reproducible
- Tests must be able to fail the build. Tests that can't are theatre

---

## Step 5 — SECURITY SCAN

Five scans. Decide **explicitly** whether each blocks or reports — blocking on every transitive
CVE stops all work; blocking on critical severity in production paths is reasonable. State the
policy rather than leaving it implicit.

| Scan | Catches | Tooling |
|---|---|---|
| **Dependency** | Known CVEs in libraries | Dependabot, `npm audit`, `pip-audit`, Trivy |
| **Secret** | Credentials committed to the repo | GitHub secret scanning + **push protection**, Gitleaks |
| **SAST** | Vulnerable code patterns | CodeQL, Semgrep |
| **IaC** | Misconfigured infrastructure before it exists | tfsec, Checkov, `trivy config` |
| **Image** | Vulnerable packages in the built image | Trivy, Grype, ECR scan-on-push — *runs at Step 7* |

Enable **Dependabot** and **push protection** as repository settings — both are worth more than
most workflow additions and cost nothing.

---

## Step 6 — BUILD & DOCKER BUILD

**Build once.** This artifact is what reaches production. Never rebuild per environment — a
rebuild means production runs something that was never tested.

- Build the application artifact
- Build the container image (hand off to `docker` for Dockerfile quality)
- **Tag with the git SHA** — immutable. Never `:latest`. A moving tag like `staging` may *point*
  at a SHA tag, never replace it
- Build for the target architecture — `linux/amd64` unless you know otherwise. This bites anyone
  developing on Apple Silicon
- Use Buildx with GitHub Actions cache (`cache-from`/`cache-to: type=gha`) to keep builds fast
- **No secrets as build args** — `ARG` and `ENV` are visible in `docker history`. Use BuildKit
  `--mount=type=secret` if a build genuinely needs one

---

## Step 7 — IMAGE SCAN

**Scan before pushing**, so a vulnerable image never reaches the registry.

- Fail on critical severity by policy; report the rest
- Also enable ECR scan-on-push as a second net
- Record the scan result alongside the image tag so you can answer "was this image scanned?"
  later

---

## Step 8 — PUSH REGISTRY

- Authenticate via **OIDC**, then `aws-actions/amazon-ecr-login`
- Push the SHA tag; add environment-pointer tags only as pointers
- ECR repository needs a **lifecycle policy** — without one, every CI build's image stays forever
  (a pipeline building 20 images a day at 500 MB accumulates ~3 TB a year)
- Consider tag immutability so a tag can never be repointed under a running deployment
- Nodes pulling from a private subnet need an ECR VPC endpoint or NAT route — flag it as a
  requirement for `terraform`

---

## AWS Authentication — OIDC

**In plain terms:** instead of storing an AWS key in GitHub, GitHub proves its identity to AWS
with a short-lived signed token and AWS returns temporary credentials. There is no long-lived
secret to leak.

```yaml
permissions:
  id-token: write      # required to request the OIDC token
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy-staging
      aws-region: eu-west-1
```

**The trust policy is the security boundary.** Scope the `sub` condition tightly:

- `repo:owner/name:ref:refs/heads/main` — a specific branch
- `repo:owner/name:environment:production` — a specific environment

A wildcard like `repo:owner/*` means **any branch anyone can push may assume the role**. This is
the most common OIDC misconfiguration and it is a HIGH security finding.

**Separate roles per environment**, with different permissions. The production role should be
assumable only from the production environment, which is itself gated by required reviewers.

Creating the OIDC provider and roles is `terraform`'s job — this workflow states the requirement.

---

## Step 9 — STAGING

- Deploys automatically on merge to main
- Deploys the **artifact just built**, by digest or SHA
- Runs migrations exactly as production will run them
- **Waits for the deploy to actually stabilize** — see the target table in Step 0
- Runs smoke tests against the deployed environment
- Environment secrets scoped to staging; staging role cannot touch production

---

## Step 10 — VALIDATION

The pipeline must verify the deploy, not just perform it.

| Check | Verifies |
|---|---|
| **Deploy stability wait** | Tasks/pods actually running the new version, not crash-looping |
| **Health check** | Load balancer targets healthy |
| **Smoke tests** | A real request path works end to end — auth, database, a core endpoint |
| **Error rate** | No spike in the minutes after deploy |
| **Logs** | Application booted clean, no startup errors |

**A green pipeline over a failed deploy is its own bug.** If validation fails, the pipeline fails
loudly and — where configured — rolls back automatically.

---

## Step 11 — PRODUCTION APPROVAL

**The gate.** Implemented with a GitHub Environment named `production`:

- **Required reviewers** — the human approval. This is what satisfies "never deploy production
  without explicit approval"
- **Deployment branch rule** — only `main` may deploy to production
- **Environment secrets** — production values invisible to every other job
- Optional wait timer

The approval request should carry: what changed, the artifact SHA, staging validation result,
migration plan, and the rollback path. A reviewer approving blind is a gate in name only.

---

## Step 12 — PRODUCTION

- Deploys the **same artifact** staging validated — same digest, no rebuild
- Strategy per the approved architecture: rolling (default), blue/green, or canary. Blue/green
  and canary need supporting machinery (CodeDeploy, ALB weighted target groups, Lambda alias
  weights, Argo Rollouts) — name that cost rather than implying it's free
- Waits for stability, then runs smoke tests
- Watches error rate and latency for a defined window

---

## Rollback

**Decide the mechanism before the first deploy, not during the first incident.**

| Target | Rollback |
|---|---|
| ECS | Update service to the previous task definition revision |
| EKS | `kubectl rollout undo` |
| Lambda | Point the alias at the previous version |
| S3 | Redeploy the previous artifact (keep versioning on) |

Define:
- **Trigger** — failed smoke test, error rate above threshold, failed health check
- **Automatic or human-initiated** — automatic on smoke-test failure is usually right
- **Time to roll back** — known, and ideally practiced

**Rollback does not undo database migrations.** Any pipeline running migrations needs them
backward-compatible with the previous version — expand, migrate, then contract in a later
release. State this whenever migrations are in scope.

---

## Review Checklist

Before considering the pipeline done:

| Item | Required |
|---|---|
| No static AWS credentials anywhere | ✅ |
| OIDC trust policy scoped to repo **and** branch/environment | ✅ |
| Explicit minimal `permissions:` on every workflow | ✅ |
| Third-party actions pinned by SHA | ✅ |
| No `pull_request_target` with untrusted checkout | ✅ |
| Build once, promote same artifact | ✅ |
| Immutable SHA tags, no `:latest` | ✅ |
| All five security scans present, block-or-report decided | ✅ |
| Image scanned **before** registry push | ✅ |
| Deploy waits for stability | ✅ |
| Smoke tests after every deploy | ✅ |
| Production gated by required reviewers | ✅ |
| Rollback path defined and practiced | ✅ |
| Migrations backward-compatible | ✅ |
| `timeout-minutes` on every job | ✅ |
| ECR lifecycle policy set | ✅ |
| No secrets echoed to logs or passed on command lines | ✅ |

---

## Exit Condition

The workflow ends when the pipeline runs green on a trivial PR, deploys successfully to staging,
and **stops at the production gate awaiting approval**.

Verify before trusting it: no secret appears in any log · the artifact is reproducible · the
production gate actually blocks (test it) · rollback has been practiced at least once in staging
before it is needed under pressure.

If the pipeline fails, hand off to `troubleshooting` rather than adding retries and hoping.
