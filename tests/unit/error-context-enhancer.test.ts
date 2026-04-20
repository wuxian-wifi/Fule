/**
 * 错误上下文增强器单元测试
 * 验证 ErrorContextEnhancer 的源文件读取、import 分析、AI 修改记录获取和用户操作记录获取逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ErrorType } from '@renderer/services/error-interceptors/types'

import type { CapturedError, ErrorContext } from '@renderer/services/error-interceptors/types'
import type { TabInfo } from '@renderer/stores/editor-store'

/** 可变的 mock 状态，测试中直接修改此对象来控制 store 返回值 */
const mockEditorState: { openTabs: TabInfo[]; activeTabId: string | null } = {
  openTabs: [],
  activeTabId: null,
}

// mock EditorStore — 通过共享的 mockEditorState 对象控制返回值
vi.mock('@renderer/stores/editor-store', () => ({
  useEditorStore: {
    getState: () => mockEditorState,
  },
}))

// mock AppModeStore
vi.mock('@renderer/stores/app-mode-store', () => ({
  useAppModeStore: {
    getState: () => ({ currentMode: 'vibe' as const }),
  },
}))

/** 创建测试用的 CapturedError */
function createTestError(overrides: Partial<CapturedError> = {}): CapturedError {
  const defaultContext: ErrorContext = {
    relatedFiles: [],
    recentActions: [],
    recentAiChanges: [],
    currentMode: 'vibe',
  }

  return {
    id: 'err-test-1',
    type: ErrorType.RUNTIME_EXCEPTION,
    message: 'Cannot read property of undefined',
    stack: 'TypeError: Cannot read property of undefined\n    at App.tsx:42',
    sourceFile: 'src/App.tsx',
    sourceLine: 42,
    timestamp: Date.now(),
    fingerprint: 'fp-test-abc',
    context: defaultContext,
    raw: {},
    ...overrides,
  }
}

/** 创建测试用的 TabInfo */
function createTestTab(overrides: Partial<TabInfo> = {}): TabInfo {
  return {
    id: 'src/App.tsx',
    filePath: 'src/App.tsx',
    fileName: 'App.tsx',
    content: 'const App = () => <div>Hello</div>',
    isDirty: false,
    language: 'typescript',
    ...overrides,
  }
}

describe('ErrorContextEnhancer', () => {
  let enhancer: InstanceType<typeof import('@renderer/services/self-heal/error-context-enhancer').ErrorContextEnhancer>
  let extractImportPaths: typeof import('@renderer/services/self-heal/error-context-enhancer').extractImportPaths

  beforeEach(async () => {
    // 重置 mock 状态
    mockEditorState.openTabs = []
    mockEditorState.activeTabId = null

    // 设置 window.fuleAPI mock
    const mockReadFile = vi.fn().mockResolvedValue({
      success: false,
      data: null,
    })

    // 使用 globalThis 设置 window 对象（Node 环境下）
    ;(globalThis as Record<string, unknown>).window = {
      fuleAPI: {
        fs: {
          readFile: mockReadFile,
        },
      },
    }

    // 动态导入以确保 mock 已生效
    const mod = await import('@renderer/services/self-heal/error-context-enhancer')
    enhancer = new mod.ErrorContextEnhancer()
    extractImportPaths = mod.extractImportPaths
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('enhance', () => {
    it('无源文件时应返回空的 relatedFiles', async () => {
      const error = createTestError({ sourceFile: undefined })
      const result = await enhancer.enhance(error)

      expect(result.context.relatedFiles).toEqual([])
    })

    it('有源文件且在 EditorStore 中打开时应读取标签页内容', async () => {
      // 在 EditorStore 中添加已打开的标签页
      const sourceContent = 'import React from "react"\nconst App = () => <div />'
      mockEditorState.openTabs = [
        createTestTab({ filePath: 'src/App.tsx', content: sourceContent }),
      ]

      const error = createTestError({ sourceFile: 'src/App.tsx' })
      const result = await enhancer.enhance(error)

      // 应包含源文件内容
      expect(result.context.relatedFiles.length).toBeGreaterThanOrEqual(1)
      expect(result.context.relatedFiles[0]).toEqual({
        path: 'src/App.tsx',
        content: sourceContent,
      })
    })

    it('源文件不在 EditorStore 中时应通过 IPC 读取', async () => {
      const diskContent = 'export default function App() { return null }'
      const mockReadFile = (globalThis as Record<string, unknown> & { window: { fuleAPI: { fs: { readFile: ReturnType<typeof vi.fn> } } } }).window.fuleAPI.fs.readFile
      mockReadFile.mockResolvedValue({
        success: true,
        data: { content: diskContent, path: 'src/App.tsx' },
      })

      const error = createTestError({ sourceFile: 'src/App.tsx' })
      const result = await enhancer.enhance(error)

      expect(result.context.relatedFiles.length).toBeGreaterThanOrEqual(1)
      expect(result.context.relatedFiles[0]).toEqual({
        path: 'src/App.tsx',
        content: diskContent,
      })
    })

    it('应通过 import 分析找到相关依赖文件（最多 3 个）', async () => {
      // 源文件包含多个 import
      const sourceContent = [
        "import { helper } from './utils/helper'",
        "import { config } from './config'",
        "import { api } from './services/api'",
        "import { extra } from './extra'",
        'const App = () => <div />',
      ].join('\n')

      mockEditorState.openTabs = [
        createTestTab({ filePath: 'src/App.tsx', content: sourceContent }),
        createTestTab({
          id: './utils/helper',
          filePath: './utils/helper',
          fileName: 'helper.ts',
          content: 'export const helper = () => {}',
        }),
        createTestTab({
          id: './config',
          filePath: './config',
          fileName: 'config.ts',
          content: 'export const config = {}',
        }),
        createTestTab({
          id: './services/api',
          filePath: './services/api',
          fileName: 'api.ts',
          content: 'export const api = {}',
        }),
        createTestTab({
          id: './extra',
          filePath: './extra',
          fileName: 'extra.ts',
          content: 'export const extra = {}',
        }),
      ]

      const error = createTestError({ sourceFile: 'src/App.tsx' })
      const result = await enhancer.enhance(error)

      // 源文件 + 最多 3 个依赖文件 = 最多 4 个
      expect(result.context.relatedFiles.length).toBeLessThanOrEqual(4)
      // 至少包含源文件本身
      expect(result.context.relatedFiles[0].path).toBe('src/App.tsx')
    })

    it('应获取最近的 AI 修改记录（isDirty 的标签页）', async () => {
      mockEditorState.openTabs = [
        createTestTab({ filePath: 'src/App.tsx', fileName: 'App.tsx', isDirty: true }),
        createTestTab({
          id: 'src/utils.ts',
          filePath: 'src/utils.ts',
          fileName: 'utils.ts',
          isDirty: true,
        }),
        createTestTab({
          id: 'src/clean.ts',
          filePath: 'src/clean.ts',
          fileName: 'clean.ts',
          isDirty: false,
        }),
      ]

      const error = createTestError({ sourceFile: undefined })
      const result = await enhancer.enhance(error)

      // 应包含 isDirty 的标签页作为 AI 修改记录
      expect(result.context.recentAiChanges.length).toBe(2)
      expect(result.context.recentAiChanges[0].file).toBe('src/App.tsx')
      expect(result.context.recentAiChanges[1].file).toBe('src/utils.ts')
    })

    it('应获取最近的用户操作记录', async () => {
      mockEditorState.activeTabId = 'src/App.tsx'
      mockEditorState.openTabs = [
        createTestTab({ id: 'src/App.tsx', filePath: 'src/App.tsx', fileName: 'App.tsx' }),
        createTestTab({
          id: 'src/utils.ts',
          filePath: 'src/utils.ts',
          fileName: 'utils.ts',
        }),
      ]

      const error = createTestError({ sourceFile: undefined })
      const result = await enhancer.enhance(error)

      // 应包含当前编辑文件和已打开文件
      expect(result.context.recentActions.length).toBeGreaterThan(0)
      expect(result.context.recentActions[0]).toContain('App.tsx')
    })

    it('应设置当前模式到上下文中', async () => {
      const error = createTestError({ sourceFile: undefined })
      const result = await enhancer.enhance(error)

      expect(result.context.currentMode).toBe('vibe')
    })

    it('IPC 读取失败时不应阻塞增强流程', async () => {
      const mockReadFile = (globalThis as Record<string, unknown> & { window: { fuleAPI: { fs: { readFile: ReturnType<typeof vi.fn> } } } }).window.fuleAPI.fs.readFile
      mockReadFile.mockRejectedValue(new Error('IPC 通信失败'))

      const error = createTestError({ sourceFile: 'src/nonexistent.tsx' })
      const result = await enhancer.enhance(error)

      // 不应抛出异常，relatedFiles 为空
      expect(result.context.relatedFiles).toEqual([])
    })

    it('应返回增强后的错误副本，不修改原始错误', async () => {
      const error = createTestError({ sourceFile: undefined })
      const originalContext = { ...error.context }

      const result = await enhancer.enhance(error)

      // 原始错误的 context 不应被修改
      expect(error.context).toEqual(originalContext)
      // 返回的是新对象
      expect(result).not.toBe(error)
    })
  })

  describe('extractImportPaths', () => {
    it('应提取 ES Module import 路径', () => {
      const content = [
        "import { useState } from 'react'",
        "import { helper } from './utils/helper'",
        "import type { Config } from './types'",
      ].join('\n')

      const paths = extractImportPaths(content)

      // 只保留相对路径，排除 node_modules 包
      expect(paths).toContain('./utils/helper')
      expect(paths).toContain('./types')
      expect(paths).not.toContain('react')
    })

    it('应提取 require 调用路径', () => {
      const content = [
        "const fs = require('fs')",
        "const helper = require('./helper')",
        "const config = require('./config/index')",
      ].join('\n')

      const paths = extractImportPaths(content)

      expect(paths).toContain('./helper')
      expect(paths).toContain('./config/index')
      expect(paths).not.toContain('fs')
    })

    it('应提取默认导入路径', () => {
      const content = "import App from './App'"

      const paths = extractImportPaths(content)

      expect(paths).toContain('./App')
    })

    it('应提取副作用导入路径', () => {
      const content = "import './styles.css'"

      const paths = extractImportPaths(content)

      expect(paths).toContain('./styles.css')
    })

    it('空内容应返回空数组', () => {
      expect(extractImportPaths('')).toEqual([])
    })

    it('无 import 语句时应返回空数组', () => {
      const content = 'const x = 1\nconst y = 2'
      expect(extractImportPaths(content)).toEqual([])
    })

    it('应排除 node_modules 包（非相对路径）', () => {
      const content = [
        "import React from 'react'",
        "import { render } from 'react-dom'",
        "import lodash from 'lodash'",
      ].join('\n')

      const paths = extractImportPaths(content)

      expect(paths).toEqual([])
    })

    it('应支持绝对路径导入', () => {
      const content = "import { util } from '/src/utils'"

      const paths = extractImportPaths(content)

      expect(paths).toContain('/src/utils')
    })
  })
})
