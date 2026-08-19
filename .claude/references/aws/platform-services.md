# AWS Platform Services — ECR, CloudWatch, CloudTrail, Secrets Manager, Parameter Store, KMS, AWS Backup

The supporting services every architecture needs. **These are also where quiet costs and quiet
gaps accumulate.**

---

## ECR (Elastic Container Registry)

**What it is:** managed Docker registry, integrated with IAM.

**Architecture**
- One repository per image, named for the service
- Authenticate: `aws ecr get-login-password | docker login --username AWS --password-stdin
  <account>.dkr.ecr.<region>.amazonaws.com`. **Tokens expire after 12 hours**
- Pulling from a **private subnet** needs a NAT route, or three VPC endpoints: `ecr.api`,
  `ecr.dkr`, **and the S3 gateway endpoint** (image layers live in S3). Missing the S3 endpoint is
  a very common "why can't my task pull" cause

**Must-configure**
| Setting | Why |
|---|---|
| **Lifecycle policy** | Without one, every CI build's image stays forever. 20 images/day at 500 MB ≈ 3 TB/year |
| **Scan on push** | Free basic vulnerability scanning |
| **Tag immutability** | A tag cannot be repointed under a running deployment |

**Security:** repository policy for cross-account pulls · IAM scoped to specific repositories ·
`ecr:GetAuthorizationToken` is account-level and cannot be resource-scoped — put it in its own
statement.

**Common mistakes:** no lifecycle policy · pushing `:latest` · missing VPC endpoints in private
subnets · granting `ecr:*` on `*`.

---

## CloudWatch

**What it is:** metrics, logs, alarms, and dashboards.

### Logs
- **Retention defaults to never expire.** This is the slow-growing bill nobody notices for a year.
  **Set retention on every log group** — 30 days for application logs, 90 for access logs, longer
  only where required
- Ingestion ~$0.50/GB plus storage. Archive to S3 with Glacier lifecycle for long retention at a
  fraction of the price
- **Logs Insights** makes structured (JSON) logs queryable by field — the single highest-leverage
  logging change most projects can make
- **Metric filters** turn log patterns into metrics you can alarm on, without code changes
- Container log delivery: `awslogs` driver (ECS) or Fluent Bit (EKS/Fargate)

### Metrics and alarms
- Standard resolution 1 minute; high resolution costs more
- **Custom metrics ~$0.30 each per month** — they add up quickly at scale
- Alarms need `TreatMissingData` set deliberately: for an alarm on error *count*, missing data
  usually means no traffic, not health
- Use evaluation periods (`3 consecutive periods`) to stop flapping
- **Composite alarms** suppress downstream noise — if the database is down you do not need eleven
  alerts about services that depend on it
- **Container Insights** gives per-task/per-pod detail and is **not free** — say so and let the
  user decide

**Common mistakes:** no retention set · alarming on causes (CPU) instead of symptoms (error rate)
· alarms in `INSUFFICIENT_DATA` treated as healthy · dashboards nobody opens · unstructured logs
that cannot be queried.

---

## CloudTrail

**What it is:** an audit log of API calls — *who did what, to which resource, when, from where*.
**Audit, not monitoring.**

**Configuration**
- **Enabled in all regions** — a single-region trail misses activity elsewhere
- **Log file validation on** — detects tampering
- Delivered to an S3 bucket **the audited account cannot delete from**. Ideally a separate logging
  account
- Management events are free for the first trail; data events (S3 object-level, Lambda invocations)
  cost extra and are high volume — enable selectively

**Alarm on high-signal events:** root account usage · IAM policy changes · security group changes ·
**CloudTrail being disabled** · failed console logins · new access key creation.

**This is the record you will want after an incident.** Set it up before you need it — it cannot
retroactively record what already happened.

---

## Secrets Manager vs Parameter Store

**Always compare these two directly.** They overlap, and the cheaper one is often sufficient.

| | **Secrets Manager** | **SSM Parameter Store** |
|---|---|---|
| Cost | ~$0.40/secret/month + API calls | **Standard tier free**; Advanced ~$0.05/param |
| Rotation | Built-in, with Lambda rotation functions | None built in |
| Size limit | 64 KB | 4 KB standard, 8 KB advanced |
| Cross-account | Resource policies | Limited |
| Versioning | Yes | Yes |
| Best for | Database credentials needing rotation | Config values, API keys, anything not rotating |

**Recommend Parameter Store Standard unless rotation or a specific feature justifies the cost.**
For a project with 20 secrets, that is ~$8/month versus free.

**Rules for both**
- Terraform creates the **container**; the **value** is set out of band. Terraform state stores
  attributes in plaintext, which is why values must not flow through it
- Workloads read **at runtime by ARN** — never baked into images or environment at build time
- **For RDS, use `manage_master_user_password = true`** so AWS creates and rotates the password in
  Secrets Manager and it never enters Terraform state
- IAM scoped to specific secret ARNs
- **A deleted Secrets Manager secret enters a recovery window (7–30 days) during which the same
  name cannot be recreated** — surprising during a rebuild

---

## KMS

**What it is:** managed encryption keys. Nearly every "encrypted at rest" checkbox uses KMS
underneath.

**Key types**
| Type | Cost | Use |
|---|---|---|
| **AWS-managed** (`aws/s3`, `aws/rds`) | Free | The default. Fine for most cases |
| **Customer-managed (CMK)** | ~$1/month + API calls | When you need key policy control, audit of key use, cross-account sharing, or independent rotation |

**Decide deliberately and say which you chose and why.** AWS-managed keys are free and sufficient
for most projects; CMKs matter when you need to control *who* can decrypt independently of who can
read the resource.

**Notes**
- **Key policies control both *use* and *administration*** — review both. A key policy that locks
  out all administrators makes the key permanently unusable
- Enable rotation on CMKs
- **`kms:Decrypt` is needed in addition to the resource permission.** Read access to an encrypted
  S3 object requires both `s3:GetObject` **and** `kms:Decrypt` — a very common cause of confusing
  AccessDenied errors
- Encryption context adds a condition that must match on decrypt
- API call costs are small but non-zero at very high volume

---

## AWS Backup

**What it is:** centralized backup policy across RDS, EBS, EFS, DynamoDB, S3, and more.

**Use when:** you need one backup policy spanning several services · cross-account or cross-region
backup copies · compliance requiring a demonstrable retention policy · **Vault Lock** for
immutable, undeletable backups.

**Do not use when:** a single RDS instance with automated backups covers everything — per-service
backups are simpler and already there. AWS Backup adds a management layer that earns its place at
scale.

**The controls that matter**
- **Backup Vault Lock** makes backups immutable — they cannot be deleted even by an account
  administrator. **This is the ransomware control.** The question to ask of any backup strategy:
  *could an attacker with admin credentials delete the backups too?*
- Cross-account copies put recovery points outside the blast radius of a compromised account
- Lifecycle rules move older recovery points to cold storage

**Regardless of tooling:**
- Frequency meets the stated **RPO**
- Retention defined deliberately, never trimmed to save money
- Backups encrypted
- **A restore has actually been tested**, with a date. An untested backup is a hypothesis
- Verify backups still ran after any infrastructure change

---

## The Quiet Cost Line Items

These accumulate silently. Check them in every cost review.

| Item | The trap |
|---|---|
| CloudWatch Logs | Default retention is **never expire** |
| CloudWatch custom metrics | ~$0.30 each per month, adds up |
| Container Insights | Not free |
| ECR | No lifecycle policy → images forever |
| EBS snapshots / AMIs | Never expire on their own |
| Secrets Manager | ~$0.40 each; forgotten secrets keep billing |
| Unattached Elastic IPs | Billed when idle |
| CloudTrail data events | High volume, easy to over-enable |
