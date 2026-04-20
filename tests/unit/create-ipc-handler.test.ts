import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createIPCHandler 单元测试
 * 验证统一 IPC 错误包装器的行为
 */

// 模拟 electron 模块
vi.mock('electron', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    ipcMain: {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      // 辅助方法：获取已注册的 handler 用于测试
      _getHandler: (channel: string) => handlers.get(channel),
      _clearHandlers: () => handlers.clear()
    }
  }
})

// 模拟 electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// 动态导入以确保 mock 生效
const { ipcMain } = await import('electron')
const { createIPCHandler } = await import('@main/ipc/create-ipc-handler')

describe('createIPCHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(ipcMain as unknown as { _clearHandlers: () => void })._clearHandlers()
  })

  it('应通过 ipcMain.handle 注册 handler', () => {
    createIPCHandler('test:channel', async () => 'result')
    expect(ipcMain.handle).toHaveBeenCalledWith('test:channel', expect.any(Function))
  })

  it('成功时应返回 { success: true, data }', async () => {
    createIPCHandler('test:success', async () => ({ value: 42 }))

    const handler = (ipcMain as unknown as { _getHandler: (ch: string) => (...args: unknown[]) => unknown })._getHandler('test:success')
    const result = await handler({} /* mock event */)

    expect(result).toEqual({
      success: true,
      data: { value: 42 }
    })
  })

  it('handler 抛出 Error 时应返回 { success: false, error }', async () => {
    createIPCHandler('test:error', async () => {
      throw new Error('文件不存在')
    })

    const handler = (ipcMain as unknown as { _getHandler: (ch: string) => (...args: unknown[]) => unknown })._getHandler('test:error')
    const result = await handler({})

    expect(result).toEqual({
      success: false,
      error: '文件不存在'
    })
  })

  it('handler 抛出非 Error 类型时应将其转为字符串', async () => {
    createIPCHandler('test:string-error', async () => {
      throw 'unexpected string error'
    })

    const handler = (ipcMain as unknown as { _getHandler: (ch: string) => (...args: unknown[]) => unknown })._getHandler('test:string-error')
    const result = await handler({})

    expect(result).toEqual({
      success: false,
      error: 'unexpected string error'
    })
  })

  it('应正确传递参数给 handler', async () => {
    const mockHandler = vi.fn(async (a: string, b: number) => `${a}-${b}`)
    createIPCHandler('test:args', mockHandler)

    const handler = (ipcMain as unknown as { _getHandler: (ch: string) => (...args: unknown[]) => unknown })._getHandler('test:args')
    const result = await handler({}, 'hello', 123)

    expect(mockHandler).toHaveBeenCalledWith('hello', 123)
    expect(result).toEqual({
      success: true,
      data: 'hello-123'
    })
  })

  it('同步 handler 也应正常工作', async () => {
    createIPCHandler('test:sync', () => 'sync-result')

    const handler = (ipcMain as unknown as { _getHandler: (ch: string) => (...args: unknown[]) => unknown })._getHandler('test:sync')
    const result = await handler({})

    expect(result).toEqual({
      success: true,
      data: 'sync-result'
    })
  })
})
