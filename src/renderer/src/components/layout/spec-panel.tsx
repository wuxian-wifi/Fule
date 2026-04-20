import React from 'react'

/** 规范文档条目 */
interface SpecDocItem {
  /** 文档标识 */
  id: string
  /** 文档显示名称 */
  name: string
  /** 文档图标 */
  icon: string
}

/** Spec 模式下展示的规范文档列表 */
const SPEC_DOCUMENTS: SpecDocItem[] = [
  { id: 'requirements', name: 'Requirements.md', icon: '📋' },
  { id: 'design', name: 'Design.md', icon: '📐' },
  { id: 'tasks', name: 'Tasks.md', icon: '✅' },
]

/**
 * Spec 模式规范面板，以树形列表展示 Requirements、Design、Tasks 文档
 * 当前为占位实现，实际的 Spec 文档管理功能将在后续阶段完成
 */
const SpecPanel = React.memo(function SpecPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col bg-gray-900 text-sm">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        规范文档
      </div>
      <div className="flex-1 overflow-y-auto">
        {SPEC_DOCUMENTS.map((doc) => (
          <div
            key={doc.id}
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-gray-300 hover:bg-gray-700"
          >
            <span className="shrink-0">{doc.icon}</span>
            <span className="truncate">{doc.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

export default SpecPanel
