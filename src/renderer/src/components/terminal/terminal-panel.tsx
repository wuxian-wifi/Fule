/**
 * 终端面板组件
 * 集成 xterm.js 展示终端输出，支持多会话标签页切换与管理
 */
import React, { useCallback, useEffect, useMemo } from 'react'

import { useTerminalStore } from '@renderer/stores/terminal-store'
import { useTerminal } from '@renderer/hooks/use-terminal'

import '@xterm/xterm/css/xterm.css'

import type { TerminalSession } from '@renderer/stores/terminal-store'

/** 终端标签页 props */
interface TerminalTabProps {
  /** 终端会话数据 */
  session: TerminalSession
  /** 是否为当前激活标签页 */
  isActive: boolean
  /** 点击标签页回调 */
  onClick: (sessionId: string) => void
  /** 关闭标签页回调 */
  onClose: (sessionId: string) => void
}

/** 单个终端标签页，展示会话命令名和运行状态 */
const TerminalTab = React.memo(function TerminalTab({
  session,
  isActive,
  onClick,
  onClose,
}: TerminalTabProps): React.JSX.Element {
  const handleClick = useCallback(() => {
    onClick(session.id)
  }, [onClick, session.id])

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      // 阻止冒泡，避免触发标签页切换
      e.stopPropagation()
      onClose(session.id)
    },
    [onClose, session.id],
  )

  /** 截取命令名用于标签页显示 */
  const displayName = useMemo(() => {
    const cmd = session.command || '终端'
    // 只取命令的前 20 个字符
    return cmd.length > 20 ? cmd.slice(0, 20) + '…' : cmd
  }, [session.command])

  return (
    <div
      role="tab"
      aria-selected={isActive}
      className={`group flex cursor-pointer items-center gap-1.5 border-r border-gray-700 px-3 py-1 text-xs ${
        isActive
          ? 'bg-gray-800 text-white'
          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={handleClick}
    >
      {/* 运行状态指示器 */}
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          session.isRunning ? 'bg-green-400' : 'bg-gray-500'
        }`}
      />
      <span className="max-w-[120px] truncate">{displayName}</span>
      <button
        className="ml-1 shrink-0 rounded p-0.5 text-gray-500 opacity-0 hover:bg-gray-600 hover:text-white group-hover:opacity-100"
        onClick={handleClose}
        aria-label={`关闭终端 ${displayName}`}
      >
        ×
      </button>
    </div>
  )
})

/** 终端视图内容区域，承载 xterm.js 实例 */
const TerminalContent = React.memo(function TerminalContent({
  sessionId,
}: {
  sessionId: string | null
}): React.JSX.Element {
  const { terminalRef, fitTerminal } = useTerminal(sessionId)

  // 当容器可见性或尺寸变化时重新 fit
  useEffect(() => {
    if (!sessionId) return
    // 延迟 fit 以确保 DOM 已完成布局
    const timer = setTimeout(() => {
      fitTerminal()
    }, 50)
    return () => clearTimeout(timer)
  }, [sessionId, fitTerminal])

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        暂无终端会话，点击 + 创建新终端
      </div>
    )
  }

  return <div ref={terminalRef} className="h-full w-full" />
})

/** 生成唯一终端会话 ID */
let sessionCounter = 0
function generateSessionId(): string {
  return `term_${Date.now()}_${++sessionCounter}`
}

/**
 * 终端面板主组件
 * 顶部标签栏管理多个终端会话，底部区域渲染 xterm.js 终端
 */
function TerminalPanel(): React.JSX.Element {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeSessionId = useTerminalStore((s) => s.activeSessionId)
  const addSession = useTerminalStore((s) => s.addSession)
  const removeSession = useTerminalStore((s) => s.removeSession)
  const setActiveSession = useTerminalStore((s) => s.setActiveSession)

  /** 会话列表，按创建顺序排列 */
  const sessionList = useMemo(() => Object.values(sessions), [sessions])

  const handleTabClick = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId)
    },
    [setActiveSession],
  )

  const handleTabClose = useCallback(
    (sessionId: string) => {
      // 先终止 PTY 进程，再移除会话
      window.fuleAPI.pty.kill(sessionId)
      removeSession(sessionId)
    },
    [removeSession],
  )

  const handleAddSession = useCallback(() => {
    const id = generateSessionId()
    addSession(id, 'shell')
  }, [addSession])

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* 终端标签栏 */}
      <div className="flex h-8 shrink-0 items-center border-b border-gray-700 bg-gray-900">
        <div role="tablist" className="flex flex-1 overflow-x-auto">
          {sessionList.map((session) => (
            <TerminalTab
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={handleTabClick}
              onClose={handleTabClose}
            />
          ))}
        </div>
        {/* 新建终端按钮 */}
        <button
          className="flex h-full shrink-0 items-center px-2 text-gray-400 hover:bg-gray-800 hover:text-white"
          onClick={handleAddSession}
          aria-label="新建终端会话"
        >
          <span className="text-sm">+</span>
        </button>
      </div>

      {/* 终端内容区域 */}
      <div className="min-h-0 flex-1">
        <TerminalContent sessionId={activeSessionId} />
      </div>
    </div>
  )
}

export default TerminalPanel
