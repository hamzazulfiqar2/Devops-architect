# Terraform — Meta-Arguments

`count`, `for_each`, `lifecycle`, `depends_on`, `provider`, and `dynamic`. These change *how*
Terraform manages a resource rather than *what* it creates.

---

## `for_each` vs `count`

**Prefer `for_each`. This is not a style preference — it prevents real destruction.**

### The problem with `count`

`count` creates resources indexed by position: `aws_instance.app[0]`, `[1]`, `[2]`.

Remove the middle item from the list, and every subsequent resource **shifts index**. Terraform
sees `[1]` change from `b` to `c`, and `[2]` disappear — so it **destroys and recreates** them.

```hcl
# Before: ["a", "b", "c"]  → app[0]=a, app[1]=b, app[2]=c
# Remove "b"
# After:  ["a", "c"]       → app[0]=a, app[1]=c
# Terraform: app[1] MODIFIED (b→c), app[2] DESTROYED
```

On instances that is churn. **On databases or volumes, that is data loss.**

### `for_each` keys by identity, not position

```hcl
resource "aws_instance" "app" {
  for_each      = toset(["a", "b", "c"])
  instance_type = var.instance_type
  tags          = { Name = each.key }
}
```

Addresses become `aws_instance.app["a"]`, `["b"]`, `["c"]`. Remove `"b"` and only `app["b"]` is
destroyed. Everything else is untouched.

**With a map, for per-item configuration:**
```hcl
resource "aws_subnet" "private" {
  for_each          = var.private_subnets    # { "az-a" = "10.0.1.0/24", ... }
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value
  availability_zone = each.key
}
```

`each.key` and `each.value` are available inside the block.

### When `count` is still right

```hcl
count = var.create_alb ? 1 : 0      # conditional creation — the main legitimate use
```

Also acceptable for genuinely identical, order-irrelevant resources where the number is the only
variable. But even then, `for_each` over a set is usually clearer.

**Caveat:** `for_each` keys must be known at plan time. Keys derived from another resource's
unknown attribute cause "Invalid for_each argument" — restructure so keys come from variables or
static data.

**Migrating `count` → `for_each`** requires `terraform state mv` per resource, which needs approval.
Get it right at the start.

---

## `lifecycle`

```hcl
lifecycle {
  create_before_destroy = true
  prevent_destroy       = true
  ignore_changes        = [tags["LastModified"]]
  replace_triggered_by  = [aws_launch_template.app.latest_version]
}
```

### `prevent_destroy = true`

**Apply to every RDS instance, every S3 bucket holding real data, and anything else where deletion
is unacceptable.** Any plan that would destroy the resource fails outright.

**Recommend it proactively — it is the cheapest insurance in Terraform.** And per
`.claude/rules/security.md` rule 18, **never remove it to let an apply through**. If it blocks you,
the block is the point; resolve the underlying issue.

### `create_before_destroy = true`

Build the replacement before removing the old one — essential for anything serving traffic.

Watch for **name collisions during the overlap**: two resources cannot share a unique name, so use
`name_prefix` instead of `name` where the provider supports it.

### `ignore_changes`

For attributes deliberately managed outside Terraform:

```hcl
ignore_changes = [
  desired_count,             # managed by autoscaling
  task_definition,           # managed by the CI deploy
]
```

**Use narrowly.** `ignore_changes = all` hides real drift and turns Terraform into a
resource-creator that never reconciles. Every entry should have a stated reason.

### `replace_triggered_by`

Force replacement when a related resource changes — e.g. replacing instances when a launch template
version changes.

---

## `depends_on`

Only for dependencies Terraform cannot infer from references.

```hcl
depends_on = [aws_iam_role_policy.task_execution]
```

**Legitimate:** IAM policy propagation before a service starts · NAT gateway before instances need
egress · bucket policy before an object write.

**Not legitimate:** anything you could express by referencing an attribute instead. Overuse
serializes the graph, slows applies, and obscures the real relationship.

**Module-level `depends_on`** exists and is blunt — it makes the entire module wait. Prefer wiring
specific outputs to inputs.

---

## `provider`

Selects a non-default provider instance:

```hcl
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

resource "aws_acm_certificate" "cdn" {
  provider = aws.us_east_1     # CloudFront certificates MUST be in us-east-1
  # ...
}
```

Passing providers into modules:
```hcl
module "cdn" {
  source    = "./modules/cdn"
  providers = { aws = aws.us_east_1 }
}
```

**Never define a `provider` block inside a module** — pass it in. Nested providers break `destroy`
and prevent reuse.

---

## `dynamic` blocks

Generate repeated nested blocks from a collection:

```hcl
dynamic "ingress" {
  for_each = var.ingress_rules
  content {
    from_port   = ingress.value.port
    to_port     = ingress.value.port
    protocol    = "tcp"
    cidr_blocks = ingress.value.cidrs
  }
}
```

**Use sparingly.** A `dynamic` block is significantly harder to read than three explicit blocks, and
plan output becomes harder to follow. Reach for it when the collection is genuinely variable, not
to avoid typing.

**For security group rules specifically, prefer standalone rule resources**
(`aws_vpc_security_group_ingress_rule` with `for_each`) over `dynamic ingress` blocks — they avoid
dependency cycles, do not fight with rules managed elsewhere, and produce clearer plans.

---

## Quick Reference

| Meta-argument | Use for | Watch out for |
|---|---|---|
| `for_each` | **Default** for multiple similar resources | Keys must be known at plan time |
| `count` | Conditional creation (`? 1 : 0`) | **Index shifts destroy and recreate** |
| `prevent_destroy` | Every data store | Never remove it to unblock an apply |
| `create_before_destroy` | Anything serving traffic | Name collisions — use `name_prefix` |
| `ignore_changes` | Attributes managed elsewhere | `all` hides real drift |
| `replace_triggered_by` | Replacement driven by a related change | Can cause unexpected churn |
| `depends_on` | Invisible dependencies only | Serializes the graph |
| `provider` | Multi-region resources | Never declare providers inside modules |
| `dynamic` | Genuinely variable nested blocks | Readability cost; prefer explicit blocks |
