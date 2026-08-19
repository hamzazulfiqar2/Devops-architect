---
name: aws-architecture
description: Design an AWS architecture from a completed project discovery. Evaluates VPC, IAM, EC2, ECS, EKS, Lambda, RDS, DynamoDB, S3, CloudFront, Route 53, ALB, ECR, Secrets Manager, CloudWatch, SQS, SNS, and EventBridge against cost, security, scalability, reliability, complexity, operational overhead, and maintainability — always comparing alternatives, and always comparing EC2 vs ECS vs EKS vs Lambda for compute. Produces a recommended architecture, a text diagram, per-service justification, trade-offs, security and scaling and monitoring approaches, cost analysis, and phased implementation. Use when the user says "design", "architecture", "which AWS services", "how should I host this", or after project discovery completes. Design only: never deploys, never modifies infrastructure, never writes IaC.
---

# AWS Architecture

Design the architecture. Justify every choice. Build nothing.

## Prerequisites

This skill consumes a **completed project discovery**. Before designing, confirm you have:

- The application components and how they communicate
- Data stores, their state, and what cannot be lost
- Infrastructure requirements (compute shape, storage, networking, async work, scheduling)
- Answers to the blocking questions from discovery — **traffic, budget, region, compliance,
  uptime target, RTO/RPO, environments, who operates it**

If discovery has not run, run `project-discovery` first. If discovery ran but its blocking
questions are unanswered, **ask them now and stop**. Do not design around invented numbers.

If the user insists on proceeding without an answer, state the assumption in a labelled
`ASSUMPTIONS` block at the top of the design and mark every decision that depends on it as
provisional.

## Hard Boundaries

- **Do not deploy anything.** No AWS API calls, no console actions, no CLI mutations.
- **Do not modify infrastructure.** Nothing that changes real state, in any account.
- **Do not write Terraform, CDK, or CloudFormation.** That is the implementation skill's job.
  Output here is a design document, not code.
- **Do not modify project files.** The only artifact is the architecture document.

## Design Rules

**Simplest architecture that meets the stated requirements wins.** Complexity must be
earned by a requirement that was actually stated, not by one you imagined. If you find
yourself reaching for a more sophisticated service, name the requirement forcing it — and
if you cannot name one, choose the simpler option.

**Never recommend a service without naming what it beat.** Every service entry carries at
least one AWS alternative and, where honest, one non-AWS alternative, each with the reason
it lost *for this project*.

**Never recommend the most complex option by default.** Kubernetes is not a starting point.
Multi-region is not a starting point. Microservices are not a starting point. For a single
service with modest traffic, say so plainly and explain what the complex option would have
bought and at what scale it starts paying for itself.

**Name the cost floor.** Some resources bill whether traffic exists or not — NAT Gateway
(~$32/mo per AZ plus data), ALB (~$16/mo plus LCUs), EKS control plane (~$73/mo), provisioned
RDS, Global Accelerator, idle NLBs. Call these out explicitly and separately from usage-based
cost. This is the single most common way a learning project generates a surprise bill.

**Name the lock-in.** If a choice is hard to reverse (DynamoDB access patterns, Lambda-native
code structure, proprietary managed services), say so and say what reversing would cost.

**Design for the operator you actually have.** If one person who is learning DevOps will run
this, that is a first-class constraint. Managed beats self-hosted. Fewer moving parts beats
theoretically optimal. Say when you are trading efficiency for operability.

**Region:** if unknown, ask. Never silently default to us-east-1.

**Prices:** state the region and assumptions, and note that figures need confirming against
the AWS pricing page. Never invent precise-sounding numbers.

## The Seven Lenses

Every **major** decision — compute, data store, networking model, deployment strategy — is
evaluated against all seven. Use a table; keep each cell to a phrase or short sentence.

| Lens | The question it answers |
|---|---|
| **Cost** | What drives the bill, what is fixed vs usage-based, where it lands at this scale |
| **Security** | Blast radius, network exposure, identity model, data protection |
| **Scalability** | What scales automatically, what scales manually, where the ceiling is |
| **Reliability** | Failure modes, recovery behavior, backup and restore, dependency on one AZ |
| **Complexity** | Concepts required to understand it, moving parts, config surface |
| **Operational overhead** | Ongoing human work: patching, upgrades, capacity, on-call |
| **Maintainability** | Cost of change, upgrade path, lock-in, who else could pick it up |

Score each option **Low / Medium / High** with a short justification, then state the winner
and the one sentence that decided it.

## Compute Decision — Always Compare Four

Compute is the decision that shapes everything else. Present this comparison in full, every
time, even when the answer looks obvious.

| | **Lambda** | **ECS Fargate** | **EC2** | **EKS** |
|---|---|---|---|---|
| **Fits** | Event-driven, spiky, short tasks | Long-running containers, steady or bursty | Full OS control, licensing, GPU, legacy | Many services, k8s-native tooling, portability |
| **Cost floor** | $0 idle | $0 idle (per-task billing) | Per-instance, always on | ~$73/mo control plane + nodes |
| **Scaling** | Automatic, per-request | Automatic via service autoscaling | Manual or ASG | HPA/Cluster Autoscaler, you tune it |
| **Ops overhead** | Lowest | Low | Highest (patching, AMIs, capacity) | Highest in concepts and upgrades |
| **Complexity** | Low, until it isn't | Low–Medium | Medium | High |
| **Watch out for** | 15-min limit, cold starts, package size, VPC-attach cost, state | Task startup latency, per-task pricing at high steady load | You own patching, scaling, and AZ spread | Control plane cost, version upgrades, real learning curve |

Then decide against **this project's** evidence:

- Long-lived connections (WebSockets, SSE) or requests over 15 minutes → Lambda is out.
- Steady, predictable, round-the-clock load → containers or EC2 usually beat per-invocation billing.
- Spiky, low-volume, or event-driven → Lambda usually wins on both cost and ops.
- Already containerized (a Dockerfile exists) → ECS Fargate is the low-friction path.
- Needs GPU, custom kernel, specific licensing, or long warm state → EC2.
- Multiple teams, many services, existing k8s expertise, or a hard portability requirement → EKS.
- **A solo operator with one or two services → not EKS.** Say this directly, then say what
  EKS would add and roughly when (service count, team size, scaling needs) it starts to pay.

State the recommendation, the runner-up, and the specific condition that would make you
switch: *"Move to ECS if sustained concurrency exceeds X, because per-invocation billing
crosses per-task billing around there."*

## Service Evaluation Guidance

Consider each of the following. **Include only what a stated requirement justifies** — an
unnecessary service is a design flaw, and every service added has a cost, a security surface,
and something to maintain.

**VPC** — Subnet layout (public/private/isolated), AZ count, routing, and the NAT decision.
NAT Gateway is a real fixed cost; compare against VPC endpoints for AWS-service traffic, a
NAT instance, or a design where private compute simply doesn't need egress. For low-traffic
projects, explicitly consider whether a private-subnet-plus-NAT design is worth its price yet.

**IAM** — Roles over users, per-workload roles over shared ones, OIDC federation for CI over
long-lived access keys. Describe the trust relationships and the permission boundaries, not
individual policy JSON. Least privilege stated as intent.

**EC2 / ECS / EKS / Lambda** — Per the comparison above. Include instance or task sizing,
Fargate vs EC2 launch type for ECS, and Spot/Savings Plans/Reserved Instances where the
workload profile supports them.

**RDS vs DynamoDB vs Aurora** — Decide on the **access patterns found in discovery**, not on
preference. Relational schema, joins, ad-hoc queries, existing SQL → RDS. Known key-based
access, extreme scale, per-request billing appeal → DynamoDB (and name the lock-in: access
patterns become schema). Aurora when RDS limits are actually hit. Cover instance class,
Multi-AZ (and its cost multiplier), storage autoscaling, backups, retention, and connection
limits — connection exhaustion is the classic serverless-plus-RDS failure, so mention RDS
Proxy when Lambda talks to RDS.

**S3** — Static assets, uploads, backups, logs, artifacts. Storage class and lifecycle policy,
versioning, encryption, public access blocking, and presigned URLs instead of proxying
uploads through compute.

**CloudFront** — Only when there is content worth caching or a global audience. Origin choice,
cache behaviors, TLS, and whether it also fronts the API. Note when it is genuinely unnecessary.

**Route 53** — Hosted zones, record strategy, health checks, and the ACM certificate
relationship. Note the region constraint for CloudFront certificates.

**ALB** — When path/host routing, TLS termination, or multi-target load balancing is needed.
Compare against NLB (raw TCP, static IPs, lower latency), API Gateway (auth, throttling,
usage plans, per-request pricing), and Lambda Function URLs (simplest, fewest features).
Mention the ALB fixed monthly floor.

**ECR** — Image storage, lifecycle policies so old images stop costing money, scan-on-push,
and immutable tags.

**Secrets Manager vs SSM Parameter Store** — Always compare these two directly. Secrets
Manager gives rotation and cross-account sharing at ~$0.40/secret/month; Parameter Store
Standard is free and sufficient for plenty of cases. Recommend the cheaper one unless
rotation or a specific feature justifies the cost. Cover injection at runtime and the IAM
that reads them.

**CloudWatch** — Logs (with retention set, since indefinite retention is a slow-growing
bill), metrics, alarms that map to real failure modes, and dashboards. Compare against
managed Grafana, OpenTelemetry, or third-party APM where the requirement warrants it.

**SQS vs SNS vs EventBridge** — Compare all three whenever async appears. SQS: point-to-point
work queues, retries, DLQs, ordering with FIFO. SNS: fan-out pub/sub, notifications. EventBridge:
event routing with content-based rules, scheduled execution, and third-party event sources.
For cron and scheduled jobs specifically, compare EventBridge Scheduler against ECS scheduled
tasks and a container running its own scheduler.

## Required Output

Produce exactly these eleven sections, in this order.

### 1. Recommended Architecture
The design in prose, 4–8 sentences: what runs where, how a request flows, where data lives,
how async work happens. A reader should picture the whole system before seeing a single table.
Open with the headline decision (*"Containers on ECS Fargate behind an ALB, with Postgres on
RDS"*) and the one constraint that drove it.

### 2. Architecture Diagram (Text)
ASCII or box-drawing. Show VPC and subnet boundaries, AZ spread, every component, the
direction of every connection, and where the internet edge is. Label the protocol and port
on each link. Keep it readable in a terminal.

### 3. AWS Services
Table: **Service | Purpose here | Configuration highlights | Environment(s) | Cost driver**.
One row per service. No service appears here that isn't justified in section 4.

### 4. Reason for Each Service
For each service, in a few lines: **what requirement from discovery it satisfies** (cite it),
what breaks without it, and why this service rather than doing it inside something already in
the design. If a service is here for convenience rather than necessity, say so.

### 5. Alternatives
For each significant decision: the options considered, a comparison table across the seven
lenses, the choice, and the reason it won **for this project**. Include at least one non-AWS
alternative where honest (managed Postgres elsewhere, a PaaS, a different container platform).
Include the full four-way compute comparison here.

Add a short **"what I would choose differently at 10x scale"** subsection so the growth path
is visible.

### 6. Trade-offs
Plain list of what this design gives up: accepted single points of failure, deliberate cost
ceilings, manual steps left manual, lock-in taken on, capabilities deferred. Each with the
reason it was acceptable, and what would force a revisit.

### 7. Security Architecture
- **Network** — public vs private placement of every component, security group intent
  (who may talk to whom), and every path from the internet.
- **Identity** — IAM roles per workload, trust relationships, CI/CD identity (OIDC, not keys),
  and human access.
- **Data** — encryption at rest and in transit, key management, backup encryption.
- **Secrets** — where they live, how they reach the runtime, rotation posture.
- **Application** — WAF if warranted, rate limiting, TLS everywhere, input validation gaps
  that discovery flagged.
- **Audit** — CloudTrail, log retention, what would let you reconstruct an incident.
- Close with the **top three security risks that remain** after this design.

### 8. Scalability Approach
What scales automatically and on what signal, what scales manually and who does it, the
sequence in which components hit their limits, the first bottleneck by name, and the current
architectural ceiling. Cover statelessness, session handling, database connections and read
replicas, caching layers, and async offloading. State the scale at which this design should
be revisited.

### 9. Monitoring Approach
Golden signals per component (latency, traffic, errors, saturation), what to log and how long
to keep it, the specific alarms to create and their thresholds, where traces would help, and
what a health check actually verifies. **Alarms must map to failure modes named in section 6
or 7** — no alarms that no one would act on. Note the cost of the observability stack itself.

### 10. Cost Considerations
- **Fixed monthly floor** — everything that bills at zero traffic, itemized, with a total.
  This number first, before anything else.
- **Usage-based costs** — the drivers, with the assumptions that produce them.
- **Estimated monthly total** at the stated scale, with a range, region named.
- **Top three cost drivers**, ranked.
- **Cheaper variant** — what to remove or downgrade, and exactly what you lose.
- **Cost at 10x traffic** — so the scaling curve is visible.
- **Free-tier notes** and when they expire.
- **Cost controls** — budgets, alarms, tagging, lifecycle policies, auto-shutdown for
  non-production environments.

### 11. Implementation Phases
Ordered phases, each with: what gets built, why it comes at this point, what it depends on,
what is verifiable when it is done, and a rough effort estimate. Mark every phase touching
production or destructive operations with **[NEEDS EXPLICIT APPROVAL]**. Phase 1 should
produce something running and verifiable — not six phases of prerequisites. Note which phases
can be deferred without blocking the rest.

## Working Style

- Lead with the recommendation, then the reasoning.
- Tables for comparison, prose for reasoning, bullets for trade-offs.
- Teach as you go: define each AWS service in one plain sentence the first time it appears.
- Be blunt about cost and risk. *"This design costs ~$50/month before a single user arrives"*
  is more useful than a hedged paragraph.
- Offer a **start here** tier and a **grow into it** tier where the choice is close, so
  shipping now doesn't foreclose the better option later.
- If the user proposes something you consider wrong, say so once with the reason. If they
  confirm, design it their way and note the risk in section 6.

When the design is delivered, **stop**. Implementation is a separate skill and a separate
decision.
