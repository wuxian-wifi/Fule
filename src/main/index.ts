import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'

import { IPC_CHANNELS } from '@shared/ipc-channels'
import { registerFsHandlers, cleanupFsWatchers } from './ipc/fs-handlers'
import { registerPtyHandlers } from './ipc/pty-handlers'
import { cleanupAllPty } from './services/pty-service'

/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null

/**
 * 创建主窗口
 * 严格遵循 Electron 安全规范：禁用 nodeIntegration，启用 contextIsolation
 * sandbox 设为 false 以支持 node-pty 原生模块通过 preload 通信
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 拦截外部链接，防止在应用内打开不受信任的 URL
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境加载 dev server，生产环境加载打包后的文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 应用就绪后初始化
app.whenReady().then(() => {
  log.info('[Main] 应用启动')

  // 设置应用 ID（用于 Windows 任务栏分组）
  electronApp.setAppUserModelId('com.fule.ide')

  // 开发环境下自动打开/关闭 DevTools
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 注册所有 IPC handler
  registerFsHandlers()
  registerPtyHandlers()

  // 预览独立窗口管理
  let previewWindow: BrowserWindow | null = null

  ipcMain.handle(IPC_CHANNELS['preview:openWindow'], async (_event, url: string) => {
    // 关闭已有的预览窗口
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close()
    }

    previewWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      title: '预览 — ' + url,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    previewWindow.loadURL(url)
    log.info(`[Preview] 打开独立预览窗口: ${url}`)

    // 窗口关闭时通知渲染进程
    previewWindow.on('closed', () => {
      previewWindow = null
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('preview:windowClosed')
        }
      }
    })

    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS['preview:closeWindow'], async () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close()
      previewWindow = null
    }
    return { success: true }
  })

  createWindow()

  // macOS 点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理资源
app.on('before-quit', () => {
  log.info('[Main] 应用退出，清理资源')
  cleanupFsWatchers()
  cleanupAllPty()
})
