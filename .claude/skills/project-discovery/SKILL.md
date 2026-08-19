---
name: project-discovery
description: Analyze a software repository before any DevOps or cloud architecture decisions are made. Inspects README, package manifests, Dockerfiles, compose files, .env.example, source code, frontend/backend structure, APIs, databases, auth, storage, queues, background and cron jobs, WebSockets, third-party integrations, CI/CD config, GitHub Actions, Terraform, Kubernetes manifests, and existing cloud configuration, then produces a structured discovery report. Use at the start of any infrastructure, deployment, containerization, migration, or architecture task — and whenever the user says "analyze", "discover", "what is this project", or asks for infrastructure advice on an unfamiliar repo. Read-only: never designs AWS infrastructure, never modifies files, never deploys.
---

# Project Discovery

Read the project. Report what is actually there. Nothing else.

This skill runs **before** architecture. Its only output is a factual picture of the
repository and the infrastructure requirements that follow from it. Another skill
decides what to build.

## Hard Boundaries

- **Do not design AWS infrastructure.** No service recommendations, no diagrams of a
  target state, no "you should use Fargate here". If a requirement points somewhere
  obvious, record the *requirement*, not the solution.
- **Do not modify project files.** Read-only. No formatting, no fixes, no "while I was
  in there" edits, no new files inside the analyzed project.
- **Do not deploy anything.** No builds against real infrastructure, no `terraform apply`
  or `plan` against real state, no cloud API calls, no container pushes.
- **Do not run untrusted project code.** Reading a `package.json` is fine; running its
  scripts is not.
- **Do not print secret values.** If you find real credentials in a tracked file, report
  the file and the fact — never the value.

Safe local commands are fine: `git log`, `git remote -v`, listing files, reading files,
`terraform fmt -check`, `--version` checks.

## Evidence Discipline

Every claim in the report is one of three things, and must be labelled:

- **Observed** — read directly from a file. Cite `path/to/file:line`.
- **Inferred** — a reasonable conclusion from evidence. Say what the evidence was.
- **Unknown** — not determinable from the repo. Goes in section 10. Never guess.

If the repo contradicts itself (README says Postgres, code connects to MySQL), report
**both** and flag the contradiction. Do not silently pick a winner.

## Discovery Sweep

Work through these. Note what exists **and what is missing** — an absent healthcheck,
absent tests, or absent migration tooling are all findings.

### Entry documents
`README*`, `CONTRIBUTING*`, `docs/`, `ARCHITECTURE*`, `Makefile`, `*.md` in the root.
Read the README first, but trust the code over the README.

### Dependency manifests and runtimes
`package.json` + lockfile, `requirements.txt`, `Pipfile`, `pyproject.toml`, `poetry.lock`,
`go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`, `*.csproj`.
Capture: language, runtime version pins, framework, dependency count, dev vs prod split,
and the scripts/targets used to build, test, start, and migrate.

### Containerization
`Dockerfile*`, `.dockerignore`, `docker-compose*.yml`, `devcontainer.json`.
Capture: base images and whether they are pinned, multi-stage or not, exposed ports,
user (root or not), healthchecks, build args, entrypoint/CMD, volumes, and every service
declared in compose — those services are the real dependency list.

### Configuration and secrets
`.env.example`, `.env.sample`, `config/`, `settings.py`, `application*.yml`, `appsettings*.json`.
Enumerate every environment variable **by name and purpose**, grouped: database, cache,
queue, auth, third-party API keys, feature flags, runtime tuning. Flag any `.env` that is
tracked in git, and any secret that appears hardcoded in source. **Names only, never values.**

### Application components
Walk the source tree. Identify each deployable unit separately:
- **Frontend** — framework, SSR vs SPA vs static, build output directory, routing, asset
  handling, whether it needs a runtime or is just files.
- **Backend** — framework, HTTP server, port, process model (single process, workers,
  threads), stateless or stateful, session handling, file-upload handling, startup
  dependencies, graceful shutdown, health/readiness endpoints.
- **Workers / consumers** — separate processes, what triggers them, what they consume.
- **CLIs, scripts, admin tools** — anything with its own entry point.
- **Monorepo layout** — workspaces, packages, apps, and how they depend on each other.

### APIs
Style (REST, GraphQL, gRPC, tRPC), route inventory or route file locations, public vs
internal, versioning, request/response size expectations, long-running or streaming
endpoints, rate limiting, CORS config, and any OpenAPI/schema files.

### Data architecture
- **Databases** — engine and version, ORM or driver, connection/pooling config, migration
  tooling and where migrations live, schema shape (tables/collections/models), seed data,
  multi-tenancy.
- **Caches** — Redis/Memcached, what is cached, whether it is required or optional.
- **Object/file storage** — local disk, S3-compatible SDK usage, upload paths, what the
  app expects to persist between restarts (this is the statefulness question).
- **Search / analytics stores** — Elasticsearch, OpenSearch, vector DBs.
- **Data volume and retention** signals, if any exist in code or docs.

### Authentication and authorization
Mechanism (session, JWT, OAuth/OIDC, SAML, API key, magic link), identity provider,
where sessions live, password/token handling, role or permission model, admin surfaces,
and any auth-related third-party SDK.

### Asynchronous work
- **Queues** — SQS, RabbitMQ, Kafka, Redis-backed (BullMQ, Celery, Sidekiq, Resque),
  producers, consumers, retry and DLQ behavior.
- **Background jobs** — what runs out-of-band, how long it runs, whether it is idempotent.
- **Cron / scheduled tasks** — crontab files, framework schedulers, `node-cron`,
  Celery beat, Kubernetes CronJobs, GitHub Actions `schedule` triggers. Record the
  schedule and what each job does.
- **WebSockets / realtime** — `ws`, Socket.IO, SSE, Phoenix channels, Action Cable.
  Note connection lifetime, whether state is held in-process, and whether it assumes a
  single instance (a scaling constraint, record it as such).

### Third-party integrations
Every external service the code talks to: payments, email/SMS, auth providers, storage,
AI/LLM APIs, analytics, error tracking, maps, webhooks. For each: what it does, whether
it is on the critical path, inbound vs outbound, and the credentials it needs.

### CI/CD
`.github/workflows/*`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`, `azure-pipelines.yml`,
`bitbucket-pipelines.yml`, `buildspec.yml`.
For each pipeline: triggers, jobs and stages, test/lint/scan steps, build artifacts,
registry pushes, deploy targets, environments, approval gates, secrets consumed, and
runner/permission model (OIDC vs long-lived keys).

### Infrastructure as code
`*.tf`, `*.tfvars`, `.terraform.lock.hcl`, backend config, modules, providers, workspaces;
also Pulumi, CDK, CloudFormation, SAM, Serverless Framework, Ansible.
Report what is declared, what state backend is configured, and whether state appears
local (a risk finding). **Read only — no `init`, no `plan`, no `apply`.**

### Kubernetes
`k8s/`, `manifests/`, `helm/`, `Chart.yaml`, `values*.yaml`, `kustomization.yaml`.
Workload kinds, replicas, resource requests/limits, probes, image tags (flag `:latest`),
services and ingress, ConfigMaps and Secrets, namespaces, HPA, PVCs, CronJobs.

### Existing cloud configuration
Provider config files, SDK usage and which cloud services it implies, `vercel.json`/`vercel.ts`,
`netlify.toml`, `fly.toml`, `app.yaml`, `Procfile`, `render.yaml`, `apprunner.yaml`,
`.ebextensions`, `amplify.yml`, region hints, account IDs, and any hardcoded endpoints.

### Repository signals
Branching pattern, commit cadence, contributor count, open TODO/FIXME density, test
presence and coverage signals, linting/formatting config, `.gitignore` gaps, repo size,
and large or binary files. These say a lot about operational maturity.

## Required Output

Produce exactly these ten sections, in this order, with these headings.

### 1. Project Overview
What the software does, in plain language, in 3–6 sentences. Its purpose, its users, its
maturity (prototype / active / legacy), and whether it currently runs anywhere. Say
explicitly if the purpose had to be inferred from code because docs were thin.

### 2. Technology Stack
Table: **Layer | Technology | Version | Source (file:line) | Confidence**.
Cover language runtimes, frameworks, databases, caches, build tools, test tools, package
managers. Flag unpinned versions and end-of-life runtimes.

### 3. Application Components
One entry per deployable unit. For each: name, type (web / API / worker / scheduled job /
static site / CLI), how it starts, port, stateless or stateful (and why), what it depends
on to boot, and how it is currently built. Add a text diagram of how components talk to
each other.

### 4. Data Architecture
Every datastore: engine, version, what it holds, how it is accessed, migration strategy,
backup evidence (or its absence), and criticality — **can this data be lost?** Call out
all state that lives on local disk or in process memory, since that is what constrains
horizontal scaling.

### 5. External Integrations
Table: **Service | Purpose | Direction (in/out) | Critical path? | Credentials needed |
Failure impact**. Include webhooks received and outbound calls made.

### 6. Current Deployment
How it is deployed *today*: platform, container or not, environments that exist, the
promotion path, who or what triggers deploys, secrets delivery, domains and TLS, and
observability in place. If it is only ever run locally, say that plainly — that is a
finding, not a gap to paper over.

### 7. Infrastructure Requirements
Derived requirements only — **no solutions, no service names**. Cover:
compute shape and count · persistent storage needs · network exposure (public/private,
ports, protocols) · outbound egress needs · secret and config delivery · scheduled
execution · asynchronous processing · long-lived connections · build pipeline needs ·
environment separation · backup and restore · logging, metrics, and alerting.
Write each as a requirement: *"Needs a scheduler that can run a 20-minute job nightly,"*
not *"Use EventBridge."*

### 8. Security Considerations
Findings, ranked by severity, each with evidence and impact: secrets in the repo,
hardcoded credentials, outdated or vulnerable dependencies, containers running as root,
missing input validation on public endpoints, permissive CORS, absent rate limiting,
authentication weaknesses, over-broad IAM in existing IaC, unencrypted data paths, PII or
regulated data handling, and missing dependency/secret scanning in CI. Mark each
**observed** vs **potential**.

### 9. Scalability Considerations
Where this breaks under load, in order of what breaks first. Cover in-memory state,
sticky sessions, single-instance assumptions (WebSockets, in-process schedulers, local
file writes), database connection limits, N+1 and unindexed query patterns visible in
code, synchronous work that should be async, missing caching, and unbounded resource use.
State the current architectural ceiling and what would have to change to raise it.

### 10. Unknowns and Missing Requirements
The most important section. Two lists:

**A. Cannot be determined from the repository** — facts the code simply doesn't contain:
expected traffic, user count, budget, region, compliance obligations, uptime target,
RTO/RPO, data volume and growth, team size and on-call capacity, existing cloud accounts.

**B. Questions that must be answered before architecture** — ranked by how much each
answer changes the design. For each question, state what it unblocks:

> *"What is the expected peak concurrent users? Under ~100 the app fits a single small
> instance; above that the in-memory session store in `src/auth/session.js:14` becomes
> the first thing that must change."*

End with a one-line verdict: **ready for architecture**, or **blocked on questions 1–N**.

## Working Style

- Read broadly before concluding. Skim many files, then read the decisive ones closely.
- Cite `file:line` for anything load-bearing so the user can verify you.
- Report absence as clearly as presence. "No tests found" is a real finding.
- Do not soften bad news. If secrets are committed or the app can't survive a restart,
  say it in the first line of that section.
- If the repository is too large to read fully, say what you sampled and what you skipped.
- Keep the report scannable: tables, short bullets, no filler.

When the report is delivered, **stop**. Wait for the user's answers to section 10 before
anything moves toward architecture.
