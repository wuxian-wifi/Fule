import React, { useCallback } from 'react'

import { useEditorStore } from '@renderer/stores/editor-store'

import type { TabInfo } from '@renderer/stores/editor-store'

/** TabItem 组件 props */
interface TabItemProps {
  /** 标签页数据 */
  tab: TabInfo
  /** 是否为当前激活标签页 */
  isActive: boolean
  /** 点击标签页回调 */
  onClick: (tabId: string) => void
  /** 关闭标签页回调 */
  onClose: (tabId: string) => void
}

/** 单个标签页项，展示文件名和脏状态指示器 */
const TabItem = React.memo(function TabItem({
  tab,
  isActive,
  onClick,
  onClose,
}: TabItemProps): React.JSX.Element {
  const handleClick = useCallback(() => {
    onClick(tab.id)
  }, [onClick, tab.id])

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      // 阻止冒泡，避免触发标签页切换
      e.stopPropagation()
      onClose(tab.id)
    },
    [onClose, tab.id]
  )

  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={`group flex cursor-pointer items-center gap-1.5 border-r border-gray-700 px-3 py-1.5 text-sm ${
        isActive
          ? 'bg-gray-800 text-white'
          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={handleClick}
    >
      {/* 脏状态指示：未保存时显示圆点 */}
      {tab.isDirty && (
        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-400" />
      )}
      <span className="max-w-[120px] truncate">{tab.fileName}</span>
      <button
        className="ml-1 shrink-0 rounded p-0.5 text-gray-500 opacity-0 hover:bg-gray-600 hover:text-white group-hover:opacity-100"
        onClick={handleClose}
        aria-label={`关闭 ${tab.fileName}`}
      >
        ×
      </button>
    </div>
  )
})

/**
 * 多标签页管理组件，展示水平标签栏，支持切换、关闭和脏状态指示
 */
function TabManager(): React.JSX.Element {
  const openTabs = useEditorStore((s) => s.openTabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const closeTab = useEditorStore((s) => s.closeTab)

  const handleClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId)
    },
    [setActiveTab]
  )

  const handleClose = useCallback(
    (tabId: string) => {
      closeTab(tabId)
    },
    [closeTab]
  )

  if (openTabs.length === 0) {
    return <div className="h-9 border-b border-gray-700 bg-gray-900" />
  }

  return (
    <div
      role="tablist"
      className="flex h-9 overflow-x-auto border-b border-gray-700 bg-gray-900"
    >
      {openTabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onClick={handleClick}
          onClose={handleClose}
        />
      ))}
    </div>
  )
}

export default TabManager
