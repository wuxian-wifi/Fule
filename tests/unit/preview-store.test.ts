/**
 * 预览面板状态管理 Store 单元测试
 * 测试错误状态的添加、清除等操作
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { usePreviewStore } from '@renderer/stores/preview-store'

describe('PreviewStore 错误状态管理', () => {
  beforeEach(() => {
    // 每个测试前重置 store 状态
    const store = usePreviewStore.getState()
    store.clearPreviewErrors()
    store.setPreviewUrl(null)
    store.setIsRunning(false)
  })

  it('初始状态下 previewErrors 应为空数组', () => {
    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors).toEqual([])
  })

  it('addPreviewError 应添加一条错误并自动生成 id 和 timestamp', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({
      type: 'TypeError',
      message: 'Cannot read property of undefined',
      stack: 'at App.tsx:10',
    })

    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors).toHaveLength(1)
    expect(previewErrors[0].type).toBe('TypeError')
    expect(previewErrors[0].message).toBe('Cannot read property of undefined')
    expect(previewErrors[0].stack).toBe('at App.tsx:10')
    // 自动生成的字段
    expect(previewErrors[0].id).toBeTruthy()
    expect(previewErrors[0].timestamp).toBeGreaterThan(0)
  })

  it('多次 addPreviewError 应按顺序追加错误', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({ type: 'Error', message: '第一个错误' })
    store.addPreviewError({ type: 'SyntaxError', message: '第二个错误' })
    store.addPreviewError({ type: 'ReferenceError', message: '第三个错误' })

    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors).toHaveLength(3)
    expect(previewErrors[0].message).toBe('第一个错误')
    expect(previewErrors[1].message).toBe('第二个错误')
    expect(previewErrors[2].message).toBe('第三个错误')
  })

  it('每条错误应有唯一的 id', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({ type: 'Error', message: '错误 A' })
    store.addPreviewError({ type: 'Error', message: '错误 B' })

    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors[0].id).not.toBe(previewErrors[1].id)
  })

  it('clearPreviewErrors 应清除所有错误', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({ type: 'Error', message: '错误 1' })
    store.addPreviewError({ type: 'Error', message: '错误 2' })
    expect(usePreviewStore.getState().previewErrors).toHaveLength(2)

    store.clearPreviewErrors()
    expect(usePreviewStore.getState().previewErrors).toEqual([])
  })

  it('addPreviewError 应正确保留可选字段 sourceFile 和 lineNumber', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({
      type: 'CompileError',
      message: 'Unexpected token',
      sourceFile: 'src/App.tsx',
      lineNumber: 42,
    })

    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors[0].sourceFile).toBe('src/App.tsx')
    expect(previewErrors[0].lineNumber).toBe(42)
  })

  it('addPreviewError 不传可选字段时应为 undefined', () => {
    const store = usePreviewStore.getState()

    store.addPreviewError({
      type: 'Error',
      message: '简单错误',
    })

    const { previewErrors } = usePreviewStore.getState()
    expect(previewErrors[0].stack).toBeUndefined()
    expect(previewErrors[0].sourceFile).toBeUndefined()
    expect(previewErrors[0].lineNumber).toBeUndefined()
  })
})
