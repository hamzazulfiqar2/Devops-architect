# Terraform — Import, Drift, and Production Practices

---

## Import — Bringing Existing Resources Under Management

**What it does:** associates an existing real resource with a Terraform address, so Terraform
manages it going forward. **It creates nothing and changes nothing in the cloud.**

**Modern flow (Terraform 1.5+):** declare the intent in code, let Terraform generate or verify the
configuration.

```hcl
import {
  to = aws_s3_bucket.uploads
  id = "<existing-bucket-name>"
}
```

```bash
terraform plan -generate-config-out=generated.tf   # generate a starting configuration
terraform plan                                     # iterate until the plan is EMPTY
terraform apply                                    # records the import in state
```

**The rule that matters:**

> **An import that produces a non-empty plan means your code does not match reality. Fix the code
> — never apply to make reality match a wrong configuration.**

Applying a mismatched import modifies or replaces a live resource you were only trying to adopt.

**Notes**
- Legacy `terraform import <address> <id>` still works but modifies state directly — it requires
  approval and offers no dry run
- Import IDs vary by resource type; check the provider documentation
- Import one resource at a time, verifying with `plan` after each
- Some attributes cannot be read back by the provider and must be set to match manually

**When to import rather than recreate:** anything holding data · anything with a stable endpoint or
IP that consumers depend on · anything expensive or slow to recreate.

---

## Drift

**Drift** is reality diverging from state — almost always because someone changed something in the
console.

**Detecting it**
```bash
terraform plan -refresh-only     # shows drift without proposing configuration changes
terraform plan                   # a plan with unexpected changes IS drift
```

Run a scheduled `plan` in CI to catch drift early rather than discovering it mid-deploy.

**Responding to it — in this order:**

1. **Identify what changed and who changed it.** CloudTrail answers this
2. **Decide deliberately:**
   - The change was correct → **codify it** in Terraform so the next apply preserves it
   - The change was wrong → let Terraform revert it, having confirmed nothing depends on it
3. **Never blindly apply drift away.** Someone may have fixed an outage by hand, and the next apply
   would silently undo the fix and cause a second incident

**The rule from incident response:** manual changes made during an incident must be **reconciled
back into code**, or the next apply reverts them.

---

## Production Practices

| Practice | Detail |
|---|---|
| **All production infrastructure in code** | Nothing critical created by hand. The test: *could this environment be rebuilt from the repository if the account were lost?* |
| **Remote state, locking, versioning, restricted access** | Non-negotiable |
| **Separate state per environment** | A dev mistake must be structurally unable to touch prod |
| **`prevent_destroy` on every data store** | The cheapest insurance available |
| **Version-pin providers and modules** | An unpinned provider is an unannounced change |
| **Commit `.terraform.lock.hcl`** | Reproducible provider versions across machines and CI |
| **`plan -out=tfplan`, review, apply that file** | What was approved is what runs |
| **Tag everything via `default_tags`** | `Project`, `Environment`, `ManagedBy`, `Owner` |
| **`for_each` over `count`** | Index shifts destroy and recreate |
| **IaC scanning in CI** | tfsec / checkov / trivy config on every PR touching infrastructure |
| **Cost estimation in CI** | infracost, before the resources exist |
| **A second person could apply this safely** | If only one person can run it, it is not repeatable |

**Structure, naming, and tagging conventions:** see `project-structure.md`.

---

## Security Practices

### Secrets

> **State stores attributes in plaintext.** This is *why* secrets must not flow through Terraform.

| Do | Don't |
|---|---|
| Create the secret **container** (`aws_secretsmanager_secret`) | Put a value in a variable or `.tfvars` |
| Set the **value** out of band — console, CLI, rotation function | Write `aws_secretsmanager_secret_version` with a real value |
| Have the workload read it **at runtime by ARN** | Output a secret value |
| Use `manage_master_user_password = true` for RDS | Use `random_password` if avoidable — it lands in state |
| Mark sensitive outputs `sensitive = true` | Pass secrets on a command line |

**If a secret is found committed, it is compromised** — rotate it. Deleting the file does not undo
git history.

### `.gitignore`

```gitignore
*.tfstate
*.tfstate.*
*.tfstate.backup
.terraform/
crash.log
crash.*.log
*.tfplan
tfplan
override.tf
*_override.tf

*.tfvars
*.tfvars.json
!*.tfvars.example
```

> Note: **do** commit `.terraform.lock.hcl` — it is not a secret, and it is what makes provider
> versions reproducible.

### IAM in Terraform

- Build policies with `aws_iam_policy_document` data sources, not heredoc JSON — readable,
  composable, validated at plan time
- Scope resources to specific ARNs. `Resource = "*"` needs a written justification **in the code**
- One role per workload; never share
- Use OIDC trust for CI, scoped to repository **and** branch or environment
- Actions that genuinely cannot be resource-scoped (`ecr:GetAuthorizationToken`) go in their own
  statement rather than widening everything

### Networking in Terraform

- **Standalone security group rule resources**, not inline `ingress`/`egress` blocks — inline rules
  silently conflict with anything managed elsewhere and create dependency cycles
- Reference other security groups rather than CIDR blocks
- Every `0.0.0.0/0` carries a comment explaining why
- Define egress explicitly rather than relying on allow-all

### Data protection

```hcl
resource "aws_db_instance" "main" {
  storage_encrypted             = true
  deletion_protection           = true
  skip_final_snapshot           = false
  backup_retention_period       = <days matching RPO>
  manage_master_user_password   = true

  lifecycle { prevent_destroy = true }
}
```

---

## Review Checklist

| Category | Check |
|---|---|
| **Secrets** | No literals in `.tf`/`.tfvars`; no committed state; sensitive outputs marked |
| **Destructive risk** | `prevent_destroy` on data stores; `skip_final_snapshot = false`; no `force_destroy` on real buckets |
| **State** | Remote, locked, versioned, encrypted, access-restricted, separated per environment |
| **Security** | No `0.0.0.0/0` without justification; no `Resource = "*"` unexplained; encryption on; no public S3 |
| **Reproducibility** | Providers and modules pinned; lock file committed; no hardcoded AMI/account/ARN |
| **Correctness** | No cycles; resources in the right subnets; AZ counts consistent |
| **Unnecessary resources** | Every resource traceable to an approved requirement |
| **Maintainability** | `for_each` not `count`; tags via `default_tags`; naming convention; no magic numbers |
| **Operational complexity** | How many concepts to change this safely; apply duration; what a newcomer trips over |

---

## Common Production Mistakes

- Local state, or one state file across all environments
- No `prevent_destroy`, discovered the day a plan proposes destroying the database
- Secrets in `.tfvars`, committed
- Unpinned providers — an upgrade silently forces resource replacement
- `count` where `for_each` belonged, so removing one item recreates several
- `terraform apply -auto-approve` in a pipeline touching production
- Applying a fresh plan instead of the reviewed plan file
- Inline security group rules fighting with rules managed elsewhere
- Blindly applying drift away, reverting an incident fix
- Importing until the plan is *small* rather than *empty*
- No IaC scanning, so an open security group reaches production
