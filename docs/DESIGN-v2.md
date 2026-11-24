# agent-queue v2: close the loop

Status: draft for discussion. Nothing here is implemented yet.

## Why

v0.1 runs one dispatcher session and a pool of worker sessions over a shared SQLite queue. It works, but the human is still the loop. After a few weeks of running 10–15 workers on one project, four problems stand out.

1. **Nothing reacts to state changes.** CI goes red, a PR picks up a conflict or a review comment, a PR merges, a release ships. None of these wake anyone. The human notices, types "status" or "relay the fix comment", and only then does the dispatcher route the event to the worker that owns the PR. `q reconcile` exists, but it only moves job status. It runs when someone remembers, and it never hands work back to a worker.
2. **Work starts before it is defined.** Jobs begin without the critical user flows, acceptance criteria, external constraints or a verification plan. The gaps show up later as rework: a third-party requirement arrives after the form is built, a manual test finds a double submit, a reviewer finds the button on the wrong rows. "Done" means "PR opened", not "shipped and verified".
3. **One job shape for different kinds of work.** An investigation, a code change, a production change and an outbound message have different inputs, steps, outputs and human gates. Today they share one template, so each one mixes in steps from another: an investigation proposes code in passing, or a code job quietly includes a flag flip.
4. **One inbound item fans out into several problems, and the human dispatches each one.** A single customer thread can reveal five separate causes. Today the human splits it, the dispatcher spawns jobs, those jobs propose follow-ups, and the follow-ups spawn more jobs. The tree lives in chat history, and every branch needs another human decision.

There is also a trust problem underneath all four. The dispatcher believes what workers report ("kept as draft", "upgrade done") instead of what it can check (the PR's draft flag, CI, git, logs).

## Goals

- The human is needed only for **decisions**: approvals (ready, merge, production changes, outbound messages), copy/design sign-off, and real trade-offs. Not for noticing events or relaying them.
- Every job has a written definition before work starts, and "done" includes verification where the change actually runs.
- Different kinds of work follow different state machines with explicit human gates.
- One inbound item becomes one triage step, one batch of decisions, and a flat set of jobs.
- The dispatcher acts only on state it can observe.

Non-goals: a web UI; multi-machine queues; replacing GitHub review.

## Design

### 1. Event loop (close the loop)

A watcher turns external state changes into queue events and routes each event to the owning worker. It can start as polling every few minutes via `gh` and `git`, and move to GitHub webhooks later.

| Event | Detected from | Routed action |
|---|---|---|
| CI check failed (excluding a configurable list of known infra checks) | `gh pr checks` | Owning worker: reproduce and fix |
| PR became conflicting | `gh pr view --json mergeable` | Owning worker: merge the base branch and resolve |
| New unresolved review thread | GraphQL `reviewThreads` | Owning worker: fix, reply inline, resolve |
| PR draft flag changed by someone other than the expected actor | timeline events | Decision inbox: "PR flipped to ready by X, keep?" |
| PR merged | `gh pr view` | Job → `merged`; worker released; dependent jobs unblocked |
| Merge commit reached a production tag | `git merge-base --is-ancestor` per product's release ref | Job → `deployed`; start the job's verify step |
| Worker idle with an undelivered message | pane state / heartbeat | Re-deliver, or flag the worker as stuck |

Rules:
- Each event is idempotent (keyed by PR, event type and head SHA or thread id), so the watcher can rerun safely.
- Routing goes to the worker that owns the job. If that worker is gone, the watcher starts a replacement in the same worktree with the job's history.
- Release refs are per product (several products in one repo ship from different refs or tag patterns). v0.1 assumes one `release_ref`.

### 2. Job definitions before work starts

A job cannot move from `proposed` to `approved` until its definition has these fields. The dispatcher drafts them; the human approves them.

- **Problem**: what is wrong or missing, and why it matters.
- **Critical user flows**: who does what where, and what they should see. These become test cases.
- **Acceptance criteria**: observable outcomes, not "code written".
- **Boundaries**: what is out of scope, and the external constraints (third-party requirements, freezes, flags, migrations).
- **Verification plan**: where it is verified (local, preview, production) and with what data.
- **Definition of done**: for code, merged, deployed and verified in the target environment, with flags in the intended state.

### 3. Typed jobs

| Type | Input | Steps | Output | Human gates |
|---|---|---|---|---|
| `investigate` | a question | timeboxed; evidence labelled verified or inferred | findings plus explicit decisions needed | decide what to do next |
| `code` | an approved definition | implement → PR → CI → review → merge → deploy → verify | a shipped, verified change | ready, merge, copy/design sign-off |
| `ops` | one production change | read before → change → read after; rollback noted | change record | approval for each change |
| `comms` | context and goal | draft only | a draft message | sending |
| `review` | a PR | read-only | findings | whether to post them |

An investigation never writes code. When it finds something to build, it proposes a `code` job with a draft definition. A code job never makes production changes; it proposes an `ops` job.

### 4. Intake and triage

An inbound item (a ticket, a Slack thread, a customer report) goes to a triage step, not straight to a worker.

- Triage splits the item into separate problems, matches each against existing jobs (dedupe), and proposes a set of typed jobs with draft definitions.
- The inbound item becomes an **incident** record with its own done criteria (for example, "customer unblocked and answered"). Every job links back to it. Jobs stay flat: follow-ups found later attach to the same incident instead of nesting under the job that found them.
- The human approves the triage batch once.

### 5. Decision inbox

Everything that needs the human goes into one list: approvals, sign-offs, outbound drafts and production changes. Each entry has a recommended default, the evidence, and how urgent it is. The dispatcher reports the inbox instead of mixing decisions into status prose. Entries that are answered are applied by the dispatcher and logged on the job.

### 6. Trust observable state

- Status that matters (draft or ready, CI, mergeable, merged, deployed, flag values, production rows) is always read from the source, never taken from a worker's report.
- Workers report what they changed and how they verified it. The dispatcher re-checks anything it passes on to the human.
- Facts in memory or findings carry a timestamp. Anything older than the current session is re-checked before it is repeated.

### 7. Resource limits

- A cap on concurrent workers, and on concurrent heavy steps (dependency installs, full typechecks).
- Disk headroom checked before starting a worker; finished worktrees cleaned after their PR merges, with findings archived first.
- A worktree is never removed while a job that references it is still open.

## Phased plan

1. **Watcher, polling version.** Run `reconcile` on a schedule, add the CI, conflict, review-thread and draft-flag detectors, and route them to owning workers. Make the release ref per product. This alone removes most "status" and "relay" turns.
2. **Typed jobs and definitions.** Add `type` and definition fields with validation on approve. Update the BRIEF and FINDINGS templates per type. Add the verify step after deploy for `code` jobs.
3. **Incidents, triage and the decision inbox.** Add an incident record, a triage command, and an inbox view on the board.
4. **Webhooks** in place of polling, if the polling cost or latency matters.

## Open questions

- Where the watcher runs: inside the dispatcher session (scheduled wakeups), or as a separate long-lived process.
- How much the watcher may do without asking. Merging the base branch into a draft PR seems safe; pushing to a ready PR under review may not be.
- How to describe "known infra checks" per repository, so they never trigger work.
- Whether verification in production needs its own job type, since it usually needs credentials the worker does not have.
