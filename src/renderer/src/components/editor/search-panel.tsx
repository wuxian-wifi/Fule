import React, { useCallback, useState } from 'react'

import { useEditorStore } from '@renderer/stores/editor-store'

import type { SearchMatch } from '@renderer/stores/editor-store'

/**
 * 全局搜索替换面板组件
 * 在所有已打开标签页中进行文本搜索，支持基本的替换功能
 */
function SearchPanel(): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [results, setResults] = useState<SearchMatch[]>([])
  const searchInTabs = useEditorStore((s) => s.searchInTabs)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const updateTabContent = useEditorStore((s) => s.updateTabContent)
  const openTabs = useEditorStore((s) => s.openTabs)

  const handleSearch = useCallback(() => {
    const matches = searchInTabs(searchQuery)
    setResults(matches)
  }, [searchQuery, searchInTabs])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch()
      }
    },
    [handleSearch]
  )

  /** 点击搜索结果，跳转到对应标签页 */
  const handleResultClick = useCallback(
    (match: SearchMatch) => {
      setActiveTab(match.tabId)
    },
    [setActiveTab]
  )

  /** 替换所有匹配项 */
  const handleReplaceAll = useCallback(() => {
    if (!searchQuery || !replaceQuery) return
    // 遍历所有包含匹配的标签页，执行替换
    const affectedTabIds = new Set(results.map((r) => r.tabId))
    for (const tabId of affectedTabIds) {
      const tab = openTabs.find((t) => t.id === tabId)
      if (tab) {
        const newContent = tab.content.split(searchQuery).join(replaceQuery)
        updateTabContent(tabId, newContent)
      }
    }
    // 替换后重新搜索以更新结果
    const newMatches = searchInTabs(searchQuery)
    setResults(newMatches)
  }, [searchQuery, replaceQuery, results, openTabs, updateTabContent, searchInTabs])

  return (
    <div className="flex h-full flex-col bg-gray-900 text-sm">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        搜索
      </div>
      <div className="flex flex-col gap-2 px-3">
        {/* 搜索输入框 */}
        <input
          type="text"
          placeholder="搜索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white placeholder-gray-500 outline-none focus:border-blue-500"
        />
        {/* 替换输入框 */}
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="替换..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            className="flex-1 rounded border border-gray-600 bg-gray-800 px-2 py-1 text-white placeholder-gray-500 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleReplaceAll}
            className="shrink-0 rounded bg-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-600"
            title="全部替换"
          >
            全部替换
          </button>
        </div>
      </div>
      {/* 搜索结果列表 */}
      <div className="mt-2 flex-1 overflow-y-auto px-3">
        {results.length > 0 && (
          <div className="mb-1 text-xs text-gray-500">
            {results.length} 个结果
          </div>
        )}
        {results.map((match, index) => (
          <div
            key={`${match.tabId}-${match.lineNumber}-${index}`}
            className="cursor-pointer rounded px-2 py-1 text-gray-300 hover:bg-gray-700"
            onClick={() => handleResultClick(match)}
          >
            <div className="truncate text-xs text-gray-500">
              {match.filePath}:{match.lineNumber}
            </div>
            <div className="truncate text-gray-300">{match.lineText.trim()}</div>
          </div>
        ))}
        {searchQuery && results.length === 0 && (
          <div className="py-2 text-center text-xs text-gray-500">
            未找到匹配结果
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchPanel
