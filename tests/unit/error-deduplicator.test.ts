/**
 * 错误去重器单元测试
 * 验证 ErrorDeduplicator 的去重窗口、指纹匹配和过期清理逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ErrorDeduplicator,
  DEDUP_WINDOW,
} from '@renderer/services/self-heal/error-deduplicator'
import { ErrorType } from '@renderer/services/error-interceptors/types'

import type { CapturedError, ErrorContext } from '@renderer/services/error-interceptors/types'

/** 创建测试用的 CapturedError */
function createTestError(overrides: Partial<CapturedError> = {}): CapturedError {
  const defaultContext: ErrorContext = {
    relatedFiles: [],
    recentActions: [],
    recentAiChanges: [],
    currentMode: 'vibe',
  }

  return {
    id: 'err-test-1',
    type: ErrorType.RUNTIME_EXCEPTION,
    message: 'Cannot read property of undefined',
    stack: 'TypeError: Cannot read property of undefined\n    at App.tsx:42',
    sourceFile: 'src/App.tsx',
    sourceLine: 42,
    timestamp: Date.now(),
    fingerprint: 'fp-test-abc',
    context: defaultContext,
    raw: {},
    ...overrides,
  }
}

describe('ErrorDeduplicator', () => {
  let deduplicator: ErrorDeduplicator

  beforeEach(() => {
    vi.useFakeTimers()
    deduplicator = new ErrorDeduplicator()
  })

  afterEach(() => {
    deduplicator.dispose()
    vi.useRealTimers()
  })

  describe('isDuplicate', () => {
    it('首次出现的错误应返回 false（非重复）', () => {
      const error = createTestError()
      expect(deduplicator.isDuplicate(error)).toBe(false)
    })

    it('窗口内相同指纹的错误应返回 true（重复）', () => {
      const error = createTestError()

      // 首次出现
      expect(deduplicator.isDuplicate(error)).toBe(false)
      // 窗口内再次出现
      expect(deduplicator.isDuplicate(error)).toBe(true)
    })

    it('不同指纹的错误应各自独立判断', () => {
      const error1 = createTestError({ fingerprint: 'fp-1' })
      const error2 = createTestError({ fingerprint: 'fp-2' })

      expect(deduplicator.isDuplicate(error1)).toBe(false)
      expect(deduplicator.isDuplicate(error2)).toBe(false)
      // 各自的重复检测互不影响
      expect(deduplicator.isDuplicate(error1)).toBe(true)
      expect(deduplicator.isDuplicate(error2)).toBe(true)
    })

    it('超过去重窗口后相同指纹应返回 false（已过期）', () => {
      const error = createTestError()

      expect(deduplicator.isDuplicate(error)).toBe(false)

      // 推进时间超过去重窗口
      vi.advanceTimersByTime(DEDUP_WINDOW + 1)

      // 过期后应视为新错误
      expect(deduplicator.isDuplicate(error)).toBe(false)
    })

    it('在去重窗口边界内应仍判定为重复', () => {
      const error = createTestError()

      expect(deduplicator.isDuplicate(error)).toBe(false)

      // 推进到窗口边界内（差 1ms）
      vi.advanceTimersByTime(DEDUP_WINDOW - 1)

      expect(deduplicator.isDuplicate(error)).toBe(true)
    })

    it('销毁后应返回 false', () => {
      const error = createTestError()
      deduplicator.isDuplicate(error)
      deduplicator.dispose()

      // 销毁后不再去重
      expect(deduplicator.isDuplicate(error)).toBe(false)
    })
  })

  describe('cleanupExpired', () => {
    it('应清理超出去重窗口的过期指纹', () => {
      const error1 = createTestError({ fingerprint: 'fp-old' })
      deduplicator.isDuplicate(error1)

      // 推进时间使 error1 过期
      vi.advanceTimersByTime(DEDUP_WINDOW + 1)

      const error2 = createTestError({ fingerprint: 'fp-new' })
      deduplicator.isDuplicate(error2)

      // 手动触发清理
      deduplicator.cleanupExpired()

      // 过期的指纹应被清理，只剩新的
      expect(deduplicator.size).toBe(1)
    })

    it('未过期的指纹不应被清理', () => {
      const error = createTestError()
      deduplicator.isDuplicate(error)

      deduplicator.cleanupExpired()

      // 未过期，仍然存在
      expect(deduplicator.size).toBe(1)
    })
  })

  describe('size', () => {
    it('初始大小应为 0', () => {
      expect(deduplicator.size).toBe(0)
    })

    it('记录新指纹后大小应增加', () => {
      deduplicator.isDuplicate(createTestError({ fingerprint: 'fp-1' }))
      expect(deduplicator.size).toBe(1)

      deduplicator.isDuplicate(createTestError({ fingerprint: 'fp-2' }))
      expect(deduplicator.size).toBe(2)
    })

    it('重复指纹不应增加大小', () => {
      const error = createTestError()
      deduplicator.isDuplicate(error)
      deduplicator.isDuplicate(error)

      expect(deduplicator.size).toBe(1)
    })
  })

  describe('dispose', () => {
    it('销毁后应清空所有指纹', () => {
      deduplicator.isDuplicate(createTestError({ fingerprint: 'fp-1' }))
      deduplicator.isDuplicate(createTestError({ fingerprint: 'fp-2' }))

      deduplicator.dispose()

      expect(deduplicator.size).toBe(0)
    })
  })
})
