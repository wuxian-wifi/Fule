/**
 * 插件系统单元测试
 *
 * 测试 PluginSystem 的生命周期管理、超时保护和崩溃隔离
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PluginSystem,
  PluginState,
  type PluginManifest,
  type WorkerFactory,
  type PluginWorkerMessage,
} from '@renderer/services/plugin/plugin-system'

/** 创建测试用插件清单 */
function createTestManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: overrides.id ?? 'test-plugin',
    name: overrides.name ?? 'Test Plugin',
    version: overrides.version ?? '1.0.0',
    main: overrides.main ?? './plugin.js',
    activationEvents: overrides.activationEvents ?? ['*'],
    contributes: overrides.contributes ?? {},
  }
}

/**
 * 创建模拟 Worker
 * 返回一个可控的 Worker mock，支持模拟消息和错误事件
 */
function createMockWorker(): {
  worker: Worker
  triggerMessage: (data: PluginWorkerMessage) => void
  triggerError: (error?: ErrorEvent) => void
} {
  let onmessageHandler: ((event: MessageEvent) => void) | null = null
  let onerrorHandler: ((event: ErrorEvent) => void) | null = null

  const worker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onmessageerror: null,
    set onmessage(handler: ((event: MessageEvent) => void) | null) {
      onmessageHandler = handler
    },
    get onmessage() {
      return onmessageHandler
    },
    set onerror(handler: ((event: ErrorEvent) => void) | null) {
      onerrorHandler = handler
    },
    get onerror() {
      return onerrorHandler
    },
  } as unknown as Worker

  return {
    worker,
    triggerMessage: (data: PluginWorkerMessage) => {
      if (onmessageHandler) {
        onmessageHandler({ data } as MessageEvent)
      }
    },
    triggerError: (error?: ErrorEvent) => {
      if (onerrorHandler) {
        onerrorHandler(error ?? (new Event('error') as ErrorEvent))
      }
    },
  }
}

/** 创建模拟 Worker 工厂 */
function createMockWorkerFactory(mockWorkerResult?: ReturnType<typeof createMockWorker>): {
  factory: WorkerFactory
  mockWorker: ReturnType<typeof createMockWorker>
} {
  const mockWorker = mockWorkerResult ?? createMockWorker()
  const factory: WorkerFactory = {
    createWorker: vi.fn(() => mockWorker.worker),
  }
  return { factory, mockWorker }
}

describe('PluginSystem', () => {
  let system: PluginSystem

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    if (system) {
      await system.destroy()
    }
    vi.useRealTimers()
  })

  describe('插件安装', () => {
    it('应正确安装插件并设置状态为 INSTALLED', () => {
      const { factory } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      system.installPlugin(manifest)

      expect(system.getPluginState(manifest.id)).toBe(PluginState.INSTALLED)
      expect(system.getPluginList()).toHaveLength(1)
    })

    it('重复安装同一插件应抛出错误', () => {
      const { factory } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      system.installPlugin(manifest)

      expect(() => system.installPlugin(manifest)).toThrow('插件 test-plugin 已安装')
    })
  })

  describe('插件加载', () => {
    it('加载插件时应创建 Worker 并发送 LOAD 消息', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      // 在下一个微任务中触发 PLUGIN_READY
      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      expect(factory.createWorker).toHaveBeenCalledWith(manifest)
      expect(mockWorker.worker.postMessage).toHaveBeenCalledWith({
        type: 'LOAD',
        manifest,
      })
    })

    it('收到 PLUGIN_READY 后应将状态设为 ACTIVE', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ACTIVE)
    })

    it('未安装的插件加载时应自动安装', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      expect(system.getPluginList()).toHaveLength(1)
      expect(system.getPluginState(manifest.id)).toBe(PluginState.ACTIVE)
    })

    it('已激活的插件不应重复加载', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      // 第一次加载
      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      // 第二次加载应直接返回
      await system.loadPlugin(manifest)

      // createWorker 只应被调用一次
      expect(factory.createWorker).toHaveBeenCalledTimes(1)
    })
  })

  describe('加载超时保护', () => {
    it('加载超过 10 秒应终止 Worker 并标记为 ERROR', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)

      // 推进时间超过 10 秒
      vi.advanceTimersByTime(10_000)
      await loadPromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
      expect(mockWorker.worker.terminate).toHaveBeenCalled()
    })

    it('在超时前收到 PLUGIN_READY 应正常激活', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)

      // 5 秒后收到就绪消息（未超时）
      vi.advanceTimersByTime(5_000)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ACTIVE)
    })

    it('自定义超时时间应生效', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      // 设置 2 秒超时
      system = new PluginSystem(factory, 2_000)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)

      // 推进 2 秒
      vi.advanceTimersByTime(2_000)
      await loadPromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
      expect(mockWorker.worker.terminate).toHaveBeenCalled()
    })
  })

  describe('崩溃隔离', () => {
    it('Worker 崩溃应标记插件为 ERROR 并终止 Worker', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerError()
      await loadPromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
      expect(mockWorker.worker.terminate).toHaveBeenCalled()
    })

    it('插件崩溃不应影响其他已激活的插件', async () => {
      // 为两个插件创建独立的 Worker
      const mockWorker1 = createMockWorker()
      const mockWorker2 = createMockWorker()
      let callCount = 0
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          callCount++
          return callCount === 1 ? mockWorker1.worker : mockWorker2.worker
        }),
      }
      system = new PluginSystem(factory)

      // 加载第一个插件并激活
      const manifest1 = createTestManifest({ id: 'plugin-1', name: 'Plugin 1' })
      const load1 = system.loadPlugin(manifest1)
      mockWorker1.triggerMessage({ type: 'PLUGIN_READY' })
      await load1

      // 加载第二个插件并使其崩溃
      const manifest2 = createTestManifest({ id: 'plugin-2', name: 'Plugin 2' })
      const load2 = system.loadPlugin(manifest2)
      mockWorker2.triggerError()
      await load2

      // 第一个插件应保持 ACTIVE
      expect(system.getPluginState('plugin-1')).toBe(PluginState.ACTIVE)
      // 第二个插件应为 ERROR
      expect(system.getPluginState('plugin-2')).toBe(PluginState.ERROR)
    })

    it('Worker 创建失败应标记为 ERROR 而不抛出异常', async () => {
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          throw new Error('Worker 创建失败')
        }),
      }
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      // 不应抛出异常
      await system.loadPlugin(manifest)

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
    })
  })

  describe('插件卸载', () => {
    it('卸载插件应终止 Worker 并从注册表移除', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      await system.unloadPlugin(manifest.id)

      expect(mockWorker.worker.terminate).toHaveBeenCalled()
      expect(system.getPluginList()).toHaveLength(0)
      expect(system.getPluginState(manifest.id)).toBeUndefined()
    })

    it('卸载不存在的插件应静默返回', async () => {
      const { factory } = createMockWorkerFactory()
      system = new PluginSystem(factory)

      // 不应抛出异常
      await system.unloadPlugin('non-existent')
    })
  })

  describe('插件启用/禁用', () => {
    it('禁用插件应终止 Worker 并设置状态为 DISABLED', async () => {
      const { factory, mockWorker } = createMockWorkerFactory()
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      const loadPromise = system.loadPlugin(manifest)
      mockWorker.triggerMessage({ type: 'PLUGIN_READY' })
      await loadPromise

      system.disablePlugin(manifest.id)

      expect(system.getPluginState(manifest.id)).toBe(PluginState.DISABLED)
      expect(mockWorker.worker.terminate).toHaveBeenCalled()
      // 插件仍在注册表中
      expect(system.getPluginList()).toHaveLength(1)
    })

    it('启用已禁用的插件应重新加载', async () => {
      const mockWorker1 = createMockWorker()
      const mockWorker2 = createMockWorker()
      let callCount = 0
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          callCount++
          return callCount === 1 ? mockWorker1.worker : mockWorker2.worker
        }),
      }
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      // 加载并激活
      const load1 = system.loadPlugin(manifest)
      mockWorker1.triggerMessage({ type: 'PLUGIN_READY' })
      await load1

      // 禁用
      system.disablePlugin(manifest.id)
      expect(system.getPluginState(manifest.id)).toBe(PluginState.DISABLED)

      // 重新启用
      const enablePromise = system.enablePlugin(manifest.id)
      mockWorker2.triggerMessage({ type: 'PLUGIN_READY' })
      await enablePromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ACTIVE)
    })

    it('启用 ERROR 状态的插件应重新加载', async () => {
      const mockWorker1 = createMockWorker()
      const mockWorker2 = createMockWorker()
      let callCount = 0
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          callCount++
          return callCount === 1 ? mockWorker1.worker : mockWorker2.worker
        }),
      }
      system = new PluginSystem(factory)
      const manifest = createTestManifest()

      // 加载并使其崩溃
      const load1 = system.loadPlugin(manifest)
      mockWorker1.triggerError()
      await load1
      expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)

      // 重新启用
      const enablePromise = system.enablePlugin(manifest.id)
      mockWorker2.triggerMessage({ type: 'PLUGIN_READY' })
      await enablePromise

      expect(system.getPluginState(manifest.id)).toBe(PluginState.ACTIVE)
    })

    it('禁用不存在的插件应静默返回', () => {
      const { factory } = createMockWorkerFactory()
      system = new PluginSystem(factory)

      // 不应抛出异常
      system.disablePlugin('non-existent')
    })
  })

  describe('插件列表查询', () => {
    it('应返回所有已注册插件的清单和状态', async () => {
      const mockWorker1 = createMockWorker()
      const mockWorker2 = createMockWorker()
      let callCount = 0
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          callCount++
          return callCount === 1 ? mockWorker1.worker : mockWorker2.worker
        }),
      }
      system = new PluginSystem(factory)

      const manifest1 = createTestManifest({ id: 'plugin-1', name: 'Plugin 1' })
      const manifest2 = createTestManifest({ id: 'plugin-2', name: 'Plugin 2' })

      // 加载第一个插件
      const load1 = system.loadPlugin(manifest1)
      mockWorker1.triggerMessage({ type: 'PLUGIN_READY' })
      await load1

      // 安装第二个插件（不加载）
      system.installPlugin(manifest2)

      const list = system.getPluginList()
      expect(list).toHaveLength(2)
      expect(list.find((p) => p.manifest.id === 'plugin-1')?.state).toBe(PluginState.ACTIVE)
      expect(list.find((p) => p.manifest.id === 'plugin-2')?.state).toBe(PluginState.INSTALLED)
    })

    it('空系统应返回空列表', () => {
      const { factory } = createMockWorkerFactory()
      system = new PluginSystem(factory)

      expect(system.getPluginList()).toHaveLength(0)
    })
  })

  describe('系统销毁', () => {
    it('销毁应终止所有 Worker 并清空注册表', async () => {
      const mockWorker1 = createMockWorker()
      const mockWorker2 = createMockWorker()
      let callCount = 0
      const factory: WorkerFactory = {
        createWorker: vi.fn(() => {
          callCount++
          return callCount === 1 ? mockWorker1.worker : mockWorker2.worker
        }),
      }
      system = new PluginSystem(factory)

      const manifest1 = createTestManifest({ id: 'plugin-1' })
      const manifest2 = createTestManifest({ id: 'plugin-2' })

      const load1 = system.loadPlugin(manifest1)
      mockWorker1.triggerMessage({ type: 'PLUGIN_READY' })
      await load1

      const load2 = system.loadPlugin(manifest2)
      mockWorker2.triggerMessage({ type: 'PLUGIN_READY' })
      await load2

      await system.destroy()

      expect(mockWorker1.worker.terminate).toHaveBeenCalled()
      expect(mockWorker2.worker.terminate).toHaveBeenCalled()
      expect(system.getPluginList()).toHaveLength(0)
    })
  })
})
