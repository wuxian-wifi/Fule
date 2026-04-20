/**
 * WebContainer 生命周期管理 Hook
 * 首次调用时自动启动 WebContainer 运行时，
 * 返回启动状态和实例引用供组件使用
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  boot,
  getBootStatus,
  getWebContainerInstance,
  registerCallbacks,
  teardown,
} from '@renderer/services/webcontainer-service'

import type { WebContainer } from '@webcontainer/api'
import type { BootStatus } from '@renderer/services/webcontainer-service'

/** Hook 返回值 */
interface UseWebContainerResult {
  /** 当前启动状态 */
  bootStatus: BootStatus
  /** WebContainer 实例（启动完成后可用） */
  instance: WebContainer | null
  /** 启动过程中的错误信息 */
  error: Error | null
  /** 手动重试启动 */
  retry: () => void
}

/**
 * 管理 WebContainer 运行时的 React Hook
 * 组件挂载时自动触发 boot()，卸载时不销毁实例（全局单例复用）
 */
export function useWebContainer(): UseWebContainerResult {
  const [bootStatus, setBootStatus] = useState<BootStatus>(getBootStatus)
  const [instance, setInstance] = useState<WebContainer | null>(getWebContainerInstance)
  const [error, setError] = useState<Error | null>(null)
  const isMounted = useRef(true)

  /** 执行启动流程 */
  const doBoot = useCallback(() => {
    setError(null)

    // 注册状态变更回调，同步到组件状态
    registerCallbacks({
      onBootStatusChange: (status) => {
        if (isMounted.current) {
          setBootStatus(status)
        }
      },
      onError: (err) => {
        if (isMounted.current) {
          setError(err)
        }
      },
    })

    boot()
      .then((inst) => {
        if (isMounted.current) {
          setInstance(inst)
          setBootStatus('ready')
        }
      })
      .catch((err: unknown) => {
        if (isMounted.current) {
          const bootError = err instanceof Error ? err : new Error(String(err))
          setError(bootError)
          setBootStatus('error')
        }
      })
  }, [])

  useEffect(() => {
    isMounted.current = true
    doBoot()

    return () => {
      isMounted.current = false
    }
  }, [doBoot])

  /** 手动重试：先销毁旧实例再重新启动 */
  const retry = useCallback(() => {
    teardown()
    doBoot()
  }, [doBoot])

  return { bootStatus, instance, error, retry }
}
