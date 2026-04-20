/**
 * 属性测试：插件沙箱隔离
 *
 * Property 12: 对任意在沙箱中运行的插件，崩溃时 IDE 主进程应保持正常运行，
 * 插件状态标记为 ERROR。
 *
 * **Validates: Requirements 11.2**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import {
  PluginSystem,
  PluginState,
  type PluginManifest,
  type WorkerFactory,
  type PluginWorkerMessage,
} from '@renderer/services/plugin/plugin-system'

// ===== 生成器 =====

/** 生成合法的插件 ID（非空字符串，无空白） */
const pluginIdArb = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')), {
    minLength: 1,
    maxLength: 30,
  })

/** 生成插件版本号 */
const versionArb = fc.tuple(fc.nat(99), fc.nat(99), fc.nat(99)).map(([a, b, c]) => `${a}.${b}.${c}`)

/** 崩溃类型 — 模拟不同的插件崩溃场景 */
type CrashType = 'throw' | 'timeout' | 'error-event'

const crashTypeArb: fc.Arbitrary<CrashType> = fc.constantFrom('throw', 'timeout', 'error-event')

/** 生成插件清单 */
const pluginManifestArb: fc.Arbitrary<PluginManifest> = fc.record({
  id: pluginIdArb,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  version: versionArb,
  main: fc.constant('./plugin.js'),
  activationEvents: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
  contributes: fc.record({
    languages: fc.option(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          name: fc.string({ minLength: 1, maxLength: 20 }),
          extensions: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 3 }),
        }),
        { minLength: 0, maxLength: 2 },
      ),
      { nil: undefined },
    ),
    themes: fc.option(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          label: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        { minLength: 0, maxLength: 2 },
      ),
      { nil: undefined },
    ),
    commands: fc.option(
      fc.array(
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 10 }),
          title: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        { minLength: 0, maxLength: 2 },
      ),
      { nil: undefined },
    ),
  }),
})

// ===== 辅助函数 =====

/**
 * 创建可控的模拟 Worker
 * 返回 Worker mock 和触发函数，用于模拟不同的崩溃场景
 */
function createControllableMockWorker(): {
  worker: Worker
  triggerReady: () => void
  triggerError: () => void
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
    triggerReady: () => {
      if (onmessageHandler) {
        onmessageHandler({ data: { type: 'PLUGIN_READY' } as PluginWorkerMessage } as MessageEvent)
      }
    },
    triggerError: () => {
      if (onerrorHandler) {
        onerrorHandler(new Event('error') as ErrorEvent)
      }
    },
  }
}

describe('Property 12: 插件沙箱隔离', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('对任意插件清单，Worker 报错时插件状态应为 ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(pluginManifestArb, async (manifest) => {
        // 创建可控 Worker
        const mockWorker = createControllableMockWorker()
        const factory: WorkerFactory = {
          createWorker: vi.fn(() => mockWorker.worker),
        }
        const system = new PluginSystem(factory)

        try {
          // 加载插件并触发 Worker 错误
          const loadPromise = system.loadPlugin(manifest)
          mockWorker.triggerError()
          await loadPromise

          // 不变量：插件状态应为 ERROR
          expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
          // 不变量：Worker 应被终止
          expect(mockWorker.worker.terminate).toHaveBeenCalled()
        } finally {
          await system.destroy()
        }
      }),
      { numRuns: 100 },
    )
  })

  it('对任意插件清单，Worker 超时时插件状态应为 ERROR', async () => {
    await fc.assert(
      fc.asyncProperty(pluginManifestArb, async (manifest) => {
        const mockWorker = createControllableMockWorker()
        const factory: WorkerFactory = {
          createWorker: vi.fn(() => mockWorker.worker),
        }
        // 使用较短的超时便于测试
        const system = new PluginSystem(factory, 100)

        try {
          // 加载插件但不发送 PLUGIN_READY — 模拟超时
          const loadPromise = system.loadPlugin(manifest)
          vi.advanceTimersByTime(100)
          await loadPromise

          // 不变量：超时后插件状态应为 ERROR
          expect(system.getPluginState(manifest.id)).toBe(PluginState.ERROR)
          // 不变量：Worker 应被终止
          expect(mockWorker.worker.terminate).toHaveBeenCalled()
        } finally {
          await system.destroy()
        }
      }),
      { numRuns: 100 },
    )
  })

  it('插件崩溃后系统应继续正常运行，其他插件不受影响', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成两个不同 ID 的插件清单
        pluginManifestArb,
        pluginManifestArb,
        crashTypeArb,
        async (manifest1, manifest2, crashType) => {
          // 确保两个插件 ID 不同
          const m1 = { ...manifest1, id: `good-${manifest1.id}` }
          const m2 = { ...manifest2, id: `crash-${manifest2.id}` }

          const goodWorker = createControllableMockWorker()
          const crashWorker = createControllableMockWorker()
          let callCount = 0
          const factory: WorkerFactory = {
            createWorker: vi.fn(() => {
              callCount++
              return callCount === 1 ? goodWorker.worker : crashWorker.worker
            }),
          }
          const system = new PluginSystem(factory, 100)

          try {
            // 加载第一个插件并正常激活
            const load1 = system.loadPlugin(m1)
            goodWorker.triggerReady()
            await load1
            expect(system.getPluginState(m1.id)).toBe(PluginState.ACTIVE)

            // 加载第二个插件并根据崩溃类型模拟崩溃
            const load2 = system.loadPlugin(m2)
            switch (crashType) {
              case 'throw':
              case 'error-event':
                // 模拟 Worker 运行时错误
                crashWorker.triggerError()
                break
              case 'timeout':
                // 模拟加载超时（不发送 PLUGIN_READY）
                vi.advanceTimersByTime(100)
                break
            }
            await load2

            // 核心不变量：崩溃插件状态为 ERROR
            expect(system.getPluginState(m2.id)).toBe(PluginState.ERROR)

            // 核心不变量：正常插件保持 ACTIVE，不受崩溃影响
            expect(system.getPluginState(m1.id)).toBe(PluginState.ACTIVE)

            // 核心不变量：系统仍可正常操作（查询插件列表）
            const list = system.getPluginList()
            expect(list.length).toBe(2)
          } finally {
            await system.destroy()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
