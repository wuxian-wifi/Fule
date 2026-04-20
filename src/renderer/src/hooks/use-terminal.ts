/**
 * xterm.js 终端实例生命周期管理 Hook
 * 负责创建/销毁 Terminal 实例、连接 PTY 进程、处理终端尺寸自适应
 */
import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'

import { usePreviewStore } from '@renderer/stores/preview-store'

/** xterm.js 暗色主题配置，与 IDE 整体风格一致 */
const DARK_THEME = {
  background: '#030712', // bg-gray-950
  foreground: '#d1d5db', // text-gray-300
  cursor: '#9ca3af',
  selectionBackground: '#374151',
  black: '#1f2937',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#d1d5db',
  brightBlack: '#4b5563',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f3f4f6',
} as const

/** Hook 返回值接口 */
interface UseTerminalReturn {
  /** 终端容器 DOM 引用，绑定到承载 xterm 的 div */
  terminalRef: React.RefObject<HTMLDivElement>
  /** 手动触发终端尺寸自适应 */
  fitTerminal: () => void
}

/**
 * 管理 xterm.js Terminal 实例的生命周期
 * 当 sessionId 变化时重新挂载终端，自动连接 PTY 进程
 */
export function useTerminal(sessionId: string | null): UseTerminalReturn {
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current) {
      try {
        fitAddonRef.current.fit()
      } catch {
        // 容器尚未挂载或尺寸为零时忽略
      }
    }
  }, [])

  // 创建/销毁 xterm 实例，连接 PTY 进程
  useEffect(() => {
    if (!sessionId || !terminalRef.current) return

    const terminal = new Terminal({
      theme: DARK_THEME,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      disableStdin: false, // 启用输入，连接到真实 Shell 进程
      convertEol: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalRef.current)

    xtermRef.current = terminal
    fitAddonRef.current = fitAddon

    // 首次挂载后自适应尺寸
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // 忽略
      }

      // 尺寸就绪后创建 PTY 进程
      const cols = terminal.cols
      const rows = terminal.rows
      window.fuleAPI.pty.create({ sessionId, cols, rows })
    })

    // 将用户键盘输入转发到 PTY 进程
    const inputDisposable = terminal.onData((data: string) => {
      window.fuleAPI.pty.write({ sessionId, data })
    })

    // 订阅 PTY 输出数据，写入 xterm 显示，同时检测 dev server URL
    const unsubscribePtyData = window.fuleAPI.pty.onData((event) => {
      if (event.sessionId === sessionId && xtermRef.current) {
        xtermRef.current.write(event.data)

        // 检测终端输出中的 dev server URL（如 http://localhost:3000）
        const urlMatch = event.data.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/)
        if (urlMatch) {
          const detectedUrl = urlMatch[0].replace('0.0.0.0', 'localhost')
          const previewStore = usePreviewStore.getState()
          // 仅在当前没有预览 URL 或 URL 不同时更新
          if (previewStore.previewUrl !== detectedUrl) {
            previewStore.setPreviewUrl(detectedUrl)
            previewStore.setIsRunning(true)
          }
        }
      }
    })

    return () => {
      inputDisposable.dispose()
      unsubscribePtyData()
      terminal.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  // 监听窗口 resize 事件，自动调整终端尺寸并同步到 PTY
  useEffect(() => {
    if (!sessionId) return

    const handleResize = (): void => {
      fitTerminal()
      // fit 后将新尺寸同步到 PTY 进程
      if (xtermRef.current) {
        const cols = xtermRef.current.cols
        const rows = xtermRef.current.rows
        window.fuleAPI.pty.resize({ sessionId, cols, rows })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [sessionId, fitTerminal])

  return { terminalRef, fitTerminal }
}
