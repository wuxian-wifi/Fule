/**
 * Steering 规范约束管理器
 *
 * 加载全局（~/.fule/steering/）和项目级（.fule/steering/）规则文件，
 * 实现规则合并（项目级覆盖同 ID 全局规则）和系统提示词注入。
 * Steering 规则作为最高优先级系统提示词注入 AI 上下文，
 * 确保 AI 生成的代码严格遵循团队规范。
 */

/** Steering 规则作用域 */
export type SteeringScope = 'global' | 'project'

/** Steering 规则分类 */
export type SteeringCategory = 'component' | 'style' | 'api' | 'security' | 'custom'

/**
 * Steering 规则数据模型
 * 每条规则包含唯一 ID、作用域、分类、内容和优先级
 */
export interface SteeringRule {
  /** 规则唯一标识，用于合并时的覆盖判定 */
  id: string
  /** 规则作用域：global（全局）或 project（项目级） */
  scope: SteeringScope
  /** 规则分类 */
  category: SteeringCategory
  /** 规则内容（Markdown 格式） */
  content: string
  /** 优先级，数字越大越优先（用于排序） */
  priority: number
  /** 规则文件路径 */
  filePath: string
}

/**
 * 规则文件加载器接口
 * 通过依赖注入解耦文件系统访问，便于测试
 */
export interface RuleLoader {
  /** 加载指定目录下的所有规则文件 */
  loadRulesFromDir: (dirPath: string, scope: SteeringScope) => Promise<SteeringRule[]>
}

/**
 * Steering 规范约束管理器
 *
 * 核心职责：
 * 1. 加载全局和项目级 Steering 规则
 * 2. 合并规则（项目级覆盖同 ID 全局规则）
 * 3. 将有效规则注入 AI 上下文作为最高优先级系统提示词
 */
export class SteeringManager {
  /** 全局规则目录路径（~/.fule/steering/） */
  private globalRulesDir: string
  /** 项目级规则目录路径（.fule/steering/） */
  private projectRulesDir: string
  /** 规则文件加载器 */
  private loader: RuleLoader

  constructor(globalRulesDir: string, projectRulesDir: string, loader: RuleLoader) {
    this.globalRulesDir = globalRulesDir
    this.projectRulesDir = projectRulesDir
    this.loader = loader
  }

  /**
   * 获取合并后的有效规则集
   *
   * 合并逻辑：
   * 1. 先加载全局规则，以 id 为键存入 Map
   * 2. 再加载项目级规则，同 id 的规则覆盖全局规则
   * 3. 按优先级降序排列（数字越大越优先）
   *
   * @returns 合并后的有效规则列表，按优先级降序排列
   */
  async getEffectiveRules(): Promise<SteeringRule[]> {
    const globalRules = await this.loader.loadRulesFromDir(this.globalRulesDir, 'global')
    const projectRules = await this.loader.loadRulesFromDir(this.projectRulesDir, 'project')

    return mergeRules(globalRules, projectRules)
  }

  /**
   * 将 Steering 规则注入 AI 上下文，生成最高优先级系统提示词
   *
   * @param rules - 有效规则列表（通常由 getEffectiveRules 返回）
   * @returns 格式化的系统提示词字符串
   */
  buildSystemPrompt(rules: SteeringRule[]): string {
    return buildSystemPrompt(rules)
  }
}

/**
 * 合并全局和项目级规则
 *
 * 项目级规则覆盖同 ID 的全局规则，最终按优先级降序排列。
 * 这是一个纯函数，便于独立测试。
 *
 * @param globalRules - 全局规则列表
 * @param projectRules - 项目级规则列表
 * @returns 合并后的规则列表
 */
export function mergeRules(
  globalRules: SteeringRule[],
  projectRules: SteeringRule[]
): SteeringRule[] {
  const merged = new Map<string, SteeringRule>()

  // 先放入全局规则
  for (const rule of globalRules) {
    merged.set(rule.id, rule)
  }

  // 项目级规则覆盖同 ID 的全局规则
  for (const rule of projectRules) {
    merged.set(rule.id, rule)
  }

  // 按优先级降序排列
  return [...merged.values()].sort((a, b) => b.priority - a.priority)
}

/**
 * 将 Steering 规则格式化为系统提示词
 *
 * 生成的提示词包含标题、说明和所有规则的分类内容，
 * 作为 AI 请求的最高优先级系统提示词。
 *
 * @param rules - 有效规则列表
 * @returns 格式化的系统提示词
 */
export function buildSystemPrompt(rules: SteeringRule[]): string {
  if (rules.length === 0) {
    return ''
  }

  const sections = rules.map(
    (rule) => `### [${rule.category.toUpperCase()}] ${rule.id}\n${rule.content}`
  )

  return [
    '# 强制规范约束（Steering Rules）',
    '以下规则具有最高优先级，生成的所有代码必须严格遵循：',
    '',
    ...sections,
  ].join('\n')
}
