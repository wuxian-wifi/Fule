/**
 * 对话状态管理 Store
 * 管理 AI 对话池、模式活跃对话指针和流式响应状态，
 * 使用 IndexedDB 持久化对话历史
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { indexedDBStorage } from '@renderer/utils/indexed-db-storage'

import type { AppMode } from './app-mode-store'

/** 对话消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system'

/** 单条对话消息 */
export interface ChatMessage {
  /** 消息唯一标识 */
  id: string
  /** 消息角色 */
  role: MessageRole
  /** 消息内容 */
  content: string
  /** 消息创建时间戳 */
  timestamp: number
}

/** 单个对话 */
export interface Conversation {
  /** 对话唯一标识 */
  id: string
  /** 创建时的模式 */
  mode: AppMode
  /** 消息列表 */
  messages: ChatMessage[]
  /** 创建时间戳 */
  createdAt: number
  /** 使用的 AI 模型标识 */
  modelId: string
}

/** 流式响应状态 */
export interface StreamingState {
  /** 关联的对话 ID */
  conversationId: string
  /** 已接收的部分响应文本 */
  partialResponse: string
  /** 是否正在流式传输 */
  isStreaming: boolean
}

/** 对话 Store 的持久化数据（不含 streamingState） */
interface ConversationPersistState {
  /** 对话池：id -> Conversation */
  conversations: Record<string, Conversation>
  /** 每个模式的活跃对话 ID */
  activeConversationId: Record<AppMode, string | null>
}

/** 对话 Store 完整接口 */
interface ConversationStore extends ConversationPersistState {
  /** 流式响应状态（不持久化） */
  streamingState: StreamingState | null

  /** 添加新对话 */
  addConversation: (conversation: Conversation) => void
  /** 删除对话 */
  removeConversation: (conversationId: string) => void
  /** 向指定对话追加消息 */
  addMessage: (conversationId: string, message: ChatMessage) => void
  /** 设置指定模式的活跃对话 */
  setActiveConversation: (mode: AppMode, conversationId: string | null) => void
  /** 设置流式响应状态 */
  setStreamingState: (state: StreamingState | null) => void
  /** 更新流式响应的部分文本 */
  updatePartialResponse: (text: string) => void
}

/**
 * 对话状态管理 Store
 * 两个模式共享同一对话池，各自维护活跃对话指针
 * 对话历史通过 IndexedDB 持久化
 */
export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
      conversations: {},
      activeConversationId: { vibe: null, spec: null },
      streamingState: null,

      addConversation: (conversation) => {
        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversation.id]: conversation,
          },
        }))
      },

      removeConversation: (conversationId) => {
        set((state) => {
          const { [conversationId]: _, ...rest } = state.conversations
          return { conversations: rest }
        })
      },

      addMessage: (conversationId, message) => {
        const conversation = get().conversations[conversationId]
        if (!conversation) return

        set((state) => ({
          conversations: {
            ...state.conversations,
            [conversationId]: {
              ...conversation,
              messages: [...conversation.messages, message],
            },
          },
        }))
      },

      setActiveConversation: (mode, conversationId) => {
        set((state) => ({
          activeConversationId: {
            ...state.activeConversationId,
            [mode]: conversationId,
          },
        }))
      },

      setStreamingState: (streamingState) => {
        set({ streamingState })
      },

      updatePartialResponse: (text) => {
        const current = get().streamingState
        if (!current) return
        set({
          streamingState: { ...current, partialResponse: text },
        })
      },
    }),
    {
      name: 'fule-conversation-store',
      storage: createJSONStorage(() => indexedDBStorage),
      // 流式状态不持久化，每次启动时重置
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
      }),
    },
  ),
)
