/**
 * PTY 终端进程 IPC handler 注册
 * 将 PTY 服务的能力通过 IPC 通道暴露给渲染进程
 */
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { createIPCHandler } from './create-ipc-handler'
import { createPty, writePty, resizePty, killPty } from '../services/pty-service'

import type { PtyCreateParams, PtyWriteParams, PtyResizeParams } from '@shared/types'

/**
 * 注册所有 PTY 相关的 IPC handler
 */
export function registerPtyHandlers(): void {
  // 创建新的 PTY 会话
  createIPCHandler<[PtyCreateParams], void>(
    IPC_CHANNELS['pty:create'],
    async (params: PtyCreateParams): Promise<void> => {
      createPty(params)
    }
  )

  // 向 PTY 写入数据（用户键盘输入）
  createIPCHandler<[PtyWriteParams], void>(
    IPC_CHANNELS['pty:write'],
    async (params: PtyWriteParams): Promise<void> => {
      writePty(params)
    }
  )

  // 调整 PTY 终端尺寸
  createIPCHandler<[PtyResizeParams], void>(
    IPC_CHANNELS['pty:resize'],
    async (params: PtyResizeParams): Promise<void> => {
      resizePty(params)
    }
  )

  // 终止 PTY 会话
  createIPCHandler<[string], void>(
    IPC_CHANNELS['pty:kill'],
    async (sessionId: string): Promise<void> => {
      killPty(sessionId)
    }
  )
}
