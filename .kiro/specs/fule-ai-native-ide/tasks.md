# 实现计划：Fule AI 原生 IDE

## 概述

本实现计划将 Fule AI 原生 IDE 的设计拆分为三个递进阶段：Phase 1 搭建基础框架与双模式 UI，Phase 2 集成 WebContainer 核心与双向同步逻辑，Phase 3 实现 Command Gateway 与 AI 自愈闭环。每个阶段结束后设置检查点，确保增量验证。

技术栈：React + TypeScript + Tailwind CSS + Electron + Monaco Editor + Zustand + Vitest + fast-check

## 任务

---

### Phase 1：基础框架与双模式 UI

- [x] 1. 初始化 Electron 项目脚手架
  - [x] 1.1 创建 Electron + React + TypeScript + Tailwind CSS 项目结构
    - 使用 electron-vite 或 electron-forge 初始化项目
    - 配置 TypeScript 严格模式、Tailwind CSS、ESLint
    - 配置 Vitest + fast-check 测试框架
    - 设置 Electron 主进程与渲染进程的 contextBridge 安全通信
    - 定义 IPC 通道常量（`fs:read`, `fs:write`, `fs:watch`, `cmd:execute` 等）
    - _需求: 12.1, 12.2_

  - [x] 1.2 实现文件系统 IPC 操作层
    - 在主进程中实现 `fs:read`、`fs:write`、`fs:watch`、`fs:unwatch` 的 IPC handler
    - 在渲染进程中通过 preload 脚本暴露类型安全的文件系统 API
    - 实现统一的 IPC 错误包装（`createIPCHandler`）
    - _需求: 6.1, 12.2_

- [x] 2. Monaco Editor 深度集成
  - [x] 2.1 集成 Monaco Editor 核心编辑能力
    - 安装并配置 `@monaco-editor/react`
    - 实现主流语言的语法高亮与智能补全
    - 实现代码格式化功能
    - _需求: 9.1_

  - [x] 2.2 实现多标签页管理与文件资源管理器
    - 实现 `TabManager` 组件：多标签页打开、关闭、切换
    - 实现 `FileExplorer` 树形文件资源管理器组件
    - 实现全局搜索替换功能
    - _需求: 9.2_

  - [x] 2.3 实现外部文件变更检测
    - 使用 chokidar 在主进程监听项目目录
    - 当文件在 Fule 外部被修改时，比较磁盘内容与编辑器内容
    - 内容不同时弹出重载提示（Reload / Keep）
    - _需求: 9.3_

  - [x] 2.4 编写属性测试：外部文件变更检测
    - **Property 11: 外部文件变更检测**
    - 对任意 editorContent 和 diskContent，当两者不同时应触发重载提示；相同时不应触发
    - 使用 `fc.record({ editorContent: fc.string(), diskContent: fc.string() })` 生成器
    - **验证: 需求 9.3**

- [x] 3. 双模式切换与状态管理
  - [x] 3.1 实现 Zustand 全局状态存储
    - 创建 `AppModeState`（当前模式 + 布局快照 + 切换锁）
    - 创建 `EditorState`（打开的标签页 + dirty buffers + 撤销栈 + 光标位置）
    - 创建 `ConversationState`（对话池 + 模式活跃对话指针 + 流式状态）
    - 创建 `TerminalState`（终端会话 + 环形输出缓冲区）
    - 创建 `PreviewState`（预览 URL + 运行状态）
    - 配置 Zustand persist 中间件将对话历史持久化到 IndexedDB
    - _需求: 1.1, 1.4_

  - [x] 3.2 实现模式切换状态机与 `switchMode` 算法
    - 实现 `captureLayoutSnapshot` 快照当前布局
    - 实现 `applyLayoutSnapshot` 恢复目标模式布局
    - 实现流式响应暂停/恢复（`pauseStreamingUI` / `resumeStreamingUI`）
    - 实现对话指针保存/恢复（`saveActiveConversation` / `restoreActiveConversation`）
    - 实现防重入锁（`isSwitching`）
    - _需求: 1.1, 1.4_

  - [x] 3.3 实现模式切换 UI 控件与面板联动
    - 实现 `ModeSwitch` 控件组件（Vibe / Spec 切换按钮）
    - Vibe 模式：隐藏规范文档面板，展开对话与极简编辑视图
    - Spec 模式：展开 Requirements、Design、Tasks 树形规范面板
    - 实现 `LayoutManager` 根据布局快照控制各面板尺寸与可见性
    - _需求: 1.2, 1.3_

  - [x] 3.4 编写属性测试：模式切换布局正确性
    - **Property 1: 模式切换布局正确性**
    - 对任意初始布局状态和目标模式，切换后 Vibe 模式应隐藏规范面板且对话视图可见；Spec 模式应展开三个规范面板
    - 使用 `fc.record({ mode, panelWidths, visibility })` 生成器
    - **验证: 需求 1.2, 1.3**

  - [x] 3.5 编写属性测试：模式切换状态保留往返一致性
    - **Property 2: 模式切换状态保留往返一致性**
    - 对任意编辑器状态、对话历史和终端会话状态，从模式 A → B → A 后所有状态应完全一致
    - 使用 `fc.record({ dirtyBuffers, conversations, terminals })` 生成器
    - **验证: 需求 1.4**

- [x] 4. 基础 UI 布局
  - [x] 4.1 实现主界面四面板布局
    - 实现可拖拽调整大小的编辑器面板、AI 对话面板、终端面板、预览面板
    - 实现面板显隐切换与宽度/高度比例自定义
    - 实现 Spec 模式下的 Requirements/Design/Tasks 树形规范面板
    - _需求: 1.2, 1.3, 10.2_

  - [x] 4.2 实现 AI 对话面板基础交互
    - 实现 `ChatView` 对话视图组件（消息列表 + 输入框）
    - 实现多轮对话消息渲染与流式响应渲染
    - 实现 Vibe 模式下的 Diff 差异高亮视图（Monaco DiffEditor）
    - 实现一键接受（Accept）与一键撤销（Revert）功能
    - _需求: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.3 编写属性测试：AI 代码变更接受/撤销往返正确性
    - **Property 3: AI 代码变更接受/撤销往返正确性**
    - 对任意有效代码变更，接受后文件内容应等于修改内容；撤销后应等于原始内容
    - 使用 `fc.record({ original: fc.string(), modified: fc.string() })` 生成器
    - **验证: 需求 2.3**

  - [x] 4.4 编写属性测试：多轮对话历史保留不变量
    - **Property 4: 多轮对话历史保留不变量**
    - 对任意消息序列，追加新消息后历史消息应保持原有顺序和内容不变，长度增加 1
    - 使用 `fc.array(fc.record({ role, content }))` 生成器
    - **验证: 需求 2.4**

  - [x] 4.3a 实现终端面板
    - 集成 xterm.js 实现可视化终端
    - 展示 stdout 和 stderr 输出流
    - 支持多终端会话管理
    - _需求: 5.1_

- [x] 5. Phase 1 检查点
  - 确保所有测试通过，如有疑问请询问用户。
  - 验证 Electron 应用可正常启动，Monaco Editor 可编辑文件，双模式切换正常工作。

---

### Phase 2：WebContainer 核心集成与双向同步逻辑

- [x] 6. WebContainers/Sandpack 内嵌预览集成
  - [x] 6.1 初始化 WebContainers 运行时与预览面板
    - 安装并配置 `@webcontainer/api`
    - 实现 `EmbeddedPreviewPanel` 组件（不可脱离主界面的 iframe）
    - 实现 WebContainers `boot()` 初始化与 `server-ready` 事件监听
    - 实现预览面板宽度比例自定义与显隐状态控制
    - _需求: 10.1, 10.2_

  - [x] 6.2 实现预览面板错误堆栈浮窗
    - 实现 `ErrorOverlay` 组件：在预览面板底部显示可折叠的错误信息
    - 包含错误类型、错误消息、堆栈、源文件链接
    - 注入错误捕获脚本到 iframe（通过 postMessage 通道）
    - _需求: 10.3_

- [x] 7. 文件指纹计算与操作追踪器
  - [x] 7.1 实现文件指纹计算器（FingerprintCalculator）
    - 安装并配置 `xxhash-wasm`
    - 实现 `FingerprintCalculator` 类：`init()` 初始化 WASM、`calculate()` 计算 xxHash64 指纹
    - 支持 string 和 Uint8Array 输入
    - _需求: 6.3_

  - [x] 7.2 实现操作追踪器（OperationTracker）
    - 实现 `recordOperation(filePath, content, origin)` 记录同步操作指纹与来源
    - 实现 `isEchoEvent(filePath, newContent, eventOrigin)` 回声事件检测
    - 实现操作记录 TTL 过期清理（5 秒）与最大记录数限制（每文件 10 条）
    - 实现定期清理定时器
    - _需求: 6.3_

  - [x] 7.3 编写属性测试：文件同步回声检测
    - **Property 9: 文件同步回声检测**
    - 对任意文件路径和内容，记录 origin_A 写入后收到 origin_B 的相同内容变更应判定为回声；内容不同应判定为非回声
    - 使用 `fc.record({ path: fc.string(), content: fc.string(), origin })` 生成器
    - **验证: 需求 6.3**

- [x] 8. 防抖同步调度器与忽略规则引擎
  - [x] 8.1 实现防抖同步调度器（DebouncedSyncScheduler）
    - 实现 `enqueue(event)` 接收文件变更事件
    - 实现 300ms 防抖窗口与 1000ms 最大延迟
    - 实现同一文件连续事件合并（只保留最新）
    - 实现 `flush()` 批量执行同步操作
    - 在写入目标前调用 `OperationTracker.recordOperation` 记录操作指纹
    - _需求: 6.2, 6.3_

  - [x] 8.2 实现同步忽略规则引擎（SyncIgnoreEngine）
    - 实现默认忽略模式列表（node_modules、dist、.cache、lock 文件等）
    - 支持加载项目级 `.fule/sync-ignore` 配置文件
    - 实现 `shouldIgnore(filePath)` 基于 minimatch 的路径匹配
    - _需求: 6.3_

- [x] 9. 文件系统监听与完整同步流程
  - [x] 9.1 集成 chokidar 文件系统监听器
    - 在主进程中使用 chokidar 监听项目目录
    - 将文件变更事件通过 IPC 转发到渲染进程的同步引擎
    - 事件流程：chokidar → 忽略规则检查 → 回声检测 → 防抖调度 → WebContainers 写入
    - _需求: 6.1, 6.2_

  - [x] 9.2 实现 WebContainers → Electron 反向同步
    - 监听 WebContainers 文件变更事件
    - 通过操作追踪器检测回声事件并丢弃
    - 非回声事件经防抖调度后回写 Electron 文件系统
    - _需求: 6.3_

- [x] 10. Phase 2 检查点
  - 确保所有测试通过，如有疑问请询问用户。
  - 验证文件编辑后预览面板在 1 秒内热更新，双向同步无死循环。

---

### Phase 3：Command Gateway 与 AI 自愈逻辑

- [x] 11. 命令规范化与 Shell 词法分析
  - [x] 11.1 实现 Shell 词法分析器（shellTokenize）
    - 正确处理单引号、双引号、反斜杠转义
    - 正确处理空格分隔的 token
    - _需求: 5.2_

  - [x] 11.2 实现命令规范化算法（normalizeCommand）
    - 去除首尾空白和多余空格
    - 解析管道链（`splitByPipes`），每个管道段独立校验
    - 识别主命令（处理路径前缀，如 `/usr/bin/rm` → `rm`）
    - 分离子命令、标志位和位置参数（`classifyTokens`）
    - 递归解析管道后续命令
    - _需求: 5.2_

  - [x] 11.3 实现 WebContainers 启动 Loading 骨架屏与状态进度条
    - 实现 `BootProgressOverlay` 组件：在 WebContainers 首次 `boot()` 和 `npm install` 期间显示骨架屏与进度状态
    - 监听 WebContainers 的 `install` 进程 stdout/stderr，解析依赖安装进度并实时更新进度条
    - 在 `server-ready` 事件触发后自动隐藏 Loading 状态，切换到预览视图
    - 处理超时场景：超过 60 秒未完成时显示"重试"按钮
    - _需求: 10.1_

- [x] 12. 白名单匹配引擎
  - [x] 12.1 实现白名单规则定义与内置白名单
    - 定义 `WhitelistRule` 和 `CommandPattern` 类型（exact / prefix / glob / regex）
    - 实现内置白名单（文件浏览类、Node.js 开发类、Git 只读操作、信息查询类）
    - 实现危险标志位黑名单（`DANGEROUS_FLAGS`）
    - _需求: 5.3_

  - [x] 12.2 实现白名单匹配算法（matchWhitelist）
    - 实现 `matchPattern` 支持 exact、prefix、glob、regex 四种匹配模式
    - 管道链中每个命令都必须通过白名单
    - 即使匹配白名单也检查危险标志位（`checkDangerousFlags`）
    - 支持加载项目级 `.fule/command-whitelist.json` 配置
    - _需求: 5.2, 5.3_

  - [x] 12.3 编写属性测试：Command Gateway 命令分类正确性
    - **Property 7: Command Gateway 命令分类正确性**
    - 对任意 Shell 命令和白名单规则集，匹配白名单且无危险标志位应放行；否则应阻止并触发审批
    - 使用 `fc.record({ executable, subcommands, flags })` + `fc.array(whitelistRule)` 生成器
    - **验证: 需求 5.2, 5.3, 5.4**

- [x] 13. 风险评估与人工审批 UI
  - [x] 13.1 实现风险等级评估器（assessRisk）
    - 实现 `RiskLevel` 四级分类（LOW / MEDIUM / HIGH / CRITICAL）
    - 实现文件删除、全局安装、权限修改、包管理器安装、Git 写操作的风险规则
    - 生成用户可读的风险说明与建议
    - _需求: 5.4_

  - [x] 13.2 实现人工审批弹窗 UI
    - 实现 `CommandApprovalDialog` 组件
    - 显示命令内容、风险等级、风险原因、建议说明
    - 提供"允许"和"拒绝"按钮
    - 通过 IPC `cmd:approve` / `cmd:reject` 通道与主进程通信
    - _需求: 5.4_

- [x] 14. 常驻进程管理器
  - [x] 14.1 实现 ProcessManager 进程管理器
    - 实现进程注册与端口映射（`processes` Map + `portMap` Map）
    - 实现端口预测逻辑（解析 `--port` 参数 + 常见开发服务器默认端口）
    - 实现 `prepareExecution`：启动前检查端口冲突并自动清理旧进程
    - 实现 `gracefulKill`：SIGTERM → 等待 5 秒 → SIGKILL
    - 通过 IPC `proc:list`、`proc:kill`、`proc:output` 通道暴露管理接口
    - _需求: 5.5_

  - [x] 14.2 编写属性测试：端口冲突自动清理
    - **Property 8: 端口冲突自动清理**
    - 对任意已注册进程集合及端口占用映射，新命令需要已占用端口时应终止旧进程并释放端口
    - 使用 `fc.array(fc.record({ pid, ports: fc.array(fc.nat(65535)) }))` 生成器
    - **验证: 需求 5.5**

- [x] 15. Phase 3 检查点（中间）
  - 确保所有测试通过，如有疑问请询问用户。
  - 验证 Command Gateway 拦截流程正常：白名单命令自动放行，非白名单命令弹出审批弹窗。

- [x] 16. 错误拦截器
  - [x] 16.1 实现 Preview 错误拦截器（PreviewErrorInterceptor）
    - 通过 postMessage 从 iframe 接收运行时异常
    - 实现白屏检测算法：每 3 秒检查 iframe DOM 状态，连续 2 次检测到白屏触发错误
    - 实现编译错误捕获（监听 WebContainers stderr）
    - _需求: 7.3, 10.3_

  - [x] 16.2 实现 Terminal 错误拦截器（TerminalErrorInterceptor）
    - 实现错误模式正则匹配（Node.js 错误、Vite/Webpack 编译错误、npm 错误、通用 stderr）
    - 实现 `parseTerminalOutput` 提取结构化错误信息
    - 实现 `extractFullStack` 从错误位置向下提取完整堆栈
    - 实现 `extractSourceLocation` 提取源文件路径和行号
    - _需求: 7.3_

  - [x] 16.3 编写属性测试：终端错误堆栈解析
    - **Property 10: 终端错误堆栈解析**
    - 对任意包含标准错误模式的终端输出字符串，解析器应正确提取错误类型、消息、源文件路径和行号
    - 使用自定义错误字符串生成器
    - **验证: 需求 7.3**

- [x] 17. 错误去重与上下文增强
  - [x] 17.1 实现错误去重器（ErrorDeduplicator）
    - 基于错误类型 + 错误消息 + 源文件路径生成指纹（忽略行号）
    - 实现 30 秒去重窗口，窗口内相同指纹的错误自动丢弃
    - 实现过期指纹自动清理
    - _需求: 7.3_

  - [x] 17.2 实现错误上下文增强器（ErrorContextEnhancer）
    - 读取出错源文件内容
    - 通过 import 分析找到相关依赖文件（最多 3 个）
    - 获取最近的 AI 修改记录（可能是 AI 引入的 bug）
    - 获取最近的用户操作记录
    - _需求: 7.3_

- [x] 18. 自愈决策引擎与修复闭环
  - [x] 18.1 实现自愈决策器（SelfHealDecider）
    - 实现 `shouldAutoFix` 决策逻辑：Vibe 模式 + 可修复错误类型 + 未超过最大尝试次数（3 次）+ 有足够上下文
    - 实现修复尝试计数器与重置逻辑
    - _需求: 7.3_

  - [x] 18.2 实现自愈引擎（SelfHealEngine）
    - 实现 `buildFixPrompt` 构造修复提示词（错误信息 + 堆栈 + 相关文件 + 最近 AI 修改）
    - 实现静默 AI 修复请求（不显示在对话历史中）
    - 实现修复结果应用（可撤销）
    - 实现 `verifyFix` 修复验证（等待 5 秒，检查同一错误是否再次出现）
    - Vibe 模式下静默修复，Spec 模式下显示错误通知
    - _需求: 7.3_

- [x] 19. 补充模块集成
  - [x] 19.1 实现 Spec 模式文档生成与依赖追溯
    - 实现 `SpecDocument` 数据模型（版本、内容哈希、parentHash）
    - 实现 `checkConsistency` 一致性检查（Requirements → Design → Tasks 依赖链）
    - 实现 `validateCodeAgainstSpec` AI 代码与 Spec 冲突检测
    - _需求: 3.1, 3.2, 3.3_

  - [x] 19.2 编写属性测试：Spec 文档依赖过期检测
    - **Property 5: Spec 文档依赖过期检测**
    - 对任意 Spec 依赖图，当 Requirements 哈希变化后应检测到 Design 的 parentHash 不匹配
    - 使用 `fc.record({ reqHash, designParentHash, taskParentHash })` 生成器
    - **验证: 需求 3.2**

  - [x] 19.3 实现 Steering 规范约束机制
    - 实现 `SteeringManager`：加载全局（`~/.fule/steering/`）和项目级（`.fule/steering/`）规则
    - 实现规则合并逻辑（项目级覆盖同 ID 全局规则）
    - 实现 `buildSystemPrompt` 将 Steering 规则注入 AI 上下文作为最高优先级系统提示词
    - _需求: 4.1, 4.2, 4.3_

  - [x] 19.4 编写属性测试：Steering 规则合并与注入完整性
    - **Property 6: Steering 规则合并与注入完整性**
    - 对任意全局和项目级规则集，合并后同 ID 规则应以项目级为准；系统提示词应包含所有有效规则
    - 使用 `fc.tuple(fc.array(steeringRule), fc.array(steeringRule))` 生成器
    - **验证: 需求 4.2, 4.3**

  - [x] 19.5 实现混合 AI 驱动后端
    - 实现 `UnifiedAIBackend`：统一的流式对话接口
    - 实现 `OpenAICompatibleProvider`：支持 OpenAI 兼容 API
    - 实现 `OllamaProvider`：支持本地 Ollama 实例 + 健康监控
    - 实现模型热切换（`switchModel`）：无需重启应用
    - _需求: 8.1, 8.2, 8.3_

  - [x] 19.6 实现上下文管理与 MCP 协议接口
    - 实现 `ContextTrimmingEngine`：基于 AST 分析的智能上下文裁剪
    - 实现 `MCPManager`：从配置文件动态注册 MCP 端点
    - 支持 stdio / sse / streamable-http 协议
    - 实现 MCP 连接健康检查机制：定期（每 30 秒）心跳探测已注册端点的可用性，端点不可达时标记为 `disconnected` 并从 AI 请求上下文中移除，防止因外部 MCP 服务断开导致 AI 响应超时；端点恢复后自动重连并恢复上下文注入
    - _需求: 7.1, 7.2_

  - [x] 19.7 实现插件化架构
    - 实现 `PluginSystem`：插件生命周期管理（安装、加载、禁用、卸载）
    - 插件在独立 Web Worker 沙箱中运行
    - 实现加载超时保护（10 秒）与崩溃隔离
    - _需求: 11.1, 11.2_

  - [x] 19.8 编写属性测试：插件沙箱隔离
    - **Property 12: 插件沙箱隔离**
    - 对任意在沙箱中运行的插件，崩溃时 IDE 主进程应保持正常运行，插件状态标记为 ERROR
    - 使用崩溃插件生成器（throw / infinite loop / memory）
    - **验证: 需求 11.2**

- [x] 20. 全局集成与最终检查点
  - 确保所有测试通过，如有疑问请询问用户。
  - 验证完整流程：Vibe 模式对话 → AI 生成代码 → Diff 显示 → 接受 → 预览热更新 → 错误自愈。
  - 验证 Command Gateway 拦截、双向同步无死循环、模式切换状态保留。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 开发
- 每个任务引用了具体的需求编号，确保可追溯性
- 检查点确保增量验证，每个阶段结束后验证核心功能
- 属性测试验证通用正确性属性，单元测试验证具体边界条件
- 技术栈严格遵循需求 12 的约束：React + TypeScript + Tailwind CSS + Electron + Monaco Editor
