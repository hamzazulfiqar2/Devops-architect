# References

**Technical knowledge the agent consults on demand.**

References are **not** skills, rules, workflows, or templates. They hold the factual knowledge
needed to reason about architecture and implementation decisions.

| Layer | Answers | Location |
|---|---|---|
| **Skills** | *How* to perform work | `.claude/skills/` |
| **References** | *What is true* about a technology | `.claude/references/` |
| **Rules** | *What must never happen* | `.claude/rules/` |
| **Workflows** | *In what order* | `.claude/workflows/` |
| **Templates** | *What the output looks like* | `.claude/templates/` |
| **Agents** | *Who* does specialized work | `.claude/agents/` |

---

## How To Use References

**Consult on demand. Do not load everything.**

1. Identify the decision you are making.
2. Open **only** the reference file covering it.
3. Read the relevant section, not the whole file.

Loading the entire references tree wastes context and buries the decision you were making. A
reference is a lookup, not required reading.

**When to consult:**
- Choosing between services → the relevant service reference
- Checking a limit, default, or cost driver → the service reference
- Recalling a failure mode or common mistake → the service reference
- Explaining a concept to the user → the reference, then teach in plain English

**When not to consult:** anything already established in the conversation, or a decision the rules
already settle. Rules override references.

---

## Tree

```
references/
├── README.md                        ← you are here
│
├── aws/
│   ├── README.md                    index + service selection matrix
│   ├── accounts-and-environments.md account strategy, environment isolation
│   ├── networking.md                VPC, subnets, routing, IGW, NAT, SG, NACL, endpoints
│   ├── iam-and-identity.md          IAM, roles, policies, STS, GitHub OIDC
│   ├── compute.md                   EC2, ECS, EKS, Lambda, Auto Scaling
│   ├── edge-and-dns.md              ALB, NLB, API Gateway, Route 53, CloudFront, ACM
│   ├── data-stores.md               RDS, DynamoDB, ElastiCache, S3, EBS, EFS
│   ├── messaging.md                 SQS, SNS, EventBridge
│   └── platform-services.md         ECR, CloudWatch, CloudTrail, Secrets Manager, SSM, KMS, Backup
│
├── kubernetes/
│   ├── README.md                    index + "is Kubernetes warranted?"
│   ├── cluster-and-workloads.md     cluster architecture, Pod, Deployment, StatefulSet, DaemonSet, Job, CronJob
│   ├── networking.md                Service types, Ingress, DNS, NetworkPolicy
│   ├── configuration-and-storage.md ConfigMap, Secret, Namespace, labels, PV/PVC/StorageClass
│   ├── reliability.md               probes, requests/limits, HPA, PDB, rollouts
│   ├── security.md                  RBAC, ServiceAccounts, SecurityContext, Pod Security
│   └── production-architecture.md   what a production cluster actually needs
│
├── docker/
│   ├── README.md                    index + the image lifecycle
│   ├── images-and-layers.md         images, containers, layers, build cache
│   ├── dockerfile.md                instructions, multi-stage, env vars, base images
│   ├── registry-and-tagging.md      build, tag, push, pull, registries, ECR, tagging strategy
│   ├── runtime-and-compose.md       volumes, networks, ports, healthchecks, Compose
│   └── security-and-production.md   non-root, scanning, secrets, production checklist
│
└── terraform/
    ├── README.md                    index + the core mental model
    ├── language.md                  providers, resources, data sources, variables, outputs, locals
    ├── state.md                     state, remote state, locking, workspaces, state security
    ├── modules.md                   module design and composition
    ├── commands-and-workflow.md     init, validate, fmt, plan, apply, destroy, dependencies
    ├── meta-arguments.md            count, for_each, lifecycle, depends_on, dynamic
    └── production-practices.md      import, drift, production and security practices
```

---

## Conventions In These Files

- **"Use when" / "Do not use when"** — the decision, stated as a boundary rather than a feature list
- **Common mistakes** — the failure people actually hit, not theoretical risk
- **Cost notes** — fixed floors called out separately from usage-based cost
- Prices are **indicative, in a common region, at list pricing**. Always confirm against the AWS
  pricing page before quoting a figure to the user
- Limits and defaults change. Treat anything version-sensitive as a prompt to verify, not a fact
  to assert
