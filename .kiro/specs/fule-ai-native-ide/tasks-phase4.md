# Phase 4：AI 对话框重构与 Vibe/Spec 模式实现

## 概述

Phase 1-3 完成了基础框架、双向同步和 Command Gateway。Phase 4 的核心目标是重构 AI 对话框，正确实现 Vibe/Spec 双模式对话，接入 AI 后端，并修复布局架构问题。

## 前置状态

- 567 个测试全部通过，12 个正确性属性测试通过
- Electron 应用可正常启动，编辑器、终端（node-pty）、预览面板均可用
- AI 后端协议层已实现（OpenAI SSE、Ollama NDJSON）但未接入真实服务
- 当前 Vibe/Spec 实现有误：被当成布局模式而非对话模式

## 核心问题

当前实现把 Vibe 和 Spec 当成两个不同的面板布局模式，这是错误的。
正确理解：Vibe 和 Spec 是同一个 AI 对话框的两种对话模式（区别在于 system prompt 和工作流）。

## 正确的布局架构

```
┌──────────────────────────────────────────────────────────┐
│ Fule IDE  📂打开          [终端] [预览] [💬]              │
├────────┬──────────────────┬──────────┬───────────────────┤
│        │                  │          │ 💬 AI [Vibe|Spec] │
│ 文件   │   Monaco Editor  │  预览面板 │                   │
│ 资源   │                  │ (独立)   │  对话消息列表...    │
│ 管理器 │                  │          │                   │
│        │                  │          │ [输入框]   [发送]  │
├────────┴──────────────────┴──────────┴───────────────────┤
│ 终端面板                                                  │
└──────────────────────────────────────────────────────────┘
```

- 预览面板、对话面板、终端面板三者完全独立，各自有显隐按钮
- 💬 按钮（对话气泡图标）控制对话面板显隐
- Vibe/Spec 切换在对话面板内部顶部，不在全局标题栏

## 任务

---

- [ ] 1. 布局重构：对话面板独立化
  - [ ] 1.1 删除 SpecPanel 组件（`src/renderer/src/components/layout/spec-panel.tsx`）
  - [ ] 1.2 删除 ModeSwitch 组件（`src/renderer/src/components/layout/mode-switch.tsx`）
  - [ ] 1.3 LayoutManager 右上角按钮改为 [终端] [预览] [💬] 三个独立切换
    - 💬 按钮使用对话气泡 SVG 图标
    - 点击切换对话面板显隐，行为与终端/预览按钮一致
  - [ ] 1.4 对话面板作为独立的右侧面板渲染，不绑定任何模式
    - 在 LayoutSnapshot 中添加 `chatPanelVisible` 和 `chatPanelWidth` 字段
    - 对话面板可与预览面板同时显示（并排）
  - [ ] 1.5 预览面板在两种模式下都可用（已部分完成，确认无残留的模式绑定逻辑）

- [ ] 2. ChatView 重构：内置 Vibe/Spec 模式切换
  - [ ] 2.1 对话面板顶部添加模式切换 UI
    - 标题区：💬 AI 对话 + [Vibe | Spec] 切换 tab
    - 当前激活模式高亮显示
    - 切换模式时保留对话历史（已有 ConversationStore 支持）
  - [ ] 2.2 Spec 模式下对话面板显示当前 spec 文档列表
    - 从项目的 `.fule/specs/` 目录动态扫描
    - 显示 feature 名称和文档状态（requirements ✓ / design ✓ / tasks ✗）
    - 点击文档名在编辑器中打开
  - [ ] 2.3 Spec 模式下支持创建新 spec
    - 对话开始时提示输入 feature name（或 AI 自动提取）
    - 自动创建 `.fule/specs/{feature-name}/` 目录

- [ ] 3. Prompt 模板服务
  - [ ] 3.1 创建 `src/renderer/src/services/ai-backend/prompt-templates.ts`
    - `buildVibeSystemPrompt(steeringRules, contextFiles)` — Vibe 模式 system prompt
    - `buildSpecSystemPrompt(steeringRules, contextFiles, existingSpecDocs, featureName)` — Spec 模式 system prompt
  - [ ] 3.2 Vibe 模式 prompt：AI 直接根据意图修改代码，注入 steering 规范和上下文文件
  - [ ] 3.3 Spec 模式 prompt：AI 按 Requirements → Design → Tasks 流程工作，每步暂停等待确认

- [ ] 4. ChatView 接入 AI 后端
  - [ ] 4.1 handleSend 改为调用 UnifiedAIBackend.chat()
    - 根据当前模式构造 system prompt
    - 通过 SteeringManager 加载 steering 规范
    - 通过 ContextTrimmingEngine 加载上下文文件
    - Spec 模式下加载已有 spec 文档内容
  - [ ] 4.2 流式响应处理
    - 调用 UnifiedAIBackend.chat() 获取 AsyncIterable<string>
    - 逐 token 更新 ConversationStore.streamingState
    - 完成后将完整响应存为 assistant 消息
  - [ ] 4.3 AI 响应解析与应用
    - Vibe 模式：解析代码块（```language ... ```），提取文件路径和内容，应用到编辑器
    - Spec 模式：解析文档内容，保存到 `.fule/specs/{feature}/` 对应文件

- [ ] 5. Spec 文档管理服务
  - [ ] 5.1 创建 Spec 文件管理器（扫描 `.fule/specs/` 目录）
    - 列出所有 feature 目录
    - 检查每个 feature 下的文档完成状态
  - [ ] 5.2 Spec 文档 CRUD
    - 创建 feature 目录
    - 读取/写入 requirements.md、design.md、tasks.md
    - 通过 IPC 调用主进程文件系统 API
  - [ ] 5.3 Steering 文件管理
    - 扫描 `.fule/steering/` 目录
    - 加载所有 .md 规范文件内容
    - 注入到 AI 对话的 system prompt 中

- [ ] 6. 设置页面
  - [ ] 6.1 创建设置面板组件 `src/renderer/src/components/common/settings-panel.tsx`
    - AI 提供商选择（OpenAI 兼容 / Ollama）
    - API 端点地址输入
    - API Key 输入（通过 safeStorage 加密存储）
    - 模型名称选择/输入
    - 温度参数滑块
    - 最大 token 数输入
  - [ ] 6.2 设置入口
    - 右上角添加 ⚙️ 齿轮图标按钮
    - 点击打开设置面板（模态弹窗或侧边面板）
  - [ ] 6.3 设置持久化
    - 使用 electron-store 存储非敏感配置
    - API Key 通过 safeStorage 加密存储（已有 steering 规范要求）

- [ ] 7. Phase 4 检查点
  - 验证对话面板独立显隐，不绑定 Vibe/Spec 模式
  - 验证 Vibe/Spec 切换在对话面板内部，切换后对话历史保留
  - 验证 Spec 模式下可扫描和显示 `.fule/specs/` 目录内容
  - 验证设置页面可配置 AI 提供商
  - 验证接入 AI 后端后对话可正常流式响应（需要用户提供 API Key 测试）

## 备注

- 两种模式的核心区别是 system prompt 不同，不是代码架构不同
- Vibe prompt：直接修改代码，快速迭代
- Spec prompt：按 Requirements → Design → Tasks 流程，每步暂停等待确认
- Steering 规范在两种模式下都生效（作为最高优先级 system prompt 注入）
- 预览面板、终端面板与对话模式完全无关
