/**
 * Preview 错误拦截器
 * 负责从内嵌预览面板（iframe）捕获运行时异常、白屏状态和编译错误，
 * 并将其转换为结构化的 CapturedError 对象。
 *
 * 三种错误捕获通道：
 * 1. postMessage — iframe 注入的错误捕获脚本通过 postMessage 发送运行时异常
 * 2. 白屏检测 — 定期检查 iframe DOM 状态，连续检测到白屏时触发错误
 * 3. 编译错误 — 监听 WebContainers stderr 输出中的编译错误信息
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

/** 白屏检测间隔（毫秒） */
const WHITE_SCREEN_CHECK_INTERVAL = 3000

/** 连续白屏检测阈值，达到此次数触发白屏错误 */
const WHITE_SCREEN_THRESHOLD = 2

/** postMessage 传入的错误数据结构 */
interface PreviewErrorMessage {
  /** 消息类型标识，固定为 'PREVIEW_ERROR' */
  type: 'PREVIEW_ERROR'
  /** 错误详情 */
  error: {
    /** 错误类型 */
    type: string
    /** 错误消息 */
    message: string
    /** 错误堆栈 */
    stack?: string
    /** 出错的源文件路径 */
    sourceFile?: string
    /** 出错的行号 */
    lineNumber?: number
  }
}

/**
 * 校验 postMessage 数据是否为有效的预览错误消息
 */
function isPreviewErrorMessage(data: unknown): data is PreviewErrorMessage {
  if (typeof data !== 'object' || data === null) return false
  const msg = data as Record<string, unknown>
  if (msg.type !== 'PREVIEW_ERROR') return false
  if (typeof msg.error !== 'object' || msg.error === null) return false
  const err = msg.error as Record<string, unknown>
  return typeof err.type === 'string' && typeof err.message === 'string'
}

/**
 * Preview 错误拦截器
 * 通过 postMessage、白屏检测和编译错误监听三种通道捕获预览面板中的错误
 */
export class PreviewErrorInterceptor {
  /** 白屏连续检测计数器 */
  private whiteScreenCounter = 0

  /** 白屏检测定时器 ID */
  private whiteScreenTimerId: ReturnType<typeof setInterval> | null = null

  /** postMessage 事件监听器引用（用于清理） */
  private messageHandler: ((event: MessageEvent) => void) | null = null

  /** 错误回调列表 */
  private errorCallbacks: ErrorCallback[] = []

  /** 关联的 iframe 元素 */
  private iframe: HTMLIFrameElement | null = null

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
   * 启动拦截器，绑定到指定的 iframe 元素
   */
  start(iframe: HTMLIFrameElement): void {
    this.iframe = iframe
    this.setupPostMessageListener()
    this.startWhiteScreenDetection()
  }

  /**
   * 销毁拦截器，清理所有监听器和定时器
   */
  dispose(): void {
    this.isDisposed = true

    // 清理 postMessage 监听器
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler)
      this.messageHandler = null
    }

    // 清理白屏检测定时器
    if (this.whiteScreenTimerId !== null) {
      clearInterval(this.whiteScreenTimerId)
      this.whiteScreenTimerId = null
    }

    this.errorCallbacks = []
    this.iframe = null
  }

  /**
   * 设置 postMessage 监听器
   * 接收 iframe 中注入的错误捕获脚本发送的运行时异常
   */
  private setupPostMessageListener(): void {
    this.messageHandler = (event: MessageEvent): void => {
      if (this.isDisposed) return

      // 仅处理来自预览 iframe 的消息
      if (
        this.iframe &&
        event.source === this.iframe.contentWindow &&
        isPreviewErrorMessage(event.data)
      ) {
        const { type: errorType, message, stack, sourceFile, lineNumber } =
          event.data.error

        const error: CapturedError = {
          id: generateErrorId(),
          type: ErrorType.RUNTIME_EXCEPTION,
          message,
          stack,
          sourceFile,
          sourceLine: lineNumber,
          timestamp: Date.now(),
          fingerprint: calculateErrorFingerprint(errorType, message, sourceFile),
          context: this.createEmptyContext(),
          raw: event.data,
        }

        this.emitError(error)
      }
    }

    window.addEventListener('message', this.messageHandler)
  }

  /**
   * 启动白屏检测
   * 每 3 秒检查 iframe DOM 状态，连续 2 次检测到白屏触发错误
   */
  private startWhiteScreenDetection(): void {
    this.whiteScreenTimerId = setInterval(() => {
      if (this.isDisposed || !this.iframe) return

      try {
        const iframeDoc = this.iframe.contentDocument
        if (!iframeDoc) return

        const body = iframeDoc.body
        if (!body) return

        const isWhiteScreen = this.detectWhiteScreen(body)

        if (isWhiteScreen) {
          this.whiteScreenCounter++
          if (this.whiteScreenCounter >= WHITE_SCREEN_THRESHOLD) {
            this.handleWhiteScreen(iframeDoc)
            // 重置计数器，避免重复触发
            this.whiteScreenCounter = 0
          }
        } else {
          // 非白屏状态，重置计数器
          this.whiteScreenCounter = 0
        }
      } catch {
        // 跨域限制无法访问 iframe 内容，此时依赖 postMessage 通道
      }
    }, WHITE_SCREEN_CHECK_INTERVAL)
  }

  /**
   * 白屏检测算法
   * 检查 iframe body 是否为空或所有子元素不可见
   */
  private detectWhiteScreen(body: HTMLElement): boolean {
    // 排除条件：正在加载中
    if (body.querySelector('[data-loading]')) return false
    if (body.querySelector('.loading, .spinner')) return false

    // 检测条件 1：body 没有子元素
    if (body.children.length === 0) return true

    // 检测条件 2：body 只有空白文本
    if (body.innerText.trim() === '') return true

    // 检测条件 3：所有子元素都不可见
    const visibleElements = Array.from(body.children).filter((el) => {
      const style = window.getComputedStyle(el as HTMLElement)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      )
    })
    if (visibleElements.length === 0) return true

    return false
  }

  /**
   * 处理白屏检测结果，生成白屏错误
   */
  private handleWhiteScreen(doc: Document): void {
    const error: CapturedError = {
      id: generateErrorId(),
      type: ErrorType.WHITE_SCREEN,
      message: '预览面板检测到白屏',
      timestamp: Date.now(),
      fingerprint: calculateErrorFingerprint(
        ErrorType.WHITE_SCREEN,
        '预览面板检测到白屏',
      ),
      context: this.createEmptyContext(),
      raw: { documentTitle: doc.title },
    }

    this.emitError(error)
  }

  /**
   * 处理编译错误（来自 WebContainers stderr）
   * 外部调用此方法将 stderr 输出传入拦截器
   */
  handleCompileError(stderrOutput: string): void {
    if (this.isDisposed) return

    // 检测常见编译错误模式
    const compilePatterns = [
      /\[vite\]\s+(.+Error.+)/m,
      /ERROR\s+in\s+(.+)/m,
      /SyntaxError:\s+(.+)/m,
      /Failed to compile/m,
    ]

    for (const pattern of compilePatterns) {
      const match = stderrOutput.match(pattern)
      if (match) {
        // 尝试提取源文件路径和行号
        const locationMatch = stderrOutput.match(
          /(?:\/|\.\/)([\w\-./]+\.\w+):(\d+)/,
        )

        const error: CapturedError = {
          id: generateErrorId(),
          type: ErrorType.COMPILE_ERROR,
          message: match[1] ?? match[0],
          stack: stderrOutput,
          sourceFile: locationMatch?.[1],
          sourceLine: locationMatch ? parseInt(locationMatch[2], 10) : undefined,
          timestamp: Date.now(),
          fingerprint: calculateErrorFingerprint(
            ErrorType.COMPILE_ERROR,
            match[1] ?? match[0],
            locationMatch?.[1],
          ),
          context: this.createEmptyContext(),
          raw: stderrOutput,
        }

        this.emitError(error)
        return
      }
    }
  }

  /**
   * 创建空的错误上下文（由 ErrorContextEnhancer 后续填充）
   */
  private createEmptyContext(): ErrorContext {
    return {
      relatedFiles: [],
      recentActions: [],
      recentAiChanges: [],
      currentMode: 'vibe',
    }
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
