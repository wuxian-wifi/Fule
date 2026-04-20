/**
 * 同步引擎生命周期管理 Hook
 *
 * 负责：
 * 1. 初始化 SyncEngine 实例
 * 2. 订阅 Electron 文件变更事件（chokidar → IPC → onExternalFileChange）
 * 3. 提供 start/stop 控制接口
 * 4. 组件卸载时自动清理资源
 *
 * 使用方式：
 * ```tsx
 * const { isRunning, start, stop } = useSyncEngine()
 * // 在项目打开时调用 start(projectPath)
 * // 在项目关闭时调用 stop()
 * ```
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { SyncEngine } from '@renderer/services/sync/sync-engine'

import type { ExternalFileChangeEvent } from '@shared/types'
import type { SyncEngineStatus } from '@renderer/services/sync/sync-engine'

/** Hook 返回值 */
interface UseSyncEngineResult {
  /** 当前同步引擎状态 */
  status: SyncEngineStatus
  /** 引擎是否正在运行 */
  isRunning: boolean
  /** 启动同步引擎 */
  start: (projectPath: string) => Promise<void>
  /** 停止同步引擎 */
  stop: () => Promise<void>
}

/**
 * 管理 SyncEngine 生命周期的 React Hook
 *
 * 挂载时创建 SyncEngine 实例，卸载时自动销毁。
 * 启动后自动订阅 Electron 文件变更事件并转发到同步引擎。
 */
export function useSyncEngine(): UseSyncEngineResult {
  const [status, setStatus] = useState<SyncEngineStatus>('idle')
  const engineRef = useRef<SyncEngine | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const isMounted = useRef(true)

  // 组件卸载时清理资源
  useEffect(() => {
    isMounted.current = true

    return () => {
      isMounted.current = false
      // 取消 Electron 文件变更事件订阅
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      // 销毁同步引擎
      if (engineRef.current) {
        engineRef.current.dispose()
        engineRef.current = null
      }
    }
  }, [])

  /**
   * 启动同步引擎并订阅文件变更事件
   */
  const start = useCallback(async (projectPath: string) => {
    // 如果已有引擎在运行，先停止
    if (engineRef.current) {
      await engineRef.current.stop()
      engineRef.current.dispose()
    }
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    // 创建新的同步引擎实例
    const engine = new SyncEngine()
    engineRef.current = engine

    try {
      await engine.start(projectPath)

      if (!isMounted.current) return

      // 订阅 Electron 文件变更事件（chokidar → IPC → 渲染进程）
      const unsubscribe = window.fuleAPI.fs.onExternalFileChange(
        (event: ExternalFileChangeEvent) => {
          // 将 chokidar 事件转发到同步引擎
          void engine.handleElectronFileChange({
            path: event.path,
            type: event.type,
          })
        }
      )
      unsubscribeRef.current = unsubscribe

      if (isMounted.current) {
        setStatus('running')
      }
    } catch {
      if (isMounted.current) {
        setStatus('idle')
      }
    }
  }, [])

  /**
   * 停止同步引擎并取消事件订阅
   */
  const stop = useCallback(async () => {
    // 取消事件订阅
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    // 停止并销毁引擎
    if (engineRef.current) {
      await engineRef.current.stop()
      engineRef.current.dispose()
      engineRef.current = null
    }

    if (isMounted.current) {
      setStatus('stopped')
    }
  }, [])

  return {
    status,
    isRunning: status === 'running',
    start,
    stop,
  }
}
