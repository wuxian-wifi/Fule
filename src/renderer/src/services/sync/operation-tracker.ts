/**
 * 操作追踪器 — 同步死循环防护的核心组件
 *
 * 原理：每次同步操作都会生成一个"操作指纹"并记录来源。
 * 当收到文件变更事件时，计算变更后的文件指纹，
 * 如果该指纹已在追踪表中且来源是"对方"，则判定为回声事件并丢弃。
 *
 * 示例流程：
 * 1. 用户在 Monaco 编辑 app.tsx → Electron 写入磁盘
 * 2. 同步引擎计算 app.tsx 新指纹 = "abc123"，记录 {hash: "abc123", origin: "electron"}
 * 3. 同步引擎将 app.tsx 写入 WebContainers
 * 4. WebContainers 触发文件变更事件
 * 5. 操作追踪器计算指纹 = "abc123"，发现已存在且 origin = "electron"
 * 6. 判定为回声事件 → 丢弃，不回写 Electron
 */

import type { FingerprintCalculator } from './fingerprint-calculator'

/** 同步操作的来源标识 */
type SyncOrigin = 'electron' | 'webcontainer' | 'ai' | 'external'

/** 已追踪的操作记录 */
interface TrackedOperation {
  /** 文件内容指纹 */
  fileHash: string
  /** 操作来源 */
  origin: SyncOrigin
  /** 记录时间戳 */
  timestamp: number
  /** 唯一操作 ID（用于调试追踪） */
  operationId: string
  /** 全局递增序列号 */
  sequenceNumber: number
}

/** 操作记录的 TTL（毫秒），超过此时间的记录自动清理 */
const OPERATION_TTL = 5000

/** 每个文件保留的最大操作记录数 */
const MAX_RECORDS_PER_FILE = 10

/** 定期清理间隔（毫秒） */
const CLEANUP_INTERVAL = 10000

/**
 * 操作追踪器 — 通过文件指纹识别回声事件，防止双向同步死循环
 */
export class OperationTracker {
  /** 文件路径 → 最近的操作记录列表 */
  private trackingTable = new Map<string, TrackedOperation[]>()

  /** 全局递增序列计数器 */
  private sequenceCounter = 0

  /** 指纹计算器实例 */
  private fingerprinter: FingerprintCalculator

  /** 定期清理定时器句柄 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(fingerprinter: FingerprintCalculator) {
    this.fingerprinter = fingerprinter
    // 启动定期清理过期记录的定时器
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL)
  }

  /**
   * 记录一次同步操作
   *
   * 在执行同步写入之前调用，将操作指纹和来源记录到追踪表中。
   * 后续收到的相同指纹、不同来源的事件将被判定为回声事件。
   *
   * @param filePath - 文件路径
   * @param content - 文件内容
   * @param origin - 操作来源
   * @returns 唯一操作 ID
   */
  recordOperation(filePath: string, content: string, origin: SyncOrigin): string {
    const hash = this.fingerprinter.calculate(content)
    const operationId = `op_${++this.sequenceCounter}`

    const record: TrackedOperation = {
      fileHash: hash,
      origin,
      timestamp: Date.now(),
      operationId,
      sequenceNumber: this.sequenceCounter,
    }

    const records = this.trackingTable.get(filePath) ?? []
    records.push(record)

    // 超过最大记录数时，移除最旧的记录
    if (records.length > MAX_RECORDS_PER_FILE) {
      records.splice(0, records.length - MAX_RECORDS_PER_FILE)
    }

    this.trackingTable.set(filePath, records)
    return operationId
  }

  /**
   * 判断一个文件变更事件是否为回声事件
   *
   * 回声事件的判定条件：
   * 1. 文件指纹相同（内容一致）
   * 2. 操作来源是"对方"（不是当前事件的来源）
   * 3. 记录未过期（在 TTL 窗口内）
   *
   * 匹配成功后，该记录会被消费（从追踪表中移除），实现一次性消费语义。
   *
   * @param filePath - 文件路径
   * @param newContent - 新的文件内容
   * @param eventOrigin - 事件来源
   * @returns 匹配的原始操作记录（回声事件），或 null（非回声事件）
   */
  isEchoEvent(
    filePath: string,
    newContent: string,
    eventOrigin: SyncOrigin
  ): TrackedOperation | null {
    const hash = this.fingerprinter.calculate(newContent)
    const records = this.trackingTable.get(filePath)

    if (!records || records.length === 0) return null

    const now = Date.now()

    // 从最新记录向前搜索，优先匹配最近的操作
    for (let i = records.length - 1; i >= 0; i--) {
      const record = records[i]
      if (
        record.fileHash === hash &&
        record.origin !== eventOrigin &&
        now - record.timestamp < OPERATION_TTL
      ) {
        // 匹配成功 — 这是一个回声事件
        // 从追踪表中移除该记录（一次性消费）
        records.splice(i, 1)
        return record
      }
    }

    return null
  }

  /**
   * 清理过期记录
   *
   * 移除所有超过 TTL 的操作记录，释放内存。
   * 如果某个文件的所有记录都已过期，则从追踪表中删除该文件条目。
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [path, records] of this.trackingTable) {
      const valid = records.filter((r) => now - r.timestamp < OPERATION_TTL)
      if (valid.length === 0) {
        this.trackingTable.delete(path)
      } else {
        this.trackingTable.set(path, valid)
      }
    }
  }

  /**
   * 销毁追踪器，清理定时器
   *
   * 在组件卸载或服务停止时调用，防止内存泄漏。
   */
  dispose(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.trackingTable.clear()
  }
}

export type { SyncOrigin, TrackedOperation }
export { OPERATION_TTL, MAX_RECORDS_PER_FILE }
