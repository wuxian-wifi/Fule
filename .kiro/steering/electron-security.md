---
inclusion: always
---

# Electron 安全规范

## 进程隔离

- 主进程（main）和渲染进程（renderer）必须严格隔离
- 渲染进程禁止启用 `nodeIntegration`，必须设置 `nodeIntegration: false`
- 渲染进程必须启用 `contextIsolation: true`
- 渲染进程必须启用 `sandbox: true`
- 所有 Node.js 能力必须通过 `preload` 脚本的 `contextBridge.exposeInMainWorld` 暴露

## IPC 通信规范

- 所有 IPC 通道名称必须在 `src/shared/ipc-channels.ts` 中统一定义为常量
- IPC 通道命名格式：`<模块>:<操作>`（如 `fs:read`、`cmd:execute`、`proc:kill`）
- 主进程 IPC handler 必须使用 `ipcMain.handle`（异步双向），禁止使用 `ipcMain.on`（单向）处理需要返回值的场景
- 所有 IPC handler 必须使用统一的错误包装函数 `createIPCHandler`，返回 `{ success: boolean, data?: T, error?: string }` 格式
- 渲染进程通过 preload 暴露的 API 调用 `ipcRenderer.invoke`，禁止直接使用 `ipcRenderer.send`
- IPC 传输的数据必须是可序列化的（禁止传递函数、类实例、循环引用对象）

## preload 脚本规范

- preload 脚本只暴露最小必要的 API，禁止暴露通用的 `fs`、`path`、`child_process` 模块
- 每个暴露的 API 必须有明确的类型定义
- preload 暴露的 API 命名空间使用 `fuleAPI`（如 `window.fuleAPI.fs.readFile`）

## 安全限制

- 禁止使用 `shell.openExternal` 打开任意 URL，如需使用必须校验 URL 白名单
- 禁止使用 `protocol.registerFileProtocol` 注册自定义协议访问任意文件
- 禁止在 `webPreferences` 中设置 `webSecurity: false`
- 所有外部资源加载必须通过 CSP（Content Security Policy）限制

## 敏感数据存储

- API Key、Token 等敏感凭证必须通过 `safeStorage.encryptString()` 加密后再写入 electron-store
- 读取时使用 `safeStorage.decryptString()` 解密，禁止在日志或 IPC 消息中输出明文凭证
- 如果 `safeStorage.isEncryptionAvailable()` 返回 false（极少数 Linux 环境），必须向用户提示安全风险并降级为内存存储，禁止明文落盘
