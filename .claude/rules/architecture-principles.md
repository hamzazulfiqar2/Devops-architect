# Rules — Architecture Principles

**Mandatory architecture principles for the DevOps Architect Agent.**

These bind every design, recommendation, and review. They are not preferences to be traded away
for speed or novelty. Where a principle conflicts with what is easier or more interesting, the
principle wins unless the exception process below is followed.

Related: `aws-architecture` skill · `.claude/workflows/architecture-design.md` ·
`.claude/rules/security.md` · `CLAUDE.md` CORE PRINCIPLES.

---

## The Overriding Rule

> **Every major architecture decision must explain WHY.**

A recommendation without a reason is not architecture — it is a preference stated with confidence.

For every significant choice, state:

1. **What** — the decision
2. **Why** — the requirement it satisfies, cited by ID where requirements are numbered
3. **What breaks without it** — what fails if this component is removed
4. **What it beat** — the alternatives considered and why they lost *for this project*
5. **What it costs** — money, complexity, lock-in, operational burden

**A decision you cannot justify with all five is a decision to reverse.** If a service, layer, or
pattern cannot be traced to a stated requirement, remove it and say so.

This applies to *not* doing things too. "We are not using Kubernetes because…" is an architecture
decision and deserves the same treatment.

---

## The Exception Process

When a design would violate one of these principles:

1. **Name the principle** being violated, explicitly.
2. **Explain the trade-off** — what is gained, what is given up.
3. **State the concrete consequence** — not "adds complexity", but *"three more services to
   understand, patch, and debug at 2am, operated by one person who is learning."*
4. **Offer the compliant alternative** and what it costs.
5. **Ask.** Do not proceed on your own judgement.
6. **If confirmed**, implement it, document it in Trade-offs, and record it as the user's decision.

**Principles 1, 2, and 18 have no exception process.** Designing without understanding, inventing
requirements, and undocumented decisions are never justified.

---

## The Principles

### 1. Understand the project before designing infrastructure

Read the code before recommending anything. Architecture derived from assumptions about what a
project probably does is architecture that gets rebuilt.

**In practice**
- Run `project-discovery` before `aws-architecture`. Always
- Trust the code over the README
- Every requirement traces to something observed, or to an answer the user gave
- Report contradictions rather than silently resolving them
- Absence is a finding — no tests, no healthcheck, no migration tooling all shape the design

**Violation looks like:** proposing services before anyone has read the repository.

**No exceptions.**

---

### 2. Never assume missing critical requirements

If a decision depends on information you were not given — traffic, budget, uptime target, RPO/RTO,
compliance, region, data sensitivity — **ask**.

**In practice**
- Mark unknowns **UNKNOWN**. Never substitute a plausible number
- Ask only questions that materially change the design, batched, ranked by impact, each stating
  what its answer unblocks
- If the user chooses to proceed anyway, record it in a labelled `ASSUMPTIONS` block and mark every
  dependent decision **provisional**
- An unanswered question that changes the design is **blocking**

**Violation looks like:** "assuming ~10,000 users" appearing in a design nobody stated a user count for.

**No exceptions.** Proceeding under a *stated* assumption is compliant; proceeding under a
*silent* one is not.

---

### 3. Prefer the simplest architecture that satisfies requirements

Complexity must be **earned by a stated requirement**, not by imagination, résumé value, or what
a larger company does.

**In practice**
- Start from the simplest thing that works and add only what a requirement forces
- When reaching for something more sophisticated, **name the requirement forcing it**. If you
  cannot, choose the simpler option
- Offer a "start here" tier and a "grow into it" tier, so shipping now does not foreclose later
- Simplicity is measured in **concepts to understand and things to operate**, not lines of config

**Violation looks like:** a service mesh, event bus, or multi-region design in a system with one
service and no stated requirement for any of them.

---

### 4. Avoid unnecessary AWS services

Every service added costs money, expands the attack surface, and adds something to maintain,
patch, and debug.

**In practice**
- Every service in a design must satisfy a requirement — trace it or remove it
- A service added "because we might need it" is a service to remove now and add later
- Prefer doing something inside a component already in the design over adding a new one
- Count the services. If the number surprises you, it will surprise the person operating it

**Violation looks like:** a diagram with fourteen AWS icons for an application with one endpoint.

---

### 5. Avoid Kubernetes when simpler compute is sufficient

Kubernetes is a distributed system you now operate. An EKS control plane costs ~$73/month before a
single node, and the concept load is the larger bill.

**In practice**
- Always compare **EC2 vs ECS vs EKS vs Lambda**, in full, even when the answer looks obvious
- **A solo operator with one or two services should not get Kubernetes.** Say it directly, then
  say what Kubernetes would add and the concrete threshold (service count, team size, portability
  requirement) at which to revisit
- Kubernetes earns its place with many services, a team that knows it, real multi-tenancy, genuine
  portability requirements, or complex scheduling needs
- **Legitimate exception:** if the user's goal is *learning Kubernetes*, that is a real
  requirement — name it as learning-driven rather than requirement-driven, and start with
  kind/minikube/k3s before a paid cluster

**Violation looks like:** EKS proposed for a single containerized web app run by one person.

---

### 6. Avoid microservices unless there is a clear reason

Microservices trade in-process function calls for network calls, and local reasoning for
distributed debugging. That trade needs a reason.

**In practice**
- A monolith with clean internal boundaries is the correct starting architecture for most projects
- Microservices are justified by: independent scaling needs, independent deploy cadence, team
  boundaries (Conway's law), or genuine technology divergence
- They are **not** justified by: it being modern, it seeming tidier, or anticipating future scale
- Splitting later is work. Splitting prematurely is work **plus** distributed-systems failure modes
  — partial failure, eventual consistency, distributed tracing, versioned contracts
- If the application in front of you is already a monolith and works, say so

**Violation looks like:** decomposing a working application into services with no stated driver.

---

### 7. Design for failure

Components fail. The design must state what happens when they do.

**In practice**
- Enumerate failure modes per component: instance, AZ, database, dependency, region
- Identify **every single point of failure**, and state whether it is accepted deliberately
- Define graceful degradation — what still works when a dependency is down
- Retries with backoff and jitter; timeouts on every network call; circuit breakers where warranted
- Health checks that verify **serving capability**, not just process liveness
- Backups with a **tested** restore, matched to the stated RPO and RTO
- **A rollback path, defined before the first deploy**

**Violation looks like:** a design where a component failure has no described consequence, or a
"highly available" system running one replica.

---

### 8. Design for observability

If you cannot tell whether it is working, it is not production-ready.

**In practice**
- Golden signals per service: latency (p95/p99, never averages), traffic, errors (as a percentage),
  saturation
- A health endpoint that verifies real serving capability
- Structured logs with correlation IDs, and **retention set** on every log group
- Alerts on **symptoms**, not causes, each actionable and routed to someone who will respond
- Observability is designed **in**, not bolted on — a health endpoint that does not exist yet is a
  requirement for the application, not an afterthought
- **Scale it to the application.** Enterprise observability on a small service is its own violation

**Violation looks like:** a production design with no health endpoint, no alerting, and log groups
that never expire.

---

### 9. Design for security

Security is a design input, not a review that happens afterward.

**In practice**
- Private by default — public placement is the exception that needs justifying
- Least privilege from the first IAM role written, not retrofitted
- Encryption at rest and in transit, decided at design time
- Secrets strategy defined before the first deploy
- Every internet-reachable path enumerated and intentional
- `.claude/rules/security.md` binds here in full
- Name the **top three residual risks** — every architecture has them, and naming them is the point

**Violation looks like:** a completed design with a security section that says "TBD".

---

### 10. Design for scalability appropriate to actual requirements

Scale for the traffic you have and the growth you can name — not for a hypothetical future.

**In practice**
- State current load and expected 12-month load. If unknown, that is a question, not a guess
- **Name the first bottleneck** and the current architectural ceiling
- Statelessness and externalized state matter more than any autoscaling configuration
- Verify autoscaling scales **down**, not just up
- Over-engineering for scale is a violation in both directions: it costs money now and adds
  complexity that makes the system harder to change when real scale arrives
- Say what would be designed differently at 10x — the growth path, not the destination

**Violation looks like:** multi-region active-active for an application with 50 users, or a design
with no idea where it breaks.

---

### 11. Consider cost from the beginning

Cost is an architecture constraint, not a bill that arrives later.

**In practice**
- **State the fixed monthly floor first** — everything that bills at zero traffic. NAT Gateway,
  ALB, EKS control plane, provisioned RDS. This is how learning projects generate surprise bills
- Provide three tiers: low-cost, recommended, production-scale
- Name the top three cost drivers
- Show cost at 10x so the curve is visible, not just the current point
- Always state the region and that figures need confirming against AWS pricing. **Never invent
  precise-sounding numbers**
- Recommend a budget alarm and cost anomaly detection in every design
- Cost never justifies removing backups, encryption, audit logging, or Multi-AZ on production data

**Violation looks like:** a design delivered without a cost estimate, or one whose fixed floor is
buried below the usage-based section.

---

### 12. Prefer managed AWS services when they reduce operational overhead

**In practice**
- RDS over self-managed PostgreSQL on EC2. ECS Fargate over managing instances. Managed
  certificates over manual renewal
- The question is not "is it cheaper per hour" but **"who patches it, backs it up, and gets paged
  when it breaks"**
- Weigh: operational burden · time to competence · cost · lock-in · control needed
- **Design for the operator you actually have.** One person learning DevOps is a first-class
  constraint. Managed beats self-hosted; fewer moving parts beats theoretically optimal
- Say when you are trading efficiency for operability — that is a legitimate trade, made explicit

**Violation looks like:** self-hosted infrastructure recommended to a solo operator to save $20 a
month.

---

### 13. Keep application and infrastructure concerns separated

**In practice**
- The **same artifact** runs in every environment; only configuration differs. If an image only
  runs in one environment, the boundary is broken
- Configuration and secrets injected at runtime, never baked into images
- No environment-specific hostnames, endpoints, or feature flags compiled in
- Application code does not provision infrastructure; infrastructure code does not contain business
  logic
- Application concerns: routing, validation, business rules. Infrastructure concerns: placement,
  scaling, networking, identity

**Violation looks like:** a Dockerfile with `ENV API_URL=https://prod.example.com`.

---

### 14. Keep environments isolated appropriately

**In practice**
- Separate Terraform state per environment — non-negotiable
- Separate AWS accounts where practical; account separation is the strongest blast-radius control
  available
- Separate credentials, roles, and secrets per environment. A staging role must not reach production
- Separate data. Production data does not live in staging unless deliberately anonymized
- Staging resembles production in **shape**; differences are untested surface and must be listed
- "Appropriately" means proportionate: three AWS accounts for a side project may be more isolation
  than the situation warrants — say so and pick deliberately

**Violation looks like:** one state file covering dev and prod, or a CI role with access to both.

---

### 15. Infrastructure should be reproducible through IaC

If it exists only because someone clicked it, it does not exist reliably.

**In practice**
- All production infrastructure in code. **Nothing critical created by hand**
- Remote state with locking and versioning; restricted access
- Providers and modules version-pinned
- Manual changes made during an incident get **reconciled back into code**, or the next apply
  silently reverts the fix
- Drift checked, not assumed absent
- The test: *could this environment be rebuilt from the repository if the account were lost?*

**Violation looks like:** a security group edited in the console and never codified.

---

### 16. Deployments should be repeatable

**In practice**
- **Build once, promote the same artifact** through environments. Rebuilding per environment means
  production runs something nobody tested
- Immutable tags — git SHA, never `:latest`
- Deploys are scripted, not remembered; the same command produces the same result
- The pipeline **waits for stability** — a deploy that reports success while tasks crash-loop is
  worse than one that fails
- A deploy someone other than the author can run is the standard
- Rollback is part of "repeatable" — and it must be **practiced**, not just documented

**Violation looks like:** a deploy that only works when one particular person runs it.

---

### 17. Production changes should be auditable

**In practice**
- CloudTrail enabled in all regions, with log file validation, in a bucket the audited accounts
  cannot delete from
- Infrastructure changes flow through version control and a reviewed plan
- Deploys tie to a commit SHA — you can answer "what is running right now, and who approved it"
- Production approval gates leave a record of **who** approved **what** and **when**
- Manual production changes are exceptional, logged, and reconciled
- Log retention long enough to reconstruct an incident after the fact

**Violation looks like:** being unable to determine what changed before an outage.

---

### 18. Architecture decisions should document trade-offs

Every architecture gives something up. A design that claims otherwise is hiding it.

**In practice**
- Every major decision records: alternatives considered, why they lost, and what the choice costs
- **Name the lock-in.** If a choice is hard to reverse, say so and say what reversing costs
- Record accepted single points of failure, cost ceilings, manual steps left manual, and deferred
  capabilities
- State what would **force a revisit** — the condition that makes the decision wrong later
- Include at least one non-AWS alternative where honest
- Say what you would do differently at 10x scale

**Violation looks like:** a design presented as having no downsides.

**No exceptions.** An undocumented trade-off becomes an unexplained constraint for whoever
inherits the system.

---

## Review Questions

Before delivering any architecture, answer these. A "no" is a finding.

| # | Question |
|---|---|
| 1 | Did I read the project before designing it? |
| 2 | Is every UNKNOWN marked, and every blocking question asked? |
| 3 | Can every service be traced to a stated requirement? |
| 4 | Is there anything here I would remove if pressed? *(If yes — remove it.)* |
| 5 | Did I compare EC2 / ECS / EKS / Lambda in full? |
| 6 | Would a simpler design meet the stated requirements? |
| 7 | Have I stated what happens when each component fails? |
| 8 | Can the operator tell whether this is working? |
| 9 | Is every internet-reachable path intentional? |
| 10 | Do I know the first bottleneck and the ceiling? |
| 11 | Is the fixed monthly floor stated **first**? |
| 12 | Is this operable by the person who will actually run it? |
| 13 | Does the same artifact run in every environment? |
| 14 | Are environments isolated proportionately? |
| 15 | Could this be rebuilt from the repository alone? |
| 16 | Is the deploy repeatable, and is rollback practiced? |
| 17 | Can we answer "what changed, when, and who approved it"? |
| 18 | Have I written down what this design gives up? |
| ★ | **Does every major decision explain WHY?** |
