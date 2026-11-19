import type { On, SessionRateLimit } from 'claude-code'

function remaining(used?: number) {
  return used === undefined ? '—' : `${Math.max(0, 100 - used).toFixed(1).replace(/\.0$/, '')}% left`
}

function limit(windows: SessionRateLimit[], kind: string) {
  return remaining(windows.find(window => window.kind === kind)?.percentUsed)
}

function name(value: string) {
  return value.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').slice(0, 60)
}

export function register(on: On) {
  let skill = ''
  let plugin = ''
  let server = ''
  let context: number | undefined
  let windows: SessionRateLimit[] = []

  on('session.start', ($, e, next) => {
    skill = plugin = server = ''
    context = undefined
    windows = []
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('session.measure', ($, e, next) => {
    context = e.context.percent
    windows = e.rateLimits
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('skill.prompt', ($, e, next) => {
    skill = name(e.skill)
    if (e.pluginName) plugin = name(e.pluginName)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('classic.PostToolUse', ($, e, next) => {
    if (e.mcp_server) {
      const [, owner, serverName] = /^plugin:([^:]+):(.+)$/.exec(e.mcp_server.name) ?? []
      server = name(serverName ?? e.mcp_server.name)
      if (owner && e.mcp_server.source === 'plugin') plugin = name(owner)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey) return next(e)
    const { Text } = await $.ui.resolve(e)
    const usage = `Context ${remaining(context)} · 5h ${limit(windows, 'five_hour')} · 7d ${limit(windows, 'seven_day')}`
    const activity = `Last skill ${skill || '—'} · Plugin ${plugin || '—'} · MCP ${server || '—'}`
    return Text({ children: `${usage}\n${activity}` })
  })
}
