import type { Register } from 'claude-code'

/**
 * After every turn, touch the queue job whose worktree holds this session's cwd.
 * Sessions outside a job worktree are a no-op, so the dispatcher is unaffected.
 */
export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const cwd = await $.session.cwd()
    await $.process.run([`${$.plugin.root}/bin/q`, 'heartbeat', '--cwd', cwd], { timeoutMs: 10_000 })
    return result
  }).catch(($, e, next) => next(e))
}
