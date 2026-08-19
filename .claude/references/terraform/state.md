# Terraform — State

**State is Terraform's record of what it created and the real-world IDs behind it.** Everything
about Terraform's behavior follows from this file.

---

## Why State Exists

Terraform needs to know:
- **What it owns** — so it does not recreate resources on every run
- **The mapping** from `aws_instance.app` to `i-0abc123...`
- **Attribute values** — to compute a diff without querying everything
- **Dependency order** — for correct create and destroy sequencing

**Two consequences that drive every rule below:**

1. **Lose state and Terraform no longer knows it owns anything.** It will try to create duplicates,
   or report every resource as new. Recovery means importing resource by resource
2. **State stores attributes in plaintext** — including RDS passwords, generated secrets, and
   private keys. **This is *why* secrets must not flow through Terraform.** Anyone who can read the
   state file can read those values

---

## Remote State

Local state is acceptable only for throwaway experiments. Anything a second person, a pipeline, or
production touches needs remote state.

```hcl
terraform {
  backend "s3" {
    bucket       = "<state-bucket>"
    key          = "<project>/<environment>/terraform.tfstate"
    region       = "<region>"
    encrypt      = true
    use_lockfile = true    # native S3 locking (modern providers)
    # dynamodb_table = "<lock-table>"   # older setups
  }
}
```

**Backend requirements**

| Item | Requirement | Why |
|---|---|---|
| Remote backend | S3 or equivalent | A laptop is not a source of truth |
| **Locking** | S3 native lockfile, or DynamoDB table | Two simultaneous applies corrupt state |
| **Versioning** | Enabled on the bucket | **The only recovery from a bad apply** |
| Encryption | At rest, and TLS in transit | State contains secrets |
| **Access restriction** | IAM-limited to who needs it | Read access to state ≈ read access to secrets |
| **Separation** | One state file per environment | Blast-radius isolation |

**Bootstrap problem:** the state bucket cannot be created by the configuration that stores its state
in it. Create it once separately (a small bootstrap configuration with local state, or by hand,
documented), then configure the backend.

**Backend configuration cannot use variables.** Use partial configuration and pass values at init:
```bash
terraform init -backend-config="key=<project>/prod/terraform.tfstate"
```

---

## State Locking

Prevents two applies running simultaneously — which is how state gets corrupted.

- **S3 native locking** (`use_lockfile = true`) on modern AWS provider versions
- **DynamoDB lock table** on older setups: a table with `LockID` as the partition key
- CI pipelines must not run concurrent applies against the same state. Use
  `concurrency` groups in GitHub Actions

**If a lock is stuck** (a crashed apply), `terraform force-unlock <id>` releases it — but
**verify no apply is actually running first**. Force-unlocking a live apply causes exactly the
corruption locking exists to prevent. **This command requires explicit approval.**

---

## State Separation

**Never put all environments in one state file.**

| Approach | How | Verdict |
|---|---|---|
| **Directory per environment** | `environments/dev/`, `environments/prod/`, each with its own `backend.tf` | **Preferred.** Backend key and provider config are explicit and visible. A mistake in `dev/` cannot reach prod without changing directory |
| **Workspaces** | `terraform workspace new prod` — one configuration, multiple states | Fine for ephemeral or per-developer environments. **Risky for dev/staging/prod** — workspaces share provider configuration, so applying to the wrong one is one forgotten command away |

**Workspaces in practice**
```bash
terraform workspace list
terraform workspace show      # RUN THIS before any apply
terraform workspace select <name>
```
`terraform.workspace` is available in expressions, which tempts people into conditional logic that
becomes unreadable.

**Splitting state further** — networking, data, and applications in separate states — reduces blast
radius and shortens plan times, at the cost of cross-state references (`terraform_remote_state` data
source or SSM parameters) and coupling between stacks. Worth it once a single apply takes many
minutes or touches too much.

---

## State Security

| Rule | Detail |
|---|---|
| **Never commit state** | `.gitignore` must cover `*.tfstate`, `*.tfstate.*`, `*.tfstate.backup` |
| **Restrict bucket access** | State readers can read secrets |
| Encrypt at rest | Bucket encryption, and consider a CMK |
| Enable versioning | Recovery from a bad apply |
| Enable access logging | Who read state, and when |
| Prefer `manage_master_user_password` | RDS password never enters state |
| Avoid `random_password` where possible | It writes the generated value to state |
| Mark sensitive outputs | `sensitive = true` — otherwise they print to console and CI logs |

---

## State Commands — All Require Care

These modify state without touching infrastructure, which is exactly what makes them dangerous:
state and reality can silently diverge.

| Command | What it does | Risk |
|---|---|---|
| `state list` | List managed resources | **Safe, read-only** |
| `state show <addr>` | Show a resource's state | **Safe, read-only** |
| `state pull` | Download raw state | Safe, but the output contains secrets |
| `state rm <addr>` | **Removes from state** — Terraform forgets it exists | Resource is orphaned; a fresh apply may create a duplicate |
| `state mv <src> <dst>` | Rename or move a resource in state | Wrong target orphans the original |
| `taint` / `untaint` | Mark for replacement on next apply | Causes a destroy/create |
| `force-unlock <id>` | Release a lock | **Corrupts state if an apply is genuinely running** |
| `import` | Bring an existing resource under management | Wrong address associates state with the wrong resource |

> **Every command below `state show` in this table requires explicit approval before running.**
> See `.claude/rules/production-rules.md`.

**Never hand-edit a state file.** If it must be repaired, use the state commands, with a backup of
the previous version from bucket versioning.

---

## If State Is Lost or Corrupted

**Stop.** Do not run `apply` hoping it sorts itself out — you will either create duplicate resources
or destroy live ones.

1. **Check bucket versioning** — restore the previous version. This is usually the whole fix, and is
   the reason versioning is mandatory
2. If there is no version to restore, the infrastructure still exists but is unmanaged. Recover by
   **importing** resources one at a time, verifying with `plan` after each
3. Never delete real resources to "start clean" unless the user explicitly decides to, understanding
   the data loss

---

## Common State Mistakes

- Local state on a laptop for anything real
- No locking — two applies corrupt state
- No versioning — nothing to restore after a bad apply
- **One state file for all environments** — a dev change plans a prod destroy
- State bucket readable by more people than should see secrets
- Committing `.tfstate` to git (it contains secrets, and git keeps it forever)
- Running `state rm` to "fix" a plan without understanding what gets orphaned
- `force-unlock` while an apply is genuinely running
- Assuming `sensitive = true` encrypts state — it only hides console output
