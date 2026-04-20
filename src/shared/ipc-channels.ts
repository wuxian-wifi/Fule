/**
 * IPC channel constants for communication between main and renderer processes.
 * All IPC communication must go through these predefined channels via contextBridge.
 */
export const IPC_CHANNELS = {
  // File system operations
  'fs:read': 'fs:read',
  'fs:write': 'fs:write',
  'fs:readDir': 'fs:readDir',
  'fs:watch': 'fs:watch',
  'fs:unwatch': 'fs:unwatch',
  'fs:startProjectWatch': 'fs:startProjectWatch',
  'fs:stopProjectWatch': 'fs:stopProjectWatch',
  'fs:openFolder': 'fs:openFolder',

  // 预览窗口管理
  'preview:openWindow': 'preview:openWindow',
  'preview:closeWindow': 'preview:closeWindow',

  // Command execution
  'cmd:execute': 'cmd:execute',
  'cmd:approve': 'cmd:approve',
  'cmd:reject': 'cmd:reject',
  'cmd:kill': 'cmd:kill',

  // Process management
  'proc:list': 'proc:list',
  'proc:kill': 'proc:kill',
  'proc:output': 'proc:output',

  // AI backend
  'ai:chat': 'ai:chat',
  'ai:abort': 'ai:abort',
  'ai:models': 'ai:models',
  'ai:health': 'ai:health',

  // Plugin system
  'plugin:install': 'plugin:install',
  'plugin:uninstall': 'plugin:uninstall',
  'plugin:enable': 'plugin:enable',
  'plugin:disable': 'plugin:disable',

  // PTY 终端进程管理
  'pty:create': 'pty:create',
  'pty:write': 'pty:write',
  'pty:resize': 'pty:resize',
  'pty:kill': 'pty:kill'
} as const

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
