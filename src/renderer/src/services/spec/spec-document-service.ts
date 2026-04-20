/**
 * Spec 模式文档服务
 *
 * 管理 Requirements → Design → Tasks 三级规范文档的版本控制与依赖追溯。
 * 每个文档通过内容哈希建立依赖链，当上游文档变更时可检测下游文档是否过期。
 */
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'

/** Spec 文档类型 */
export type SpecDocumentType = 'requirements' | 'design' | 'tasks'

/**
 * Spec 文档数据模型
 * 通过 hash 和 parentHash 建立文档间的依赖追溯链
 */
export interface SpecDocument {
  /** 文档类型：requirements / design / tasks */
  type: SpecDocumentType
  /** 文档版本号，每次更新递增 */
  version: number
  /** 文档内容（Markdown 格式） */
  content: string
  /** 文档内容的哈希指纹 */
  hash: string
  /** 上游文档的哈希指纹，用于依赖追溯（requirements 无 parentHash） */
  parentHash?: string
  /** 创建时间戳 */
  createdAt: number
  /** 最后更新时间戳 */
  updatedAt: number
}

/** 一致性问题类型 */
export type ConsistencyIssueType = 'stale_dependency'

/** 一致性检查发现的问题 */
export interface ConsistencyIssue {
  /** 问题类型 */
  type: ConsistencyIssueType
  /** 上游文档类型 */
  source: SpecDocumentType
  /** 下游文档类型 */
  target: SpecDocumentType
  /** 问题描述 */
  message: string
}

/** 一致性检查报告 */
export interface ConsistencyReport {
  /** 发现的问题列表 */
  issues: ConsistencyIssue[]
  /** 是否一致（无问题） */
  isConsistent: boolean
}

/** Spec 文档依赖图，包含三级文档 */
export interface SpecDependencyGraph {
  /** 需求文档 */
  requirements: SpecDocument
  /** 设计文档，parentHash 应指向 requirements.hash */
  design: SpecDocument
  /** 任务文档，parentHash 应指向 design.hash */
  tasks: SpecDocument
}

/** 代码与 Spec 冲突检测结果 */
export interface ConflictResult {
  /** 是否存在冲突需要阻止代码应用 */
  blocked: boolean
  /** 冲突详情列表 */
  conflicts: string[]
  /** AI 给出的修复建议 */
  suggestion?: string
}

/** AI 代码变更信息（用于冲突检测） */
export interface CodeChange {
  /** 变更文件路径 */
  filePath: string
  /** 原始内容 */
  originalContent: string
  /** 修改后内容 */
  modifiedContent: string
}

/**
 * Spec 文档服务
 *
 * 负责创建 Spec 文档、检查依赖链一致性、检测代码与 Spec 冲突。
 * 使用 FingerprintCalculator 计算内容哈希，确保依赖追溯的准确性。
 */
export class SpecDocumentService {
  /** 指纹计算器实例 */
  private fingerprinter: FingerprintCalculator

  constructor(fingerprinter: FingerprintCalculator) {
    this.fingerprinter = fingerprinter
  }

  /**
   * 创建新的 Spec 文档
   *
   * @param type - 文档类型
   * @param content - 文档内容
   * @param parentHash - 上游文档哈希（requirements 不需要）
   * @returns 新创建的 SpecDocument
   */
  createDocument(
    type: SpecDocumentType,
    content: string,
    parentHash?: string
  ): SpecDocument {
    const now = Date.now()
    const hash = this.fingerprinter.calculate(content)

    return {
      type,
      version: 1,
      content,
      hash,
      parentHash,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * 更新已有 Spec 文档的内容
   * 版本号递增，重新计算哈希，可选更新 parentHash
   *
   * @param doc - 原文档
   * @param newContent - 新内容
   * @param newParentHash - 新的上游文档哈希（可选）
   * @returns 更新后的 SpecDocument
   */
  updateDocument(
    doc: SpecDocument,
    newContent: string,
    newParentHash?: string
  ): SpecDocument {
    const hash = this.fingerprinter.calculate(newContent)

    return {
      ...doc,
      version: doc.version + 1,
      content: newContent,
      hash,
      parentHash: newParentHash ?? doc.parentHash,
      updatedAt: Date.now(),
    }
  }

  /**
   * 检查 Spec 文档依赖链的一致性
   *
   * 验证规则：
   * - Design.parentHash 必须等于 Requirements.hash
   * - Tasks.parentHash 必须等于 Design.hash
   *
   * 任一不匹配即报告过期依赖问题
   */
  checkConsistency(graph: SpecDependencyGraph): ConsistencyReport {
    const issues: ConsistencyIssue[] = []

    // 检查 Design 是否与 Requirements 同步
    if (graph.design.parentHash !== graph.requirements.hash) {
      issues.push({
        type: 'stale_dependency',
        source: 'requirements',
        target: 'design',
        message: 'Requirements 已更新，Design 可能需要同步修改',
      })
    }

    // 检查 Tasks 是否与 Design 同步
    if (graph.tasks.parentHash !== graph.design.hash) {
      issues.push({
        type: 'stale_dependency',
        source: 'design',
        target: 'tasks',
        message: 'Design 已更新，Tasks 可能需要同步修改',
      })
    }

    return {
      issues,
      isConsistent: issues.length === 0,
    }
  }

  /**
   * AI 代码与 Spec 冲突检测
   *
   * 通过比较代码变更与 Spec 文档内容，判断是否存在冲突。
   * 实际生产环境中会调用 AI 后端进行语义分析，
   * 此处提供基础的结构化检测接口。
   *
   * @param codeChange - 代码变更信息
   * @param graph - 当前 Spec 依赖图
   * @param analyzeConflict - AI 冲突分析回调（可注入）
   * @returns 冲突检测结果
   */
  async validateCodeAgainstSpec(
    codeChange: CodeChange,
    graph: SpecDependencyGraph,
    analyzeConflict?: (params: {
      codeChange: CodeChange
      requirements: string
      design: string
    }) => Promise<{ hasConflict: boolean; conflicts: string[]; suggestion?: string }>
  ): Promise<ConflictResult> {
    // 先检查 Spec 依赖链是否一致，不一致时发出警告
    const consistency = this.checkConsistency(graph)

    if (!consistency.isConsistent) {
      return {
        blocked: true,
        conflicts: consistency.issues.map((issue) => issue.message),
        suggestion: '请先更新 Spec 文档依赖链，确保 Requirements → Design → Tasks 一致后再提交代码变更',
      }
    }

    // 如果提供了 AI 分析回调，使用 AI 进行语义冲突检测
    if (analyzeConflict) {
      const analysis = await analyzeConflict({
        codeChange,
        requirements: graph.requirements.content,
        design: graph.design.content,
      })

      if (analysis.hasConflict) {
        return {
          blocked: true,
          conflicts: analysis.conflicts,
          suggestion: analysis.suggestion,
        }
      }
    }

    return { blocked: false, conflicts: [] }
  }
}
