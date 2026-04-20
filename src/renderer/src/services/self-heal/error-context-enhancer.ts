/**
 * 错误上下文增强器
 * 为捕获的错误添加丰富的上下文信息，帮助 AI 理解问题并生成精准修复。
 * 增强内容包括：出错源文件内容、相关依赖文件、最近的 AI 修改记录、用户操作记录。
 */

import { useEditorStore } from '../../stores/editor-store'
import { useAppModeStore } from '../../stores/app-mode-store'

import type { CapturedError, ErrorContext } from '../error-interceptors/types'

/** 最多提取的相关依赖文件数量 */
const MAX_RELATED_IMPORTS = 3

/** 最多获取的最近 AI 修改记录数量 */
const MAX_RECENT_AI_CHANGES = 5

/** 最多获取的最近用户操作记录数量 */
const MAX_RECENT_ACTIONS = 10

/**
 * 从文件内容中提取 import 路径
 * 支持 ES Module 的 import 语句和 require 调用
 */
export function extractImportPaths(content: string): string[] {
  const imports: string[] = []

  // 匹配 ES Module import 语句：import ... from './path' 或 import './path'
  const esImportRegex = /import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = esImportRegex.exec(content)) !== null) {
    const importPath = match[1]
    // 只保留相对路径的导入（排除 node_modules 包）
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath)
    }
  }

  // 匹配 require 调用：require('./path')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  while ((match = requireRegex.exec(content)) !== null) {
    const importPath = match[1]
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      imports.push(importPath)
    }
  }

  return imports
}

/**
 * 尝试通过 IPC 读取源文件内容
 * 渲染进程不能直接访问文件系统，需要通过 preload 暴露的 API
 */
async function readSourceFile(filePath: string): Promise<string | null> {
  try {
    // 优先从 EditorStore 已打开的标签页中获取（更快且可能包含未保存的修改）
    const editorState = useEditorStore.getState()
    const openTab = editorState.openTabs.find(
      (tab) => tab.filePath === filePath || tab.filePath.endsWith(filePath),
    )
    if (openTab) {
      return openTab.content
    }

    // 通过 IPC 从磁盘读取
    if (typeof window !== 'undefined' && window.fuleAPI?.fs?.readFile) {
      const result = await window.fuleAPI.fs.readFile(filePath)
      if (result.success && result.data) {
        return result.data.content
      }
    }

    return null
  } catch {
    // 文件读取失败，返回 null 不阻塞增强流程
    return null
  }
}

/**
 * 从 EditorStore 获取最近的 AI 修改记录
 * 通过检查标签页的 isDirty 状态和内容变化来推断 AI 修改
 */
function getRecentAiChanges(): Array<{ file: string; diff: string }> {
  const editorState = useEditorStore.getState()
  const changes: Array<{ file: string; diff: string }> = []

  // 获取所有有未保存修改的标签页（可能包含 AI 修改）
  const dirtyTabs = editorState.openTabs.filter((tab) => tab.isDirty)

  for (const tab of dirtyTabs.slice(0, MAX_RECENT_AI_CHANGES)) {
    changes.push({
      file: tab.filePath,
      diff: `[文件已修改] ${tab.fileName}`,
    })
  }

  return changes
}

/**
 * 获取最近的用户操作记录
 * 从 EditorStore 中推断用户最近的编辑活动
 */
function getRecentUserActions(): string[] {
  const editorState = useEditorStore.getState()
  const actions: string[] = []

  // 记录当前打开的标签页作为用户活动上下文
  if (editorState.activeTabId) {
    const activeTab = editorState.openTabs.find(
      (t) => t.id === editorState.activeTabId,
    )
    if (activeTab) {
      actions.push(`正在编辑: ${activeTab.fileName}`)
    }
  }

  // 记录所有打开的文件
  for (const tab of editorState.openTabs.slice(0, MAX_RECENT_ACTIONS - 1)) {
    actions.push(`已打开: ${tab.fileName}`)
  }

  return actions
}

/**
 * 错误上下文增强器
 * 为捕获的错误添加上下文信息，帮助 AI 理解问题
 */
export class ErrorContextEnhancer {
  /**
   * 增强错误上下文
   * 读取源文件、分析依赖、获取 AI 修改记录和用户操作记录
   */
  async enhance(error: CapturedError): Promise<CapturedError> {
    const context: ErrorContext = {
      relatedFiles: [],
      recentActions: [],
      recentAiChanges: [],
      currentMode: useAppModeStore.getState().currentMode,
    }

    // 1. 如果有源文件，读取文件内容
    if (error.sourceFile) {
      const content = await readSourceFile(error.sourceFile)
      if (content) {
        context.relatedFiles.push({ path: error.sourceFile, content })

        // 2. 通过 import 分析找到相关依赖文件（最多 3 个）
        const importPaths = extractImportPaths(content)
        for (const importPath of importPaths.slice(0, MAX_RELATED_IMPORTS)) {
          const importContent = await readSourceFile(importPath)
          if (importContent) {
            context.relatedFiles.push({ path: importPath, content: importContent })
          }
        }
      }
    }

    // 3. 获取最近的 AI 修改记录（可能是 AI 引入的 bug）
    context.recentAiChanges = getRecentAiChanges()

    // 4. 获取最近的用户操作记录
    context.recentActions = getRecentUserActions()

    return { ...error, context }
  }
}
