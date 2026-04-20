import React, { useCallback, useEffect, useState } from 'react'

import { useEditorStore } from '@renderer/stores/editor-store'
import { detectLanguage } from '@renderer/utils/language-detector'

import type { FileTreeNode } from '@shared/types'

/** FileExplorer 组件 props */
interface FileExplorerProps {
  /** 项目根目录路径 */
  rootPath: string
}

/** TreeNode 组件 props */
interface TreeNodeProps {
  /** 文件树节点数据 */
  node: FileTreeNode
  /** 缩进层级 */
  depth: number
  /** 点击文件回调 */
  onFileClick: (node: FileTreeNode) => void
}

/** 单个树节点，支持目录展开/折叠和文件点击 */
const TreeNode = React.memo(function TreeNode({
  node,
  depth,
  onFileClick,
}: TreeNodeProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false)
  const [children, setChildren] = useState<FileTreeNode[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = useCallback(async () => {
    if (node.type === 'file') {
      onFileClick(node)
      return
    }
    // 目录：切换展开状态
    if (!isExpanded && children.length === 0) {
      setIsLoading(true)
      const result = await window.fuleAPI.fs.readDir(node.path)
      if (result.success && result.data) {
        setChildren(result.data.children)
      }
      setIsLoading(false)
    }
    setIsExpanded((prev) => !prev)
  }, [node, isExpanded, children.length, onFileClick])

  const isDir = node.type === 'directory'
  const paddingLeft = depth * 16 + 8

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        className="flex cursor-pointer items-center gap-1.5 py-0.5 text-sm text-gray-300 hover:bg-gray-700"
        style={{ paddingLeft }}
        onClick={handleToggle}
      >
        {/* 目录展开/折叠箭头 */}
        {isDir ? (
          <span className="w-4 shrink-0 text-center text-xs text-gray-500">
            {isLoading ? '⏳' : isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {/* 文件/目录图标 */}
        <span className="shrink-0">{isDir ? '📁' : '📄'}</span>
        <span className="truncate">{node.name}</span>
      </div>
      {/* 子节点递归渲染 */}
      {isDir && isExpanded && (
        <div role="group">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
})

/**
 * 文件资源管理器组件，以树形结构展示项目目录
 * 点击文件时在编辑器中打开对应标签页
 */
function FileExplorer({ rootPath }: FileExplorerProps): React.JSX.Element {
  const [rootChildren, setRootChildren] = useState<FileTreeNode[]>([])
  const openTab = useEditorStore((s) => s.openTab)

  useEffect(() => {
    // 加载根目录内容
    async function loadRoot(): Promise<void> {
      const result = await window.fuleAPI.fs.readDir(rootPath)
      if (result.success && result.data) {
        setRootChildren(result.data.children)
      }
    }
    if (rootPath) {
      loadRoot()
    }
  }, [rootPath])

  const handleFileClick = useCallback(
    async (node: FileTreeNode) => {
      // 读取文件内容并打开标签页
      const result = await window.fuleAPI.fs.readFile(node.path)
      if (result.success && result.data) {
        openTab({
          id: node.path,
          filePath: node.path,
          fileName: node.name,
          content: result.data.content,
          language: detectLanguage(node.path),
        })
      }
    },
    [openTab]
  )

  return (
    <div className="h-full overflow-y-auto bg-gray-900 text-sm" role="tree">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        资源管理器
      </div>
      {rootChildren.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  )
}

export default FileExplorer
