/**
 * Property 6: Steering 规则合并与注入完整性 — 属性测试
 *
 * 验证：对任意全局和项目级规则集，合并后同 ID 规则应以项目级为准；
 * 系统提示词应包含所有有效规则的完整内容。
 *
 * **Validates: Requirements 4.2, 4.3**
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { mergeRules, buildSystemPrompt } from '@renderer/services/steering/steering-manager'

import type { SteeringRule, SteeringCategory, SteeringScope } from '@renderer/services/steering/steering-manager'

/** Steering 规则分类的 Arbitrary 生成器 */
const categoryArb: fc.Arbitrary<SteeringCategory> = fc.constantFrom(
  'component',
  'style',
  'api',
  'security',
  'custom'
)

/** Steering 规则的 Arbitrary 生成器 */
function steeringRuleArb(scope: SteeringScope): fc.Arbitrary<SteeringRule> {
  return fc.record({
    id: fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '3', '-'), {
      minLength: 1,
      maxLength: 8,
    }),
    scope: fc.constant(scope),
    category: categoryArb,
    content: fc.string({ minLength: 1, maxLength: 200 }),
    priority: fc.integer({ min: 0, max: 100 }),
    filePath: fc.constant(`/${scope}/rule.md`),
  })
}

describe('Property 6: Steering 规则合并与注入完整性', () => {
  it('合并后同 ID 规则应以项目级为准', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(steeringRuleArb('global'), { minLength: 0, maxLength: 10 }),
          fc.array(steeringRuleArb('project'), { minLength: 0, maxLength: 10 })
        ),
        ([globalRules, projectRules]) => {
          const merged = mergeRules(globalRules, projectRules)

          // 收集项目级规则的 ID 集合
          const projectIds = new Set(projectRules.map((r) => r.id))

          for (const rule of merged) {
            // 如果该 ID 在项目级规则中存在，合并结果应为项目级版本
            if (projectIds.has(rule.id)) {
              expect(rule.scope).toBe('project')
              // 找到项目级中最后一个同 ID 规则（后出现的覆盖先出现的）
              const projectVersion = [...projectRules].reverse().find((r) => r.id === rule.id)
              expect(rule.content).toBe(projectVersion!.content)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('合并后不应丢失任何唯一 ID 的规则', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(steeringRuleArb('global'), { minLength: 0, maxLength: 10 }),
          fc.array(steeringRuleArb('project'), { minLength: 0, maxLength: 10 })
        ),
        ([globalRules, projectRules]) => {
          const merged = mergeRules(globalRules, projectRules)

          // 所有出现过的唯一 ID 都应在合并结果中
          const allIds = new Set([
            ...globalRules.map((r) => r.id),
            ...projectRules.map((r) => r.id),
          ])
          const mergedIds = new Set(merged.map((r) => r.id))

          expect(mergedIds.size).toBe(allIds.size)
          for (const id of allIds) {
            expect(mergedIds.has(id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('合并结果应按优先级降序排列', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(steeringRuleArb('global'), { minLength: 0, maxLength: 10 }),
          fc.array(steeringRuleArb('project'), { minLength: 0, maxLength: 10 })
        ),
        ([globalRules, projectRules]) => {
          const merged = mergeRules(globalRules, projectRules)

          // 验证降序排列
          for (let i = 1; i < merged.length; i++) {
            expect(merged[i - 1].priority).toBeGreaterThanOrEqual(merged[i].priority)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('系统提示词应包含所有有效规则的完整内容', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.array(steeringRuleArb('global'), { minLength: 0, maxLength: 10 }),
          fc.array(steeringRuleArb('project'), { minLength: 0, maxLength: 10 })
        ),
        ([globalRules, projectRules]) => {
          const merged = mergeRules(globalRules, projectRules)
          const prompt = buildSystemPrompt(merged)

          if (merged.length === 0) {
            // 无规则时提示词应为空
            expect(prompt).toBe('')
            return
          }

          // 提示词应包含标题
          expect(prompt).toContain('# 强制规范约束（Steering Rules）')

          // 提示词应包含每条有效规则的内容和 ID
          for (const rule of merged) {
            expect(prompt).toContain(rule.content)
            expect(prompt).toContain(rule.id)
            expect(prompt).toContain(`[${rule.category.toUpperCase()}]`)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
