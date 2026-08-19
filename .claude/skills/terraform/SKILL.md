---
name: terraform
description: Infrastructure as Code with Terraform for AWS. Converts an approved architecture into clean, reviewable Terraform — providers, resources, data sources, variables, locals, outputs, modules, workspaces, tfvars, lifecycle rules, dependencies, and import. Covers state, remote state, locking, and drift detection. Writes and reviews Terraform for VPC, subnets, route tables, IGW, NAT, security groups, IAM, EC2, ECS, ECR, RDS, S3, ALB, CloudFront, Route 53, CloudWatch, and Secrets Manager. Reads terraform plan output and flags every create, modify, and especially destroy or forced replacement before anything runs. Use when the user mentions Terraform, HCL, .tf files, IaC, terraform plan/apply/state, modules, or provisioning AWS infrastructure as code. Never applies or destroys without explicit per-run approval; never hardcodes secrets.
---

# Terraform

Turn an **approved** architecture into infrastructure code. Explain it. Never run it unasked.

## Prerequisite: An Approved Architecture

Terraform is the *implementation* of a decision, not the place to make one. Before writing code,
confirm you have:

- An architecture the user has **approved** (from `aws-architecture` or stated directly)
- The **region** and target AWS account(s)
- The **environments** needed (dev / staging / prod) and how they differ
- A **naming and tagging convention**, or permission to propose one
- Where **state** will live, or agreement to set that up first
- Whether existing infrastructure was created by hand and must be **imported** rather than
  recreated

If the architecture is unsettled, stop and route back to `aws-architecture`. Writing Terraform
against an undecided design produces code that gets thrown away — and sometimes resources that
have to be destroyed, which is exactly the operation to avoid.

## Safety Rules — Non-Negotiable

1. **Never run `terraform apply` automatically.** Not after a clean plan, not because the change
   looks small. Present the plan, wait for an explicit yes for *that* apply.
2. **Never run `terraform destroy` automatically.** Ever. Treat it as a command the user types
   themselves after you have shown exactly what disappears.
3. **Never delete infrastructure without explicit approval**, including deletes that arrive
   disguised as updates — a `forces replacement` line is a delete.
4. **Always review potentially destructive changes** before asking for approval, not after.
5. **Never hardcode secrets** in `.tf` or `.tfvars` files. Not passwords, not API keys, not
   connection strings, not tokens.
6. **Prefer AWS Secrets Manager or SSM Parameter Store**, referenced at runtime by the workload,
   over any value that passes through Terraform.
7. **Never run mutating state commands unasked** — `state rm`, `state mv`, `taint`,
   `force-unlock`, `import` into live state, or hand-editing a state file. These can orphan or
   destroy real resources.
8. **Confirm the target** before any command: which account, which region, which workspace,
   which state backend. Applying to the wrong account is the catastrophic Terraform mistake.

Safe to run freely: `fmt`, `validate`, `init`, `plan`, `show`, `state list`, `output`,
`providers`, `version`, `graph`.

## Before Any Infrastructure Change — Required Briefing

Present this **before** asking for approval, every time:

- **What will change** — counts up front: `N to add, N to change, N to destroy`, then the
  resources by name.
- **Why it will change** — which requirement or code edit drove it. If a resource is changing
  and you cannot say why, that is drift or an accident; investigate before proceeding.
- **Potential risks** — downtime, data loss, IP or endpoint changes, dependent resources
  affected, how long it takes, whether it is reversible.
- **Created / modified / destroyed**, explicitly separated. Never bury a destroy in a list.

Then stop and ask.

## Reading a `terraform plan` — The Critical Skill

Teach the user to read plans; do not just summarize them.

| Symbol | Meaning | Concern |
|---|---|---|
| `+` | create | Usually safe. Check cost. |
| `~` | update in place | Usually safe. Read which attribute. |
| `-/+` | **destroy then create** | **Downtime and possible data loss** |
| `+/-` | create then destroy (`create_before_destroy`) | Safer replacement, but brief duplication and cost |
| `-` | destroy | **Stop. Confirm this is intended.** |
| `<=` | data source read | Informational |

**The line that matters most is `# forces replacement`.** It marks an attribute that cannot be
changed in place, so Terraform will delete and recreate the resource. On an RDS instance,
`aws_db_instance.main` being replaced destroys the database. Always search plan output for
`forces replacement`, `must be replaced`, and `will be destroyed`, and surface those first,
before anything else in your summary.

Other plan-reading habits to pass on:
- `(known after apply)` means the value doesn't exist yet — normal, but it can hide the true
  scope of downstream changes.
- A plan that shows changes when you changed nothing is **drift** — someone edited the console,
  or a provider default shifted.
- Always `plan -out=tfplan` and apply that exact file, so what you approved is what runs.
- Diff review discipline: read every `-` and `-/+` line individually. Skimming plans is how
  databases die.

## Project Structure

Start simple; add structure when repetition earns it.

**Small project — one environment, few resources:**
```
terraform/
  main.tf          # resources
  variables.tf     # inputs
  outputs.tf       # exports
  providers.tf     # provider + required_versions
  backend.tf       # remote state config
  terraform.tfvars # non-secret values (gitignored if sensitive)
```

**Multi-environment — the common shape:**
```
terraform/
  modules/
    networking/    # vpc, subnets, routing, nat
    compute/       # ecs service, task def, autoscaling
    database/      # rds, subnet group, parameter group
    security/      # security groups, iam roles
  environments/
    dev/
      main.tf        # calls modules with dev inputs
      backend.tf     # dev state key
      terraform.tfvars
    staging/
    prod/
```

Separate state per environment. This is the important part: a mistake in dev must be
structurally incapable of touching prod. Directory-per-environment does this more safely than
workspaces because the backend key and provider config are explicit and visible.

**Never** put all environments in one state file.

## Core Concepts — Teach While You Build

Explain each in one plain sentence the first time it appears.

- **Provider** — the plugin that talks to a cloud API. Pin its version; provider upgrades change
  behavior. `required_version` for Terraform itself, `required_providers` with `~>` constraints.
- **Resource** — something Terraform creates and owns.
- **Data source** — something that already exists, read-only. Use for AMIs, existing VPCs,
  account ID (`aws_caller_identity`), region, and AZs (`aws_availability_zones`).
- **Variable** — an input. Always give `type` and `description`; give `default` only when a
  sensible one exists. Use `validation` blocks to catch bad input at plan time. Mark
  credentials-adjacent inputs `sensitive = true`.
- **Local** — a named expression, computed once. Ideal for naming prefixes and merged tag maps.
- **Output** — a value exported for humans or other configurations. Mark sensitive outputs.
- **State** — Terraform's record of what it created and the real-world IDs. **It is the source of
  truth; lose it and Terraform no longer knows it owns anything.** State also contains resource
  attributes in plaintext, including database passwords — which is why secrets must not flow
  through Terraform.
- **Remote state** — state stored in S3 (versioned, encrypted, access-controlled) rather than on
  a laptop. Non-negotiable for anything a second person or a pipeline touches.
- **State locking** — prevents two applies at once from corrupting state. S3 native locking
  (`use_lockfile = true`) on modern provider versions, or a DynamoDB lock table on older setups.
- **Workspaces** — multiple states from one configuration. Fine for ephemeral or per-developer
  environments; **prefer directory separation for dev/staging/prod**, because workspaces share
  provider config and make it too easy to apply to the wrong one.
- **tfvars** — variable values per environment. `terraform.tfvars` auto-loads; `-var-file` is
  explicit. Keep secrets out; gitignore anything that might hold them.

## Dependency Management

Terraform infers dependencies from references — `subnet_id = aws_subnet.public.id` creates an
edge automatically. Prefer implicit dependencies; they're self-documenting.

Use `depends_on` only for dependencies Terraform cannot see (IAM policy propagation before a
service starts, a NAT gateway that must exist before instances need egress). Overusing it
serializes the graph and slows applies.

Validate the graph: `terraform graph`, and read plan ordering. Watch for cycles — usually caused
by two security groups referencing each other, which is solved with standalone
`aws_security_group_rule` / `aws_vpc_security_group_ingress_rule` resources rather than inline
blocks.

## Lifecycle Rules

- `create_before_destroy = true` — build the replacement before removing the old one. Essential
  for anything serving traffic. Watch for name collisions during the overlap.
- `prevent_destroy = true` — a hard stop on deletion. **Apply this to every RDS instance, S3
  bucket holding real data, and anything else where deletion is unacceptable.** Recommend it
  proactively; it is the cheapest insurance in Terraform.
- `ignore_changes` — for attributes changed outside Terraform on purpose (a desired count managed
  by autoscaling, a task definition revision managed by CI). Use narrowly; broad
  `ignore_changes` hides real drift.
- `replace_triggered_by` — force replacement when a related resource changes.

## Secrets Handling

**The rule: secrets never live in `.tf`, `.tfvars`, or state you can avoid.**

- Create the *container* in Terraform (`aws_secretsmanager_secret`), set the *value* outside it —
  console, CLI, or a rotation function.
- Have the workload read the secret at **runtime** by ARN. Terraform grants the IAM permission;
  it never handles the value.
- For RDS passwords, prefer `manage_master_user_password = true` so AWS manages and rotates the
  password in Secrets Manager and it never enters state. If a password must be generated,
  `random_password` still lands in state — say so plainly.
- SSM Parameter Store `SecureString` is the cheaper option when rotation isn't needed; Secrets
  Manager is ~$0.40/secret/month.
- Never commit `.tfstate`, `.tfvars` with secrets, or `.terraform/`. Verify `.gitignore` covers
  `*.tfstate*`, `.terraform/`, `*.tfvars` (with an exception for example files), and `crash.log`.
- If you find a secret already committed, say so immediately and treat it as compromised —
  it must be rotated, not just deleted.

## Module Design

Write a module when the same shape is used **more than twice**, or when a boundary genuinely
clarifies the code. Premature modules are harder to read than duplicated resources.

Good module practice: one clear purpose · inputs typed, described, and validated · no hardcoded
account IDs, regions, or names · outputs for everything callers need · no provider blocks inside
the module (callers configure providers) · version-pinned when sourced remotely · a README with
inputs, outputs, and an example.

Consider well-maintained community modules (`terraform-aws-modules/vpc/aws`) for undifferentiated
infrastructure like VPCs — say when they save real work, and note the trade-off: less code to
own, more abstraction to learn, and a version upgrade path to track.

## AWS Resource Guidance

Cover these with the gotchas that actually bite:

**VPC / subnets / routing** — CIDR sized with room to grow; public and private subnets across at
least two AZs; explicit route tables and associations; `map_public_ip_on_launch` deliberately set.
**IGW** for public egress; **NAT Gateway** for private egress — one per AZ for resilience, one
total to save money, and flag the fixed cost either way. Consider VPC endpoints (S3, ECR, Secrets
Manager, CloudWatch Logs) as both a cost and a security improvement.

**Security groups** — prefer standalone rule resources over inline blocks (inline rules fight
with anything managed elsewhere). Reference other security groups rather than CIDR blocks where
possible. Justify every `0.0.0.0/0` in a comment. Never leave 22 or 3306 open to the world.

**IAM** — roles for workloads, never users with static keys. Build policies with
`aws_iam_policy_document` data sources rather than heredoc JSON, so they're readable and
composable. Scope resources narrowly; `Resource = "*"` needs a written reason. Use OIDC trust
for CI rather than long-lived credentials.

**EC2** — AMI from a data source, never a hardcoded ID (AMI IDs are region-specific and rotate).
User data changes replace instances. Encrypted EBS. IMDSv2 required.

**ECS** — cluster, task definition, service, autoscaling target and policy, task execution role
vs task role (distinguish them: execution role pulls images and writes logs; task role is what
your code uses). Use `ignore_changes` on task definition revision if CI deploys images.

**ECR** — lifecycle policy so untagged images stop accumulating, scan on push, immutable tags.

**RDS** — `prevent_destroy`, Multi-AZ decision stated with its cost, subnet group in private
subnets, `storage_encrypted = true`, backup retention set explicitly, `deletion_protection`,
`skip_final_snapshot = false` for anything real, `manage_master_user_password`, and a parameter
group if defaults don't fit. **Many RDS attribute changes force replacement — always check.**

**S3** — separate resources for versioning, encryption, public access block, lifecycle, and
policy (they're no longer inline). Block public access unless serving a public site, and then
serve through CloudFront with OAC instead. `prevent_destroy` for data buckets. Note that a
non-empty bucket won't delete without `force_destroy`, which is itself a data-loss risk.

**ALB** — target groups with health checks tuned to the app, HTTPS listener with an ACM
certificate, HTTP→HTTPS redirect, deletion protection in prod, access logs to S3.

**CloudFront** — origin access control for S3, cache behaviors and TTLs, ACM certificate in
`us-east-1` (a constant source of confusion — say it), and be aware distribution changes take
time to deploy.

**Route 53** — hosted zone, records, and ACM DNS validation wired together. Note that creating a
zone gives new nameservers that must be set at the registrar.

**CloudWatch** — log groups created explicitly **with a retention period** (the default is never
expire, a slow-growing bill), metric alarms tied to real failure modes, and SNS topics for
notification.

**Secrets Manager** — secret container in code, value out of band, IAM read grant to the
workload, and a note that recovery windows delay recreating a secret with the same name.

## Reviewing Terraform

Report findings ranked by severity, with file, line, impact, and fix.

| Category | Look for |
|---|---|
| **Secrets** | Literals in `.tf`/`.tfvars`, committed state, secrets in outputs without `sensitive` |
| **Destructive risk** | Missing `prevent_destroy` on data stores, `skip_final_snapshot = true`, `force_destroy` on real buckets |
| **State** | Local backend, no locking, no versioning on the state bucket, shared state across environments |
| **Security** | `0.0.0.0/0` ingress, `Resource = "*"`, unencrypted storage, public S3, IAM users with keys, no MFA/deletion protection |
| **Reproducibility** | Unpinned provider or module versions, hardcoded AMI IDs, hardcoded account IDs or ARNs |
| **Correctness** | Missing dependencies, cycles, resources in the wrong subnet, mismatched AZ counts |
| **Unnecessary resources** | Anything not traceable to an approved architecture requirement, orphaned resources, duplicate security groups, over-provisioned sizes |
| **Maintainability** | Copy-paste instead of `for_each`, `count` where `for_each` avoids index churn, no tags, no naming convention, magic numbers |
| **Operational complexity** | Module depth, manual steps between applies, cross-stack coupling via remote state, apply duration |

For **unnecessary resources**, trace each resource back to a requirement. If it maps to none,
flag it — resources cost money and expand the attack surface.

For **operational complexity**, give a plain assessment: how many things must be understood to
change this safely, how long an apply takes, what has to happen in order, and what a new person
would trip over.

## Import and Drift

**Import** brings existing resources under Terraform management. Modern flow: write an `import`
block, run `plan` to generate and check the configuration, iterate until the plan is empty. An
import that produces a non-empty plan means your code doesn't match reality — **fix the code,
never apply to make reality match a wrong config.**

**Drift** is reality diverging from state, usually from console edits. Detect with
`terraform plan -refresh-only` or a scheduled plan in CI. When drift appears: identify what
changed and who changed it before deciding whether to codify it or revert it. Never blindly
apply drift away — someone may have fixed an outage by hand.

## Standard Workflow

```bash
terraform fmt -recursive
terraform validate
terraform init
terraform plan -out=tfplan
```

Then: **read the plan, brief the user, stop.** After explicit approval:

```bash
terraform apply tfplan
```

Add IaC scanning (`tfsec`, `checkov`, or `trivy config`) and, where useful, cost estimation
(`infracost`) before the approval gate.

After apply: verify outputs, confirm resources behave as expected, and report what actually
happened — including anything that differed from the plan.

## Working Style

- Explain code as you write it: **what this block creates → why the architecture needs it →
  what breaks without it.**
- Comment non-obvious HCL, especially anything security-relevant or any deliberate exception.
- Tag everything consistently — `Environment`, `Project`, `ManagedBy = "terraform"`, `Owner` —
  via a merged local so it's set in one place.
- Prefer explicit over clever. Terraform is read far more often than it is written.
- Surface cost when adding resources with a fixed monthly floor.
- When the user proposes something risky, say so once with the reason; if they confirm, do it
  their way and note the risk.
- **Deliver code and a plan. Let the user run the apply.**
