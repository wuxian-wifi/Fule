import { describe, it, expect, beforeEach } from 'vitest'
import { useConversationStore } from '@renderer/stores/conversation-store'

import type { Conversation, ChatMessage } from '@renderer/stores/conversation-store'

/** 创建测试用对话 */
function createTestConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: overrides.id ?? 'conv-1',
    mode: overrides.mode ?? 'vibe',
    messages: overrides.messages ?? [],
    createdAt: overrides.createdAt ?? Date.now(),
    modelId: overrides.modelId ?? 'gpt-4',
  }
}

/** 创建测试用消息 */
function createTestMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? 'msg-1',
    role: overrides.role ?? 'user',
    content: overrides.content ?? '你好',
    timestamp: overrides.timestamp ?? Date.now(),
  }
}

describe('ConversationStore - 对话状态管理', () => {
  beforeEach(() => {
    // 每个测试前重置 store（跳过 persist 中间件的 rehydrate）
    useConversationStore.setState({
      conversations: {},
      activeConversationId: { vibe: null, spec: null },
      streamingState: null,
    })
  })

  describe('addConversation - 添加对话', () => {
    it('应能添加新对话到对话池', () => {
      const conv = createTestConversation()
      useConversationStore.getState().addConversation(conv)

      const state = useConversationStore.getState()
      expect(state.conversations['conv-1']).toBeDefined()
      expect(state.conversations['conv-1'].mode).toBe('vibe')
    })

    it('应能添加多个不同对话', () => {
      const store = useConversationStore.getState()
      store.addConversation(createTestConversation({ id: 'conv-1' }))
      store.addConversation(createTestConversation({ id: 'conv-2', mode: 'spec' }))

      const state = useConversationStore.getState()
      expect(Object.keys(state.conversations)).toHaveLength(2)
    })
  })

  describe('removeConversation - 删除对话', () => {
    it('应能删除指定对话', () => {
      const store = useConversationStore.getState()
      store.addConversation(createTestConversation({ id: 'conv-1' }))
      store.addConversation(createTestConversation({ id: 'conv-2' }))

      useConversationStore.getState().removeConversation('conv-1')

      const state = useConversationStore.getState()
      expect(state.conversations['conv-1']).toBeUndefined()
      expect(state.conversations['conv-2']).toBeDefined()
    })
  })

  describe('addMessage - 追加消息', () => {
    it('应能向对话追加消息', () => {
      const store = useConversationStore.getState()
      store.addConversation(createTestConversation({ id: 'conv-1' }))

      const msg = createTestMessage({ id: 'msg-1', content: '你好' })
      useConversationStore.getState().addMessage('conv-1', msg)

      const conv = useConversationStore.getState().conversations['conv-1']
      expect(conv.messages).toHaveLength(1)
      expect(conv.messages[0].content).toBe('你好')
    })

    it('追加消息后历史消息应保持不变', () => {
      const store = useConversationStore.getState()
      const existingMsg = createTestMessage({ id: 'msg-0', content: '第一条' })
      store.addConversation(createTestConversation({
        id: 'conv-1',
        messages: [existingMsg],
      }))

      const newMsg = createTestMessage({ id: 'msg-1', content: '第二条' })
      useConversationStore.getState().addMessage('conv-1', newMsg)

      const conv = useConversationStore.getState().conversations['conv-1']
      expect(conv.messages).toHaveLength(2)
      expect(conv.messages[0].content).toBe('第一条')
      expect(conv.messages[1].content).toBe('第二条')
    })

    it('向不存在的对话追加消息不应产生副作用', () => {
      const msg = createTestMessage()
      useConversationStore.getState().addMessage('nonexistent', msg)

      const state = useConversationStore.getState()
      expect(Object.keys(state.conversations)).toHaveLength(0)
    })
  })

  describe('setActiveConversation - 切换活跃对话', () => {
    it('应能设置 vibe 模式的活跃对话', () => {
      useConversationStore.getState().setActiveConversation('vibe', 'conv-1')

      const state = useConversationStore.getState()
      expect(state.activeConversationId.vibe).toBe('conv-1')
      // spec 模式不受影响
      expect(state.activeConversationId.spec).toBeNull()
    })

    it('应能设置 spec 模式的活跃对话', () => {
      useConversationStore.getState().setActiveConversation('spec', 'conv-2')

      const state = useConversationStore.getState()
      expect(state.activeConversationId.spec).toBe('conv-2')
      expect(state.activeConversationId.vibe).toBeNull()
    })

    it('两个模式的活跃对话应独立管理', () => {
      const store = useConversationStore.getState()
      store.setActiveConversation('vibe', 'conv-1')
      store.setActiveConversation('spec', 'conv-2')

      const state = useConversationStore.getState()
      expect(state.activeConversationId.vibe).toBe('conv-1')
      expect(state.activeConversationId.spec).toBe('conv-2')
    })

    it('应能将活跃对话设为 null', () => {
      const store = useConversationStore.getState()
      store.setActiveConversation('vibe', 'conv-1')
      store.setActiveConversation('vibe', null)

      expect(useConversationStore.getState().activeConversationId.vibe).toBeNull()
    })
  })

  describe('streamingState - 流式响应状态', () => {
    it('默认流式状态应为 null', () => {
      expect(useConversationStore.getState().streamingState).toBeNull()
    })

    it('应能设置流式响应状态', () => {
      useConversationStore.getState().setStreamingState({
        conversationId: 'conv-1',
        partialResponse: '正在生成...',
        isStreaming: true,
      })

      const state = useConversationStore.getState()
      expect(state.streamingState?.isStreaming).toBe(true)
      expect(state.streamingState?.conversationId).toBe('conv-1')
    })

    it('应能更新部分响应文本', () => {
      const store = useConversationStore.getState()
      store.setStreamingState({
        conversationId: 'conv-1',
        partialResponse: '',
        isStreaming: true,
      })

      useConversationStore.getState().updatePartialResponse('新的部分响应')

      expect(useConversationStore.getState().streamingState?.partialResponse).toBe('新的部分响应')
    })

    it('无流式状态时更新部分响应不应产生副作用', () => {
      useConversationStore.getState().updatePartialResponse('test')
      expect(useConversationStore.getState().streamingState).toBeNull()
    })
  })
})
