# Workflow — Project Discovery

**Mandatory process for analyzing a new software project.**

This workflow runs **before** any architecture decision, infrastructure recommendation, or
implementation work. It covers **DISCOVER → ANALYZE → IDENTIFY GAPS** in the primary lifecycle in
`CLAUDE.md`.

```
DISCOVER → ANALYZE → IDENTIFY UNKNOWNS → ASK QUESTIONS → PRODUCE DISCOVERY REPORT
```

Related skill: `project-discovery` (the detailed inspection method).
Next workflow after this one: architecture design (`aws-architecture`).

---

## Rules For This Workflow

**Do not design infrastructure during this workflow.**
No AWS service recommendations, no diagrams of a target state, no "you should use Fargate here."
When a finding points at an obvious solution, record the **requirement**, not the solution.
Write *"needs a scheduler that can run a 20-minute job nightly"* — not *"use EventBridge."*

**Do not deploy anything.** No builds against real infrastructure, no cloud API calls, no
`terraform plan` or `apply` against real state, no container pushes.

**Do not modify project files.** This workflow is read-only. No fixes, no formatting, no new
files inside the analyzed project. The discovery report is the only artifact.

**Do not guess.** Every statement is Observed, Inferred, or UNKNOWN — and labelled as such.

**Do not print secret values.** If a credential is found in a tracked file, report the file and
the fact. Never the value.

---

## Evidence Labelling

Every claim in the report carries one of three labels. This is not optional — it is what makes
the report trustworthy.

| Label | Meaning | Requirement |
|---|---|---|
| **Observed** | Read directly from a file | Cite `path/to/file:line` |
| **Inferred** | A reasonable conclusion from evidence | State the evidence it rests on |
| **UNKNOWN** | Not determinable from the repository | Goes to Step 5. Never guess a value |

If the repository contradicts itself — README says PostgreSQL, code connects to MySQL — report
**both** and flag the contradiction. Do not silently pick a winner.

**Absence is a finding.** No tests, no healthcheck, no migration tooling, no `.dockerignore` —
each of these is information about the project and belongs in the report.

---

## Step 1 — Repository Discovery

Inspect the repository and identify what the application actually **is**.

### Identify

- **Application type** — web app, API service, worker, static site, CLI, monolith, monorepo
- **Frontend** — framework, SSR vs SPA vs static, build output, routing, asset handling
- **Backend** — framework, HTTP server, process model, port, stateless or stateful
- **APIs** — REST / GraphQL / gRPC, route inventory, public vs internal, versioning, schemas
- **Workers** — background consumers, what triggers them, what they process
- **Scheduled jobs** — crontabs, framework schedulers, Celery beat, `node-cron`, CronJobs,
  Actions `schedule` triggers. Record the schedule and what each job does
- **Databases** — engine, version, ORM/driver, migrations, schema shape, seed data
- **Caches** — Redis, Memcached; what is cached; required or optional
- **Queues** — SQS, RabbitMQ, Kafka, BullMQ, Sidekiq; producers, consumers, retries, DLQs
- **Storage** — local disk writes, S3 SDK usage, upload paths, what must persist across restarts
- **Authentication** — session / JWT / OAuth / SAML / API key, where sessions live, role model
- **Third-party integrations** — payments, email/SMS, auth providers, AI APIs, analytics,
  error tracking, webhooks (inbound and outbound)

### Files to inspect

| File | What to extract |
|---|---|
| `README*`, `docs/`, `ARCHITECTURE*` | Stated purpose, setup steps, documented deployment |
| `package.json` + lockfile | Runtime, framework, scripts, dependency split |
| `requirements.txt`, `pyproject.toml`, `Pipfile` | Python runtime, framework, dependencies |
| `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`, `composer.json`, `*.csproj` | Other stacks |
| `Dockerfile*`, `.dockerignore` | Base image, build steps, ports, user, healthcheck, entrypoint |
| `docker-compose*.yml` | **The real dependency list** — every service declared is a dependency |
| `.env.example`, `.env.sample`, `config/` | Every environment variable, by name and purpose |
| `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `buildspec.yml` | Existing CI/CD |
| `*.tf`, `*.tfvars`, backend config | Existing IaC, state backend, declared resources |
| `k8s/`, `helm/`, `manifests/`, `Chart.yaml` | Existing Kubernetes workloads |
| `vercel.json`, `fly.toml`, `Procfile`, `render.yaml`, `.ebextensions`, `app.yaml` | Existing hosting config |
| `Makefile`, `.gitignore`, test config, lint config | Build entry points, operational maturity |

Read the README first — but **trust the code over the README**. Documentation drifts.

---

## Step 2 — Technology Analysis

Document, with evidence:

- **Programming languages** — and the proportion of each in a mixed repo
- **Frameworks** — web, ORM, testing, build
- **Databases** — engine and version, from the driver or compose file, not the README
- **Runtime** — version pins from `.nvmrc`, `engines`, `runtime.txt`, `go.mod`, Dockerfile base
- **Package managers** — and whether a lockfile is committed (reproducibility signal)
- **External services** — everything the code calls that it does not own

Output as a table: **Layer | Technology | Version | Source (file:line) | Confidence**

Flag unpinned versions and end-of-life runtimes explicitly — both become infrastructure
constraints later.

---

## Step 3 — Deployment Analysis

Determine how this is deployed **today**, not how it should be.

- **Current deployment model** — manual, scripted, CI/CD-driven, or never deployed
- **Hosting** — platform, provider, region, or local-only
- **Networking** — public vs private, ports, load balancing, what is internet-facing
- **Domains** — custom domains in use, where DNS is managed
- **SSL/TLS** — certificates, who issues them, whether renewal is automated
- **Containers** — containerized or not, registry in use, image tagging scheme
- **CI/CD** — pipelines that exist, triggers, stages, deploy targets, approval gates, secrets used
- **Environments** — which exist, how they differ, how a change is promoted between them

If it has only ever run on a laptop, say that plainly. That is a finding, not a gap to smooth
over — and it changes what the architecture phase must account for.

---

## Step 4 — Infrastructure Requirements

Derive requirements from Steps 1–3. **Requirements only — no solutions, no AWS service names.**

- **Compute** — workload shape (long-running / event-driven / batch / scheduled), instance count,
  CPU and memory appetite, statelessness, whether long-lived connections are needed
- **Networking** — public vs private placement, ports and protocols, inbound exposure, outbound
  egress needs, internal service-to-service traffic
- **Database** — engine and version, expected size and growth, connection count, backup needs,
  read/write pattern, migration strategy
- **Storage** — object storage, block storage, shared filesystem, what must survive a restart,
  expected volume, retention
- **Secrets** — which config values are sensitive, how many, whether rotation is required, how
  they must reach the runtime
- **Monitoring** — what "healthy" means for each component, whether a health endpoint exists,
  what would need alerting, who would respond
- **Backups** — what data cannot be lost, how much loss is tolerable, how fast recovery must be
  (note as UNKNOWN if the user has not stated RPO/RTO)
- **DNS** — domains required, subdomains per environment, certificate coverage needed

Each requirement is a sentence describing a **need**, traceable to something observed in
Steps 1–3.

---

## Step 5 — Identify Unknowns

**Do not guess critical requirements.**

Produce two lists.

### A. Not determinable from the repository

Facts the code simply does not contain:

- Expected traffic and number of users
- Budget ceiling
- Production, staging, or experiment
- Required uptime target
- RPO / RTO
- Database size and growth rate
- File storage volume
- Compliance obligations and data sensitivity
- Geographic distribution of users
- Existing AWS account and its setup
- Existing domain and registrar
- Who operates this after launch, and whether anyone is on call
- Timeline and effort tolerance

### B. Ambiguous in the repository

Things that *should* be knowable but are not — conflicting configuration, undocumented
environment variables, a dependency with no visible purpose, a service in compose that nothing
references. For each, state what you checked and what would resolve it.

Mark every unknown clearly as **UNKNOWN**. Never substitute a plausible number.

---

## Step 6 — Ask Questions

Ask **only** the questions that materially change architecture decisions. Do not interrogate the
user for things that do not affect the outcome.

Rules:

- **Batch them** — maximum ~5 at a time.
- **Rank by impact** — the question that changes the most goes first.
- **State what each answer unblocks**, in this form:

> *"What is the expected peak concurrent users? Under ~100 this fits a single small instance;
> above that, the in-memory session store at `src/auth/session.js:14` becomes the first thing
> that has to change."*

- **Offer a default** where one is reasonable, so the user can confirm rather than compose an
  answer from scratch.

End the question list with an explicit verdict:

- **Ready for architecture** — nothing blocking remains, or
- **Blocked on questions 1–N** — naming which answers are required before design can start.

---

## Step 7 — Produce the Discovery Report

Produce the report using the standard structure below. Follow the architecture response template
in `CLAUDE.md` for section formatting and tone.

### Report sections

1. **Project Overview** — what the software does, in plain language, 3–6 sentences. Purpose,
   users, maturity (prototype / active / legacy), and whether it currently runs anywhere. Say
   if the purpose had to be inferred from code because documentation was thin.
2. **Technology Stack** — the Step 2 table.
3. **Application Components** — one entry per deployable unit: name, type, how it starts, port,
   stateless or stateful and why, boot dependencies, current build method. Include a text diagram
   of how components talk to each other.
4. **Data Architecture** — every datastore, cache, and queue: engine, what it holds, how it is
   accessed, migration strategy, backup evidence or its absence, and criticality — **can this
   data be lost?** Call out all state on local disk or in process memory.
5. **External Integrations** — table: Service | Purpose | Direction | Critical path? |
   Credentials needed | Failure impact.
6. **Current Deployment** — the Step 3 findings.
7. **Infrastructure Requirements** — the Step 4 requirements, no solutions.
8. **Security Considerations** — observed issues ranked by severity, each with evidence and
   impact. Mark **observed** vs **potential**. Hand off to the `security` skill for depth.
9. **Scalability Considerations** — where this breaks under load, in the order things break.
   In-memory state, single-instance assumptions, connection limits, synchronous work that should
   be async. Name the current ceiling.
10. **Unknowns and Missing Requirements** — the Step 5 lists.
11. **Questions** — the Step 6 ranked questions, ending with the readiness verdict.

### Report quality bar

- Cite `file:line` for anything load-bearing.
- Separate Observed / Inferred / UNKNOWN throughout.
- Report absence as clearly as presence.
- If the repository was too large to read fully, state what you sampled and what you skipped.
- Keep it scannable — tables, short bullets, no filler.

---

## Exit Condition

The workflow ends when the discovery report is delivered.

**Then stop.** Do not proceed to design. Wait for the user's answers to Step 6.

Architecture work begins only after:
1. The user has confirmed the discovery report reflects their project, and
2. The blocking questions have been answered.

At that point, hand off to the `aws-architecture` skill.
