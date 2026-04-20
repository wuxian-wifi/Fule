/**
 * 自愈引擎单元测试
 * 验证 SelfHealEngine 的完整自愈流程：去重 → 上下文增强 → 决策 → 修复 → 验证
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SelfHealEngine } from '@renderer/services/self-heal/self-heal-engine'
import { ErrorDeduplicator } from '@renderer/services/self-heal/error-deduplicator'
import { ErrorContextEnhancer } from '@renderer/services/self-heal/error-context-enhancer'
import { SelfHealDecider } from '@renderer/services/self-heal/self-heal-decider'
import { ErrorType } from '@renderer/services/error-interceptors/types'
import { useEditorStore } from '@renderer/stores/editor-store'

import type { CapturedError, ErrorContext } from '@renderer/services/error-interceptors/types'
import type { FixResult } from '@renderer/services/self-heal/self-heal-engine'

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

describe('SelfHealEngine', () => {
  let engine: SelfHealEngine
  let deduplicator: ErrorDeduplicator
  let enhancer: ErrorContextEnhancer
  let decider: SelfHealDecider

  beforeEach(() => {
    deduplicator = new ErrorDeduplicator()
    enhancer = new ErrorContextEnhancer()
    decider = new SelfHealDecider()
    engine = new SelfHealEngine(deduplicator, enhancer, decider)

    // mock enhancer.enhance 直接返回原始错误（避免依赖文件系统和 store）
    vi.spyOn(enhancer, 'enhance').mockImplementation(async (error) => error)
  })

  afterEach(() => {
    engine.dispose()
    vi.restoreAllMocks()
  })

  describe('handleError', () => {
    it('重复错误应被去重器丢弃，不触发后续流程', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(true)
      const shouldAutoFixSpy = vi.spyOn(decider, 'shouldAutoFix')

      const error = createTestError()
      await engine.handleError(error)

      // 去重后不应调用决策器
      expect(shouldAutoFixSpy).not.toHaveBeenCalled()
    })

    it('不满足自愈条件时应显示通知而非修复', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(false)
      const recordAttemptSpy = vi.spyOn(decider, 'recordAttempt')

      const error = createTestError()
      await engine.handleError(error)

      // 不应记录修复尝试
      expect(recordAttemptSpy).not.toHaveBeenCalled()
    })

    it('满足自愈条件时应记录修复尝试并请求 AI 修复', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(true)
      const recordAttemptSpy = vi.spyOn(decider, 'recordAttempt')
      const requestFixSpy = vi.spyOn(engine, 'requestFix').mockResolvedValue({
        success: false,
        error: '测试',
      })

      const error = createTestError()
      await engine.handleError(error)

      expect(recordAttemptSpy).toHaveBeenCalledWith(error.fingerprint)
      expect(requestFixSpy).toHaveBeenCalled()
    })

    it('AI 修复成功时应应用变更到编辑器', async () => {
      // 准备 EditorStore 中的标签页
      const editorStore = useEditorStore.getState()
      editorStore.openTab({
        id: 'src/App.tsx',
        filePath: 'src/App.tsx',
        fileName: 'App.tsx',
        content: 'const broken = undefined.x',
        language: 'typescript',
      })

      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(true)

      const fixResult: FixResult = {
        success: true,
        changes: [{ filePath: 'src/App.tsx', content: 'const fixed = "ok"' }],
      }
      vi.spyOn(engine, 'requestFix').mockResolvedValue(fixResult)
      // 跳过验证等待，直接返回成功
      vi.spyOn(engine, 'verifyFix').mockResolvedValue(true)

      const error = createTestError()
      await engine.handleError(error)

      // 验证编辑器内容已更新
      const updatedTab = useEditorStore.getState().openTabs.find(
        (t) => t.filePath === 'src/App.tsx',
      )
      expect(updatedTab?.content).toBe('const fixed = "ok"')

      // 清理
      editorStore.closeTab('src/App.tsx')
    })

    it('修复验证成功时应重置尝试计数', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(true)
      vi.spyOn(engine, 'requestFix').mockResolvedValue({
        success: true,
        changes: [{ filePath: 'src/App.tsx', content: 'fixed' }],
      })
      vi.spyOn(engine, 'verifyFix').mockResolvedValue(true)
      const resetSpy = vi.spyOn(decider, 'resetAttempts')

      const error = createTestError()
      await engine.handleError(error)

      expect(resetSpy).toHaveBeenCalledWith(error.fingerprint)
    })

    it('修复验证失败时不应重置尝试计数', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(true)
      vi.spyOn(engine, 'requestFix').mockResolvedValue({
        success: true,
        changes: [{ filePath: 'src/App.tsx', content: 'still broken' }],
      })
      vi.spyOn(engine, 'verifyFix').mockResolvedValue(false)
      const resetSpy = vi.spyOn(decider, 'resetAttempts')

      const error = createTestError()
      await engine.handleError(error)

      expect(resetSpy).not.toHaveBeenCalled()
    })

    it('引擎销毁后应忽略新错误', async () => {
      const isDuplicateSpy = vi.spyOn(deduplicator, 'isDuplicate')

      engine.dispose()

      const error = createTestError()
      await engine.handleError(error)

      // 销毁后不应调用去重器
      expect(isDuplicateSpy).not.toHaveBeenCalled()
    })

    it('AI 修复返回失败时不应应用变更', async () => {
      vi.spyOn(deduplicator, 'isDuplicate').mockReturnValue(false)
      vi.spyOn(decider, 'shouldAutoFix').mockReturnValue(true)
      vi.spyOn(engine, 'requestFix').mockResolvedValue({
        success: false,
        error: 'AI 后端不可用',
      })
      const verifyFixSpy = vi.spyOn(engine, 'verifyFix')

      const error = createTestError()
      await engine.handleError(error)

      // 修复失败时不应进入验证阶段
      expect(verifyFixSpy).not.toHaveBeenCalled()
    })
  })

  describe('buildFixPrompt', () => {
    it('应包含错误类型和错误信息', () => {
      const error = createTestError()
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('runtime_exception')
      expect(prompt).toContain('Cannot read property of undefined')
    })

    it('应包含错误堆栈', () => {
      const error = createTestError({
        stack: 'TypeError: x is not a function\n    at main.ts:10',
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('TypeError: x is not a function')
      expect(prompt).toContain('at main.ts:10')
    })

    it('无堆栈时不应包含堆栈段落', () => {
      const error = createTestError({ stack: undefined })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).not.toContain('**错误堆栈**')
    })

    it('应包含出错文件路径和行号', () => {
      const error = createTestError({
        sourceFile: 'src/components/Button.tsx',
        sourceLine: 15,
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('src/components/Button.tsx:15')
    })

    it('无行号时只显示文件路径', () => {
      const error = createTestError({
        sourceFile: 'src/App.tsx',
        sourceLine: undefined,
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('**出错文件**: src/App.tsx')
      // 不应有冒号后跟行号
      expect(prompt).not.toContain('src/App.tsx:')
    })

    it('应包含相关文件内容', () => {
      const error = createTestError({
        context: createContext({
          relatedFiles: [
            { path: 'src/utils.ts', content: 'export function add(a, b) { return a + b }' },
          ],
        }),
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('**文件 src/utils.ts**')
      expect(prompt).toContain('export function add(a, b)')
    })

    it('应包含最近的 AI 修改记录', () => {
      const error = createTestError({
        context: createContext({
          recentAiChanges: [
            { file: 'src/App.tsx', diff: '+ const x = 1' },
          ],
        }),
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('**最近的 AI 修改（可能是问题来源）**')
      expect(prompt).toContain('src/App.tsx')
      expect(prompt).toContain('+ const x = 1')
    })

    it('无 AI 修改时不应包含修改段落', () => {
      const error = createTestError({
        context: createContext({ recentAiChanges: [] }),
      })
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).not.toContain('**最近的 AI 修改')
    })

    it('应包含修复指令和 JSON 格式要求', () => {
      const error = createTestError()
      const prompt = engine.buildFixPrompt(error)

      expect(prompt).toContain('请分析错误原因并提供修复方案')
      expect(prompt).toContain('JSON 格式返回修改')
    })
  })

  describe('verifyFix', () => {
    it('超时内无同一错误再现应返回 true（修复成功）', async () => {
      const error = createTestError()

      // 使用短超时加速测试
      const result = await engine.verifyFix(error, 50)

      expect(result).toBe(true)
    })

    it('超时内同一错误再现应返回 false（修复失败）', async () => {
      const error = createTestError({ fingerprint: 'fp-verify-test' })

      // 启动验证，然后在超时前通知同一错误
      const verifyPromise = engine.verifyFix(error, 500)

      // 短暂延迟后通知同一指纹的错误
      setTimeout(() => {
        engine.notifyError(createTestError({ fingerprint: 'fp-verify-test' }))
      }, 20)

      const result = await verifyPromise
      expect(result).toBe(false)
    })

    it('不同指纹的错误不应影响验证结果', async () => {
      const error = createTestError({ fingerprint: 'fp-original' })

      const verifyPromise = engine.verifyFix(error, 100)

      // 通知不同指纹的错误
      setTimeout(() => {
        engine.notifyError(createTestError({ fingerprint: 'fp-different' }))
      }, 20)

      const result = await verifyPromise
      expect(result).toBe(true)
    })
  })

  describe('onError / notifyError', () => {
    it('注册的监听器应收到通知的错误', () => {
      const listener = vi.fn()
      engine.onError(listener)

      const error = createTestError()
      engine.notifyError(error)

      expect(listener).toHaveBeenCalledWith(error)
    })

    it('取消注册后不应再收到通知', () => {
      const listener = vi.fn()
      const unsubscribe = engine.onError(listener)

      unsubscribe()

      engine.notifyError(createTestError())
      expect(listener).not.toHaveBeenCalled()
    })

    it('多个监听器应都收到通知', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      engine.onError(listener1)
      engine.onError(listener2)

      const error = createTestError()
      engine.notifyError(error)

      expect(listener1).toHaveBeenCalledWith(error)
      expect(listener2).toHaveBeenCalledWith(error)
    })
  })

  describe('requestFix', () => {
    it('占位实现应返回失败结果', async () => {
      const result = await engine.requestFix('test prompt')

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('dispose', () => {
    it('销毁后应清理所有错误监听器', () => {
      const listener = vi.fn()
      engine.onError(listener)

      engine.dispose()

      engine.notifyError(createTestError())
      expect(listener).not.toHaveBeenCalled()
    })

    it('销毁后应调用去重器的 dispose', () => {
      const disposeSpy = vi.spyOn(deduplicator, 'dispose')

      engine.dispose()

      expect(disposeSpy).toHaveBeenCalled()
    })
  })
})
