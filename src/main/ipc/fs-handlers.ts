import fs from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

import { IPC_CHANNELS } from '@shared/ipc-channels'
import { createIPCHandler } from './create-ipc-handler'
import { startProjectWatch, stopProjectWatch } from '../services/project-watcher'

import type { FileReadResult, FileWriteParams, DirReadResult, FileTreeNode } from '@shared/types'

/** 存储当前正在监听的文件路径集合，用于管理 watch/unwatch 生命周期 */
const watchedPaths = new Map<string, fs.FileHandle | AbortController>()

/**
 * 注册所有文件系统相关的 IPC handler
 * 包括 fs:read、fs:write、fs:watch、fs:unwatch
 */
export function registerFsHandlers(): void {
  // 读取文件内容
  createIPCHandler<[string], FileReadResult>(
    IPC_CHANNELS['fs:read'],
    async (filePath: string): Promise<FileReadResult> => {
      log.info(`[FS] 读取文件: ${filePath}`)
      const content = await fs.readFile(filePath, { encoding: 'utf-8' })
      return { content, path: filePath }
    }
  )

  // 写入文件内容
  createIPCHandler<[FileWriteParams], void>(
    IPC_CHANNELS['fs:write'],
    async (params: FileWriteParams): Promise<void> => {
      log.info(`[FS] 写入文件: ${params.path}`)
      await fs.writeFile(params.path, params.content, { encoding: 'utf-8' })
    }
  )

  // 读取目录结构（单层，返回文件和子目录列表）
  createIPCHandler<[string], DirReadResult>(
    IPC_CHANNELS['fs:readDir'],
    async (dirPath: string): Promise<DirReadResult> => {
      log.info(`[FS] 读取目录: ${dirPath}`)
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const children: FileTreeNode[] = entries
        .filter((entry) => !entry.name.startsWith('.'))
        .sort((a, b) => {
          // 目录排在文件前面
          if (a.isDirectory() && !b.isDirectory()) return -1
          if (!a.isDirectory() && b.isDirectory()) return 1
          return a.name.localeCompare(b.name)
        })
        .map((entry) => ({
          name: entry.name,
          path: `${dirPath}/${entry.name}`,
          type: entry.isDirectory() ? 'directory' as const : 'file' as const,
        }))
      return { children }
    }
  )

  // 监听文件变更（使用 Node.js 原生 fs.watch）
  createIPCHandler<[string], void>(
    IPC_CHANNELS['fs:watch'],
    async (filePath: string): Promise<void> => {
      if (watchedPaths.has(filePath)) {
        log.warn(`[FS] 文件已在监听中: ${filePath}`)
        return
      }

      log.info(`[FS] 开始监听文件: ${filePath}`)
      const abortController = new AbortController()
      watchedPaths.set(filePath, abortController)

      // 在后台启动文件监听，变更事件通过 webContents 推送到渲染进程
      startFileWatcher(filePath, abortController)
    }
  )

  // 取消文件监听
  createIPCHandler<[string], void>(
    IPC_CHANNELS['fs:unwatch'],
    async (filePath: string): Promise<void> => {
      const controller = watchedPaths.get(filePath)
      if (!controller) {
        log.warn(`[FS] 文件未在监听中: ${filePath}`)
        return
      }

      log.info(`[FS] 停止监听文件: ${filePath}`)
      if (controller instanceof AbortController) {
        controller.abort()
      }
      watchedPaths.delete(filePath)
    }
  )

  // 启动项目目录监听（外部文件变更检测）
  createIPCHandler<[string], void>(
    IPC_CHANNELS['fs:startProjectWatch'],
    async (dirPath: string): Promise<void> => {
      log.info(`[FS] 启动项目目录监听: ${dirPath}`)
      startProjectWatch(dirPath)
    }
  )

  // 停止项目目录监听
  createIPCHandler<[], void>(
    IPC_CHANNELS['fs:stopProjectWatch'],
    async (): Promise<void> => {
      log.info('[FS] 停止项目目录监听')
      stopProjectWatch()
    }
  )

  // 打开文件夹对话框，返回用户选择的目录路径
  createIPCHandler<[], string | null>(
    IPC_CHANNELS['fs:openFolder'],
    async (): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return null

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: '打开项目文件夹',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const folderPath = result.filePaths[0]
      log.info(`[FS] 用户选择项目目录: ${folderPath}`)
      return folderPath
    }
  )
}

/**
 * 启动文件监听器，将变更事件推送到所有渲染进程窗口
 * 使用 AbortController 支持优雅取消
 */
function startFileWatcher(filePath: string, abortController: AbortController): void {
  // 异步启动 watcher，不阻塞 IPC 响应
  ;(async () => {
    try {
      const watcher = fs.watch(filePath, { signal: abortController.signal })
      for await (const event of watcher) {
        const eventType = event.eventType === 'rename' ? 'create' : 'update'
        // 将文件变更事件推送到所有渲染进程窗口
        const windows = BrowserWindow.getAllWindows()
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('fs:change', {
              type: eventType,
              path: filePath
            })
          }
        }
      }
    } catch (err: unknown) {
      // AbortError 是正常的取消操作，不需要记录错误
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      log.error(`[FS] 文件监听异常: ${filePath}`, err)
    } finally {
      watchedPaths.delete(filePath)
    }
  })()
}

/**
 * 清理所有文件监听器，在应用退出时调用
 */
export function cleanupFsWatchers(): void {
  for (const [filePath, controller] of watchedPaths) {
    log.info(`[FS] 清理文件监听: ${filePath}`)
    if (controller instanceof AbortController) {
      controller.abort()
    }
  }
  watchedPaths.clear()
  // 同时停止项目目录监听
  stopProjectWatch()
}
