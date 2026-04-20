/**
 * WebContainer 服务单元测试
 * 验证单例启动、状态管理、回调注册和销毁逻辑
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/** 模拟 WebContainer 实例 */
const mockInstance = {
  on: vi.fn(),
  mount: vi.fn().mockResolvedValue(undefined),
  spawn: vi.fn(),
  teardown: vi.fn(),
}

/** 模拟 WebContainer.boot() */
vi.mock('@webcontainer/api', () => ({
  WebContainer: {
    boot: vi.fn().mockResolvedValue(mockInstance),
  },
}))

/** 模拟 PreviewStore */
const mockSetPreviewUrl = vi.fn()
const mockSetIsRunning = vi.fn()

vi.mock('@renderer/stores/preview-store', () => ({
  usePreviewStore: {
    getState: () => ({
      setPreviewUrl: mockSetPreviewUrl,
      setIsRunning: mockSetIsRunning,
    }),
  },
}))

// 动态导入，确保 mock 先注册
const importService = async () => {
  // 每次测试重新导入以获取干净的模块状态
  vi.resetModules()
  return import('@renderer/services/webcontainer-service')
}

describe('WebContainerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInstance.on.mockClear()
    mockInstance.mount.mockClear()
    mockInstance.spawn.mockClear()
    mockInstance.teardown.mockClear()
  })

  it('初始状态应为 idle', async () => {
    const service = await importService()
    expect(service.getBootStatus()).toBe('idle')
    expect(service.getWebContainerInstance()).toBeNull()
  })

  it('boot() 应启动 WebContainer 并返回实例', async () => {
    const service = await importService()
    const instance = await service.boot()

    expect(instance).toBe(mockInstance)
    expect(service.getBootStatus()).toBe('ready')
    expect(service.getWebContainerInstance()).toBe(mockInstance)
  })

  it('重复调用 boot() 应返回同一实例', async () => {
    const service = await importService()
    const first = await service.boot()
    const second = await service.boot()

    expect(first).toBe(second)
  })

  it('boot() 应注册 server-ready 事件监听', async () => {
    const service = await importService()
    await service.boot()

    expect(mockInstance.on).toHaveBeenCalledWith(
      'server-ready',
      expect.any(Function),
    )
  })

  it('server-ready 事件应更新 PreviewStore', async () => {
    const service = await importService()
    await service.boot()

    // 获取注册的 server-ready 回调并手动触发
    const serverReadyCall = mockInstance.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'server-ready',
    )
    expect(serverReadyCall).toBeDefined()

    const callback = serverReadyCall![1] as (port: number, url: string) => void
    callback(3000, 'http://localhost:3000')

    expect(mockSetPreviewUrl).toHaveBeenCalledWith('http://localhost:3000')
    expect(mockSetIsRunning).toHaveBeenCalledWith(true)
  })

  it('registerCallbacks 应在 server-ready 时触发 onServerReady', async () => {
    const service = await importService()
    const onServerReady = vi.fn()
    service.registerCallbacks({ onServerReady })

    await service.boot()

    const serverReadyCall = mockInstance.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'server-ready',
    )
    const callback = serverReadyCall![1] as (port: number, url: string) => void
    callback(5173, 'http://localhost:5173')

    expect(onServerReady).toHaveBeenCalledWith('http://localhost:5173', 5173)
  })

  it('mountFiles 应调用实例的 mount 方法', async () => {
    const service = await importService()
    const files = {
      'index.js': { file: { contents: 'console.log("hello")' } },
    }

    await service.mountFiles(files)

    expect(mockInstance.mount).toHaveBeenCalledWith(files)
  })

  it('teardown 应销毁实例并重置状态', async () => {
    const service = await importService()
    await service.boot()

    service.teardown()

    expect(mockInstance.teardown).toHaveBeenCalled()
    expect(service.getWebContainerInstance()).toBeNull()
    expect(service.getBootStatus()).toBe('idle')
    expect(mockSetPreviewUrl).toHaveBeenCalledWith(null)
    expect(mockSetIsRunning).toHaveBeenCalledWith(false)
  })

  it('boot() 失败时应设置 error 状态并触发 onError 回调', async () => {
    vi.resetModules()

    const bootError = new Error('启动失败')

    vi.doMock('@webcontainer/api', () => ({
      WebContainer: {
        boot: vi.fn().mockRejectedValue(bootError),
      },
    }))

    vi.doMock('@renderer/stores/preview-store', () => ({
      usePreviewStore: {
        getState: () => ({
          setPreviewUrl: vi.fn(),
          setIsRunning: vi.fn(),
        }),
      },
    }))

    const service = await import('@renderer/services/webcontainer-service')
    const onError = vi.fn()
    service.registerCallbacks({ onError })

    await expect(service.boot()).rejects.toThrow('启动失败')
    expect(service.getBootStatus()).toBe('error')
    expect(onError).toHaveBeenCalledWith(bootError)
  })
})
