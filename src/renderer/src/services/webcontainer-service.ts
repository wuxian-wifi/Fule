/**
 * WebContainers 运行时服务
 * 采用单例模式管理 WebContainer 实例的生命周期，
 * 提供 boot、文件挂载、命令执行等核心能力
 */
import { WebContainer } from '@webcontainer/api'

import { usePreviewStore } from '@renderer/stores/preview-store'

import type { FileSystemTree } from '@webcontainer/api'

/** WebContainer 启动状态 */
export type BootStatus = 'idle' | 'booting' | 'ready' | 'error'

/** WebContainer 服务事件回调 */
interface WebContainerCallbacks {
  /** 启动状态变更回调 */
  onBootStatusChange?: (status: BootStatus) => void
  /** 服务就绪回调，携带预览 URL */
  onServerReady?: (url: string, port: number) => void
  /** 错误回调 */
  onError?: (error: Error) => void
}

/** 单例 WebContainer 实例 */
let webcontainerInstance: WebContainer | null = null

/** 当前启动状态 */
let currentBootStatus: BootStatus = 'idle'

/** 启动 Promise 缓存，防止重复启动 */
let bootPromise: Promise<WebContainer> | null = null

/** 已注册的回调集合 */
const callbacks: WebContainerCallbacks = {}

/**
 * 更新启动状态并通知监听者
 */
function setBootStatus(status: BootStatus): void {
  currentBootStatus = status
  callbacks.onBootStatusChange?.(status)
}

/**
 * 获取当前启动状态
 */
export function getBootStatus(): BootStatus {
  return currentBootStatus
}

/**
 * 获取已启动的 WebContainer 实例（可能为 null）
 */
export function getWebContainerInstance(): WebContainer | null {
  return webcontainerInstance
}

/**
 * 注册事件回调
 */
export function registerCallbacks(cbs: WebContainerCallbacks): void {
  Object.assign(callbacks, cbs)
}

/**
 * 启动 WebContainer 运行时
 * 采用懒初始化 + Promise 缓存，确保全局只启动一次
 * 启动成功后自动监听 server-ready 事件并更新 PreviewStore
 */
export async function boot(): Promise<WebContainer> {
  // 已启动则直接返回
  if (webcontainerInstance) {
    return webcontainerInstance
  }

  // 正在启动则复用同一个 Promise，避免并发重复启动
  if (bootPromise) {
    return bootPromise
  }

  bootPromise = (async () => {
    try {
      setBootStatus('booting')

      const instance = await WebContainer.boot()
      webcontainerInstance = instance

      // 监听 server-ready 事件，更新预览 URL
      instance.on('server-ready', (port: number, url: string) => {
        const previewStore = usePreviewStore.getState()
        previewStore.setPreviewUrl(url)
        previewStore.setIsRunning(true)
        callbacks.onServerReady?.(url, port)
      })

      setBootStatus('ready')
      return instance
    } catch (error) {
      setBootStatus('error')
      bootPromise = null
      const err = error instanceof Error ? error : new Error(String(error))
      callbacks.onError?.(err)
      throw err
    }
  })()

  return bootPromise
}

/**
 * 将文件树挂载到 WebContainer 虚拟文件系统
 * @param files - 符合 WebContainer FileSystemTree 格式的文件树
 */
export async function mountFiles(files: FileSystemTree): Promise<void> {
  const instance = await boot()
  await instance.mount(files)
}

/**
 * 在 WebContainer 内执行命令
 * @param cmd - 要执行的命令（如 'npm'）
 * @param args - 命令参数（如 ['install']）
 * @returns 进程退出码
 */
export async function runCommand(
  cmd: string,
  args: string[] = [],
): Promise<number> {
  const instance = await boot()
  const process = await instance.spawn(cmd, args)

  // 将 stdout/stderr 输出到控制台（后续可接入终端面板）
  process.output.pipeTo(
    new WritableStream({
      write(chunk) {
        // 开发阶段使用 console.debug，后续替换为 electron-log
        console.debug(`[WebContainer] ${chunk}`)
      },
    }),
  )

  return process.exit
}

/**
 * 销毁 WebContainer 实例并重置状态
 * 通常在应用退出时调用
 */
export function teardown(): void {
  if (webcontainerInstance) {
    webcontainerInstance.teardown()
    webcontainerInstance = null
  }
  bootPromise = null
  setBootStatus('idle')
  const previewStore = usePreviewStore.getState()
  previewStore.setPreviewUrl(null)
  previewStore.setIsRunning(false)
}
