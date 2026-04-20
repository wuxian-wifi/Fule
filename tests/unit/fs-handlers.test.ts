import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 文件系统 IPC handler 单元测试
 * 验证 fs:read、fs:write、fs:watch、fs:unwatch 的注册与行为
 */

// 存储已注册的 handler，用于测试调用
const registeredHandlers = new Map<string, (...args: unknown[]) => unknown>()

// 模拟 electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers.set(channel, handler)
    })
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

// 模拟 electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

// 模拟 node:fs/promises
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockWatch = vi.fn()

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    watch: (...args: unknown[]) => mockWatch(...args)
  },
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  watch: (...args: unknown[]) => mockWatch(...args)
}))

const { registerFsHandlers } = await import('@main/ipc/fs-handlers')

/**
 * 辅助函数：调用已注册的 IPC handler
 * 模拟 ipcMain.handle 的调用方式（第一个参数是 event）
 */
async function invokeHandler(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = registeredHandlers.get(channel)
  if (!handler) throw new Error(`未找到 handler: ${channel}`)
  return handler({}, ...args)
}

describe('文件系统 IPC handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registeredHandlers.clear()
    registerFsHandlers()
  })

  describe('fs:read', () => {
    it('应注册 fs:read handler', () => {
      expect(registeredHandlers.has('fs:read')).toBe(true)
    })

    it('成功读取文件时应返回文件内容和路径', async () => {
      mockReadFile.mockResolvedValue('文件内容')

      const result = await invokeHandler('fs:read', '/test/file.txt')

      expect(result).toEqual({
        success: true,
        data: { content: '文件内容', path: '/test/file.txt' }
      })
      expect(mockReadFile).toHaveBeenCalledWith('/test/file.txt', { encoding: 'utf-8' })
    })

    it('文件不存在时应返回错误', async () => {
      mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

      const result = await invokeHandler('fs:read', '/nonexistent.txt')

      expect(result).toEqual({
        success: false,
        error: 'ENOENT: no such file'
      })
    })
  })

  describe('fs:write', () => {
    it('应注册 fs:write handler', () => {
      expect(registeredHandlers.has('fs:write')).toBe(true)
    })

    it('成功写入文件时应返回 success', async () => {
      mockWriteFile.mockResolvedValue(undefined)

      const result = await invokeHandler('fs:write', {
        path: '/test/output.txt',
        content: '新内容'
      })

      expect(result).toEqual({ success: true, data: undefined })
      expect(mockWriteFile).toHaveBeenCalledWith(
        '/test/output.txt',
        '新内容',
        { encoding: 'utf-8' }
      )
    })

    it('写入失败时应返回错误', async () => {
      mockWriteFile.mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await invokeHandler('fs:write', {
        path: '/readonly/file.txt',
        content: '内容'
      })

      expect(result).toEqual({
        success: false,
        error: 'EACCES: permission denied'
      })
    })
  })

  describe('fs:watch', () => {
    it('应注册 fs:watch handler', () => {
      expect(registeredHandlers.has('fs:watch')).toBe(true)
    })

    it('成功注册监听时应返回 success', async () => {
      // 模拟 async iterable watcher，立即结束
      const mockAsyncIterable = {
        [Symbol.asyncIterator]: () => ({
          next: vi.fn().mockResolvedValue({ done: true, value: undefined })
        })
      }
      mockWatch.mockReturnValue(mockAsyncIterable)

      const result = await invokeHandler('fs:watch', '/test/watched.txt')

      expect(result).toEqual({ success: true, data: undefined })
    })
  })

  describe('fs:unwatch', () => {
    it('应注册 fs:unwatch handler', () => {
      expect(registeredHandlers.has('fs:unwatch')).toBe(true)
    })

    it('对未监听的文件调用 unwatch 应返回 success', async () => {
      const result = await invokeHandler('fs:unwatch', '/not/watched.txt')

      expect(result).toEqual({ success: true, data: undefined })
    })
  })

  it('应注册全部四个文件系统 handler', () => {
    const expectedChannels = ['fs:read', 'fs:write', 'fs:watch', 'fs:unwatch']
    for (const channel of expectedChannels) {
      expect(registeredHandlers.has(channel)).toBe(true)
    }
  })
})
