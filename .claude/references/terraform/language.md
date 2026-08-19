# Terraform — Language

Providers, resources, data sources, variables, outputs, locals, and expressions.

---

## Providers

**What it is:** the plugin that talks to a platform's API. AWS, GitHub, Kubernetes, and so on.

```hcl
terraform {
  required_version = "~> 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.common_tags }
}
```

**Notes**
- **Pin versions.** Provider upgrades change behavior and occasionally force resource replacement.
  `~> 5.70` allows patch and minor within 5.x
- `.terraform.lock.hcl` records exact provider versions and checksums. **Commit it** for
  reproducible builds — the alternative is builds that differ between machines
- **`default_tags`** at the provider level applies tags to every taggable resource. Set your tag map
  once here rather than on every resource
- **Multiple providers** via `alias` — e.g. a second AWS provider in `us-east-1` for CloudFront
  certificates:

```hcl
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "cdn" {
  provider = aws.us_east_1
  # ...
}
```

- **Never put a `provider` block inside a module.** Callers configure providers; nested providers
  break `terraform destroy` and make the module unreusable

---

## Resources

**What it is:** something Terraform creates, owns, and manages the lifecycle of.

```hcl
resource "aws_instance" "app" {
  ami           = data.aws_ami.al2023.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.private[0].id

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-app" })
}
```

**Address:** `aws_instance.app` — used in references, `plan` output, and state commands.

**Notes**
- Naming: `snake_case`, describing the **role**, not the type — `aws_subnet.private`, not
  `aws_subnet.subnet_1`. Use `this` for a module's single primary resource
- **Never hardcode** AMI IDs (region-specific and they rotate), account IDs, ARNs, or regions —
  use data sources and variables
- Referencing an attribute of another resource creates an **implicit dependency**, which is how
  Terraform orders operations

---

## Data Sources

**What it is:** read-only lookup of something that already exists — whether Terraform manages it or
not.

```hcl
data "aws_caller_identity" "current" {}
data "aws_region"          "current" {}
data "aws_availability_zones" "available" { state = "available" }

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}
```

**Use for:** AMIs · account ID and region · availability zones · existing VPCs or subnets you did
not create · secrets **metadata** (the ARN, never the value) · IAM policy documents.

```hcl
data "aws_iam_policy_document" "app" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
  }
}
```

**Prefer `aws_iam_policy_document` over heredoc JSON** — it is readable, composable, and validated
at plan time.

**Caution:** `most_recent = true` on an AMI means the value can change between plans, producing an
unexpected instance replacement. Pin deliberately when stability matters.

---

## Variables

```hcl
variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "instance_config" {
  description = "Compute sizing"
  type = object({
    instance_type = string
    min_size      = number
    max_size      = number
  })
}
```

**Rules**
- **`type` and `description` always.** A variable without a description is undocumented input
- `default` only where a sensible one exists. A required variable fails fast — better than a wrong
  default applied silently
- **`validation` blocks catch bad input at plan time** rather than mid-apply
- `sensitive = true` **suppresses console output only. It does not encrypt state**
- Use `object({...})` types to group related settings instead of many loose variables
- Never give a default that would create real cost or open access if forgotten

**Precedence** (highest wins): `-var` on the CLI → `-var-file` → `terraform.tfvars` →
`*.auto.tfvars` → environment `TF_VAR_*` → `default`.

---

## Locals

**What it is:** a named expression, computed once, used many times.

```hcl
locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner
  }

  is_production = var.environment == "prod"
}
```

**Use for:** naming conventions (enforced in one place) · merged tag maps · derived booleans ·
anything repeated three or more times.

**Do not use** for values a caller should be able to set — that is a variable.

---

## Outputs

```hcl
output "alb_dns_name" {
  description = "Public DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "db_secret_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db.arn
  # NOT the secret value
}
```

**Rules**
- Export what someone actually needs: endpoints, ARNs, names, IDs consumed downstream
- **Mark sensitive outputs `sensitive = true`** — an unmarked secret prints to the console and into
  CI logs
- **Output the ARN, never the secret value.** Let the consumer read it with its own IAM
- Module outputs should expose everything a caller could reasonably need — a caller reaching around
  a module means its interface is wrong

---

## Expressions Worth Knowing

| Construct | Use |
|---|---|
| `merge(a, b)` | Combine maps — tags especially |
| `lookup(map, key, default)` | Safe map access |
| `try(expr, fallback)` | Tolerate a missing attribute |
| `coalesce(a, b, c)` | First non-null value |
| `for` expressions | Transform lists and maps: `{ for k, v in var.m : k => upper(v) }` |
| Splat `[*]` | Collect an attribute across instances: `aws_subnet.private[*].id` |
| `templatefile()` | Render a file with variables — user data, policy documents |
| `jsonencode()` | Build JSON safely instead of string-concatenating it |
| `cidrsubnet()` | Derive subnet CIDRs from a VPC CIDR arithmetically |
| Conditional `a ? b : c` | Environment-dependent values — **use sparingly** |

**On conditionals:** `count = var.environment == "prod" ? 1 : 0` scattered through resources becomes
unreadable fast. Prefer putting environment differences in `tfvars` and keeping the resource
definitions uniform.
