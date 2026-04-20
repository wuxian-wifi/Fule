import { useCallback, useRef } from 'react'

import type { editor } from 'monaco-editor'

/**
 * 代码格式化 Hook，封装 Monaco Editor 内置的 formatDocument 动作
 *
 * @returns editorRef 绑定函数与格式化触发函数
 */
export function useFormatDocument(): {
  /** 绑定 Monaco Editor 实例，在 onMount 回调中调用 */
  setEditorRef: (instance: editor.IStandaloneCodeEditor) => void
  /** 触发当前编辑器的代码格式化 */
  formatDocument: () => void
} {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const setEditorRef = useCallback((instance: editor.IStandaloneCodeEditor) => {
    editorRef.current = instance
  }, [])

  const formatDocument = useCallback(() => {
    const editorInstance = editorRef.current
    if (!editorInstance) return

    // 触发 Monaco 内置的格式化文档动作
    editorInstance.getAction('editor.action.formatDocument')?.run()
  }, [])

  return { setEditorRef, formatDocument }
}
