/**
 * 内嵌预览面板组件
 * 支持三种预览模式：
 * 1. 内嵌 iframe 预览（右侧面板）
 * 2. 应用内浮层弹窗（HTML 文件预览）
 * 3. 独立 Electron 窗口（dev server 预览，可自由缩放）
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { usePreviewStore } from '@renderer/stores/preview-store'
import ErrorOverlay from '@renderer/components/preview/error-overlay'

/** postMessage 传入的错误数据结构 */
interface PreviewErrorMessage {
  type: 'PREVIEW_ERROR'
  error: {
    type: string
    message: string
    stack?: string
    sourceFile?: string
    lineNumber?: number
  }
}

/** 校验 postMessage 数据是否为有效的预览错误消息 */
function isPreviewErrorMessage(data: unknown): data is PreviewErrorMessage {
  if (typeof data !== 'object' || data === null) return false
  const msg = data as Record<string, unknown>
  if (msg.type !== 'PREVIEW_ERROR') return false
  if (typeof msg.error !== 'object' || msg.error === null) return false
  const err = msg.error as Record<string, unknown>
  return typeof err.type === 'string' && typeof err.message === 'string'
}

/** 判断 URL 是否为 http/https（可在独立窗口打开） */
function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function EmbeddedPreviewPanel(): React.JSX.Element {
  const previewUrl = usePreviewStore((s) => s.previewUrl)
  const setPreviewUrl = usePreviewStore((s) => s.setPreviewUrl)
  const previewErrors = usePreviewStore((s) => s.previewErrors)
  const addPreviewError = usePreviewStore((s) => s.addPreviewError)

  const iframeRef = useRef<HTMLIFrameElement>(null)

  /** 地址栏是否处于编辑状态 */
  const [isEditing, setIsEditing] = useState(false)
  /** 地址栏编辑中的值 */
  const [editValue, setEditValue] = useState('')
  /** 等待页面的手动 URL 输入 */
  const [manualUrl, setManualUrl] = useState('http://localhost:3000')
  /** 是否已弹出独立窗口 */
  const [isExternalWindow, setIsExternalWindow] = useState(false)
  /** 是否显示应用内浮层弹窗 */
  const [isFloatingPopup, setIsFloatingPopup] = useState(false)

  /** 监听 iframe postMessage 错误 */
  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (
        iframeRef.current &&
        event.source === iframeRef.current.contentWindow &&
        isPreviewErrorMessage(event.data)
      ) {
        const { type: errorType, message, stack, sourceFile, lineNumber } = event.data.error
        addPreviewError({ type: errorType, message, stack, sourceFile, lineNumber })
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [addPreviewError])

  /** 监听独立窗口关闭事件 */
  useEffect(() => {
    if (!window.fuleAPI?.preview?.onWindowClosed) return
    const unsubscribe = window.fuleAPI.preview.onWindowClosed(() => {
      setIsExternalWindow(false)
    })
    return unsubscribe
  }, [])

  /** 刷新 iframe */
  const handleRefresh = useCallback(() => {
    if (iframeRef.current && previewUrl) {
      iframeRef.current.src = previewUrl
    }
  }, [previewUrl])

  /** 地址栏进入编辑模式 */
  const handleAddressFocus = useCallback(() => {
    setIsEditing(true)
    setEditValue(previewUrl ?? '')
  }, [previewUrl])

  /** 地址栏提交（回车导航） */
  const handleAddressKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const url = editValue.trim()
        if (url) {
          setPreviewUrl(url)
        }
        setIsEditing(false)
      } else if (e.key === 'Escape') {
        setIsEditing(false)
      }
    },
    [editValue, setPreviewUrl],
  )

  /** 地址栏失焦 */
  const handleAddressBlur = useCallback(() => {
    setIsEditing(false)
  }, [])

  /** 一键清除 URL，回到等待页面 */
  const handleClearUrl = useCallback(() => {
    setPreviewUrl(null)
    setIsEditing(false)
    setIsExternalWindow(false)
    setIsFloatingPopup(false)
  }, [setPreviewUrl])

  /** 在独立 Electron 窗口中打开预览（仅 http URL） */
  const handleOpenExternalWindow = useCallback(() => {
    if (!previewUrl || !isHttpUrl(previewUrl)) return
    window.fuleAPI.preview.openWindow(previewUrl)
    setIsExternalWindow(true)
  }, [previewUrl])

  /** 打开应用内浮层弹窗（blob URL 等非 http 场景） */
  const handleOpenFloatingPopup = useCallback(() => {
    setIsFloatingPopup(true)
  }, [])

  // ===== 无 URL 时的等待页面 =====
  if (!previewUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800">
          <svg className="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <span className="text-sm text-gray-400">启动开发服务器后自动预览</span>
        <span className="text-xs text-gray-600">在终端中运行 npm run dev，或手动输入 URL</span>
        <div className="flex w-full max-w-xs items-center gap-2">
          <input
            type="text"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && manualUrl.trim()) setPreviewUrl(manualUrl.trim())
            }}
            placeholder="http://localhost:3000"
            className="flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => { if (manualUrl.trim()) setPreviewUrl(manualUrl.trim()) }}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500"
          >
            预览
          </button>
        </div>
      </div>
    )
  }

  // ===== 有 URL 时的预览状态 =====
  return (
    <div className="relative flex h-full flex-col bg-gray-950">
      {/* 地址栏 */}
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-gray-700 bg-gray-900 px-2">
        {/* 刷新 */}
        <button
          onClick={handleRefresh}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title="刷新"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        {/* URL 输入框 — 点击进入编辑模式，支持自由修改 */}
        <input
          type="text"
          value={isEditing ? editValue : (previewUrl ?? '')}
          onChange={(e) => setEditValue(e.target.value)}
          onFocus={handleAddressFocus}
          onBlur={handleAddressBlur}
          onKeyDown={handleAddressKeyDown}
          className="h-5 flex-1 rounded bg-gray-800 px-2 text-xs text-gray-300 outline-none focus:ring-1 focus:ring-blue-500"
          aria-label="预览地址"
        />

        {/* 清除 URL */}
        <button
          onClick={handleClearUrl}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-red-400"
          title="清除 URL"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* 弹窗预览：http URL 用独立窗口，其他用浮层 */}
        <button
          onClick={isHttpUrl(previewUrl) ? handleOpenExternalWindow : handleOpenFloatingPopup}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200"
          title={isHttpUrl(previewUrl) ? '在独立窗口中预览' : '弹窗预览'}
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* 内嵌 iframe（独立窗口打开时隐藏） */}
      {!isExternalWindow && !isFloatingPopup && (
        <iframe
          ref={iframeRef}
          src={previewUrl ?? undefined}
          title="内嵌预览"
          className="flex-1 border-none bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
        />
      )}

      {/* 独立窗口已打开的提示 */}
      {isExternalWindow && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-500">
          <span className="text-xs">预览已在独立窗口中打开</span>
          <button
            onClick={() => setIsExternalWindow(false)}
            className="rounded bg-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-600"
          >
            恢复内嵌预览
          </button>
        </div>
      )}

      {/* 应用内浮层弹窗（blob URL 等） */}
      {isFloatingPopup && (
        <>
          <div className="flex flex-1 items-center justify-center text-xs text-gray-500">
            预览已弹出为浮窗
          </div>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div
              className="flex flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-900 shadow-2xl"
              style={{ width: '80vw', height: '80vh', minWidth: 400, minHeight: 300, resize: 'both' }}
            >
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-gray-700 bg-gray-800 px-3">
                <span className="truncate text-xs text-gray-300">{previewUrl}</span>
                <button
                  onClick={() => setIsFloatingPopup(false)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-600 hover:text-white"
                >
                  ×
                </button>
              </div>
              <iframe
                src={previewUrl ?? undefined}
                title="弹窗预览"
                className="flex-1 border-none bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              />
            </div>
          </div>
        </>
      )}

      {/* 错误堆栈浮窗 */}
      <ErrorOverlay errors={previewErrors} />
    </div>
  )
}

export default EmbeddedPreviewPanel
