# Hooks — Rules Turned Into Enforcement

Everything in `.claude/rules/` is an *instruction*: strong, always in context, but the model can
still fail to follow it. These hooks are **enforcement** — the harness blocks the call before the
model's intent matters.

| Hook | Event | Matcher | Enforces |
|---|---|---|---|
| `block_destructive.py` | `PreToolUse` | `Bash` | `production-rules.md` — destructive and production-changing commands |
| `scan_secrets.py` | `PostToolUse` | `Write\|Edit` | `security.md` rule 1 — never hardcode secrets |

Wired up in `.claude/settings.json`. No `jq` dependency (not installed on this machine) — both
are Python, which parses the hook payload reliably.

---

## `block_destructive.py`

Two decision classes.

**`deny`** — commands `production-rules.md` says *you* type yourself. Blocked outright:

| Area | Blocked |
|---|---|
| Terraform | `destroy` · `state rm\|mv` · `taint` · `force-unlock` · `import` |
| Kubernetes | `kubectl delete` · `drain` · `cordon` · `helm uninstall` |
| Docker | `system prune` · `volume rm\|prune` |
| **AWS** | `delete-*` · `terminate-*` · `purge-*` · `deregister-*` · `batch-delete-*` · `s3 rm\|rb` · `kms schedule-key-deletion\|disable-key` |
| Filesystem | `rm -rf` on a root or home path |

> **AWS uses several different verbs for "destroy".** `delete-` alone misses
> `ec2 terminate-instances`, `ec2 deregister-image`, `sqs purge-queue`, and
> `ecr batch-delete-image`. All are covered.
>
> `kms schedule-key-deletion` is called out separately because it is the most
> irreversible command in AWS — every object encrypted with that key becomes
> permanently unrecoverable once the waiting period ends.

**`ask`** — may proceed **with explicit approval**, but must never be silent:

| Area | Requires approval |
|---|---|
| Terraform | `apply` |
| Kubernetes | `apply` · `patch` · `replace` · `scale` · `edit` · `rollout restart\|undo` · `helm install\|upgrade` |
| **AWS — identity/network** | `iam <mutating>` · security-group `authorize\|revoke` |
| **AWS — deployment** | `ecs update-service` · `eks update` · `lambda update-function-code` |
| **AWS — disruptive** | `stop-*` · `reboot-*` · `modify-*` · `detach-*` · `release-*` · `disable-*` |
| Secrets | `put-secret-value` · `rotate-secret` |
| Git | `push --force` · `reset --hard` |

`modify-*` is in the ask list because **many RDS attribute changes force resource
replacement** — a "modify" can destroy the database.

> **Why `ask` and not just the permission allowlist?** Allow rules can be skipped in relaxed
> permission modes. A `PreToolUse` hook runs regardless. This is the layer that survives a
> broadened allowlist.

Everything else passes through untouched. Fails **open** on a malformed payload — a hook bug must
never break the session.

---

## `scan_secrets.py`

Scans every file written or edited for credential-shaped literals: AWS access keys, GitHub PATs,
Grafana tokens, Slack tokens, private keys, hardcoded passwords, bearer tokens.

On a hit it blocks with the finding fed back to Claude — **file and line and type, never the
value** — plus the reminder that a real committed secret is *compromised* and must be **rotated**,
not deleted.

Patterns are deliberately tight (full expected length, real prefixes) so this repo's own redaction
examples — `AKIA****************`, `ghp_xxxxxxxxxxxx`, `glsa_...` — do **not** trigger it.
Verified against `mcp/configs/README.md`, `rules/security.md`, and
`references/terraform/production-practices.md`: all clean.

Skips `*.example`, `*.sample`, `*.template`.

---

## When A Hook Blocks You

A `deny` is not a bug. It means the command belongs to you, not the agent.

1. **Run it yourself** in your own terminal, having seen the plan — this is the intended path
2. **Or** temporarily comment the hook out of `.claude/settings.json` if you have a genuine reason,
   and put it back

The design assumption: *the block is right and the request was wrong.* If you find yourself
disabling a hook often, that is a signal about the pattern, not about the hook — narrow the regex
in the script rather than removing the protection.

**Known deliberate over-block:** `terraform destroy --help` is blocked. Matching the verb rather
than parsing flags is a trade the safety case wins.

---

## Testing

Both were pipe-tested (18 cases for `block_destructive`, including false-positive checks) and then
**proven live** — the secret scanner blocked a real write, and `terraform destroy` was blocked in
practice.

Re-test after editing either script:

```bash
printf '{"tool_name":"Bash","tool_input":{"command":"terraform destroy"}}' \
  | python .claude/hooks/block_destructive.py
```

Expect a JSON `permissionDecision` of `deny`. For a command that should pass, expect **no output**
and exit 0.

> If you edit a hook and it stops firing, the settings watcher may not have reloaded. Open
> `/hooks` once in an interactive session, or restart.
