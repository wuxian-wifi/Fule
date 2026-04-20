/**
 * 预览面板状态管理 Store
 * 管理内嵌预览的 URL、运行状态和错误信息
 */
import { create } from 'zustand'

/** 预览面板捕获的错误信息 */
export interface PreviewError {
  /** 错误唯一标识 */
  id: string
  /** 错误类型（如 TypeError、SyntaxError、CompileError 等） */
  type: string
  /** 错误消息 */
  message: string
  /** 错误堆栈（可选，运行时错误通常包含堆栈） */
  stack?: string
  /** 出错的源文件路径（可选） */
  sourceFile?: string
  /** 出错的行号（可选） */
  lineNumber?: number
  /** 错误捕获时间戳 */
  timestamp: number
}

/** 预览 Store 接口 */
interface PreviewStore {
  /** 当前预览 URL（WebContainers server-ready 后设置） */
  previewUrl: string | null
  /** 预览环境是否正在运行 */
  isRunning: boolean
  /** 预览面板捕获的错误列表 */
  previewErrors: PreviewError[]

  /** 设置预览 URL */
  setPreviewUrl: (url: string | null) => void
  /** 设置运行状态 */
  setIsRunning: (running: boolean) => void
  /** 添加一条预览错误 */
  addPreviewError: (error: Omit<PreviewError, 'id' | 'timestamp'>) => void
  /** 清除所有预览错误 */
  clearPreviewErrors: () => void
}

/** 生成唯一错误 ID */
let errorIdCounter = 0
function generateErrorId(): string {
  return `preview-err-${Date.now()}-${++errorIdCounter}`
}

/**
 * 预览面板状态管理 Store
 * 跟踪 WebContainers/Sandpack 预览环境的 URL、运行状态和错误信息
 */
export const usePreviewStore = create<PreviewStore>((set) => ({
  previewUrl: null,
  isRunning: false,
  previewErrors: [],

  setPreviewUrl: (url) => {
    set({ previewUrl: url })
  },

  setIsRunning: (running) => {
    set({ isRunning: running })
  },

  addPreviewError: (error) => {
    const newError: PreviewError = {
      ...error,
      id: generateErrorId(),
      timestamp: Date.now(),
    }
    set((state) => ({
      previewErrors: [...state.previewErrors, newError],
    }))
  },

  clearPreviewErrors: () => {
    set({ previewErrors: [] })
  },
}))
