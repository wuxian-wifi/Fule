import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '@shared/ipc-channels'

import type {
  FuleAPI,
  FileWatchEvent,
  FileWriteParams,
  IPCResponse,
  FileReadResult,
  DirReadResult,
  ExternalFileChangeEvent,
  PtyCreateParams,
  PtyWriteParams,
  PtyResizeParams,
  PtyDataEvent,
} from '@shared/types'

/**
 * 通过 contextBridge 暴露类型安全的 API 到渲染进程
 * 渲染进程通过 window.fuleAPI 访问，禁止直接使用 Node.js API
 */
const fuleAPI: FuleAPI = {
  fs: {
    readFile: (filePath: string): Promise<IPCResponse<FileReadResult>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:read'], filePath)
    },

    writeFile: (params: FileWriteParams): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:write'], params)
    },

    readDir: (dirPath: string): Promise<IPCResponse<DirReadResult>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:readDir'], dirPath)
    },

    watchFile: (filePath: string): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:watch'], filePath)
    },

    unwatchFile: (filePath: string): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:unwatch'], filePath)
    },

    onFileChange: (callback: (event: FileWatchEvent) => void): (() => void) => {
      // 包装回调以匹配 ipcRenderer 事件签名
      const listener = (_event: Electron.IpcRendererEvent, data: FileWatchEvent): void => {
        callback(data)
      }
      ipcRenderer.on('fs:change', listener)

      // 返回取消注册函数
      return () => {
        ipcRenderer.removeListener('fs:change', listener)
      }
    },

    startProjectWatch: (dirPath: string): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:startProjectWatch'], dirPath)
    },

    stopProjectWatch: (): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:stopProjectWatch'])
    },

    openFolder: (): Promise<IPCResponse<string | null>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:openFolder'])
    },

    onExternalFileChange: (callback: (event: ExternalFileChangeEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: ExternalFileChangeEvent): void => {
        callback(data)
      }
      ipcRenderer.on('fs:externalChange', listener)

      return () => {
        ipcRenderer.removeListener('fs:externalChange', listener)
      }
    }
  },

  pty: {
    create: (params: PtyCreateParams): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['pty:create'], params)
    },

    write: (params: PtyWriteParams): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['pty:write'], params)
    },

    resize: (params: PtyResizeParams): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['pty:resize'], params)
    },

    kill: (sessionId: string): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['pty:kill'], sessionId)
    },

    onData: (callback: (event: PtyDataEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: PtyDataEvent): void => {
        callback(data)
      }
      ipcRenderer.on('pty:data', listener)

      return () => {
        ipcRenderer.removeListener('pty:data', listener)
      }
    }
  },

  preview: {
    openWindow: (url: string): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['preview:openWindow'], url)
    },

    closeWindow: (): Promise<IPCResponse<void>> => {
      return ipcRenderer.invoke(IPC_CHANNELS['preview:closeWindow'])
    },

    onWindowClosed: (callback: () => void): (() => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('preview:windowClosed', listener)
      return () => {
        ipcRenderer.removeListener('preview:windowClosed', listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('fuleAPI', fuleAPI)
