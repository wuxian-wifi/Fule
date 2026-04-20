import { useCallback, useEffect, useRef } from 'react'

import { useAppModeStore } from '@renderer/stores/app-mode-store'
import { useEditorStore } from '@renderer/stores/editor-store'
import { useProjectStore } from '@renderer/stores/project-store'
import { usePreviewStore } from '@renderer/stores/preview-store'
import FileExplorer from '@renderer/components/editor/file-explorer'
import TabManager from '@renderer/components/editor/tab-manager'
import CodeEditor from '@renderer/components/editor/code-editor'
import ModeSwitch from '@renderer/components/layout/mode-switch'
import SpecPanel from '@renderer/components/layout/spec-panel'
import ResizeHandle from '@renderer/components/layout/resize-handle'
import EmbeddedPreviewPanel from '@renderer/components/preview/embedded-preview-panel'
import TerminalPanel from '@renderer/components/terminal/terminal-panel'

import type { LayoutSnapshot } from '@renderer/stores/app-mode-store'

/** 面板尺寸约束常量 — 放宽范围以支持自由拖拽 */
const MIN_SIDEBAR_WIDTH = 80
const MAX_SIDEBAR_WIDTH = 600
const MIN_RIGHT_PANEL_WIDTH = 100
const MAX_RIGHT_PANEL_WIDTH = 1200
const MIN_TERMINAL_HEIGHT = 60
const MAX_TERMINAL_HEIGHT = 800

/** 可直接预览的文件扩展名 */
const PREVIEWABLE_EXTENSIONS = new Set(['.html', '.htm', '.svg'])

/**
 * 主布局管理器，根据当前模式和布局快照控制各面板的尺寸与可见性
 * 支持拖拽调整面板大小、面板显隐切换、CodeEditor 与活跃标签页联动
 */
function LayoutManager(): React.JSX.Element {
  const currentMode = useAppModeStore((s) => s.currentMode)
  const layout = useAppModeStore((s) => s.layoutSnapshots[s.currentMode])
  const saveLayoutSnapshot = useAppModeStore((s) => s.saveLayoutSnapshot)

  // 项目路径
  const projectPath = useProjectStore((s) => s.projectPath)
  const setProjectPath = useProjectStore((s) => s.setProjectPath)

  // 编辑器活跃标签页数据
  const activeTab = useEditorStore((s) => {
    const tab = s.openTabs.find((t) => t.id === s.activeTabId)
    return tab ?? null
  })
  const updateTabContent = useEditorStore((s) => s.updateTabContent)

  /** 打开文件夹对话框 */
  const handleOpenFolder = useCallback(async () => {
    const result = await window.fuleAPI.fs.openFolder()
    if (result.success && result.data) {
      setProjectPath(result.data)
    }
  }, [setProjectPath])

  /** 保存当前文件到磁盘 */
  const handleSaveFile = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty) return
    const result = await window.fuleAPI.fs.writeFile({
      path: activeTab.filePath,
      content: activeTab.content,
    })
    if (result.success) {
      useEditorStore.getState().markTabClean(activeTab.id)
    }
  }, [activeTab])

  /** 监听 Cmd+S / Ctrl+S 快捷键保存文件 */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSaveFile])

  /** 判断文件是否可直接预览 */
  const isPreviewableFile = useCallback((filePath: string): boolean => {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    return PREVIEWABLE_EXTENSIONS.has(ext)
  }, [])

  /** 用 ref 追踪拖拽中的布局值，避免频繁触发 store 更新 */
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  /** 将当前布局快照持久化到 store */
  const persistLayout = useCallback(
    (patch: Partial<LayoutSnapshot>) => {
      saveLayoutSnapshot(currentMode, { ...layoutRef.current, ...patch })
    },
    [currentMode, saveLayoutSnapshot],
  )

  /** 运行预览：将当前 HTML 文件内容转为 blob URL 加载到预览面板 */
  const handleRunPreview = useCallback(() => {
    if (!activeTab || !isPreviewableFile(activeTab.filePath)) return
    const blob = new Blob([activeTab.content], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    usePreviewStore.getState().setPreviewUrl(blobUrl)
    usePreviewStore.getState().setIsRunning(true)
    // 确保预览面板可见
    if (currentMode === 'spec') {
      persistLayout({ specPanelVisible: true })
    } else {
      persistLayout({ previewVisible: true })
    }
  }, [activeTab, isPreviewableFile, currentMode, persistLayout])

  // ===== 侧边栏拖拽 =====
  const handleSidebarResize = useCallback(
    (delta: number) => {
      const next = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, layoutRef.current.sidebarWidth + delta),
      )
      persistLayout({ sidebarWidth: next })
    },
    [persistLayout],
  )

  // ===== 右侧面板拖拽（Spec 面板或对话面板） =====
  const handleRightPanelResize = useCallback(
    (delta: number) => {
      // 向左拖拽增大右侧面板宽度，所以取反
      if (currentMode === 'spec') {
        const next = Math.min(
          MAX_RIGHT_PANEL_WIDTH,
          Math.max(MIN_RIGHT_PANEL_WIDTH, (layoutRef.current.specPanelWidth ?? 280) - delta),
        )
        persistLayout({ specPanelWidth: next })
      } else {
        const next = Math.min(
          MAX_RIGHT_PANEL_WIDTH,
          Math.max(MIN_RIGHT_PANEL_WIDTH, layoutRef.current.previewWidth - delta),
        )
        persistLayout({ previewWidth: next })
      }
    },
    [currentMode, persistLayout],
  )

  // ===== 终端面板拖拽 =====
  const handleTerminalResize = useCallback(
    (delta: number) => {
      // 向上拖拽增大终端高度，所以取反
      const next = Math.min(
        MAX_TERMINAL_HEIGHT,
        Math.max(MIN_TERMINAL_HEIGHT, layoutRef.current.terminalHeight - delta),
      )
      persistLayout({ terminalHeight: next })
    },
    [persistLayout],
  )

  // ===== 面板显隐切换 =====
  const handleToggleTerminal = useCallback(() => {
    persistLayout({ terminalVisible: !layoutRef.current.terminalVisible })
  }, [persistLayout])

  const handleTogglePreview = useCallback(() => {
    if (currentMode === 'spec') {
      persistLayout({ specPanelVisible: !layoutRef.current.specPanelVisible })
    } else {
      persistLayout({ previewVisible: !layoutRef.current.previewVisible })
    }
  }, [currentMode, persistLayout])

  // ===== CodeEditor 内容变更回调 =====
  const handleEditorChange = useCallback(
    (value: string) => {
      if (activeTab) {
        updateTabContent(activeTab.id, value)
      }
    },
    [activeTab, updateTabContent],
  )

  /** 判断右侧面板是否可见 */
  const isRightPanelVisible =
    currentMode === 'spec'
      ? !!layout.specPanelVisible
      : layout.previewVisible

  /** 右侧面板宽度 */
  const rightPanelWidth =
    currentMode === 'spec'
      ? (layout.specPanelWidth ?? 280)
      : layout.previewWidth

  return (
    <div className="flex h-screen w-screen flex-col bg-gray-900 text-white">
      {/* 顶部标题栏：应用名称 + 面板切换按钮 + 模式切换控件 */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-gray-700 bg-gray-900 px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-300">Fule IDE</span>
          <button
            onClick={handleOpenFolder}
            className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200"
            title="打开项目文件夹"
          >
            📂 打开
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* 终端面板切换按钮 */}
          <button
            onClick={handleToggleTerminal}
            className={`rounded px-2 py-0.5 text-xs ${
              layout.terminalVisible
                ? 'bg-gray-700 text-gray-200'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            aria-label="切换终端面板"
            aria-pressed={layout.terminalVisible}
          >
            终端
          </button>
          {/* 右侧面板切换按钮 */}
          <button
            onClick={handleTogglePreview}
            className={`rounded px-2 py-0.5 text-xs ${
              isRightPanelVisible
                ? 'bg-gray-700 text-gray-200'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            aria-label="切换右侧面板"
            aria-pressed={isRightPanelVisible}
          >
            {currentMode === 'spec' ? '规范' : '预览'}
          </button>
          <ModeSwitch />
        </div>
      </header>

      {/* 主内容区域：侧边栏 + 编辑器 + 右侧面板 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧边栏：文件资源管理器 */}
        <aside
          className="shrink-0 border-r border-gray-700"
          style={{ width: layout.sidebarWidth }}
        >
          {projectPath ? (
            <FileExplorer rootPath={projectPath} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
              <p className="text-center text-xs text-gray-500">暂未打开项目</p>
              <button
                onClick={handleOpenFolder}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500"
              >
                打开文件夹
              </button>
            </div>
          )}
        </aside>

        {/* 侧边栏与编辑器之间的拖拽分隔条 */}
        <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />

        {/* 中央编辑区域 */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center bg-gray-900">
            <div className="flex-1 overflow-hidden">
              <TabManager />
            </div>
            {/* 运行按钮：HTML 文件直接预览，其他文件类型灰显 */}
            {activeTab && (
              <button
                onClick={handleRunPreview}
                className={`flex h-full shrink-0 items-center gap-1 px-3 text-xs transition-colors ${
                  isPreviewableFile(activeTab.filePath)
                    ? 'text-green-400 hover:bg-gray-800 hover:text-green-300'
                    : 'cursor-not-allowed text-gray-600'
                }`}
                disabled={!isPreviewableFile(activeTab.filePath)}
                title={
                  isPreviewableFile(activeTab.filePath)
                    ? '在右侧预览当前文件'
                    : '仅支持 HTML 文件预览'
                }
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                运行
              </button>
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            {activeTab ? (
              <CodeEditor
                filePath={activeTab.filePath}
                content={activeTab.content}
                language={activeTab.language}
                onChange={handleEditorChange}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                打开文件开始编辑
              </div>
            )}
          </div>
        </main>

        {/* 编辑器与右侧面板之间的拖拽分隔条 */}
        {isRightPanelVisible && (
          <ResizeHandle direction="horizontal" onResize={handleRightPanelResize} />
        )}

        {/* 右侧面板：根据模式切换显示内容 */}
        {isRightPanelVisible && currentMode === 'spec' && (
          <aside
            className="shrink-0 border-l border-gray-700"
            style={{ width: rightPanelWidth }}
          >
            <SpecPanel />
          </aside>
        )}

        {/* Vibe 模式下的内嵌预览面板 */}
        {isRightPanelVisible && currentMode === 'vibe' && (
          <aside
            className="flex shrink-0 flex-col border-l border-gray-700 bg-gray-900"
            style={{ width: rightPanelWidth }}
          >
            <EmbeddedPreviewPanel />
          </aside>
        )}
      </div>

      {/* 终端面板与主内容之间的拖拽分隔条 */}
      {layout.terminalVisible && (
        <ResizeHandle direction="vertical" onResize={handleTerminalResize} />
      )}

      {/* 底部终端面板 — 用 CSS 隐藏而非卸载，保留 PTY 会话和 xterm 实例 */}
      <div
        className="shrink-0 border-t border-gray-700 bg-gray-950"
        style={{
          height: layout.terminalVisible ? layout.terminalHeight : 0,
          overflow: 'hidden',
          display: layout.terminalVisible ? undefined : 'none',
        }}
      >
        <TerminalPanel />
      </div>
    </div>
  )
}

export default LayoutManager
