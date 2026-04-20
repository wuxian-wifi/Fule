import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncEngine } from '@renderer/services/sync/sync-engine'

import type { ElectronFileChangeEvent } from '@renderer/services/sync/sync-engine'

/**
 * 模拟 window.fuleAPI.fs 接口
 * 渲染进程通过 IPC 与主进程通信，测试中需要 mock
 */
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

vi.stubGlobal('window', {
  fuleAPI: {
    fs: {
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    },
  },
})

/**
 * 模拟 webcontainer-service 的 mountFiles
 * 同步引擎通过 ElectronToWCSyncExecutor 调用 mountFiles 写入 WC
 */
const mockMountFiles = vi.fn().mockResolvedValue(undefined)
vi.mock('@renderer/services/webcontainer-service', () => ({
  mountFiles: (...args: unknown[]) => mockMountFiles(...args),
}))

describe('SyncEngine - 同步引擎', () => {
  let engine: SyncEngine

  beforeEach(async () => {
    vi.useFakeTimers()
    mockReadFile.mockReset()
    mockWriteFile.mockReset()
    mockMountFiles.mockReset()

    // 默认 readFile 返回成功
    mockReadFile.mockResolvedValue({
      success: true,
      data: { content: 'file content', path: '/project/src/app.tsx' },
    })
    mockWriteFile.mockResolvedValue({ success: true })

    engine = new SyncEngine()
    await engine.start('/project')
  })

  afterEach(() => {
    engine.dispose()
    vi.useRealTimers()
  })

  describe('生命周期管理', () => {
    it('启动后状态应为 running', () => {
      expect(engine.getStatus()).toBe('running')
    })

    it('启动后应记录项目路径', () => {
      expect(engine.getProjectPath()).toBe('/project')
    })

    it('停止后状态应为 stopped', async () => {
      await engine.stop()
      expect(engine.getStatus()).toBe('stopped')
    })

    it('停止后项目路径应为 null', async () => {
      await engine.stop()
      expect(engine.getProjectPath()).toBeNull()
    })

    it('重复启动不应报错', async () => {
      await engine.start('/project')
      expect(engine.getStatus()).toBe('running')
    })

    it('dispose 后状态应为 stopped', () => {
      engine.dispose()
      expect(engine.getStatus()).toBe('stopped')
    })
  })

  describe('handleElectronFileChange - Electron → WC 同步', () => {
    it('普通文件变更应触发 WC 写入', async () => {
      const event: ElectronFileChangeEvent = {
        path: '/project/src/app.tsx',
        type: 'change',
      }

      await engine.handleElectronFileChange(event)

      // 等待防抖窗口结束
      await vi.advanceTimersByTimeAsync(400)

      // 应调用 readFile 读取文件内容
      expect(mockReadFile).toHaveBeenCalledWith('/project/src/app.tsx')
      // 应调用 mountFiles 写入 WC
      expect(mockMountFiles).toHaveBeenCalled()
    })

    it('新增文件事件应触发 WC 写入', async () => {
      const event: ElectronFileChangeEvent = {
        path: '/project/src/new-file.ts',
        type: 'add',
      }

      mockReadFile.mockResolvedValue({
        success: true,
        data: { content: 'new file', path: '/project/src/new-file.ts' },
      })

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      expect(mockReadFile).toHaveBeenCalledWith('/project/src/new-file.ts')
      expect(mockMountFiles).toHaveBeenCalled()
    })

    it('删除文件事件不应读取文件内容', async () => {
      const event: ElectronFileChangeEvent = {
        path: '/project/src/deleted.ts',
        type: 'unlink',
      }

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      // 删除事件不需要读取文件
      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('被忽略的文件不应触发同步', async () => {
      // node_modules 下的文件应被忽略
      const event: ElectronFileChangeEvent = {
        path: '/project/node_modules/lodash/index.js',
        type: 'change',
      }

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      expect(mockReadFile).not.toHaveBeenCalled()
      expect(mockMountFiles).not.toHaveBeenCalled()
    })

    it('dist 目录下的文件应被忽略', async () => {
      const event: ElectronFileChangeEvent = {
        path: '/project/dist/bundle.js',
        type: 'change',
      }

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('引擎未运行时不应处理事件', async () => {
      await engine.stop()

      const event: ElectronFileChangeEvent = {
        path: '/project/src/app.tsx',
        type: 'change',
      }

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      expect(mockReadFile).not.toHaveBeenCalled()
    })

    it('readFile 失败时应静默跳过', async () => {
      mockReadFile.mockResolvedValue({ success: false, error: '文件不存在' })

      const event: ElectronFileChangeEvent = {
        path: '/project/src/missing.ts',
        type: 'change',
      }

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      // readFile 被调用但返回失败，不应写入 WC
      expect(mockReadFile).toHaveBeenCalled()
      expect(mockMountFiles).not.toHaveBeenCalled()
    })

    it('绝对路径应正确转换为相对路径', async () => {
      const event: ElectronFileChangeEvent = {
        path: '/project/src/components/button.tsx',
        type: 'change',
      }

      mockReadFile.mockResolvedValue({
        success: true,
        data: { content: 'button code', path: '/project/src/components/button.tsx' },
      })

      await engine.handleElectronFileChange(event)
      await vi.advanceTimersByTimeAsync(400)

      // mountFiles 应收到相对路径构建的文件树
      expect(mockMountFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          src: expect.objectContaining({
            directory: expect.objectContaining({
              components: expect.objectContaining({
                directory: expect.objectContaining({
                  'button.tsx': expect.objectContaining({
                    file: expect.objectContaining({ contents: 'button code' }),
                  }),
                }),
              }),
            }),
          }),
        })
      )
    })
  })

  describe('handleWebContainerFileChange - WC → Electron 同步', () => {
    it('普通文件变更应触发 Electron 写入', async () => {
      engine.handleWebContainerFileChange('src/app.tsx', 'updated content', 'update')

      await vi.advanceTimersByTimeAsync(400)

      // 应通过 IPC 写入 Electron 文件系统
      expect(mockWriteFile).toHaveBeenCalledWith({
        path: '/project/src/app.tsx',
        content: 'updated content',
      })
    })

    it('新增文件应触发 Electron 写入', async () => {
      engine.handleWebContainerFileChange('src/new.ts', 'new content', 'create')

      await vi.advanceTimersByTimeAsync(400)

      expect(mockWriteFile).toHaveBeenCalledWith({
        path: '/project/src/new.ts',
        content: 'new content',
      })
    })

    it('被忽略的文件不应触发同步', () => {
      // node_modules 下的文件应被忽略
      engine.handleWebContainerFileChange(
        'node_modules/lodash/index.js',
        'module code'
      )

      // 不应有任何写入操作
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('package-lock.json 应被忽略', () => {
      engine.handleWebContainerFileChange(
        'package-lock.json',
        '{"lockfileVersion": 3}'
      )

      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('引擎未运行时不应处理事件', async () => {
      await engine.stop()

      engine.handleWebContainerFileChange('src/app.tsx', 'content')

      await vi.advanceTimersByTimeAsync(400)

      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('删除事件不应写入文件内容', async () => {
      engine.handleWebContainerFileChange('src/old.ts', undefined, 'delete')

      await vi.advanceTimersByTimeAsync(400)

      // delete 事件没有 content，不应触发写入
      expect(mockWriteFile).not.toHaveBeenCalled()
    })
  })

  describe('回声检测集成', () => {
    it('Electron→WC 写入后 WC 的回声事件应被丢弃', async () => {
      const content = 'const x = 1'

      // 模拟 Electron 文件变更
      mockReadFile.mockResolvedValue({
        success: true,
        data: { content, path: '/project/src/app.tsx' },
      })

      await engine.handleElectronFileChange({
        path: '/project/src/app.tsx',
        type: 'change',
      })

      // 等待防抖窗口结束，触发 Electron→WC 同步
      await vi.advanceTimersByTimeAsync(400)

      expect(mockMountFiles).toHaveBeenCalledTimes(1)
      mockWriteFile.mockClear()

      // 模拟 WC 收到相同内容的回声事件
      engine.handleWebContainerFileChange('src/app.tsx', content, 'update')

      await vi.advanceTimersByTimeAsync(400)

      // 回声事件应被丢弃，不应回写 Electron
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('WC→Electron 写入后 Electron 的回声事件应被丢弃', async () => {
      const content = 'const y = 2'

      // 模拟 WC 文件变更
      engine.handleWebContainerFileChange('src/index.ts', content, 'update')

      // 等待防抖窗口结束，触发 WC→Electron 同步
      await vi.advanceTimersByTimeAsync(400)

      expect(mockWriteFile).toHaveBeenCalledTimes(1)
      mockMountFiles.mockClear()

      // 模拟 Electron 收到相同内容的回声事件（chokidar 检测到刚写入的文件）
      mockReadFile.mockResolvedValue({
        success: true,
        data: { content, path: '/project/src/index.ts' },
      })

      await engine.handleElectronFileChange({
        path: '/project/src/index.ts',
        type: 'change',
      })

      await vi.advanceTimersByTimeAsync(400)

      // 回声事件应被丢弃，不应写入 WC
      expect(mockMountFiles).not.toHaveBeenCalled()
    })

    it('不同内容的事件不应被判定为回声', async () => {
      // 模拟 Electron 文件变更
      mockReadFile.mockResolvedValue({
        success: true,
        data: { content: 'version 1', path: '/project/src/app.tsx' },
      })

      await engine.handleElectronFileChange({
        path: '/project/src/app.tsx',
        type: 'change',
      })

      await vi.advanceTimersByTimeAsync(400)
      mockWriteFile.mockClear()

      // WC 发出不同内容的变更（非回声，是真实的新变更）
      engine.handleWebContainerFileChange('src/app.tsx', 'version 2', 'update')

      await vi.advanceTimersByTimeAsync(400)

      // 不同内容不是回声，应正常回写 Electron
      expect(mockWriteFile).toHaveBeenCalled()
    })
  })

  describe('自定义忽略规则', () => {
    it('应支持项目级忽略配置', async () => {
      // 使用自定义忽略规则创建引擎
      engine.dispose()
      engine = new SyncEngine('*.log\ntmp/**')
      await engine.start('/project')

      // .log 文件应被忽略
      await engine.handleElectronFileChange({
        path: '/project/debug.log',
        type: 'change',
      })

      await vi.advanceTimersByTimeAsync(400)
      expect(mockReadFile).not.toHaveBeenCalled()

      // tmp 目录下的文件应被忽略
      engine.handleWebContainerFileChange('tmp/cache.dat', 'data')
      await vi.advanceTimersByTimeAsync(400)
      expect(mockWriteFile).not.toHaveBeenCalled()
    })
  })
})
