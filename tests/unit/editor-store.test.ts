import { describe, it, expect, beforeEach } from 'vitest'

import { useEditorStore } from '@renderer/stores/editor-store'

import type { TabInfo } from '@renderer/stores/editor-store'

/** 创建测试用标签页数据 */
function createTestTab(overrides: Partial<TabInfo> = {}): Omit<TabInfo, 'isDirty'> {
  return {
    id: overrides.id ?? '/test/file.ts',
    filePath: overrides.filePath ?? '/test/file.ts',
    fileName: overrides.fileName ?? 'file.ts',
    content: overrides.content ?? 'const x = 1',
    language: overrides.language ?? 'typescript',
  }
}

describe('EditorStore - 标签页管理', () => {
  beforeEach(() => {
    // 每个测试前重置 store 状态
    useEditorStore.setState({ openTabs: [], activeTabId: null })
  })

  describe('openTab - 打开标签页', () => {
    it('应能打开新标签页并设为激活状态', () => {
      const tab = createTestTab()
      useEditorStore.getState().openTab(tab)

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(1)
      expect(state.openTabs[0].id).toBe(tab.id)
      expect(state.openTabs[0].isDirty).toBe(false)
      expect(state.activeTabId).toBe(tab.id)
    })

    it('打开已存在的标签页时应切换到该标签页而非重复创建', () => {
      const tab1 = createTestTab({ id: '/a.ts', fileName: 'a.ts' })
      const tab2 = createTestTab({ id: '/b.ts', fileName: 'b.ts' })

      const store = useEditorStore.getState()
      store.openTab(tab1)
      store.openTab(tab2)
      // 再次打开 tab1
      store.openTab(tab1)

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(2)
      expect(state.activeTabId).toBe(tab1.id)
    })

    it('应能连续打开多个不同标签页', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.openTab(createTestTab({ id: '/b.ts' }))
      store.openTab(createTestTab({ id: '/c.ts' }))

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(3)
      // 最后打开的标签页应为激活状态
      expect(state.activeTabId).toBe('/c.ts')
    })
  })

  describe('closeTab - 关闭标签页', () => {
    it('关闭当前激活标签页后应切换到相邻标签页', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.openTab(createTestTab({ id: '/b.ts' }))
      store.openTab(createTestTab({ id: '/c.ts' }))

      // 激活 b，然后关闭 b
      store.setActiveTab('/b.ts')
      store.closeTab('/b.ts')

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(2)
      // 应切换到原位置的下一个标签页 c
      expect(state.activeTabId).toBe('/c.ts')
    })

    it('关闭最后一个标签页后 activeTabId 应为 null', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.closeTab('/a.ts')

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(0)
      expect(state.activeTabId).toBeNull()
    })

    it('关闭非激活标签页不应影响当前激活标签页', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.openTab(createTestTab({ id: '/b.ts' }))

      // 当前激活 b，关闭 a
      store.closeTab('/a.ts')

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(1)
      expect(state.activeTabId).toBe('/b.ts')
    })

    it('关闭末尾激活标签页应切换到前一个标签页', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.openTab(createTestTab({ id: '/b.ts' }))
      // 当前激活 b（末尾），关闭 b
      store.closeTab('/b.ts')

      const state = useEditorStore.getState()
      expect(state.activeTabId).toBe('/a.ts')
    })

    it('关闭不存在的标签页不应产生副作用', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.closeTab('/nonexistent.ts')

      const state = useEditorStore.getState()
      expect(state.openTabs).toHaveLength(1)
      expect(state.activeTabId).toBe('/a.ts')
    })
  })

  describe('setActiveTab - 切换标签页', () => {
    it('应能切换到指定标签页', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.openTab(createTestTab({ id: '/b.ts' }))

      store.setActiveTab('/a.ts')
      expect(useEditorStore.getState().activeTabId).toBe('/a.ts')
    })

    it('切换到不存在的标签页不应改变当前激活状态', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))

      store.setActiveTab('/nonexistent.ts')
      expect(useEditorStore.getState().activeTabId).toBe('/a.ts')
    })
  })

  describe('updateTabContent - 更新内容', () => {
    it('更新内容后应自动标记为脏状态', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts', content: 'old' }))

      store.updateTabContent('/a.ts', 'new content')

      const tab = useEditorStore.getState().openTabs[0]
      expect(tab.content).toBe('new content')
      expect(tab.isDirty).toBe(true)
    })
  })

  describe('markTabDirty / markTabClean - 脏状态管理', () => {
    it('应能标记标签页为脏状态', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))

      store.markTabDirty('/a.ts')
      expect(useEditorStore.getState().openTabs[0].isDirty).toBe(true)
    })

    it('应能标记标签页为干净状态', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts' }))
      store.markTabDirty('/a.ts')
      store.markTabClean('/a.ts')

      expect(useEditorStore.getState().openTabs[0].isDirty).toBe(false)
    })
  })

  describe('searchInTabs - 搜索功能', () => {
    it('应能在已打开标签页中搜索匹配文本', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({
        id: '/a.ts',
        content: 'line one\nline two\nline three',
      }))

      const results = store.searchInTabs('two')
      expect(results).toHaveLength(1)
      expect(results[0].lineNumber).toBe(2)
      expect(results[0].lineText).toBe('line two')
    })

    it('搜索应不区分大小写', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({
        id: '/a.ts',
        content: 'Hello World',
      }))

      const results = store.searchInTabs('hello')
      expect(results).toHaveLength(1)
    })

    it('空查询应返回空结果', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts', content: 'some content' }))

      const results = store.searchInTabs('')
      expect(results).toHaveLength(0)
    })

    it('应能跨多个标签页搜索', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({
        id: '/a.ts',
        content: 'const foo = 1',
      }))
      store.openTab(createTestTab({
        id: '/b.ts',
        content: 'const bar = 2\nconst foo = 3',
      }))

      const results = store.searchInTabs('const')
      expect(results).toHaveLength(3)
    })

    it('无匹配时应返回空数组', () => {
      const store = useEditorStore.getState()
      store.openTab(createTestTab({ id: '/a.ts', content: 'hello' }))

      const results = store.searchInTabs('xyz')
      expect(results).toHaveLength(0)
    })
  })
})
