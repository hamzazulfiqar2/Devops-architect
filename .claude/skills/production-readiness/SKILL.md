---
name: production-readiness
description: Assess whether a project's infrastructure and deployment architecture is actually ready for production. Runs a structured checklist across architecture, security, networking, IAM, secrets, Docker, Kubernetes, AWS, Terraform, CI/CD, monitoring, logging, alerting, backups, disaster recovery, scalability, availability, performance, cost, DNS, TLS, deployment and rollback strategy, health checks, resource limits, and data persistence. Classifies every item PASS, WARN, FAIL, or NOT APPLICABLE, explains the issue, risk, recommended action, and priority for anything not PASS, and produces critical blockers, high-priority issues, improvements, a readiness score, and a go/no-go recommendation. Use before a first production launch, before a major release, when the user asks "are we ready to go live", "is this production ready", or requests a pre-launch or go-live review. Assessment only — never deploys, and never approves launch while unresolved data-loss, security, availability, or rollback risks remain.
---

# Production Readiness Assessment

Decide whether this can go live. Say so plainly. Back it with evidence.

## What This Skill Is

A **gate**, not a design exercise. It answers one question — *can this go to production?* — and
produces a defensible yes, a conditional yes, or a no with the specific things that must change.

It does not deploy. It does not fix. It assesses, and hands back a list.

## Boundaries

- **Do not deploy anything.** Not a smoke test, not a "quick check" against production.
- **Do not modify infrastructure or code.** Findings and recommendations only. Fixes are a
  separate, approved piece of work.
- **Do not run destructive or mutating commands.** Read-only inspection: manifests, IaC, pipeline
  config, code, and — where available and read-only — live resource descriptions.
- **Do not expose secrets.** Report file, line, and type. Never the value.
- **Do not assume unknown requirements.** Uptime target, RPO/RTO, compliance obligations, and
  expected traffic are inputs. If an item's verdict depends on one you don't have, mark it
  **WARN — needs information** and ask. Never invent an SLA to score against.

## The Veto Rule — Non-Negotiable

**Never issue a GO recommendation while any of these remains unresolved:**

1. **Data loss risk** — no backups, untested restore, no `prevent_destroy`/deletion protection on
   production data stores, or a deploy path that can destroy data.
2. **Critical security risk** — live credentials exposed, a database or admin interface reachable
   from the internet, no authentication on a sensitive endpoint, or wildcard admin permissions on
   an internet-facing workload.
3. **Availability risk** — a single point of failure with no recovery path, no health checks, or
   a system that cannot survive the failure of one instance.
4. **No rollback path** — no way to get back to the last known-good state, or a deploy that is
   one-way (typically an irreversible migration).

These are **FAIL**, always, regardless of schedule pressure. If the user says the launch date
is fixed, say what specifically must change, give the fastest safe path to resolving it, and
offer scope reductions (soft launch, limited users, feature flags, delayed migration) — but do
not convert a FAIL item into a WARN because a date is inconvenient. Record any decision to
launch anyway as **the user's accepted risk, in writing**, not as your approval.

## Before Assessing

Establish, or ask:

- **What "production" means here** — real users, real money, real data? An internal tool and a
  public payments system get different bars, and you should say which bar you're applying.
- **Uptime target** and what downtime actually costs.
- **RPO / RTO** — how much data can be lost, and how fast recovery must happen.
- **Data sensitivity** and any compliance obligations.
- **Expected traffic** at launch and after.
- **Who operates this** after go-live, and whether anyone is on call.
- **Launch shape** — big bang, soft launch, or gradual rollout.

If most of these are unknown, say so up front and assess against a **reasonable default bar for
a small production system**, stating that assumption explicitly. Do not silently apply
enterprise standards to a side project, or side-project standards to something handling payments.

## Classification

| Status | Meaning | Effect |
|---|---|---|
| **PASS** | Verified in place and adequate for this system's stated bar. | None |
| **WARN** | Present but weak, or absent where absence is survivable short-term. Fix soon; document the risk. | Conditional go |
| **FAIL** | Must be resolved before production. Unacceptable risk of data loss, breach, outage, or unrecoverable failure. | **No go** |
| **NOT APPLICABLE** | Genuinely doesn't apply. **Must state why.** | None |

Two disciplines that keep this honest:

- **PASS means verified, not assumed.** If you couldn't check it, it is not PASS — it's
  **WARN — unverified**, with what you'd need to confirm it. A checklist full of unverified
  green ticks is worse than no checklist.
- **NOT APPLICABLE needs a reason.** "No Kubernetes — this runs on ECS Fargate" is valid.
  Unexplained N/A is how real gaps get hidden.

Do not grade generously to make the report feel better. The point is to find what breaks.

## Finding Format

For every **WARN** and **FAIL** item:

```
### [FAIL | WARN] Domain — Short title
**Evidence:** path/to/file:line, resource, or "not found in <where you looked>"

**Issue**
What is missing or wrong, factually.

**Risk**
What actually happens in production because of this. A concrete failure scenario —
not "may cause issues". Include who is affected and how you'd find out.

**Recommended action**
The specific change. Name the skill that owns it (terraform, cicd, monitoring, security…).

**Priority**
P0 — blocks launch · P1 — within a week of launch · P2 — within a month · P3 — backlog
```

The **Risk** field carries the report. *"There is no automated backup. If the RDS instance is
deleted or corrupted, all customer data since launch is unrecoverable, and you would discover
this at the moment you needed to restore"* lands. *"Backups should be configured"* does not.

## The Checklist

Work every domain. Mark each item, and note explicitly what you could not verify.

### Architecture
Design documented and matches what's deployed · components and dependencies known · no undocumented
manual steps · environments separated (dev/staging/prod) · staging meaningfully resembles production ·
no single points of failure that matter · dependency failure modes understood.

### Security
No secrets in source control or images · no live credentials anywhere in the repo or its history ·
dependency, image, and IaC scanning in the pipeline · no known critical CVEs in reachable paths ·
authentication and authorization enforced server-side on every endpoint · input validation ·
rate limiting on public endpoints · WAF where genuinely exposed · security review completed
(hand off to `security` for depth).

### Networking
Databases and internal services in private subnets · no `0.0.0.0/0` on SSH, RDP, or database
ports · security groups reference other groups rather than broad CIDRs · egress considered, not
just ingress · load balancer configured with health checks · VPC endpoints where they reduce
exposure · every internet-reachable path enumerated and intentional.

### IAM
Roles not users · no long-lived access keys in use · least privilege on every workload role ·
no `Action = "*"` / `Resource = "*"` without written justification · CI/CD uses OIDC with a
tightly scoped trust policy · MFA on human access · root account unused and locked down.

### Secrets
Stored in Secrets Manager or Parameter Store, not in code, images, or environment files in git ·
injected at runtime · encrypted at rest · access restricted by IAM · rotation plan exists (even
if manual) · application survives a rotation · no secrets in logs, CI output, or Terraform
outputs without `sensitive`.

### Docker
Pinned base image, not `:latest` · multi-stage build · runs as non-root · no secrets in any
layer · `.dockerignore` present and effective · healthcheck defined · exec-form CMD so SIGTERM
is handled · image scanned · image size reasonable · immutable tags.

### Kubernetes *(N/A if not used — say so)*
Resource requests and limits on every container · liveness, readiness, and startup probes
appropriate to the app · replicas > 1 for anything that must stay up · PodDisruptionBudget ·
rolling update parameters set · SecurityContext hardened · RBAC scoped · NetworkPolicy in place ·
no `:latest` · namespace isolation · secrets from an external store.

### AWS
Encryption at rest on every data store · encryption in transit enforced · CloudTrail enabled in
all regions · Multi-AZ where the availability target requires it · service quotas checked against
expected load · resources tagged · region choice deliberate · account-level S3 public access block
on.

### Terraform / IaC
All production infrastructure is in code — nothing critical created by hand · remote state with
locking and versioning · state bucket access restricted · `prevent_destroy` on data stores ·
no secrets in code or `.tfvars` · providers and modules version-pinned · `plan` reviewed and
clean · drift checked · a second person could apply this safely.

### CI/CD
Pipeline builds, tests, and scans on every change · build once, promote the same artifact ·
production deploy requires explicit approval · deploy identity is OIDC and least-privilege ·
deploy waits for stability rather than fire-and-forget · smoke test after deploy · pipeline
itself is documented · someone other than the author can run a release.

### Monitoring
Golden signals collected per service (latency p95/p99, error rate, traffic, saturation) ·
infrastructure metrics · database metrics including connection count · dashboard exists and
someone will actually look at it · deploy events visible alongside metrics.

### Logging
Application logs shipped centrally · structured (JSON) · correlation IDs across services ·
**retention set on every log group** · no sensitive data logged · access logs enabled · logs
queryable fast enough to be useful during an incident.

### Alerting
Alerts exist for availability, error rate, latency, saturation, database health, DLQ depth, and
certificate expiry · every alert is actionable · alerts reach a human who will respond · routing
and escalation defined · no known alert fatigue · each alarm carries a runbook line. **If nobody
is on call, say so and assess what that means for the uptime target.**

### Backups
Automated backups on every data store · frequency meets the stated RPO · retention defined ·
backups encrypted · backups stored where a compromise of the primary account can't delete them ·
**a restore has actually been tested** — an untested backup is a hypothesis, and this is one of
the most common WARN items in real assessments.

### Disaster Recovery
Failure scenarios enumerated (instance, AZ, region, accidental deletion, corruption, compromise) ·
documented recovery procedure · RTO achievable and measured, not assumed · someone other than the
author could execute it · dependencies on single resources understood.

### Scalability
Application is stateless, or state is externalized · autoscaling configured and verified to scale
*down* · database connection limits accounted for · caching where it's needed · load tested, or
the expected ceiling stated honestly · the first bottleneck is known by name.

### Availability
Meets the stated uptime target · multi-AZ where required · health checks that verify real
serving capability, not just process liveness · graceful shutdown and connection draining ·
retries with backoff on dependency calls · no deploy-induced downtime.

### Performance
Latency measured against a target · database queries indexed, no known N+1 on hot paths ·
connection pooling configured · cold start impact understood if serverless · static assets cached
and served from a CDN where appropriate · resource sizing based on measurement, not guesswork.

### Cost
Monthly cost estimated and accepted · **budget alarm configured** · cost anomaly detection on ·
log and image retention policies set · no obvious waste · non-production environments sized down ·
cost at expected scale understood (hand off to `cost-optimization` for depth).

### DNS
Domain registered and controlled by the right account · records correct · TTLs appropriate for
cutover (lower them before a migration) · health-check-based failover if required · registrar
nameservers match the hosted zone · renewal not about to lapse.

### TLS / SSL
Valid certificate on every public endpoint · auto-renewal configured and verified (ACM renews only
while DNS validation resolves) · **expiry monitored regardless** · HTTP redirects to HTTPS ·
modern TLS version and cipher policy · certificate covers every hostname in use, including apex
and `www`.

### Deployment Strategy
Strategy chosen deliberately (rolling / blue-green / canary) and matched to risk tolerance ·
zero-downtime verified, not assumed · database migrations backward-compatible with the running
version · deploy is repeatable and documented · a failed deploy fails loudly rather than silently.

### Rollback Strategy
**A tested rollback path exists** · rollback time known · previous artifact still available and
deployable · migrations are reversible or forward-fixable · rollback trigger criteria defined ·
someone knows how to execute it under pressure. **Absent rollback is FAIL, always.**

### Health Checks
Every service has one · it verifies the service can actually serve, not merely that the process
is alive · liveness and readiness distinguished where the platform supports it · timeouts and
thresholds tuned for real startup time · load balancer and orchestrator both use it · a failing
dependency doesn't cause a restart storm.

### Resource Limits
CPU and memory requests/limits set on every container · sized from observed usage, not guessed ·
no OOM kills in recent history · database connection limits vs application pool size reconciled ·
rate limits and quotas checked against expected traffic.

### Data Persistence
Persistent data is on durable storage, never a container's writable layer · volumes survive
restarts and redeployment · deletion protection on production data stores · data lifecycle and
retention defined · migrations tested against production-like data volumes · no data written to
ephemeral local disk that anyone depends on.

## Scoring

Score by weighted domain, not by counting ticks — a missing backup is not equal to a missing
dashboard.

- **Critical domains** (weight ×3): Security, Secrets, IAM, Backups, Rollback, Data Persistence,
  Availability
- **Important domains** (weight ×2): Networking, Monitoring, Alerting, CI/CD, Deployment Strategy,
  Health Checks, Disaster Recovery, Terraform/IaC
- **Standard domains** (weight ×1): Architecture, Docker, Kubernetes, AWS, Logging, Scalability,
  Performance, Cost, DNS, TLS, Resource Limits

Per domain: PASS = 1.0 · WARN = 0.5 · FAIL = 0 · N/A excluded from both numerator and
denominator.

**Score = (Σ weight × value) / (Σ weight of applicable domains) × 100**

| Score | Reading |
|---|---|
| 90–100 | Strong. Launch with the remaining WARNINGs tracked. |
| 75–89 | Workable. Address P1 items before or immediately after launch. |
| 60–74 | Not ready. Meaningful gaps across several domains. |
| < 60 | Substantially unprepared. |

**Any FAIL item means NO-GO regardless of score.** State the score and the verdict separately —
a 92% with one FAIL backup item is still a no-go, and the report must not let the number
obscure that.

## Report Structure

1. **Scope and context** — what you reviewed, what you couldn't, the bar you're assessing against,
   and every assumption you had to make.
2. **Verdict** — GO / CONDITIONAL GO / NO-GO, in the first line, with the one-sentence reason.
3. **Critical blockers (P0)** — every FAIL item, full format. If empty, say so explicitly.
4. **High-priority issues (P1)** — WARNINGs that need resolving around launch.
5. **Recommended improvements (P2/P3)** — worth doing, not launch-blocking.
6. **Full checklist** — every domain and item with its status, as a table. N/A items with reasons.
7. **Readiness score** — the number, the per-domain breakdown, and what it does and doesn't mean.
8. **Final recommendation** — the verdict restated with: what must change before launch, the
   fastest safe path to green, what to watch in the first 48 hours, and — if the user chooses to
   launch with open risks — the explicit statement that this is their accepted risk, listing each
   one.

## Working Style

- **Lead with the verdict.** Nobody should have to read to page four to learn they can't launch.
- Be specific and evidential. Cite files, resources, and line numbers. "Not found in
  `.github/workflows/`" is a finding; a vague concern is not.
- Distinguish verified from unverified relentlessly. Say what you couldn't check and why.
- Don't pad with LOW items to look thorough, and don't soften a blocker to be agreeable.
- Say when something is genuinely good. A report that finds only problems reads as noise; one that
  says "backups are well configured and the restore has been tested" earns trust for its blockers.
- Route fixes to the owning skill rather than solving everything inline — `security`, `terraform`,
  `cicd`, `monitoring`, `cost-optimization`, `docker`, `kubernetes`.
- Explain the reasoning behind each bar. The user is learning; a blocker understood is a blocker
  that doesn't recur on the next project.
- **You assess. You never deploy, and you never approve past the veto rule.**
