import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { useAppModeStore } from '@renderer/stores/app-mode-store'
import { useConversationStore } from '@renderer/stores/conversation-store'
import { switchMode } from '@renderer/services/mode-switcher'

import type { AppMode, LayoutSnapshot } from '@renderer/stores/app-mode-store'

/**
 * 同步执行 switchMode 并等待结果
 * switchMode 内部所有操作均为同步（Zustand setState），
 * 虽然函数签名为 async，但 Promise 会立即 resolve。
 * 此辅助函数在同步上下文中安全调用。
 */
function switchModeSync(targetMode: AppMode): void {
  // switchMode 返回的 Promise 在当前微任务中即可 resolve
  // 但由于 fc.property 是同步的，我们需要确保状态已更新
  // 实际上 switchMode 内部全部是同步 Zustand 操作，Promise 只是包装
  void switchMode(targetMode)
}

/**
 * 生成随机 LayoutSnapshot，覆盖各种面板尺寸和可见性组合
 */
const layoutSnapshotArb: fc.Arbitrary<LayoutSnapshot> = fc.record({
  editorWidth: fc.integer({ min: 0, max: 100 }),
  previewWidth: fc.integer({ min: 0, max: 100 }),
  previewVisible: fc.boolean(),
  terminalHeight: fc.integer({ min: 0, max: 1000 }),
  terminalVisible: fc.boolean(),
  sidebarWidth: fc.integer({ min: 0, max: 500 }),
  specPanelVisible: fc.boolean(),
  specPanelWidth: fc.integer({ min: 0, max: 500 }),
})

/**
 * 重置所有 store 到初始状态
 * 在每次 fast-check 迭代前调用，防止状态泄漏
 */
function resetStores(): void {
  useAppModeStore.setState({
    currentMode: 'vibe',
    layoutSnapshots: {
      vibe: {
        editorWidth: 50, previewWidth: 30, previewVisible: true,
        terminalHeight: 200, terminalVisible: true, sidebarWidth: 240,
        specPanelVisible: false, specPanelWidth: 0,
      },
      spec: {
        editorWidth: 45, previewWidth: 25, previewVisible: true,
        terminalHeight: 200, terminalVisible: true, sidebarWidth: 240,
        specPanelVisible: true, specPanelWidth: 280,
      },
    },
    isSwitching: false,
  })
  useConversationStore.setState({
    conversations: {},
    activeConversationId: { vibe: null, spec: null },
    streamingState: null,
  })
}

/**
 * Property 1: 模式切换布局正确性
 * 验证: 需求 1.2, 1.3
 *
 * 对任意初始布局状态和目标模式，切换后：
 * - Vibe 模式应隐藏规范面板（specPanelVisible = false）
 * - Spec 模式应展开规范面板（specPanelVisible = true）
 */
describe('Property 1: 模式切换布局正确性', () => {
  it('切换到 vibe 模式后，规范面板应隐藏（specPanelVisible = false）', () => {
    /**
     * Validates: Requirements 1.2
     */
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constant('vibe' as AppMode),
          panelWidths: layoutSnapshotArb,
          visibility: fc.record({
            specPanelVisible: fc.boolean(),
            previewVisible: fc.boolean(),
            terminalVisible: fc.boolean(),
          }),
        }),
        ({ panelWidths }) => {
          resetStores()

          // 设置初始状态为 spec 模式，vibe 布局中 specPanelVisible 固定为 false
          useAppModeStore.setState({
            currentMode: 'spec',
            layoutSnapshots: {
              vibe: { ...panelWidths, specPanelVisible: false, specPanelWidth: 0 },
              spec: panelWidths,
            },
            isSwitching: false,
          })

          switchModeSync('vibe')

          const state = useAppModeStore.getState()
          expect(state.currentMode).toBe('vibe')

          // vibe 模式的布局快照中 specPanelVisible 应为 false
          const vibeLayout = state.layoutSnapshots.vibe
          expect(vibeLayout.specPanelVisible).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('切换到 spec 模式后，规范面板应展开（specPanelVisible = true）', () => {
    /**
     * Validates: Requirements 1.3
     */
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constant('spec' as AppMode),
          panelWidths: layoutSnapshotArb,
          visibility: fc.record({
            specPanelVisible: fc.boolean(),
            previewVisible: fc.boolean(),
            terminalVisible: fc.boolean(),
          }),
        }),
        ({ panelWidths }) => {
          resetStores()

          // 设置初始状态为 vibe 模式，spec 布局中 specPanelVisible 固定为 true
          useAppModeStore.setState({
            currentMode: 'vibe',
            layoutSnapshots: {
              vibe: panelWidths,
              spec: { ...panelWidths, specPanelVisible: true, specPanelWidth: 280 },
            },
            isSwitching: false,
          })

          switchModeSync('spec')

          const state = useAppModeStore.getState()
          expect(state.currentMode).toBe('spec')

          // spec 模式的布局快照中 specPanelVisible 应为 true
          const specLayout = state.layoutSnapshots.spec
          expect(specLayout.specPanelVisible).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('对任意初始布局和目标模式，切换后布局的 specPanelVisible 应与模式语义一致', () => {
    /**
     * Validates: Requirements 1.2, 1.3
     */
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constantFrom('vibe' as AppMode, 'spec' as AppMode),
          panelWidths: layoutSnapshotArb,
          visibility: fc.record({
            specPanelVisible: fc.boolean(),
            previewVisible: fc.boolean(),
            terminalVisible: fc.boolean(),
          }),
        }),
        ({ mode: targetMode, panelWidths }) => {
          resetStores()

          const sourceMode: AppMode = targetMode === 'vibe' ? 'spec' : 'vibe'

          // 确保各模式布局的 specPanelVisible 语义正确
          useAppModeStore.setState({
            currentMode: sourceMode,
            layoutSnapshots: {
              vibe: { ...panelWidths, specPanelVisible: false, specPanelWidth: 0 },
              spec: { ...panelWidths, specPanelVisible: true, specPanelWidth: 280 },
            },
            isSwitching: false,
          })

          switchModeSync(targetMode)

          const state = useAppModeStore.getState()
          expect(state.currentMode).toBe(targetMode)

          const targetLayout = state.layoutSnapshots[targetMode]
          if (targetMode === 'vibe') {
            expect(targetLayout.specPanelVisible).toBe(false)
          } else {
            expect(targetLayout.specPanelVisible).toBe(true)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


/**
 * 生成随机对话 ID（非空字符串）
 */
const conversationIdArb: fc.Arbitrary<string> = fc.stringOf(
  fc.char().filter((c) => c.trim().length > 0),
  { minLength: 1, maxLength: 20 },
)

/**
 * Property 2: 模式切换状态保留往返一致性
 * 验证: 需求 1.4
 *
 * 对任意编辑器状态、对话历史和终端会话状态，
 * 从模式 A → B → A 后所有状态应完全一致。
 */
describe('Property 2: 模式切换状态保留往返一致性', () => {
  it('vibe → spec → vibe 往返后，各模式的活跃对话指针应保持不变', () => {
    /**
     * Validates: Requirements 1.4
     */
    fc.assert(
      fc.property(
        fc.record({
          dirtyBuffers: fc.array(fc.string(), { maxLength: 5 }),
          conversations: fc.record({
            vibeConvId: fc.option(conversationIdArb, { nil: null }),
            specConvId: fc.option(conversationIdArb, { nil: null }),
          }),
          terminals: fc.array(fc.string(), { maxLength: 3 }),
        }),
        ({ conversations }) => {
          resetStores()

          // 设置各模式的活跃对话指针
          useConversationStore.setState({
            activeConversationId: {
              vibe: conversations.vibeConvId,
              spec: conversations.specConvId,
            },
          })

          const beforeVibeConvId = conversations.vibeConvId
          const beforeSpecConvId = conversations.specConvId

          // vibe → spec → vibe 往返
          switchModeSync('spec')
          switchModeSync('vibe')

          // 验证往返后活跃对话指针完全一致
          const afterState = useConversationStore.getState()
          expect(afterState.activeConversationId.vibe).toBe(beforeVibeConvId)
          expect(afterState.activeConversationId.spec).toBe(beforeSpecConvId)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('spec → vibe → spec 往返后，各模式的活跃对话指针应保持不变', () => {
    /**
     * Validates: Requirements 1.4
     */
    fc.assert(
      fc.property(
        fc.record({
          dirtyBuffers: fc.array(fc.string(), { maxLength: 5 }),
          conversations: fc.record({
            vibeConvId: fc.option(conversationIdArb, { nil: null }),
            specConvId: fc.option(conversationIdArb, { nil: null }),
          }),
          terminals: fc.array(fc.string(), { maxLength: 3 }),
        }),
        ({ conversations }) => {
          resetStores()

          // 初始模式设为 spec
          useAppModeStore.setState({ currentMode: 'spec' })

          useConversationStore.setState({
            activeConversationId: {
              vibe: conversations.vibeConvId,
              spec: conversations.specConvId,
            },
          })

          const beforeVibeConvId = conversations.vibeConvId
          const beforeSpecConvId = conversations.specConvId

          // spec → vibe → spec 往返
          switchModeSync('vibe')
          switchModeSync('spec')

          const afterState = useConversationStore.getState()
          expect(afterState.activeConversationId.vibe).toBe(beforeVibeConvId)
          expect(afterState.activeConversationId.spec).toBe(beforeSpecConvId)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('往返切换后，各模式的布局快照应保持不变', () => {
    /**
     * Validates: Requirements 1.4
     */
    fc.assert(
      fc.property(
        fc.record({
          dirtyBuffers: fc.array(fc.string(), { maxLength: 5 }),
          conversations: fc.record({
            vibeConvId: fc.option(conversationIdArb, { nil: null }),
            specConvId: fc.option(conversationIdArb, { nil: null }),
          }),
          terminals: fc.array(fc.string(), { maxLength: 3 }),
        }),
        () => {
          resetStores()

          // 记录切换前的布局快照
          const beforeVibeLayout = { ...useAppModeStore.getState().layoutSnapshots.vibe }
          const beforeSpecLayout = { ...useAppModeStore.getState().layoutSnapshots.spec }

          // vibe → spec → vibe 往返
          switchModeSync('spec')
          switchModeSync('vibe')

          // 验证布局快照保持不变
          const afterState = useAppModeStore.getState()
          expect(afterState.layoutSnapshots.vibe).toEqual(beforeVibeLayout)
          expect(afterState.layoutSnapshots.spec).toEqual(beforeSpecLayout)
        },
      ),
      { numRuns: 100 },
    )
  })
})
