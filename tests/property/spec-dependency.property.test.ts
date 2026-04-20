/**
 * Property 5: Spec 文档依赖过期检测 — 属性测试
 *
 * 验证：对任意 Spec 依赖图，当 Requirements 哈希变化后
 * 应检测到 Design 的 parentHash 不匹配
 *
 * **Validates: Requirements 3.2**
 */
import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'
import { SpecDocumentService } from '@renderer/services/spec/spec-document-service'

import type { SpecDependencyGraph } from '@renderer/services/spec/spec-document-service'

describe('Property 5: Spec 文档依赖过期检测', () => {
  let fingerprinter: FingerprintCalculator
  let service: SpecDocumentService

  beforeEach(async () => {
    fingerprinter = new FingerprintCalculator()
    await fingerprinter.init()
    service = new SpecDocumentService(fingerprinter)
  })

  it('当 Requirements 哈希变化后，应检测到 Design 的 parentHash 不匹配', () => {
    fc.assert(
      fc.property(
        fc.record({
          reqContent: fc.string({ minLength: 1 }),
          designContent: fc.string({ minLength: 1 }),
          taskContent: fc.string({ minLength: 1 }),
          newReqContent: fc.string({ minLength: 1 }),
        }),
        ({ reqContent, designContent, taskContent, newReqContent }) => {
          // 构建一致的依赖图
          const requirements = service.createDocument('requirements', reqContent)
          const design = service.createDocument('design', designContent, requirements.hash)
          const tasks = service.createDocument('tasks', taskContent, design.hash)

          // 初始状态应一致
          const initialReport = service.checkConsistency({ requirements, design, tasks })
          expect(initialReport.isConsistent).toBe(true)

          // 更新 Requirements 内容
          const updatedReq = service.updateDocument(requirements, newReqContent)

          // 如果新内容哈希与旧内容哈希不同，应检测到 Design 过期
          if (updatedReq.hash !== requirements.hash) {
            const graph: SpecDependencyGraph = {
              requirements: updatedReq,
              design,
              tasks,
            }
            const report = service.checkConsistency(graph)

            expect(report.isConsistent).toBe(false)
            // 应至少包含一个 requirements → design 的过期问题
            const designIssue = report.issues.find(
              (i) => i.source === 'requirements' && i.target === 'design'
            )
            expect(designIssue).toBeDefined()
            expect(designIssue!.type).toBe('stale_dependency')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('当 Design 哈希变化后，应检测到 Tasks 的 parentHash 不匹配', () => {
    fc.assert(
      fc.property(
        fc.record({
          reqContent: fc.string({ minLength: 1 }),
          designContent: fc.string({ minLength: 1 }),
          taskContent: fc.string({ minLength: 1 }),
          newDesignContent: fc.string({ minLength: 1 }),
        }),
        ({ reqContent, designContent, taskContent, newDesignContent }) => {
          // 构建一致的依赖图
          const requirements = service.createDocument('requirements', reqContent)
          const design = service.createDocument('design', designContent, requirements.hash)
          const tasks = service.createDocument('tasks', taskContent, design.hash)

          // 更新 Design 内容（保持与 Requirements 的链接）
          const updatedDesign = service.updateDocument(design, newDesignContent, requirements.hash)

          // 如果新内容哈希与旧内容哈希不同，应检测到 Tasks 过期
          if (updatedDesign.hash !== design.hash) {
            const graph: SpecDependencyGraph = {
              requirements,
              design: updatedDesign,
              tasks,
            }
            const report = service.checkConsistency(graph)

            // Tasks.parentHash 仍指向旧 design.hash，应不匹配
            const taskIssue = report.issues.find(
              (i) => i.source === 'design' && i.target === 'tasks'
            )
            expect(taskIssue).toBeDefined()
            expect(taskIssue!.type).toBe('stale_dependency')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('对任意哈希组合，parentHash 匹配时应报告一致，不匹配时应报告过期', () => {
    fc.assert(
      fc.property(
        fc.record({
          reqHash: fc.hexaString({ minLength: 8, maxLength: 16 }),
          designParentHash: fc.hexaString({ minLength: 8, maxLength: 16 }),
          designHash: fc.hexaString({ minLength: 8, maxLength: 16 }),
          taskParentHash: fc.hexaString({ minLength: 8, maxLength: 16 }),
        }),
        ({ reqHash, designParentHash, designHash, taskParentHash }) => {
          // 直接构造带指定哈希的文档，绕过 FingerprintCalculator
          const now = Date.now()
          const graph: SpecDependencyGraph = {
            requirements: {
              type: 'requirements',
              version: 1,
              content: '',
              hash: reqHash,
              createdAt: now,
              updatedAt: now,
            },
            design: {
              type: 'design',
              version: 1,
              content: '',
              hash: designHash,
              parentHash: designParentHash,
              createdAt: now,
              updatedAt: now,
            },
            tasks: {
              type: 'tasks',
              version: 1,
              content: '',
              hash: 'task-hash',
              parentHash: taskParentHash,
              createdAt: now,
              updatedAt: now,
            },
          }

          const report = service.checkConsistency(graph)

          // 验证 Design 依赖检测
          const designStale = designParentHash !== reqHash
          const designIssue = report.issues.find(
            (i) => i.source === 'requirements' && i.target === 'design'
          )
          if (designStale) {
            expect(designIssue).toBeDefined()
          } else {
            expect(designIssue).toBeUndefined()
          }

          // 验证 Tasks 依赖检测
          const tasksStale = taskParentHash !== designHash
          const taskIssue = report.issues.find(
            (i) => i.source === 'design' && i.target === 'tasks'
          )
          if (tasksStale) {
            expect(taskIssue).toBeDefined()
          } else {
            expect(taskIssue).toBeUndefined()
          }

          // isConsistent 应与两个检查结果一致
          expect(report.isConsistent).toBe(!designStale && !tasksStale)
        }
      ),
      { numRuns: 100 }
    )
  })
})
