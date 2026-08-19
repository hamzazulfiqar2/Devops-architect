---
name: cicd
description: Design, implement, review, and troubleshoot CI/CD pipelines — primarily GitHub Actions, with concepts that transfer to GitLab CI, Jenkins, and CircleCI. Covers checkout, dependency installation and caching, linting, unit and integration tests, builds and artifacts; security scanning (dependencies, secrets, SAST, container images, IaC); the container pipeline from push through test, build, tag, scan, and registry push; environment separation, approvals, deployment gates, and rollback; AWS integration for ECR, ECS, EKS, Lambda, S3, and IAM via GitHub OIDC; and rolling, blue/green, canary, and manual-approval strategies. Generates workflows with every step explained and troubleshoots failing pipelines. Use when the user mentions CI/CD, GitHub Actions, workflows, pipelines, automated deploys, build failures, or "how do I deploy this automatically". Never puts AWS credentials in a repository; never auto-deploys production unless explicitly asked.
---

# CI/CD

Design the pipeline around what the project actually is and where it actually deploys.
Automate the safe parts. Gate the dangerous ones.

## Before Designing a Pipeline

Establish these — from the repo, a completed `project-discovery`, or by asking:

- **Language, runtime version, package manager**, and the lockfile in use.
- **The commands that already work locally** — install, lint, test, build. The pipeline should
  run what the developer runs, not a parallel invention.
- **Test reality** — do tests exist? Do they need a database, a cache, or network access?
  Are any flaky? A pipeline built on tests nobody trusts gets ignored within a week.
- **Build output** — a container image, a zip, static files, a library?
- **Deployment target** — ECS, EKS, Lambda, S3+CloudFront, EC2, or something else. This shapes
  the entire deploy half of the pipeline.
- **Environments that exist** and how a change is meant to travel between them.
- **Branching model** — trunk-based, GitFlow, or ad hoc.
- **Who approves production**, and whether approval is required at all.
- **Existing AWS identity setup** — is there an OIDC provider and role already, or does that
  need creating? (Creating it is `terraform`'s job; this skill states the requirement.)
- **Repository visibility** — public repos leak forked-PR secrets differently; it matters.

If the deployment target is undecided, that is an architecture question — route to
`aws-architecture` rather than guessing.

## Boundaries

- **Never store AWS credentials in a repository.** No access keys in files, no long-lived
  `AWS_SECRET_ACCESS_KEY` in repository secrets when OIDC is available. If you find committed
  credentials, say so immediately and treat them as compromised — they must be rotated.
- **Prefer GitHub OIDC with AWS IAM roles.** Short-lived, per-workflow, scoped by trust policy.
  Only fall back to static keys when OIDC is genuinely unavailable, and say why.
- **Never make production deploys automatic** unless the user explicitly asks for it. Default
  to a required manual approval gate. If they do ask for full automation, build it — and state
  plainly what protection they're trading away and what must be in place first (reliable tests,
  health checks, automatic rollback, monitoring).
- **Never commit workflow changes or push to a repository without approval.** Propose, explain,
  wait.
- **Never trigger a real deploy to verify a pipeline.** Use `workflow_dispatch` against a dev
  environment, and only with approval.
- **Container internals belong to `docker`; cluster manifests to `kubernetes`; infrastructure
  provisioning to `terraform`.** This skill orchestrates them.

## Pipeline Design Principles

**Fail fast, cheapest first.** Order stages so the quickest checks run first: lint before unit
tests, unit tests before integration tests, tests before an expensive image build. A developer
should learn about a formatting error in 30 seconds, not 12 minutes.

**Build once, deploy many.** Build the artifact a single time, tag it immutably, and promote
that exact artifact through dev → staging → prod. Rebuilding per environment means production
runs something that was never tested.

**Immutable tags.** Tag with the git SHA. `:latest` makes deploys and rollbacks
non-deterministic. A moving tag like `staging` may point at a SHA tag, never replace it.

**Every deploy must be reversible.** Know the rollback command before you write the deploy step.

**Least privilege per workflow.** Set `permissions:` explicitly at the top of every workflow —
GitHub's defaults are broader than most jobs need. A CI job that only reads code gets
`contents: read`. OIDC needs `id-token: write`.

**Pin third-party actions.** Reference actions by commit SHA, not a moving tag — a compromised
action tag is a supply-chain attack that runs with your credentials. Official `actions/*` by
major version is a defensible middle ground; state the trade-off.

**Keep pipelines fast.** Cache dependencies, run independent jobs in parallel, use matrices
where they help. A slow pipeline gets bypassed.

## CI Stages

**Checkout** — `actions/checkout@v4`. Default fetch depth is 1; deepen only when you need
history (changelogs, tag-based versioning). Never check out and execute untrusted PR code in a
workflow that holds secrets — that's what `pull_request_target` misuse costs you.

**Dependency installation** — use the lockfile-respecting command (`npm ci`, `pip install -r`
with hashes, `go mod download`) so builds are reproducible. Cache the dependency directory keyed
on the lockfile hash — `actions/setup-node` and friends do this with `cache:`.

**Linting and formatting** — fast, runs first, fails the build. Include type checking where the
language has it.

**Unit tests** — no external dependencies, run in parallel where possible, publish results.

**Integration tests** — spin real dependencies up as service containers (Postgres, Redis) rather
than mocking the world. Wait for readiness before running; a missing wait is the most common
source of flaky integration jobs.

**Build** — produce the deployable artifact. Fail on warnings where the project's standards
allow it.

**Artifact creation** — upload build outputs with `actions/upload-artifact` for inspection, or
push a container image. Set retention deliberately; artifacts cost storage.

## Security Scanning

Include all five. Place them so they fail fast but don't block trivial feedback.

| Scan | What it catches | Tooling |
|---|---|---|
| **Dependency scanning** | Known CVEs in libraries | Dependabot, `npm audit`, `pip-audit`, Trivy, Snyk |
| **Secret scanning** | Credentials committed to the repo | GitHub secret scanning + push protection, Gitleaks, TruffleHog |
| **SAST** | Vulnerable code patterns | CodeQL (free for public repos), Semgrep |
| **Container image scanning** | Vulnerable OS packages and libraries in the image | Trivy, Grype, ECR scan-on-push |
| **IaC scanning** | Misconfigured infrastructure before it exists | tfsec, Checkov, `trivy config` |

Decide deliberately whether each scan **blocks** or **reports**. Blocking on every CVE in a
transitive dependency stops all work; blocking on critical severity in production paths is
reasonable. State the policy explicitly rather than leaving it implicit.

Enable **Dependabot** for dependency updates and **push protection** for secrets — both are
repository settings, not workflow steps, and both are worth more than most pipeline additions.

## The Container Pipeline

```
git push
  → checkout
  → install + cache
  → lint + typecheck
  → unit tests
  → integration tests
  → build image (tag: <git-sha>)
  → scan image  ──fail on critical──▶ stop
  → push to ECR
  → deploy dev (automatic)
  → deploy staging (automatic or gated)
  → [MANUAL APPROVAL]
  → deploy production
  → smoke test ──fail──▶ rollback
```

Notes that matter: scan **before** pushing, so a vulnerable image never reaches the registry.
Use Buildx with GitHub Actions cache (`cache-from`/`cache-to: type=gha`) to keep image builds
fast. Build for the architecture the target runs (`linux/amd64` unless you know otherwise) —
this bites anyone developing on Apple Silicon.

## AWS Integration via OIDC

**The core idea, in plain terms:** instead of storing an AWS key in GitHub, GitHub proves its
identity to AWS with a short-lived signed token, and AWS hands back temporary credentials. There
is no long-lived secret to leak.

Setup has two halves:
1. **In AWS** (provisioned via `terraform`): an IAM OIDC identity provider for
   `token.actions.githubusercontent.com`, plus an IAM role whose trust policy restricts which
   repository, and ideally which branch or environment, may assume it.
2. **In the workflow**: request the token and exchange it.

```yaml
permissions:
  id-token: write      # required to request the OIDC token
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789012:role/github-actions-deploy
      aws-region: eu-west-1
```

**The trust policy is the security boundary.** Scope its `sub` condition tightly:
`repo:owner/name:ref:refs/heads/main` for a branch, or `repo:owner/name:environment:production`
for an environment. A wildcard like `repo:owner/*` means any branch in any of those repos can
assume the role — including a branch pushed by anyone who can open a PR. Say this explicitly;
it is the most common OIDC misconfiguration.

Use **separate roles per environment** with different permissions. The production role should be
assumable only from the production environment, which is itself gated by approval.

**Per-target deploy notes:**
- **ECR** — `aws-actions/amazon-ecr-login`, then tag and push. Requires `ecr:GetAuthorizationToken`
  plus repository-scoped push permissions.
- **ECS** — render the new image into the task definition, register it, update the service, and
  **wait for stability**. Without `--wait services-stable` or the equivalent, the job reports
  success while the deployment is still failing.
- **EKS** — `aws eks update-kubeconfig`, then apply manifests or `helm upgrade`. The IAM
  principal must be mapped in the cluster's access config, and `kubectl rollout status` is what
  turns a fire-and-forget apply into a real gate.
- **Lambda** — publish a version, shift the alias. Aliases plus weighted routing give canary
  deploys almost for free.
- **S3 + CloudFront** — `aws s3 sync` with correct cache headers (long max-age for hashed assets,
  short for `index.html`), then a CloudFront invalidation.

## Environments, Approvals, and Gates

Use **GitHub Environments** (`environment: production` on a job). They provide:
- **Required reviewers** — the manual approval gate. This is the mechanism that satisfies "never
  deploy production without approval."
- **Environment secrets and variables** — scoped so a dev job cannot read production values.
- **Deployment branch rules** — only `main` may deploy to production.
- **Wait timers** — a forced pause before a deploy proceeds.

Recommended separation: **dev** deploys automatically on merge · **staging** deploys
automatically and runs smoke tests · **production** requires approval, and deploys the *same
artifact* staging validated.

Beyond approvals, gates worth having: all tests green, security scans passed, staging smoke tests
passed, and a post-deploy health check that can trigger rollback.

**Secrets handling:** repository secrets for shared non-production values, environment secrets
for anything environment-specific, and — better still — no application secrets in GitHub at all.
Let the workload read from AWS Secrets Manager at runtime; GitHub only needs the identity to
deploy. Secrets are masked in logs but are trivially exfiltrated by any step that runs code, so
minimize what any given job can see.

## Deployment Strategies

| Strategy | How it works | Cost | Rollback | Use when |
|---|---|---|---|---|
| **Rolling** | Replace instances gradually | Low | Redeploy previous version | Default; stateless apps with health checks |
| **Blue/green** | Stand up a full second environment, switch traffic | Double infra during cutover | Switch traffic back — fast and clean | Low tolerance for failed deploys |
| **Canary** | Send a small traffic slice to the new version, then widen | Moderate; needs metrics | Shift traffic back | High traffic, real monitoring in place |
| **Manual approval** | Human gate before release | None | N/A — it's a gate, not a strategy | Always, for production |

Rolling is the right default. Blue/green and canary need supporting machinery (ECS with
CodeDeploy, ALB weighted target groups, Lambda alias weights, or Argo Rollouts on Kubernetes) —
name that cost rather than implying it's free.

**Rollback** — decide the mechanism before the first deploy:
- ECS: update the service to the previous task definition revision.
- Kubernetes: `kubectl rollout undo`.
- Lambda: point the alias at the previous version.
- S3: redeploy the previous artifact; keep versioning on.

Define the **rollback trigger** (error rate, failed health check, failed smoke test) and whether
rollback is automatic or human-initiated. And state the limit clearly: **rollback does not undo
database migrations.** Any pipeline running migrations needs them backward-compatible — expand,
migrate, then contract in a later release.

## Generating Workflows

Produce complete, working YAML with each step explained. Standard shape:

- `name`, and precise triggers (`push` on branches, `pull_request`, `workflow_dispatch` for
  manual runs, `schedule` for periodic scans).
- `concurrency` with `cancel-in-progress` for PR builds — but **never** cancel in-progress
  production deploys.
- Explicit `permissions`, minimal.
- Jobs with clear `needs` dependencies so the graph is visible.
- `timeout-minutes` on every job; a hung job otherwise burns runner minutes for six hours.
- Reusable workflows or composite actions when the same sequence appears in several places.
- Environment-scoped deploy jobs.

Explain in the pattern: **what this step does → why it's here for this project → what breaks
without it.**

Separate workflows by purpose: `ci.yml` (PR validation), `deploy.yml` (build and release),
`security.yml` (scheduled scans). One giant workflow is hard to read and slower to run.

## Reviewing an Existing Pipeline

| Issue | Why it matters |
|---|---|
| Static AWS keys in secrets | Long-lived credential that leaks permanently; OIDC exists |
| No `permissions:` block | Token is broader than the job needs |
| Unpinned third-party actions | Supply-chain compromise runs with your credentials |
| `pull_request_target` with untrusted checkout | Direct secret exfiltration path |
| Automatic production deploy with no gate | No human check on the riskiest operation |
| Rebuilds per environment | Production runs an artifact nobody tested |
| `:latest` tags | Non-deterministic deploys and rollbacks |
| No deploy wait / health check | Pipeline reports green while the deploy is failing |
| No rollback path | Failure means improvising under pressure |
| Missing security scans | Vulnerabilities ship silently |
| Secrets echoed or passed on a command line | Visible in logs or the process table |
| No caching | Slow pipeline, and slow pipelines get bypassed |
| No `timeout-minutes` | Hung jobs burn minutes |
| Tests that can't fail the build | Theatre |
| Overly broad OIDC trust policy | Any branch can assume the deploy role |

## Troubleshooting

**Start with:** the failing step's full log, `Re-run failed jobs with debug logging`, and the
diff of what changed since the last green run.

- **Works locally, fails in CI** — different runtime version, missing env var, dependency
  installed globally on your machine, case-sensitive filesystem on Linux vs Windows/macOS, or
  something not committed. Check the runner's tool versions first.
- **Flaky tests** — timing, shared state between tests, ports colliding, or a service container
  not ready. Add readiness waits before blaming the tests.
- **Cache never hits** — the cache key doesn't include the right lockfile, or the path is wrong.
- **`Unable to locate credentials`** — missing `id-token: write`, missing `permissions` block, a
  trust policy that doesn't match the repo/branch/environment, or a wrong region.
- **`Not authorized to perform sts:AssumeRoleWithWebIdentity`** — trust policy `sub` mismatch.
  Print the claim conditions and compare character by character against the workflow's context.
- **ECR push denied** — role lacks `ecr:GetAuthorizationToken` (an account-level action) or
  repository-scoped push permissions; or the repository doesn't exist.
- **ECS deploy "succeeds" but nothing changed** — the service wasn't forced to a new deployment,
  or the task definition revision wasn't updated. Check whether tasks are actually cycling.
- **ECS tasks start then die** — this is a container problem, not a pipeline problem; read the
  task's stopped reason and CloudWatch logs, then hand off to `docker`.
- **Deploy job hangs** — waiting for a stability condition that will never be met, usually a
  failing health check. Set a timeout so it fails loudly instead of quietly.
- **Secret is empty** — environment secret referenced from a job with no `environment:`, or a
  secret not available to forked-PR workflows (by design).
- **Job skipped unexpectedly** — an `if:` condition or a `needs:` dependency that failed.

## Output When Designing a Pipeline

1. **Project analysis** — stack, existing tooling, what already works locally.
2. **Deployment target** — where this ships and what that constrains.
3. **Recommended pipeline** — the stage diagram, with what runs on PRs vs on merge.
4. **Workflow files** — complete YAML, every step explained.
5. **Security controls** — which scans, blocking or reporting, and why.
6. **Environment separation** — environments, their protection rules, and the promotion path.
7. **Secrets handling** — what lives where, and what should never be in GitHub at all.
8. **AWS identity** — the OIDC role(s) and trust conditions required (as a requirement handed to
   `terraform`, not provisioned here).
9. **Rollback strategy** — mechanism, trigger, who pulls it, and the migration caveat.
10. **Troubleshooting notes** — the two or three failure modes most likely for this setup.

Close with what to verify: the pipeline runs green on a trivial PR, the artifact is reproducible,
no secret appears in any log, the production gate actually blocks, and rollback has been
practiced at least once before it is needed.
