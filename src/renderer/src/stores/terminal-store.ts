/**
 * 终端状态管理 Store
 * 管理终端会话列表、活跃会话和环形输出缓冲区，
 * 终端进程在模式切换时不中断
 */
import { create } from 'zustand'
import { RingBuffer } from '@renderer/utils/ring-buffer'

/** 终端输出缓冲区默认容量（行数） */
const TERMINAL_BUFFER_CAPACITY = 5000

/** 单个终端会话 */
export interface TerminalSession {
  /** 会话唯一标识 */
  id: string
  /** 进程 PID（未启动时为 null） */
  pid: number | null
  /** 执行的命令 */
  command: string
  /** 环形输出缓冲区 */
  outputBuffer: RingBuffer<string>
  /** 进程是否正在运行 */
  isRunning: boolean
  /** 占用的端口列表 */
  ports: number[]
  /** 进程退出码（运行中为 null） */
  exitCode: number | null
}

/** 终端 Store 接口 */
interface TerminalStore {
  /** 终端会话映射：id -> TerminalSession */
  sessions: Record<string, TerminalSession>
  /** 当前激活的终端会话 ID */
  activeSessionId: string | null

  /** 创建新终端会话 */
  addSession: (id: string, command: string) => void
  /** 移除终端会话 */
  removeSession: (sessionId: string) => void
  /** 设置活跃终端会话 */
  setActiveSession: (sessionId: string | null) => void
  /** 向指定会话的输出缓冲区追加一行 */
  appendOutput: (sessionId: string, line: string) => void
  /** 更新会话的运行状态 */
  updateSessionStatus: (sessionId: string, updates: Partial<Pick<TerminalSession, 'pid' | 'isRunning' | 'exitCode' | 'ports'>>) => void
}

/**
 * 终端状态管理 Store
 * 使用 RingBuffer 限制输出缓冲区内存占用
 */
export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,

  addSession: (id, command) => {
    const session: TerminalSession = {
      id,
      pid: null,
      command,
      outputBuffer: new RingBuffer<string>(TERMINAL_BUFFER_CAPACITY),
      isRunning: false,
      ports: [],
      exitCode: null,
    }
    set((state) => ({
      sessions: { ...state.sessions, [id]: session },
      // 自动激活新创建的会话
      activeSessionId: id,
    }))
  },

  removeSession: (sessionId) => {
    const { sessions, activeSessionId } = get()
    const { [sessionId]: _, ...rest } = sessions
    set({
      sessions: rest,
      // 如果移除的是活跃会话，清空活跃指针
      activeSessionId: activeSessionId === sessionId ? null : activeSessionId,
    })
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  appendOutput: (sessionId, line) => {
    const session = get().sessions[sessionId]
    if (!session) return
    // 直接操作 RingBuffer 实例（引用不变，触发浅更新）
    session.outputBuffer.push(line)
    set((state) => ({
      sessions: { ...state.sessions, [sessionId]: { ...session } },
    }))
  },

  updateSessionStatus: (sessionId, updates) => {
    const session = get().sessions[sessionId]
    if (!session) return
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...session, ...updates },
      },
    }))
  },
}))
