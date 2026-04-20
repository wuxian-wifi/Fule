import { describe, it, expect } from 'vitest'

import { detectLanguage } from '@renderer/utils/language-detector'

describe('detectLanguage - 语言检测工具', () => {
  it('应根据 .ts 扩展名返回 typescript', () => {
    expect(detectLanguage('src/main.ts')).toBe('typescript')
  })

  it('应根据 .tsx 扩展名返回 typescript', () => {
    expect(detectLanguage('components/App.tsx')).toBe('typescript')
  })

  it('应根据 .js 扩展名返回 javascript', () => {
    expect(detectLanguage('index.js')).toBe('javascript')
  })

  it('应根据 .jsx 扩展名返回 javascript', () => {
    expect(detectLanguage('Component.jsx')).toBe('javascript')
  })

  it('应根据 .html 扩展名返回 html', () => {
    expect(detectLanguage('index.html')).toBe('html')
  })

  it('应根据 .css 扩展名返回 css', () => {
    expect(detectLanguage('styles.css')).toBe('css')
  })

  it('应根据 .json 扩展名返回 json', () => {
    expect(detectLanguage('package.json')).toBe('json')
  })

  it('应根据 .md 扩展名返回 markdown', () => {
    expect(detectLanguage('README.md')).toBe('markdown')
  })

  it('应根据 .py 扩展名返回 python', () => {
    expect(detectLanguage('script.py')).toBe('python')
  })

  it('应根据 .yaml 扩展名返回 yaml', () => {
    expect(detectLanguage('config.yaml')).toBe('yaml')
  })

  it('应识别特殊文件名 Dockerfile', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile')
  })

  it('应识别特殊文件名 Makefile', () => {
    expect(detectLanguage('Makefile')).toBe('shell')
  })

  it('应对空字符串返回 plaintext', () => {
    expect(detectLanguage('')).toBe('plaintext')
  })

  it('应对无扩展名的未知文件返回 plaintext', () => {
    expect(detectLanguage('unknownfile')).toBe('plaintext')
  })

  it('应对未知扩展名返回 plaintext', () => {
    expect(detectLanguage('file.xyz')).toBe('plaintext')
  })

  it('应正确处理包含多层目录的完整路径', () => {
    expect(detectLanguage('src/renderer/src/components/editor/code-editor.tsx')).toBe('typescript')
  })

  it('应正确处理 Windows 风格的反斜杠路径', () => {
    expect(detectLanguage('src\\renderer\\App.tsx')).toBe('typescript')
  })

  it('应对文件名大小写不敏感（Dockerfile 大写首字母）', () => {
    expect(detectLanguage('dockerfile')).toBe('dockerfile')
  })
})
