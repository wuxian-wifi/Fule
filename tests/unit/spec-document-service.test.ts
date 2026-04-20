/**
 * Spec 文档服务单元测试
 *
 * 测试 SpecDocumentService 的文档创建、更新、一致性检查和冲突检测功能
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'
import {
  SpecDocumentService,
  type SpecDependencyGraph,
  type SpecDocument,
} from '@renderer/services/spec/spec-document-service'

describe('SpecDocumentService', () => {
  let fingerprinter: FingerprintCalculator
  let service: SpecDocumentService

  beforeEach(async () => {
    fingerprinter = new FingerprintCalculator()
    await fingerprinter.init()
    service = new SpecDocumentService(fingerprinter)
  })

  describe('createDocument', () => {
    it('应正确创建 requirements 文档', () => {
      const doc = service.createDocument('requirements', '# 需求文档')

      expect(doc.type).toBe('requirements')
      expect(doc.version).toBe(1)
      expect(doc.content).toBe('# 需求文档')
      expect(doc.hash).toBeTruthy()
      expect(doc.parentHash).toBeUndefined()
      expect(doc.createdAt).toBeGreaterThan(0)
      expect(doc.updatedAt).toBe(doc.createdAt)
    })

    it('应正确创建带 parentHash 的 design 文档', () => {
      const reqDoc = service.createDocument('requirements', '# 需求')
      const designDoc = service.createDocument('design', '# 设计', reqDoc.hash)

      expect(designDoc.type).toBe('design')
      expect(designDoc.parentHash).toBe(reqDoc.hash)
    })

    it('相同内容应生成相同哈希', () => {
      const doc1 = service.createDocument('requirements', '相同内容')
      const doc2 = service.createDocument('requirements', '相同内容')

      expect(doc1.hash).toBe(doc2.hash)
    })

    it('不同内容应生成不同哈希', () => {
      const doc1 = service.createDocument('requirements', '内容A')
      const doc2 = service.createDocument('requirements', '内容B')

      expect(doc1.hash).not.toBe(doc2.hash)
    })
  })

  describe('updateDocument', () => {
    it('应递增版本号并更新哈希', () => {
      const doc = service.createDocument('requirements', '原始内容')
      const updated = service.updateDocument(doc, '更新后内容')

      expect(updated.version).toBe(2)
      expect(updated.content).toBe('更新后内容')
      expect(updated.hash).not.toBe(doc.hash)
      expect(updated.updatedAt).toBeGreaterThanOrEqual(doc.updatedAt)
    })

    it('应保留原有 parentHash 当未提供新值时', () => {
      const reqDoc = service.createDocument('requirements', '需求')
      const designDoc = service.createDocument('design', '设计', reqDoc.hash)
      const updated = service.updateDocument(designDoc, '新设计')

      expect(updated.parentHash).toBe(reqDoc.hash)
    })

    it('应更新 parentHash 当提供新值时', () => {
      const reqDoc = service.createDocument('requirements', '需求')
      const designDoc = service.createDocument('design', '设计', reqDoc.hash)
      const newReqDoc = service.updateDocument(reqDoc, '新需求')
      const updated = service.updateDocument(designDoc, '新设计', newReqDoc.hash)

      expect(updated.parentHash).toBe(newReqDoc.hash)
    })
  })

  describe('checkConsistency', () => {
    /** 构建一致的依赖图 */
    function buildConsistentGraph(): SpecDependencyGraph {
      const requirements = service.createDocument('requirements', '# 需求文档')
      const design = service.createDocument('design', '# 设计文档', requirements.hash)
      const tasks = service.createDocument('tasks', '# 任务文档', design.hash)
      return { requirements, design, tasks }
    }

    it('一致的依赖图应返回无问题', () => {
      const graph = buildConsistentGraph()
      const report = service.checkConsistency(graph)

      expect(report.isConsistent).toBe(true)
      expect(report.issues).toHaveLength(0)
    })

    it('Requirements 变更后应检测到 Design 过期', () => {
      const graph = buildConsistentGraph()
      // 模拟 Requirements 被更新，哈希变化
      const updatedReq = service.updateDocument(graph.requirements, '# 新需求')
      graph.requirements = updatedReq

      const report = service.checkConsistency(graph)

      expect(report.isConsistent).toBe(false)
      expect(report.issues).toHaveLength(1)
      expect(report.issues[0].source).toBe('requirements')
      expect(report.issues[0].target).toBe('design')
      expect(report.issues[0].type).toBe('stale_dependency')
    })

    it('Design 变更后应检测到 Tasks 过期', () => {
      const graph = buildConsistentGraph()
      // 模拟 Design 被更新，哈希变化
      const updatedDesign = service.updateDocument(graph.design, '# 新设计')
      graph.design = updatedDesign

      const report = service.checkConsistency(graph)

      // Design 哈希变了，Tasks.parentHash 不匹配
      expect(report.isConsistent).toBe(false)
      const taskIssue = report.issues.find((i) => i.target === 'tasks')
      expect(taskIssue).toBeDefined()
      expect(taskIssue!.source).toBe('design')
    })

    it('Requirements 和 Design 都变更后应检测到两个问题', () => {
      const graph = buildConsistentGraph()
      graph.requirements = service.updateDocument(graph.requirements, '# 新需求')
      graph.design = service.updateDocument(graph.design, '# 新设计')

      const report = service.checkConsistency(graph)

      expect(report.isConsistent).toBe(false)
      expect(report.issues).toHaveLength(2)
    })
  })

  describe('validateCodeAgainstSpec', () => {
    it('依赖链一致且无 AI 分析时应返回无冲突', async () => {
      const requirements = service.createDocument('requirements', '# 需求')
      const design = service.createDocument('design', '# 设计', requirements.hash)
      const tasks = service.createDocument('tasks', '# 任务', design.hash)
      const graph: SpecDependencyGraph = { requirements, design, tasks }

      const result = await service.validateCodeAgainstSpec(
        { filePath: 'src/app.ts', originalContent: 'old', modifiedContent: 'new' },
        graph
      )

      expect(result.blocked).toBe(false)
      expect(result.conflicts).toHaveLength(0)
    })

    it('依赖链不一致时应阻止代码变更', async () => {
      const requirements = service.createDocument('requirements', '# 需求')
      const design = service.createDocument('design', '# 设计', 'wrong-hash')
      const tasks = service.createDocument('tasks', '# 任务', design.hash)
      const graph: SpecDependencyGraph = { requirements, design, tasks }

      const result = await service.validateCodeAgainstSpec(
        { filePath: 'src/app.ts', originalContent: 'old', modifiedContent: 'new' },
        graph
      )

      expect(result.blocked).toBe(true)
      expect(result.conflicts.length).toBeGreaterThan(0)
    })

    it('AI 检测到冲突时应阻止代码变更', async () => {
      const requirements = service.createDocument('requirements', '# 需求')
      const design = service.createDocument('design', '# 设计', requirements.hash)
      const tasks = service.createDocument('tasks', '# 任务', design.hash)
      const graph: SpecDependencyGraph = { requirements, design, tasks }

      // 模拟 AI 检测到冲突
      const mockAnalyze = async () => ({
        hasConflict: true,
        conflicts: ['代码使用了 Redux，但 Spec 要求使用 Zustand'],
        suggestion: '请将状态管理替换为 Zustand',
      })

      const result = await service.validateCodeAgainstSpec(
        { filePath: 'src/store.ts', originalContent: 'old', modifiedContent: 'new' },
        graph,
        mockAnalyze
      )

      expect(result.blocked).toBe(true)
      expect(result.conflicts).toContain('代码使用了 Redux，但 Spec 要求使用 Zustand')
      expect(result.suggestion).toBe('请将状态管理替换为 Zustand')
    })

    it('AI 未检测到冲突时应放行', async () => {
      const requirements = service.createDocument('requirements', '# 需求')
      const design = service.createDocument('design', '# 设计', requirements.hash)
      const tasks = service.createDocument('tasks', '# 任务', design.hash)
      const graph: SpecDependencyGraph = { requirements, design, tasks }

      const mockAnalyze = async () => ({
        hasConflict: false,
        conflicts: [],
      })

      const result = await service.validateCodeAgainstSpec(
        { filePath: 'src/app.ts', originalContent: 'old', modifiedContent: 'new' },
        graph,
        mockAnalyze
      )

      expect(result.blocked).toBe(false)
    })
  })
})
