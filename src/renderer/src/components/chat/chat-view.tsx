import { useState, useCallback, useRef, useEffect, memo } from 'react'

import { useConversationStore } from '@renderer/stores/conversation-store'
import { useAppModeStore } from '@renderer/stores/app-mode-store'
import DiffActionBar from '@renderer/components/chat/diff-action-bar'

import type { ChatMessage, Conversation } from '@renderer/stores/conversation-store'
import type { AppMode } from '@renderer/stores/app-mode-store'

/** 生成唯一消息 ID */
function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** 生成唯一对话 ID */
function generateConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 确保当前模式存在活跃对话，不存在则自动创建
 * 返回活跃对话 ID
 */
function ensureActiveConversation(mode: AppMode): string {
  const store = useConversationStore.getState()
  const activeId = store.activeConversationId[mode]

  if (activeId && store.conversations[activeId]) {
    return activeId
  }

  // 自动创建新对话
  const newId = generateConversationId()
  const conversation: Conversation = {
    id: newId,
    mode,
    messages: [],
    createdAt: Date.now(),
    modelId: 'default',
  }
  store.addConversation(conversation)
  store.setActiveConversation(mode, newId)
  return newId
}

/** 单条消息气泡组件 props */
interface MessageBubbleProps {
  /** 消息数据 */
  message: ChatMessage
}

/**
 * 单条消息气泡，根据角色区分样式
 */
const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps): React.JSX.Element {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* 角色图标 */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          isUser ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
        }`}
      >
        {isUser ? '你' : 'AI'}
      </div>

      {/* 消息内容 */}
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-100'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>
    </div>
  )
})

/**
 * 流式响应指示器，显示 AI 正在生成的部分文本和闪烁光标
 */
const StreamingIndicator = memo(function StreamingIndicator({
  partialResponse,
}: {
  partialResponse: string
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
        AI
      </div>
      <div className="max-w-[80%] rounded-lg bg-gray-700 px-3 py-2 text-sm leading-relaxed text-gray-100">
        {partialResponse ? (
          <p className="whitespace-pre-wrap break-words">
            {partialResponse}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-purple-400" />
          </p>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '0ms' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * AI 对话视图组件，包含消息列表和输入框
 * 支持多轮对话、流式响应渲染、自动滚动
 */
function ChatView(): React.JSX.Element {
  const currentMode = useAppModeStore((s) => s.currentMode)
  const conversations = useConversationStore((s) => s.conversations)
  const activeConversationId = useConversationStore((s) => s.activeConversationId[currentMode])
  const streamingState = useConversationStore((s) => s.streamingState)
  const addMessage = useConversationStore((s) => s.addMessage)

  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 当前活跃对话的消息列表
  const messages: ChatMessage[] =
    activeConversationId && conversations[activeConversationId]
      ? conversations[activeConversationId].messages
      : []

  // 判断当前对话是否正在流式传输
  const isStreaming =
    streamingState?.isStreaming === true &&
    streamingState.conversationId === activeConversationId

  // 新消息到达时自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, streamingState?.partialResponse])

  /** 发送用户消息 */
  const handleSend = useCallback(() => {
    const text = inputText.trim()
    if (!text || isStreaming) return

    const conversationId = ensureActiveConversation(currentMode)

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    addMessage(conversationId, userMessage)
    setInputText('')

    // 重置输入框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [inputText, isStreaming, currentMode, addMessage])

  /** 键盘事件：Enter 发送，Shift+Enter 换行 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  /** 输入框自适应高度 */
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    // 自动调整高度，最大 5 行
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 面板标题 */}
      <div className="shrink-0 border-b border-gray-700 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        AI 对话
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            输入消息开始对话
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* 流式响应渲染 */}
            {isStreaming && (
              <StreamingIndicator
                partialResponse={streamingState?.partialResponse ?? ''}
              />
            )}

            {/* 滚动锚点 */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Diff 操作栏（AI 生成代码变更时显示，后续阶段接入） */}
      <DiffActionBar />

      {/* 输入区域 */}
      <div className="shrink-0 border-t border-gray-700 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="发送消息"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatView
