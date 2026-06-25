---
description: "Pick a random unchecked TODO from README.md and implement it end-to-end. Use when you want to make autonomous progress on the backlog."
agent: "agent"
---

Read the **Project TODO** section of [README.md](../../README.md) and collect every item that is **not** checked off (i.e. lines beginning with `- [ ]`).

Pick a high priority one.

Then implement it fully:

1. Read the layer-specific instruction files before touching any `domain/`, `data/`, or `ui/` files.
2. Follow all rules in [copilot-instructions.md](../.github/copilot-instructions.md) and the repo's custom instructions.
3. Make the change, add or update tests as needed, and run `python scripts\dev.py` to verify nothing is broken.
4. Once all checks pass, mark the item as done in `README.md` by changing `- [ ]` to `- [x]`.
5. Commit your changes with a clear message describing what was implemented.

Be surgical — only change what is needed to implement the chosen TODO item. Do not tackle multiple TODOs in one run.
