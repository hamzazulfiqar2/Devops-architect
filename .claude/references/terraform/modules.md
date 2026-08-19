# Terraform — Modules

---

## When To Write a Module

**Write one when the same shape is used more than twice**, or when a boundary genuinely clarifies
the code.

**Premature modules are harder to read than duplicated resources.** A module adds indirection: to
understand what is created, a reader must open another file and mentally substitute variables. That
cost is worth paying for real reuse, and not otherwise.

**Good reasons**
- The same set of resources is created three or more times
- A clear domain boundary exists — networking, a database stack, a service
- A team needs a paved path with sensible defaults

**Bad reasons**
- "Modules are best practice"
- Wrapping a single resource in a module that adds no logic — that is indirection with no benefit
- Anticipating reuse that has not happened

---

## Module Anatomy

```
modules/networking/
├── README.md        purpose, inputs, outputs, example
├── main.tf          resources
├── variables.tf     typed, described, validated inputs
├── outputs.tf       everything a caller could need
└── versions.tf      required_providers ONLY — no provider blocks
```

---

## Module Rules

| Rule | Reason |
|---|---|
| **One clear purpose** | A module that does everything explains nothing |
| **Inputs typed, described, validated** | The interface *is* the documentation |
| **No `provider` blocks inside** | Callers configure providers. Nested providers break `destroy` and prevent reuse |
| `required_providers` in the module's `versions.tf` | Declares need without configuring |
| **No hardcoded account IDs, regions, or names** | Kills reuse instantly |
| **Outputs for everything callers need** | A caller reaching around the interface means the interface is wrong |
| **Version-pinned when sourced remotely** | An unpinned module is an unannounced change |
| `README.md` with inputs, outputs, example | A module nobody can use is dead code |
| Accept a `tags` input and merge it | Callers must be able to tag consistently |

---

## Calling a Module

```hcl
module "networking" {
  source = "./modules/networking"

  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  environment        = var.environment
  tags               = local.common_tags
}

# Remote — version is REQUIRED
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.13"
  # ...
}
```

**Referencing outputs:** `module.networking.private_subnet_ids`

**Source types**
| Source | Example | Notes |
|---|---|---|
| Local path | `./modules/networking` | No versioning; changes apply immediately |
| Registry | `terraform-aws-modules/vpc/aws` | **Always pin `version`** |
| Git | `git::https://...?ref=v1.2.0` | **Pin with `?ref=` to a tag, never a branch** |

**Never source a module from an unpinned branch.** The infrastructure changes when someone else
merges.

---

## Module Composition

**Prefer flat composition over deep nesting.** A root module calling several single-purpose modules
is readable; three levels of nesting is not — errors surface far from their cause and outputs must
be threaded up through every level.

```hcl
module "networking" { source = "./modules/networking" ... }

module "database" {
  source     = "./modules/database"
  subnet_ids = module.networking.isolated_subnet_ids   # explicit wiring
}
```

Wiring modules together in the root makes the dependency graph visible. Hiding it inside nested
modules does not.

---

## Community Modules

Well-maintained community modules (`terraform-aws-modules/*`) are worth considering for
undifferentiated infrastructure — VPCs especially, where the module encodes a lot of routing detail
you would otherwise get wrong.

**The trade-off, stated honestly:**

| Gain | Cost |
|---|---|
| Less code to own and maintain | Another abstraction to learn |
| Encoded best practice and edge cases | Upgrade path to track |
| Faster to a working setup | Harder to debug — errors surface inside the module |
| Community-tested | Many inputs, most irrelevant to you |

**Say which way it falls for this project** rather than defaulting either direction. For a solo
operator learning DevOps, writing the VPC yourself once is genuinely educational; using the module
is genuinely faster. Both are defensible — name the reason.

**If you use one:** pin the version, read its README, and check what it creates before applying —
some community modules create considerably more than expected, including resources with a fixed
monthly cost.

---

## Variables and Validation in Modules

```hcl
variable "instance_count" {
  description = "Number of instances to run"
  type        = number

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 10
    error_message = "instance_count must be between 1 and 10."
  }
}
```

Validation in a module is more valuable than in a root configuration — it protects every caller,
including future ones, and turns a confusing mid-apply failure into a clear plan-time error.

---

## Common Module Mistakes

- **A `provider` block inside a module** — breaks `destroy` and reuse; the single most damaging
  module mistake
- Unpinned remote module or a git branch reference
- Hardcoded account IDs, regions, or resource names
- A module that wraps one resource and adds nothing
- Nesting three levels deep, so errors surface far from their cause
- Missing outputs, forcing callers to reach around the interface
- No `tags` input, so callers cannot tag consistently
- Creating modules before there is any reuse
- Not reading what a community module actually creates before applying it
