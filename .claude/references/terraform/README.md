# Terraform References — Index

| File | Covers |
|---|---|
| `language.md` | Providers, resources, data sources, variables, outputs, locals, expressions |
| `state.md` | State, remote state, locking, workspaces, state security |
| `modules.md` | Module design, composition, versioning |
| `commands-and-workflow.md` | init, validate, fmt, plan, apply, destroy, dependency management |
| `meta-arguments.md` | count, for_each, lifecycle, depends_on, provider, dynamic |
| `production-practices.md` | Import, drift, production practices, security practices |

Structure, naming, and tagging conventions live in `project-structure.md`.

---

## The Mental Model

Terraform is **declarative and stateful**:

1. You describe **desired state** in `.tf` files
2. Terraform reads **actual state** from its state file and refreshes it against the real world
3. `plan` computes the **difference**
4. `apply` executes the difference

Almost everything confusing about Terraform follows from step 2. **The state file is Terraform's
only record of what it owns.** Lose it and Terraform no longer knows it created anything — it will
happily try to create duplicates. Corrupt it and it may destroy live resources.

**Two consequences worth internalizing:**
- **State is the source of truth**, not the AWS console. A console edit creates *drift*
- **State stores resource attributes in plaintext**, including database passwords. This is *why*
  secrets must not flow through Terraform

---

## The Non-Negotiables

| Rule | Reason |
|---|---|
| **Remote state with locking, versioning, encryption, restricted access** | A laptop is not a source of truth; two simultaneous applies corrupt state |
| **Separate state per environment** | A dev mistake must be structurally incapable of touching prod |
| **`prevent_destroy` on every data store** | The cheapest insurance in Terraform |
| **No secrets in `.tf` or `.tfvars`** | They land in state and in git |
| **Version-pin providers and modules** | An unpinned provider is an unannounced change |
| **`plan -out=tfplan`, review, then `apply tfplan`** | What was approved is what runs |
| **Never `apply` or `destroy` without explicit approval** | See `.claude/rules/production-rules.md` |

---

## Reading a Plan — The Symbols

| Symbol | Meaning | Concern |
|---|---|---|
| `+` | create | Usually safe — check cost |
| `~` | update in place | Usually safe — read which attribute |
| `-/+` | **destroy then create** | **Downtime and possible data loss** |
| `+/-` | create then destroy (`create_before_destroy`) | Safer, brief duplication |
| `-` | **destroy** | **Stop and confirm** |
| `<=` | data source read | Informational |

**Always search plan output for `forces replacement`, `must be replaced`, and `will be destroyed`,
and surface those first.** Read every `-` and `-/+` line individually — skimming plans is how
databases die.
