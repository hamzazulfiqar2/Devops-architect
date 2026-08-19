#!/usr/bin/env python
"""
PostToolUse hook — enforces .claude/rules/security.md rule 1 (never hardcode
secrets) at the moment a file is written.

Scans the file that was just written or edited for credential-shaped literals.
If any are found, blocks with a reason fed back to Claude so it can fix the file
immediately, and shows the user a message.

Patterns are deliberately TIGHT (full expected length, real prefixes) so the
redaction examples used throughout this repo — AKIA****************,
ghp_xxxxxxxxxxxx, glsa_... — do not trigger it.

No jq dependency — this machine does not have it.
"""

import json
import os
import re
import sys

PATTERNS = [
    (r"AKIA[0-9A-Z]{16}",                              "AWS access key ID"),
    (r"ASIA[0-9A-Z]{16}",                              "AWS temporary access key ID"),
    (r"aws_secret_access_key\s*[:=]\s*['\"]?[A-Za-z0-9/+=]{40}", "AWS secret access key"),
    (r"ghp_[A-Za-z0-9]{36}",                           "GitHub personal access token"),
    (r"gho_[A-Za-z0-9]{36}",                           "GitHub OAuth token"),
    (r"github_pat_[A-Za-z0-9_]{60,}",                  "GitHub fine-grained PAT"),
    (r"glsa_[A-Za-z0-9]{32,}",                         "Grafana service account token"),
    (r"xox[baprs]-[A-Za-z0-9-]{20,}",                  "Slack token"),
    (r"sk-[A-Za-z0-9]{32,}",                           "API secret key (OpenAI-style)"),
    (r"-----BEGIN [A-Z ]*PRIVATE KEY-----",            "private key"),
    (r"(?i)\b(password|passwd|pwd)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]", "hardcoded password"),
    (r"(?i)\bBearer\s+[A-Za-z0-9_\-\.]{40,}",          "bearer token"),
]

# Files where credential-shaped strings are expected documentation, not secrets.
SKIP_SUFFIXES = (".example", ".sample", ".template")

# Test files for THIS scanner necessarily contain secret-shaped fixtures.
# A narrow, deliberate exemption: without it the scanner cannot be tested.
# Trade-off accepted — a real secret hidden in a file named test_* would be
# missed here, and is caught instead by the pre-commit review and .gitignore.
SKIP_BASENAMES = ("test_hooks.py",)
SKIP_PREFIXES = ("test_",)


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        sys.exit(0)  # fail open

    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    path = (
        tool_response.get("filePath")
        or tool_input.get("file_path")
        or ""
    )

    base = os.path.basename(path)
    if (
        not path
        or path.endswith(SKIP_SUFFIXES)
        or base in SKIP_BASENAMES
        or base.startswith(SKIP_PREFIXES)
        or not os.path.isfile(path)
    ):
        sys.exit(0)

    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            lines = fh.readlines()
    except Exception:
        sys.exit(0)

    findings = []
    for lineno, line in enumerate(lines, 1):
        for pattern, label in PATTERNS:
            if re.search(pattern, line):
                findings.append("  {}:{} — {}".format(os.path.basename(path), lineno, label))
                break  # one finding per line is enough

    if not findings:
        sys.exit(0)

    detail = "\n".join(findings[:10])
    if len(findings) > 10:
        detail += "\n  ... and {} more".format(len(findings) - 10)

    reason = (
        "SECRET DETECTED in the file you just wrote — security.md rule 1 "
        "(never hardcode secrets) has NO exception process.\n\n"
        + detail
        + "\n\nRemove the literal and reference the value at runtime instead "
        "(Secrets Manager / SSM by ARN, or an environment variable from an "
        "untracked file). If this value is real and was ever committed, it is "
        "COMPROMISED — it must be ROTATED, not merely deleted. "
        "Report location and type to the user; never echo the value."
    )

    print(json.dumps({
        "decision": "block",
        "reason": reason,
        "systemMessage": "⚠  Secret-shaped literal written to {} — see the block reason.".format(
            os.path.basename(path)
        ),
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
