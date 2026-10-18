---
name: jplearn-release-github
description: JPLearn CI, packaging/release and GitHub issue procedures moved from root CLAUDE.md - why the GitHub workflows use a self-hosted Windows runner, their local equivalents (scripts/dev.py --full, npm run make:release, scripts/bundle_python.ps1), and the gh issue list/create commands for the repo. Use when building an installer or release, editing .github/workflows or scripts/bundle_python.ps1, asking whether CI ran or needs to, or listing/filing GitHub issues.
---

# JPLearn release, CI and GitHub

Moved verbatim from the root `CLAUDE.md` ("Commands" and "GitHub").

## CI workflows and their local equivalents

Both GitHub workflows target a self-hosted Windows runner (`runs-on: [self-hosted, windows]`)
because hosted Actions minutes are unavailable on this account — if no runner is registered
against the repo, they simply never start. Either way they have local equivalents, so neither
needs CI to run:
`python scripts/dev.py --full` covers every step of `electron-packaged-smoke.yml`, and
`npm run make:release` produces the same installer `release.yml` uploads (it calls
`scripts/bundle_python.ps1`, which the workflow also calls — keep the bundling logic
there rather than inline in the YAML).

## GitHub issues

```bash
gh issue list --repo NeedMeSomeAnimeTiddy/JPLearn --limit 5
gh issue create --repo NeedMeSomeAnimeTiddy/JPLearn --title "..." --body "..." --label "bug|refactor|enhancement"
```

`AGENTS.md` also describes the GitHub-issue-automation workflow (written for the `opencode`
harness; its tool names don't map 1:1 to Claude Code).
