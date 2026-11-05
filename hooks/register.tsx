import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { QueueBoard, QueueJob } from '../types'

const PANE = 'agent-queue-board'
const REFRESH_MS = 15_000
let isPolling = false
const board = atom({ plugin: 'agent-queue', key: 'board' } as const, null, { shape: 'board-1' })

const ORDER = ['blocked', 'claimed', 'review', 'approved', 'proposed', 'merged', 'deployed']
const LABEL: Record<string, string> = {
  blocked: 'Blocked',
  claimed: 'Working',
  review: 'In review',
  approved: 'Queued',
  proposed: 'Awaiting approval',
  merged: 'Merged',
  deployed: 'Deployed',
}

/**
 * Turn `q board` JSON into the pane's state. Pure, so it is easy to test.
 */
export function toBoard(raw: string, now: string): QueueBoard {
  const parsed = JSON.parse(raw) as { jobs: QueueJob[]; needs_vento: QueueJob[]; stale: QueueJob[] }
  return {
    generatedAt: now,
    jobs: parsed.jobs,
    needsVento: parsed.needs_vento.filter(job => job.status !== 'proposed'),
    stale: parsed.stale.map(job => job.id),
    error: null,
  }
}

export const register: Register = on => {
  // After every turn, touch the queue job whose worktree holds this session's cwd.
  // Sessions outside a job worktree are a no-op, so the dispatcher is unaffected.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const cwd = await $.session.cwd()
    await $.process.run([`${$.plugin.root}/bin/q`, 'heartbeat', '--cwd', cwd], { timeoutMs: 10_000 })
    return result
  }).catch(($, e, next) => next(e))

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'q-pane', description: 'Show the agent queue in a live pane' })
    return next(e)
  })

  on('command.run', { command: 'q-pane' }, async $ => {
    const refresh = async () => {
      const ran = await $.process.run([`${$.plugin.root}/bin/q`, 'board'], { timeoutMs: 10_000 })
      const now = new Date().toISOString().slice(11, 19)
      await update($, board, previous =>
        ran.exitCode === 0
          ? toBoard(ran.stdout, now)
          : { ...(previous ?? { jobs: [], needsVento: [], stale: [] }), generatedAt: now, error: ran.stderr.trim().slice(0, 200) },
      )
    }
    await refresh()
    if (!isPolling) {
      isPolling = true
      $.clock.every(REFRESH_MS, refresh)
    }
    await $.ui.open({ id: PANE, title: 'Agent queue' })
    return { text: 'Agent queue pane opened. It refreshes every 15s.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const state = await read($, board)
    if (!state) return <Text dimColor>Loading the queue…</Text>

    const groups = ORDER.map(status => ({ status, jobs: state.jobs.filter(job => job.status === status) })).filter(
      group => group.jobs.length > 0,
    )
    const line = (job: QueueJob) => {
      const tags = [job.pr ? `#${job.pr}` : null, job.linear, job.owner ? `@${job.owner}` : null].filter(Boolean).join(' ')
      const stale = state.stale.includes(job.id) ? ' (stale)' : ''
      return `${String(job.id).padStart(3)}  ${job.title}${tags ? `  ${tags}` : ''}${stale}`
    }

    return (
      <Box flexDirection="column">
        <Text dimColor>
          Updated {state.generatedAt} UTC · {state.jobs.length} open
        </Text>
        {state.error && <Text color="red">q board failed: {state.error}</Text>}
        {state.needsVento.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="yellow">
              Needs you ({state.needsVento.length})
            </Text>
            {state.needsVento.map(job => (
              <Text>
                {String(job.id).padStart(3)}  {job.needs_vento}
              </Text>
            ))}
          </Box>
        )}
        {groups.map(group => (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>
              {LABEL[group.status] ?? group.status} ({group.jobs.length})
            </Text>
            {group.jobs.map(job => (
              <Text dimColor={group.status === 'merged' || group.status === 'deployed'}>{line(job)}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
