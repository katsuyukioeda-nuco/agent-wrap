import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { mkdtemp, open, rm, stat, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { v7 as uuidv7 } from 'uuid'
import type { ConnectedAppDetail } from '../shared/agents'
import type { ProcessDefinition } from '../schema'
import {
  createProcess,
  getProcess,
  listProcesses,
  listActiveProcesses,
  updateProcess,
} from './repositories/processes'
import { resolveWorkspaceRoots } from './workspace'

const running = new Map<string, ChildProcess>()
const stopRequested = new Set<string>()

const MAX_LOG_BYTES = 200 * 1024
const KILL_GRACE_MS = 5_000

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function defaultName(command: string): string {
  const name = command.replace(/\s+/g, ' ').trim()
  return name.length > 80 ? `${name.slice(0, 79)}…` : name || 'process'
}

async function defaultCwd(
  detail: ConnectedAppDetail,
  sessionId: string,
): Promise<string> {
  try {
    const roots = await resolveWorkspaceRoots(detail, sessionId)
    if (roots[0]) {
      return roots[0].path
    }
  } catch {
    // セッションから作業ディレクトリを特定できなければサーバーの cwd を使う
  }

  return process.cwd()
}

async function stopPid(pid: number, signal: NodeJS.Signals): Promise<void> {
  if (process.platform === 'win32') {
    if (signal === 'SIGKILL') {
      await new Promise<void>((resolve) => {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve())
      })
    }
    return
  }

  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // すでに終了している
    }
  }
}

function scheduleForceKill(pid: number): void {
  const timer = setTimeout(() => {
    if (isPidAlive(pid)) {
      void stopPid(pid, 'SIGKILL')
    }
  }, KILL_GRACE_MS)

  timer.unref()
}

export interface StartProcessInput {
  detail: ConnectedAppDetail
  sessionId: string
  command: string
  cwd?: string
  name?: string
}

export async function startProcess(
  input: StartProcessInput,
): Promise<ProcessDefinition> {
  const command = input.command.trim()
  if (!command) {
    throw new Error('Command is required')
  }

  const cwd = input.cwd
    ? input.cwd
    : await defaultCwd(input.detail, input.sessionId)

  const info = await stat(cwd).catch(() => null)
  if (!info || !info.isDirectory()) {
    throw new Error(`Working directory not found: ${cwd}`)
  }

  const logDirectory = await mkdtemp(join(tmpdir(), 'agent-wrap-process-'))
  const logPath = join(logDirectory, 'output.log')

  const id = uuidv7()
  let record: ProcessDefinition

  try {
    record = await createProcess({
      id,
      connectedAppId: input.detail.app.id,
      sessionId: input.sessionId,
      name: input.name?.trim() || defaultName(command),
      cwd,
      command,
      logPath,
    })
  } catch (error) {
    await rm(logDirectory, { recursive: true, force: true })
    throw error
  }

  return launch(record)
}

async function launch(
  record: ProcessDefinition,
): Promise<ProcessDefinition> {
  const info = await stat(record.cwd).catch(() => null)

  if (!info || !info.isDirectory()) {
    await updateProcess(record.id, {
      status: 'failed',
      endedAt: new Date(),
    })
    throw new Error(`Working directory not found: ${record.cwd}`)
  }

  const logFd = openSync(record.logPath, 'a')
  const shell =
    process.platform === 'win32'
      ? process.env.ComSpec ?? 'cmd.exe'
      : process.env.SHELL || '/bin/sh'
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', record.command]
      : ['-c', record.command]

  let child: ChildProcess

  try {
    child = spawn(shell, args, {
      cwd: record.cwd,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    })
  } catch (error) {
    await updateProcess(record.id, {
      status: 'failed',
      endedAt: new Date(),
    })
    throw error
  } finally {
    closeSync(logFd)
  }

  running.set(record.id, child)
  const pid = child.pid ?? null

  await updateProcess(record.id, {
    pid,
    status: 'running',
    exitCode: null,
    signal: null,
    startedAt: new Date(),
    endedAt: null,
  })

  child.on('error', () => {
    running.delete(record.id)
    void updateProcess(record.id, {
      status: 'failed',
      endedAt: new Date(),
    })
  })

  child.on('exit', (code, signal) => {
    running.delete(record.id)
    const stopped = stopRequested.has(record.id)
    stopRequested.delete(record.id)

    void updateProcess(record.id, {
      status: stopped ? 'killed' : code === 0 ? 'exited' : 'failed',
      exitCode: code,
      signal: signal ?? null,
      endedAt: new Date(),
    })
  })

  child.unref()

  return (await getProcess(record.id)) ?? record
}

export async function restartProcess(
  connectedAppId: string,
  id: string,
): Promise<ProcessDefinition | null> {
  const record = await getProcess(id)

  if (!record || record.connectedAppId !== connectedAppId) {
    return null
  }

  if (record.status === 'running' || record.status === 'starting') {
    throw new Error('Process is already running')
  }

  await appendFile(
    record.logPath,
    `\n--- restart ${new Date().toISOString()} ---\n`,
  ).catch(() => undefined)

  return launch(record)
}

async function reconcile(
  record: ProcessDefinition,
): Promise<ProcessDefinition> {
  if (record.status !== 'starting' && record.status !== 'running') {
    return record
  }

  if (running.has(record.id)) {
    return record
  }

  if (record.pid === null || isPidAlive(record.pid)) {
    return record
  }

  const status = record.status === 'starting' ? 'failed' : 'exited'

  await updateProcess(record.id, {
    status,
    endedAt: new Date(),
  })

  return {
    ...record,
    status,
    endedAt: new Date().toISOString(),
  }
}

export async function listSessionProcesses(
  connectedAppId: string,
  sessionId: string,
  limit = 30,
): Promise<ProcessDefinition[]> {
  const processes = await listProcesses(connectedAppId, sessionId, limit)
  return Promise.all(processes.map(reconcile))
}

export async function getProcessForApp(
  connectedAppId: string,
  id: string,
): Promise<ProcessDefinition | null> {
  const record = await getProcess(id)

  if (!record || record.connectedAppId !== connectedAppId) {
    return null
  }

  return reconcile(record)
}

export async function stopProcess(
  connectedAppId: string,
  id: string,
  signal: NodeJS.Signals = 'SIGTERM',
): Promise<ProcessDefinition | null> {
  const record = await getProcessForApp(connectedAppId, id)

  if (!record) {
    return null
  }

  if (record.status !== 'starting' && record.status !== 'running') {
    return record
  }

  if (record.pid !== null && isPidAlive(record.pid)) {
    stopRequested.add(id)
    await stopPid(record.pid, signal)

    if (!running.has(id)) {
      stopRequested.delete(id)
      await updateProcess(id, {
        status: 'killed',
        endedAt: new Date(),
      })
    } else if (signal !== 'SIGKILL') {
      scheduleForceKill(record.pid)
    }
  } else {
    await updateProcess(id, {
      status: 'killed',
      endedAt: new Date(),
    })
  }

  return getProcessForApp(connectedAppId, id)
}

export interface ProcessLog {
  lines: string[]
  truncated: boolean
}

export async function readProcessLog(
  connectedAppId: string,
  id: string,
  tailLines = 100,
): Promise<{ process: ProcessDefinition; log: ProcessLog } | null> {
  const record = await getProcessForApp(connectedAppId, id)

  if (!record) {
    return null
  }

  const info = await stat(record.logPath).catch(() => null)

  if (!info || !info.isFile()) {
    return { process: record, log: { lines: [], truncated: false } }
  }

  const truncated = info.size > MAX_LOG_BYTES
  const length = Math.min(info.size, MAX_LOG_BYTES)

  if (length === 0) {
    return { process: record, log: { lines: [], truncated: false } }
  }

  const buffer = Buffer.alloc(length)
  const handle = await open(record.logPath, 'r')

  try {
    await handle.read(buffer, 0, length, info.size - length)
  } finally {
    await handle.close()
  }

  const lines = buffer.toString('utf8').split('\n')

  if (lines.at(-1) === '') {
    lines.pop()
  }

  const safeLines = Math.min(Math.max(Math.trunc(tailLines), 1), 2000)

  return {
    process: record,
    log: {
      lines: lines.slice(-safeLines),
      truncated,
    },
  }
}

/**
 * サーバー再起動後も子プロセスは残るため、起動時に生死を確認する。
 */
export async function reconcileProcesses(): Promise<void> {
  const processes = await listActiveProcesses()
  await Promise.all(processes.map(reconcile))
}
