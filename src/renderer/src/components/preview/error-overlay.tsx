/**
 * 预览面板错误堆栈浮窗组件
 * 在预览面板底部显示可折叠的错误信息，包含错误类型、消息、堆栈和源文件链接
 * 需求 10.3: 预览面板运行时崩溃或编译错误时提供清晰的错误堆栈浮窗
 */
import React, { useCallback, useState } from 'react'

import { usePreviewStore } from '@renderer/stores/preview-store'

import type { PreviewError } from '@renderer/stores/preview-store'

/** ErrorOverlay 组件 Props */
interface ErrorOverlayProps {
  /** 错误列表 */
  errors: PreviewError[]
}

/**
 * 单条错误详情展示组件
 */
const ErrorItem = React.memo(function ErrorItem({
  error,
}: {
  error: PreviewError
}): React.JSX.Element {
  return (
    <div className="border-b border-red-900/40 px-3 py-2 last:border-b-0">
      {/* 错误类型与时间 */}
      <div className="flex items-center justify-between">
        <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-xs font-semibold text-red-200">
          {error.type}
        </span>
        <span className="text-xs text-red-400/60">
          {new Date(error.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* 错误消息 */}
      <p className="mt-1 text-xs leading-relaxed text-red-200">
        {error.message}
      </p>

      {/* 源文件链接（如果有） */}
      {error.sourceFile && (
        <p className="mt-1 text-xs text-orange-400">
          📄 {error.sourceFile}
          {error.lineNumber != null && `:${error.lineNumber}`}
        </p>
      )}

      {/* 堆栈信息（如果有），使用等宽字体展示 */}
      {error.stack && (
        <pre className="mt-1.5 max-h-32 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-relaxed text-red-300/80">
          {error.stack}
        </pre>
      )}
    </div>
  )
})

/**
 * 预览面板错误堆栈浮窗
 * 定位在预览面板底部，覆盖在 iframe 之上
 * 支持折叠/展开，折叠时显示错误数量徽标
 */
const ErrorOverlay = React.memo(function ErrorOverlay({
  errors,
}: ErrorOverlayProps): React.JSX.Element | null {
  const clearPreviewErrors = usePreviewStore((s) => s.clearPreviewErrors)

  /** 浮窗是否展开 */
  const [isExpanded, setIsExpanded] = useState(false)

  /** 切换展开/折叠状态 */
  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  /** 清除所有错误 */
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      // 阻止事件冒泡，避免触发 toggle
      e.stopPropagation()
      clearPreviewErrors()
      setIsExpanded(false)
    },
    [clearPreviewErrors],
  )

  // 没有错误时不渲染
  if (errors.length === 0) {
    return null
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col border-t border-red-700/50 bg-red-950/95 shadow-lg backdrop-blur-sm">
      {/* 折叠状态的标题栏 — 始终可见 */}
      <button
        onClick={handleToggle}
        className="flex h-7 shrink-0 cursor-pointer items-center justify-between px-3 transition-colors hover:bg-red-900/40"
        aria-label={isExpanded ? '折叠错误面板' : '展开错误面板'}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          {/* 展开/折叠箭头 */}
          <svg
            className={`h-3 w-3 text-red-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>

          {/* 错误图标与数量 */}
          <span className="text-xs font-medium text-red-300">
            ⚠ 错误
          </span>
          <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {errors.length}
          </span>
        </div>

        {/* 清除按钮 */}
        <span
          role="button"
          tabIndex={0}
          onClick={handleClear}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleClear(e as unknown as React.MouseEvent)
            }
          }}
          className="rounded px-1.5 py-0.5 text-xs text-red-400 transition-colors hover:bg-red-800/60 hover:text-red-200"
        >
          清除
        </span>
      </button>

      {/* 展开后的错误详情列表 */}
      {isExpanded && (
        <div className="max-h-52 overflow-y-auto">
          {errors.map((error) => (
            <ErrorItem key={error.id} error={error} />
          ))}
        </div>
      )}
    </div>
  )
})

export default ErrorOverlay
