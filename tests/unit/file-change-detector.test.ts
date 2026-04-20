import { describe, it, expect } from 'vitest'

import { shouldPromptReload } from '@renderer/utils/file-change-detector'

describe('shouldPromptReload', () => {
  it('内容不同时应返回 true', () => {
    expect(shouldPromptReload('新内容', '旧内容')).toBe(true)
  })

  it('内容相同时应返回 false', () => {
    expect(shouldPromptReload('相同内容', '相同内容')).toBe(false)
  })

  it('磁盘内容为空而编辑器有内容时应返回 true', () => {
    expect(shouldPromptReload('', 'some content')).toBe(true)
  })

  it('编辑器内容为空而磁盘有内容时应返回 true', () => {
    expect(shouldPromptReload('some content', '')).toBe(true)
  })

  it('两者都为空字符串时应返回 false', () => {
    expect(shouldPromptReload('', '')).toBe(false)
  })

  it('仅空白字符差异时应返回 true', () => {
    expect(shouldPromptReload('hello world', 'hello  world')).toBe(true)
  })

  it('仅换行符差异时应返回 true', () => {
    expect(shouldPromptReload('line1\nline2', 'line1\r\nline2')).toBe(true)
  })
})
