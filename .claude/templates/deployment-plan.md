# Template — Deployment Plan

Output template for `.claude/workflows/deployment.md`.

Fill every section. If a section does not apply, write **N/A** with the reason.
Anything not determinable is **UNKNOWN** — never a guess. Replace every `<placeholder>`.

Checkbox convention: `⬜` not done · `✅` done and verified · `❌` failed · `➖` N/A

---

# Deployment Plan

**Document version:** `<n>` · **Date:** `<date>` · **Prepared by:** DevOps Architect Agent
**Status:** ⬜ draft · ⬜ ready for approval · ⬜ **APPROVED** · ⬜ deployed

---

## Project

| Field | Value |
|---|---|
| Project name | `<name>` |
| Repository | `<url>` |
| Architecture document | `<link>` — approved `<date>` |
| Change summary | `<one sentence: what this deployment delivers>` |
| Change type | first launch / feature release / hotfix / infrastructure change / rollback |
| Requested by | `<user>` |
| Deployment window | `<date/time, or "any">` |

**What will change**

`<One paragraph in plain language: what exists now, what will exist after.>`

**Why**

`<The requirement, ticket, or incident driving this.>`

---

## Environment

| Environment | Purpose | AWS account | Region | Deployed by |
|---|---|---|---|---|
| dev | `<>` | `<account>` | `<region>` | automatic |
| staging | `<>` | `<account>` | `<region>` | automatic on merge |
| **production** | `<>` | `<account>` | `<region>` | **approval required** |

**This deployment targets:** ⬜ dev · ⬜ staging · ⬜ **production**

**Differences between staging and production** *(anything untested in staging is a risk)*

| Aspect | Staging | Production | Risk this creates |
|---|---|---|---|

---

## Deployment Target

| Field | Value |
|---|---|
| Compute platform | `<ECS / EKS / Lambda / EC2 / S3+CloudFront>` |
| Service / cluster / function name | `<name>` |
| Deploy mechanism | `<see table below>` |
| Stability gate | `<how the pipeline confirms the deploy landed>` |
| Deployment strategy | rolling / blue-green / canary / recreate |
| Expected duration | `<minutes>` |

| Target | Mechanism | Stability gate |
|---|---|---|
| ECS | render task def → register → update service | `--wait services-stable` |
| EKS | `update-kubeconfig` → apply / `helm upgrade` | `kubectl rollout status` |
| Lambda | publish version → shift alias | alias points at new version |
| EC2 | CodeDeploy / ASG instance refresh | health check + batch size |
| S3+CloudFront | `s3 sync` → invalidation | invalidation complete |

---

## Prerequisites

**All must be ✅ before proceeding.**

| # | Prerequisite | Status | Evidence |
|---|---|---|---|
| 1 | Architecture approved by user | ⬜ | `<date>` |
| 2 | Blocking questions answered; assumptions confirmed | ⬜ | |
| 3 | Fixed monthly cost floor seen and accepted | ⬜ | `<$/mo>` |
| 4 | Target AWS account and region confirmed | ⬜ | |
| 5 | Terraform remote state configured (locking + versioning) | ⬜ | |
| 6 | OIDC provider and deploy roles exist | ⬜ | |
| 7 | Domain / DNS zone controlled | ⬜ | |
| 8 | TLS certificate issued and validated | ⬜ | |
| 9 | Staging deployed and validated with this artifact | ⬜ | `<date>` |
| 10 | Production readiness assessment passed | ⬜ | score `<n>`/100 |
| 11 | Rollback path tested in staging | ⬜ | `<date>` |
| 12 | Backups verified and restore tested | ⬜ | `<date>` |

**Blocked on:** `<list any unmet prerequisite, or "none">`

---

## Infrastructure

**Provisioned by:** Terraform / manual / mixed — *(if mixed, list what is manual and why)*

### Terraform plan summary

```
Plan: <N> to add, <N> to change, <N> to destroy
```

| Symbol | Resource | Action | Reason | Risk |
|---|---|---|---|---|
| `+` | `<resource>` | create | | |
| `~` | `<resource>` | update in place | | |
| `-/+` | `<resource>` | **REPLACE — downtime / data loss** | | |
| `-` | `<resource>` | **DESTROY** | | |

**Forced replacements:** ⬜ none · ⬜ `<list — must be surfaced before approval>`
**Destroys:** ⬜ none · ⬜ `<list>`

### Infrastructure checklist

| Item | Status |
|---|---|
| `terraform fmt` / `validate` clean | ⬜ |
| Plan reviewed line by line, every `-` and `-/+` read | ⬜ |
| `prevent_destroy` on every data store | ⬜ |
| Providers and modules version-pinned | ⬜ |
| State separated per environment | ⬜ |
| No secrets in `.tf` or `.tfvars` | ⬜ |
| Resources tagged (`Environment`, `Project`, `ManagedBy`, `Owner`) | ⬜ |
| IaC security scan passed | ⬜ |
| **Plan saved to file and that exact file will be applied** | ⬜ |

### Networking

| Item | Configuration | Verified |
|---|---|---|
| VPC / subnets | `<>` | ⬜ |
| Compute in private subnets | `<>` | ⬜ |
| Database in private/isolated subnets | `<>` | ⬜ |
| Security group rules | `<>` | ⬜ |
| `0.0.0.0/0` rules and justification | `<none, or list + reason>` | ⬜ |
| Load balancer + health check | `<>` | ⬜ |
| TLS / HTTPS redirect | `<>` | ⬜ |
| DNS records and TTLs | `<>` | ⬜ |
| VPC endpoints | `<>` | ⬜ |

---

## Configuration

**Rule:** the same image runs in every environment; only configuration differs.

| Variable | Purpose | Required | Default | Secret? | Source at runtime | Set |
|---|---|---|---|---|---|---|
| `<NAME>` | `<>` | yes/no | `<>` | yes/no | `<task def / ConfigMap / SSM>` | ⬜ |

**Configuration checklist**

| Item | Status |
|---|---|
| Every required variable present in the target environment | ⬜ |
| No environment-specific values baked into the image | ⬜ |
| No secrets in `ENV` or `ARG` (visible in `docker history`) | ⬜ |
| Config changes documented and version-controlled | ⬜ |
| Same artifact runs in dev, staging, and production | ⬜ |

**New or changed variables in this deployment:** `<list, or "none">`

---

## Secrets

| Secret | Store | Consumed by | Rotation | IAM principal with read | Set |
|---|---|---|---|---|---|
| `<name>` | Secrets Manager / SSM | `<component>` | auto / manual / none | `<role>` | ⬜ |

**Secrets checklist**

| Item | Status |
|---|---|
| Container created by Terraform; **value set out of band** | ⬜ |
| Read at runtime by ARN — never baked into the image | ⬜ |
| Encrypted at rest; IAM-restricted | ⬜ |
| Not in code, images, `.tfvars`, manifests, or CI config | ⬜ |
| Not in logs, CI output, or unmarked Terraform outputs | ⬜ |
| `.gitignore` covers `.env*`, `*.tfstate*`, `*.tfvars`, `.terraform/` | ⬜ |
| Application survives a rotation without manual intervention | ⬜ |

**Secrets found committed to the repository:**
⬜ none · ⬜ **`<file>` — COMPROMISED, ROTATION REQUIRED before deployment**

---

## Container / Image

| Field | Value |
|---|---|
| Image repository | `<registry/repo>` |
| **Tag being deployed** | `<git SHA>` |
| Image digest | `sha256:<...>` |
| Built by | `<workflow run / commit>` |
| Base image | `<pinned tag>` |
| Final size | `<MB>` |
| Target architecture | `<linux/amd64>` |
| Scan result | `<n>` critical · `<n>` high — ⬜ passed policy |

**Image checklist**

| Item | Status |
|---|---|
| Pinned base image — not `:latest` | ⬜ |
| Multi-stage build; no build tools in runtime image | ⬜ |
| Runs as non-root (`docker exec whoami` verified) | ⬜ |
| **No secrets in any layer** (`docker history` verified) | ⬜ |
| `.dockerignore` excludes `.git`, `node_modules`, `.env` | ⬜ |
| Healthcheck defined | ⬜ |
| Exec-form `CMD` — graceful `SIGTERM` | ⬜ |
| Port configurable, bound to `0.0.0.0` | ⬜ |
| Immutable tag; scanned before registry push | ⬜ |
| **Identical artifact validated in staging** | ⬜ |

---

## CI/CD Pipeline

| Stage | Status | Duration | Notes |
|---|---|---|---|
| Lint / type check | ⬜ | | |
| Unit tests | ⬜ | | |
| Integration tests | ⬜ | | |
| Security scans (dep · secret · SAST · IaC) | ⬜ | | |
| Build | ⬜ | | |
| Image scan | ⬜ | | |
| Registry push | ⬜ | | |
| Staging deploy | ⬜ | | |
| Staging validation | ⬜ | | |
| **Production approval gate** | ⬜ | | |
| Production deploy | ⬜ | | |

**Pipeline checklist**

| Item | Status |
|---|---|
| Build once, promote the same artifact | ⬜ |
| No static AWS credentials — OIDC only | ⬜ |
| OIDC trust scoped to repo **and** branch/environment | ⬜ |
| Minimal explicit `permissions:` per workflow | ⬜ |
| Third-party actions pinned by SHA | ⬜ |
| Deploy waits for stability, not fire-and-forget | ⬜ |
| Production job gated by required reviewers | ⬜ |

**Workflow run:** `<url or run id>`

---

## Database Changes

⬜ **No database changes in this deployment** — skip to Deployment Steps.

| Migration | Description | Reversible | Duration (est.) | Locks table? |
|---|---|---|---|---|
| `<id>` | `<>` | yes/no | `<>` | yes/no |

**Migration checklist**

| Item | Status |
|---|---|
| **Backward-compatible with the currently running version** | ⬜ |
| Tested against production-like data volume | ⬜ |
| Run order relative to deploy defined (before / after / during) | ⬜ |
| Rollback path for the schema defined | ⬜ |
| Long-running or locking migrations identified | ⬜ |
| **Fresh backup taken immediately before migration** | ⬜ |
| Data volume / expected duration in production known | ⬜ |

> ⚠ **Rollback does not undo migrations.** Migrations must be backward-compatible with the
> previous application version — expand, migrate, then contract in a later release.
>
> **This deployment's migrations are backward-compatible:** ⬜ yes · ⬜ no · ➖ N/A
> *If no — the deployment is one-way. State this explicitly in Approval Required.*

---

## Deployment Steps

Numbered, in order. Mark anything destructive or production-touching.

| # | Step | Command / action | Expected result | Destructive? | Est. time |
|---|---|---|---|---|---|
| 1 | `<pre-deploy backup>` | `<>` | `<>` | | |
| 2 | `<apply infrastructure>` | `terraform apply tfplan` | `<>` | ⚠ **APPROVAL** | |
| 3 | `<run migrations>` | `<>` | `<>` | ⚠ | |
| 4 | `<deploy application>` | `<>` | `<>` | | |
| 5 | `<wait for stability>` | `<>` | `<>` | | |
| 6 | `<smoke test>` | `<>` | `<>` | | |

**Downtime expected:** ⬜ none · ⬜ `<duration>` — **users affected:** `<>`

**Point of no return:** `<the step after which rollback becomes difficult or impossible — state it
explicitly, or "none">`

---

## Health Checks

| Layer | Endpoint / mechanism | Interval | Threshold | Verifies |
|---|---|---|---|---|
| Container | `HEALTHCHECK` | `<>` | `<>` | process serving |
| Orchestrator — readiness | `<path>` | `<>` | `<>` | ready for traffic |
| Orchestrator — liveness | `<path>` | `<>` | `<>` | not wedged |
| Load balancer | `<path>` | `<>` | `<>` | target healthy |

**Health check checklist**

| Item | Status |
|---|---|
| Endpoint verifies the app can **serve**, not just that the process is alive | ⬜ |
| Liveness does **not** check downstream dependencies | ⬜ |
| Thresholds tuned for real startup time | ⬜ |
| Healthy state confirmed in staging with this artifact | ⬜ |

---

## Validation

**Do not assume something works because a command succeeded.**

| # | Check | Method | Expected | Status |
|---|---|---|---|---|
| 1 | Deploy completed | `<stability command>` | new version running | ⬜ |
| 2 | Targets healthy | `<>` | all healthy | ⬜ |
| 3 | Smoke test — core path | `<curl / script>` | `<>` | ⬜ |
| 4 | Authentication works | `<>` | `<>` | ⬜ |
| 5 | Database connectivity | `<>` | `<>` | ⬜ |
| 6 | Error rate | `<dashboard>` | at baseline | ⬜ |
| 7 | Latency p95 | `<dashboard>` | at baseline | ⬜ |
| 8 | Logs arriving, no startup errors | `<>` | clean | ⬜ |
| 9 | Alarms in OK (not INSUFFICIENT_DATA) | `<>` | OK | ⬜ |
| 10 | Nothing newly reachable that shouldn't be | `<>` | `<>` | ⬜ |
| 11 | Background jobs / queues processing | `<>` | `<>` | ⬜ |
| 12 | Graceful shutdown on `SIGTERM` | `<>` | drains cleanly | ⬜ |

**Verified:** `<>` · **Could not verify:** `<>` · **Still risky:** `<>`

---

## Rollback Plan

| Field | Value |
|---|---|
| **Mechanism** | `<per target — see below>` |
| Roll back to | `<previous artifact SHA>` |
| Estimated time to roll back | `<minutes>` |
| Executed by | `<who>` |
| **Practiced in staging** | ⬜ not practiced · ✅ `<date>` |
| Automatic or manual | `<>` |

| Target | Rollback command |
|---|---|
| ECS | update service → previous task definition revision |
| EKS | `kubectl rollout undo deployment/<name>` |
| Lambda | point alias at previous version |
| S3 | redeploy previous artifact (versioning on) |
| Terraform | re-apply previous configuration — **review the plan; it may show destroys** |

**Rollback triggers** — roll back without further debate if any occur:

| Trigger | Threshold |
|---|---|
| Smoke test failure | any |
| Error rate | `> <X>%` for `<duration>` |
| Latency p95 | `> <X>ms` for `<duration>` |
| Health checks failing | `<n>` consecutive |
| Data integrity concern | any |

**Database rollback:** `<schema rollback path, or "migrations are backward-compatible; no schema
rollback needed">`

**What rollback does NOT restore:** `<data written by the new version, migrated schema, external
side effects — state explicitly>`

---

## Monitoring

**Watch for `<duration>` after deployment.**

| Signal | Where | Baseline | Alert threshold | Watched |
|---|---|---|---|---|
| Error rate | `<dashboard>` | `<>` | `<>` | ⬜ |
| Latency p95 / p99 | `<>` | `<>` | `<>` | ⬜ |
| Request rate | `<>` | `<>` | `<>` | ⬜ |
| CPU / memory | `<>` | `<>` | `<>` | ⬜ |
| Task / pod restarts | `<>` | `0` | any | ⬜ |
| Database connections | `<>` | `<>` | `<>` | ⬜ |
| Queue depth / DLQ | `<>` | `<>` | any in DLQ | ⬜ |

**Monitoring checklist**

| Item | Status |
|---|---|
| Alarms configured and in OK state before deploy | ⬜ |
| Log retention set on all new log groups | ⬜ |
| Deploy event visible on dashboards | ⬜ |
| Budget alarm configured | ⬜ |
| Alerts route to someone who will respond | ⬜ |

---

## Risks

| # | Risk | Likelihood | Impact | Mitigation | Detection |
|---|---|---|---|---|---|
| 1 | | low/med/high | low/med/high | | |

**Worst realistic outcome:** `<what the bad day looks like>`
**Blast radius if this goes wrong:** `<who and what is affected>`

---

## Approval Required

> ### ⛔ NOTHING HAS BEEN DEPLOYED TO PRODUCTION
>
> This deployment proceeds only on explicit approval for **this** deployment.
> Approval is per-deploy and never standing.

### Deploy Brief

| Item | Value |
|---|---|
| **What changes** | `<one paragraph>` |
| **Resources created** | `<n>` |
| **Resources modified** | `<n>` |
| **Resources destroyed** | **`<n>`** — `<list, or "none">` |
| **Forced replacements** | `<list, or "none">` |
| **Estimated cost impact** | `<+$X/mo, or none>` |
| **Downtime expected** | `<yes/no — duration>` |
| **Migrations** | `<what runs — reversible? backward-compatible?>` |
| **One-way / point of no return** | `<step, or "none">` |
| **Rollback** | `<mechanism — takes <duration> — practiced: yes/no>` |
| **Readiness score** | `<n>`/100 — verdict `<GO / CONDITIONAL GO>` |

**Open WARNINGs the user is accepting**

| # | Item | Risk if it occurs | Plan to resolve |
|---|---|---|---|

**Approval**

| Item | Status |
|---|---|
| Deploy Brief presented | ⬜ `<date>` |
| Open risks explicitly accepted by user | ⬜ |
| **PRODUCTION DEPLOYMENT APPROVED** | ⬜ **by `<user>` on `<date/time>`** |

---

## Post Deployment Verification

*Complete after deployment. Record what actually happened, including anything that differed
from plan.*

| Field | Value |
|---|---|
| Deployed at | `<date/time>` |
| Artifact deployed | `<SHA>` — same as staging: ⬜ yes · ⬜ no |
| Deploy duration | `<actual>` vs `<estimated>` |
| Downtime observed | `<actual>` vs `<expected>` |

### Immediate checks (0–15 min)

| # | Check | Result |
|---|---|---|
| 1 | Rollout completed; desired = running | ⬜ |
| 2 | All health checks green | ⬜ |
| 3 | Smoke tests passed | ⬜ |
| 4 | No error rate spike | ⬜ |
| 5 | Latency at baseline | ⬜ |
| 6 | No restart loop | ⬜ |
| 7 | Logs clean | ⬜ |

### Extended checks (15 min – 24 h)

| # | Check | Result |
|---|---|---|
| 1 | Error rate stable over the window | ⬜ |
| 2 | No memory growth trend | ⬜ |
| 3 | Background jobs and scheduled tasks ran | ⬜ |
| 4 | Queues draining normally | ⬜ |
| 5 | Database performance stable | ⬜ |
| 6 | No unexpected cost movement | ⬜ |
| 7 | Backups ran on schedule | ⬜ |

### Outcome

| Field | Value |
|---|---|
| **Result** | ⬜ success · ⬜ success with issues · ⬜ **rolled back** |
| Deviations from plan | `<>` |
| Steps skipped and why | `<>` |
| Issues encountered | `<>` |
| Rollback triggered | ⬜ no · ⬜ yes — `<reason and outcome>` |
| Temporary mitigations still in place | `<>` |
| Manual changes to reconcile into Terraform | `<>` |

**Honest summary of what happened**

`<Including anything that did not go to plan. If something is still uncertain, say so.>`

### Follow-up

| # | Action | Owner | Priority | Due |
|---|---|---|---|---|

**Deferred work:** `<>`
**What to change before the next deployment:** `<>`
