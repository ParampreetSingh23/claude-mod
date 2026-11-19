import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { register } from '../hooks/register.ts'

test('reviews net changes against the working tree at startup', async t => {
  const workspace = mkdtempSync(join(tmpdir(), 'claude-session-diff-'))
  t.after(() => rmSync(workspace, { recursive: true, force: true }))
  const repo = join(workspace, 'repo')
  mkdirSync(repo)
  const write = (file, data) => writeFileSync(join(repo, file), data)
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q')
  write('.gitignore', '*.tmp\n')
  write('already dirty.txt', 'committed')
  write('deleted.txt', 'delete me')
  write('untouched.txt', 'committed')
  write('restored.txt', 'original')
  write('binary.dat', Buffer.from([0, 0xff]))
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Start')
  write('already dirty.txt', 'starting local edit')
  write('untouched.txt', 'starting local edit to keep')
  write('already untracked.txt', 'starting untracked file')

  const hooks = new Map()
  register((event, ...args) => hooks.set(event, args.at(-1)))
  const pluginRoot = fileURLToPath(new URL('..', import.meta.url))
  const engine = {
    plugin: { root: pluginRoot },
    command: { register: async spec => assert.equal(spec.name, 'session-diff') },
    process: { run: async ([program, ...args], options) => ({
      exitCode: 0,
      stdout: execFileSync(program, args, { cwd: options.cwd, encoding: 'utf8' }),
    }) },
  }
  const start = cwd => hooks.get('session.start')(engine, { cwd, surface: 'terminal' }, value => value)
  const review = () => hooks.get('command.run')(engine)
  await start(workspace)
  assert.match((await review()).text, /requires.*Git working tree/)
  await start(repo)
  assert.match((await review()).text, /No file changes/)

  write('already dirty.txt', 'session edit')
  write('already untracked.txt', 'session edit')
  write('binary.dat', Buffer.from([0, 0xfe]))
  rmSync(join(repo, 'deleted.txt'))
  write('restored.txt', 'temporary edit')
  write('restored.txt', 'original')
  write('staged.txt', 'new content')
  git('add', 'staged.txt')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'During the session')
  write('ignored.tmp', 'ignore this')
  if (process.platform !== 'win32') {
    chmodSync(join(repo, 'untouched.txt'), 0o755)
    symlinkSync(join(workspace, 'missing'), join(repo, 'link'))
    write('with\nnewline', 'new file')
  }

  const index = readFileSync(join(repo, '.git', 'index'))
  const { text, isTextDisplayOnly } = await review()
  assert.equal(isTextDisplayOnly, true)
  assert.match(text, /Modified\s+already dirty\.txt/)
  assert.match(text, /Modified\s+already untracked\.txt/)
  assert.match(text, /Modified\s+binary\.dat/)
  assert.match(text, /Deleted\s+deleted\.txt/)
  assert.match(text, /Added\s+staged\.txt/)
  assert.doesNotMatch(text, /ignored\.tmp|restored\.txt/)
  if (process.platform !== 'win32') {
    assert.match(text, /Modified\s+untouched\.txt/)
    assert.match(text, /Added\s+link/)
    assert.match(text, /Added\s+with\\u\{a\}newline/)
  } else {
    assert.doesNotMatch(text, /untouched\.txt/)
  }
  assert.deepEqual(readFileSync(join(repo, '.git', 'index')), index)
})
