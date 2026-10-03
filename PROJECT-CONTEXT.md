# JPLearn: shared project context

**This is a shared entry point for Claude, Codex and OpenCode.** Curated on 2026-10-03 from current repository files and selected Claude project memories. Read the root and applicable scoped instructions first. This document does not replace them, grant new task scope or assert current feature completion.

**Electron/React/TypeScript Japanese-learning desktop app with a Python learning/persistence backend.**

**Read AGENTS.md and CLAUDE.md, then ARCHITECTURE.md and the relevant scoped instructions.** main.py is deprecated; electron-frontend is the supported interactive surface.

**Use .venv/Scripts/python.exe for backend checks from a fresh Windows shell.** Claude memory reports that ambient Python may be unrelated and fail compiled dependencies; check the project environment before installing anything.

**Frontend commands run in electron-frontend.** Use ui-build then start-app for the selected checkout; the fixed-port development launcher can attach to another workspace, so it is not exposed here. domain is pure learning logic; data owns persistence/normalization; scripts/desktop_bridge.py is the Python IPC boundary.

**Claude feedback for authored-world menu mockups forbids hiding/replacing authored meshes without approval.** Treat that as a constraint on that art workflow, not a blanket ban on unrelated UI changes. Read the relevant current handoff before art work.

**A plan or old memory note is not proof of what is implemented.** Existing instructions govern plan.md retention and task scope. UI verification needs the app actually launched/observed, not just a Vite build.

## Evidence and maintenance

**Repository source was inspected in a checkout based on 7d9007c6a0fa.** Sources: `AGENTS.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `electron-frontend/package.json`, `scripts/dev.py`. This names the checkout base, not a claim that every inspected working file was committed there. Read current versions when acting; the source wins over this summary.

**Selected Claude memory informed the context above.** `jplearn-python-venv.md`, `authored-world-inviolable.md`. These are historical source notes; tool/architecture claims were checked against the listed repository files where possible. Browser/device and remote-runner observations were not re-tested. Old task status, artifact URLs, credentials and private session notes were not imported.

**Keep one shared copy.** All harnesses read this file from the repository. Add durable verified facts or approved decisions within the active task scope, recording source and date; use existing decision registers for design decisions. Current task progress belongs in its explicit handoff. Read only a handoff supplied for the task and your own scratch note, never another agent's private notes. Do not rewrite native Claude/Codex memory stores to synchronize them.
