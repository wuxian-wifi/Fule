import { ipcMain } from 'electron'
import log from 'electron-log'

import type { IPCResponse } from '@shared/types'

/**
 * 创建统一的 IPC handler 包装器
 * 所有 IPC handler 通过此函数注册，自动捕获异常并返回标准化响应格式
 *
 * @param channel - IPC 通道名称
 * @param handler - 实际的业务处理函数
 */
export function createIPCHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult
): void {
  ipcMain.handle(channel, async (_event, ...args: TArgs): Promise<IPCResponse<TResult>> => {
    try {
      const data = await handler(...args)
      return { success: true, data }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      log.error(`[IPC] ${channel} 处理失败:`, errorMessage)
      return { success: false, error: errorMessage }
    }
  })
}
