# Security Policy

## Deployment model

Shire is **local-first by design**. The API and UI have **no authentication** — they are meant
to run on your own machine or a trusted private network.

- Do **not** expose ports `3000` (UI) or `8000` (API) to the public internet.
- Git provider credentials you store (tokens, SSH keys) are encrypted at rest with
  `SHIRE_SECRET_KEY` (Fernet). Keep your `.env` private and back the key up — rotating or
  losing it orphans the stored credentials.
- Agent jobs run the Claude Code CLI headlessly with an explicit tool allowlist (read-only by
  default; roadmap execution gets Edit/Write inside a disposable git worktree, never Bash), and
  with `--setting-sources ""` so an analyzed repository can never inject Claude settings or
  hooks into a run.

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/dardanxh/shire/security/advisories/new) —
do not open a public issue. You should get a response within a few days.
