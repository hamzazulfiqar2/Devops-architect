# Workflow — Deployment

**Prepares an application for deployment after architecture approval.**

This workflow covers **PLAN → VALIDATE → APPROVAL GATE → IMPLEMENT → VERIFY → DOCUMENT** from the
primary lifecycle in
`CLAUDE.md`. It runs **after** `.claude/workflows/architecture-design.md` has produced a proposal
and the user has **explicitly approved it**.

```
APPROVED ARCHITECTURE → CONTAINERIZATION → INFRASTRUCTURE → CONFIGURATION → SECRETS
→ CI/CD → STAGING → VALIDATION → PRODUCTION APPROVAL → PRODUCTION DEPLOYMENT
```

Output template: `.claude/templates/deployment-plan.md`
Related skills: `docker` · `terraform` · `cicd` · `monitoring` · `security` ·
`production-readiness` · `troubleshooting`

---

## Rules For This Workflow

**Never deploy production without explicit approval.** Per deploy. Not "as discussed", not
because the previous one was approved. Approval is never standing.

**Never run destructive infrastructure operations automatically.** This includes anything that
deletes, replaces, or causes downtime: `terraform destroy`, `terraform apply` on a plan
containing replace or destroy, deleting RDS/S3/EBS/EFS resources, `kubectl delete`, dropping
databases, rotating or deleting secrets, force-unlocking state, `docker system prune`. Show the
blast radius, then ask.

**Before every infrastructure change, show:** what will change · why · potential risks · whether
resources will be **created, modified, or destroyed**. Counts first, destroys never buried.

**Never hardcode secrets** — not in code, Dockerfiles, `.tfvars`, manifests, or CI config.

**Do not assume something works because a command succeeded.** Verify the outcome, not the
exit code.

**Work freely in dev and staging. Stop at production.**

---

## Step 1 — Verify Architecture Approval

**Gate. Do not proceed without passing it.**

Confirm:
- An architecture proposal exists (`.claude/templates/architecture.md` output)
- The user has **explicitly approved it** — not "looks good", but a clear go-ahead
- The region, account, and environments are settled
- Any `ASSUMPTIONS` block from the design has been resolved or accepted
- A budget expectation exists and the user has seen the fixed monthly floor

If approval is unclear, **ask for it plainly** and stop. If the architecture has changed since
approval, return to `architecture-design`.

State back, in three or four sentences, what you are about to build. This is the last cheap
moment to catch a misunderstanding.

---

## Step 2 — Analyze Deployment Requirements

From the discovery report and approved architecture, confirm the deployable facts:

- **Deployable units** — one per process: web, API, worker, scheduled job, static site
- **Build commands** and their outputs
- **Start commands** and the process model
- **Ports** and whether they are configurable
- **Environment variables** — every one, required vs optional
- **Secrets** — which values are sensitive
- **State** — what is written to disk and whether it must survive a restart
- **Boot dependencies** — database, cache, queue, migrations
- **Health endpoint** — existing, or one that must be added
- **Migrations** — how they run, and whether they are backward-compatible
- **Target architecture** — `amd64` vs `arm64`

Anything unknown here that changes the deployment, **ask now**.

---

## Step 3 — Determine Whether Docker Is Required

Do not containerize by reflex. Decide:

**Docker is warranted when** — the target is ECS, EKS, or any container runtime · reproducible
builds matter · the runtime has awkward system dependencies · dev/prod parity is a stated goal.

**Docker is not warranted when** — the target is Lambda with a zip package · the deliverable is
static files to S3+CloudFront · the target platform builds from source itself.

State the decision and the reason. If Docker is not needed, skip Step 4 and record why.

---

## Step 4 — Build or Review the Dockerfile

Hand off to the `docker` skill. Requirements for anything going to production:

- Pinned base image — never `:latest`
- Multi-stage build; no build tools or dev dependencies in the runtime image
- **Non-root user**
- `.dockerignore` present and effective — no `.git`, no `node_modules`, **no `.env`**
- **No secrets in any layer** (verify with `docker history`)
- Healthcheck defined
- Exec-form `CMD` so `SIGTERM` is handled and shutdown is graceful
- Port configurable, bound to `0.0.0.0`
- Immutable tags — git SHA, never `:latest`
- Built for the target architecture

**Verify locally before going further:** it builds clean, runs, passes its healthcheck, contains
no secrets, runs as non-root (`docker exec whoami`), and stops gracefully.

If reviewing an existing Dockerfile, report findings by severity before changing anything.

---

## Step 5 — Configure Environment Variables

Configuration comes in **at runtime**, not baked into the image. The same image must run in
dev, staging, and production with only environment differences.

- Enumerate every variable: name, purpose, required or optional, default, and which are secrets
- Non-sensitive defaults may live in the image (`NODE_ENV`, `PORT`)
- Environment-specific values come from the platform (ECS task definition, Kubernetes ConfigMap,
  Lambda environment)
- **`ARG` and `ENV` are visible in `docker history`** — never secrets
- Document the full set in the deployment plan

If an image can only run in one environment, the config strategy is wrong — fix it here.

---

## Step 6 — Configure Secrets

Hand off to `security` for review. Rules:

- Secrets live in **AWS Secrets Manager** (rotation needed, ~$0.40/secret/mo) or **SSM Parameter
  Store** (free Standard tier, sufficient when rotation isn't required). Choose deliberately
- The **container** is created by Terraform; the **value** is set out of band — console, CLI, or
  rotation function. Terraform grants the IAM read permission and never handles the value
- For RDS, prefer `manage_master_user_password = true` so the password never enters Terraform state
- The workload reads secrets **at runtime by ARN**
- Never in code, images, `.tfvars`, manifests, or CI config
- **Verify `.gitignore`** covers `.env*`, `*.tfstate*`, `*.tfvars`, `.terraform/`
- If a secret is found already committed, **say so immediately — it is compromised and must be
  rotated**, not merely deleted

Document rotation posture, even if rotation is manual for now.

---

## Step 7 — Provision Infrastructure (Terraform)

Hand off to the `terraform` skill.

- Confirm remote state with locking and versioning, and restricted bucket access — **before**
  creating anything
- Separate state per environment; a dev mistake must be structurally unable to touch prod
- `prevent_destroy` on every data store
- Version-pinned providers and modules
- Tag everything: `Environment`, `Project`, `ManagedBy = "terraform"`

**Standard sequence — the plan is the gate:**

```bash
terraform fmt -recursive
terraform validate
terraform init
terraform plan -out=tfplan
```

Then **read the plan and brief the user**:
- `N to add, N to change, N to destroy` — counts first
- Search for `forces replacement`, `must be replaced`, `will be destroyed` and **surface those
  first**
- What each change is, and why
- Risks: downtime, data loss, endpoint changes, duration, reversibility

**Then stop and ask.** After approval:

```bash
terraform apply tfplan
```

Apply the exact plan file you showed. Verify outputs afterward and report what actually happened,
including anything that differed from the plan.

---

## Step 8 — Configure Networking

- VPC, subnets, and route tables per the approved design
- Databases and application compute in **private** subnets; only load balancers and NAT public
- Security groups reference other security groups, not broad CIDRs. **Justify every `0.0.0.0/0`
  out loud.** Never 22, 3389, or database ports open to the internet
- Load balancer with health checks tuned to the app's real startup time
- HTTPS listener with an ACM certificate; HTTP redirects to HTTPS
- Route 53 records; lower TTLs before any cutover
- VPC endpoints where they reduce exposure and NAT cost
- Verify: every internet-reachable path is enumerated and intentional

---

## Step 9 — Configure Database

- Instance class and storage per the approved design; Multi-AZ per the availability requirement
- Private subnet group; **not** publicly accessible
- `storage_encrypted = true`; TLS enforced in transit
- **Automated backups on, retention meeting the stated RPO**
- `deletion_protection` and `prevent_destroy` on
- `skip_final_snapshot = false`
- Parameter group if defaults don't fit; connection limits reconciled against the application
  pool size (add RDS Proxy if Lambda connects directly)
- **Migration strategy** — how migrations run, in what order relative to deploys, and whether
  they are backward-compatible with the currently running version
- **Test a restore.** An untested backup is a hypothesis, and this is the cheapest moment to find
  out it doesn't work

---

## Step 10 — Configure Monitoring

Hand off to the `monitoring` skill. Scale it to the application — do not bolt enterprise
observability onto a small service.

Minimum before production:
- Golden signals per service: latency p95/p99, error rate, traffic, saturation
- **Log groups with retention set** — the CloudWatch default is never expire
- Structured logs with correlation IDs
- A baseline alert set: service down · error rate · latency · crash loop · database connections ·
  database storage · disk · DLQ depth · certificate expiry · **budget alarm**
- Every alert actionable, routed to someone who will respond, with a runbook line
- One dashboard someone will actually open

If nobody is on call, say so and design a morning-check dashboard with email alerts instead of a
paging strategy.

---

## Step 11 — Configure CI/CD

Hand off to the `cicd` skill.

- Pipeline: lint → test → build → scan → push → deploy → smoke test
- **Build once, promote the same artifact** through environments. Never rebuild per environment
- Immutable SHA tags
- **GitHub OIDC with a tightly scoped trust policy** — never static AWS keys. Scope the `sub`
  condition to the repo *and* branch or environment; a wildcard lets any branch assume the role
- Explicit minimal `permissions:` on every workflow
- Third-party actions pinned by SHA
- Separate least-privilege roles per environment
- Security scans: dependencies, secrets, SAST, image, IaC — each set to block or report
  deliberately
- **Deploy steps must wait for stability** — a fire-and-forget deploy reports green while failing
- Production job uses a GitHub Environment with **required reviewers**

---

## Step 12 — Deploy to Staging

Staging is where things are allowed to break. Deploy freely here.

- Deploy the artifact that will go to production — the same image, the same digest
- Run migrations exactly as production will run them
- Confirm the deploy actually completed: tasks/pods cycled, targets healthy, rollout finished
- Exercise the application: real requests, real auth, real database, real integrations
- Leave it running long enough to see anything that only appears after a few minutes

---

## Step 13 — Run Validation

**Do not assume something works because the command succeeded.** Verify each:

| Area | Verify |
|---|---|
| **Build** | Image builds reproducibly; artifact matches what was tested |
| **Tests** | Full suite green in CI, not just locally |
| **Docker image** | No secrets (`docker history`), non-root, healthcheck passes |
| **Configuration** | Every required variable present; app boots clean |
| **Networking** | Endpoints reachable as intended; **nothing reachable that shouldn't be** |
| **Health checks** | Load balancer and orchestrator both report healthy; probe verifies real serving |
| **Security** | No secrets in logs or repo; TLS valid; security groups as designed |
| **Logs** | Arriving centrally, structured, retention set, no sensitive data |
| **Monitoring** | Metrics flowing; alarms in OK state, not INSUFFICIENT_DATA |
| **Deployment status** | Rollout complete, desired = running, no restart loop |
| **Rollback** | **Actually practiced once in staging** — not just documented |
| **Graceful shutdown** | `SIGTERM` drains connections without dropping requests |

State plainly what you verified, what you could not, and what remains risky.

Anything broken: hand to `troubleshooting`. **Do not proceed with known failures.**

---

## Step 14 — Production Readiness Checks

Run the `production-readiness` skill in full. It assesses 26 domains and classifies each
PASS / WARN / FAIL / N-A.

Also complete the pre-deployment reviews required by `CLAUDE.md`:

1. Architecture review 2. Security review 3. Cost review 4. Terraform review
5. CI/CD review 6. Monitoring review 7. Backup/recovery review 8. Rollback plan

**The veto applies. No GO while any of these is unresolved:**
- Data loss risk — no backups, untested restore, no deletion protection
- Critical security risk — exposed credentials, database reachable from the internet
- Availability risk — a single point of failure with no recovery path
- **No tested rollback path**

A FAIL is a FAIL regardless of schedule pressure. Offer the fastest safe path and scope
reductions — never downgrade a blocker to fit a date.

---

## Step 15 — Request Explicit Production Approval

Present the **Deploy Brief** and stop:

- **What changes** — one paragraph
- **Resources created / modified / destroyed** — counts, destroys called out separately
- **Estimated cost impact**
- **Downtime expected** — yes/no, how long
- **Migration plan** — and whether it is reversible
- **Rollback plan** — mechanism, how long it takes, who executes it
- **What to watch after deploy** — specific metrics, and what "it went wrong" looks like
- **Readiness score and any open WARNINGs** the user is accepting

Then **ask for approval and wait**. No deployment until the user says yes to *this* deploy.

---

## Step 16 — Production Deployment

Only after explicit approval.

- Deploy the **same artifact** validated in staging
- Watch the rollout — do not walk away from it
- Run smoke tests immediately
- Watch the golden signals for at least 15–30 minutes
- **If the rollback trigger fires, roll back first and diagnose after** — users come before
  curiosity

Then report what **actually** happened, including anything that differed from plan. If a step was
skipped, say so. If something is still uncertain, say that too.

Post-deploy: confirm monitoring and alerts are live, note anything deferred, and record what
should change before the next deploy.

---

## Exit Condition

The workflow ends when production is deployed **and verified**, or when it stops at a gate
awaiting approval.

Deliver the completed deployment plan from `.claude/templates/deployment-plan.md` as the record
of what was built and what was decided.

If anything fails at any stage, hand off to `troubleshooting` — do not improvise fixes under
pressure.
