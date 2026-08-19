# Template — Production Readiness Checklist

Output template for `.claude/workflows/production-readiness.md`.

Contains no project-specific values. Replace every `<placeholder>`.

---

## How To Use This Checklist

**Status marker** — put one in each `[ ]`:

| Marker | Status | Meaning |
|---|---|---|
| `[✓]` | **PASS** | Verified in place and adequate. **Verified, not assumed** |
| `[!]` | **WARN** | Present but weak, or absent and survivable short-term |
| `[✗]` | **FAIL** | Must be resolved before production |
| `[-]` | **N/A** | Genuinely does not apply — **state why in Notes** |
| `[ ]` | not assessed | Nothing has been checked yet |

**Priority** — `P0` blocks launch · `P1` within a week · `P2` within a month · `P3` backlog

**Two rules that keep this honest:**

1. **`[✓]` means verified.** If you could not check it, mark `[!]` and write
   *"unverified — needs `<what>`"* in Notes. A checklist of unverified ticks is worse than none.
2. **`[-]` needs a reason.** Unexplained N/A is how real gaps hide.

Items needing more than a Notes line use the expanded form:

```
[✗] <Item>
    Owner:    <who>
    Priority: P0
    Notes:    Issue — <what is wrong>
              Risk  — <concrete failure scenario: who is affected, how you'd find out>
              Fix   — <specific change> (skill: <owner skill>)
              Evidence — <file:line or "not found in <where you looked>">
```

---

# Production Readiness Checklist

**Project:** `<name>` · **Date:** `<date>` · **Environment:** production
**Region:** `<region>` · **Assessed by:** DevOps Architect Agent

**The bar being applied:** `<internal tool / small production system / public system handling
sensitive data>` — **because** `<reason>`

| Input | Value |
|---|---|
| Uptime target | `<99.x% / UNKNOWN>` |
| RPO — tolerable data loss | `<duration / UNKNOWN>` |
| RTO — required recovery time | `<duration / UNKNOWN>` |
| Data sensitivity / compliance | `<UNKNOWN>` |
| Expected traffic at launch | `<UNKNOWN>` |
| Who operates this | `<>` |
| Anyone on call? | `<yes/no>` |

**Reviewed:** `<what was inspected>` · **Could not review:** `<what, and why>`

---

## Architecture

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Design documented and matches what is actually deployed | | | |
| `[ ]` | Components and dependencies known | | | |
| `[ ]` | **No undocumented manual steps** | | | |
| `[ ]` | Environments separated (dev / staging / prod) | | | |
| `[ ]` | Staging meaningfully resembles production | | | |
| `[ ]` | No single points of failure that matter | | | |
| `[ ]` | Dependency failure modes understood | | | |

---

## Security

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | No secrets in source control, images, or **git history** | | | |
| `[ ]` | Dependency scanning in pipeline | | | |
| `[ ]` | Secret scanning + push protection enabled | | | |
| `[ ]` | SAST in pipeline | | | |
| `[ ]` | Container image scanning | | | |
| `[ ]` | IaC scanning | | | |
| `[ ]` | No known critical CVEs on reachable paths | | | |
| `[ ]` | Authn/authz enforced server-side on **every** endpoint | | | |
| `[ ]` | Input validation on public endpoints | | | |
| `[ ]` | Rate limiting on public endpoints | | | |
| `[ ]` | WAF where genuinely exposed | | | |

---

## IAM

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Roles not users; no long-lived access keys | | | |
| `[ ]` | Least privilege on every workload role | | | |
| `[ ]` | No `Action="*"` / `Resource="*"` without written justification | | | |
| `[ ]` | **CI/CD OIDC trust scoped to repo AND branch/environment** | | | |
| `[ ]` | Separate deploy role per environment | | | |
| `[ ]` | No privilege-escalation paths (`iam:PassRole`, policy edit) | | | |
| `[ ]` | MFA on human access | | | |
| `[ ]` | Root account unused, no root access keys | | | |

---

## Secrets

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Stored in Secrets Manager / Parameter Store | | | |
| `[ ]` | Injected at runtime — not baked into images | | | |
| `[ ]` | Encrypted at rest | | | |
| `[ ]` | Access restricted by IAM | | | |
| `[ ]` | Rotation plan exists (even if manual) | | | |
| `[ ]` | Application survives a rotation | | | |
| `[ ]` | Not in logs, CI output, or unmarked Terraform outputs | | | |
| `[ ]` | `.gitignore` covers `.env*`, `*.tfstate*`, `*.tfvars`, `.terraform/` | | | |
| `[ ]` | No secret found committed *(if found: COMPROMISED — rotate)* | | | |

---

## Networking

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Databases and internal services in private subnets | | | |
| `[ ]` | **No `0.0.0.0/0` on SSH, RDP, or database ports** | | | |
| `[ ]` | Security groups reference groups, not broad CIDRs | | | |
| `[ ]` | Egress considered, not just ingress | | | |
| `[ ]` | Load balancer configured with health checks | | | |
| `[ ]` | VPC endpoints where they reduce exposure | | | |
| `[ ]` | **Every internet-reachable path enumerated and intentional** | | | |

---

## Docker

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Pinned base image — not `:latest` | | | |
| `[ ]` | Multi-stage build; no build tools in runtime image | | | |
| `[ ]` | Runs as non-root | | | |
| `[ ]` | **No secrets in any layer** (`docker history` verified) | | | |
| `[ ]` | `.dockerignore` effective | | | |
| `[ ]` | Healthcheck defined | | | |
| `[ ]` | Exec-form `CMD` — graceful `SIGTERM` | | | |
| `[ ]` | Immutable tags (git SHA) | | | |
| `[ ]` | Image scanned before registry push | | | |

---

## Kubernetes

*Mark the whole section `[-]` with a reason if Kubernetes is not used.*

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Resource requests and limits on every container | | | |
| `[ ]` | Liveness, readiness, and startup probes appropriate to the app | | | |
| `[ ]` | Replicas > 1 for anything that must stay up | | | |
| `[ ]` | PodDisruptionBudget defined | | | |
| `[ ]` | Rolling update parameters set | | | |
| `[ ]` | SecurityContext hardened (non-root, no privilege escalation) | | | |
| `[ ]` | RBAC scoped; no `cluster-admin` on workloads | | | |
| `[ ]` | NetworkPolicy in place (default-deny) | | | |
| `[ ]` | No `:latest` image tags | | | |
| `[ ]` | Secrets from an external store | | | |
| `[ ]` | Namespace isolation | | | |

---

## Terraform

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | **All production infrastructure in code — nothing critical by hand** | | | |
| `[ ]` | Remote state with locking | | | |
| `[ ]` | State bucket versioned and encrypted | | | |
| `[ ]` | State bucket access restricted | | | |
| `[ ]` | Separate state per environment | | | |
| `[ ]` | **`prevent_destroy` on every data store** | | | |
| `[ ]` | Providers and modules version-pinned | | | |
| `[ ]` | No secrets in `.tf` or `.tfvars` | | | |
| `[ ]` | Plan reviewed; no unexpected destroys or replacements | | | |
| `[ ]` | Drift checked | | | |
| `[ ]` | Resources tagged consistently | | | |
| `[ ]` | A second person could apply this safely | | | |

---

## CI/CD

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Builds, tests, and scans on every change | | | |
| `[ ]` | **Build once, promote the same artifact** | | | |
| `[ ]` | **Production deploy requires explicit approval (required reviewers)** | | | |
| `[ ]` | Deploy identity is OIDC and least-privilege | | | |
| `[ ]` | No static AWS credentials anywhere | | | |
| `[ ]` | Third-party actions pinned by SHA | | | |
| `[ ]` | Minimal explicit `permissions:` per workflow | | | |
| `[ ]` | **Deploy waits for stability — not fire-and-forget** | | | |
| `[ ]` | Smoke test after deploy | | | |
| `[ ]` | Pipeline documented; someone other than the author can release | | | |

---

## Database

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Private; not publicly accessible | | | |
| `[ ]` | Encrypted at rest | | | |
| `[ ]` | TLS enforced in transit | | | |
| `[ ]` | Deletion protection enabled | | | |
| `[ ]` | `skip_final_snapshot = false` | | | |
| `[ ]` | Connection limit reconciled against application pool size | | | |
| `[ ]` | Least-privilege database user (not superuser) | | | |
| `[ ]` | **Migrations backward-compatible with running version** | | | |
| `[ ]` | Migrations tested against production-like data volume | | | |
| `[ ]` | Slow query logging enabled | | | |

---

## Backups

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Automated backups on every data store | | | |
| `[ ]` | Frequency meets the stated RPO | | | |
| `[ ]` | Retention defined | | | |
| `[ ]` | Backups encrypted | | | |
| `[ ]` | **Backups survive compromise of the primary account** | | | |
| `[ ]` | **A restore has actually been tested** — date: `<____>` | | | |

> An untested backup is a hypothesis. No verified backups + no tested restore = **FAIL**.

---

## Monitoring

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Latency p95/p99 collected per service | | | |
| `[ ]` | Error rate collected | | | |
| `[ ]` | Traffic / throughput collected | | | |
| `[ ]` | Saturation (CPU, memory, connections) collected | | | |
| `[ ]` | Database metrics including connection count | | | |
| `[ ]` | Dashboard exists and someone will actually open it | | | |
| `[ ]` | Deploy events visible alongside metrics | | | |

---

## Logging

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Application logs shipped centrally | | | |
| `[ ]` | Structured (JSON) | | | |
| `[ ]` | Correlation / request IDs across services | | | |
| `[ ]` | **Retention set on every log group** | | | |
| `[ ]` | No sensitive data logged | | | |
| `[ ]` | Access logs enabled | | | |
| `[ ]` | Queryable fast enough to be useful mid-incident | | | |

---

## Alerting

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Service availability alert | | | |
| `[ ]` | Error rate alert | | | |
| `[ ]` | Latency alert | | | |
| `[ ]` | Saturation (CPU / memory / disk) alert | | | |
| `[ ]` | Database health and connection alerts | | | |
| `[ ]` | DLQ / queue depth alert | | | |
| `[ ]` | **Certificate expiry alert** | | | |
| `[ ]` | Failed deployment alert | | | |
| `[ ]` | **Budget / cost anomaly alert** | | | |
| `[ ]` | Every alert is actionable | | | |
| `[ ]` | Alerts reach a human who will respond | | | |
| `[ ]` | Each alarm carries a runbook line | | | |

---

## Scalability

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Stateless, or state externalized | | | |
| `[ ]` | No single-instance assumptions (in-process schedulers, local writes) | | | |
| `[ ]` | Autoscaling configured | | | |
| `[ ]` | **Autoscaling verified to scale DOWN** | | | |
| `[ ]` | Database connection ceiling accounted for | | | |
| `[ ]` | Caching where needed | | | |
| `[ ]` | Load tested, or the ceiling stated honestly | | | |
| `[ ]` | **First bottleneck known by name** | | | |

---

## Availability

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Meets the stated uptime target | | | |
| `[ ]` | Multi-AZ where required | | | |
| `[ ]` | Redundancy: replicas > 1 for critical components | | | |
| `[ ]` | **Health checks verify real serving capability** | | | |
| `[ ]` | Graceful shutdown and connection draining | | | |
| `[ ]` | Retries with backoff on dependency calls | | | |
| `[ ]` | Graceful degradation when a dependency fails | | | |
| `[ ]` | No deploy-induced downtime | | | |

---

## Performance

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Latency measured against a target | | | |
| `[ ]` | Database queries indexed; no known N+1 on hot paths | | | |
| `[ ]` | Connection pooling configured | | | |
| `[ ]` | Cold start impact understood (if serverless) | | | |
| `[ ]` | Static assets cached / CDN-served | | | |
| `[ ]` | Resource sizing based on measurement, not guesswork | | | |
| `[ ]` | CPU/memory requests and limits set from observed usage | | | |
| `[ ]` | No recent OOM kills | | | |

---

## Cost

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Monthly cost estimated **and accepted by the user** | | | |
| `[ ]` | Fixed monthly floor known: `<$____/mo>` | | | |
| `[ ]` | **Budget alarm configured** | | | |
| `[ ]` | Cost anomaly detection enabled | | | |
| `[ ]` | Cost allocation tags applied and activated in billing | | | |
| `[ ]` | Log retention policies set | | | |
| `[ ]` | ECR lifecycle policy set | | | |
| `[ ]` | Snapshot / backup lifecycle set | | | |
| `[ ]` | Non-production environments sized down | | | |
| `[ ]` | No obvious waste (unattached volumes, idle resources) | | | |

---

## DNS

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Domain registered and controlled by the right account | | | |
| `[ ]` | Registrar nameservers match the hosted zone | | | |
| `[ ]` | Records correct and tested | | | |
| `[ ]` | TTLs appropriate for cutover | | | |
| `[ ]` | Health-check-based failover if required | | | |
| `[ ]` | Domain registration not about to lapse | | | |

---

## TLS

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Valid certificate on every public endpoint | | | |
| `[ ]` | Auto-renewal configured **and verified** | | | |
| `[ ]` | **Expiry monitored regardless of auto-renewal** | | | |
| `[ ]` | HTTP redirects to HTTPS | | | |
| `[ ]` | Modern TLS version and cipher policy | | | |
| `[ ]` | Certificate covers every hostname in use (apex and `www`) | | | |

---

## Deployment

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Strategy chosen deliberately and matched to risk tolerance | | | |
| `[ ]` | **Zero-downtime verified, not assumed** | | | |
| `[ ]` | Deploy is repeatable and documented | | | |
| `[ ]` | A failed deploy fails loudly, not silently | | | |
| `[ ]` | Deployed artifact identical to the one validated in staging | | | |
| `[ ]` | Point of no return identified (or none) | | | |

---

## Rollback

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | **A rollback path exists** | | | |
| `[ ]` | **Rollback has been practiced** — date: `<____>` | | | |
| `[ ]` | Rollback time known: `<____>` | | | |
| `[ ]` | Previous artifact still available and deployable | | | |
| `[ ]` | Migrations reversible or forward-fixable | | | |
| `[ ]` | Rollback trigger criteria defined | | | |
| `[ ]` | Someone knows how to execute it under pressure | | | |

> Absent or untested rollback is **FAIL**, always.
> Rollback does not undo database migrations.

---

## Disaster Recovery

| [ ] | Item | Owner | Priority | Notes |
|---|---|---|---|---|
| `[ ]` | Failure scenarios enumerated (instance / AZ / region / deletion / corruption / compromise) | | | |
| `[ ]` | Documented recovery procedure | | | |
| `[ ]` | **RTO achievable and measured, not assumed** | | | |
| `[ ]` | RPO achieved by current backup strategy | | | |
| `[ ]` | Executable by someone other than the author | | | |
| `[ ]` | Single-resource dependencies understood | | | |
| `[ ]` | **Ransomware posture: backups survive an admin compromise** | | | |

---

# Summary

## Critical Blockers

> **Every item here must be resolved before production. No exceptions for schedule pressure.**
> If none: state *"No critical blockers identified."* explicitly.

```
[✗] <Category> — <Short title>
    Owner:    <who>
    Priority: P0
    Notes:    Issue — <what is wrong>
              Risk  — <concrete failure scenario>
              Fix   — <specific change> (skill: <owner skill>)
              Evidence — <file:line or "not found in <where>">
```

**Veto check — all four must be clear for a GO:**

| Veto condition | Clear? |
|---|---|
| No data loss risk — backups exist, **restore tested**, deletion protection on | `[ ]` |
| No critical security risk — no exposed credentials, nothing sensitive internet-reachable | `[ ]` |
| No unaddressed single point of failure without a recovery path | `[ ]` |
| **Tested rollback path exists** | `[ ]` |

*Any unchecked box = NO-GO, regardless of score.*

---

## Warnings

Present but weak, or absent and survivable short-term. `P1` before or immediately after launch;
`P2` within a month.

| [!] | Category | Item | Owner | Priority | Risk if unresolved |
|---|---|---|---|---|---|
| `[!]` | | | | | |

---

## Recommendations

Worth doing. Not launch-blocking. `P3`.

| Category | Recommendation | Owner | Benefit |
|---|---|---|---|

---

## Overall Readiness

**Weighted scoring** — a missing backup is not equal to a missing dashboard.

| Weight | Categories | PASS | WARN | FAIL | N/A | Weighted |
|---|---|---|---|---|---|---|
| **×3** Critical | Security · Secrets · IAM · Backups · Rollback · Availability | | | | | |
| **×2** Important | Networking · Monitoring · Alerting · CI/CD · Deployment · Terraform · Database · Disaster Recovery | | | | | |
| **×1** Standard | Architecture · Docker · Kubernetes · Logging · Scalability · Performance · Cost · DNS · TLS | | | | | |

PASS = 1.0 · WARN = 0.5 · FAIL = 0 · N/A excluded from both sides.

**Score = (Σ weight × value) / (Σ weight applicable) × 100 = `<__>` / 100**

| Score | Reading |
|---|---|
| 90–100 | Strong — launch with remaining warnings tracked |
| 75–89 | Workable — address P1 before or immediately after launch |
| 60–74 | Not ready — meaningful gaps |
| < 60 | Substantially unprepared |

| Count | Value |
|---|---|
| FAIL | `<n>` |
| WARN | `<n>` |
| PASS | `<n>` |
| N/A | `<n>` |
| Unverified (marked `[!]`) | `<n>` |

> **The score does not override the veto.** A 92% with one blocked backup item is still NO-GO.
> State score and verdict **separately**.

---

## Approval

### Verdict

> # 🟢 GO · 🟡 CONDITIONAL GO · 🔴 NO-GO
>
> **Reason:** `<one sentence>`

**What must change before launch**

| # | Item | Owner skill | Est. effort |
|---|---|---|---|

**Fastest safe path to green:** `<>`

**What to watch in the first 48 hours**

| Signal | Threshold | Where | What it means |
|---|---|---|---|

**Accepted risks** *(complete only if launching with open warnings)*

> The following remain unresolved. Launching with them is the **user's accepted risk**, not an
> approval by this assessment.

| # | Risk | Impact if it occurs | Accepted by | Date | Plan to resolve |
|---|---|---|---|---|---|

### Sign-off

| Item | Status | By | Date |
|---|---|---|---|
| Checklist completed | `[ ]` | | |
| Blockers resolved or none found | `[ ]` | | |
| Veto check clear | `[ ]` | | |
| Open risks explicitly accepted | `[ ]` | | |
| **PRODUCTION LAUNCH APPROVED** | `[ ]` | `<user>` | `<date>` |

---

**Next step**

- **GO** → proceed to `.claude/workflows/deployment.md` Step 15 for the Deploy Brief.
  **Readiness passing is not deployment approval — those are two separate yeses.**
- **CONDITIONAL GO** → user selects which warnings to accept; record each above.
- **NO-GO** → route each blocker to its owning skill, fix, then **re-run this checklist in full**.
  Do not spot-check only the failed item — a fix can move something else.

> **This document is an assessment. Nothing has been deployed.**
