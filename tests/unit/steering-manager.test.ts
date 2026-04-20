/**
 * Steering 规范约束管理器单元测试
 *
 * 测试规则合并逻辑、系统提示词生成和 SteeringManager 集成
 */
import { describe, it, expect, vi } from 'vitest'
import {
  SteeringManager,
  mergeRules,
  buildSystemPrompt,
} from '@renderer/services/steering/steering-manager'

import type { SteeringRule, RuleLoader } from '@renderer/services/steering/steering-manager'

/** 创建测试用规则的辅助函数 */
function createRule(overrides: Partial<SteeringRule> = {}): SteeringRule {
  return {
    id: 'test-rule',
    scope: 'global',
    category: 'style',
    content: '测试规则内容',
    priority: 1,
    filePath: '/path/to/rule.md',
    ...overrides,
  }
}

describe('mergeRules', () => {
  it('无规则时应返回空数组', () => {
    const result = mergeRules([], [])
    expect(result).toHaveLength(0)
  })

  it('只有全局规则时应全部返回', () => {
    const globalRules = [
      createRule({ id: 'rule-1', scope: 'global' }),
      createRule({ id: 'rule-2', scope: 'global' }),
    ]
    const result = mergeRules(globalRules, [])
    expect(result).toHaveLength(2)
  })

  it('只有项目级规则时应全部返回', () => {
    const projectRules = [
      createRule({ id: 'rule-1', scope: 'project' }),
    ]
    const result = mergeRules([], projectRules)
    expect(result).toHaveLength(1)
    expect(result[0].scope).toBe('project')
  })

  it('同 ID 规则应以项目级为准', () => {
    const globalRules = [
      createRule({ id: 'shared-rule', scope: 'global', content: '全局内容' }),
    ]
    const projectRules = [
      createRule({ id: 'shared-rule', scope: 'project', content: '项目内容' }),
    ]

    const result = mergeRules(globalRules, projectRules)

    expect(result).toHaveLength(1)
    expect(result[0].scope).toBe('project')
    expect(result[0].content).toBe('项目内容')
  })

  it('不同 ID 的规则应全部保留', () => {
    const globalRules = [createRule({ id: 'global-only', scope: 'global' })]
    const projectRules = [createRule({ id: 'project-only', scope: 'project' })]

    const result = mergeRules(globalRules, projectRules)

    expect(result).toHaveLength(2)
    const ids = result.map((r) => r.id)
    expect(ids).toContain('global-only')
    expect(ids).toContain('project-only')
  })

  it('应按优先级降序排列', () => {
    const globalRules = [
      createRule({ id: 'low', priority: 1 }),
      createRule({ id: 'high', priority: 10 }),
    ]
    const projectRules = [
      createRule({ id: 'mid', priority: 5, scope: 'project' }),
    ]

    const result = mergeRules(globalRules, projectRules)

    expect(result[0].id).toBe('high')
    expect(result[1].id).toBe('mid')
    expect(result[2].id).toBe('low')
  })
})

describe('buildSystemPrompt', () => {
  it('无规则时应返回空字符串', () => {
    const prompt = buildSystemPrompt([])
    expect(prompt).toBe('')
  })

  it('应包含标题和说明', () => {
    const rules = [createRule({ id: 'test', content: '内容' })]
    const prompt = buildSystemPrompt(rules)

    expect(prompt).toContain('# 强制规范约束（Steering Rules）')
    expect(prompt).toContain('最高优先级')
  })

  it('应包含所有规则的内容', () => {
    const rules = [
      createRule({ id: 'rule-a', category: 'style', content: '样式规则A' }),
      createRule({ id: 'rule-b', category: 'api', content: 'API规则B' }),
    ]
    const prompt = buildSystemPrompt(rules)

    expect(prompt).toContain('样式规则A')
    expect(prompt).toContain('API规则B')
  })

  it('应包含规则分类标签', () => {
    const rules = [
      createRule({ id: 'sec-rule', category: 'security', content: '安全规则' }),
    ]
    const prompt = buildSystemPrompt(rules)

    expect(prompt).toContain('[SECURITY]')
    expect(prompt).toContain('sec-rule')
  })

  it('应包含每条规则的 ID', () => {
    const rules = [
      createRule({ id: 'my-rule-1', content: '内容1' }),
      createRule({ id: 'my-rule-2', content: '内容2' }),
    ]
    const prompt = buildSystemPrompt(rules)

    expect(prompt).toContain('my-rule-1')
    expect(prompt).toContain('my-rule-2')
  })
})

describe('SteeringManager', () => {
  it('getEffectiveRules 应合并全局和项目级规则', async () => {
    // 模拟规则加载器
    const mockLoader: RuleLoader = {
      loadRulesFromDir: vi.fn().mockImplementation((dir: string, scope: string) => {
        if (scope === 'global') {
          return Promise.resolve([
            createRule({ id: 'shared', scope: 'global', content: '全局' }),
            createRule({ id: 'global-only', scope: 'global' }),
          ])
        }
        return Promise.resolve([
          createRule({ id: 'shared', scope: 'project', content: '项目' }),
          createRule({ id: 'project-only', scope: 'project' }),
        ])
      }),
    }

    const manager = new SteeringManager('~/.fule/steering', '.fule/steering', mockLoader)
    const rules = await manager.getEffectiveRules()

    // 共 3 条规则（shared 被项目级覆盖）
    expect(rules).toHaveLength(3)
    const sharedRule = rules.find((r) => r.id === 'shared')
    expect(sharedRule!.scope).toBe('project')
    expect(sharedRule!.content).toBe('项目')
  })

  it('buildSystemPrompt 应正确生成提示词', () => {
    const mockLoader: RuleLoader = {
      loadRulesFromDir: vi.fn().mockResolvedValue([]),
    }
    const manager = new SteeringManager('~/.fule/steering', '.fule/steering', mockLoader)

    const rules = [createRule({ id: 'test', category: 'component', content: '使用 React' })]
    const prompt = manager.buildSystemPrompt(rules)

    expect(prompt).toContain('[COMPONENT]')
    expect(prompt).toContain('使用 React')
  })
})
