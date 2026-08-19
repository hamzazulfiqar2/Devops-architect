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

`terraform destroy` · `terraform state rm|mv` · `taint` · `force-unlock` · `import` ·
`kubectl delete` · `kubectl drain|cordon` · `helm uninstall` · `docker system prune` ·
`docker volume rm|prune` · `aws <svc> delete-*` · `aws s3 rm|rb` · `rm -rf` on a root/home path

**`ask`** — may proceed **with explicit approval**, but must never be silent:

`terraform apply` · `kubectl apply|patch|replace|scale|edit` · `kubectl rollout restart|undo` ·
`helm install|upgrade` · `aws iam <mutating>` · security-group authorize/revoke ·
`ecs update-service` · `git push --force` · `git reset --hard` · secret rotation/deletion

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
