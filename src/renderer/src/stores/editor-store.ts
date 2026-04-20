import { create } from 'zustand'

/** 单个标签页信息 */
export interface TabInfo {
  /** 标签页唯一标识（使用文件路径） */
  id: string
  /** 文件完整路径 */
  filePath: string
  /** 文件名（用于标签页显示） */
  fileName: string
  /** 文件内容 */
  content: string
  /** 是否有未保存的修改 */
  isDirty: boolean
  /** Monaco 语言标识符 */
  language: string
}

/** 搜索匹配结果 */
export interface SearchMatch {
  /** 所在标签页 ID */
  tabId: string
  /** 文件路径 */
  filePath: string
  /** 匹配所在行号（从 1 开始） */
  lineNumber: number
  /** 匹配所在行的完整文本 */
  lineText: string
}

/** 编辑器状态 Store 接口 */
interface EditorStore {
  /** 已打开的标签页列表 */
  openTabs: TabInfo[]
  /** 当前激活的标签页 ID */
  activeTabId: string | null

  /** 打开新标签页或切换到已存在的标签页 */
  openTab: (tab: Omit<TabInfo, 'isDirty'>) => void
  /** 关闭指定标签页 */
  closeTab: (tabId: string) => void
  /** 切换激活的标签页 */
  setActiveTab: (tabId: string) => void
  /** 更新标签页内容 */
  updateTabContent: (tabId: string, content: string) => void
  /** 标记标签页为已修改 */
  markTabDirty: (tabId: string) => void
  /** 标记标签页为已保存 */
  markTabClean: (tabId: string) => void
  /** 在所有已打开标签页中搜索文本 */
  searchInTabs: (query: string) => SearchMatch[]
}

/**
 * 编辑器状态管理 Store
 * 管理多标签页的打开、关闭、切换、内容更新和脏状态追踪
 */
export const useEditorStore = create<EditorStore>((set, get) => ({
  openTabs: [],
  activeTabId: null,

  openTab: (tab) => {
    const { openTabs } = get()
    const existing = openTabs.find((t) => t.id === tab.id)
    if (existing) {
      // 标签页已存在，直接切换
      set({ activeTabId: tab.id })
      return
    }
    // 创建新标签页
    const newTab: TabInfo = { ...tab, isDirty: false }
    set({ openTabs: [...openTabs, newTab], activeTabId: tab.id })
  },

  closeTab: (tabId) => {
    const { openTabs, activeTabId } = get()
    const index = openTabs.findIndex((t) => t.id === tabId)
    if (index === -1) return

    const nextTabs = openTabs.filter((t) => t.id !== tabId)
    let nextActiveId = activeTabId

    // 关闭的是当前激活标签页时，切换到相邻标签页
    if (activeTabId === tabId) {
      if (nextTabs.length === 0) {
        nextActiveId = null
      } else if (index >= nextTabs.length) {
        nextActiveId = nextTabs[nextTabs.length - 1].id
      } else {
        nextActiveId = nextTabs[index].id
      }
    }

    set({ openTabs: nextTabs, activeTabId: nextActiveId })
  },

  setActiveTab: (tabId) => {
    const { openTabs } = get()
    if (openTabs.some((t) => t.id === tabId)) {
      set({ activeTabId: tabId })
    }
  },

  updateTabContent: (tabId, content) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId ? { ...t, content, isDirty: true } : t
      ),
    }))
  },

  markTabDirty: (tabId) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: true } : t
      ),
    }))
  },

  markTabClean: (tabId) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) =>
        t.id === tabId ? { ...t, isDirty: false } : t
      ),
    }))
  },

  searchInTabs: (query) => {
    if (!query) return []
    const { openTabs } = get()
    const matches: SearchMatch[] = []
    const lowerQuery = query.toLowerCase()

    for (const tab of openTabs) {
      const lines = tab.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          matches.push({
            tabId: tab.id,
            filePath: tab.filePath,
            lineNumber: i + 1,
            lineText: lines[i],
          })
        }
      }
    }
    return matches
  },
}))
