---
description: Show the agent queue - what needs the human, what is stale, and every open job
---

Run `${CLAUDE_PLUGIN_ROOT}/bin/q board` and summarize it: first the jobs that need the human (proposed, or with a needs_vento question), then stale claims, then open jobs grouped by status with their PR and ticket. Keep it to what fits on one screen.
