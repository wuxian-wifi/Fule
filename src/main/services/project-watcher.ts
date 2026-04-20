import chokidar, { type FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import log from 'electron-log'

/** 忽略的目录和文件模式 */
const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.cache/**',
  '**/.vite/**'
]

/** chokidar 监听器实例 */
let watcher: FSWatcher | null = null

/**
 * 启动项目目录监听
 * 使用 chokidar 监听指定目录下的文件变更，忽略 node_modules 等无关目录。
 * 当检测到文件变更时，通过 IPC 将变更路径推送到所有渲染进程窗口。
 *
 * @param dirPath - 要监听的项目根目录路径
 */
export function startProjectWatch(dirPath: string): void {
  // 避免重复启动
  if (watcher) {
    log.warn('[ProjectWatcher] 监听器已在运行，先停止旧实例')
    stopProjectWatch()
  }

  log.info(`[ProjectWatcher] 开始监听项目目录: ${dirPath}`)

  watcher = chokidar.watch(dirPath, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    // 等待写入完成后再触发事件，避免读取到不完整的文件
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  })

  // 监听文件新增、修改、删除事件，携带变更类型推送到渲染进程
  const handleEvent = (eventType: 'add' | 'change' | 'unlink') => (filePath: string) => {
    log.info(`[ProjectWatcher] 检测到外部文件变更 [${eventType}]: ${filePath}`)
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('fs:externalChange', { path: filePath, type: eventType })
      }
    }
  }

  watcher.on('add', handleEvent('add'))
  watcher.on('change', handleEvent('change'))
  watcher.on('unlink', handleEvent('unlink'))

  watcher.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    log.error('[ProjectWatcher] 监听异常:', message)
  })
}

/**
 * 停止项目目录监听，释放 chokidar 资源
 */
export function stopProjectWatch(): void {
  if (!watcher) {
    log.warn('[ProjectWatcher] 监听器未在运行')
    return
  }

  log.info('[ProjectWatcher] 停止项目目录监听')
  watcher.close()
  watcher = null
}
