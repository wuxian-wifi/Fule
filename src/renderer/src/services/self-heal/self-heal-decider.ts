/**
 * 自愈决策器
 * 根据当前模式、错误类型、修复尝试次数和上下文信息，
 * 决定是否触发自动修复。只有在 Vibe 模式下、错误可修复、
 * 未超过最大尝试次数且有足够上下文时才会触发自愈。
 */

import { ErrorType } from '../error-interceptors/types'

import type { CapturedError } from '../error-interceptors/types'

/** 同一错误的最大自动修复尝试次数 */
export const MAX_AUTO_FIX_ATTEMPTS = 3

/** 可自动修复的错误类型集合 */
const FIXABLE_ERROR_TYPES: Set<ErrorType> = new Set([
  ErrorType.RUNTIME_EXCEPTION,
  ErrorType.COMPILE_ERROR,
  ErrorType.WHITE_SCREEN,
])

/**
 * 自愈决策器
 * 维护每个错误指纹的修复尝试计数，并根据多个条件决定是否触发自动修复
 */
export class SelfHealDecider {
  /** 修复尝试计数器：fingerprint → 已尝试次数 */
  private fixAttempts = new Map<string, number>()

  /**
   * 决定是否触发自动修复
   *
   * 四个必要条件：
   * 1. 当前处于 Vibe 模式
   * 2. 错误类型属于可修复类型
   * 3. 同一错误的修复尝试次数未超过上限
   * 4. 有足够的上下文信息（至少有源文件或相关文件）
   */
  shouldAutoFix(error: CapturedError): boolean {
    // 条件 1：必须在 Vibe 模式下
    if (error.context.currentMode !== 'vibe') return false

    // 条件 2：错误类型必须是可修复的
    if (!FIXABLE_ERROR_TYPES.has(error.type)) return false

    // 条件 3：未超过最大尝试次数
    const attempts = this.fixAttempts.get(error.fingerprint) ?? 0
    if (attempts >= MAX_AUTO_FIX_ATTEMPTS) return false

    // 条件 4：必须有足够的上下文（至少有源文件或相关文件）
    if (!error.sourceFile && error.context.relatedFiles.length === 0) {
      return false
    }

    return true
  }

  /**
   * 记录一次修复尝试
   * 每次触发自愈时调用，递增对应指纹的尝试计数
   */
  recordAttempt(fingerprint: string): void {
    const current = this.fixAttempts.get(fingerprint) ?? 0
    this.fixAttempts.set(fingerprint, current + 1)
  }

  /**
   * 重置指定指纹的修复尝试计数
   * 修复成功后调用，允许未来再次自动修复同一错误
   */
  resetAttempts(fingerprint: string): void {
    this.fixAttempts.delete(fingerprint)
  }

  /**
   * 获取指定指纹的当前尝试次数（用于测试和监控）
   */
  getAttemptCount(fingerprint: string): number {
    return this.fixAttempts.get(fingerprint) ?? 0
  }

  /**
   * 清除所有修复尝试记录
   */
  clearAll(): void {
    this.fixAttempts.clear()
  }
}
