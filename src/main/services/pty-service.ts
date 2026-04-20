/**
 * PTY 终端进程管理服务
 * 使用 node-pty 为每个终端会话创建独立的伪终端进程，
 * 通过 IPC 将 PTY 输出转发到渲染进程，接收渲染进程的键盘输入
 */
import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import os from 'node:os'

import type { PtyCreateParams, PtyResizeParams, PtyWriteParams } from '@shared/types'

/** PTY 实例映射：sessionId -> IPty */
const ptyInstances = new Map<string, pty.IPty>()

/**
 * 获取当前平台的默认 Shell
 * Windows 使用 PowerShell，macOS/Linux 使用环境变量中的 SHELL 或 /bin/bash
 */
function getDefaultShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

/**
 * 创建新的 PTY 会话
 * 启动一个真实的 Shell 进程并绑定到指定的 sessionId
 *
 * @param params - PTY 创建参数
 */
export function createPty(params: PtyCreateParams): void {
  const { sessionId, cwd, cols = 80, rows = 24 } = params

  // 防止重复创建
  if (ptyInstances.has(sessionId)) {
    log.warn(`[PTY] 会话已存在，跳过创建: ${sessionId}`)
    return
  }

  const shell = getDefaultShell()
  const workingDir = cwd || os.homedir()

  log.info(`[PTY] 创建会话: ${sessionId}, shell=${shell}, cwd=${workingDir}`)

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: workingDir,
    env: process.env as Record<string, string>,
  })

  ptyInstances.set(sessionId, ptyProcess)

  // 将 PTY 输出转发到所有渲染进程窗口
  ptyProcess.onData((data: string) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('pty:data', { sessionId, data })
      }
    }
  })

  // PTY 进程退出时清理资源
  ptyProcess.onExit(({ exitCode, signal }) => {
    log.info(`[PTY] 会话退出: ${sessionId}, exitCode=${exitCode}, signal=${signal}`)
    ptyInstances.delete(sessionId)
  })
}

/**
 * 向指定 PTY 会话写入数据（用户键盘输入）
 *
 * @param params - 写入参数
 */
export function writePty(params: PtyWriteParams): void {
  const { sessionId, data } = params
  const ptyProcess = ptyInstances.get(sessionId)
  if (!ptyProcess) {
    log.warn(`[PTY] 写入失败，会话不存在: ${sessionId}`)
    return
  }
  ptyProcess.write(data)
}

/**
 * 调整指定 PTY 会话的终端尺寸
 *
 * @param params - 调整尺寸参数
 */
export function resizePty(params: PtyResizeParams): void {
  const { sessionId, cols, rows } = params
  const ptyProcess = ptyInstances.get(sessionId)
  if (!ptyProcess) {
    log.warn(`[PTY] 调整尺寸失败，会话不存在: ${sessionId}`)
    return
  }
  try {
    ptyProcess.resize(cols, rows)
  } catch (err) {
    log.error(`[PTY] 调整尺寸异常: ${sessionId}`, err)
  }
}

/**
 * 终止指定 PTY 会话
 *
 * @param sessionId - 要终止的会话 ID
 */
export function killPty(sessionId: string): void {
  const ptyProcess = ptyInstances.get(sessionId)
  if (!ptyProcess) {
    log.warn(`[PTY] 终止失败，会话不存在: ${sessionId}`)
    return
  }
  log.info(`[PTY] 终止会话: ${sessionId}`)
  ptyProcess.kill()
  ptyInstances.delete(sessionId)
}

/**
 * 清理所有 PTY 会话，在应用退出时调用
 */
export function cleanupAllPty(): void {
  for (const [sessionId, ptyProcess] of ptyInstances) {
    log.info(`[PTY] 清理会话: ${sessionId}`)
    try {
      ptyProcess.kill()
    } catch {
      // 进程可能已退出，忽略错误
    }
  }
  ptyInstances.clear()
}
