/**
 * 主进程与渲染进程共享的类型定义
 * 仅包含纯类型和常量，禁止放任何运行时逻辑
 */

/** 标准化 IPC 响应包装器 */
export interface IPCResponse<T = unknown> {
  /** 操作是否成功 */
  success: boolean
  /** 成功时返回的数据 */
  data?: T
  /** 失败时的错误信息 */
  error?: string
}

/** 文件读取结果 */
export interface FileReadResult {
  /** 文件内容 */
  content: string
  /** 文件路径 */
  path: string
}

/** 文件写入参数 */
export interface FileWriteParams {
  /** 文件路径 */
  path: string
  /** 文件内容 */
  content: string
}

/** 文件监听变更事件 */
export interface FileWatchEvent {
  /** 变更类型 */
  type: 'create' | 'update' | 'delete'
  /** 变更文件路径 */
  path: string
}

/** 文件树节点，用于文件资源管理器的树形展示 */
export interface FileTreeNode {
  /** 文件或目录名称 */
  name: string
  /** 完整路径 */
  path: string
  /** 节点类型 */
  type: 'file' | 'directory'
  /** 子节点（仅目录有） */
  children?: FileTreeNode[]
}

/** 目录读取结果 */
export interface DirReadResult {
  /** 目录树节点列表 */
  children: FileTreeNode[]
}

/** 命令执行参数 */
export interface CommandExecuteParams {
  /** Shell 命令字符串 */
  command: string
  /** 工作目录 */
  cwd?: string
}

/** 命令执行结果 */
export interface CommandExecuteResult {
  /** 标准输出 */
  stdout: string
  /** 标准错误输出 */
  stderr: string
  /** 退出码 */
  exitCode: number | null
}

/** 外部文件变更事件，由项目目录监听器推送 */
export interface ExternalFileChangeEvent {
  /** 变更文件的完整路径 */
  path: string
  /** 变更类型：add（新增）、change（修改）、unlink（删除） */
  type?: 'add' | 'change' | 'unlink'
}

/** 文件系统 API 接口，通过 preload 暴露给渲染进程 */
export interface FuleFileSystemAPI {
  /** 读取文件内容 */
  readFile: (filePath: string) => Promise<IPCResponse<FileReadResult>>
  /** 写入文件内容 */
  writeFile: (params: FileWriteParams) => Promise<IPCResponse<void>>
  /** 读取目录结构 */
  readDir: (dirPath: string) => Promise<IPCResponse<DirReadResult>>
  /** 监听文件变更 */
  watchFile: (filePath: string) => Promise<IPCResponse<void>>
  /** 取消文件监听 */
  unwatchFile: (filePath: string) => Promise<IPCResponse<void>>
  /** 注册文件变更回调，返回取消注册函数 */
  onFileChange: (callback: (event: FileWatchEvent) => void) => () => void
  /** 启动项目目录监听 */
  startProjectWatch: (dirPath: string) => Promise<IPCResponse<void>>
  /** 停止项目目录监听 */
  stopProjectWatch: () => Promise<IPCResponse<void>>
  /** 打开文件夹选择对话框，返回用户选择的目录路径 */
  openFolder: () => Promise<IPCResponse<string | null>>
  /** 注册外部文件变更回调，返回取消注册函数 */
  onExternalFileChange: (callback: (event: ExternalFileChangeEvent) => void) => () => void
}

/** PTY 创建参数 */
export interface PtyCreateParams {
  /** 会话唯一标识，由渲染进程生成 */
  sessionId: string
  /** 工作目录（可选，默认为用户主目录） */
  cwd?: string
  /** 初始列数 */
  cols?: number
  /** 初始行数 */
  rows?: number
}

/** PTY 写入参数 */
export interface PtyWriteParams {
  /** 会话 ID */
  sessionId: string
  /** 要写入的数据（用户键盘输入） */
  data: string
}

/** PTY 调整尺寸参数 */
export interface PtyResizeParams {
  /** 会话 ID */
  sessionId: string
  /** 新列数 */
  cols: number
  /** 新行数 */
  rows: number
}

/** PTY 输出数据事件，由主进程推送到渲染进程 */
export interface PtyDataEvent {
  /** 会话 ID */
  sessionId: string
  /** PTY 输出数据 */
  data: string
}

/** PTY API 接口，通过 preload 暴露给渲染进程 */
export interface FulePtyAPI {
  /** 创建新的 PTY 会话 */
  create: (params: PtyCreateParams) => Promise<IPCResponse<void>>
  /** 向 PTY 写入数据（用户键盘输入） */
  write: (params: PtyWriteParams) => Promise<IPCResponse<void>>
  /** 调整 PTY 尺寸 */
  resize: (params: PtyResizeParams) => Promise<IPCResponse<void>>
  /** 终止 PTY 会话 */
  kill: (sessionId: string) => Promise<IPCResponse<void>>
  /** 注册 PTY 输出数据回调，返回取消注册函数 */
  onData: (callback: (event: PtyDataEvent) => void) => () => void
}

/** 预览窗口 API 接口 */
export interface FulePreviewAPI {
  /** 在独立窗口中打开预览 URL */
  openWindow: (url: string) => Promise<IPCResponse<void>>
  /** 关闭预览窗口 */
  closeWindow: () => Promise<IPCResponse<void>>
  /** 监听预览窗口关闭事件 */
  onWindowClosed: (callback: () => void) => () => void
}

/** 通过 preload 暴露给渲染进程的完整 API 接口 */
export interface FuleAPI {
  /** 文件系统操作 */
  fs: FuleFileSystemAPI
  /** PTY 终端进程操作 */
  pty: FulePtyAPI
  /** 预览窗口管理 */
  preview: FulePreviewAPI
}
