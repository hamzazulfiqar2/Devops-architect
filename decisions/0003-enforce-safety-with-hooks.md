# 0003 — Enforce the top safety rules with hooks, not prose alone

**Status:** Accepted
**Date:** 2026-08-19
**Decided by:** Hamza

---

## Context

The agent had 63 files of doctrine, including three rules files (`security.md`,
`production-rules.md`, `architecture-principles.md`) stating things like *"never run
`terraform destroy` without explicit approval"*.

Auditing what actually enforced what revealed a hierarchy:

| Tier | Mechanism | Force |
|---|---|---|
| 1 | Agent `tools:` field, `settings.json` permissions | Harness blocks the call — **cannot** be bypassed |
| 2 | `CLAUDE.md` + `rules/` (auto-loaded, ~18k tokens) | Strong instruction — **can** be ignored |
| 3 | Skills (loaded on demand) | Model must choose to load |
| 4 | `workflows/`, `templates/`, `references/`, `mcp/` | Inert unless something opens them |

**The most important safety rules were in tier 2.** A `deny` entry in `settings.json` was
considered but rejected in an earlier session: a deny rule cannot be overridden by approval, which
would break the deployment workflow where the user *approves* an apply and the agent then runs it.

**UNKNOWN at decision time:** whether the model would ever actually violate a tier-2 rule. No
incident had occurred — this is preventative.

## Decision

Add two `PreToolUse` / `PostToolUse` hooks that enforce the highest-consequence rules at the
harness level:

- **`block_destructive.py`** (`PreToolUse` on `Bash`) — two classes:
  - **`deny`** for commands `production-rules.md` says the user types themselves:
    `terraform destroy`, `state rm/mv`, `kubectl delete`, `drain`, `docker system prune`,
    `aws <svc> delete-*`, `rm -rf` on root/home
  - **`ask`** for commands allowed *with* approval but never silently: `terraform apply`,
    `kubectl apply/scale/rollout`, IAM changes, security-group changes, `git push --force`
- **`scan_secrets.py`** (`PostToolUse` on `Write|Edit`) — blocks writes containing
  credential-shaped literals, enforcing `security.md` rule 1

Both fail **open** on error — a hook bug must never break the session.

## Why

`ask` is the key insight: **permission allow-rules can be skipped in relaxed permission modes, but
a `PreToolUse` hook always runs.** This is the layer that survives someone later broadening the
allowlist, or working in an auto-approving mode.

It also solves the deny-rule problem from the earlier session: `ask` forces a prompt without making
the action impossible, so the approve-then-apply workflow still works.

## Alternatives considered

| Option | Why it lost |
|---|---|
| Rely on `rules/` prose alone | Tier 2 — ignorable. This is exactly the gap being closed |
| `deny` entries in `settings.json` | Cannot be overridden by approval; breaks the approved-apply workflow |
| Block everything, no `ask` class | Would make the agent unable to execute approved work |
| A `prompt`-type hook (LLM judges each command) | An LLM call per Bash command — too slow, and non-deterministic for a safety control |
| Do nothing until an incident occurs | The incident is a destroyed database |

## Consequences

**What this gives us:** the highest-consequence rules moved from tier 2 to tier 1 · protection that
survives relaxed permission modes · every block cites the rule it enforces, so it teaches rather
than just refusing.

**What this costs us:** a Python process spawned per `Bash` call (~50–100ms) · two more files to
maintain · regex patterns that need updating as tooling changes.

**What becomes harder:** legitimate destructive work now requires the user to run the command
themselves. **That is the intent, not a side effect.**

**Accepted risk:**
- **Deliberate over-block:** `terraform destroy --help` is blocked. Matching the verb rather than
  parsing flags is the safer trade
- **Fails open.** A malformed payload or Python error lets the command through. This is a strong
  safety net, **not an airtight boundary** — the credential and permission layers remain necessary
- Depends on Python being on PATH (verified present; `jq` is not installed on this machine, which
  is why Python is used)

## What would force a revisit

- The over-block rate becomes annoying enough that hooks get disabled — at which point narrow the
  regexes rather than removing the protection
- The harness gains native rule-based enforcement making custom hooks redundant
- A blocked pattern is found to be evadable by trivial rewording, indicating regex matching is the
  wrong approach

## References

- `.claude/hooks/README.md` — what each hook does, how to handle a block
- `.claude/settings.json` — hook wiring
- `CLAUDE.md` §8 — approval gates, including the instruction not to evade a block
