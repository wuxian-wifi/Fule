import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'
import { OperationTracker } from '@renderer/services/sync/operation-tracker'
import {
  DebouncedSyncScheduler,
  DEBOUNCE_WINDOW,
  MAX_DELAY,
} from '@renderer/services/sync/debounced-sync-scheduler'
import type { SyncEvent, SyncExecutor } from '@renderer/services/sync/debounced-sync-scheduler'

describe('DebouncedSyncScheduler - 防抖同步调度器', () => {
  let fingerprinter: FingerprintCalculator
  let tracker: OperationTracker
  let executor: SyncExecutor
  let executeBatchMock: ReturnType<typeof vi.fn>
  let scheduler: DebouncedSyncScheduler

  beforeEach(async () => {
    vi.useFakeTimers()
    fingerprinter = new FingerprintCalculator()
    await fingerprinter.init()
    tracker = new OperationTracker(fingerprinter)
    executeBatchMock = vi.fn().mockResolvedValue(undefined)
    executor = { executeBatch: executeBatchMock }
    scheduler = new DebouncedSyncScheduler(tracker, executor)
  })

  afterEach(() => {
    scheduler.dispose()
    tracker.dispose()
    vi.useRealTimers()
  })

  /** 创建测试用的 SyncEvent */
  function createEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
    return {
      filePath: 'src/app.tsx',
      type: 'update',
      content: 'const App = () => <div>Hello</div>',
      origin: 'electron',
      timestamp: Date.now(),
      ...overrides,
    }
  }

  describe('enqueue - 事件入队', () => {
    it('入队后应在防抖窗口结束时触发 flush', async () => {
      scheduler.enqueue(createEvent())

      // 防抖窗口内不应触发
      expect(executeBatchMock).not.toHaveBeenCalled()

      // 推进到防抖窗口结束
      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      expect(executeBatchMock).toHaveBeenCalledTimes(1)
      expect(executeBatchMock).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ filePath: 'src/app.tsx' })])
      )
    })

    it('同一文件的连续事件应合并为最新事件', async () => {
      // 连续入队同一文件的不同版本
      scheduler.enqueue(createEvent({ content: 'version1' }))
      scheduler.enqueue(createEvent({ content: 'version2' }))
      scheduler.enqueue(createEvent({ content: 'version3' }))

      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      expect(executeBatchMock).toHaveBeenCalledTimes(1)
      const batch = executeBatchMock.mock.calls[0][0] as SyncEvent[]
      // 只保留最新版本
      expect(batch).toHaveLength(1)
      expect(batch[0].content).toBe('version3')
    })

    it('不同文件的事件应分别保留', async () => {
      scheduler.enqueue(createEvent({ filePath: 'a.ts', content: 'contentA' }))
      scheduler.enqueue(createEvent({ filePath: 'b.ts', content: 'contentB' }))

      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      expect(executeBatchMock).toHaveBeenCalledTimes(1)
      const batch = executeBatchMock.mock.calls[0][0] as SyncEvent[]
      expect(batch).toHaveLength(2)
    })

    it('回声事件应被丢弃不入队', async () => {
      const content = 'echo content'
      // 先记录一次操作（模拟之前的同步写入）
      tracker.recordOperation('app.tsx', content, 'electron')

      // 入队来自 webcontainer 的相同内容事件（回声）
      scheduler.enqueue(
        createEvent({
          filePath: 'app.tsx',
          content,
          origin: 'webcontainer',
        })
      )

      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      // 回声事件被丢弃，不应触发 executeBatch
      expect(executeBatchMock).not.toHaveBeenCalled()
    })

    it('非回声事件应正常入队', async () => {
      const content = 'original'
      tracker.recordOperation('app.tsx', content, 'electron')

      // 入队不同内容的事件（非回声）
      scheduler.enqueue(
        createEvent({
          filePath: 'app.tsx',
          content: 'different content',
          origin: 'webcontainer',
        })
      )

      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      expect(executeBatchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('防抖窗口与最大延迟', () => {
    it('连续入队应重置防抖定时器', async () => {
      scheduler.enqueue(createEvent({ content: 'v1' }))

      // 推进 200ms（未到 300ms 防抖窗口）
      await vi.advanceTimersByTimeAsync(200)
      expect(executeBatchMock).not.toHaveBeenCalled()

      // 再次入队，重置防抖
      scheduler.enqueue(createEvent({ content: 'v2' }))

      // 再推进 200ms（距第二次入队 200ms，未到 300ms）
      await vi.advanceTimersByTimeAsync(200)
      expect(executeBatchMock).not.toHaveBeenCalled()

      // 再推进 100ms（距第二次入队 300ms，防抖窗口到期）
      await vi.advanceTimersByTimeAsync(100)
      expect(executeBatchMock).toHaveBeenCalledTimes(1)
    })

    it('超过最大延迟时应立即刷新', async () => {
      // 第一次入队，设置窗口起始时间
      scheduler.enqueue(createEvent({ content: 'v1' }))

      // 在防抖窗口到期前（200ms）再次入队，重置防抖定时器
      vi.advanceTimersByTime(200)
      scheduler.enqueue(createEvent({ content: 'v2' }))

      // 再推进 200ms（总计 400ms），再次入队重置防抖
      vi.advanceTimersByTime(200)
      scheduler.enqueue(createEvent({ content: 'v3' }))

      // 再推进 200ms（总计 600ms），再次入队重置防抖
      vi.advanceTimersByTime(200)
      scheduler.enqueue(createEvent({ content: 'v4' }))

      // 再推进 200ms（总计 800ms），再次入队重置防抖
      vi.advanceTimersByTime(200)
      scheduler.enqueue(createEvent({ content: 'v5' }))

      // 此时 elapsed = 800ms，还未到 MAX_DELAY，不应触发
      expect(executeBatchMock).not.toHaveBeenCalled()

      // 再推进 200ms（总计 1000ms），再次入队
      // elapsed >= MAX_DELAY，应立即触发 flush
      vi.advanceTimersByTime(200)
      scheduler.enqueue(createEvent({ content: 'v6' }))

      // flush 是异步的，等待微任务
      await vi.advanceTimersByTimeAsync(0)

      expect(executeBatchMock).toHaveBeenCalled()
    })

    it('超过最大延迟后入队应立即触发 flush', async () => {
      // 第一次入队
      scheduler.enqueue(createEvent({ content: 'v1' }))

      // 推进到超过最大延迟（但不触发防抖定时器）
      vi.advanceTimersByTime(MAX_DELAY + 10)

      // 此时再入队，elapsed >= MAX_DELAY，应立即 flush
      scheduler.enqueue(createEvent({ content: 'v2' }))

      // flush 是异步的，等待微任务完成
      await vi.advanceTimersByTimeAsync(0)

      // 应该至少触发了一次（防抖定时器到期 + 立即 flush）
      expect(executeBatchMock).toHaveBeenCalled()
    })
  })

  describe('flush - 批量执行', () => {
    it('flush 应在写入前记录操作指纹', async () => {
      const recordSpy = vi.spyOn(tracker, 'recordOperation')
      const content = 'new content'

      scheduler.enqueue(createEvent({ filePath: 'a.ts', content }))
      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      // 应在 executeBatch 之前调用 recordOperation
      expect(recordSpy).toHaveBeenCalledWith('a.ts', content, 'electron')
      expect(executeBatchMock).toHaveBeenCalledTimes(1)
    })

    it('delete 事件不应记录操作指纹', async () => {
      const recordSpy = vi.spyOn(tracker, 'recordOperation')

      scheduler.enqueue(
        createEvent({
          filePath: 'deleted.ts',
          type: 'delete',
          content: undefined,
        })
      )
      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      // delete 事件不记录指纹
      expect(recordSpy).not.toHaveBeenCalled()
      // 但仍然执行批量同步
      expect(executeBatchMock).toHaveBeenCalledTimes(1)
    })

    it('空队列 flush 不应调用 executeBatch', async () => {
      await scheduler.flush()
      expect(executeBatchMock).not.toHaveBeenCalled()
    })

    it('flush 后队列应被清空', async () => {
      scheduler.enqueue(createEvent())
      expect(scheduler.pendingCount).toBe(1)

      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW)

      expect(scheduler.pendingCount).toBe(0)
    })
  })

  describe('dispose - 资源清理', () => {
    it('dispose 后定时器应被清理', async () => {
      scheduler.enqueue(createEvent())
      scheduler.dispose()

      // 推进时间不应触发 flush
      await vi.advanceTimersByTimeAsync(DEBOUNCE_WINDOW + 100)
      expect(executeBatchMock).not.toHaveBeenCalled()
    })

    it('dispose 后待处理事件应被清空', () => {
      scheduler.enqueue(createEvent())
      expect(scheduler.pendingCount).toBe(1)

      scheduler.dispose()
      expect(scheduler.pendingCount).toBe(0)
    })
  })
})
