/**
 * 常驻进程管理器
 * 管理 AI 启动的长期运行进程（如 npm run dev），监控 PID 与端口占用，
 * 在端口冲突时自动清理旧进程并释放端口
 */

import type { NormalizedCommand } from './command-normalizer'

/** 受管进程的运行状态 */
type ProcessStatus = 'running' | 'stopping' | 'stopped'

/** 受管进程信息 */
export interface ManagedProcess {
  /** 进程唯一标识 */
  id: string
  /** 操作系统进程 ID */
  pid: number
  /** 启动时的原始命令字符串 */
  command: string
  /** 进程占用的端口列表 */
  ports: number[]
  /** 进程启动时间戳（毫秒） */
  startedAt: number
  /** 进程当前状态 */
  status: ProcessStatus
}

/**
 * 常见开发服务器的默认端口映射
 * 用于在无法从命令参数中解析端口时进行预测
 */
const DEFAULT_DEV_SERVER_PORTS: Record<string, number[]> = {
  vite: [5173],
  next: [3000],
  nuxt: [3000],
  'react-scripts': [3000],
  'webpack-dev-server': [8080],
  'webpack-cli': [8080],
  serve: [3000],
  'live-server': [8080],
  gatsby: [8000],
  astro: [4321],
}

/**
 * 辅助函数：等待指定毫秒数
 *
 * @param ms - 等待时间（毫秒）
 * @returns Promise，在指定时间后 resolve
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 常驻进程管理器
 *
 * 负责管理 AI 启动的长期运行进程的生命周期，包括：
 * - 进程注册与端口映射
 * - 端口冲突检测与自动清理
 * - 优雅终止进程（SIGTERM → 超时 → SIGKILL）
 * - 通过 IPC 通道暴露管理接口
 */
export class ProcessManager {
  /** 进程注册表：processId → ManagedProcess */
  private processes = new Map<string, ManagedProcess>()
  /** 端口映射表：port → processId，用于快速查找端口占用 */
  private portMap = new Map<number, string>()

  /**
   * 注册一个新的受管进程
   *
   * @param id - 进程唯一标识
   * @param pid - 操作系统进程 ID
   * @param command - 启动时的原始命令字符串
   * @param ports - 进程占用的端口列表
   */
  registerProcess(id: string, pid: number, command: string, ports: number[]): void {
    const managed: ManagedProcess = {
      id,
      pid,
      command,
      ports,
      startedAt: Date.now(),
      status: 'running',
    }

    this.processes.set(id, managed)

    // 建立端口 → 进程 ID 的反向映射
    for (const port of ports) {
      this.portMap.set(port, id)
    }
  }

  /**
   * 启动命令前检查端口冲突并自动清理旧进程
   *
   * 流程：
   * 1. 通过 predictPorts 预测新命令可能使用的端口
   * 2. 检查这些端口是否已被已注册的运行中进程占用
   * 3. 如果存在冲突，优雅终止旧进程并释放端口
   *
   * @param cmd - 规范化后的命令对象
   */
  async prepareExecution(cmd: NormalizedCommand): Promise<void> {
    // 识别命令可能使用的端口
    const expectedPorts = this.predictPorts(cmd)

    // 检查端口冲突并清理
    for (const port of expectedPorts) {
      const existingProcessId = this.portMap.get(port)
      if (existingProcessId) {
        const existing = this.processes.get(existingProcessId)
        if (existing && existing.status === 'running') {
          // 自动清理旧进程
          await this.gracefulKill(existingProcessId)
        }
      }
    }
  }

  /**
   * 优雅终止进程：先发送 SIGTERM，等待 5 秒后若未退出则发送 SIGKILL
   *
   * @param processId - 要终止的进程唯一标识
   */
  async gracefulKill(processId: string): Promise<void> {
    const proc = this.processes.get(processId)
    if (!proc || proc.status !== 'running') return

    proc.status = 'stopping'

    try {
      // 发送 SIGTERM 请求进程优雅退出
      process.kill(proc.pid, 'SIGTERM')
    } catch {
      // 进程可能已经退出，直接标记为 stopped
      this.releaseProcess(processId)
      return
    }

    // 等待进程退出，超时后强制终止
    const exited = await Promise.race([
      this.waitForExit(proc.pid),
      sleep(5000).then(() => false),
    ])

    if (!exited) {
      try {
        // 超时未退出，发送 SIGKILL 强制终止
        process.kill(proc.pid, 'SIGKILL')
      } catch {
        // 进程可能在等待期间已退出，忽略错误
      }
    }

    // 释放端口映射并更新状态
    this.releaseProcess(processId)
  }

  /**
   * 预测命令可能使用的端口
   *
   * 预测策略：
   * 1. 解析 --port / -p 参数指定的端口
   * 2. 解析位置参数中的纯数字（可能是端口号）
   * 3. 根据已知开发服务器的默认端口进行推断
   *
   * @param cmd - 规范化后的命令对象
   * @returns 预测的端口列表
   */
  predictPorts(cmd: NormalizedCommand): number[] {
    const ports: number[] = []

    // 策略 1：解析 --port=<value> 或 -p=<value> 形式的标志位
    for (const flag of cmd.flags) {
      const portMatch = flag.match(/^(?:--port|-p)=(\d+)$/)
      if (portMatch) {
        const port = parseInt(portMatch[1], 10)
        if (port > 0 && port <= 65535) {
          ports.push(port)
        }
      }
    }

    // 策略 2：检查位置参数中紧跟 --port / -p 标志的数值
    // NormalizedCommand 的 flags 和 positionalArgs 是分开的，
    // 但 --port 3000 这种形式中 3000 会被归为位置参数
    if (cmd.flags.has('--port') || cmd.flags.has('-p')) {
      for (const arg of cmd.positionalArgs) {
        const port = parseInt(arg, 10)
        if (!isNaN(port) && port > 0 && port <= 65535) {
          ports.push(port)
          break // 只取第一个数值参数作为端口
        }
      }
    }

    // 策略 3：根据已知开发服务器推断默认端口
    if (ports.length === 0) {
      // 检查主命令是否为已知开发服务器
      const execDefaults = DEFAULT_DEV_SERVER_PORTS[cmd.executable]
      if (execDefaults) {
        ports.push(...execDefaults)
      }

      // 检查子命令组合（如 npm run dev 中的 dev 暗示开发服务器）
      const devSubcommands = ['dev', 'start', 'serve']
      const hasDevSubcommand = cmd.subcommand.some((sub) =>
        devSubcommands.includes(sub),
      )
      if (hasDevSubcommand && ports.length === 0) {
        // npm/yarn/pnpm run dev 等命令，尝试从子命令推断
        // 这里无法确定具体端口，不做默认推断
      }
    }

    return ports
  }

  /**
   * 获取所有受管进程列表
   *
   * @returns 所有受管进程的数组（可序列化格式，用于 IPC 传输）
   */
  getProcessList(): ManagedProcess[] {
    return Array.from(this.processes.values())
  }

  /**
   * 释放进程：从注册表和端口映射中移除，并标记为 stopped
   *
   * @param processId - 要释放的进程唯一标识
   */
  releaseProcess(processId: string): void {
    const proc = this.processes.get(processId)
    if (!proc) return

    // 释放端口映射
    for (const port of proc.ports) {
      // 仅当端口仍映射到该进程时才删除（防止误删新进程的映射）
      if (this.portMap.get(port) === processId) {
        this.portMap.delete(port)
      }
    }

    proc.status = 'stopped'
  }

  /**
   * 获取指定进程的信息
   *
   * @param processId - 进程唯一标识
   * @returns 进程信息，不存在时返回 undefined
   */
  getProcess(processId: string): ManagedProcess | undefined {
    return this.processes.get(processId)
  }

  /**
   * 获取指定端口的占用进程 ID
   *
   * @param port - 端口号
   * @returns 占用该端口的进程 ID，未占用时返回 undefined
   */
  getProcessByPort(port: number): string | undefined {
    return this.portMap.get(port)
  }

  /**
   * 等待进程退出
   * 通过定期检查进程是否存活来判断退出状态
   *
   * @param pid - 操作系统进程 ID
   * @returns 进程是否已退出
   */
  private async waitForExit(pid: number): Promise<boolean> {
    // 每 100ms 检查一次进程是否存活，最多检查 50 次（5 秒）
    for (let i = 0; i < 50; i++) {
      try {
        // kill(pid, 0) 不发送信号，仅检查进程是否存在
        process.kill(pid, 0)
        // 进程仍存活，继续等待
        await sleep(100)
      } catch {
        // 进程已退出（kill 抛出 ESRCH 错误）
        return true
      }
    }
    return false
  }
}
