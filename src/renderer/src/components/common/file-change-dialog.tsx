import React from 'react'

/** FileChangeDialog 组件的 props */
interface FileChangeDialogProps {
  /** 被外部修改的文件路径 */
  filePath: string
  /** 点击"重新加载"按钮的回调 */
  onReload: () => void
  /** 点击"保留当前"按钮的回调 */
  onKeep: () => void
}

/**
 * 外部文件变更提示对话框
 * 当检测到文件在 Fule 外部被修改且内容与编辑器不同时显示，
 * 提供"重新加载"和"保留当前"两个操作选项。
 */
const FileChangeDialog = React.memo(function FileChangeDialog({
  filePath,
  onReload,
  onKeep
}: FileChangeDialogProps): React.JSX.Element {
  // 从完整路径中提取文件名用于显示
  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-yellow-600 bg-gray-800 p-4 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-yellow-400">文件已在外部被修改</p>
      <p className="mb-3 truncate text-xs text-gray-300" title={filePath}>
        {fileName}
      </p>
      <div className="flex gap-2">
        <button
          onClick={onReload}
          className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
        >
          重新加载
        </button>
        <button
          onClick={onKeep}
          className="rounded bg-gray-600 px-3 py-1 text-xs text-white hover:bg-gray-500"
        >
          保留当前
        </button>
      </div>
    </div>
  )
})

export default FileChangeDialog
