# Terraform — Commands and Workflow

---

## The Standard Workflow

```bash
terraform fmt -recursive        # format
terraform validate              # syntax and internal consistency
terraform init                  # download providers, configure backend
terraform plan -out=tfplan      # compute and SAVE the diff
terraform show tfplan           # review it
# ── STOP. Brief the user. Get explicit approval. ──
terraform apply tfplan          # apply THAT file
```

**Apply the saved plan file, not a fresh plan.** Otherwise what runs is not what was approved —
state may have changed between the two.

---

## `terraform init`

Downloads providers and modules, configures the backend, creates `.terraform/`.

```bash
terraform init
terraform init -upgrade                          # update providers within constraints
terraform init -backend=false                    # validate without touching a real backend
terraform init -backend-config="key=prod/tf.tfstate"   # partial backend config
terraform init -reconfigure                      # change backend without migrating state
terraform init -migrate-state                    # move state to a new backend
```

**Notes:** required after adding a provider or module, or changing the backend · creates or updates
`.terraform.lock.hcl` — **commit that file** · `-backend=false` is useful in CI for validating code
without credentials.

---

## `terraform fmt` and `validate`

```bash
terraform fmt -recursive          # rewrite files to canonical format
terraform fmt -recursive -check   # exit non-zero if unformatted — use in CI
terraform validate                # syntax, types, references
```

**`validate` does not contact the provider.** It cannot tell you a subnet is full, an AMI does not
exist, or a bucket name is taken. Only `plan` does that. Do not treat a clean `validate` as
assurance the apply will work.

---

## `terraform plan` — The Gate

```bash
terraform plan -out=tfplan        # save it
terraform show tfplan             # human-readable review
terraform show -json tfplan       # machine-readable, for policy checks
terraform plan -refresh-only      # detect drift without proposing changes
terraform plan -target=<addr>     # limit scope — use sparingly, see below
```

### Reading the output

| Symbol | Meaning | Concern |
|---|---|---|
| `+` | create | Usually safe — check cost |
| `~` | update in place | Read **which attribute** |
| `-/+` | **destroy then create** | **Downtime and possible data loss** |
| `+/-` | create then destroy | Safer, brief duplication and cost |
| `-` | **destroy** | **Stop and confirm** |
| `<=` | data source read | Informational |

**Always search the output for and surface first:**
```
forces replacement
must be replaced
will be destroyed
```

`# forces replacement` marks an attribute that cannot change in place — Terraform will **delete and
recreate** the resource. On an RDS instance, that destroys the database. **Many RDS attribute
changes force replacement; always check.**

**Reading habits**
- Counts first: `N to add, N to change, N to destroy`
- Read **every** `-` and `-/+` line individually. Skimming plans is how databases die
- `(known after apply)` is normal, but it can hide the true scope of downstream change
- **A plan showing changes when you changed nothing is drift** — investigate before applying;
  someone may have fixed an outage by hand

**On `-target`:** it produces a partial apply and can leave state inconsistent. Legitimate for
breaking a dependency deadlock or a targeted recovery; **not** a routine tool. If you find yourself
reaching for it often, the configuration is too coupled.

---

## `terraform apply`

```bash
terraform apply tfplan            # apply the reviewed plan — the correct form
terraform apply                   # re-plans and prompts — avoid in any real workflow
terraform apply -auto-approve     # NEVER for anything real
```

> **Never run `apply` automatically.** Present the plan, brief the user (counts, why, risks,
> what cannot be undone), wait for explicit approval for *this* apply.
> See `.claude/rules/production-rules.md`.

**Before asking for approval, state:**
- `N to add, N to change, N to destroy` — counts first
- Every destroy and forced replacement, individually
- Why each change is happening. **If you cannot say why a resource is changing, that is drift**
- Risks: downtime, data loss, endpoint changes, duration, reversibility

**After apply:** verify outputs, confirm resources behave as expected, and report what **actually**
happened including anything that differed from the plan.

---

## `terraform destroy`

```bash
terraform destroy         # requires explicit approval, always
terraform plan -destroy   # preview what would be destroyed — safe
```

> **`terraform destroy` is a command the user types themselves**, after being shown exactly what
> disappears. The agent never runs it. `prevent_destroy` on data stores is the backstop — never
> remove it to let a destroy or apply through.

---

## Dependency Management

**Implicit dependencies** — created by references, and self-documenting:

```hcl
subnet_id = aws_subnet.private.id      # this instance now depends on that subnet
```

Terraform builds a dependency graph from these and orders create, update, and destroy accordingly.
Prefer them.

**Explicit dependencies** — `depends_on` — only for what Terraform cannot see:

```hcl
resource "aws_ecs_service" "app" {
  depends_on = [aws_iam_role_policy.task_execution]   # IAM propagation timing
}
```

Legitimate cases: IAM policy propagation before a service starts · a NAT gateway that must exist
before instances need egress · S3 bucket policy before an object write.

**Overusing `depends_on` serializes the graph and slows applies.** It also hides the real
relationship.

**Dependency cycles** — usually caused by two security groups referencing each other with inline
`ingress`/`egress` blocks. **Fix with standalone rule resources**
(`aws_vpc_security_group_ingress_rule`), which break the cycle. Inline rules also silently fight
with anything managed elsewhere.

**Inspecting the graph:** `terraform graph` (Graphviz output), or read the ordering in plan output.

---

## Other Useful Commands

| Command | Use | Safe? |
|---|---|---|
| `terraform output` | Show outputs | ✅ |
| `terraform output -json` | Machine-readable outputs | ✅ |
| `terraform state list` | List managed resources | ✅ |
| `terraform state show <addr>` | Inspect one resource's state | ✅ |
| `terraform providers` | Provider requirements tree | ✅ |
| `terraform version` | Versions in use | ✅ |
| `terraform console` | Evaluate expressions interactively | ✅ |
| `terraform graph` | Dependency graph | ✅ |
| `terraform force-unlock <id>` | Release a stuck lock | ⚠️ **Approval required** |
| `terraform taint` / `state rm` / `state mv` / `import` | Modify state | ⚠️ **Approval required** |

---

## CI/CD Integration

**On pull request:** `fmt -check` → `validate` → `plan` → post the plan as a comment → run IaC
security scanning (tfsec/checkov) and optionally cost estimation (infracost).

**On merge, after approval:** `apply` the saved plan, gated by a human approval step. Use OIDC for
AWS credentials, never static keys. Use concurrency controls so two applies never run against the
same state.

**Never `-auto-approve` on production.** The approval gate is the point.
