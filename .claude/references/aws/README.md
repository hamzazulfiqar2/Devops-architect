# AWS References — Index

Consult the file covering the decision you are making. Do not read all of them.

| File | Covers |
|---|---|
| `accounts-and-environments.md` | Account strategy, Organizations, environment isolation, regions |
| `networking.md` | VPC, subnets, route tables, IGW, NAT, security groups, NACLs, VPC endpoints |
| `iam-and-identity.md` | IAM users/roles/policies, STS, instance profiles, IRSA, GitHub OIDC |
| `compute.md` | EC2, ECS, EKS, Lambda, Auto Scaling — including the four-way comparison |
| `edge-and-dns.md` | ALB, NLB, API Gateway, Route 53, CloudFront, ACM |
| `data-stores.md` | RDS, DynamoDB, ElastiCache, S3, EBS, EFS |
| `messaging.md` | SQS, SNS, EventBridge |
| `platform-services.md` | ECR, CloudWatch, CloudTrail, Secrets Manager, Parameter Store, KMS, AWS Backup |

---

## Service Selection — Quick Matrix

Start here, then read the detail in the linked file.

| Need | Default choice | Consider instead when |
|---|---|---|
| Run a container | **ECS Fargate** | Lambda (spiky/short) · EC2 (control/GPU) · EKS (many services, k8s expertise) |
| Run event-driven code | **Lambda** | Fargate if >15 min, long connections, or steady high load |
| Relational database | **RDS PostgreSQL** | Aurora at RDS limits · Aurora Serverless v2 if genuinely intermittent |
| Key-value at scale | **DynamoDB** | RDS if you need joins or ad-hoc queries |
| Cache | **ElastiCache Redis** | Application memory if single instance and small |
| Object storage | **S3** | EFS only if POSIX shared filesystem is required |
| Public HTTP entry | **ALB** | API Gateway (auth/throttling) · CloudFront (caching/global) · Function URL (simplest) |
| Static site | **S3 + CloudFront** | — |
| Container images | **ECR** | — |
| Secrets | **SSM Parameter Store** (free) | Secrets Manager when rotation is needed |
| Work queue | **SQS** | SNS (fan-out) · EventBridge (routing rules, schedules) |
| Scheduled job | **EventBridge Scheduler** | ECS scheduled task if it needs a full container |
| Logs and metrics | **CloudWatch** | Managed Grafana/OTel at larger scale |
| DNS | **Route 53** | — |
| Backups | **Automated service backups** | AWS Backup when policy must span many services |

---

## The Fixed Monthly Cost Floor

**These bill whether or not anyone uses the system.** State them first in any cost estimate — this
is how learning projects generate surprise bills.

| Resource | Indicative cost | Note |
|---|---|---|
| NAT Gateway | ~$32/mo **each** + ~$0.045/GB | One per AZ for HA = ~$97/mo for three |
| Application Load Balancer | ~$16–22/mo + LCUs | Per ALB |
| EKS control plane | ~$73/mo | Per cluster, before any node |
| RDS (provisioned) | Per instance-hour, always on | Multi-AZ roughly doubles it |
| Elastic IP (unattached) | ~$3.60/mo | Billed when idle |
| Secrets Manager | ~$0.40/secret/mo | Parameter Store Standard is free |
| NLB | ~$16/mo + LCUs | |
| Global Accelerator | ~$18/mo | Rarely needed |

**Zero fixed cost at idle:** Lambda · Fargate (per-task billing) · S3 · DynamoDB on-demand · SQS ·
SNS · EventBridge · CloudWatch (usage-based) · ECR (storage only).

Prices are indicative and region-dependent. **Confirm against the AWS pricing page before quoting.**

---

## Cross-Cutting Rules

These apply to every service and are enforced by `.claude/rules/`:

- Private by default; public placement is the exception that needs justifying
- Encryption at rest and in transit on everything holding real data
- IAM roles, never long-lived access keys
- Tag everything: `Project`, `Environment`, `ManagedBy`, `Owner`
- Set retention on every log group — the default is never expire
- Budget alarm and cost anomaly detection in every account
- Deletion protection and `prevent_destroy` on every data store
