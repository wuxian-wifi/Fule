import { useState, useCallback, memo } from 'react'

import { useEditorStore } from '@renderer/stores/editor-store'

/** Diff 变更数据，由外部（AI 生成阶段）注入 */
interface DiffChange {
  /** 关联的标签页 ID */
  tabId: string
  /** 变更前的原始内容 */
  originalContent: string
  /** AI 生成的修改内容 */
  modifiedContent: string
}

/** DiffActionBar 组件 props */
interface DiffActionBarProps {
  /** 当前待处理的 Diff 变更（为空时隐藏操作栏） */
  diffChange?: DiffChange
  /** 接受/撤销操作完成后的回调 */
  onActionComplete?: () => void
}

/**
 * Diff 操作栏组件
 * 当 AI 生成代码变更时显示浮动工具栏，提供一键接受和一键撤销功能
 * 接受：将修改内容应用到编辑器标签页
 * 撤销：恢复原始内容
 */
const DiffActionBar = memo(function DiffActionBar({
  diffChange,
  onActionComplete,
}: DiffActionBarProps): React.JSX.Element | null {
  const updateTabContent = useEditorStore((s) => s.updateTabContent)
  const markTabClean = useEditorStore((s) => s.markTabClean)
  const [isProcessing, setIsProcessing] = useState(false)

  /** 接受 AI 变更：将修改内容写入编辑器 */
  const handleAccept = useCallback(() => {
    if (!diffChange || isProcessing) return
    setIsProcessing(true)

    updateTabContent(diffChange.tabId, diffChange.modifiedContent)
    onActionComplete?.()
    setIsProcessing(false)
  }, [diffChange, isProcessing, updateTabContent, onActionComplete])

  /** 撤销 AI 变更：恢复原始内容 */
  const handleRevert = useCallback(() => {
    if (!diffChange || isProcessing) return
    setIsProcessing(true)

    updateTabContent(diffChange.tabId, diffChange.originalContent)
    markTabClean(diffChange.tabId)
    onActionComplete?.()
    setIsProcessing(false)
  }, [diffChange, isProcessing, updateTabContent, markTabClean, onActionComplete])

  // 没有待处理的变更时不渲染
  if (!diffChange) return null

  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-700 bg-gray-800 px-3 py-2">
      <span className="mr-auto text-xs text-gray-400">AI 已生成代码变更</span>
      <button
        onClick={handleRevert}
        disabled={isProcessing}
        className="rounded px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/30 disabled:opacity-40"
        aria-label="撤销 AI 变更"
      >
        撤销
      </button>
      <button
        onClick={handleAccept}
        disabled={isProcessing}
        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-40"
        aria-label="接受 AI 变更"
      >
        接受
      </button>
    </div>
  )
})

export default DiffActionBar
