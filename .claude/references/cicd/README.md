# CI/CD References — Index

Factual reference for pipeline work. **Method lives in `skills/cicd/`; process lives in
`workflows/ci-cd.md`; output shape lives in `templates/cicd.md`. This directory holds only what
is *true*** — syntax, contexts, limits, and the behaviours that surprise people.

| File | Covers |
|---|---|
| `github-actions.md` | Workflow syntax, triggers, contexts, expressions, matrix, concurrency, caching, artifacts, service containers, runners, and platform limits |

---

## Where To Look For What

| Question | Layer |
|---|---|
| *"What should my pipeline do, in what order?"* | `workflows/ci-cd.md` |
| *"How do I design a pipeline for this project?"* | `skills/cicd/` |
| *"What is the exact YAML for a matrix build?"* | **here** |
| *"What does `github.ref` contain on a PR?"* | **here** |
| *"How long can a job run before it's killed?"* | **here** |
| *"What must never happen?"* | `rules/security.md`, `rules/production-rules.md` |
| *"What does the finished document look like?"* | `templates/cicd.md` |

---

## The Mental Model

A GitHub Actions run is three nested things, and most confusion comes from mixing them up:

```
Workflow   one .yml file · triggered by an event · has its own permissions
  └─ Job   runs on ONE runner · isolated filesystem · parallel by default
       └─ Step   one command or one action · shares the job's filesystem
```

**Jobs do not share a filesystem.** Anything a job builds is gone unless it is uploaded as an
artifact or pushed to a registry. This is the single most common surprise — a `build` job
produces a `dist/` folder and the `deploy` job cannot see it.

**Steps within a job do share** the filesystem and the working directory.

---

## The Four Facts That Cause Most Bugs

1. **Jobs are isolated.** Pass data between them with `actions/upload-artifact` +
   `download-artifact`, or job `outputs` — never by assuming a file exists.
2. **`needs:` is what makes jobs sequential.** Without it, every job starts at once.
3. **Secrets are not available to workflows triggered by forked PRs.** By design. Do not work
   around it.
4. **`GITHUB_TOKEN` permissions default to whatever the repository setting says** — declare
   `permissions:` explicitly in every workflow instead of inheriting.
