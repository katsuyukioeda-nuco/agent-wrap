import { execFile } from 'node:child_process'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type {
  ConnectedAppDetail,
  GitChangedFile,
  GitRepoSummary,
  WorkspaceDiffResponse,
  WorkspaceEntry,
  WorkspaceFileResponse,
  WorkspaceRoot,
} from '../shared/agents'
import { getRuntime } from './agents/manager'

const execFileAsync = promisify(execFile)
const MAX_FILE_BYTES = 512 * 1024
const MAX_DIFF_BYTES = 200 * 1024
const MAX_CHANGED_FILES = 300

interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
}

async function runGit(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const result = (await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15_000,
    })) as { stdout: string; stderr: string }

    return { ok: true, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    return {
      ok: false,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
    }
  }
}

async function gitToplevel(directory: string): Promise<string | null> {
  const result = await runGit(directory, ['rev-parse', '--show-toplevel'])
  const path = result.stdout.trim()
  return result.ok && path ? path : null
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/')
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/**
 * セッションの作業ディレクトリと、そのプロジェクトの canonical パスから
 * ワークスペースのルート候補を作る。
 */
export async function resolveWorkspaceRoots(
  detail: ConnectedAppDetail,
  sessionId: string,
): Promise<WorkspaceRoot[]> {
  const runtime = await getRuntime(detail)
  const session = await runtime.session(sessionId)

  if (!session) {
    return []
  }

  const projects = await runtime.projects()
  const project = projects.find((item) => item.id === session.projectId)
  const candidates = [session.directory, project?.path].filter(
    (path): path is string => Boolean(path),
  )

  const roots: WorkspaceRoot[] = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (!(await isDirectory(candidate))) {
      continue
    }

    const repoRoot = await gitToplevel(candidate)
    let path: string
    try {
      path = await realpath(repoRoot ?? candidate)
    } catch {
      continue
    }

    if (seen.has(path)) {
      continue
    }
    seen.add(path)

    const git = await runGit(path, ['rev-parse', '--is-inside-work-tree'])

    roots.push({
      id: `root-${roots.length}`,
      path,
      name: basename(path) || path,
      git: git.ok && git.stdout.trim() === 'true',
    })
  }

  return roots
}

/** ルート外へのパス移動を防ぐ。 */
async function resolveInsideRoot(
  root: string,
  input: string,
): Promise<string> {
  if (input.includes('\0')) {
    throw new Error('Invalid path')
  }

  const target = resolve(root, input || '.')
  const relativeTarget = relative(root, target)

  if (
    relativeTarget.startsWith('..') ||
    isAbsolute(relativeTarget)
  ) {
    throw new Error('Invalid path')
  }

  const [realRoot, realTarget] = await Promise.all([
    realpath(root),
    realpath(target),
  ])
  const realRelative = relative(realRoot, realTarget)

  if (realRelative.startsWith('..') || isAbsolute(realRelative)) {
    throw new Error('Invalid path')
  }

  return realTarget
}

export async function listWorkspaceDirectory(
  root: string,
  input: string,
): Promise<{ path: string; entries: WorkspaceEntry[] }> {
  const directory = await resolveInsideRoot(root, input)
  const dirents = await readdir(directory, { withFileTypes: true })

  const entries: WorkspaceEntry[] = []

  for (const dirent of dirents) {
    if (dirent.name === '.git') {
      continue
    }

    const absolute = join(directory, dirent.name)
    let type: WorkspaceEntry['type'] = dirent.isDirectory()
      ? 'directory'
      : 'file'

    if (dirent.isSymbolicLink()) {
      try {
        type = (await stat(absolute)).isDirectory() ? 'directory' : 'file'
      } catch {
        type = 'file'
      }
    }

    entries.push({
      name: dirent.name,
      path: toPosixPath(relative(root, absolute)),
      type,
    })
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  return {
    path: toPosixPath(relative(root, directory)),
    entries,
  }
}

export async function readWorkspaceFile(
  root: string,
  input: string,
): Promise<WorkspaceFileResponse> {
  const file = await resolveInsideRoot(root, input)
  const info = await stat(file)

  if (!info.isFile()) {
    throw new Error('Not a file')
  }

  const length = Math.min(info.size, MAX_FILE_BYTES)
  const buffer = Buffer.alloc(length)
  const handle = await open(file, 'r')
  let bytesRead = 0

  try {
    const result = await handle.read(buffer, 0, length, 0)
    bytesRead = result.bytesRead
  } finally {
    await handle.close()
  }

  const data = buffer.subarray(0, bytesRead)
  const binary = data.includes(0)

  return {
    path: toPosixPath(relative(root, file)),
    size: info.size,
    binary,
    truncated: info.size > MAX_FILE_BYTES,
    content: binary ? undefined : data.toString('utf8'),
  }
}

interface StatusEntry {
  path: string
  status: string
  untracked: boolean
}

function parseStatus(output: string): StatusEntry[] {
  const chunks = output.split('\0').filter(Boolean)
  const entries: StatusEntry[] = []

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]

    if (chunk.length < 4) {
      continue
    }

    const code = chunk.slice(0, 2)
    const path = chunk.slice(3)

    if (!path) {
      continue
    }

    entries.push({
      path,
      status: code.trim() || '?',
      untracked: code === '??',
    })

    // rename / copy では元パスが次の NUL 区切りで続く。
    if (code.startsWith('R') || code.startsWith('C')) {
      index += 1
    }
  }

  return entries
}

async function fileDiff(
  repo: string,
  path: string,
  hasHead: boolean,
): Promise<string> {
  const args = ['--no-color', '--no-ext-diff', '--', path]

  if (hasHead) {
    return (await runGit(repo, ['diff', 'HEAD', ...args])).stdout
  }

  const [cached, working] = await Promise.all([
    runGit(repo, ['diff', '--cached', ...args]),
    runGit(repo, ['diff', ...args]),
  ])

  return [cached.stdout, working.stdout].filter(Boolean).join('\n')
}

async function repoSummary(
  repo: string,
  root: string,
  kind: 'root' | 'submodule',
): Promise<GitRepoSummary> {
  const relativePath = toPosixPath(relative(root, repo)) || '.'
  const branch = await runGit(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])

  return {
    path: relativePath,
    label: kind === 'root' ? basename(root) || 'workspace' : relativePath,
    kind,
    branch: branch.ok ? branch.stdout.trim() : undefined,
  }
}

async function changedFilesForRepo(
  repo: string,
  root: string,
  kind: 'root' | 'submodule',
): Promise<GitChangedFile[]> {
  const status = await runGit(repo, ['status', '--porcelain', '-z'])

  if (!status.ok) {
    return []
  }

  const hasHead = (await runGit(repo, ['rev-parse', '--verify', 'HEAD'])).ok
  const relativePath = toPosixPath(relative(root, repo)) || '.'
  const label = kind === 'root' ? basename(root) || 'workspace' : relativePath
  const files: GitChangedFile[] = []

  for (const entry of parseStatus(status.stdout).slice(0, MAX_CHANGED_FILES)) {
    const diff = entry.untracked ? '' : await fileDiff(repo, entry.path, hasHead)
    const truncated = diff.length > MAX_DIFF_BYTES

    files.push({
      id: `${kind}:${relativePath}:${entry.path}`,
      repoPath: relativePath,
      repoLabel: label,
      repoKind: kind,
      path: entry.path,
      status: entry.status,
      diff: truncated ? diff.slice(0, MAX_DIFF_BYTES) : diff,
      untracked: entry.untracked,
      truncated,
    })
  }

  return files
}

interface SubmoduleEntry {
  path: string
  initialized: boolean
}

async function listSubmodules(root: string): Promise<SubmoduleEntry[]> {
  const result = await runGit(root, ['submodule', 'status', '--recursive'])

  if (!result.ok) {
    return []
  }

  const entries: SubmoduleEntry[] = []

  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) {
      continue
    }

    const initialized = !line.startsWith('-')
    const body = line
      .replace(/^[ +-]/, '')
      .replace(/\s+\([^)]*\)$/, '')
    const match = /^([0-9a-f]+)\s+(.+)$/.exec(body)

    if (match) {
      entries.push({ path: match[2].trim(), initialized })
    }
  }

  return entries
}

export async function workspaceDiff(
  root: string,
): Promise<WorkspaceDiffResponse> {
  const repo = await runGit(root, ['rev-parse', '--is-inside-work-tree'])

  if (!repo.ok || repo.stdout.trim() !== 'true') {
    return { git: false, repos: [], files: [] }
  }

  const repos: GitRepoSummary[] = [await repoSummary(root, root, 'root')]
  const files: GitChangedFile[] = await changedFilesForRepo(
    root,
    root,
    'root',
  )

  for (const submodule of await listSubmodules(root)) {
    if (!submodule.initialized) {
      continue
    }

    const path = join(root, submodule.path)

    if (!(await isDirectory(path))) {
      continue
    }

    const submoduleFiles = await changedFilesForRepo(path, root, 'submodule')

    if (submoduleFiles.length === 0) {
      continue
    }

    repos.push(await repoSummary(path, root, 'submodule'))
    files.push(...submoduleFiles)
  }

  return { git: true, repos, files }
}
