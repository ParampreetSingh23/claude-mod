import type { On, SessionRateLimit } from 'claude-code'

function limit(windows: SessionRateLimit[], kind: string) {
  return windows.find(window => window.kind === kind && Number.isFinite(window.percentUsed)
    && (!window.resetsAt || Date.parse(window.resetsAt) > Date.now()))?.percentUsed
}

function needsPlanReport(windows: SessionRateLimit[]) {
  return limit(windows, 'spend_limit') === undefined
    && (limit(windows, 'five_hour') === undefined || limit(windows, 'seven_day') === undefined)
}

function readPlanReport(stdout: string): SessionRateLimit[] | undefined {
  for (const line of stdout.trim().split('\n')) {
    if (!line.startsWith('{')) continue
    const message = JSON.parse(line)
    if (message?.type !== 'assistant' || !message.usage_report) continue

    const rows = message.usage_report.rate_limits?.limits
    if (!Array.isArray(rows)) return []
    return rows.flatMap(row => {
      const kind = row?.kind === 'session' ? 'five_hour' : row?.kind === 'weekly_all' ? 'seven_day' : undefined
      if (!kind || row.scope || !Number.isFinite(row.percent) || row.percent < 0 || row.percent > 100) return []
      return [{ kind, percentUsed: row.percent, resetsAt: typeof row.resets_at === 'string' ? row.resets_at : undefined }]
    })
  }
}

function name(value: string) {
  return value.replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '').slice(0, 60)
}

export function register(on: On) {
  let skill = ''
  let plugin = ''
  let server = ''
  let planLimits: SessionRateLimit[] = []
  let planRefreshStarted = false
  let planChecked = false

  on('session.start', ($, e, next) => {
    skill = plugin = server = ''
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('session.measure', ($, e, next) => {
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
    const { context, rateLimits } = await $.session.usage()
    if (!planRefreshStarted && needsPlanReport(rateLimits)) {
      planRefreshStarted = true
      const refreshPlan = async () => {
        let retry = true
        try {
          if (needsPlanReport((await $.session.usage()).rateLimits)) {
            const result = await $.process.run([
              'claude', '-p', '/usage', '--output-format', 'stream-json', '--verbose',
              '--safe-mode', '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--tools', '',
            ], { cwd: $.plugin.root, timeoutMs: 10_000 })
            if (result.exitCode === 0 && !result.isStdoutTruncated) {
              const report = readPlanReport(result.stdout)
              planLimits = report ?? []
              retry = report !== undefined
            } else {
              planLimits = []
            }
          }
        } catch {
          planLimits = []
        }
        planChecked = true
        $.ui.invalidate('ui.render')
        if (retry) $.clock.after(300_000, refreshPlan)
      }
      $.clock.after(1, refreshPlan)
    }
    const showBars = (e.props.bodyColumns ?? 54) >= 54
    const meter = (label: string, used?: number) => {
      if (used === undefined || !Number.isFinite(used)) return `${label} —`

      const remaining = Math.min(100, Math.max(0, 100 - used))
      const filled = Math.round(remaining / 20)
      const color = remaining <= 20 ? 'red' : remaining <= 50 ? 'yellow' : 'green'
      const percent = `${remaining.toFixed(1).replace(/\.0$/, '')}%`
      return Text({ children: [
        `${label} `,
        Text({ color, children: `${showBars ? '█'.repeat(filled) + '░'.repeat(5 - filled) + ' ' : ''}${percent}` }),
      ] })
    }
    const fiveHour = limit(rateLimits, 'five_hour') ?? limit(planLimits, 'five_hour')
    const sevenDay = limit(rateLimits, 'seven_day') ?? limit(planLimits, 'seven_day')
    const spend = limit(rateLimits, 'spend_limit')
    const plan = fiveHour !== undefined || sevenDay !== undefined
      ? [meter('5h', fiveHour), ' · ', meter('7d', sevenDay)]
      : spend !== undefined
        ? [meter('Spend limit', spend)]
        : [planChecked ? '/usage for plan limits' : 'Checking plan usage']
    const activity = `Last skill ${skill || '—'} · Plugin ${plugin || '—'} · MCP ${server || '—'}`
    return Text({ children: [
      meter('Context', context.percent), ' · ', ...plan, '\n',
      activity,
    ] })
  })
}
