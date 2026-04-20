import { useCallback } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'

import { detectLanguage } from '@renderer/utils/language-detector'
import { useFormatDocument } from '@renderer/hooks/use-format-document'

import type { editor } from 'monaco-editor'

/** CodeEditor 组件的 props 接口 */
interface CodeEditorProps {
  /** 当前编辑的文件路径，用于自动检测语言 */
  filePath?: string
  /** 编辑器初始内容 */
  content?: string
  /** 显式指定语言，优先级高于文件路径推断 */
  language?: string
  /** 内容变更回调 */
  onChange?: (value: string) => void
  /** 编辑器挂载完成回调，暴露编辑器实例供外部使用 */
  onEditorReady?: (instance: editor.IStandaloneCodeEditor) => void
}

/**
 * 核心代码编辑器组件，封装 Monaco Editor 提供语法高亮、智能补全与格式化能力
 */
function CodeEditor({
  filePath = '',
  content = '',
  language,
  onChange,
  onEditorReady,
}: CodeEditorProps): React.JSX.Element {
  const { setEditorRef, formatDocument } = useFormatDocument()

  // 语言优先使用显式传入值，否则根据文件路径自动检测
  const resolvedLanguage = language ?? detectLanguage(filePath)

  const handleMount: OnMount = useCallback(
    (editorInstance) => {
      setEditorRef(editorInstance)

      // 注册 Shift+Alt+F 快捷键触发格式化
      editorInstance.addAction({
        id: 'fule.formatDocument',
        label: '格式化文档',
        keybindings: [],
        run: () => {
          formatDocument()
        },
      })

      onEditorReady?.(editorInstance)
    },
    [setEditorRef, formatDocument, onEditorReady]
  )

  const handleChange = useCallback(
    (value: string | undefined) => {
      onChange?.(value ?? '')
    },
    [onChange]
  )

  return (
    <div className="h-full w-full overflow-hidden">
      <Editor
        key={filePath}
        value={content}
        path={filePath}
        language={resolvedLanguage}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleMount}
        loading={<div className="flex h-full items-center justify-center text-sm text-gray-500">加载编辑器…</div>}
        options={{
          /** 启用小地图预览 */
          minimap: { enabled: true },
          /** 自动换行 */
          wordWrap: 'on',
          /** 字号 */
          fontSize: 14,
          /** 行号 */
          lineNumbers: 'on',
          /** 自动缩进 */
          autoIndent: 'full',
          /** 括号匹配高亮 */
          bracketPairColorization: { enabled: true },
          /** 平滑滚动 */
          smoothScrolling: true,
          /** 光标平滑动画 */
          cursorSmoothCaretAnimation: 'on',
          /** Tab 大小 */
          tabSize: 2,
          /** 自动补全 */
          suggestOnTriggerCharacters: true,
          /** 参数提示 */
          parameterHints: { enabled: true },
          /** 代码折叠 */
          folding: true,
          /** 滚动超出最后一行 */
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  )
}

export default CodeEditor
