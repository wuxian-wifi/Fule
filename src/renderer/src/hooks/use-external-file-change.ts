import { useEffect, useState, useCallback } from 'react'

import { useEditorStore } from '../stores/editor-store'
import { shouldPromptReload } from '../utils/file-change-detector'

import type { ExternalFileChangeEvent } from '@shared/types'

/** 外部文件变更提示信息 */
export interface FileChangePrompt {
  /** 变更文件的完整路径 */
  filePath: string
  /** 磁盘上的最新内容 */
  diskContent: string
}

/**
 * 监听外部文件变更的自定义 Hook
 * 当检测到已打开的文件在 Fule 外部被修改且内容不同时，
 * 返回需要提示用户的变更信息，供 UI 层展示重载对话框。
 */
export function useExternalFileChange(): {
  /** 当前待处理的文件变更提示，为 null 表示无待处理变更 */
  prompt: FileChangePrompt | null
  /** 用户选择重新加载：用磁盘内容替换编辑器内容 */
  handleReload: () => void
  /** 用户选择保留当前：忽略本次外部变更 */
  handleKeep: () => void
} {
  const [prompt, setPrompt] = useState<FileChangePrompt | null>(null)

  useEffect(() => {
    // 浏览器环境下 fuleAPI 不存在（仅 Electron preload 注入），跳过
    if (typeof window === 'undefined' || !window.fuleAPI?.fs?.onExternalFileChange) {
      return
    }

    const unsubscribe = window.fuleAPI.fs.onExternalFileChange(
      async (event: ExternalFileChangeEvent) => {
        const { openTabs } = useEditorStore.getState()
        // 检查变更文件是否在编辑器中打开
        const tab = openTabs.find((t) => t.filePath === event.path)
        if (!tab) return

        // 读取磁盘上的最新内容
        const result = await window.fuleAPI.fs.readFile(event.path)
        if (!result.success || !result.data) return

        const diskContent = result.data.content
        // 比较磁盘内容与编辑器内容，不同时才提示
        if (shouldPromptReload(diskContent, tab.content)) {
          setPrompt({ filePath: event.path, diskContent })
        }
      }
    )

    return unsubscribe
  }, [])

  const handleReload = useCallback(() => {
    if (!prompt) return
    const { updateTabContent, markTabClean } = useEditorStore.getState()
    // 用磁盘内容替换编辑器内容并标记为未修改
    updateTabContent(prompt.filePath, prompt.diskContent)
    markTabClean(prompt.filePath)
    setPrompt(null)
  }, [prompt])

  const handleKeep = useCallback(() => {
    setPrompt(null)
  }, [])

  return { prompt, handleReload, handleKeep }
}
