/**
 * 属性测试：端口冲突自动清理
 * **Validates: Requirements 5.5**
 *
 * 验证 ProcessManager 在新命令需要已占用端口时，
 * 能正确终止旧进程并释放端口
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import { ProcessManager } from '@main/services/command-gateway/process-manager'
import type { NormalizedCommand } from '@main/services/command-gateway/command-normalizer'

/**
 * 已注册进程的生成器模型
 */
interface GeneratedProcess {
  /** 进程 PID */
  pid: number
  /** 进程占用的端口列表（有效端口范围 1-65535） */
  ports: number[]
}

/**
 * 创建测试用的 NormalizedCommand，指定需要的端口
 */
function makeCommandForPorts(ports: number[]): NormalizedCommand {
  // 通过 --port=<value> 标志指定端口
  const flags = new Set(ports.map((p) => `--port=${p}`))
  return {
    executable: 'vite',
    subcommand: [],
    flags,
    positionalArgs: [],
    rawCommand: `vite ${ports.map((p) => `--port=${p}`).join(' ')}`,
    pipes: [],
  }
}

describe('Property 8: 端口冲突自动清理', () => {
  let killSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    // mock process.kill：SIGTERM 成功，kill(pid, 0) 抛出表示进程已退出
    killSpy = vi.spyOn(process, 'kill').mockImplementation(
      (_pid: number, signal?: string | number) => {
        if (signal === 0) throw new Error('ESRCH')
        return true
      },
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /**
   * 生成器：有效端口号（1-65535）
   */
  const validPort = fc.integer({ min: 1, max: 65535 })

  /**
   * 生成器：已注册进程集合
   * 每个进程有唯一 PID 和一组有效端口
   */
  const processArbitrary: fc.Arbitrary<GeneratedProcess> = fc.record({
    pid: fc.integer({ min: 1, max: 65535 }),
    ports: fc.array(validPort, { minLength: 1, maxLength: 5 }),
  })

  it('新命令需要已占用端口时应终止旧进程并释放端口', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(processArbitrary, { minLength: 1, maxLength: 10 }),
        async (generatedProcesses) => {
          // 重置 mock 调用记录
          killSpy.mockClear()

          const pm = new ProcessManager()

          // 注册所有生成的进程，确保 ID 和 PID 唯一
          const registeredProcesses: Array<{
            id: string
            pid: number
            ports: number[]
          }> = []

          const usedPids = new Set<number>()
          const usedPorts = new Set<number>()

          for (let i = 0; i < generatedProcesses.length; i++) {
            const gen = generatedProcesses[i]
            // 确保 PID 唯一
            if (usedPids.has(gen.pid)) continue
            usedPids.add(gen.pid)

            // 过滤掉已被其他进程占用的端口，确保端口唯一
            const uniquePorts = gen.ports.filter((p) => !usedPorts.has(p))
            if (uniquePorts.length === 0) continue

            for (const p of uniquePorts) {
              usedPorts.add(p)
            }

            const id = `proc-${i}`
            pm.registerProcess(id, gen.pid, `cmd-${i}`, uniquePorts)
            registeredProcesses.push({ id, pid: gen.pid, ports: uniquePorts })
          }

          if (registeredProcesses.length === 0) return

          // 选择第一个已注册进程的端口作为冲突端口
          const targetProcess = registeredProcesses[0]
          const conflictPort = targetProcess.ports[0]

          // 验证端口确实被占用
          expect(pm.getProcessByPort(conflictPort)).toBe(targetProcess.id)

          // 创建需要该端口的新命令
          const newCmd = makeCommandForPorts([conflictPort])

          // 执行 prepareExecution
          const preparePromise = pm.prepareExecution(newCmd)
          await vi.advanceTimersByTimeAsync(200)
          await preparePromise

          // 属性 1：冲突端口应被释放
          expect(pm.getProcessByPort(conflictPort)).toBeUndefined()

          // 属性 2：旧进程应被标记为 stopped
          const oldProc = pm.getProcess(targetProcess.id)
          expect(oldProc).toBeDefined()
          expect(oldProc!.status).toBe('stopped')

          // 属性 3：非冲突进程应保持 running 状态
          for (let i = 1; i < registeredProcesses.length; i++) {
            const otherProc = pm.getProcess(registeredProcesses[i].id)
            // 仅当该进程没有与冲突端口重叠时才检查
            const hasConflict = registeredProcesses[i].ports.includes(conflictPort)
            if (!hasConflict) {
              expect(otherProc!.status).toBe('running')
            }
          }
        },
      ),
      { numRuns: 100 },
    )
  })

  it('新命令需要多个已占用端口时应终止所有冲突进程', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成两个不同端口
        fc.tuple(validPort, validPort).filter(([a, b]) => a !== b),
        async ([portA, portB]) => {
          killSpy.mockClear()

          const pm = new ProcessManager()

          // 注册两个进程，各占用一个端口
          pm.registerProcess('proc-a', 1001, 'cmd-a', [portA])
          pm.registerProcess('proc-b', 1002, 'cmd-b', [portB])

          // 新命令需要两个端口
          const newCmd = makeCommandForPorts([portA, portB])

          const preparePromise = pm.prepareExecution(newCmd)
          await vi.advanceTimersByTimeAsync(200)
          await preparePromise

          // 两个旧进程都应被终止
          expect(pm.getProcess('proc-a')!.status).toBe('stopped')
          expect(pm.getProcess('proc-b')!.status).toBe('stopped')

          // 两个端口都应被释放
          expect(pm.getProcessByPort(portA)).toBeUndefined()
          expect(pm.getProcessByPort(portB)).toBeUndefined()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('无端口冲突时不应终止任何进程', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成两个不重叠的端口
        fc.tuple(validPort, validPort).filter(([a, b]) => a !== b),
        async ([existingPort, newPort]) => {
          killSpy.mockClear()

          const pm = new ProcessManager()

          // 注册一个进程占用 existingPort
          pm.registerProcess('proc-1', 2001, 'cmd-1', [existingPort])

          // 新命令需要 newPort（不冲突）
          const newCmd = makeCommandForPorts([newPort])

          await pm.prepareExecution(newCmd)

          // 旧进程应保持 running
          expect(pm.getProcess('proc-1')!.status).toBe('running')

          // 旧端口映射应保持不变
          expect(pm.getProcessByPort(existingPort)).toBe('proc-1')
        },
      ),
      { numRuns: 100 },
    )
  })
})
