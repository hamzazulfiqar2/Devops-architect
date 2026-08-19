---
name: cost-optimization
description: Reduce AWS and DevOps infrastructure cost without compromising reliability, security, or performance. Reviews compute (EC2, ECS, EKS, Lambda, Auto Scaling), storage (S3, EBS, EFS), databases (RDS, DynamoDB), networking (NAT Gateway, load balancers, CloudFront, data transfer), and the quiet line items (CloudWatch Logs, ECR, snapshots, backups). Identifies cost drivers, unnecessary resources, over-provisioning, right-sizing opportunities, cheaper service alternatives, scaling-pattern mismatches, non-production waste, missing lifecycle policies, and surprise-bill risks. Every recommendation states current approach, cost impact direction, alternative, trade-off, and reliability, security, and complexity impact — and separates cost saving from cost avoidance from architectural optimization. Use when the user mentions AWS cost, billing, "why is my bill so high", right-sizing, savings plans, reserved instances, or budget concerns.
---

# Cost Optimization

Find the money. Say what it costs to save it. Never trade away something that matters.

## The Governing Rule

**Do not optimize cost blindly.** Every saving buys something and sells something. Your job is to
make the exchange rate visible, not to drive the number down.

**Never recommend a reduction that creates unacceptable security or reliability risk.** Some
things are not cost levers, and you should say so plainly when they come up:

- Backups, and their retention — the cheapest thing you own until the day you need it
- Encryption, KMS, and audit logging
- Multi-AZ for anything holding production data
- Deletion protection and `prevent_destroy`
- Security scanning, WAF on a genuinely exposed application
- Enough monitoring to know the system is broken

If a cut in one of these areas would genuinely save meaningful money, present it with the risk
stated **first**, mark it explicitly as a risk-accepting trade, and let the user decide. Never
slip it into a list of easy wins.

Also refuse the false economy: an outage, a breach, or a lost database costs more than a year of
the resource that would have prevented it. Say that when it's relevant, once, without lecturing.

## Three Categories — Always Distinguish

Label every recommendation as exactly one of these. Blurring them makes savings claims
meaningless.

| Category | Definition | Test | Example |
|---|---|---|---|
| **Cost saving** | Reduces a bill you are paying **today**. Measurable next month. | "Will this month's invoice be lower?" | Delete 4 unattached EBS volumes: −$32/mo. Set log retention to 30 days: −$60/mo. |
| **Cost avoidance** | Prevents future spend that would otherwise arrive. Nothing changes on today's bill. | "Would this cost have appeared later?" | ECR lifecycle policy so images don't accumulate. A budget alarm. Right-sizing before scaling up. |
| **Architectural optimization** | Changes the design so cost scales better. Usually requires work, sometimes costs more short-term. | "Does this change the cost *curve*, not just the current point?" | Fargate → Lambda for spiky traffic. VPC endpoints replacing NAT data processing. CloudFront in front of an origin. |

State each with its own number. **Never add avoidance to savings and present one total** — that
is how optimization reports lose credibility. Give a savings total, an avoidance total, and the
architectural items separately with their payback period.

## Before Reviewing

Establish:

- **Actual bill data** if available — Cost Explorer by service, by tag, and month-over-month.
  Without it you're reasoning from architecture, which is useful but less precise. **Say which
  you're doing.**
- **Region** — pricing varies materially.
- **Environments** — which resources are production versus dev/staging.
- **Traffic and usage reality** — measured, not assumed. Right-sizing without utilization data is
  guessing.
- **Requirements you must not break** — uptime target, RPO/RTO, compliance, performance SLAs.
- **What's already committed** — existing Reserved Instances or Savings Plans change the maths.
- **Effort tolerance** — is this "find quick wins" or "we'll re-architect if it's worth it"?

If bill data isn't available, say the estimates are directional and based on list pricing, name
the region and assumptions, and note that figures need confirming against the AWS pricing page.
**Never invent precise-sounding numbers.**

## The Big Picture First

Before line items: **cost follows architecture**. The largest savings usually come from the
compute model and the data path, not from trimming instance sizes. Look at the shape before the
details.

Also apply the 80/20 rule honestly. Find the top three cost drivers and work those. A report
that saves $4/month on ten items while ignoring a $300/month NAT Gateway is a failure.

## Compute

**EC2** — the classic sources of waste: idle instances, instances sized for a peak that never
comes, dev boxes running nights and weekends, previous-generation instance types (newer
generations are usually cheaper *and* faster), and x86 where Graviton (`t4g`, `m7g`, `c7g`) would
work — Graviton is typically ~20% cheaper for compatible workloads and is one of the best
effort-to-saving ratios available.

Commitments: **Savings Plans** (flexible, covers Fargate and Lambda too) or **Reserved
Instances** (cheaper, less flexible) for steady baseline load. Only commit to what you're
confident you'll run for the full term — an unused commitment is pure loss. **Spot** for
fault-tolerant, interruptible work (batch, CI runners, stateless workers with capacity
elsewhere); never for a single-instance stateful service.

Right-size from real CloudWatch data over at least two weeks. Compute Optimizer does this for
you and is free.

**ECS** — Fargate is priced per vCPU-second and GB-second: excellent for variable load, more
expensive than EC2 at high steady utilization. The crossover is roughly when you'd keep instances
well-packed around the clock. Check task sizing — Fargate's CPU/memory combinations are discrete,
so an over-specified task wastes a whole tier. **Fargate Spot** for non-critical tasks. Scale to
zero in non-production.

**EKS** — the control plane is ~$73/month per cluster before a single node. Multiple clusters
multiply that. Common waste: one cluster per environment where namespaces would do (weigh against
the isolation you lose), nodes running at 20% utilization because requests are set far above real
usage, and no Cluster Autoscaler or Karpenter so nodes never scale down. **The single biggest EKS
saving is usually fixing inflated resource requests** — they determine bin-packing, and inflated
requests mean paying for nodes to hold air.

**Lambda** — cheap for spiky and low-volume, expensive at sustained high concurrency. Cost is
memory × duration, and because more memory also means more CPU, **raising memory sometimes
lowers cost** by finishing faster — test it rather than assuming. Watch for provisioned
concurrency left on when it isn't needed, functions with excessive timeouts, and idle waiting on
network calls (you pay for the wait). If a Lambda runs constantly, price it against Fargate.

**Auto Scaling** — check that it actually scales *down*, not just up. Look for a minimum capacity
set higher than needed, cooldowns so long the fleet never shrinks, and scaling on the wrong
metric. Scheduled scaling for predictable patterns is simple and effective.

## Storage

**S3** — usually cheap until it isn't. Look for: no lifecycle policies (the default failure),
old versions accumulating where versioning is on (invisible in the console object list but fully
billed), incomplete multipart uploads billing forever (a genuinely hidden cost — one lifecycle
rule fixes it), and everything sitting in Standard.

Storage classes: Standard → Standard-IA (30+ days, infrequent access) → Glacier Instant/Flexible →
Deep Archive. **Intelligent-Tiering** is the low-effort choice when access patterns are unknown —
it moves objects automatically for a small monitoring fee. Note retrieval costs and minimum
storage durations before recommending a colder class; moving frequently-read data to Glacier can
*increase* total cost.

**EBS** — the most common pure waste in AWS: **unattached volumes**, which bill in full forever.
Also: `gp2` where `gp3` would be ~20% cheaper with better baseline performance (a near-free
migration), volumes provisioned far larger than used, and old snapshots accumulating with no
lifecycle. Snapshots are incremental but never expire on their own — use Data Lifecycle Manager.
**Keep the backups; expire the redundant history.**

**EFS** — significantly pricier per GB than EBS or S3. Use it only when you genuinely need shared
`ReadWriteMany` access. Enable Infrequent Access lifecycle. If a single writer would do, EBS is
much cheaper; if it's really object storage, S3 is cheaper still.

## Databases

**RDS** — usually a top-three line item. Check: instances sized for a peak that never occurs,
Multi-AZ on non-production (roughly doubles cost — **remove it in dev/staging, keep it in
production**), `gp2` instead of `gp3`, provisioned IOPS nobody needs, old manual snapshots
accumulating, and dev databases running 24/7 when they're used 40 hours a week.

Levers: right-size from real CPU and connection metrics · Reserved Instances for steady
production · Graviton instance classes · storage autoscaling instead of over-provisioning
upfront · **Aurora Serverless v2 for genuinely intermittent workloads** (it scales down, but has
a floor — price it before assuming it's cheaper) · stop non-production instances outside working
hours (RDS auto-restarts after 7 days, so pair with automation).

**DynamoDB** — the mode choice dominates. **On-demand** for unpredictable or low traffic and no
capacity planning; **provisioned with autoscaling** is substantially cheaper for steady,
predictable load. Switching mode is a real lever. Also check: unused GSIs (each one duplicates
write cost), items larger than necessary, missing TTL on ephemeral data, scans where queries
would do, and old point-in-time recovery settings on tables that don't need them.

## Networking — Where the Surprises Live

**NAT Gateway** — the most common surprise bill in AWS. Roughly $32/month *per gateway* plus
~$0.045 per GB processed. Three AZs means three gateways: ~$97/month before a byte moves. And
traffic to S3, ECR, DynamoDB, Secrets Manager, and CloudWatch Logs all flows through it by
default.

Fixes, in order of value: **VPC Gateway Endpoints for S3 and DynamoDB are free** and remove that
traffic from NAT entirely — this is close to a no-brainer. **Interface Endpoints** (~$7/month
each plus data) for ECR, Secrets Manager, and CloudWatch Logs pay for themselves at moderate
volume. Consolidate to one NAT Gateway in dev/staging (accepting the AZ-failure risk *there
only*). For small workloads, consider whether private subnets with NAT are needed yet at all —
and say clearly what you give up.

**Load balancers** — ~$16-22/month each plus capacity units. Waste: one ALB per service where
host/path routing on a shared ALB would do, ALBs left running behind deleted services, and ALBs
in non-production environments that could use a single shared one. For a single Lambda, a
Function URL or API Gateway may be cheaper than an idle ALB.

**CloudFront** — often *reduces* cost, because CloudFront egress is cheaper than direct
EC2/S3 egress and cache hits eliminate origin requests entirely. Check cache hit ratio; a low
ratio means you're paying for CloudFront without the benefit. Verify the price class matches
your actual audience geography.

**Data transfer** — the cost nobody models. Internet egress is the expensive direction
(inbound is free). **Cross-AZ traffic is charged in both directions** — chatty services spread
across AZs quietly generate real cost, and this is worth checking whenever a bill has an
unexplained "EC2-Other" component. Cross-region is more expensive again. VPC endpoints, keeping
related traffic in-AZ where availability allows, and caching all help.

## The Quiet Line Items

**CloudWatch Logs** — ingestion (~$0.50/GB) plus storage, and **the default retention is
never expire**. This is the slow-growing bill nobody notices for a year. Set retention on every
log group, drop DEBUG logging in production, and archive to S3 for long retention at a fraction
of the price. Also watch custom metrics (~$0.30 each per month) and high-resolution alarms —
they add up quickly at scale, and Container Insights is not free.

**ECR** — no lifecycle policy means every image from every CI build stays forever. A pipeline
that builds 20 images a day at 500 MB accumulates ~3 TB a year. One lifecycle rule (keep the
last N tagged, expire untagged after 7 days) fixes it permanently. Also note cross-region and
internet pull data transfer.

**Snapshots and backups** — EBS snapshots, RDS manual snapshots, and AMIs accumulate silently.
Automate expiry of *redundant* history with Data Lifecycle Manager or AWS Backup lifecycle
rules. **Do not reduce retention below the stated RPO, and do not touch the most recent
recovery point.** If no RPO has been stated, ask — do not assume one.

**Other quiet items:** unassociated Elastic IPs (billed when idle), idle NAT gateways, unused
Route 53 health checks, forgotten Secrets Manager secrets at ~$0.40 each, dangling
CloudFormation/Terraform resources from failed applies, and old Lambda versions.

## Non-Production Environments

Frequently 30–50% of a bill for something used a third of the week. High-value, low-risk levers:

- **Stop or scale to zero outside working hours** — a scheduled Lambda or EventBridge rule. A
  dev environment running 40h/week instead of 168h costs ~76% less.
- **Smaller instance sizes** — dev rarely needs production capacity.
- **Single-AZ, no Multi-AZ, no read replicas.**
- **Shorter retention** on logs, backups, and snapshots.
- **Shared load balancer** across dev services.
- **Fewer NAT Gateways** — one, or none.
- **Auto-delete ephemeral environments** — PR preview environments that outlive their PR.

This is usually the safest place to cut, because reliability risk in dev is tolerable in a way it
never is in production. Lead with it.

## Surprise Cost Risks

Flag these proactively — they're how a learning project generates an alarming invoice:

- NAT Gateway data processing on a chatty workload
- CloudWatch Logs with no retention, growing indefinitely
- Data transfer, especially cross-AZ and internet egress
- Free-tier expiry after 12 months, with nothing changing on your side
- A misconfigured autoscaler scaling up and not down
- Recursive Lambda invocation (a function that triggers itself — can spend thousands in hours)
- S3 versioning without lifecycle rules
- An accidentally public S3 bucket serving traffic to the world
- Provisioned concurrency or provisioned IOPS left on after a test
- Multiple EKS clusters at $73/month each
- Anything created in a region you forgot you used
- Test resources from a tutorial, never deleted

**Always recommend the guardrails**: AWS Budgets with alerts, Cost Anomaly Detection (free),
cost allocation tags enforced from day one, and a monthly bill review. These are cost
*avoidance*, cost pennies, and are the highest-value item in most reports.

## Recommendation Format

Every recommendation uses this shape:

```
### [SAVING | AVOIDANCE | ARCHITECTURAL] Short title

**Current approach**
What exists today, with the resource identified.

**Estimated cost impact**
Direction and rough magnitude, with the assumptions and region stated.
e.g. "↓ ~$95/month (3 NAT Gateways → 1 + S3 endpoint; eu-west-1 list pricing)"

**Alternative**
The specific change to make.

**Trade-off**
What you give up. If nothing, say "none" — but be sure.

**Reliability impact**
None / Low / Medium / High, with the reason. Name the failure mode this makes more likely.

**Security impact**
None / Low / Medium / High, with the reason.

**Complexity impact**
None / Low / Medium / High — ongoing operational burden, not just implementation effort.

**Effort**
Rough time to implement, and whether it needs a change window or causes downtime.
```

Recommendations with **no** reliability, security, or complexity cost go first — those are the
free money. Recommendations that trade something go later, clearly marked, with the trade stated
before the saving.

## Report Structure

1. **Method and data** — actual bill data or architecture-based estimate; region; assumptions.
2. **Top cost drivers** — the three to five things generating most of the bill, with amounts or
   proportions. Everything else is secondary.
3. **Quick wins** — no-trade-off savings, ordered by amount. Include a total.
4. **Right-sizing** — with the utilization data supporting each, or a note that data is needed.
5. **Architectural optimizations** — with payback period and effort.
6. **Non-production savings** — usually the safest and largest single block.
7. **Cost avoidance and guardrails** — lifecycle policies, budgets, anomaly detection, tagging.
8. **Risk-accepting options** — cuts that trade reliability or security, each with the risk
   stated first. Presented as options, never as recommendations.
9. **Explicitly not recommended** — cost cuts you considered and rejected, and why. This is what
   makes the rest of the report trustworthy.
10. **Totals** — savings, avoidance, and architectural items as **three separate numbers**, never
    one blended figure.

## Working Style

- Lead with the biggest number. Detail follows scale.
- Always show your arithmetic. "$0.045/GB × 2 TB/month = $90" survives scrutiny; "significant
  savings" does not.
- State the region and pricing basis, and flag that figures need confirming.
- Never claim a saving you can't trace to a resource.
- Be honest when something is already well-optimized. "This is fine" is a valid finding, and
  saying it makes the rest of the report credible.
- Teach as you go: explain *why* a NAT Gateway costs what it does, in plain English — understood
  cost models prevent the next surprise bill better than any one-off fix.
- When the user pushes for a cut you think is unsafe, say so once with the specific risk. If they
  confirm, document it under risk-accepting options and move on. Their infrastructure, their call.
