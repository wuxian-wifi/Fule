/**
 * 同步引擎 — Electron ↔ WebContainers 双向文件同步的核心编排器
 *
 * 职责：
 * 1. 初始化并管理所有同步子组件（指纹计算器、操作追踪器、忽略引擎、防抖调度器）
 * 2. 处理 Electron → WebContainers 方向的文件变更（chokidar 事件）
 * 3. 处理 WebContainers → Electron 方向的文件变更（WC 文件监听事件）
 * 4. 提供 start/stop 生命周期管理
 *
 * 事件流程（Electron → WC）：
 *   chokidar 事件 → SyncIgnoreEngine 过滤 → DebouncedSyncScheduler（含回声检测）→ ElectronToWCSyncExecutor
 *
 * 事件流程（WC → Electron）：
 *   WC 文件变更 → SyncIgnoreEngine 过滤 → DebouncedSyncScheduler（含回声检测）→ WCToElectronSyncExecutor
 */

import { FingerprintCalculator } from './fingerprint-calculator'
import { OperationTracker } from './operation-tracker'
import { SyncIgnoreEngine } from './sync-ignore-engine'
import { DebouncedSyncScheduler } from './debounced-sync-scheduler'
import { ElectronToWCSyncExecutor } from './electron-to-wc-executor'
import { WCToElectronSyncExecutor } from './wc-to-electron-executor'

import type { SyncEvent } from './debounced-sync-scheduler'

/** 同步引擎运行状态 */
type SyncEngineStatus = 'idle' | 'starting' | 'running' | 'stopped'

/** Electron 文件变更事件（来自 chokidar 经 IPC 转发） */
interface ElectronFileChangeEvent {
  /** 文件的完整绝对路径 */
  path: string
  /** 变更类型 */
  type?: 'add' | 'change' | 'unlink'
}

/**
 * 同步引擎 — 编排 Electron ↔ WebContainers 双向文件同步
 */
export class SyncEngine {
  /** 文件指纹计算器 */
  private fingerprinter: FingerprintCalculator

  /** 操作追踪器（回声检测核心） */
  private tracker: OperationTracker

  /** 同步忽略规则引擎 */
  private ignoreEngine: SyncIgnoreEngine

  /** Electron → WC 方向的防抖调度器 */
  private electronToWCScheduler: DebouncedSyncScheduler

  /** WC → Electron 方向的防抖调度器 */
  private wcToElectronScheduler: DebouncedSyncScheduler

  /** Electron → WC 同步执行器 */
  private electronToWCExecutor: ElectronToWCSyncExecutor

  /** WC → Electron 同步执行器 */
  private wcToElectronExecutor: WCToElectronSyncExecutor

  /** 当前引擎状态 */
  private status: SyncEngineStatus = 'idle'

  /** 当前监听的项目根路径 */
  private projectPath: string | null = null

  constructor(ignoreContent?: string) {
    this.fingerprinter = new FingerprintCalculator()
    this.tracker = new OperationTracker(this.fingerprinter)
    this.ignoreEngine = new SyncIgnoreEngine(ignoreContent)

    // 创建两个方向的同步执行器
    this.electronToWCExecutor = new ElectronToWCSyncExecutor()
    this.wcToElectronExecutor = new WCToElectronSyncExecutor()

    // 创建两个方向的防抖调度器，共享同一个操作追踪器以实现跨方向回声检测
    this.electronToWCScheduler = new DebouncedSyncScheduler(
      this.tracker,
      this.electronToWCExecutor
    )
    this.wcToElectronScheduler = new DebouncedSyncScheduler(
      this.tracker,
      this.wcToElectronExecutor
    )
  }

  /**
   * 启动同步引擎
   *
   * 初始化指纹计算器并标记引擎为运行状态。
   * 调用方需在启动后手动订阅 chokidar 和 WC 的文件变更事件，
   * 并将事件转发到 handleElectronFileChange / handleWebContainerFileChange。
   *
   * @param projectPath - 项目根目录路径
   */
  async start(projectPath: string): Promise<void> {
    if (this.status === 'running') {
      return
    }

    this.status = 'starting'
    this.projectPath = projectPath

    // 初始化指纹计算器（未来替换为 xxhash-wasm 时需要异步加载 WASM）
    await this.fingerprinter.init()

    // 设置 WC→Electron 执行器的项目路径，用于将相对路径转换为绝对路径
    this.wcToElectronExecutor.setProjectPath(projectPath)

    this.status = 'running'
  }

  /**
   * 停止同步引擎
   *
   * 刷新所有待处理事件后停止引擎。
   */
  async stop(): Promise<void> {
    if (this.status !== 'running') {
      return
    }

    // 刷新两个方向的待处理事件，确保不丢失数据
    await this.electronToWCScheduler.flush()
    await this.wcToElectronScheduler.flush()

    this.status = 'stopped'
    this.projectPath = null
  }

  /**
   * 处理 Electron 文件系统变更事件（chokidar → IPC → 渲染进程）
   *
   * 流程：
   * 1. 检查引擎是否运行中
   * 2. 将绝对路径转换为相对路径
   * 3. 通过 SyncIgnoreEngine 检查是否应忽略
   * 4. 读取文件内容（通过 IPC）
   * 5. 构造 SyncEvent 并交给 Electron→WC 防抖调度器
   *
   * @param event - 来自 chokidar 的文件变更事件
   */
  async handleElectronFileChange(event: ElectronFileChangeEvent): Promise<void> {
    if (this.status !== 'running' || !this.projectPath) {
      return
    }

    // 将绝对路径转换为相对路径（用于忽略规则匹配和 WC 文件系统路径）
    const relativePath = this.toRelativePath(event.path)

    // 忽略规则检查
    if (this.ignoreEngine.shouldIgnore(relativePath)) {
      return
    }

    // 映射 chokidar 事件类型到 SyncEvent 类型
    const eventType = this.mapEventType(event.type)

    if (eventType === 'delete') {
      // 删除事件不需要读取文件内容
      const syncEvent: SyncEvent = {
        filePath: relativePath,
        type: 'delete',
        origin: 'electron',
        timestamp: Date.now(),
      }
      this.electronToWCScheduler.enqueue(syncEvent)
      return
    }

    // 非删除事件需要读取文件内容
    try {
      const result = await window.fuleAPI.fs.readFile(event.path)
      if (!result.success || !result.data) {
        return
      }

      const syncEvent: SyncEvent = {
        filePath: relativePath,
        type: eventType,
        content: result.data.content,
        origin: 'electron',
        timestamp: Date.now(),
      }
      this.electronToWCScheduler.enqueue(syncEvent)
    } catch {
      // 文件读取失败（可能已被删除），静默忽略
    }
  }

  /**
   * 处理 WebContainers 文件变更事件
   *
   * 流程：
   * 1. 检查引擎是否运行中
   * 2. 通过 SyncIgnoreEngine 检查是否应忽略
   * 3. 构造 SyncEvent 并交给 WC→Electron 防抖调度器
   *
   * @param path - WC 内的文件相对路径
   * @param content - 文件内容（删除时为 undefined）
   * @param type - 变更类型，默认为 'update'
   */
  handleWebContainerFileChange(
    path: string,
    content?: string,
    type: 'create' | 'update' | 'delete' = 'update'
  ): void {
    if (this.status !== 'running') {
      return
    }

    // 忽略规则检查
    if (this.ignoreEngine.shouldIgnore(path)) {
      return
    }

    const syncEvent: SyncEvent = {
      filePath: path,
      type,
      content,
      origin: 'webcontainer',
      timestamp: Date.now(),
    }
    this.wcToElectronScheduler.enqueue(syncEvent)
  }

  /**
   * 获取当前引擎状态
   */
  getStatus(): SyncEngineStatus {
    return this.status
  }

  /**
   * 获取项目根路径
   */
  getProjectPath(): string | null {
    return this.projectPath
  }

  /**
   * 销毁同步引擎，释放所有资源
   *
   * 在组件卸载或应用退出时调用，防止内存泄漏。
   */
  dispose(): void {
    this.electronToWCScheduler.dispose()
    this.wcToElectronScheduler.dispose()
    this.tracker.dispose()
    this.status = 'stopped'
    this.projectPath = null
  }

  /**
   * 将绝对路径转换为相对于项目根目录的路径
   *
   * 同步引擎内部统一使用相对路径，便于：
   * - 忽略规则匹配（模式基于相对路径）
   * - WebContainers 文件系统操作（使用相对路径）
   */
  private toRelativePath(absolutePath: string): string {
    if (!this.projectPath) {
      return absolutePath
    }

    // 统一路径分隔符为正斜杠（兼容 Windows）
    const normalized = absolutePath.replace(/\\/g, '/')
    const normalizedRoot = this.projectPath.replace(/\\/g, '/')

    if (normalized.startsWith(normalizedRoot)) {
      // 去除项目根路径前缀和开头的斜杠
      const relative = normalized.slice(normalizedRoot.length)
      return relative.startsWith('/') ? relative.slice(1) : relative
    }

    return absolutePath
  }

  /**
   * 映射 chokidar 事件类型到 SyncEvent 类型
   */
  private mapEventType(type?: 'add' | 'change' | 'unlink'): 'create' | 'update' | 'delete' {
    switch (type) {
      case 'add':
        return 'create'
      case 'unlink':
        return 'delete'
      case 'change':
      default:
        return 'update'
    }
  }
}

export type { SyncEngineStatus, ElectronFileChangeEvent }
