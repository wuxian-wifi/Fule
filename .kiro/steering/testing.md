---
inclusion: always
---

# 测试规范

## 框架与工具

- 单元测试和属性测试统一使用 Vitest
- 属性测试使用 fast-check 库
- 禁止使用 Jest、Mocha 或其他测试框架

## 文件命名与组织

- 单元测试文件：`tests/unit/<模块名>.test.ts`
- 属性测试文件：`tests/property/<模块名>.property.test.ts`
- 测试文件名必须与被测模块文件名对应（如 `operation-tracker.ts` → `operation-tracker.test.ts`）
- 测试辅助函数和 mock 放在 `tests/helpers/` 目录下

## 属性测试规范

- 每个属性测试必须在 `describe` 块中注明对应的 Property 编号和名称
- 格式：`describe('Property {编号}: {属性名称}', () => { ... })`
- 每个属性测试最少运行 100 次迭代（`fc.assert(fc.property(...), { numRuns: 100 })`）
- 属性测试的 `it` 描述必须使用中文说明测试的不变量
- 生成器（Arbitrary）应尽量覆盖边界情况（空字符串、特殊字符、极大值等）

## 单元测试规范

- 使用 `describe` + `it` 组织测试，`it` 描述使用中文
- 每个测试只验证一个行为
- 使用 `vi.fn()` 和 `vi.spyOn()` 进行 mock，禁止手动实现 mock 类
- 异步测试必须使用 `async/await`，禁止使用回调风格

## 覆盖率要求

- 核心模块（状态管理、同步引擎、Command Gateway、自愈引擎）：行覆盖率 ≥ 80%
- 工具函数和纯逻辑模块：行覆盖率 ≥ 90%
- UI 组件：不强制覆盖率，但关键交互逻辑需有测试

## 注释要求

- 测试文件中的 `describe` 和 `it` 描述使用中文
- 复杂的测试设置（arrange）阶段需添加中文注释说明意图
