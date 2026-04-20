import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'

import { useConversationStore } from '@renderer/stores/conversation-store'

import type { ChatMessage, MessageRole, Conversation } from '@renderer/stores/conversation-store'

/**
 * 重置 ConversationStore 到初始状态
 * 在每次 fast-check 迭代前调用，防止状态泄漏
 */
function resetStore(): void {
  useConversationStore.setState({
    conversations: {},
    activeConversationId: { vibe: null, spec: null },
    streamingState: null,
  })
}

/**
 * 消息角色生成器
 */
const roleArb: fc.Arbitrary<MessageRole> = fc.constantFrom('user', 'assistant', 'system')

/**
 * 单条消息生成器
 */
const messageArb: fc.Arbitrary<ChatMessage> = fc.record({
  id: fc.uuid(),
  role: roleArb,
  content: fc.string(),
  timestamp: fc.nat(),
})

/**
 * Property 4: 多轮对话历史保留不变量
 * 验证: 需求 2.4
 *
 * 对任意消息序列，追加新消息后历史消息应保持原有顺序和内容不变，
 * 长度增加 1。
 */
describe('Property 4: 多轮对话历史保留不变量', () => {
  beforeEach(() => {
    resetStore()
  })

  it('追加新消息后，历史消息应保持原有顺序和内容不变，长度增加 1', () => {
    /**
     * Validates: Requirements 2.4
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ role: roleArb, content: fc.string() }),
          { maxLength: 20 },
        ),
        messageArb,
        (existingMessages, newMessage) => {
          resetStore()

          // 构造带有 N 条历史消息的对话
          const messages: ChatMessage[] = existingMessages.map((m, i) => ({
            id: `msg-${i}`,
            role: m.role,
            content: m.content,
            timestamp: i,
          }))

          const conv: Conversation = {
            id: 'conv-test',
            mode: 'vibe',
            messages,
            createdAt: 0,
            modelId: 'test-model',
          }

          useConversationStore.getState().addConversation(conv)

          // 深拷贝历史消息快照，用于后续比较
          const historySnapshot = messages.map((m) => ({ ...m }))
          const originalLength = messages.length

          // 追加新消息
          useConversationStore.getState().addMessage('conv-test', newMessage)

          const updatedConv = useConversationStore.getState().conversations['conv-test']

          // 验证长度增加 1
          expect(updatedConv.messages).toHaveLength(originalLength + 1)

          // 验证历史消息顺序和内容不变
          for (let i = 0; i < originalLength; i++) {
            expect(updatedConv.messages[i].id).toBe(historySnapshot[i].id)
            expect(updatedConv.messages[i].role).toBe(historySnapshot[i].role)
            expect(updatedConv.messages[i].content).toBe(historySnapshot[i].content)
            expect(updatedConv.messages[i].timestamp).toBe(historySnapshot[i].timestamp)
          }

          // 验证最后一条消息是新追加的
          expect(updatedConv.messages[originalLength]).toEqual(newMessage)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('连续追加多条消息后，所有历史消息应保持原有顺序不变', () => {
    /**
     * Validates: Requirements 2.4
     */
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ role: roleArb, content: fc.string() }),
          { maxLength: 10 },
        ),
        fc.array(messageArb, { minLength: 1, maxLength: 5 }),
        (existingMessages, newMessages) => {
          resetStore()

          // 构造初始对话
          const messages: ChatMessage[] = existingMessages.map((m, i) => ({
            id: `msg-${i}`,
            role: m.role,
            content: m.content,
            timestamp: i,
          }))

          const conv: Conversation = {
            id: 'conv-test',
            mode: 'vibe',
            messages,
            createdAt: 0,
            modelId: 'test-model',
          }

          useConversationStore.getState().addConversation(conv)

          const historySnapshot = messages.map((m) => ({ ...m }))
          const originalLength = messages.length

          // 逐条追加新消息
          for (const msg of newMessages) {
            useConversationStore.getState().addMessage('conv-test', msg)
          }

          const updatedConv = useConversationStore.getState().conversations['conv-test']

          // 验证总长度 = 原始长度 + 新消息数
          expect(updatedConv.messages).toHaveLength(originalLength + newMessages.length)

          // 验证原始历史消息保持不变
          for (let i = 0; i < originalLength; i++) {
            expect(updatedConv.messages[i].id).toBe(historySnapshot[i].id)
            expect(updatedConv.messages[i].role).toBe(historySnapshot[i].role)
            expect(updatedConv.messages[i].content).toBe(historySnapshot[i].content)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
