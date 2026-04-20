import { describe, it, expect, beforeEach } from 'vitest'
import { useAppModeStore } from '@renderer/stores/app-mode-store'
import { useConversationStore } from '@renderer/stores/conversation-store'
import {
  switchMode,
  captureLayoutSnapshot,
  applyLayoutSnapshot,
  pauseStreamingUI,
  resumeStreamingUI,
  saveActiveConversation,
  restoreActiveConversation,
} from '@renderer/services/mode-switcher'

import type { LayoutSnapshot } from '@renderer/stores/app-mode-store'
import type { StreamingState } from '@renderer/stores/conversation-store'

/** 默认 vibe 布局，用于测试重置 */
const DEFAULT_VIBE_LAYOUT: LayoutSnapshot = {
  editorWidth: 50,
  previewWidth: 30,
  previewVisible: true,
  terminalHeight: 200,
  terminalVisible: true,
  sidebarWidth: 240,
  specPanelVisible: false,
  specPanelWidth: 0,
}

/** 默认 spec 布局，用于测试重置 */
const DEFAULT_SPEC_LAYOUT: LayoutSnapshot = {
  editorWidth: 45,
  previewWidth: 25,
  previewVisible: true,
  terminalHeight: 200,
  terminalVisible: true,
  sidebarWidth: 240,
  specPanelVisible: true,
  specPanelWidth: 280,
}

describe('ModeSwitcher - 模式切换状态机', () => {
  beforeEach(() => {
    // 重置 AppModeStore
    useAppModeStore.setState({
      currentMode: 'vibe',
      layoutSnapshots: {
        vibe: { ...DEFAULT_VIBE_LAYOUT },
        spec: { ...DEFAULT_SPEC_LAYOUT },
      },
      isSwitching: false,
    })

    // 重置 ConversationStore（不触发持久化）
    useConversationStore.setState({
      conversations: {},
      activeConversationId: { vibe: null, spec: null },
      streamingState: null,
    })
  })

  describe('switchMode - 核心切换算法', () => {
    it('应能将模式从 vibe 切换到 spec', async () => {
      await switchMode('spec')
      expect(useAppModeStore.getState().currentMode).toBe('spec')
    })

    it('应能将模式从 spec 切换到 vibe', async () => {
      useAppModeStore.getState().setCurrentMode('spec')
      await switchMode('vibe')
      expect(useAppModeStore.getState().currentMode).toBe('vibe')
    })

    it('目标模式与当前模式相同时应直接返回', async () => {
      await switchMode('vibe')
      // 模式不变，isSwitching 不应被设置过
      expect(useAppModeStore.getState().currentMode).toBe('vibe')
      expect(useAppModeStore.getState().isSwitching).toBe(false)
    })

    it('切换完成后 isSwitching 应为 false', async () => {
      await switchMode('spec')
      expect(useAppModeStore.getState().isSwitching).toBe(false)
    })
  })

  describe('防重入锁', () => {
    it('isSwitching 为 true 时应阻止切换', async () => {
      useAppModeStore.getState().setIsSwitching(true)
      await switchMode('spec')
      // 模式不应改变，因为锁阻止了切换
      expect(useAppModeStore.getState().currentMode).toBe('vibe')
    })

    it('异常发生时 isSwitching 应被重置为 false', async () => {
      // 模拟异常：在切换过程中破坏 store 状态
      const originalGetLayoutSnapshot = useAppModeStore.getState().getLayoutSnapshot
      useAppModeStore.setState({
        getLayoutSnapshot: () => {
          throw new Error('模拟异常')
        },
      })

      try {
        await switchMode('spec')
      } catch {
        // 预期会抛出异常
      }

      // 即使异常发生，isSwitching 也应被重置
      expect(useAppModeStore.getState().isSwitching).toBe(false)

      // 恢复原始方法
      useAppModeStore.setState({ getLayoutSnapshot: originalGetLayoutSnapshot })
    })
  })

  describe('布局快照保存与恢复', () => {
    it('切换前应保存源模式的布局快照', async () => {
      // 修改 vibe 布局以便验证快照被保存
      const customLayout: LayoutSnapshot = {
        editorWidth: 70,
        previewWidth: 15,
        previewVisible: false,
        terminalHeight: 150,
        terminalVisible: false,
        sidebarWidth: 200,
        specPanelVisible: false,
        specPanelWidth: 0,
      }
      useAppModeStore.getState().saveLayoutSnapshot('vibe', customLayout)

      await switchMode('spec')

      // vibe 模式的快照应被保留
      const vibeSnapshot = useAppModeStore.getState().getLayoutSnapshot('vibe')
      expect(vibeSnapshot.editorWidth).toBe(70)
      expect(vibeSnapshot.previewVisible).toBe(false)
    })

    it('captureLayoutSnapshot 应返回当前模式布局的副本', () => {
      const snapshot = captureLayoutSnapshot()
      expect(snapshot.editorWidth).toBe(DEFAULT_VIBE_LAYOUT.editorWidth)
      expect(snapshot.previewWidth).toBe(DEFAULT_VIBE_LAYOUT.previewWidth)
    })

    it('applyLayoutSnapshot 应将快照写入指定模式', () => {
      const newLayout: LayoutSnapshot = {
        editorWidth: 60,
        previewWidth: 20,
        previewVisible: true,
        terminalHeight: 250,
        terminalVisible: true,
        sidebarWidth: 220,
      }
      applyLayoutSnapshot('vibe', newLayout)

      const stored = useAppModeStore.getState().getLayoutSnapshot('vibe')
      expect(stored.editorWidth).toBe(60)
      expect(stored.terminalHeight).toBe(250)
    })
  })

  describe('对话指针保存与恢复', () => {
    it('切换后应保留各模式独立的活跃对话指针', async () => {
      // 为 vibe 模式设置活跃对话
      useConversationStore.getState().setActiveConversation('vibe', 'conv-vibe-1')
      // 为 spec 模式设置活跃对话
      useConversationStore.getState().setActiveConversation('spec', 'conv-spec-1')

      await switchMode('spec')

      // 两个模式的对话指针应各自保留
      const { activeConversationId } = useConversationStore.getState()
      expect(activeConversationId.vibe).toBe('conv-vibe-1')
      expect(activeConversationId.spec).toBe('conv-spec-1')
    })

    it('saveActiveConversation 应保留指定模式的对话指针', () => {
      useConversationStore.getState().setActiveConversation('vibe', 'conv-123')
      saveActiveConversation('vibe')

      const { activeConversationId } = useConversationStore.getState()
      expect(activeConversationId.vibe).toBe('conv-123')
    })

    it('restoreActiveConversation 应恢复指定模式的对话指针', () => {
      useConversationStore.getState().setActiveConversation('spec', 'conv-456')
      restoreActiveConversation('spec')

      const { activeConversationId } = useConversationStore.getState()
      expect(activeConversationId.spec).toBe('conv-456')
    })
  })

  describe('流式响应暂停与恢复', () => {
    it('切换时不应丢失流式响应状态', async () => {
      // 设置一个活跃的流式响应
      const streaming: StreamingState = {
        conversationId: 'conv-stream-1',
        partialResponse: '正在生成代码...',
        isStreaming: true,
      }
      useConversationStore.getState().setStreamingState(streaming)

      await switchMode('spec')

      // 流式状态应被保留（恢复后 isStreaming 为 true）
      const { streamingState } = useConversationStore.getState()
      expect(streamingState).not.toBeNull()
      expect(streamingState!.conversationId).toBe('conv-stream-1')
      expect(streamingState!.partialResponse).toBe('正在生成代码...')
      expect(streamingState!.isStreaming).toBe(true)
    })

    it('pauseStreamingUI 应将 isStreaming 设为 false', () => {
      useConversationStore.getState().setStreamingState({
        conversationId: 'conv-1',
        partialResponse: 'hello',
        isStreaming: true,
      })

      pauseStreamingUI()

      const { streamingState } = useConversationStore.getState()
      expect(streamingState!.isStreaming).toBe(false)
      // 部分响应内容不应丢失
      expect(streamingState!.partialResponse).toBe('hello')
    })

    it('resumeStreamingUI 应将 isStreaming 设为 true', () => {
      useConversationStore.getState().setStreamingState({
        conversationId: 'conv-1',
        partialResponse: 'world',
        isStreaming: false,
      })

      resumeStreamingUI()

      const { streamingState } = useConversationStore.getState()
      expect(streamingState!.isStreaming).toBe(true)
    })

    it('无流式状态时 pauseStreamingUI 不应报错', () => {
      expect(() => pauseStreamingUI()).not.toThrow()
    })

    it('无流式状态时 resumeStreamingUI 不应报错', () => {
      expect(() => resumeStreamingUI()).not.toThrow()
    })
  })
})
