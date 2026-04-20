/**
 * ProcessManager 进程管理器单元测试
 * 验证进程注册、端口映射、端口预测、优雅终止和 IPC 接口
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProcessManager } from '@main/services/command-gateway/process-manager'
import type { NormalizedCommand } from '@main/services/command-gateway/command-normalizer'

/**
 * 创建测试用的 NormalizedCommand 对象
 */
function makeCommand(overrides: Partial<NormalizedCommand> = {}): NormalizedCommand {
  return {
    executable: overrides.executable ?? 'node',
    subcommand: overrides.subcommand ?? [],
    flags: overrides.flags ?? new Set(),
    positionalArgs: overrides.positionalArgs ?? [],
    rawCommand: overrides.rawCommand ?? 'node index.js',
    pipes: overrides.pipes ?? [],
  }
}

describe('ProcessManager', () => {
  let pm: ProcessManager

  beforeEach(() => {
    pm = new ProcessManager()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('registerProcess — 进程注册与端口映射', () => {
    it('应正确注册进程并建立端口映射', () => {
      pm.registerProcess('proc-1', 1234, 'npm run dev', [3000])

      const proc = pm.getProcess('proc-1')
      expect(proc).toBeDefined()
      expect(proc!.pid).toBe(1234)
      expect(proc!.command).toBe('npm run dev')
      expect(proc!.ports).toEqual([3000])
      expect(proc!.status).toBe('running')

      // 端口映射应指向该进程
      expect(pm.getProcessByPort(3000)).toBe('proc-1')
    })

    it('应支持注册多端口进程', () => {
      pm.registerProcess('proc-1', 1234, 'docker compose up', [3000, 5432, 6379])

      expect(pm.getProcessByPort(3000)).toBe('proc-1')
      expect(pm.getProcessByPort(5432)).toBe('proc-1')
      expect(pm.getProcessByPort(6379)).toBe('proc-1')
    })

    it('应支持注册无端口进程', () => {
      pm.registerProcess('proc-1', 1234, 'node script.js', [])

      const proc = pm.getProcess('proc-1')
      expect(proc).toBeDefined()
      expect(proc!.ports).toEqual([])
    })
  })

  describe('getProcessList — 获取进程列表', () => {
    it('无进程时应返回空数组', () => {
      expect(pm.getProcessList()).toEqual([])
    })

    it('应返回所有已注册进程', () => {
      pm.registerProcess('proc-1', 1001, 'npm run dev', [3000])
      pm.registerProcess('proc-2', 1002, 'vite', [5173])

      const list = pm.getProcessList()
      expect(list).toHaveLength(2)
      expect(list.map((p) => p.id).sort()).toEqual(['proc-1', 'proc-2'])
    })
  })

  describe('releaseProcess — 释放进程', () => {
    it('应将进程标记为 stopped 并释放端口映射', () => {
      pm.registerProcess('proc-1', 1234, 'npm run dev', [3000])

      pm.releaseProcess('proc-1')

      const proc = pm.getProcess('proc-1')
      expect(proc!.status).toBe('stopped')
      expect(pm.getProcessByPort(3000)).toBeUndefined()
    })

    it('释放不存在的进程应安全忽略', () => {
      expect(() => pm.releaseProcess('nonexistent')).not.toThrow()
    })

    it('不应误删其他进程的端口映射', () => {
      // 两个进程占用不同端口
      pm.registerProcess('proc-1', 1001, 'npm run dev', [3000])
      pm.registerProcess('proc-2', 1002, 'vite', [5173])

      pm.releaseProcess('proc-1')

      // proc-2 的端口映射应保持不变
      expect(pm.getProcessByPort(5173)).toBe('proc-2')
      expect(pm.getProcessByPort(3000)).toBeUndefined()
    })
  })

  describe('predictPorts — 端口预测', () => {
    it('应从 --port=<value> 标志中解析端口', () => {
      const cmd = makeCommand({
        executable: 'vite',
        flags: new Set(['--port=4000']),
      })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(4000)
    })

    it('应从 -p=<value> 标志中解析端口', () => {
      const cmd = makeCommand({
        executable: 'serve',
        flags: new Set(['-p=8080']),
      })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(8080)
    })

    it('应从 --port 标志 + 位置参数中解析端口', () => {
      const cmd = makeCommand({
        executable: 'vite',
        flags: new Set(['--port']),
        positionalArgs: ['3001'],
      })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(3001)
    })

    it('应识别 vite 的默认端口 5173', () => {
      const cmd = makeCommand({ executable: 'vite' })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(5173)
    })

    it('应识别 next 的默认端口 3000', () => {
      const cmd = makeCommand({ executable: 'next' })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(3000)
    })

    it('应识别 webpack-dev-server 的默认端口 8080', () => {
      const cmd = makeCommand({ executable: 'webpack-dev-server' })

      const ports = pm.predictPorts(cmd)
      expect(ports).toContain(8080)
    })

    it('未知命令且无端口参数时应返回空数组', () => {
      const cmd = makeCommand({ executable: 'unknown-tool' })

      const ports = pm.predictPorts(cmd)
      expect(ports).toEqual([])
    })

    it('应忽略超出有效范围的端口号', () => {
      const cmd = makeCommand({
        executable: 'serve',
        flags: new Set(['--port=99999']),
      })

      const ports = pm.predictPorts(cmd)
      expect(ports).not.toContain(99999)
    })

    it('显式端口参数应优先于默认端口', () => {
      const cmd = makeCommand({
        executable: 'vite',
        flags: new Set(['--port=4000']),
      })

      const ports = pm.predictPorts(cmd)
      // 有显式端口时不应包含默认端口
      expect(ports).toContain(4000)
      expect(ports).not.toContain(5173)
    })
  })

  describe('gracefulKill — 优雅终止进程', () => {
    it('应先发送 SIGTERM 再等待退出', async () => {
      pm.registerProcess('proc-1', 9999, 'npm run dev', [3000])

      // mock process.kill：第一次 SIGTERM 成功，之后 kill(pid, 0) 抛出表示进程已退出
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(
        (pid: number, signal?: string | number) => {
          if (signal === 0) {
            // 模拟进程已退出
            throw new Error('ESRCH')
          }
          // SIGTERM / SIGKILL 成功
          return true
        },
      )

      const killPromise = pm.gracefulKill('proc-1')
      // 推进定时器让 waitForExit 的 sleep(100) 执行
      await vi.advanceTimersByTimeAsync(200)
      await killPromise

      // 应发送过 SIGTERM
      expect(killSpy).toHaveBeenCalledWith(9999, 'SIGTERM')

      // 进程应被标记为 stopped
      const proc = pm.getProcess('proc-1')
      expect(proc!.status).toBe('stopped')

      // 端口应被释放
      expect(pm.getProcessByPort(3000)).toBeUndefined()
    })

    it('SIGTERM 超时后应发送 SIGKILL', async () => {
      pm.registerProcess('proc-1', 9999, 'npm run dev', [3000])

      // mock process.kill：SIGTERM 成功，kill(pid, 0) 始终成功（进程不退出）
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(
        (_pid: number, signal?: string | number) => {
          if (signal === 'SIGKILL') {
            // SIGKILL 后进程退出
            return true
          }
          // SIGTERM 和 kill(pid, 0) 都成功（进程仍存活）
          return true
        },
      )

      const killPromise = pm.gracefulKill('proc-1')
      // 推进 5 秒超时 + waitForExit 的轮询
      await vi.advanceTimersByTimeAsync(6000)
      await killPromise

      // 应先发送 SIGTERM，然后发送 SIGKILL
      const signals = killSpy.mock.calls.map((call) => call[1])
      expect(signals).toContain('SIGTERM')
      expect(signals).toContain('SIGKILL')
    })

    it('对非 running 状态的进程应直接返回', async () => {
      pm.registerProcess('proc-1', 9999, 'npm run dev', [3000])
      pm.releaseProcess('proc-1') // 标记为 stopped

      const killSpy = vi.spyOn(process, 'kill')

      await pm.gracefulKill('proc-1')

      // 不应调用 process.kill
      expect(killSpy).not.toHaveBeenCalled()
    })

    it('对不存在的进程应安全忽略', async () => {
      const killSpy = vi.spyOn(process, 'kill')

      await pm.gracefulKill('nonexistent')

      expect(killSpy).not.toHaveBeenCalled()
    })

    it('SIGTERM 失败时应直接释放进程', async () => {
      pm.registerProcess('proc-1', 9999, 'npm run dev', [3000])

      // mock process.kill：SIGTERM 抛出错误（进程已不存在）
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH')
      })

      await pm.gracefulKill('proc-1')

      // 进程应被释放
      const proc = pm.getProcess('proc-1')
      expect(proc!.status).toBe('stopped')
      expect(pm.getProcessByPort(3000)).toBeUndefined()
    })
  })

  describe('prepareExecution — 端口冲突自动清理', () => {
    it('无冲突时应正常通过', async () => {
      const killSpy = vi.spyOn(process, 'kill')

      const cmd = makeCommand({
        executable: 'vite',
        flags: new Set(['--port=4000']),
      })

      await pm.prepareExecution(cmd)

      // 无已注册进程，不应调用 kill
      expect(killSpy).not.toHaveBeenCalled()
    })

    it('存在端口冲突时应终止旧进程', async () => {
      // 注册一个占用 5173 端口的进程
      pm.registerProcess('old-vite', 8888, 'vite', [5173])

      // mock process.kill
      vi.spyOn(process, 'kill').mockImplementation(
        (_pid: number, signal?: string | number) => {
          if (signal === 0) throw new Error('ESRCH')
          return true
        },
      )

      // 新命令也需要 5173 端口
      const cmd = makeCommand({ executable: 'vite' })

      const preparePromise = pm.prepareExecution(cmd)
      await vi.advanceTimersByTimeAsync(200)
      await preparePromise

      // 旧进程应被终止
      const oldProc = pm.getProcess('old-vite')
      expect(oldProc!.status).toBe('stopped')

      // 端口应被释放
      expect(pm.getProcessByPort(5173)).toBeUndefined()
    })

    it('已停止的旧进程不应被重复终止', async () => {
      pm.registerProcess('old-vite', 8888, 'vite', [5173])
      pm.releaseProcess('old-vite') // 已停止

      const killSpy = vi.spyOn(process, 'kill')

      const cmd = makeCommand({ executable: 'vite' })
      await pm.prepareExecution(cmd)

      // 不应调用 kill
      expect(killSpy).not.toHaveBeenCalled()
    })
  })
})
