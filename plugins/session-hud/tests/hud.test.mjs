import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from '../hooks/register.ts'

test('renders session usage and activity and clears them for a new session', async () => {
  const hooks = new Map()
  register((event, ...args) => {
    hooks.set(event, args.at(-1))
    return { catch() {} }
  })
  let usage = { context: {}, rateLimits: [] }
  let report = { rate_limits: { limits: [
    { kind: 'session', percent: 100, resets_at: '2000-01-01T00:00:00Z' },
    { kind: 'session', percent: 27, resets_at: null },
    { kind: 'weekly_scoped', percent: 80, resets_at: null },
    { kind: 'weekly_all', percent: 40, resets_at: null },
  ] } }
  const timers = []
  const engine = {
    clock: { after: (delay, callback) => timers.push({ delay, callback }) },
    plugin: { root: '/plugin' },
    process: { run: async (args, options) => {
      assert.deepEqual(args.slice(0, 3), ['claude', '-p', '/usage'])
      assert.ok(args.includes('--safe-mode') && args.includes('--no-session-persistence'))
      assert.equal(options.cwd, '/plugin')
      return { exitCode: 0, stdout: JSON.stringify({ type: 'assistant', usage_report: report }) }
    } },
    session: { usage: async () => usage },
    ui: {
      invalidate() {},
      resolve: async () => ({ Text: props => props }),
    },
  }
  const emit = (event, input) => hooks.get(event)(engine, input, value => value)
  const render = bodyColumns => emit('ui.render', { surface: 'terminal', props: { bodyColumns } })
  const text = node => {
    if (typeof node === 'string') return node
    return Array.isArray(node.children) ? node.children.map(text).join('') : node.children
  }

  assert.match(text(await render()), /Context — · Checking plan usage/)
  usage = { context: { percent: 8 }, rateLimits: [] }
  assert.equal(timers.length, 1)
  await timers.shift().callback()
  assert.match(text(await render()), /^Context █████ 92% · 5h ████░ 73% · 7d ███░░ 60%/)
  assert.equal(timers[0].delay, 300_000)

  report = undefined
  await timers.shift().callback()
  assert.match(text(await render()), /^Context █████ 92% · \/usage for plan limits/)
  assert.equal(timers.length, 0)

  usage.rateLimits = [{ kind: 'spend_limit', percentUsed: 85 }]
  assert.match(text(await render()), /Spend limit █░░░░ 15%/)
  usage = {
    context: { percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 62.5 },
      { kind: 'seven_day', percentUsed: 100 },
    ],
  }
  emit('session.measure', usage)
  emit('skill.prompt', { skill: 'review:check', pluginName: 'review' })
  assert.match(text(await render()), /Last skill review:check · Plugin review · MCP —/)

  const toolUse = { mcp_server: { name: 'plugin:repo-tools:github', source: 'plugin' } }
  assert.equal(emit('classic.PostToolUse', toolUse), toolUse)
  const hud = await render()
  assert.equal(text(hud), 'Context ████░ 75% · 5h ██░░░ 37.5% · 7d ░░░░░ 0%\nLast skill review:check · Plugin repo-tools · MCP github')
  assert.deepEqual([0, 2, 4].map(index => hud.children[index].children[1].color), ['green', 'yellow', 'red'])
  assert.match(text(await render(40)), /^Context 75% · 5h 37\.5% · 7d 0%/)

  emit('session.start', {})
  assert.match(text(await render()), /Last skill — · Plugin — · MCP —/)
})
