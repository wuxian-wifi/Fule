---
inclusion: always
---

# 代码风格与命名规范

## 语言与类型

- 所有源代码必须使用 TypeScript 编写，启用 `strict: true`
- 禁止使用 `any` 类型，必须使用明确的类型定义或 `unknown`
- 优先使用 `interface` 定义对象类型，仅在需要联合类型或映射类型时使用 `type`
- 所有导出的函数和类必须有 JSDoc 注释，注释内容使用中文
- 关键业务逻辑、复杂算法和非显而易见的代码段必须添加中文行内注释
- 接口和类型定义的每个字段必须有中文注释说明用途
- 禁止无意义的注释（如 `// 设置变量`），注释应解释"为什么"而非"做了什么"

## 命名规范

- 文件名：kebab-case（如 `file-explorer.tsx`、`sync-engine.ts`）
- React 组件文件：kebab-case 但组件名使用 PascalCase（如 `chat-view.tsx` 导出 `ChatView`）
- 接口名：PascalCase，不加 `I` 前缀（如 `EditorState` 而非 `IEditorState`）
- 类型别名：PascalCase（如 `AppMode`、`SyncOrigin`）
- 枚举：PascalCase，枚举值使用 UPPER_SNAKE_CASE（如 `RiskLevel.CRITICAL`）
- 常量：UPPER_SNAKE_CASE（如 `DEBOUNCE_WINDOW`、`MAX_DELAY`）
- 函数和变量：camelCase
- React 组件：PascalCase
- 事件处理函数：`handle` 前缀（如 `handleModeSwitch`、`handleFileChange`）
- 布尔变量：`is`/`has`/`should` 前缀（如 `isSwitching`、`hasConflict`）

## 代码组织

- 每个文件只导出一个主要的类、函数或组件
- 相关的类型定义放在同一文件或相邻的 `types.ts` 文件中
- 禁止循环依赖
- import 顺序：外部库 → 内部模块 → 相对路径 → 类型导入（使用 `import type`）
