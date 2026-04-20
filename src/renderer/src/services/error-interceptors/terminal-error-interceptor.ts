/**
 * Terminal 错误拦截器
 * 负责解析终端输出中的错误信息，提取结构化的错误类型、消息、堆栈和源文件位置。
 *
 * 支持的错误模式：
 * - Node.js 运行时错误（Error、TypeError、ReferenceError、SyntaxError 等）
 * - Vite/Webpack 编译错误
 * - npm 包管理器错误
 * - 通用 stderr 错误
 */
import {
  ErrorType,
  generateErrorId,
  calculateErrorFingerprint,
} from './types'

import type {
  CapturedError,
  ErrorContext,
  ErrorCallback,
} from './types'

/**
 * 错误模式正则表达式列表
 * 按优先级排序，匹配到第一个即停止
 */
export const ERROR_PATTERNS: RegExp[] = [
  // Node.js 运行时错误（Error、TypeError、ReferenceError、SyntaxError 等）
  /^(?:Error|TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError):\s+(.+)/m,
  // Vite 编译错误
  /\[vite\]\s+(.+Error.+)/m,
  // Webpack 编译错误
  /ERROR\s+in\s+(.+)/m,
  // npm 错误
  /npm\s+ERR!\s+(.+)/m,
  // 通用 stderr 错误（error: 或 error[xxx]: 开头）
  /^error(?:\[.+\])?:\s+(.+)/im,
]

/**
 * 从错误位置向下提取完整堆栈
 * 堆栈行通常以 "at " 开头或包含行号指示符（如 "  42 |"）
 */
export function extractFullStack(output: string, errorIndex: number): string {
  const lines = output.substring(errorIndex).split('\n')
  const stackLines: string[] = [lines[0]]

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // 匹配堆栈行：以空白 + "at " 开头，或以空白 + 数字 + "|" 开头（代码行号指示）
    if (/^\s+at\s+/.test(line) || /^\s+\d+\s*\|/.test(line)) {
      stackLines.push(line)
    } else if (stackLines.length > 1) {
      // 已经收集了堆栈行，遇到非堆栈行则结束
      break
    }
  }

  return stackLines.join('\n')
}

/**
 * 从堆栈字符串中提取源文件路径和行号
 * 匹配常见的文件路径格式：
 * - /path/to/file.tsx:42:10
 * - ./src/App.tsx:15:3
 * - at Component (./src/App.tsx:15:3)
 */
export function extractSourceLocation(
  stack: string,
): { file: string; line: number } | null {
  // 匹配 /path/to/file.ext:line 或 ./path/to/file.ext:line 格式
  const match = stack.match(/(?:\/|\.\/)([\w\-./]+\.\w+):(\d+)/)
  if (match) {
    return { file: match[1], line: parseInt(match[2], 10) }
  }
  return null
}

/**
 * 解析终端输出，提取结构化错误信息
 * 遍历所有错误模式正则，匹配到第一个即提取完整堆栈和源文件位置
 *
 * @param output - 终端输出字符串
 * @returns 结构化错误信息，无匹配时返回 null
 */
export function parseTerminalOutput(output: string): CapturedError | null {
  for (const pattern of ERROR_PATTERNS) {
    const match = output.match(pattern)
    if (match) {
      // 提取完整的错误堆栈
      const stack = extractFullStack(output, match.index!)
      // 提取源文件和行号
      const location = extractSourceLocation(stack)

      return {
        id: generateErrorId(),
        type: ErrorType.TERMINAL_ERROR,
        message: match[1],
        stack,
        sourceFile: location?.file,
        sourceLine: location?.line,
        timestamp: Date.now(),
        fingerprint: calculateErrorFingerprint(
          ErrorType.TERMINAL_ERROR,
          match[1],
          location?.file,
        ),
        context: createEmptyContext(),
        raw: output,
      }
    }
  }
  return null
}

/**
 * 创建空的错误上下文（由 ErrorContextEnhancer 后续填充）
 */
function createEmptyContext(): ErrorContext {
  return {
    relatedFiles: [],
    recentActions: [],
    recentAiChanges: [],
    currentMode: 'vibe',
  }
}

/**
 * Terminal 错误拦截器
 * 监听终端输出流，自动解析并提取结构化错误信息
 */
export class TerminalErrorInterceptor {
  /** 错误回调列表 */
  private errorCallbacks: ErrorCallback[] = []

  /** 是否已销毁 */
  private isDisposed = false

  /**
   * 注册错误回调
   * 当拦截到错误时会调用所有已注册的回调
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback)
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback)
    }
  }

  /**
   * 处理终端输出
   * 解析输出内容，如果包含错误模式则触发错误回调
   *
   * @param output - 终端输出字符串
   */
  handleOutput(output: string): void {
    if (this.isDisposed) return

    const error = parseTerminalOutput(output)
    if (error) {
      this.emitError(error)
    }
  }

  /**
   * 销毁拦截器，清理所有回调
   */
  dispose(): void {
    this.isDisposed = true
    this.errorCallbacks = []
  }

  /**
   * 触发错误回调
   */
  private emitError(error: CapturedError): void {
    for (const callback of this.errorCallbacks) {
      callback(error)
    }
  }
}
