import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { shouldPromptReload } from '@renderer/utils/file-change-detector'

/**
 * Property 11: 外部文件变更检测
 * 验证: 需求 9.3
 *
 * 对任意 editorContent 和 diskContent，
 * 当两者不同时应触发重载提示；相同时不应触发。
 */
describe('Property 11: 外部文件变更检测', () => {
  it('当磁盘内容与编辑器内容不同时，应返回 true 触发重载提示', () => {
    /**
     * Validates: Requirements 9.3
     */
    fc.assert(
      fc.property(
        fc.record({ editorContent: fc.string(), diskContent: fc.string() }),
        ({ editorContent, diskContent }) => {
          // 仅在两者确实不同时验证
          fc.pre(diskContent !== editorContent)
          expect(shouldPromptReload(diskContent, editorContent)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('当磁盘内容与编辑器内容相同时，应返回 false 不触发重载提示', () => {
    /**
     * Validates: Requirements 9.3
     */
    fc.assert(
      fc.property(
        fc.string(),
        (content) => {
          // 相同内容传入两个参数
          expect(shouldPromptReload(content, content)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
