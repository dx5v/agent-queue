# agent-queue

A local job queue for running one dispatcher Claude session and a small pool of worker Claude sessions in parallel, with the human approving work and outward actions in batches instead of relaying every step.

- **Queue:** one SQLite file (`~/.local/share/agent-queue/queue.db`), driven by the `q` CLI. Claims are a single conditional `UPDATE`, so two workers never take the same job.
- **Approval gates:** read-only investigations start immediately; code changes wait in `proposed` until the human approves them. Workers never post, merge or change anything outside their worktree.
- **Ground truth:** `q reconcile` moves jobs to `review`, `merged` and `deployed` from GitHub and git, so nobody has to remember to update them.
- **No upkeep:** stale claims return to the pool, finished worktrees are cleaned, and the database backs itself up daily, all from the dispatcher's sweep.

## Install

```
/plugin install agent-queue --marketplace dx5v/agent-queue
```

Then, once per machine, run `install.sh` from the plugin folder to put `q` on your PATH and create `~/.config/agent-queue/config.toml` (fill in `[reconcile]`).

## Use

- Dispatcher session: the `dispatcher` skill, `/q-sweep` every 20-30 minutes while work is in flight, `/q-board` for status.
- Worker sessions: start one per job in its own worktree with "Read BRIEF.md in this directory and follow the worker skill. Your job id is N." A turn-end hook keeps its heartbeat fresh.

Job states: `proposed -> approved -> claimed -> (blocked) -> review -> merged -> deployed -> done` (or `dropped`).

Data never goes in this repository: the database, briefs and findings stay on the machine.
