#!/usr/bin/env python
"""
Regression suite for the safety hooks.

    python .claude/hooks/test_hooks.py

Run this after editing block_destructive.py or scan_secrets.py. Exit 0 = all
pass. A hook that silently stops matching is worse than no hook.

Cases live in this file rather than on a command line on purpose: a shell
command containing "terraform destroy" would be intercepted by the very hook
under test.
"""

import json
import os
import subprocess
import sys
import tempfile

HOOKS = os.path.dirname(os.path.abspath(__file__))
DENY, ASK, PASS = "deny", "ask", None

COMMAND_CASES = [
    # ---- must DENY: commands the user runs themselves -------------------
    (DENY, "terraform destroy",                                     "bare destroy"),
    (DENY, "terraform destroy -auto-approve",                       "destroy with flag"),
    (DENY, "terraform state rm aws_db_instance.main",               "state rm"),
    (DENY, "terraform force-unlock 1234",                           "force-unlock"),
    (DENY, "kubectl delete pod foo -n default",                     "kubectl delete"),
    (DENY, "kubectl drain node-1",                                  "kubectl drain"),
    (DENY, "helm uninstall my-release",                             "helm uninstall"),
    (DENY, "docker system prune -af",                               "docker prune"),
    (DENY, "docker volume rm data",                                 "volume rm"),
    (DENY, "aws rds delete-db-instance --db-instance-identifier x", "aws delete-*"),
    (DENY, 'aws s3 rm "s3://my-bucket/path"',                       "aws s3 rm, quoted arg"),
    (DENY, "rm -rf /",                                              "rm -rf root"),

    # ---- must ASK: allowed with explicit approval, never silent ---------
    (ASK,  "terraform apply tfplan",                                "terraform apply"),
    (ASK,  "kubectl apply -f k8s/",                                 "kubectl apply"),
    (ASK,  "kubectl rollout restart deployment/api",                "rollout restart"),
    (ASK,  "helm upgrade api ./chart",                              "helm upgrade"),
    (ASK,  "aws iam attach-role-policy --role-name r",              "IAM change"),
    (ASK,  "aws ec2 authorize-security-group-ingress --group-id g", "security group change"),
    (ASK,  "git push --force origin main",                          "force push"),
    (ASK,  "git reset --hard HEAD~1",                               "reset --hard"),

    # ---- must PASS: read-only, or the words appear only as TEXT ---------
    (PASS, 'git commit -m "docs: never run terraform destroy"',     "commit msg mentions it"),
    (PASS, 'git commit -m "note: \\"kubectl delete\\" is blocked"',  "escaped quotes in msg"),
    (PASS, "echo 'kubectl delete is blocked by hooks'",             "echo mentions it"),
    (PASS, "grep -rn 'terraform destroy' .claude/",                 "grep for the string"),
    (PASS, "terraform plan -out=tfplan",                            "terraform plan"),
    (PASS, "terraform validate",                                    "terraform validate"),
    (PASS, "kubectl get pods -o wide",                              "kubectl get"),
    (PASS, "kubectl describe pod foo",                              "kubectl describe"),
    (PASS, "docker ps -a",                                          "docker ps"),
    (PASS, "docker history myimage",                                "docker history"),
    (PASS, "aws ecr describe-images --repository-name app",         "aws describe"),
    (PASS, "aws sts get-caller-identity",                           "sts identity"),
    (PASS, "rm -rf ./node_modules",                                 "rm -rf relative path"),
    (PASS, "git status",                                            "git status"),

    # ---- edge: a real command chained after quoted text ----------------
    (DENY, 'git commit -m "safe" && terraform destroy',             "CHAINED real destroy"),
]

SECRET_CASES = [
    (True,  'access_key = "AKIA' + "IOSFODNN7EXAMPLE" + '"',        "AWS access key"),
    (True,  'token = "ghp_' + "a" * 36 + '"',                       "GitHub PAT"),
    (True,  "-----BEGIN RSA PRIVATE KEY-----",                      "private key"),
    (False, 'storage_encrypted = true',                             "clean terraform"),
    (False, "Redact as AKIA****************",                       "redaction example"),
    (False, 'token = "${GITHUB_PERSONAL_ACCESS_TOKEN}"',            "env var reference"),
    (False, "ghp_xxxxxxxxxxxx is a placeholder",                    "short placeholder"),
]


def run(script, payload):
    return subprocess.run(
        [sys.executable, os.path.join(HOOKS, script)],
        input=json.dumps(payload), capture_output=True, text=True,
    ).stdout.strip()


def main():
    fails = 0

    print("== block_destructive.py ==")
    for expect, cmd, label in COMMAND_CASES:
        out = run("block_destructive.py", {"tool_name": "Bash", "tool_input": {"command": cmd}})
        got = json.loads(out)["hookSpecificOutput"]["permissionDecision"] if out else None
        ok = got == expect
        fails += 0 if ok else 1
        print("  %-4s expect=%-5s got=%-5s  %s" % (
            "ok" if ok else "FAIL", expect or "pass", got or "pass", label))

    print("\n== scan_secrets.py ==")
    for should_block, content, label in SECRET_CASES:
        fd, path = tempfile.mkstemp(suffix=".tf")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content + "\n")
            out = run("scan_secrets.py", {
                "tool_name": "Write",
                "tool_input": {"file_path": path},
                "tool_response": {"filePath": path},
            })
            blocked = bool(out)
            ok = blocked == should_block
            fails += 0 if ok else 1
            print("  %-4s expect=%-7s got=%-7s  %s" % (
                "ok" if ok else "FAIL",
                "block" if should_block else "clean",
                "block" if blocked else "clean", label))
        finally:
            os.unlink(path)

    total = len(COMMAND_CASES) + len(SECRET_CASES)
    print("\n%d/%d passed" % (total - fails, total))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
