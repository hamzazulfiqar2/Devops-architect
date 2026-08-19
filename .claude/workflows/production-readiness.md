# Workflow — Production Readiness

**The final validation process before production deployment.**

This workflow runs after `.claude/workflows/deployment.md` has built and validated the system in
staging, and **before** any production deploy. It is the gate between "it works in staging" and
"it goes live".

```
ARCHITECTURE → SECURITY → INFRASTRUCTURE → APPLICATION → CI/CD → MONITORING
→ BACKUPS → DISASTER RECOVERY → COST → ROLLBACK → FINAL APPROVAL
```

Related skill: `production-readiness` (the detailed 26-domain checklist and scoring method).
Output template: `.claude/templates/production-checklist.md`

---

## Rules For This Workflow

**Do not deploy anything.** Not a smoke test against production, not a "quick check". This
workflow assesses; it does not act.

**Do not modify infrastructure or code.** Findings and recommendations only. Fixes are separate,
approved work.

**Do not run destructive or mutating commands.** Read-only inspection: manifests, IaC, pipeline
config, code, and read-only resource descriptions.

**Do not expose secrets.** Report file, line, and type — never the value.

**Do not assume unknown requirements.** Uptime target, RPO/RTO, compliance obligations, and
expected traffic are inputs. If a verdict depends on one you don't have, mark it
**WARN — needs information** and ask. Never invent an SLA to score against.

**PASS means verified, not assumed.** If you could not check it, it is **WARN — unverified**,
with what you'd need to confirm it. A checklist of unverified green ticks is worse than no
checklist.

---

## The Veto — Applied Throughout

**No GO recommendation while any of these remains unresolved:**

| Veto condition | What it looks like |
|---|---|
| **Data loss risk** | No backups · untested restore · no deletion protection / `prevent_destroy` · a deploy path that can destroy data |
| **Critical security risk** | Live credentials exposed · database or admin interface reachable from the internet · unauthenticated sensitive endpoint · wildcard admin permissions on an internet-facing workload |
| **Availability risk** | A single point of failure with no recovery path · no health checks · cannot survive one instance failing |
| **No rollback path** | No way back to last known-good · a one-way deploy (typically an irreversible migration) |

These are **FAIL**, always, regardless of schedule pressure.

If the launch date is fixed: state exactly what must change, give the fastest safe path, and offer
scope reductions — soft launch, limited users, feature flags, delayed migration. **Never convert
a FAIL item into a WARN because a date is inconvenient.** If the user chooses to launch
anyway, record it as **their accepted risk, in writing**, not as your approval.

---

## Classification

| Status | Meaning | Effect |
|---|---|---|
| **PASS** | Verified in place and adequate for this system's stated bar | none |
| **WARN** | Present but weak, or absent where absence is survivable short-term | conditional go |
| **FAIL** | Must be resolved before production | **no go** |
| **N/A** | Genuinely does not apply — **must state why** | none |

Unexplained N/A is how real gaps hide. Always give the reason.

---

## Step 0 — Establish the Bar

Before assessing, determine what "production" means here. An internal tool and a public payments
system get different bars — **say which one you are applying.**

- Real users, real money, real data?
- Uptime target, and what downtime costs
- **RPO** (tolerable data loss) and **RTO** (required recovery speed)
- Data sensitivity and compliance obligations
- Expected traffic at launch
- Who operates this afterward, and whether anyone is on call
- Launch shape — big bang, soft launch, or gradual rollout

If most are unknown, assess against a **reasonable default bar for a small production system**
and state that assumption explicitly. Do not silently apply enterprise standards to a side
project, or side-project standards to something handling payments.

---

## Step 1 — ARCHITECTURE

Design documented and matches what is actually deployed · components and dependencies known ·
**no undocumented manual steps** · environments separated · staging meaningfully resembles
production · no single points of failure that matter · dependency failure modes understood.

---

## Step 2 — SECURITY

Run the `security` skill for depth. Confirm here:

**Security** — no secrets in source control, image layers, or git history · scanning in the
pipeline (dependency, secret, SAST, image, IaC) · no known critical CVEs on reachable paths ·
authn/authz enforced server-side on every endpoint · input validation · rate limiting on public
endpoints.

**IAM** — roles not users · no long-lived access keys · least privilege on every workload role ·
no `Action = "*"` / `Resource = "*"` without written justification · **CI/CD OIDC trust policy
scoped to repo *and* branch/environment** · MFA on human access · root account locked down.

**Secrets** — in Secrets Manager or Parameter Store, not code/images/git · injected at runtime ·
encrypted at rest · IAM-restricted · rotation plan exists · application survives rotation · no
secrets in logs, CI output, or Terraform outputs without `sensitive`.

**Networking** — databases and internal services in private subnets · **no `0.0.0.0/0` on SSH,
RDP, or database ports** · security groups reference groups not broad CIDRs · egress considered ·
every internet-reachable path enumerated and intentional.

**TLS** — valid certificate on every public endpoint · auto-renewal configured **and verified**
(ACM renews only while DNS validation resolves) · **expiry monitored regardless** · HTTP redirects
to HTTPS · modern TLS version and cipher policy · certificate covers every hostname including
apex and `www`.

---

## Step 3 — INFRASTRUCTURE

**Docker** — pinned base image · multi-stage build · non-root · no secrets in any layer
(`docker history` verified) · effective `.dockerignore` · healthcheck · exec-form CMD for graceful
`SIGTERM` · immutable tags · image scanned.

**Kubernetes** *(N/A if not used — say so)* — requests and limits on every container · liveness,
readiness, and startup probes appropriate to the app · replicas > 1 for anything that must stay
up · PodDisruptionBudget · rolling update parameters set · SecurityContext hardened · RBAC scoped
· NetworkPolicy · no `:latest` · secrets from an external store.

**Terraform** — all production infrastructure in code, **nothing critical created by hand** ·
remote state with locking and versioning · state bucket access restricted · separate state per
environment · **`prevent_destroy` on every data store** · providers and modules version-pinned ·
plan reviewed and clean · drift checked · a second person could apply it safely.

**Resource limits** — CPU and memory set from observed usage, not guessed · no recent OOM kills ·
database connection limit reconciled against application pool size · quotas checked against
expected load.

---

## Step 4 — APPLICATION

**Database** — engine and sizing per design · private, not publicly accessible · encrypted at
rest and in transit · **automated backups meeting the stated RPO** · deletion protection ·
`skip_final_snapshot = false` · connection limits · migration strategy backward-compatible with
the running version.

**Health checks** — every service has one · it verifies the service can **serve**, not merely that
the process is alive · liveness and readiness distinguished · thresholds tuned for real startup
time · load balancer and orchestrator both use it · **a failing dependency does not cause a
restart storm**.

**Data persistence** — persistent data on durable storage, never a container's writable layer ·
volumes survive restart and redeploy · data lifecycle defined · migrations tested against
production-like data volumes · nothing depends on ephemeral local disk.

**Performance** — latency measured against a target · queries indexed, no known N+1 on hot paths ·
connection pooling · cold-start impact understood if serverless · static assets cached/CDN-served.

**Scalability** — stateless, or state externalized · autoscaling configured and verified to scale
**down** · database connection ceiling accounted for · load tested, or the expected ceiling stated
honestly · **the first bottleneck is known by name**.

**Availability** — meets the stated uptime target · multi-AZ where required · graceful shutdown
and connection draining · retries with backoff on dependency calls · no deploy-induced downtime.

---

## Step 5 — CI/CD

Pipeline builds, tests, and scans on every change · **build once, promote the same artifact** ·
production deploy requires explicit approval (GitHub Environment with required reviewers) · deploy
identity is OIDC and least-privilege · **deploy waits for stability rather than fire-and-forget** ·
smoke test after deploy · pipeline documented · someone other than the author can run a release.

---

## Step 6 — MONITORING

**Monitoring** — golden signals per service (latency p95/p99, error rate, traffic, saturation) ·
infrastructure metrics · database metrics including connection count · a dashboard someone will
actually open · deploy events visible alongside metrics.

**Logging** — shipped centrally · structured (JSON) · correlation IDs across services ·
**retention set on every log group** (the CloudWatch default is never expire) · no sensitive data
logged · access logs enabled · queryable fast enough to be useful mid-incident.

**Alerting** — alerts for availability, error rate, latency, saturation, database health, DLQ
depth, certificate expiry, **and budget** · every alert actionable · alerts reach a human who will
respond · escalation defined · each alarm carries a runbook line. **If nobody is on call, say so
and assess what that means for the stated uptime target.**

---

## Step 7 — BACKUPS

Automated backups on every data store · frequency meets the stated RPO · retention defined ·
backups encrypted · **stored where a compromise of the primary account cannot delete them** ·
**a restore has actually been tested**.

> An untested backup is a hypothesis. This is the single most common WARN in real assessments,
> and the one most likely to become a catastrophe.

**No tested restore + no verified backups = FAIL.**

---

## Step 8 — DISASTER RECOVERY

Failure scenarios enumerated — instance, AZ, region, accidental deletion, data corruption, account
compromise · documented recovery procedure · **RTO achievable and measured, not assumed** ·
someone other than the author could execute it · single-resource dependencies understood ·
ransomware posture: could an attacker with admin delete the backups too?

---

## Step 9 — COST

Monthly cost estimated and **accepted by the user** · **budget alarm configured** · cost anomaly
detection enabled · log and image retention policies set · non-production environments sized down
· no obvious waste · cost at expected scale understood · fixed monthly floor known.

Hand off to `cost-optimization` for depth. Cost is rarely a blocker — but an unexpected bill is a
real incident, and a missing budget alarm is a cheap fix.

---

## Step 10 — ROLLBACK

**A tested rollback path exists** · rollback time known · previous artifact still available and
deployable · **migrations reversible or forward-fixable** · rollback trigger criteria defined ·
someone knows how to execute it under pressure · deployment strategy chosen deliberately and
matched to risk tolerance · zero-downtime verified, not assumed.

**Absent or untested rollback is FAIL, always.**

> Rollback does not undo database migrations. If migrations are in scope, they must be
> backward-compatible with the previous version.

---

## Step 11 — FINAL APPROVAL

### Scoring

Weighted by domain — a missing backup is not equal to a missing dashboard.

- **Critical (×3):** Security · Secrets · IAM · Backups · Rollback · Data Persistence · Availability
- **Important (×2):** Networking · Monitoring · Alerting · CI/CD · Deployment Strategy ·
  Health Checks · Disaster Recovery · Terraform
- **Standard (×1):** Architecture · Docker · Kubernetes · AWS · Logging · Scalability ·
  Performance · Cost · DNS · TLS · Resource Limits

Per domain: PASS = 1.0 · WARN = 0.5 · FAIL = 0 · N/A excluded from both sides.

**Score = (Σ weight × value) / (Σ weight of applicable domains) × 100**

| Score | Reading |
|---|---|
| 90–100 | Strong. Launch with remaining WARNINGs tracked |
| 75–89 | Workable. Address P1 items before or immediately after launch |
| 60–74 | Not ready. Meaningful gaps across several domains |
| < 60 | Substantially unprepared |

**Any FAIL item means NO-GO regardless of score.** State score and verdict **separately** — a
92% with one blocked backup item is still a no-go, and the number must not obscure it.

### Required outputs

1. **Critical blockers** — every FAIL item, full format. If none, say so explicitly
2. **High priority issues** — P1 WARNINGs to resolve around launch
3. **Warnings** — P2 items, present but weak
4. **Recommendations** — P3, worth doing, not launch-blocking
5. **Production readiness score** — number, per-domain breakdown, what it does and doesn't mean
6. **Final recommendation** — **GO / CONDITIONAL GO / NO-GO**, with what must change, the fastest
   safe path to green, what to watch in the first 48 hours, and — if launching with open risks —
   the explicit statement that these are the user's accepted risks, each listed

### Finding format

```
### [FAIL | WARN] Domain — Short title
**Evidence:** path/to/file:line, resource, or "not found in <where you looked>"

**Issue** — what is missing or wrong, factually.
**Risk** — what actually happens in production. A concrete failure scenario, including
           who is affected and how you'd find out.
**Recommended action** — the specific change, and which skill owns it.
**Priority** — P0 blocks launch · P1 within a week · P2 within a month · P3 backlog
```

---

## Exit Condition

The workflow ends when the completed checklist and verdict are delivered using
`.claude/templates/production-checklist.md`.

**Then stop.**

- **GO** → return to `.claude/workflows/deployment.md` Step 15 for the Deploy Brief and explicit
  production approval. Readiness passing is **not** deployment approval — those are two separate
  yeses.
- **CONDITIONAL GO** → the user decides which WARNINGs to accept; record each acceptance.
- **NO-GO** → route each blocker to its owning skill (`security`, `terraform`, `cicd`,
  `monitoring`, `docker`, `kubernetes`), fix, and **re-run this workflow**. Do not spot-check only
  the failed item — a fix can move something else.

**This workflow never deploys. It never approves past the veto.**
