#!/usr/bin/env python
"""
PreToolUse hook — converts the destructive-command rules in .claude/rules/
from prose into enforcement.

Reads the hook payload on stdin. Emits a PreToolUse permission decision:

  deny  — commands that .claude/rules/production-rules.md says the USER types
          themselves. The agent must never run these, even after approval.
  ask   — commands that may proceed WITH explicit approval, but must never
          happen silently. Forcing "ask" here means they still prompt even if
          the permission allowlist is later broadened or a relaxed permission
          mode is active.

Everything else falls through untouched (exit 0, no output).

No jq dependency — this machine does not have it.
"""

import json
import re
import sys

# ---------------------------------------------------------------- DENY
# "A command the user types themselves." Orphans, destroys, or is
# catastrophic and irreversible.
DENY = [
    (r"\bterraform\s+destroy\b",
     "terraform destroy — production-rules.md rule 2: this is a command YOU type "
     "yourself, after seeing exactly what disappears."),

    (r"\bterraform\s+state\s+(rm|mv)\b",
     "terraform state rm/mv — can orphan or destroy real resources. "
     "production-rules.md 'Actions That Always Require Approval'."),

    (r"\bterraform\s+(taint|untaint|force-unlock|import)\b",
     "terraform taint/force-unlock/import — mutates state directly. "
     "force-unlock during a live apply causes the corruption locking prevents."),

    (r"\bkubectl\s+delete\b",
     "kubectl delete — production-rules.md rule 3. Deleting a PVC also deletes "
     "the underlying data. Run it yourself if you intend it."),

    (r"\bkubectl\s+(drain|cordon)\b",
     "kubectl drain/cordon — evicts workloads. Without a PodDisruptionBudget "
     "this can take every replica down at once."),

    (r"\bhelm\s+(uninstall|delete)\b",
     "helm uninstall — removes a release and its resources."),

    (r"\bdocker\s+system\s+prune\b",
     "docker system prune — production-rules.md 'Delete' category."),

    (r"\bdocker\s+volume\s+(rm|prune)\b",
     "docker volume rm/prune — this is data deletion."),

    # AWS uses several verbs for "destroy". delete-* is only one of them:
    # EC2 says terminate-, AMIs say deregister-, SQS says purge-, and ECR
    # nests it as batch-delete-. All are irreversible resource destruction.
    (r"\baws\s+\S+\s+(batch-)?(delete|terminate|purge|deregister)",
     "aws delete/terminate/purge/deregister — production-rules.md rule 3: never "
     "destroy a resource without explicit approval. Run it yourself if you intend it."),

    (r"\baws\s+kms\s+(schedule-key-deletion|disable-key)\b",
     "KMS key deletion/disable — every object encrypted with this key becomes "
     "PERMANENTLY unrecoverable. There is no undo after the waiting period."),

    (r"\baws\s+s3\s+(rm|rb)\b",
     "aws s3 rm/rb — deletes objects or a bucket."),

    (r"\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+(/|~|/\*|\$HOME|[A-Za-z]:[\\/])(\s|$)",
     "rm -rf on a root or home path — catastrophic and irreversible."),
]

# ---------------------------------------------------------------- ASK
# May proceed with explicit per-action approval. Must never be silent.
ASK = [
    (r"\bterraform\s+apply\b",
     "terraform apply — requires the Deploy Brief and explicit approval for THIS "
     "apply (production-rules.md rules 1 and 11). Confirm the plan was reviewed "
     "and you are applying the exact saved plan file."),

    (r"\bkubectl\s+(apply|patch|replace|scale|edit)\b",
     "kubectl write operation — confirm the target context first "
     "(kubectl config current-context) and that this is not production."),

    (r"\bkubectl\s+rollout\s+(restart|undo)\b",
     "kubectl rollout restart/undo — changes running workloads."),

    (r"\bhelm\s+(install|upgrade)\b",
     "helm install/upgrade — deploys or changes a release."),

    (r"\baws\s+iam\s+(create|put|attach|detach|update|delete|remove)",
     "IAM change — production-rules.md 'Identity' category. IAM changes are a "
     "security boundary."),

    (r"\baws\s+ec2\s+(authorize|revoke)-security-group",
     "security group change — production-rules.md rule 4. State what "
     "connectivity is LOST, not just gained."),

    (r"\baws\s+(ecs\s+update-service|eks\s+update|lambda\s+update-function-code)\b",
     "deployment command — requires the Deploy Brief and explicit approval."),

    # Disruptive but not destructive: causes downtime, can force replacement, or
    # detaches storage. Allowed with approval — never silently.
    (r"\baws\s+\S+\s+(stop|reboot|modify|detach|release|disable)-",
     "aws stop/reboot/modify/detach/release — disruptive. Stopping or rebooting "
     "causes downtime; many modify-* calls force resource replacement. Confirm the "
     "target and check the blast radius first."),

    (r"\bgit\s+push\b.*(--force|-f\b)",
     "git push --force — rewrites remote history."),

    (r"\bgit\s+reset\s+--hard\b",
     "git reset --hard — discards local changes irreversibly."),

    (r"\bsecretsmanager\s+(put-secret-value|rotate-secret|delete-secret)\b",
     "secret rotation/deletion — production-rules.md 'Actions That Always "
     "Require Approval'."),
]


HEREDOC = re.compile(r"<<-?\s*['\"]?(\w+)['\"]?.*?^\1\s*$", re.DOTALL | re.MULTILINE)
# Single quotes: no escapes in shell. Double quotes: backslash escapes, so a \"
# does NOT terminate the string — handling this matters, or text after an
# escaped quote leaks out and produces false positives.
QUOTED = re.compile(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"")


def executable_part(command):
    """Strip heredoc bodies and quoted strings before matching.

    A commit message, an echo, or a --description argument can legitimately
    CONTAIN the words "terraform destroy" without executing anything. Only the
    unquoted portion of the command line is actually run, so that is what the
    patterns are matched against.

    Safe for these patterns because the command VERB is never quoted in a real
    invocation: `aws s3 rm "s3://bucket"` still matches on `aws s3 rm`.
    """
    stripped = HEREDOC.sub(" ", command)
    stripped = QUOTED.sub(" ", stripped)
    return stripped


def decide(decision, reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # fail open on a malformed payload; never block the session

    command = (payload.get("tool_input") or {}).get("command") or ""
    if not command:
        sys.exit(0)

    target = executable_part(command)

    for pattern, reason in DENY:
        if re.search(pattern, target, re.IGNORECASE):
            decide("deny", "BLOCKED by .claude/hooks — " + reason)

    for pattern, reason in ASK:
        if re.search(pattern, target, re.IGNORECASE):
            decide("ask", "APPROVAL REQUIRED — " + reason)

    sys.exit(0)


if __name__ == "__main__":
    main()
