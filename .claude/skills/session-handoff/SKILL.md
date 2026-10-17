---
name: session-handoff
description: Before a session ends, record verified progress, files changed, tests actually run with results, unresolved issues and next steps.
aicw-managed: true
aicw-template-version: 1
---

# Session Handoff

Before ending a session or after a major task, write a handoff note covering:

- **Verified progress**: what is done and how you confirmed it.
- **Files changed**: paths only, no speculation.
- **Tests actually run**: the exact commands and the real results. If you did not run tests, say so; never imply they passed.
- **Unresolved issues**: failing checks, open questions, risks.
- **Next steps**: ordered and concrete.

Save it where the project keeps session notes (for example `.aicw/sessions/` or `docs/`) and tell the user where it is. Do not include secrets.
