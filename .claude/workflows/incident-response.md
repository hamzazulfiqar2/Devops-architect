# Workflow — Incident Response

**How to respond when production is broken.**

This workflow applies when something is failing **now** and users are or may be affected. It is
deliberately more urgent than `troubleshooting`, but it does not abandon method — under pressure,
method is what prevents a second incident caused by the response to the first.

```
DETECT → TRIAGE → CONTAIN → INVESTIGATE → IDENTIFY ROOT CAUSE → REMEDIATE
→ VALIDATE → RECOVER → POSTMORTEM → PREVENT RECURRENCE
```

Related skills: `troubleshooting` (diagnostic method and playbooks) · `monitoring` · `security`

---

## Rules For This Workflow

**Never perform destructive actions without explicit approval.** Incidents create pressure to
act fast; that pressure is exactly when destructive mistakes happen. Always requiring approval:
`terraform destroy` or apply on a plan containing replace/destroy · `kubectl delete` · deleting
any resource · dropping or truncating data · scaling to zero · rotating or deleting secrets ·
`force-unlock` · restoring over live data · security group or IAM changes.

**Prefer reversible actions.** Rollback over hotfix. Scale up over redesign. Traffic shift over
deletion. Feature flag over deploy. If two actions would work, take the one you can undo.

**Mitigate before you diagnose — and say which you are doing.** If users are affected, restoring
service comes first. Be explicit: *"This is mitigation, not a fix. Root cause work continues
after."* Never present a mitigation as a resolution.

**Capture evidence before destroying it.** A restart fixes the symptom and deletes the proof.
Grab logs, a pod description, a heap dump, or a snapshot **first** — 30 seconds of capture saves
a repeat incident.

**Change one thing at a time.** Simultaneous changes make it impossible to know what worked, and
one of them may be making things worse.

**Announce the phase you are in.** Under pressure, people lose track of whether the team is still
investigating or already fixing.

**No secrets in incident notes.** Reference the location, never the value.

---

## Step 1 — DETECT

Establish what is actually happening. Separate the **report** from the **observation** — "the
site is down" might mean 500s, timeouts, a DNS failure, or one user's cached page.

| Question | Why it matters |
|---|---|
| **Affected service** | Which component, and which of its endpoints or functions |
| **Start time** | **The single most valuable fact.** Anchors the change timeline |
| **Symptoms** | Exact error text, status codes, and where they appear |
| **Users affected** | All or some? Which region, tier, or path? How many? |
| **Severity** | See Step 2 |
| **Constant or intermittent** | Intermittent usually means one bad instance, a race, or a limit hit periodically |
| **What changed at that time** | Deploy · config change · secret rotation · DNS change · traffic spike · dependency incident · certificate expiry · scheduled job |

**Most production incidents are something that changed.** Build the change timeline before
theorizing — deploys, merges, infrastructure applies, and third-party status pages.

If the answer to "did it ever work?" is no, this is a configuration problem, not an incident —
route to `troubleshooting`.

---

## Step 2 — TRIAGE

Classify by **user impact**, not by how alarming the logs look.

| Severity | Definition | Response |
|---|---|---|
| **P1 — Critical** | Complete outage · data loss occurring or imminent · security breach · payments or core function broken for all users | Drop everything. Mitigate now. Notify immediately |
| **P2 — High** | Major feature broken · severe degradation · a subset of users fully blocked · redundancy lost (running on one AZ) | Respond now. Mitigate within the hour |
| **P3 — Medium** | Minor feature broken · degraded performance with usable service · a workaround exists | Respond this working day |
| **P4 — Low** | Cosmetic · affects few users · no functional impact | Schedule normally |

**Escalate severity if:** data integrity is at risk · it is getting worse · the cause is unknown
after the first pass · a security dimension appears · the blast radius is unclear.

**A P1 with an unknown cause is still a P1.** Do not downgrade because you cannot explain it yet.

Record: severity, who is responding, and — if there is anyone to tell — that they have been told.

---

## Step 3 — CONTAIN

**Runs in parallel with investigation when users are affected.** Stop the bleeding.

Preferred containment actions, most reversible first:

| Action | Use when | Reversible |
|---|---|---|
| **Roll back the last deploy** | Symptoms started at a deploy | ✅ Fully — the standard first move |
| **Disable a feature flag** | A specific feature is implicated | ✅ Instantly |
| **Scale up / add capacity** | Saturation, connection exhaustion, queue backlog | ✅ Yes |
| **Shift traffic** | One AZ, instance, or version is bad | ✅ Yes |
| **Rate-limit or shed load** | Overload cascading into total failure | ✅ Yes |
| **Restart a component** | Wedged process, exhausted resource | ⚠ **Capture evidence first** |
| **Fail over** | Primary unrecoverable | ⚠ Plan the failback |

> **If the symptoms began at a deploy, roll back first and diagnose after.** Users before
> curiosity. Rollback is the cheapest, most reversible action available, and it converts a P1
> into a P3 investigation.
>
> Remember: **rollback does not undo database migrations.** If the deploy included one, check
> compatibility before rolling back — a rollback into an incompatible schema makes things worse.

**Security incidents differ:** contain by isolating (revoke credentials, remove network access,
snapshot for forensics) — but **do not destroy evidence**, and hand off to `security`. Rotating a
suspected-compromised credential is containment and should be approved and done quickly.

Anything destructive still needs approval. Present it as: *what it does · what it costs · what it
cannot be undone from · the alternative.*

---

## Step 4 — INVESTIGATE (Collect Evidence)

Gather **before** hypothesizing, or you will only collect evidence that confirms your first idea.

| Source | Look for |
|---|---|
| **Application logs** | Errors around the start time, stack traces, the first anomalous line |
| **Infrastructure logs** | Load balancer 5xx split (`ELB_*` = LB generated, `Target_*` = your app), access logs |
| **Metrics** | Latency percentiles, error rate, saturation, connections — around and before the start time |
| **Traces** | Which hop consumed the time or broke the chain |
| **Kubernetes events** | `kubectl get events --sort-by=.lastTimestamp` — **they expire in ~1h, capture now** |
| **Pod/container state** | `kubectl describe pod` (read Events at the bottom), restart counts, `logs --previous` |
| **Docker logs** | Container exit codes: 137 OOM · 139 segfault · 1 application error |
| **CloudWatch** | Alarm state history, log group insights, per-service metrics |
| **ECS/EKS** | `describe-tasks` → `stoppedReason` verbatim · target group health · rollout status |
| **Deployment history** | What deployed, when, and what artifact SHA is actually running |
| **Recent commits** | The diff since the last known-good version |
| **Recent infrastructure changes** | Terraform applies, console edits, secret rotations, certificate renewals |
| **Dependency status** | Third-party status pages, database health, upstream services |

Note what you **cannot** see. Missing evidence is itself information — and often the finding
("there are no logs from that window" means the log driver failed, or the process died before
writing).

---

## Step 5 — HYPOTHESES

Write down **at least two or three** candidate causes, ranked by likelihood. A single hypothesis
is a guess wearing a hat.

**Do not apply fixes yet.**

Rank on: what changed recently · what the error text actually says · which layer the evidence
implicates · base rates — **config, permissions, capacity, and DNS cause more incidents than
exotic bugs**.

For each hypothesis, state **what you would expect to see if it were true**. That is what makes
it testable.

| # | Hypothesis | If true, we'd see | Evidence for | Evidence against | Test |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

---

## Step 6 — VALIDATE HYPOTHESES

Run **safe, read-only diagnostics**. Choose tests that **eliminate** possibilities rather than
merely confirming your favourite — a test that could rule out three candidates is worth more than
one that confirms a hunch.

**Bisect the path.** For a request crossing DNS → load balancer → service → pod → database, test
the midpoint to halve the search space rather than walking it end to end.

Always safe:
```bash
kubectl config current-context          # confirm the target before anything
kubectl describe pod <pod>              # Events at the bottom
kubectl logs <pod> --previous
kubectl get endpoints <svc>             # empty = selector matches no ready pod
aws sts get-caller-identity             # first move on any AccessDenied
aws ecs describe-tasks --tasks <id>     # stoppedReason
aws elbv2 describe-target-health --target-group-arn <arn>
aws logs tail <group> --follow
dig <host>                              # resolve → connect → TLS → HTTP, in that order
nc -zv <host> <port>
curl -v https://host/path
terraform plan                          # read-only; shows drift
```

Record every result — **a ruled-out hypothesis is progress**, and writing it down stops you
re-testing it at hour three.

---

## Step 7 — IDENTIFY ROOT CAUSE

The root cause must explain **all** observations, including the timing and any oddities. If
something doesn't fit, you have found *a* cause, not *the* cause.

Ask "why" past the first answer:

> The pod OOMed → because the limit was 256Mi → because it was copied from another service →
> because there is no sizing guidance and no alert on memory saturation.

The last answer is what prevention acts on.

Distinguish:
- **Trigger** — what set it off (the 14:31 deploy)
- **Underlying cause** — what made it possible (no memory headroom since launch)
- **Contributing factors** — what made it worse or slower to find (no alert, no correlation IDs)

Both trigger and underlying cause need addressing. They get different fixes.

---

## Step 8 — REMEDIATE

**Apply the smallest safe fix.**

Present before acting:
- **What to change**, exactly
- **Why this addresses the root cause** — tied to the evidence
- **Risk and blast radius**, including whether it causes downtime
- **How to undo it**
- **Whether this is a fix or a mitigation** — be honest

Prefer: reversible over permanent · narrowly scoped over broad · verifiable over hopeful ·
configuration over code · a known-good rollback over a novel hotfix written under pressure.

**Get approval before anything that changes state.** For anything destructive, restate what
cannot be undone.

> A hotfix written during an incident has had no review, no tests, and no staging. It is
> sometimes correct and always higher-risk than a rollback. Say so when proposing one.

Change **one thing at a time**, and verify between changes.

---

## Step 9 — VALIDATE

Confirm recovery **by the same method that showed the failure**.

| Check | Confirms |
|---|---|
| Original symptom gone | Measured the same way it was detected |
| Error rate back to baseline | Not just "no new errors in the last minute" |
| Latency back to baseline | Including p95/p99, not just p50 |
| Health checks green | Load balancer and orchestrator |
| No new errors elsewhere | The fix did not break something adjacent |
| Backlog drained | Queues, DLQs, retries caught up |
| Alarms returned to OK | Not INSUFFICIENT_DATA |

Watch for a sensible window before declaring recovery — many incidents recur within minutes.
**State plainly if you could not fully verify something.**

---

## Step 10 — RECOVER

Return to normal operation:

- Undo temporary mitigations (scaled-up capacity, disabled features, rate limits) — **deliberately,
  one at a time, watching each**
- Reconcile any manual changes back into Terraform, or the next `plan` will show drift and the
  fix will be silently reverted on the next apply
- Process anything that queued or failed during the incident — retries, DLQ messages, missed jobs
- Verify data integrity if data paths were involved
- Confirm backups are still running and the schedule was not disrupted
- Stand down: state clearly that the incident is resolved, and what remains open

Record the **end time**.

---

## Step 11 — POSTMORTEM

Write it while it is fresh — within 48 hours. **Blameless**: the goal is a system that fails less,
not a person to attribute it to. Systems that allow a single mistake to cause an outage are the
finding.

### Postmortem structure

```markdown
# Incident — <short title>

**Date:** <date> · **Severity:** P_ · **Duration:** <detected → resolved>
**Status:** resolved / monitoring

## Summary
Two or three sentences a non-engineer could follow: what broke, who was affected, what fixed it.

## Impact
- Users affected: <how many, which segment>
- Functionality lost: <what, exactly>
- Duration of user-visible impact: <not the same as incident duration>
- Data loss: none / <what>
- Financial or contractual impact: <if known>

## Timeline
| Time (UTC) | Event |
|---|---|
| 14:31 | Deploy of `abc123` to production |
| 14:36 | Error rate alarm fired |
| 14:41 | Investigation began |
| 14:52 | Rolled back to `def456` — service restored |
| 15:30 | Root cause identified |

Include: when it actually started · when it was **detected** (the gap is a monitoring finding) ·
when investigation began · each significant action · when impact ended · when it was resolved.

## Root cause
The trigger, the underlying cause, and the contributing factors. Written so someone who was not
there can understand the mechanism.

## Resolution
What actually fixed it, and whether that was a fix or a mitigation still needing follow-up.

## What went well
Detection speed, a rollback that worked, a runbook that helped. Name it — this is what to
reinforce.

## What went badly
Slow detection, missing logs, an unclear runbook, an alert nobody saw, a rollback that had never
been practiced.

## Where we got lucky
The near-misses. *"The backup would not have restored; we did not need it."* This section
routinely surfaces the next incident.

## Action items
| # | Action | Type | Owner | Priority | Status |
|---|---|---|---|---|---|
| 1 | | detect / prevent / mitigate / diagnose | | P_ | |
```

**Action items must be specific and owned.** "Improve monitoring" is not an action item; "add a
CloudWatch alarm on `MemoryUtilization > 85%` for the api service, routed to email" is.

---

## Step 12 — PREVENT RECURRENCE

Every incident should produce at least one improvement in each category where a gap existed:

| Category | Question | Routes to |
|---|---|---|
| **Detect** | What would have caught this sooner? Which alarm was missing? How long was the gap between start and detection? | `monitoring` |
| **Prevent** | What would have stopped it? A resource limit, a validation, a CI gate, a policy, a different default | `cicd` · `terraform` · `security` |
| **Mitigate** | What would have made recovery faster? A practiced rollback, a feature flag, a runbook, more headroom | `deployment` · `production-readiness` |
| **Diagnose** | What made this hard to investigate? Missing logs, no correlation IDs, an unhelpful error message, expired events | `monitoring` |

Also update:
- The **runbook** for this failure mode — the next person should not start from zero
- The **production readiness checklist** if this exposed a gap the checklist did not catch
- **Alert thresholds**, if the alert fired late, not at all, or too noisily to be noticed

**Track action items to completion.** A postmortem whose actions are never done is a document
that describes the next incident.

---

## Exit Condition

The workflow ends when:
1. Service is verified recovered and temporary mitigations are removed
2. The postmortem is written
3. Action items are recorded with owners and priorities

**If the incident revealed a production-readiness gap, re-run
`.claude/workflows/production-readiness.md`** — an incident is evidence the assessment missed
something, and the same gap likely exists elsewhere.

**Nothing destructive happens in this workflow without explicit approval — including, and
especially, under pressure.**
