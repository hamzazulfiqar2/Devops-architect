---
name: monitoring
description: Observability, monitoring, logging, alerting, and production troubleshooting for DevOps and AWS environments. Covers the three pillars — metrics, logs, traces — with CloudWatch Metrics, Logs, Alarms, and Dashboards, CloudTrail, and X-Ray. Includes container and orchestrator monitoring for Docker, ECS, EKS, and Kubernetes (pod and node health, restarts, events, probes, HPA), application signals (latency, error rate, throughput, availability, CPU, memory, disk, network, database metrics), structured and centralized logging with retention policy, and alerting for availability, error rate, latency, saturation, database problems, failed deployments, and certificate expiry. Defines dashboards, avoids alert fatigue, and works production symptoms back to causes. Use when the user mentions monitoring, observability, logging, alerts, metrics, dashboards, CloudWatch, "is it healthy", "why is it slow", or a production incident. Scales the design to the application's size — never bolts enterprise observability onto a small app.
---

# Monitoring & Observability

Monitor what you would act on. Alert on what would wake you up. Log what you'd need at 3am.
Everything else is cost and noise.

## Proportionality — Read This First

**Match the observability stack to the application.** The most common failure here is not too
little monitoring, it's too much: dashboards nobody opens, alerts everyone mutes, and a log bill
larger than the compute bill.

| Application | Right-sized observability |
|---|---|
| **Small** — one service, low traffic, solo operator | CloudWatch defaults + application logs with retention set + 4–6 alarms + one dashboard. **That's it.** |
| **Growing** — a few services, some users, deploys weekly | Add structured logging, per-service dashboards, log-based metric filters, alarms on dependencies, uptime checks |
| **Larger** — many services, a team, an on-call rotation | Add distributed tracing, SLOs with error budgets, anomaly detection, runbook links on every alarm, possibly a dedicated APM |

For a solo learner running one or two services, do **not** propose Prometheus + Grafana +
Loki + Tempo + Alertmanager. Say plainly that CloudWatch covers it, name what the bigger stack
would add, and give the threshold at which it starts paying for itself. If the user's goal is
*learning* the tooling, that's a legitimate reason — but name it as learning-driven rather than
requirement-driven.

**Every monitoring component must justify itself.** For each metric, log stream, alarm, and
dashboard, be able to answer: *what decision does this inform, and what would I do differently
without it?* If there's no answer, cut it.

## Before Recommending Anything

Establish:

- **What the application does** and what "working" means to a user — the thing worth measuring.
- **Components and dependencies** — services, databases, queues, third-party APIs.
- **Where it runs** — ECS, EKS, Lambda, EC2, S3+CloudFront. Determines what's available for free.
- **Existing signals** — a health endpoint, structured logs, an existing dashboard.
- **Who responds** and how — is there on-call, or one person who checks in the morning? This
  decides whether an alert is a page or an email.
- **Acceptable downtime** — if a stated uptime target exists, alerting thresholds derive from it.
- **Budget sensitivity** — CloudWatch Logs ingestion and custom metrics are real line items.

If nobody is on call, do not design a paging strategy. Design a morning-check dashboard and a
small set of email alerts. Say so.

## The Three Pillars

**Metrics** — numbers over time. Cheap to store, fast to query, good for alerting and trends.
Answer: *is something wrong, and since when?* Weakness: aggregated, so they can't explain a
single request.

**Logs** — discrete events with detail. Answer: *what exactly happened to this request?*
Weakness: expensive at volume, slow to search unstructured.

**Traces** — one request's path across services, with timing per hop. Answer: *where did the
time go, and which service broke the chain?* Weakness: requires instrumentation and is most
valuable once you have several services.

The practical loop: **a metric tells you something is wrong → a trace tells you where → a log
tells you why.** For a single-service app, metrics and logs are usually enough; say so rather
than instrumenting tracing by reflex.

## What to Measure

### The four golden signals — start here, per service

| Signal | Meaning | Typical source |
|---|---|---|
| **Latency** | How long requests take. **Track p50, p95, p99 — never averages.** An average hides the users having a bad time. Measure successful and failed requests separately; fast errors flatter your numbers. | ALB `TargetResponseTime`, app instrumentation |
| **Traffic** | Requests per second, or queue depth for async work. Context for everything else. | ALB `RequestCount`, SQS `NumberOfMessagesSent` |
| **Errors** | Rate of failed requests, as a **percentage** of traffic, not a raw count. | ALB `HTTPCode_Target_5XX_Count` / `RequestCount`, app logs |
| **Saturation** | How full the system is — CPU, memory, connections, queue backlog. The leading indicator. | ECS/EKS metrics, RDS `DatabaseConnections` |

For resources rather than requests, the complement is **USE**: Utilization, Saturation, Errors.

### Infrastructure
CPU (with the note that a CPU-throttled container shows *low* CPU while being slow), memory
(and whether OOM kills are occurring), disk usage and IOPS, network throughput and errors.
Disk-full is a classic outage cause and a trivially cheap alarm.

### Database
Connection count against the max (the most common serverless-plus-RDS failure), CPU, free
storage, read/write latency, replica lag, deadlocks, and slow queries. Free storage trending to
zero deserves an alarm with days of warning, not minutes.

### Queues and async
Queue depth, message age (`ApproximateAgeOfOldestMessage` is often the best single async health
signal), DLQ depth — **any message in a DLQ is worth an alert** — and consumer error rate.

### Frontend / delivery
CloudFront cache hit ratio, 4xx/5xx rates, origin latency. And **certificate expiry**: ACM
auto-renews only when DNS validation still resolves, so alarm on `DaysToExpiry` anyway.

## Container and Orchestrator Monitoring

**Docker (local/single host)** — `docker stats`, container health status, restart counts, and
whether the log driver ships anywhere. Fine for development; not a production strategy.

**ECS** — Service `CPUUtilization` / `MemoryUtilization`, running vs desired task count (a
persistent gap means tasks are failing to start or stay up), task stopped reasons, deployment
state, and target group healthy host count. Enable **Container Insights** for per-task detail —
it costs money, so say so and let the user decide.

**EKS / Kubernetes** — the specific signals that matter:
- **Pod health** — phase, `Ready` condition, and **restart count**. A rising restart count is
  the single most informative Kubernetes signal; it precedes most visible outages.
- **Node health** — `Ready`, plus `MemoryPressure`, `DiskPressure`, `PIDPressure`.
- **Deployment health** — desired vs available vs updated replicas; a rollout stuck partway.
- **Resource utilization** — usage against *requests* (scheduling accuracy) and against *limits*
  (throttling and OOM risk). CPU throttling is invisible unless you look for it.
- **Events** — `kubectl get events --sort-by=.lastTimestamp`. Events expire after ~1 hour by
  default, so ship them somewhere if you want post-incident forensics.
- **Probes** — readiness failures, which silently remove pods from Service endpoints.
- **HPA** — current vs desired replicas, and whether it's pinned at `maxReplicas` (out of room)
  or flapping (thresholds too tight).
- **Pending pods** and OOMKilled counts.

Container Insights or the Prometheus stack both work; pick on scale and pick once.

## Logging

**Structured logs (JSON) over free text.** The moment logs are structured, they become
queryable — CloudWatch Logs Insights can filter and aggregate on fields instead of regex-ing
strings. This is the single highest-leverage logging change most projects can make.

Every log line should carry: timestamp, level, service name, environment, message, and a
**correlation/request ID** that follows a request across services. Without a correlation ID,
multi-service debugging is guesswork.

**What to log at each level:** ERROR for things needing human attention (with a stack trace);
WARN for degraded-but-handled; INFO for significant business events and request summaries;
DEBUG off in production by default.

**Never log:** passwords, tokens, API keys, full credit card numbers, personal data beyond what's
needed, or full request bodies containing any of the above. A log store is a lower-security
system than the database it describes, and logs get shipped to third parties.

**Log types to cover:** application logs, access logs (ALB/CloudFront to S3), error logs,
audit logs (CloudTrail), and database slow-query logs.

**Centralization** — everything in CloudWatch Logs with sensible group names
(`/ecs/<service>/<env>`). For containers, use the `awslogs` driver (ECS) or Fluent Bit
(EKS/Fargate).

**Retention is mandatory and is a cost decision.** CloudWatch Logs default to *never expire* —
this is the quiet bill that grows forever. Suggested defaults: application logs 30 days, access
logs 90 days, audit/CloudTrail 1 year or per compliance, debug logs 7 days. Archive to S3 with
lifecycle to Glacier when longer retention is needed at a fraction of the cost.

**Log-based metrics** — a metric filter turns "count of lines matching ERROR" into a metric you
can alarm on. Cheaper than custom metrics from the app, and it works without code changes.

## Alerting

### The rules

**Every alert must be actionable.** If the response is "huh, weird" or "it recovered", it should
not be an alert. Delete alerts nobody acts on — an ignored alert is worse than no alert, because
it trains people to ignore the next one.

**Alert on symptoms, not causes.** "Error rate is 8%" is worth waking someone; "CPU is 85%" is
usually not — CPU at 85% while serving fine is a system doing its job. Alert on user-visible
impact; use cause metrics for diagnosis and dashboards.

**Two tiers, and be honest about which is which:**
- **Page** — user-visible impact happening now, requiring immediate human action.
- **Ticket / email** — needs attention this week: disk trending full, certificate expiring in 30
  days, cost anomaly.

If nobody is on call, everything is tier two. Design accordingly.

**Set thresholds against observed behaviour, not folklore.** Watch real values for a week before
committing. If no data exists, say the thresholds are starting points and must be tuned.

**Use evaluation periods to kill flapping** — "3 consecutive 1-minute periods" rather than a
single breach. Set `TreatMissingData` deliberately: for an alarm on error *count*, missing data
usually means no traffic, not health.

**Every alarm needs a runbook line**: what it means, first thing to check, likely causes. Put it
in the alarm description so it travels with the notification.

### Baseline alert set (a small service)

| Alert | Condition | Tier | Why |
|---|---|---|---|
| **Service down** | Healthy host count = 0, or health check failing 3× | Page | Total outage |
| **High error rate** | 5xx > 5% of requests for 5 min | Page | Users are broken |
| **High latency** | p95 > 2× normal for 10 min | Page/ticket | Degraded experience |
| **Task/pod crash loop** | Restart count rising, or running < desired for 10 min | Page | Deploy or runtime failure |
| **Database connections** | > 80% of max | Page | Imminent hard failure |
| **Database storage** | Free storage < 15% | Ticket | Days of warning, cheap fix |
| **Memory saturation** | > 90% for 15 min, or any OOMKill | Ticket | Predicts crashes |
| **Disk full** | > 85% | Ticket | Classic avoidable outage |
| **DLQ not empty** | Any message | Ticket | Work is being lost |
| **Queue age** | Oldest message > SLA | Ticket | Consumers not keeping up |
| **Certificate expiry** | < 30 days | Ticket | Complete outage if missed, trivially preventable |
| **Failed deployment** | Rollout stuck or CI deploy job failed | Ticket | Prevents silent stale versions |
| **Cost anomaly** | Budget threshold or anomaly detection | Ticket | Financial protection |

Route through SNS to email/Slack; add PagerDuty only when there's a rotation to page.

Consider **composite alarms** to suppress downstream noise — if the database is down, you don't
need eleven separate alerts about services that depend on it.

## Dashboards

**One dashboard per audience, and few of them.**

**Service health (the daily one)** — request rate, error rate, p50/p95/p99 latency, healthy host
count, CPU and memory, recent deploy markers. Should answer "is it okay?" in five seconds.

**Deep dive (used during incidents)** — per-component breakdown, database metrics, queue depth,
dependency latency, log error counts.

**Cost** — spend by service, trend, top drivers. Monthly review, not daily.

Design rules: most important at the top-left · consistent time range across widgets · annotate
alarm thresholds directly on graphs · include a deploy-event marker so "it broke at 14:32" lines
up with "we deployed at 14:31" · make it readable at a glance, since a dashboard nobody can parse
is a dashboard nobody opens.

## Traces and CloudTrail

**X-Ray / OpenTelemetry** — worth it when a request crosses three or more services, or when
latency has no obvious owner. For a single service, database query logging plus timing in
application logs gets you most of the value for none of the setup. Sample rather than tracing
everything; tracing has both cost and overhead.

**CloudTrail** is audit, not monitoring — *who did what to the AWS account*. Enable it in all
regions with log file validation. Alarm on high-signal events: root account usage, IAM policy
changes, security group changes, CloudTrail being disabled. It's the record you'll want after an
incident, so set it up before you need it.

## Troubleshooting Production Symptoms

Work symptom → signal → cause. Always establish **when it started** and **what changed then** —
deploy, config change, traffic shift, or dependency incident. Most production problems are
something that changed.

**"The site is down"** — Load balancer healthy host count → target health → task/pod status →
container logs → recent deploys. Distinguish *nothing running* from *running but failing health
checks* early; they have completely different causes.

**"It's slow"** — Is latency up at the load balancer, or only for users? Then: which percentile
(p99 only = a subset of requests; p50 too = systemic)? Then: CPU throttling, memory pressure,
database latency, connection pool exhaustion, an N+1 query, a slow dependency, or cold starts.
Check the database first — it usually is.

**"Errors spiked"** — Group by error type and endpoint in the logs. 5xx = your fault; 4xx spike
= often a client or auth change. Correlate with deploy time. Check dependency health.

**"It works sometimes"** — Suspect one bad instance among several: check per-task/per-pod metrics
rather than the service average, which averages the problem away. Also: a partially-completed
rollout, one unhealthy AZ, or a cache with stale entries.

**"It broke after the deploy"** — Compare against the previous version, check migration status,
check config and secret changes, check whether the image is actually the one you think. Rollback
first, diagnose after, if users are affected.

**"Memory keeps growing"** — Confirm with the metric over days, not minutes. Rising restart
counts plus OOMKilled confirms a leak. Correlate against deploy history to find when it started.

**"It's healthy but users complain"** — Your health check is too shallow. It proves the process
is alive, not that it can serve. Also check: DNS, CDN caching, TLS, and a region or client
segment you're not measuring.

**"Nothing in the logs"** — Verify the log driver is configured, the log group exists, the app
writes to stdout/stderr rather than a file inside the container, the level isn't filtering it
out, and that you're looking at the right time zone.

## Output When Designing Monitoring

1. **What needs monitoring** — components and dependencies, with what "healthy" means for each.
2. **Metrics** — per component, with the source and why it's worth collecting.
3. **Logs** — what to log, structure, groups, retention per type, and the estimated cost.
4. **Alerts** — the table: condition, threshold, evaluation period, tier, and the runbook line.
   Include what you deliberately chose *not* to alert on, and why.
5. **Dashboards** — which ones, who reads them, and what each widget answers.
6. **Traces** — whether they're warranted here at all, honestly.
7. **Implementation** — CloudWatch config, agent or driver setup, and what code changes are
   needed (structured logging, correlation IDs, health endpoints).
8. **Cost estimate** — log ingestion and storage, custom metrics, alarms, Container Insights,
   dashboards. Monitoring bills are frequently a surprise; state them up front.
9. **What's deliberately excluded** — what you left out and the scale at which to add it.

## Working Style

- Justify every component. If you can't name the decision it informs, don't recommend it.
- Prefer what's already there and free over what must be built.
- Give concrete thresholds, and label them as starting points when they aren't measured.
- Be direct about monitoring cost — it's a common surprise line item.
- Teach as you go: explain p95 vs average, symptom vs cause alerting, and why restart count
  matters, in plain English on first use.
- Resist adding. The best observability setup is the smallest one that catches real problems.
