/**
 * Electron → WebContainers 同步执行器
 *
 * 负责将 Electron 文件系统的变更批量写入 WebContainers 虚拟文件系统。
 * 通过 webcontainer-service 的 mountFiles API 实现文件挂载。
 *
 * 写入策略：
 * - create/update 事件：将文件内容转换为 FileSystemTree 格式后调用 mountFiles
 * - delete 事件：当前 WebContainers API 不直接支持删除，记录日志后跳过
 */

import { mountFiles } from '@renderer/services/webcontainer-service'

import type { SyncEvent } from './debounced-sync-scheduler'
import type { FileSystemTree } from '@webcontainer/api'

/** 同步执行器接口 — 与 DebouncedSyncScheduler 配合使用 */
interface SyncExecutor {
  /** 批量执行同步操作 */
  executeBatch(events: SyncEvent[]): Promise<void>
}

/**
 * Electron → WebContainers 同步执行器
 *
 * 将 Electron 文件系统的变更写入 WebContainers。
 * 使用 mountFiles 批量挂载，减少 API 调用次数。
 */
export class ElectronToWCSyncExecutor implements SyncExecutor {
  /**
   * 批量执行 Electron → WC 同步
   *
   * 将所有 create/update 事件合并为一棵 FileSystemTree，
   * 通过单次 mountFiles 调用写入 WebContainers。
   *
   * @param events - 待同步的文件变更事件批次
   */
  async executeBatch(events: SyncEvent[]): Promise<void> {
    // 过滤出需要写入的事件（create 和 update）
    const writeEvents = events.filter(
      (e) => e.type !== 'delete' && e.content !== undefined
    )

    if (writeEvents.length === 0) {
      return
    }

    // 构建 FileSystemTree 结构
    const tree = this.buildFileSystemTree(writeEvents)

    // 批量挂载到 WebContainers
    await mountFiles(tree)
  }

  /**
   * 将同步事件列表转换为 WebContainers FileSystemTree 格式
   *
   * FileSystemTree 是嵌套的目录结构，例如：
   * { 'src': { directory: { 'app.tsx': { file: { contents: '...' } } } } }
   *
   * @param events - 需要写入的文件变更事件
   * @returns WebContainers 可识别的文件树
   */
  private buildFileSystemTree(events: SyncEvent[]): FileSystemTree {
    const tree: FileSystemTree = {}

    for (const event of events) {
      // 将文件路径拆分为目录层级
      const parts = event.filePath.split('/')
      let current: FileSystemTree = tree

      // 逐层创建目录节点
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i]
        if (!current[dirName]) {
          current[dirName] = { directory: {} }
        }
        const node = current[dirName]
        // 确保节点是目录类型
        if ('directory' in node) {
          current = node.directory
        }
      }

      // 创建文件叶子节点
      const fileName = parts[parts.length - 1]
      current[fileName] = {
        file: { contents: event.content ?? '' },
      }
    }

    return tree
  }
}
