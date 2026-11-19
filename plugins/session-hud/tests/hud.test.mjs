import assert from 'node:assert/strict'
import { test } from 'node:test'
import { register } from '../hooks/register.ts'

test('renders session usage and activity and clears them for a new session', async () => {
  const hooks = new Map()
  register((event, ...args) => {
    hooks.set(event, args.at(-1))
    return { catch() {} }
  })
  const engine = {
    ui: {
      invalidate() {},
      resolve: async () => ({ Text: ({ children }) => children }),
    },
  }
  const emit = (event, input) => hooks.get(event)(engine, input, value => value)
  const render = () => emit('ui.render', { surface: 'terminal', props: {} })

  assert.match(await render(), /Context — · 5h — · 7d —/)
  emit('session.measure', {
    context: { percent: 25 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 12.5 },
      { kind: 'seven_day', percentUsed: 100 },
    ],
  })
  emit('skill.prompt', { skill: 'review:check', pluginName: 'review' })
  assert.match(await render(), /Last skill review:check · Plugin review · MCP —/)

  const toolUse = { mcp_server: { name: 'plugin:repo-tools:github', source: 'plugin' } }
  assert.equal(emit('classic.PostToolUse', toolUse), toolUse)
  assert.equal(await render(), 'Context 75% left · 5h 87.5% left · 7d 0% left\nLast skill review:check · Plugin repo-tools · MCP github')

  emit('session.start', {})
  assert.match(await render(), /Last skill — · Plugin — · MCP —/)
})
