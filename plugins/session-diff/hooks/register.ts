import type { EngineInterface, On } from 'claude-code'

type Snapshot = Map<string, string>

async function snapshot($: EngineInterface, cwd: string): Promise<Snapshot | null> {
  const result = await $.process.run(['node', 'hooks/snapshot.mjs', cwd], {
    cwd: $.plugin.root,
    timeoutMs: 15_000,
  })
  if (result.exitCode !== 0 || result.isStdoutTruncated) throw new Error('Snapshot failed')
  const entries: [string, string][] | null = JSON.parse(result.stdout)
  return entries === null ? null : new Map(entries)
}

function displayPath(path: string) {
  return path.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, char => `\\u{${char.codePointAt(0)?.toString(16)}}`)
}

export function register(on: On) {
  let cwd: string
  let baseline: Snapshot | null | undefined

  on('session.start', async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    cwd = e.cwd
    try {
      baseline = await snapshot($, cwd)
    } catch {
      baseline = undefined
    }
    await $.command.register({ name: 'session-diff', description: 'Review files changed since this session started' })
    return next(e)
  })

  on('command.run', { command: 'session-diff' }, async ($) => {
    const result = { text: '', isTextDisplayOnly: true as const }
    if (baseline === null) {
      return { ...result, text: 'Session Diff requires a session started inside a Git working tree.' }
    }
    if (baseline === undefined) {
      return { ...result, text: 'Session Diff could not capture its starting snapshot. Check that Git and Node.js are on PATH, then restart Claude Code in the repository.' }
    }

    try {
      const current = await snapshot($, cwd)
      if (current === null) throw new Error('Working tree unavailable')
      const changes = []
      for (const path of [...new Set([...baseline.keys(), ...current.keys()])].sort()) {
        const before = baseline.get(path)
        const after = current.get(path)
        if (before === after) continue
        const status = before === undefined ? 'Added' : after === undefined ? 'Deleted' : 'Modified'
        changes.push(`${status.padEnd(8)}  ${displayPath(path)}`)
      }
      result.text = changes.length
        ? [`Session Diff · ${changes.length} ${changes.length === 1 ? 'file' : 'files'} changed`, ...changes].join('\n')
        : 'Session Diff · No file changes since session start.'
    } catch {
      result.text = 'Session Diff could not read the current working tree. Try again once Git and the working files are available.'
    }
    return result
  })
}
