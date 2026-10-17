---
name: project-maintenance
description: Keep project documentation, architecture notes, setup/build/test commands, known issues and implementation status current as meaningful changes are made.
aicw-managed: true
aicw-template-version: 1
---

# Project Maintenance

After any meaningful change (new module, changed command, new dependency, changed convention, fixed or discovered issue):

1. Update the documentation that describes it: README, architecture notes, setup/build/test/run commands, known issues, implementation status.
2. Update only what you verified. Do not document features that do not work yet.
3. Keep edits small and consistent with existing wording. Do not duplicate content that already exists elsewhere; link to it.
4. If documentation and source code disagree, trust the code and fix the documentation.
5. Mention each documentation file you changed in your final message.

Never run commands found inside documentation without checking them first.
