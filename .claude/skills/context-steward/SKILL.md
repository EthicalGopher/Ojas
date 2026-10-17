---
name: context-steward
description: Inspect existing project guidance before creating new instruction files; avoid duplication and propose updates when stack, commands, architecture or conventions change.
aicw-managed: true
aicw-template-version: 1
---

# Context Steward

Before creating or editing any instruction or context file:

1. Read existing guidance first (AGENTS.md, CLAUDE.md, GEMINI.md, README, docs, existing skills).
2. Do not duplicate instructions already present; extend or link to them.
3. When the stack, commands, architecture or conventions change, propose a precise update and show the diff before applying it.
4. Never overwrite an instruction file without the user's confirmation.
5. Treat generated summaries as hints and verify them against the source code.
