import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'

import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'
import { OperationTracker } from '@renderer/services/sync/operation-tracker'
import type { SyncOrigin } from '@renderer/services/sync/operation-tracker'

/**
 * Property 9: 文件同步回声检测
 * 验证: 需求 6.3
 *
 * 对任意文件路径和内容，记录 origin_A 写入后收到 origin_B 的相同内容变更
 * 应判定为回声；内容不同应判定为非回声。
 */
describe('Property 9: 文件同步回声检测', () => {
  let fingerprinter: FingerprintCalculator
  let tracker: OperationTracker

  // 同步来源生成器：从四种来源中随机选取
  const originArb = fc.constantFrom<SyncOrigin>(
    'electron',
    'webcontainer',
    'ai',
    'external'
  )

  // 操作记录生成器
  const recordArb = fc.record({
    path: fc.string({ minLength: 1, maxLength: 100 }),
    content: fc.string({ minLength: 0, maxLength: 500 }),
    origin: originArb,
  })

  beforeEach(async () => {
    vi.useFakeTimers()
    fingerprinter = new FingerprintCalculator()
    await fingerprinter.init()
    tracker = new OperationTracker(fingerprinter)
  })

  afterEach(() => {
    tracker.dispose()
    vi.useRealTimers()
  })

  it('记录 origin_A 写入后，origin_B 收到相同内容应判定为回声', () => {
    /**
     * Validates: Requirements 6.3
     */
    fc.assert(
      fc.property(
        recordArb,
        originArb,
        ({ path, content, origin: originA }, originB) => {
          // 前置条件：两个来源必须不同，才能触发回声检测
          fc.pre(originA !== originB)

          // 每次测试使用新的 tracker 避免状态污染
          const localTracker = new OperationTracker(fingerprinter)

          // 记录 origin_A 的写入操作
          localTracker.recordOperation(path, content, originA)

          // origin_B 收到相同内容的变更事件
          const echo = localTracker.isEchoEvent(path, content, originB)

          // 应判定为回声事件
          expect(echo).not.toBeNull()
          expect(echo!.origin).toBe(originA)

          localTracker.dispose()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('记录 origin_A 写入后，origin_B 收到不同内容应判定为非回声', () => {
    /**
     * Validates: Requirements 6.3
     */
    fc.assert(
      fc.property(
        recordArb,
        fc.string({ minLength: 0, maxLength: 500 }),
        originArb,
        ({ path, content: originalContent, origin: originA }, differentContent, originB) => {
          // 前置条件：内容必须不同，来源必须不同
          fc.pre(originalContent !== differentContent)
          fc.pre(originA !== originB)

          const localTracker = new OperationTracker(fingerprinter)

          // 记录 origin_A 的写入操作
          localTracker.recordOperation(path, originalContent, originA)

          // origin_B 收到不同内容的变更事件
          const echo = localTracker.isEchoEvent(path, differentContent, originB)

          // 应判定为非回声事件
          expect(echo).toBeNull()

          localTracker.dispose()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('相同来源的相同内容变更不应判定为回声', () => {
    /**
     * Validates: Requirements 6.3
     */
    fc.assert(
      fc.property(
        recordArb,
        ({ path, content, origin }) => {
          const localTracker = new OperationTracker(fingerprinter)

          // 记录操作
          localTracker.recordOperation(path, content, origin)

          // 同一来源收到相同内容 — 不是回声（不是"对方"触发的）
          const echo = localTracker.isEchoEvent(path, content, origin)
          expect(echo).toBeNull()

          localTracker.dispose()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('回声记录应被一次性消费，第二次相同检测应返回非回声', () => {
    /**
     * Validates: Requirements 6.3
     */
    fc.assert(
      fc.property(
        recordArb,
        originArb,
        ({ path, content, origin: originA }, originB) => {
          fc.pre(originA !== originB)

          const localTracker = new OperationTracker(fingerprinter)

          localTracker.recordOperation(path, content, originA)

          // 第一次检测：应为回声
          const echo1 = localTracker.isEchoEvent(path, content, originB)
          expect(echo1).not.toBeNull()

          // 第二次检测：记录已被消费，应为非回声
          const echo2 = localTracker.isEchoEvent(path, content, originB)
          expect(echo2).toBeNull()

          localTracker.dispose()
        }
      ),
      { numRuns: 100 }
    )
  })
})
