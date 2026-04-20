/**
 * 插件化架构 — 插件系统
 *
 * 基于微内核设计的插件生命周期管理器。
 * 插件在独立的 Web Worker 沙箱中运行，通过 MessagePort 与主线程通信。
 * 实现加载超时保护（10 秒）与崩溃隔离：插件崩溃不会影响 IDE 主进程。
 */

/** 插件贡献的语言支持 */
export interface LanguageContribution {
  /** 语言标识符 */
  id: string
  /** 语言显示名称 */
  name: string
  /** 关联的文件扩展名 */
  extensions: string[]
}

/** 插件贡献的主题 */
export interface ThemeContribution {
  /** 主题标识符 */
  id: string
  /** 主题显示名称 */
  label: string
}

/** 插件贡献的命令 */
export interface CommandContribution {
  /** 命令标识符 */
  id: string
  /** 命令显示标题 */
  title: string
}

/**
 * 插件清单
 * 描述一个插件的元数据和入口信息
 */
export interface PluginManifest {
  /** 插件唯一标识 */
  id: string
  /** 插件显示名称 */
  name: string
  /** 插件版本号 */
  version: string
  /** 入口文件路径 */
  main: string
  /** 激活事件列表 — 定义插件何时被激活 */
  activationEvents: string[]
  /** 插件贡献点 — 定义插件向 IDE 注册的功能 */
  contributes: {
    /** 语言支持 */
    languages?: LanguageContribution[]
    /** 主题 */
    themes?: ThemeContribution[]
    /** 命令 */
    commands?: CommandContribution[]
  }
}

/** 插件生命周期状态 */
export enum PluginState {
  /** 已安装但未加载 */
  INSTALLED = 'installed',
  /** 正在加载中 */
  LOADED = 'loaded',
  /** 已激活并正常运行 */
  ACTIVE = 'active',
  /** 已禁用 */
  DISABLED = 'disabled',
  /** 发生错误（崩溃或超时） */
  ERROR = 'error',
}

/**
 * 插件实例
 * 运行时的插件对象，包含清单、状态和 Worker 引用
 */
export interface PluginInstance {
  /** 插件清单 */
  manifest: PluginManifest
  /** 当前状态 */
  state: PluginState
  /** Web Worker 沙箱引用（仅在 LOADED/ACTIVE 状态下存在） */
  worker?: Worker
}

/** Worker 发送给主线程的消息类型 */
export interface PluginWorkerMessage {
  /** 消息类型 */
  type: 'PLUGIN_READY' | 'PLUGIN_ERROR'
  /** 插件 ID */
  pluginId?: string
  /** 错误信息（仅 PLUGIN_ERROR 时存在） */
  error?: string
}

/** 主线程发送给 Worker 的消息类型 */
export interface PluginHostMessage {
  /** 消息类型 */
  type: 'LOAD' | 'UNLOAD'
  /** 插件清单 */
  manifest?: PluginManifest
}

/** 插件加载超时时间（毫秒）— 10 秒 */
const LOAD_TIMEOUT_MS = 10_000

/**
 * Worker 工厂接口
 * 通过依赖注入解耦 Worker 创建逻辑，便于测试时 mock
 */
export interface WorkerFactory {
  /** 创建一个新的 Worker 实例 */
  createWorker(manifest: PluginManifest): Worker
}

/**
 * 默认 Worker 工厂
 * 在真实环境中使用 Web Worker API 创建沙箱
 */
export class DefaultWorkerFactory implements WorkerFactory {
  /**
   * 创建 Worker 实例
   * 使用 import.meta.url 解析插件入口文件路径
   */
  createWorker(manifest: PluginManifest): Worker {
    return new Worker(new URL(manifest.main, import.meta.url), { type: 'module' })
  }
}

/**
 * 插件系统
 *
 * 核心职责：
 * 1. 插件生命周期管理：安装 → 加载 → 激活 → 禁用 → 卸载
 * 2. 沙箱隔离：每个插件在独立 Web Worker 中运行
 * 3. 超时保护：加载超过 10 秒自动终止并标记为 ERROR
 * 4. 崩溃隔离：插件 Worker 崩溃不影响 IDE 主进程
 */
export class PluginSystem {
  /** 已注册的插件实例 Map */
  private plugins: Map<string, PluginInstance> = new Map()
  /** Worker 工厂 — 通过依赖注入便于测试 */
  private workerFactory: WorkerFactory
  /** 加载超时时间（毫秒） */
  private loadTimeoutMs: number
  /** 活跃的超时定时器 — 用于清理 */
  private activeTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(workerFactory?: WorkerFactory, loadTimeoutMs?: number) {
    this.workerFactory = workerFactory ?? new DefaultWorkerFactory()
    this.loadTimeoutMs = loadTimeoutMs ?? LOAD_TIMEOUT_MS
  }

  /**
   * 安装插件
   * 将插件清单注册到系统中，状态设为 INSTALLED
   *
   * @param manifest - 插件清单
   * @throws 如果插件 ID 已存在则抛出错误
   */
  installPlugin(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`插件 ${manifest.id} 已安装`)
    }

    const instance: PluginInstance = {
      manifest,
      state: PluginState.INSTALLED,
    }
    this.plugins.set(manifest.id, instance)
  }

  /**
   * 加载并激活插件
   *
   * 在独立 Web Worker 沙箱中加载插件入口文件。
   * 设置 10 秒超时保护：超时则终止 Worker 并标记为 ERROR。
   * Worker 崩溃（onerror）时自动隔离：终止 Worker、标记 ERROR、不影响主进程。
   *
   * @param manifest - 插件清单
   * @returns Promise 在插件就绪或失败时 resolve
   */
  async loadPlugin(manifest: PluginManifest): Promise<void> {
    // 如果插件尚未安装，先自动安装
    if (!this.plugins.has(manifest.id)) {
      this.installPlugin(manifest)
    }

    const instance = this.plugins.get(manifest.id)!

    // 已激活的插件无需重复加载
    if (instance.state === PluginState.ACTIVE) {
      return
    }

    // 标记为加载中
    this.setPluginState(manifest.id, PluginState.LOADED)

    return new Promise<void>((resolve) => {
      let worker: Worker

      try {
        worker = this.workerFactory.createWorker(manifest)
      } catch {
        // Worker 创建失败 — 标记为 ERROR 并返回
        this.setPluginState(manifest.id, PluginState.ERROR)
        resolve()
        return
      }

      // 保存 Worker 引用
      instance.worker = worker

      // 设置超时保护 — 10 秒内未收到 PLUGIN_READY 则终止
      const loadTimeout = setTimeout(() => {
        this.activeTimeouts.delete(manifest.id)
        worker.terminate()
        instance.worker = undefined
        this.setPluginState(manifest.id, PluginState.ERROR)
        resolve()
      }, this.loadTimeoutMs)

      this.activeTimeouts.set(manifest.id, loadTimeout)

      // 监听插件就绪消息
      worker.onmessage = (event: MessageEvent<PluginWorkerMessage>) => {
        if (event.data.type === 'PLUGIN_READY') {
          clearTimeout(loadTimeout)
          this.activeTimeouts.delete(manifest.id)
          this.setPluginState(manifest.id, PluginState.ACTIVE)
          resolve()
        }
      }

      // 监听插件崩溃 — 崩溃隔离核心逻辑
      worker.onerror = () => {
        clearTimeout(loadTimeout)
        this.activeTimeouts.delete(manifest.id)
        this.setPluginState(manifest.id, PluginState.ERROR)
        worker.terminate()
        instance.worker = undefined
        // 插件崩溃不影响主进程 — 仅标记状态，不抛出异常
        resolve()
      }

      // 发送加载指令给 Worker
      worker.postMessage({ type: 'LOAD', manifest } as PluginHostMessage)
    })
  }

  /**
   * 卸载插件
   *
   * 终止 Worker 并从注册表中移除插件。
   *
   * @param pluginId - 插件 ID
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    // 清理超时定时器
    const timeout = this.activeTimeouts.get(pluginId)
    if (timeout) {
      clearTimeout(timeout)
      this.activeTimeouts.delete(pluginId)
    }

    // 终止 Worker
    if (instance.worker) {
      instance.worker.terminate()
      instance.worker = undefined
    }

    this.plugins.delete(pluginId)
  }

  /**
   * 启用插件
   *
   * 将已禁用的插件重新加载并激活。
   *
   * @param pluginId - 插件 ID
   */
  async enablePlugin(pluginId: string): Promise<void> {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    if (instance.state === PluginState.DISABLED || instance.state === PluginState.ERROR) {
      // 重新加载插件
      await this.loadPlugin(instance.manifest)
    }
  }

  /**
   * 禁用插件
   *
   * 终止 Worker 并将状态设为 DISABLED，但保留注册信息。
   *
   * @param pluginId - 插件 ID
   */
  disablePlugin(pluginId: string): void {
    const instance = this.plugins.get(pluginId)
    if (!instance) return

    // 清理超时定时器
    const timeout = this.activeTimeouts.get(pluginId)
    if (timeout) {
      clearTimeout(timeout)
      this.activeTimeouts.delete(pluginId)
    }

    // 终止 Worker 但保留注册信息
    if (instance.worker) {
      instance.worker.terminate()
      instance.worker = undefined
    }

    this.setPluginState(pluginId, PluginState.DISABLED)
  }

  /**
   * 获取所有已注册插件列表
   *
   * @returns 插件实例数组（不含 Worker 引用，仅返回清单和状态）
   */
  getPluginList(): Array<{ manifest: PluginManifest; state: PluginState }> {
    return [...this.plugins.values()].map((instance) => ({
      manifest: instance.manifest,
      state: instance.state,
    }))
  }

  /**
   * 获取指定插件的状态
   *
   * @param pluginId - 插件 ID
   * @returns 插件状态，不存在则返回 undefined
   */
  getPluginState(pluginId: string): PluginState | undefined {
    return this.plugins.get(pluginId)?.state
  }

  /**
   * 获取指定插件实例
   *
   * @param pluginId - 插件 ID
   * @returns 插件实例，不存在则返回 undefined
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * 设置插件状态
   * 内部方法，更新插件实例的状态字段
   */
  private setPluginState(pluginId: string, state: PluginState): void {
    const instance = this.plugins.get(pluginId)
    if (instance) {
      instance.state = state
    }
  }

  /**
   * 销毁插件系统
   * 终止所有 Worker 并清理资源
   */
  async destroy(): Promise<void> {
    // 清理所有超时定时器
    for (const [, timeout] of this.activeTimeouts) {
      clearTimeout(timeout)
    }
    this.activeTimeouts.clear()

    // 终止所有 Worker
    for (const [, instance] of this.plugins) {
      if (instance.worker) {
        instance.worker.terminate()
        instance.worker = undefined
      }
    }

    this.plugins.clear()
  }
}
