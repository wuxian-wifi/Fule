import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'

import { useEditorStore } from '@renderer/stores/editor-store'

/**
 * 重置 EditorStore 到初始状态
 * 在每次 fast-check 迭代前调用，防止状态泄漏
 */
function resetStore(): void {
  useEditorStore.setState({ openTabs: [], activeTabId: null })
}

/**
 * Property 3: AI 代码变更接受/撤销往返正确性
 * 验证: 需求 2.3
 *
 * 对任意有效代码变更，接受后文件内容应等于修改内容；
 * 撤销后应等于原始内容。
 */
describe('Property 3: AI 代码变更接受/撤销往返正确性', () => {
  beforeEach(() => {
    resetStore()
  })

  it('接受 AI 变更后，标签页内容应等于修改内容', () => {
    /**
     * Validates: Requirements 2.3
     */
    fc.assert(
      fc.property(
        fc.record({ original: fc.string(), modified: fc.string() }),
        ({ original, modified }) => {
          resetStore()

          const tabId = '/test/ai-change.ts'

          // 打开标签页并设置原始内容
          useEditorStore.getState().openTab({
            id: tabId,
            filePath: tabId,
            fileName: 'ai-change.ts',
            content: original,
            language: 'typescript',
          })

          // 模拟"接受" AI 变更：用修改内容更新标签页
          useEditorStore.getState().updateTabContent(tabId, modified)

          const tab = useEditorStore.getState().openTabs.find((t) => t.id === tabId)
          expect(tab).toBeDefined()
          expect(tab!.content).toBe(modified)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('撤销 AI 变更后，标签页内容应等于原始内容且标记为干净', () => {
    /**
     * Validates: Requirements 2.3
     */
    fc.assert(
      fc.property(
        fc.record({ original: fc.string(), modified: fc.string() }),
        ({ original, modified }) => {
          resetStore()

          const tabId = '/test/ai-change.ts'

          // 打开标签页并设置原始内容
          useEditorStore.getState().openTab({
            id: tabId,
            filePath: tabId,
            fileName: 'ai-change.ts',
            content: original,
            language: 'typescript',
          })

          // 模拟"接受" AI 变更
          useEditorStore.getState().updateTabContent(tabId, modified)

          // 模拟"撤销"：恢复原始内容并标记为干净
          useEditorStore.getState().updateTabContent(tabId, original)
          useEditorStore.getState().markTabClean(tabId)

          const tab = useEditorStore.getState().openTabs.find((t) => t.id === tabId)
          expect(tab).toBeDefined()
          expect(tab!.content).toBe(original)
          expect(tab!.isDirty).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('接受后再撤销的完整往返，内容应回到原始状态', () => {
    /**
     * Validates: Requirements 2.3
     */
    fc.assert(
      fc.property(
        fc.record({ original: fc.string(), modified: fc.string() }),
        ({ original, modified }) => {
          resetStore()

          const tabId = '/test/ai-change.ts'

          // 打开标签页
          useEditorStore.getState().openTab({
            id: tabId,
            filePath: tabId,
            fileName: 'ai-change.ts',
            content: original,
            language: 'typescript',
          })

          // 接受变更 → 内容为 modified
          useEditorStore.getState().updateTabContent(tabId, modified)
          const afterAccept = useEditorStore.getState().openTabs.find((t) => t.id === tabId)
          expect(afterAccept!.content).toBe(modified)
          expect(afterAccept!.isDirty).toBe(true)

          // 撤销变更 → 内容回到 original，标记干净
          useEditorStore.getState().updateTabContent(tabId, original)
          useEditorStore.getState().markTabClean(tabId)
          const afterRevert = useEditorStore.getState().openTabs.find((t) => t.id === tabId)
          expect(afterRevert!.content).toBe(original)
          expect(afterRevert!.isDirty).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
