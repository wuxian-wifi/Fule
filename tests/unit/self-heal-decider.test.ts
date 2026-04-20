/**
 * 自愈决策器单元测试
 * 验证 SelfHealDecider 的决策逻辑、尝试计数和重置行为
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SelfHealDecider,
  MAX_AUTO_FIX_ATTEMPTS,
} from '@renderer/services/self-heal/self-heal-decider'
import { ErrorType } from '@renderer/services/error-interceptors/types'

import type { CapturedError, ErrorContext } from '@renderer/services/error-interceptors/types'

/** 创建测试用的 ErrorContext */
function createContext(overrides: Partial<ErrorContext> = {}): ErrorContext {
  return {
    relatedFiles: [],
    recentActions: [],
    recentAiChanges: [],
    currentMode: 'vibe',
    ...overrides,
  }
}

/** 创建测试用的 CapturedError */
function createTestError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    id: 'err-test-1',
    type: ErrorType.RUNTIME_EXCEPTION,
    message: 'Cannot read property of undefined',
    stack: 'TypeError: Cannot read property of undefined\n    at App.tsx:42',
    sourceFile: 'src/App.tsx',
    sourceLine: 42,
    timestamp: Date.now(),
    fingerprint: 'fp-test-abc',
    context: createContext(),
    raw: {},
    ...overrides,
  }
}

describe('SelfHealDecider', () => {
  let decider: SelfHealDecider

  beforeEach(() => {
    decider = new SelfHealDecider()
  })

  describe('shouldAutoFix', () => {
    it('Vibe 模式 + 可修复类型 + 有源文件 + 未超限 → 应返回 true', () => {
      const error = createTestError()
      expect(decider.shouldAutoFix(error)).toBe(true)
    })

    it('Spec 模式下应返回 false', () => {
      const error = createTestError({
        context: createContext({ currentMode: 'spec' }),
      })
      expect(decider.shouldAutoFix(error)).toBe(false)
    })

    it('TERMINAL_ERROR 类型应返回 false（不可自动修复）', () => {
      const error = createTestError({ type: ErrorType.TERMINAL_ERROR })
      expect(decider.shouldAutoFix(error)).toBe(false)
    })

    it('NETWORK_ERROR 类型应返回 false（不可自动修复）', () => {
      const error = createTestError({ type: ErrorType.NETWORK_ERROR })
      expect(decider.shouldAutoFix(error)).toBe(false)
    })

    it('COMPILE_ERROR 类型应返回 true（可修复）', () => {
      const error = createTestError({ type: ErrorType.COMPILE_ERROR })
      expect(decider.shouldAutoFix(error)).toBe(true)
    })

    it('WHITE_SCREEN 类型应返回 true（可修复）', () => {
      const error = createTestError({ type: ErrorType.WHITE_SCREEN })
      expect(decider.shouldAutoFix(error)).toBe(true)
    })

    it('超过最大尝试次数后应返回 false', () => {
      const error = createTestError()

      // 记录 MAX_AUTO_FIX_ATTEMPTS 次尝试
      for (let i = 0; i < MAX_AUTO_FIX_ATTEMPTS; i++) {
        decider.recordAttempt(error.fingerprint)
      }

      expect(decider.shouldAutoFix(error)).toBe(false)
    })

    it('未超过最大尝试次数时应返回 true', () => {
      const error = createTestError()

      // 记录 MAX_AUTO_FIX_ATTEMPTS - 1 次尝试
      for (let i = 0; i < MAX_AUTO_FIX_ATTEMPTS - 1; i++) {
        decider.recordAttempt(error.fingerprint)
      }

      expect(decider.shouldAutoFix(error)).toBe(true)
    })

    it('无源文件且无相关文件时应返回 false（上下文不足）', () => {
      const error = createTestError({
        sourceFile: undefined,
        context: createContext({ relatedFiles: [] }),
      })
      expect(decider.shouldAutoFix(error)).toBe(false)
    })

    it('无源文件但有相关文件时应返回 true', () => {
      const error = createTestError({
        sourceFile: undefined,
        context: createContext({
          relatedFiles: [{ path: 'src/utils.ts', content: 'export const x = 1' }],
        }),
      })
      expect(decider.shouldAutoFix(error)).toBe(true)
    })
  })

  describe('recordAttempt', () => {
    it('应递增指定指纹的尝试计数', () => {
      const fingerprint = 'fp-test'

      expect(decider.getAttemptCount(fingerprint)).toBe(0)

      decider.recordAttempt(fingerprint)
      expect(decider.getAttemptCount(fingerprint)).toBe(1)

      decider.recordAttempt(fingerprint)
      expect(decider.getAttemptCount(fingerprint)).toBe(2)
    })

    it('不同指纹的计数应独立', () => {
      decider.recordAttempt('fp-a')
      decider.recordAttempt('fp-a')
      decider.recordAttempt('fp-b')

      expect(decider.getAttemptCount('fp-a')).toBe(2)
      expect(decider.getAttemptCount('fp-b')).toBe(1)
    })
  })

  describe('resetAttempts', () => {
    it('应清除指定指纹的尝试计数', () => {
      const fingerprint = 'fp-test'

      decider.recordAttempt(fingerprint)
      decider.recordAttempt(fingerprint)
      expect(decider.getAttemptCount(fingerprint)).toBe(2)

      decider.resetAttempts(fingerprint)
      expect(decider.getAttemptCount(fingerprint)).toBe(0)
    })

    it('重置后应允许再次自动修复', () => {
      const error = createTestError()

      // 达到最大尝试次数
      for (let i = 0; i < MAX_AUTO_FIX_ATTEMPTS; i++) {
        decider.recordAttempt(error.fingerprint)
      }
      expect(decider.shouldAutoFix(error)).toBe(false)

      // 重置后应允许再次修复
      decider.resetAttempts(error.fingerprint)
      expect(decider.shouldAutoFix(error)).toBe(true)
    })

    it('重置不存在的指纹不应报错', () => {
      expect(() => decider.resetAttempts('fp-nonexistent')).not.toThrow()
    })
  })

  describe('clearAll', () => {
    it('应清除所有指纹的尝试计数', () => {
      decider.recordAttempt('fp-a')
      decider.recordAttempt('fp-b')
      decider.recordAttempt('fp-c')

      decider.clearAll()

      expect(decider.getAttemptCount('fp-a')).toBe(0)
      expect(decider.getAttemptCount('fp-b')).toBe(0)
      expect(decider.getAttemptCount('fp-c')).toBe(0)
    })
  })
})
