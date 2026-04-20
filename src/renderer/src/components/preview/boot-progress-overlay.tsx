/**
 * WebContainers 启动 Loading 骨架屏与状态进度条
 * 在 WebContainers 首次 boot() 和 npm install 期间显示骨架屏与进度状态，
 * 监听安装进程输出解析依赖安装进度，超时后提供重试按钮
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { BootStatus } from '@renderer/services/webcontainer-service'

/** 启动阶段枚举 */
type BootPhase = 'booting' | 'installing' | 'starting' | 'ready'

/** 组件 Props */
interface BootProgressOverlayProps {
  /** 当前 WebContainer 启动状态 */
  bootStatus: BootStatus
  /** 启动过程中的错误信息 */
  error: Error | null
  /** 重试回调 */
  onRetry: () => void
  /** 安装进程输出行（由父组件通过监听 stdout/stderr 传入） */
  installOutput?: string
  /** 是否已收到 server-ready 事件 */
  isServerReady: boolean
}

/** 超时阈值（毫秒）— 超过 60 秒未完成时显示重试按钮 */
const BOOT_TIMEOUT_MS = 60_000

/** 各阶段对应的进度百分比范围 */
const PHASE_PROGRESS: Record<BootPhase, { min: number; max: number }> = {
  booting: { min: 0, max: 20 },
  installing: { min: 20, max: 80 },
  starting: { min: 80, max: 95 },
  ready: { min: 100, max: 100 },
}

/** 各阶段的中文描述 */
const PHASE_LABELS: Record<BootPhase, string> = {
  booting: 'WebContainer 启动中…',
  installing: '正在安装依赖…',
  starting: '启动开发服务器…',
  ready: '准备就绪',
}

/**
 * 从 npm install 输出中解析安装进度
 * 通过匹配 "added X packages" 或进度指示符估算完成百分比
 *
 * @param output - npm install 的 stdout/stderr 输出行
 * @returns 0-1 之间的进度值，null 表示无法解析
 */
export function parseInstallProgress(output: string): number | null {
  // 匹配 "added N packages" — 安装完成
  if (/added\s+\d+\s+packages?/i.test(output)) {
    return 1
  }

  // 匹配 npm 进度指示 "npm warn"、"npm info" 等中间输出
  if (/npm\s+(warn|info|notice|http)/i.test(output)) {
    return 0.5
  }

  // 匹配 "resolving" / "reifying" 等 npm 内部阶段
  if (/reify:.*?(\d+)/i.test(output)) {
    return 0.7
  }

  if (/resolving/i.test(output)) {
    return 0.3
  }

  return null
}

/**
 * WebContainers 启动 Loading 骨架屏与状态进度条
 *
 * 功能：
 * - 在 boot() 和 npm install 期间显示骨架屏与进度状态
 * - 解析依赖安装进度并实时更新进度条
 * - server-ready 事件触发后自动隐藏
 * - 超过 60 秒未完成时显示重试按钮
 *
 * 需求: 10.1
 */
function BootProgressOverlay({
  bootStatus,
  error,
  onRetry,
  installOutput,
  isServerReady,
}: BootProgressOverlayProps): React.JSX.Element | null {
  const [phase, setPhase] = useState<BootPhase>('booting')
  const [progress, setProgress] = useState(0)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // server-ready 后切换到 ready 阶段
  useEffect(() => {
    if (isServerReady) {
      setPhase('ready')
      setProgress(100)
      // 清除超时计时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isServerReady])

  // 根据 bootStatus 更新阶段
  useEffect(() => {
    if (bootStatus === 'booting') {
      setPhase('booting')
      setProgress(PHASE_PROGRESS.booting.min)
    } else if (bootStatus === 'ready' && !isServerReady) {
      // boot 完成但 server 还没 ready，进入 installing 阶段
      setPhase('installing')
      setProgress(PHASE_PROGRESS.installing.min)
    }
  }, [bootStatus, isServerReady])

  // 超时检测：启动后 60 秒未完成则显示重试按钮
  useEffect(() => {
    if (bootStatus === 'booting' || (bootStatus === 'ready' && !isServerReady)) {
      timeoutRef.current = setTimeout(() => {
        setIsTimedOut(true)
      }, BOOT_TIMEOUT_MS)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [bootStatus, isServerReady])

  // 解析安装进程输出，更新进度
  useEffect(() => {
    if (!installOutput || phase !== 'installing') return

    setStatusMessage(installOutput)

    const installProgress = parseInstallProgress(installOutput)
    if (installProgress !== null) {
      const { min, max } = PHASE_PROGRESS.installing
      const newProgress = min + (max - min) * installProgress
      // 进度只增不减
      setProgress((prev) => Math.max(prev, newProgress))

      // 安装完成，进入 starting 阶段
      if (installProgress >= 1) {
        setPhase('starting')
        setProgress(PHASE_PROGRESS.starting.min)
      }
    }
  }, [installOutput, phase])

  // booting 阶段的渐进动画
  useEffect(() => {
    if (phase !== 'booting') return

    const interval = setInterval(() => {
      setProgress((prev) => {
        const { max } = PHASE_PROGRESS.booting
        // 缓慢递增，不超过阶段上限
        if (prev < max) {
          return Math.min(prev + 1, max)
        }
        return prev
      })
    }, 300)

    return () => clearInterval(interval)
  }, [phase])

  /** 处理重试 */
  const handleRetry = useCallback(() => {
    setIsTimedOut(false)
    setPhase('booting')
    setProgress(0)
    setStatusMessage('')
    onRetry()
  }, [onRetry])

  // server-ready 后隐藏 overlay
  if (isServerReady && phase === 'ready') {
    return null
  }

  // 错误状态
  if (bootStatus === 'error' || error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-900/30">
          <svg
            className="h-5 w-5 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <span className="text-sm text-red-400">WebContainer 启动失败</span>
        {error && (
          <span className="max-w-[80%] text-center text-xs text-gray-500">
            {error.message}
          </span>
        )}
        <button
          onClick={handleRetry}
          className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white hover:bg-blue-500 transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-gray-950 p-6">
      {/* 骨架屏动画 */}
      <div className="w-full max-w-xs space-y-3">
        {/* 模拟代码行的骨架条 */}
        <div className="h-3 w-3/4 animate-pulse rounded bg-gray-800" />
        <div className="h-3 w-full animate-pulse rounded bg-gray-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-gray-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-gray-800" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-gray-800" />
      </div>

      {/* 进度条 */}
      <div className="w-full max-w-xs">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">{PHASE_LABELS[phase]}</span>
          <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 安装状态消息 */}
      {statusMessage && phase === 'installing' && (
        <div className="w-full max-w-xs">
          <p className="truncate text-xs text-gray-600" title={statusMessage}>
            {statusMessage}
          </p>
        </div>
      )}

      {/* 超时重试按钮 */}
      {isTimedOut && (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-yellow-500">
            启动时间超过预期，可能遇到网络问题
          </span>
          <button
            onClick={handleRetry}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white hover:bg-blue-500 transition-colors"
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}

export default React.memo(BootProgressOverlay)
