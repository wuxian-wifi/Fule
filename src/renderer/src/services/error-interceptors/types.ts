/**
 * 错误拦截器共享类型定义
 * 定义错误捕获层使用的通用类型，供 PreviewErrorInterceptor 和 TerminalErrorInterceptor 共享
 */

/** 捕获的错误类型枚举 */
export enum ErrorType {
  /** JS 运行时异常（如 TypeError、ReferenceError） */
  RUNTIME_EXCEPTION = 'runtime_exception',
  /** 白屏检测（iframe 内容为空或不可见） */
  WHITE_SCREEN = 'white_screen',
  /** 编译错误（Vite/Webpack 输出） */
  COMPILE_ERROR = 'compile_error',
  /** 终端命令执行错误（stderr 解析） */
  TERMINAL_ERROR = 'terminal_error',
  /** 网络请求错误 */
  NETWORK_ERROR = 'network_error',
}

/** 错误上下文信息，帮助 AI 理解问题 */
export interface ErrorContext {
  /** 出错时的相关文件内容 */
  relatedFiles: Array<{ path: string; content: string }>
  /** 最近的用户操作（用于 AI 理解上下文） */
  recentActions: string[]
  /** 最近的 AI 修改（可能是 AI 引入的 bug） */
  recentAiChanges: Array<{ file: string; diff: string }>
  /** 当前模式 */
  currentMode: 'vibe' | 'spec'
  /** 依赖信息 */
  packageJson?: Record<string, unknown>
}

/** 捕获的结构化错误信息 */
export interface CapturedError {
  /** 错误唯一标识 */
  id: string
  /** 错误类型 */
  type: ErrorType
  /** 错误消息 */
  message: string
  /** 错误堆栈 */
  stack?: string
  /** 出错的源文件路径 */
  sourceFile?: string
  /** 出错的行号 */
  sourceLine?: number
  /** 错误捕获时间戳 */
  timestamp: number
  /** 错误指纹（用于去重） */
  fingerprint: string
  /** 增强的上下文信息 */
  context: ErrorContext
  /** 原始错误对象 */
  raw: unknown
}

/** 错误回调函数类型 */
export type ErrorCallback = (error: CapturedError) => void

/** 生成唯一错误 ID */
let errorIdCounter = 0
export function generateErrorId(): string {
  return `err-${Date.now()}-${++errorIdCounter}`
}

/**
 * 计算错误指纹
 * 基于错误类型 + 错误消息 + 源文件路径生成指纹，忽略行号
 */
export function calculateErrorFingerprint(
  type: string,
  message: string,
  sourceFile?: string,
): string {
  const key = `${type}:${message}:${sourceFile ?? 'unknown'}`
  // 简单哈希：将字符串转为数字哈希（非加密用途，仅用于去重）
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `fp-${Math.abs(hash).toString(36)}`
}
