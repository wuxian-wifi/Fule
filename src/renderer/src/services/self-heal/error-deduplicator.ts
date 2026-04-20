/**
 * 错误去重器
 * 基于错误指纹在时间窗口内去重，防止同一错误短时间内重复触发自愈流程。
 * 指纹由错误类型 + 错误消息 + 源文件路径生成（忽略行号），
 * 因为 AI 修复后行号可能变化，但同一错误的本质不变。
 */

import type { CapturedError } from '../error-interceptors/types'

/** 去重窗口大小（毫秒），窗口内相同指纹的错误自动丢弃 */
export const DEDUP_WINDOW = 30000

/** 过期指纹清理间隔（毫秒） */
export const CLEANUP_INTERVAL = 10000

/**
 * 错误去重器
 * 维护一个指纹 → 时间戳的映射表，在去重窗口内丢弃重复错误
 */
export class ErrorDeduplicator {
  /** 最近的错误指纹集合：fingerprint → 首次出现的时间戳 */
  private recentFingerprints = new Map<string, number>()

  /** 过期指纹清理定时器 ID */
  private cleanupTimerId: ReturnType<typeof setInterval> | null = null

  /** 是否已销毁 */
  private isDisposed = false

  constructor() {
    this.startCleanup()
  }

  /**
   * 判断错误是否为重复错误
   * 如果指纹在去重窗口内已存在，返回 true（应丢弃）；
   * 否则记录指纹并返回 false（新错误，需要处理）
   */
  isDuplicate(error: CapturedError): boolean {
    if (this.isDisposed) return false

    const now = Date.now()
    const existingTimestamp = this.recentFingerprints.get(error.fingerprint)

    if (existingTimestamp !== undefined && now - existingTimestamp < DEDUP_WINDOW) {
      // 窗口内已存在相同指纹，判定为重复
      return true
    }

    // 新错误或已过期，记录指纹
    this.recentFingerprints.set(error.fingerprint, now)
    return false
  }

  /**
   * 清理过期指纹
   * 移除所有超出去重窗口的指纹记录
   */
  cleanupExpired(): void {
    const now = Date.now()
    for (const [fingerprint, timestamp] of this.recentFingerprints) {
      if (now - timestamp >= DEDUP_WINDOW) {
        this.recentFingerprints.delete(fingerprint)
      }
    }
  }

  /**
   * 获取当前记录的指纹数量（用于测试和监控）
   */
  get size(): number {
    return this.recentFingerprints.size
  }

  /**
   * 销毁去重器，清理定时器和所有状态
   */
  dispose(): void {
    this.isDisposed = true
    if (this.cleanupTimerId !== null) {
      clearInterval(this.cleanupTimerId)
      this.cleanupTimerId = null
    }
    this.recentFingerprints.clear()
  }

  /**
   * 启动定期清理过期指纹的定时器
   */
  private startCleanup(): void {
    this.cleanupTimerId = setInterval(() => {
      this.cleanupExpired()
    }, CLEANUP_INTERVAL)
  }
}
