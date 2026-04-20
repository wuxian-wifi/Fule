/**
 * WebContainers → Electron 同步执行器
 *
 * 负责将 WebContainers 虚拟文件系统的变更回写到 Electron 本地文件系统。
 * 通过 IPC 调用主进程的 fs:write handler 实现文件写入。
 *
 * 安全约束：
 * - 渲染进程禁止直接使用 Node.js fs 模块
 * - 所有文件写入必须通过 window.fuleAPI.fs.writeFile IPC 通道
 */

import type { SyncEvent } from './debounced-sync-scheduler'

/** 同步执行器接口 — 与 DebouncedSyncScheduler 配合使用 */
interface SyncExecutor {
  /** 批量执行同步操作 */
  executeBatch(events: SyncEvent[]): Promise<void>
}

/**
 * WebContainers → Electron 同步执行器
 *
 * 将 WC 文件变更通过 IPC 写入 Electron 本地文件系统。
 * 需要将相对路径转换为绝对路径后再调用 IPC。
 */
export class WCToElectronSyncExecutor implements SyncExecutor {
  /** 项目根目录绝对路径，用于拼接完整文件路径 */
  private projectPath: string | null = null

  /**
   * 设置项目根目录路径
   *
   * 必须在 executeBatch 之前调用，否则无法构造绝对路径。
   *
   * @param projectPath - 项目根目录的绝对路径
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath
  }

  /**
   * 批量执行 WC → Electron 同步
   *
   * 将所有 create/update 事件逐个通过 IPC 写入 Electron 文件系统。
   * 写入失败的文件会被静默跳过，不影响其他文件的同步。
   *
   * @param events - 待同步的文件变更事件批次
   */
  async executeBatch(events: SyncEvent[]): Promise<void> {
    if (!this.projectPath) {
      return
    }

    // 过滤出需要写入的事件（create 和 update）
    const writeEvents = events.filter(
      (e) => e.type !== 'delete' && e.content !== undefined
    )

    // 并行写入所有文件，单个失败不影响其他文件
    const writePromises = writeEvents.map(async (event) => {
      const absolutePath = this.toAbsolutePath(event.filePath)
      try {
        await window.fuleAPI.fs.writeFile({
          path: absolutePath,
          content: event.content ?? '',
        })
      } catch {
        // 单个文件写入失败，静默跳过
      }
    })

    await Promise.all(writePromises)
  }

  /**
   * 将相对路径转换为绝对路径
   *
   * WebContainers 内部使用相对路径，写入 Electron 文件系统时需要绝对路径。
   */
  private toAbsolutePath(relativePath: string): string {
    if (!this.projectPath) {
      return relativePath
    }
    // 统一使用正斜杠拼接，避免 Windows 路径问题
    const root = this.projectPath.replace(/\\/g, '/')
    const cleanRoot = root.endsWith('/') ? root.slice(0, -1) : root
    return `${cleanRoot}/${relativePath}`
  }
}
