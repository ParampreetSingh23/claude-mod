import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, lstatSync, openSync, readlinkSync, readSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

// shortcut: Git paths must be UTF-8, use byte paths if legacy filename encodings are needed.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function git(cwd, ...args) {
  return execFileSync('git', ['-C', cwd, '-c', 'core.fsmonitor=false', ...args], {
    env: { ...process.env, LC_ALL: 'C' },
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function fingerprint(file, buffer) {
  const stat = lstatSync(file)
  if (stat.isSymbolicLink()) return `link:${createHash('sha256').update(readlinkSync(file, { encoding: 'buffer' })).digest('hex')}`
  if (!stat.isFile()) return undefined

  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))
  try {
    const hash = createHash('sha256')
    for (let bytes; (bytes = readSync(fd, buffer)) > 0;) hash.update(buffer.subarray(0, bytes))
    return `${stat.mode & 0o100}:${hash.digest('hex')}`
  } finally {
    closeSync(fd)
  }
}

function snapshot(cwd) {
  let root
  try {
    root = realpathSync(decoder.decode(git(cwd, 'rev-parse', '--show-toplevel')).replace(/\n$/, ''))
  } catch (error) {
    if (/not a git repository|must be run in a work tree/.test(error.stderr?.toString() ?? '')) return null
    throw error
  }

  const paths = decoder.decode(git(root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z')).split('\0')
  const buffer = Buffer.alloc(64 * 1024)
  const directories = new Map()
  const entries = []
  for (const path of new Set(paths)) {
    if (!path || path.endsWith('/')) continue
    const file = join(root, path)
    const parent = dirname(file)
    try {
      if (!directories.has(parent)) directories.set(parent, parent === realpathSync(parent))
      if (!directories.get(parent)) continue
      const value = fingerprint(file, buffer)
      if (value !== undefined) entries.push([path, value])
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
  }
  return entries
}

try {
  process.stdout.write(JSON.stringify(snapshot(process.argv[2])))
} catch (error) {
  process.stderr.write(`Session Diff snapshot failed: ${error.code ?? error.name}\n`)
  process.exitCode = 1
}
