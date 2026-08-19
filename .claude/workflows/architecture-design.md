# Workflow — Architecture Design

**Converts a completed project discovery report into a production-ready architecture proposal.**

This workflow covers **DESIGN** in the primary lifecycle in `CLAUDE.md`. It runs **after**
`.claude/workflows/project-discovery.md` has produced a report and the user has answered its
blocking questions.

```
DISCOVERY → REQUIREMENTS → ARCHITECTURE OPTIONS → TRADE-OFF ANALYSIS
→ RECOMMENDATION → SECURITY REVIEW → COST REVIEW → FINAL ARCHITECTURE
```

Related skill: `aws-architecture` (service-by-service decision guidance).
Output template: `.claude/templates/architecture.md`

---

## Rules For This Workflow

**Do not deploy anything.** No AWS API calls, no console actions, no CLI mutations, no
`terraform plan` or `apply` against real state. The output is a document.

**Do not write Terraform, CDK, or CloudFormation.** Implementation is a separate phase and a
separate skill (`terraform`).

**Do not modify project files.** The architecture proposal is the only artifact.

**Do not proceed on unanswered blocking questions.** If discovery marked something UNKNOWN and it
changes the design, ask it now and stop. If the user chooses to proceed anyway, record it in a
labelled `ASSUMPTIONS` block at the top of the proposal and mark every dependent decision as
provisional.

**Simplest architecture that meets the stated requirements wins.** Complexity must be earned by a
requirement that was actually stated, not one you imagined. If you reach for a more sophisticated
service, name the requirement forcing it — and if you cannot name one, choose the simpler option.

---

## Step 1 — DISCOVERY

Load the project discovery report. Confirm you have:

- Application components and how they communicate
- Data stores, their state, and what cannot be lost
- Current deployment reality
- Derived infrastructure requirements
- **Answers to the blocking questions** — traffic, budget, region, compliance, uptime target,
  RPO/RTO, environments, who operates it

If no discovery report exists, **run `project-discovery` first**. Designing against an
un-analyzed repository produces architecture that gets thrown away.

Restate the discovery findings in three or four sentences so the user can correct you before you
build on them. A misunderstanding caught here costs a paragraph; caught at implementation it
costs a rebuild.

---

## Step 2 — REQUIREMENTS

Convert discovery findings into explicit, testable requirements. Each one is traceable to
something observed, or to an answer the user gave. Label anything still unresolved **UNKNOWN**.

### 1. Functional requirements
What the system must do: serve HTTP traffic on these routes, process this queue, run this job
nightly, store these uploads, handle these webhooks, serve these static assets.

### 2. Non-functional requirements
Latency targets · throughput · request and response sizes · long-running or streaming
connections · data residency · maintenance windows · operational constraints (who runs this,
what they know).

### 3. Scalability requirements
Traffic today and expected in 12 months · peak-to-average ratio · spiky or steady · what must
scale independently · stateless vs stateful components · the growth event that would break the
current shape.

### 4. Availability requirements
Uptime target and what downtime costs · acceptable maintenance downtime · **RPO** (how much data
can be lost) and **RTO** (how fast recovery must happen) · multi-AZ or single-AZ · failure
scenarios that must be survived.

### 5. Security requirements
Data sensitivity and classification · compliance obligations · authentication and authorization
model · secrets handling · network exposure intent · encryption requirements · audit needs.

### 6. Budget constraints
Monthly ceiling · sensitivity to fixed vs usage-based cost · whether cost or velocity matters
more right now · appetite for commitments (Savings Plans, Reserved Instances).

### 7. Operational constraints
Team size and skill · is anyone on call · deployment frequency · tolerance for managed-service
lock-in · existing AWS account state.

Output as a requirements table: **ID | Requirement | Type | Source | Priority (must/should/nice)**

**Requirements marked UNKNOWN that affect the design are blocking.** Ask before continuing.

---

## Step 3 — ARCHITECTURE OPTIONS

Generate **at least one recommended architecture**, and — where the decision is genuinely close —
two or three viable options rather than one foregone conclusion.

Typical option shapes:

- **Option A — Start here** — the simplest thing that meets the stated requirements. Lowest cost,
  lowest operational burden, fastest to stand up.
- **Option B — Recommended** — the balanced choice for the stated requirements and near-term growth.
- **Option C — Production scale** — what this becomes at 10x, so the growth path is visible.

For each option, state in one paragraph: the compute model, the data layer, how traffic enters,
how async work happens, and the single constraint that shapes it.

**Do not present the most complex option as the default.** If Option A genuinely meets the
requirements, say so and recommend it.

### Compute — always compare four

Present this comparison in full, every time, even when the answer looks obvious.

| | **Lambda** | **ECS Fargate** | **EC2** | **EKS** |
|---|---|---|---|---|
| **Fits** | Event-driven, spiky, short tasks | Long-running containers | Full OS control, licensing, GPU | Many services, k8s tooling |
| **Cost floor** | $0 idle | $0 idle (per-task) | Per-instance, always on | ~$73/mo control plane + nodes |
| **Scaling** | Automatic per-request | Service autoscaling | Manual or ASG | HPA + Cluster Autoscaler |
| **Ops overhead** | Lowest | Low | Highest (patching, capacity) | Highest in concepts |
| **Watch out for** | 15-min limit, cold starts, VPC-attach cost | Task startup latency, cost at high steady load | You own patching and scaling | Control plane cost, upgrades |

Decide against the discovery evidence:
- WebSockets, SSE, or requests over 15 minutes → **Lambda is out**
- Steady round-the-clock load → containers or EC2 usually beat per-invocation billing
- Spiky, low-volume, event-driven → Lambda usually wins on cost and ops
- A Dockerfile already exists → ECS Fargate is the low-friction path
- GPU, custom kernel, specific licensing → EC2
- **Solo operator with one or two services → not EKS.** Say it directly, then say what EKS would
  add and at what threshold it starts paying

State the recommendation, the runner-up, and the specific condition that would flip it.

### Databases

Decide on the **access patterns found in discovery**, not preference.

- **RDS** — relational schema, joins, ad-hoc queries, existing SQL. Cover engine, instance class,
  Multi-AZ (and its cost multiplier), storage autoscaling, backup retention, connection limits.
  Mention **RDS Proxy** whenever Lambda talks to RDS — connection exhaustion is the classic failure.
- **Aurora / Aurora Serverless v2** — when RDS limits are actually hit, or load is genuinely
  intermittent. Serverless v2 has a floor; price it before assuming it is cheaper.
- **DynamoDB** — known key-based access, extreme scale, per-request billing. **Name the lock-in:**
  access patterns become schema, and changing them later is a migration.
- **ElastiCache** — only when a caching requirement was actually identified.

### Networking

- **VPC** — CIDR sized with room to grow; AZ count driven by the availability requirement
- **Public / private subnets** — load balancers and NAT public; compute and databases private
- **NAT Gateway** — one per AZ for resilience, one total to save money. **State the fixed cost
  either way** (~$32/mo each plus data processing), and consider VPC endpoints for S3, DynamoDB,
  ECR, Secrets Manager, and CloudWatch Logs — the S3 and DynamoDB gateway endpoints are free
- **ALB** — when path/host routing or TLS termination is needed. Compare against NLB, API Gateway,
  and Lambda Function URLs. Note the ~$16-22/mo floor
- **Route 53** — hosted zone, records, health checks, ACM certificate relationship
- **CloudFront** — when there is cacheable content or a global audience. Note when it is genuinely
  unnecessary. ACM certificates for CloudFront must be in `us-east-1`
- **Security groups** — describe intent (who may talk to whom), not policy JSON

---

## Step 4 — TRADE-OFF ANALYSIS

For every decision with a significant trade-off, compare options across the seven lenses. Use a
table; keep each cell to a phrase.

| Lens | The question it answers |
|---|---|
| **Cost** | What drives the bill; fixed vs usage-based; where it lands at this scale |
| **Security** | Blast radius, network exposure, identity model, data protection |
| **Scalability** | What scales automatically, what manually, where the ceiling is |
| **Reliability** | Failure modes, recovery, backups, dependency on one AZ |
| **Complexity** | Concepts required to understand it, moving parts |
| **Operational overhead** | Ongoing human work: patching, upgrades, capacity, on-call |
| **Maintainability** | Cost of change, upgrade path, lock-in, who else could run it |

Score **Low / Medium / High** per option with a short justification, then state the winner and
**the one sentence that decided it**.

Include at least one non-AWS alternative where honest — managed Postgres elsewhere, a PaaS, a
different container platform — and why it lost for this project.

**Name the lock-in.** If a choice is hard to reverse, say so and say what reversing costs.

---

## Step 5 — RECOMMENDATION

State the recommended architecture plainly, leading with the headline decision and the constraint
that drove it:

> *"Containers on ECS Fargate behind an ALB, with PostgreSQL on RDS Multi-AZ — because the
> application holds long-lived WebSocket connections, which rules out Lambda, and the team is one
> person, which rules out EKS."*

Then:
- **Why this and not the runner-up** — one paragraph
- **What this design deliberately gives up** — accepted single points of failure, deferred
  capabilities, manual steps left manual
- **What would change the recommendation** — the specific condition that would make you pick
  differently
- **What to do differently at 10x scale** — the growth path

---

## Step 6 — SECURITY REVIEW

Review the proposed design before finalizing it. Hand off to the `security` skill for depth.

- **Network** — public vs private placement of every component; security group intent; every path
  from the internet enumerated and intentional
- **Identity** — IAM roles per workload, trust relationships, CI/CD identity via OIDC not keys,
  human access
- **Data** — encryption at rest and in transit, key management, backup encryption
- **Secrets** — where they live, how they reach the runtime, rotation posture
- **Application** — WAF if warranted, rate limiting, TLS everywhere, gaps discovery flagged
- **Audit** — CloudTrail, log retention, what would let you reconstruct an incident

Close with **the top three security risks that remain** after this design. Every architecture has
residual risk; naming it is the point.

---

## Step 7 — COST REVIEW

- **Fixed monthly floor first** — everything that bills at zero traffic, itemized, with a total.
  NAT Gateway, ALB, EKS control plane, provisioned RDS, idle resources. **This number goes first**,
  because it is how a learning project generates a surprise bill.
- **Usage-based costs** — the drivers, with the assumptions producing them
- **Estimated monthly total** at the stated scale, with a range, **region named**
- **Top three cost drivers**, ranked
- **Three tiers** — low-cost option, recommended option, production-scale option, per `CLAUDE.md`
- **Cheaper variant** — what to remove or downgrade, and exactly what is lost
- **Cost at 10x traffic** — so the curve is visible
- **Free-tier notes** and when they expire
- **Cost controls** — budgets, anomaly detection, tagging, lifecycle policies, non-prod shutdown

State the region and that figures need confirming against the AWS pricing page. **Never invent
precise-sounding numbers.** Hand off to `cost-optimization` for depth.

### Reliability Review

Failure modes per component · blast radius · single points of failure and whether they are
accepted deliberately · backup strategy against the stated RPO · restore procedure and whether it
meets RTO · health checks · graceful degradation when a dependency fails · **rollback path**.

### Scalability Review

What scales automatically and on what signal · what scales manually and who does it · the order
in which components hit their limits · **the first bottleneck, by name** · database connection
ceiling · the scale at which this design must be revisited.

---

## Step 8 — FINAL ARCHITECTURE

Produce the architecture proposal using **`.claude/templates/architecture.md`**.

Every major AWS service in the design must carry all five:

1. **What it does** — one plain sentence, jargon defined
2. **Why it is needed** — the requirement ID from Step 2 it satisfies, and what breaks without it
3. **Why it was selected** — over the specific alternatives considered
4. **Alternatives** — at least one AWS alternative, plus a non-AWS one where honest
5. **Trade-offs** — what this choice costs

No service appears in the design without all five. A service you cannot justify is a service to
remove.

---

## Exit Condition

The workflow ends when the architecture proposal is delivered.

**Then stop.** Do not begin implementation.

Implementation starts only after the user has **explicitly approved** the architecture. On
approval, hand off to:

- `terraform` — infrastructure as code
- `docker` — container build strategy
- `cicd` — pipeline
- `kubernetes` — only if the design actually calls for it

If the user asks for changes, return to Step 3 or Step 4 — not to Step 1.
