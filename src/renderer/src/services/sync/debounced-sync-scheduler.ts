/**
 * 防抖同步调度器
 *
 * 负责将高频文件变更事件合并为批量同步操作，避免频繁写入目标文件系统。
 * 核心策略：
 * 1. 300ms 防抖窗口 — 连续编辑时延迟同步，减少不必要的写入
 * 2. 1000ms 最大延迟 — 防止持续编辑导致同步永远不触发
 * 3. 同一文件事件合并 — 只保留最新事件，避免重复同步
 * 4. 回声检测 — 在入队时检测并丢弃回声事件
 * 5. 操作指纹记录 — 在写入目标前记录操作指纹，供后续回声检测使用
 */

import type { OperationTracker } from './operation-tracker'
import type { SyncOrigin } from './operation-tracker'

/** 文件变更事件 */
interface SyncEvent {
  /** 文件路径 */
  filePath: string
  /** 变更类型 */
  type: 'create' | 'update' | 'delete'
  /** 文件内容（delete 时为 undefined） */
  content?: string
  /** 变更来源 */
  origin: SyncOrigin
  /** 事件时间戳 */
  timestamp: number
}

/** 同步执行器接口 — 由外部实现具体的同步逻辑 */
interface SyncExecutor {
  /** 批量执行同步操作 */
  executeBatch(events: SyncEvent[]): Promise<void>
}

/** 防抖窗口大小（毫秒） */
const DEBOUNCE_WINDOW = 300

/** 最大延迟（毫秒）— 防止持续编辑导致同步永远不触发 */
const MAX_DELAY = 1000

/**
 * 防抖同步调度器 — 合并高频文件变更事件并批量执行同步
 */
export class DebouncedSyncScheduler {
  /** 待处理事件的合并窗口，按文件路径去重 */
  private pendingEvents = new Map<string, SyncEvent>()

  /** 防抖定时器句柄 */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  /** 当前防抖窗口的起始时间，用于计算最大延迟 */
  private windowStartTime = 0

  /** 操作追踪器 — 用于回声检测和操作指纹记录 */
  private tracker: OperationTracker

  /** 同步执行器 — 执行实际的批量同步操作 */
  private syncExecutor: SyncExecutor

  constructor(tracker: OperationTracker, syncExecutor: SyncExecutor) {
    this.tracker = tracker
    this.syncExecutor = syncExecutor
  }

  /**
   * 接收文件变更事件并加入防抖队列
   *
   * 流程：回声检测 → 合并同文件事件 → 调度 flush
   *
   * @param event - 文件变更事件
   */
  enqueue(event: SyncEvent): void {
    // 回声检测 — 如果是回声事件，直接丢弃
    if (event.content !== undefined) {
      const echo = this.tracker.isEchoEvent(
        event.filePath,
        event.content,
        event.origin
      )
      if (echo) {
        return
      }
    }

    // 合并同一文件的连续事件（只保留最新的）
    this.pendingEvents.set(event.filePath, event)

    // 清除上一次的防抖定时器
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    // 记录防抖窗口起始时间（首次入队时设置）
    if (this.windowStartTime === 0) {
      this.windowStartTime = Date.now()
    }

    // 检查是否超过最大延迟，超过则立即刷新
    const elapsed = Date.now() - this.windowStartTime
    if (elapsed >= MAX_DELAY) {
      void this.flush()
    } else {
      // 继续防抖等待
      this.debounceTimer = setTimeout(() => {
        void this.flush()
      }, DEBOUNCE_WINDOW)
    }
  }

  /**
   * 刷新：批量执行所有待处理的同步操作
   *
   * 在写入目标之前，先通过 OperationTracker 记录操作指纹，
   * 以便后续回声检测能识别由本次同步引起的文件变更事件。
   */
  async flush(): Promise<void> {
    // 重置定时器和窗口状态
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.windowStartTime = 0

    // 取出所有待处理事件并清空队列
    const events = new Map(this.pendingEvents)
    this.pendingEvents.clear()

    if (events.size === 0) return

    const batch: SyncEvent[] = [...events.values()]

    // 在写入目标之前记录操作指纹，供后续回声检测使用
    for (const event of batch) {
      if (event.content !== undefined && event.type !== 'delete') {
        this.tracker.recordOperation(
          event.filePath,
          event.content,
          event.origin
        )
      }
    }

    // 执行批量同步
    await this.syncExecutor.executeBatch(batch)
  }

  /**
   * 获取当前待处理事件数量（用于测试和监控）
   */
  get pendingCount(): number {
    return this.pendingEvents.size
  }

  /**
   * 销毁调度器，清理定时器
   *
   * 在组件卸载或服务停止时调用，防止内存泄漏。
   */
  dispose(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.pendingEvents.clear()
    this.windowStartTime = 0
  }
}

export type { SyncEvent, SyncExecutor }
export { DEBOUNCE_WINDOW, MAX_DELAY }
