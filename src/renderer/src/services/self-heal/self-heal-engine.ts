/**
 * 自愈引擎
 * 错误自动修复的核心协调器，串联去重 → 上下文增强 → 决策 → 修复 → 验证的完整闭环。
 * Vibe 模式下静默修复（用户无感知），Spec 模式下仅显示错误通知。
 */

import { useEditorStore } from '../../stores/editor-store'
import { ErrorDeduplicator } from './error-deduplicator'
import { ErrorContextEnhancer } from './error-context-enhancer'
import { SelfHealDecider } from './self-heal-decider'

import type { CapturedError } from '../error-interceptors/types'

/** 修复验证等待时间（毫秒），等待预览重新加载后检查错误是否再现 */
const VERIFY_TIMEOUT = 5000

/** 修复结果 */
export interface FixResult {
  /** 是否修复成功 */
  success: boolean
  /** 修复涉及的文件变更 */
  changes?: Array<{ filePath: string; content: string }>
  /** 失败原因 */
  error?: string
}

/** 错误回调类型，用于验证修复时监听新错误 */
type ErrorListener = (error: CapturedError) => void

/**
 * 自愈引擎
 * 协调错误去重、上下文增强、自愈决策和修复执行的完整流程
 */
export class SelfHealEngine {
  /** 错误去重器 */
  private deduplicator: ErrorDeduplicator
  /** 错误上下文增强器 */
  private enhancer: ErrorContextEnhancer
  /** 自愈决策器 */
  private decider: SelfHealDecider

  /** 错误监听器列表，用于 verifyFix 时监听新错误 */
  private errorListeners: ErrorListener[] = []

  /** 是否已销毁 */
  private isDisposed = false

  constructor(
    deduplicator?: ErrorDeduplicator,
    enhancer?: ErrorContextEnhancer,
    decider?: SelfHealDecider,
  ) {
    this.deduplicator = deduplicator ?? new ErrorDeduplicator()
    this.enhancer = enhancer ?? new ErrorContextEnhancer()
    this.decider = decider ?? new SelfHealDecider()
  }

  /**
   * 处理捕获的错误 — 自愈流程入口
   *
   * 流程：去重 → 上下文增强 → 决策 → 修复 → 验证
   */
  async handleError(error: CapturedError): Promise<void> {
    if (this.isDisposed) return

    // 1. 去重检查 — 窗口内重复错误直接丢弃
    if (this.deduplicator.isDuplicate(error)) {
      return
    }

    // 2. 上下文增强 — 读取源文件、分析依赖、获取 AI 修改记录
    const enrichedError = await this.enhancer.enhance(error)

    // 3. 自愈决策 — 判断是否触发自动修复
    if (!this.decider.shouldAutoFix(enrichedError)) {
      // 不自动修复 — Spec 模式或不满足条件时显示通知
      this.showErrorNotification(enrichedError)
      return
    }

    // 4. 记录修复尝试
    this.decider.recordAttempt(enrichedError.fingerprint)

    // 5. 构造修复提示词
    const prompt = this.buildFixPrompt(enrichedError)

    // 6. 静默请求 AI 修复（不显示在对话历史中）
    const fixResult = await this.requestFix(prompt)

    if (fixResult.success && fixResult.changes) {
      // 7. 应用修复结果（可撤销）
      for (const change of fixResult.changes) {
        this.applyChange(change.filePath, change.content)
      }

      // 8. 验证修复 — 等待 5 秒检查同一错误是否再次出现
      const isFixed = await this.verifyFix(enrichedError, VERIFY_TIMEOUT)

      if (isFixed) {
        // 修复成功，重置尝试计数
        this.decider.resetAttempts(enrichedError.fingerprint)
      }
    }
  }

  /**
   * 构造修复提示词
   * 包含错误信息、堆栈、相关文件内容和最近 AI 修改记录
   */
  buildFixPrompt(error: CapturedError): string {
    const parts: string[] = [
      '## 自动修复请求',
      '',
      `**错误类型**: ${error.type}`,
      `**错误信息**: ${error.message}`,
    ]

    if (error.stack) {
      parts.push('', '**错误堆栈**:', '```', error.stack, '```')
    }

    if (error.sourceFile) {
      parts.push(
        '',
        `**出错文件**: ${error.sourceFile}${error.sourceLine ? `:${error.sourceLine}` : ''}`,
      )
    }

    // 添加相关文件内容
    for (const file of error.context.relatedFiles) {
      parts.push('', `**文件 ${file.path}**:`, '```', file.content, '```')
    }

    // 添加最近的 AI 修改（可能是 AI 引入的 bug）
    if (error.context.recentAiChanges.length > 0) {
      parts.push('', '**最近的 AI 修改（可能是问题来源）**:')
      for (const change of error.context.recentAiChanges) {
        parts.push(`- ${change.file}:`, '```diff', change.diff, '```')
      }
    }

    parts.push(
      '',
      '请分析错误原因并提供修复方案。只修改必要的代码，不要改变功能逻辑。',
      '以 JSON 格式返回修改：[{"filePath": "...", "content": "..."}]',
    )

    return parts.join('\n')
  }

  /**
   * 注册错误监听器
   * 用于 verifyFix 时监听新错误是否与原始错误指纹匹配
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.push(listener)
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== listener)
    }
  }

  /**
   * 通知引擎有新错误发生（供外部错误拦截器调用）
   */
  notifyError(error: CapturedError): void {
    for (const listener of this.errorListeners) {
      listener(error)
    }
  }

  /**
   * 销毁引擎，清理所有资源
   */
  dispose(): void {
    this.isDisposed = true
    this.deduplicator.dispose()
    this.errorListeners = []
  }

  /**
   * 静默请求 AI 修复
   * 占位实现 — 实际 AI 后端集成在后续任务中完成
   * 不显示在对话历史中，不打断用户当前操作
   */
  async requestFix(_prompt: string): Promise<FixResult> {
    // 占位实现：实际 AI 后端集成在需求 8 的任务中完成
    // 返回失败结果，等待 AI 后端就绪后替换
    return {
      success: false,
      error: 'AI 后端尚未集成，自动修复功能暂不可用',
    }
  }

  /**
   * 验证修复是否成功
   * 等待指定时间，检查同一错误是否再次出现
   * 超时未再次出错则认为修复成功
   */
  verifyFix(originalError: CapturedError, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // 超时未再次出错，认为修复成功
        unsubscribe()
        resolve(true)
      }, timeoutMs)

      const unsubscribe = this.onError((newError) => {
        if (newError.fingerprint === originalError.fingerprint) {
          // 同一错误再次出现，修复失败
          clearTimeout(timer)
          unsubscribe()
          resolve(false)
        }
      })
    })
  }

  /**
   * 应用修复变更到编辑器
   * 通过 EditorStore 更新标签页内容，支持撤销
   */
  private applyChange(filePath: string, content: string): void {
    const editorState = useEditorStore.getState()
    const tab = editorState.openTabs.find(
      (t) => t.filePath === filePath || t.filePath.endsWith(filePath),
    )
    if (tab) {
      editorState.updateTabContent(tab.id, content)
    }
  }

  /**
   * 显示错误通知
   * Vibe 模式下不应到达此处（已被 shouldAutoFix 过滤）；
   * Spec 模式下显示错误通知供用户手动处理
   */
  private showErrorNotification(_error: CapturedError): void {
    // 占位实现：实际通知 UI 在后续任务中完成
    // Spec 模式下会在状态栏或通知面板显示错误信息
  }
}
