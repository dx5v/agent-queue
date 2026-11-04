---
description: Sweep the agent queue - reconcile from ground truth, release stale claims, and report what needs the human
---

Follow the Sweep section of the dispatcher skill. The queue CLI is at `${CLAUDE_PLUGIN_ROOT}/bin/q`.

Run, in order: `q reconcile`, `q release-stale`, `q board`. Then de-duplicate and verify any new proposed jobs, and send one short report only if something changed: decisions needed (numbered), what shipped, what is stuck, and outward-message drafts for jobs that reached review or deployed. If nothing changed, reply with a single line saying so.

Once a day (first sweep after midnight local time) also run `q backup` and `q gc --apply`.
