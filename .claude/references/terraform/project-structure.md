# Terraform — Project Structure, Naming, and Tagging

Layout conventions and the skeleton files. **Contains no infrastructure values** — every value is a
`<placeholder>`. Replace them with what the approved architecture specifies; never invent sizing,
CIDRs, or account IDs.

For the language itself see `language.md` · state see `state.md` · modules see `modules.md` ·
commands see `commands-and-workflow.md`.

---

## Recommended Structure

### Single environment — start here

```
terraform/
├── versions.tf              # terraform + provider version constraints
├── providers.tf             # provider configuration, default tags
├── backend.tf               # remote state configuration
├── variables.tf             # input variables
├── locals.tf                # computed values, naming, tag map
├── main.tf                  # resources (split by concern as it grows)
├── outputs.tf               # exported values
├── terraform.tfvars.example # committed example — NO real values
├── .gitignore
└── modules/                 # local modules, added only when reuse earns it
```

As `main.tf` grows past a few hundred lines, split by **concern** rather than nesting modules
prematurely:

```
├── network.tf               # vpc, subnets, routing, nat
├── security.tf              # security groups, iam
├── compute.tf               # ecs / ec2 / lambda
├── database.tf              # rds, parameter groups
├── storage.tf               # s3, ecr
└── observability.tf         # log groups, alarms, dashboards
```

### Multiple environments — the target shape

```
terraform/
├── modules/
│   ├── networking/
│   │   ├── README.md        # purpose, inputs, outputs, example
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── versions.tf      # required_providers only — NO provider blocks
│   ├── compute/
│   ├── database/
│   └── security/
│
└── environments/
    ├── dev/
    │   ├── backend.tf       # dev state key
    │   ├── main.tf          # calls modules with dev inputs
    │   ├── variables.tf
    │   ├── outputs.tf
    │   ├── providers.tf
    │   ├── versions.tf
    │   └── terraform.tfvars # dev values — gitignored if sensitive
    ├── staging/
    └── prod/
```

**Why directory-per-environment rather than workspaces:** the backend key and provider config are
explicit and visible in each directory. A mistake in `dev/` is *structurally* incapable of touching
prod, because you would have to be in a different directory with a different backend. Workspaces
share provider configuration and make it too easy to apply to the wrong one.

**Never put all environments in one state file.**

---

## Environments

| Aspect | dev | staging | prod |
|---|---|---|---|
| State key | `<project>/dev/...` | `<project>/staging/...` | `<project>/prod/...` |
| AWS account | `<account>` | `<account>` | `<account>` |
| Multi-AZ | typically off | matches prod if it must catch prod bugs | on |
| Instance sizing | smallest workable | prod-like | per architecture |
| NAT Gateways | one, or none | one | per AZ |
| Backups / retention | short | short | per RPO |
| `prevent_destroy` | optional | recommended | **mandatory** |
| Deletion protection | off | on | **on** |
| Auto-shutdown outside hours | yes | consider | never |

**Rules**
- Separate state and, where possible, separate AWS accounts. Account separation is the strongest
  blast-radius control available
- Staging resembles production in **shape**, not necessarily in **size**. Differences are untested
  surface — list them in the deployment plan
- Environment differences belong in `tfvars`, not in conditional logic scattered through resources.
  `count = var.environment == "prod" ? 1 : 0` sprinkled everywhere is unreadable

---

## Naming

**Convention:** `<project>-<environment>-<component>-<resource-type>`

| Resource | Pattern |
|---|---|
| VPC | `<project>-<env>-vpc` |
| Subnet | `<project>-<env>-<public\|private>-<az>` |
| Security group | `<project>-<env>-<component>-sg` |
| IAM role | `<project>-<env>-<component>-role` |
| ECS service | `<project>-<env>-<component>` |
| RDS instance | `<project>-<env>-<engine>` |
| S3 bucket | `<project>-<env>-<purpose>-<account-id>` — globally unique, suffix needed |
| Log group | `/<platform>/<project>-<env>/<component>` |

**Terraform identifiers** (the names in code) use `snake_case` and describe the **role**, not the
type: `aws_subnet.private`, not `aws_subnet.subnet_1`. Use `this` for a module's single primary
resource.

Build names from a local so the convention is enforced in one place:

```hcl
# locals.tf
locals {
  name_prefix = "${var.project_name}-${var.environment}"
}
```

---

## Tagging

Tags drive cost allocation, ownership, automation, and incident response. **Untagged resources are
unattributable spend.**

```hcl
# locals.tf
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner
    Repository  = var.repository_url
    CostCenter  = var.cost_center   # if used
  }
}
```

Apply once, at the provider level, so nothing is missed:

```hcl
# providers.tf
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
```

Merge per-resource additions rather than replacing:

```hcl
tags = merge(local.common_tags, {
  Name = "${local.name_prefix}-<component>"
})
```

**Minimum tag set:** `Project` · `Environment` · `ManagedBy` · `Owner`. Add `Name` per resource for
console readability.

> **Enable cost allocation tags in the billing console.** Tags do not appear in Cost Explorer until
> activated there — a step people miss for months.

---

## `terraform.tfvars.example`

Committed. **Contains no real values** — it documents shape, not content.

```hcl
# terraform.tfvars.example
# Copy to terraform.tfvars and fill in. Do NOT commit terraform.tfvars.

project_name = "<project>"
environment  = "<dev|staging|prod>"
aws_region   = "<region>"

vpc_cidr           = "<x.x.x.x/16>"
availability_zones = ["<az-a>", "<az-b>"]

instance_type  = "<type>"
desired_count  = <n>

db_instance_class    = "<class>"
db_allocated_storage = <gb>
db_multi_az          = <true|false>

# Secrets are NOT set here. They are created out of band and read at runtime.
```

---

## `.gitignore`

```gitignore
# Terraform
*.tfstate
*.tfstate.*
*.tfstate.backup
.terraform/
crash.log
crash.*.log
*.tfplan
tfplan
override.tf
override.tf.json
*_override.tf

# Variable files — may contain secrets
*.tfvars
*.tfvars.json
!*.tfvars.example      # keep the example
```

> **Do commit `.terraform.lock.hcl`.** It is not a secret, and it is what makes provider versions
> reproducible across machines and CI.
