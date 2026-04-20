# 需求文档

## 简介

Fule 是一款开源的、所见即所得的 AI 原生编程环境。通过 Vibe Coding 模式支持快速原型开发，通过 Spec 模式支持严谨的工程化开发。采用微内核架构，基于 Electron 构建，以 Monaco Editor 为核心，内嵌 WebContainers/Sandpack 预览，旨在提供安全、高效的下一代编程体验。

## 术语表

- **Fule**: 本项目的 AI 原生集成开发环境（IDE）
- **Vibe_Coding_Mode**: 极简交互模式，AI 根据用户模糊意图直接修改代码并实时渲染预览
- **Spec_Mode**: 规范驱动模式，AI 自动生成并维护 Requirements.md、Design.md、Tasks.md，所有代码变更严格遵循 Spec 文档
- **Steering**: 规范约束机制，支持编写全局或项目级的规范约束手册，AI 在生成代码时必须强制遵循
- **MCP（Model_Context_Protocol）**: 模型上下文协议，允许 AI 通过标准协议访问外部上下文（文件系统、数据库、第三方服务 API）
- **Monaco_Editor**: 微软开源的代码编辑器内核，提供语法高亮、智能补全等核心编辑能力
- **Sandpack**: CodeSandbox 提供的浏览器内代码运行时，用于实时预览 Web 应用
- **WebContainers**: StackBlitz 提供的浏览器内 Node.js 运行时环境
- **Embedded_Preview**: 内嵌预览面板，在 IDE 右侧集成 Sandpack 或 WebContainers 进行实时预览
- **Plugin_System**: 插件系统，基于微内核架构的扩展机制，支持通过插件扩展 IDE 功能
- **Terminal_Panel**: 可视化终端面板，集成于 IDE 内部，展示底层环境的标准输出和错误输出
- **Command_Gateway**: 命令执行拦截网关，AI 执行 Shell 指令前的安全校验层
- **Context_Trimming**: 智能上下文裁剪，根据用户当前编辑位置动态提取相关 AST 节点和依赖文件的能力
- **Ollama**: 本地运行的大语言模型推理引擎
- **OpenAI_API**: OpenAI 兼容格式的云端大语言模型 API 接口

## 需求

### 需求 1：双模式无缝切换

**用户故事：** 作为开发者，我希望在 Vibe Coding 模式和 Spec 模式之间自由切换，以便根据不同的开发阶段选择最合适的工作方式。

#### 验收标准

1. THE Fule SHALL 在主界面提供明确的模式切换控件，支持在 Vibe_Coding_Mode 和 Spec_Mode 之间切换
2. WHEN 用户切换到 Vibe_Coding_Mode 时，THE Fule SHALL 隐藏规范文档面板，展开对话与极简编辑视图
3. WHEN 用户切换到 Spec_Mode 时，THE Fule SHALL 展开 Requirements、Design、Tasks 树形规范面板
4. WHEN 用户在任一模式下切换到另一模式时，THE Fule SHALL 无损保留当前所有未保存的代码状态、AI 对话历史及终端运行状态

### 需求 2：Vibe Coding 模式

**用户故事：** 作为开发者，我希望通过自然语言描述模糊意图，AI 直接修改代码并实时渲染，以便获得极致的开发愉悦感和反馈速度。

#### 验收标准

1. WHEN 用户在 Vibe_Coding_Mode 下输入自然语言指令时，THE Fule SHALL 允许 AI 根据模糊意图直接生成或修改代码
2. WHEN AI 生成代码变更时，THE Fule SHALL 在 Monaco_Editor 中以 Diff 差异高亮方式显示变更内容
3. WHEN AI 完成代码变更后，THE Fule SHALL 提供一键撤销（Revert）与一键接受（Accept）功能，支持对单次 AI 修改进行回滚或确认
4. WHILE 处于 Vibe_Coding_Mode 时，THE Fule SHALL 支持多轮对话式交互，允许在保留前置上下文的基础上要求 AI 进行代码微调

### 需求 3：Spec 模式

**用户故事：** 作为开发者，我希望 AI 自动生成并维护 Spec 文档，所有代码变更严格遵循 Spec，以便在大型项目中确保逻辑一致性。

#### 验收标准

1. WHEN 用户在 Spec_Mode 下输入初始需求时，THE Fule SHALL 按序自动生成 Requirements、Design、Tasks 规范文档
2. THE Fule SHALL 为规范文档提供版本控制与依赖追溯能力；WHEN 用户修改 Requirements 时，THE Fule SHALL 提示并辅助同步更新 Design 与 Tasks
3. WHILE 处于 Spec_Mode 时，IF AI 生成的代码与当前 Spec 文档存在冲突，THEN THE Fule SHALL 拦截代码应用并向用户抛出冲突警告

### 需求 4：Steering 规范约束机制

**用户故事：** 作为团队负责人，我希望编写全局或项目级的规范约束手册，AI 在生成代码时必须强制遵循，以便确保团队代码风格和技术选型的一致性。

#### 验收标准

1. THE Fule SHALL 支持在全局配置目录和项目根目录下配置 Steering 规则文件（如组件选型、代码风格、禁用 API）
2. WHEN 项目级 Steering 与全局 Steering 存在冲突时，THE Fule SHALL 以项目级配置为优先
3. WHEN AI 发起代码生成请求时，THE Fule SHALL 自动将生效的 Steering 规则作为最高优先级系统提示词注入上下文

### 需求 5：终端交互与安全沙箱执行

**用户故事：** 作为开发者，我希望 AI 执行的 Shell 指令受到安全管控，以便防止 AI 误操作对系统造成破坏。

#### 验收标准

1. THE Fule SHALL 集成可视化的 Terminal_Panel，展示底层环境的所有标准输出（stdout）和错误输出（stderr）
2. THE Fule SHALL 建立 Command_Gateway 拦截网关；WHEN AI 尝试执行任何 Shell 指令时，THE Command_Gateway SHALL 在执行前进行安全校验
3. THE Fule SHALL 支持配置"指令白名单"（如 ls、pwd、npm run dev 等无破坏性指令），白名单内的指令允许 AI 自动执行
4. WHEN AI 尝试执行非白名单指令（如文件删除、依赖全局安装等）时，THE Fule SHALL 在界面上弹出人工审核弹窗，经用户明确点击"允许"后方可执行
5. THE Fule SHALL 具备常驻进程管理能力，针对 npm run dev 等持续运行的命令，系统需监控其 PID 与端口占用情况；WHEN AI 尝试重新启动服务或修改核心配置时，THE Fule SHALL 自动清理旧进程并释放端口，防止因端口冲突导致的预览失效

### 需求 6：文件系统与状态同步

**用户故事：** 作为开发者，我希望本地文件系统与内嵌预览环境保持高效同步，以便获得流畅的所见即所得开发体验。

#### 验收标准

1. THE Fule SHALL 以 Electron 本地文件系统为"单一事实来源"
2. THE Fule SHALL 建立本地文件系统与内嵌预览环境（WebContainers/Sandpack）之间的高效同步流；WHEN 本地文件保存时，THE Embedded_Preview 的文件系统 SHALL 在 1 秒内完成热更新
3. THE Fule SHALL 针对预览环境（WebContainers）内产生的文件变更（如编译生成的临时文件或 lock 文件）建立防抖双向同步机制，通过文件指纹或操作序列号识别变更来源，严格防止"Electron 写入 → WebContainers 响应 → 同步回 Electron → 触发重新编译"的双向同步死循环

### 需求 7：上下文管理与 MCP 协议

**用户故事：** 作为开发者，我希望 AI 能够智能管理上下文并通过 MCP 协议访问外部服务，以便增强 AI 的上下文理解能力。

#### 验收标准

1. THE Fule SHALL 具备智能 Context_Trimming 能力，根据用户当前编辑的文件和光标位置，动态提取相关 AST 节点和依赖文件提供给 AI，避免上下文超载
2. THE Fule SHALL 预留完整的 MCP 接口，支持通过配置文件动态注册、连接多个外部上下文服务端点
3. THE Fule SHALL 建立 AI 隐式自愈通道；WHEN Embedded_Preview 发生运行时崩溃、白屏或 Terminal_Panel 执行报错时，THE Fule SHALL 自动截获完整错误堆栈；WHILE 处于 Vibe_Coding_Mode 时，THE Fule SHALL 在不打断用户的情况下将错误信息静默回传给 AI 触发自动修复，实现故障闭环

### 需求 8：混合 AI 驱动后端

**用户故事：** 作为开发者，我希望灵活选择使用云端 API 或本地 Ollama 实例驱动 AI，以便在不同网络环境和隐私需求下都能使用 AI 功能。

#### 验收标准

1. THE Fule SHALL 支持动态配置兼容 OpenAI 规范的云端大模型 API
2. THE Fule SHALL 深度支持本地 Ollama 实例，提供本地模型的运行状态监控与流式响应渲染
3. WHEN 用户在对话面板中切换底层模型时，THE Fule SHALL 无缝完成切换，无需重启应用

### 需求 9：Monaco 深度集成

**用户故事：** 作为开发者，我希望拥有功能完善的代码编辑体验，包括语法高亮、智能补全和多标签页管理，以便高效编写代码。

#### 验收标准

1. THE Fule SHALL 基于 Monaco_Editor 提供主流语言的语法高亮、智能补全与代码格式化
2. THE Fule SHALL 支持多标签页文件管理、树形文件资源管理器及全局搜索替换
3. WHEN 文件在 Fule 外部被修改时，THE Fule SHALL 实时检测变更并提示用户重载

### 需求 10：内嵌实时预览

**用户故事：** 作为开发者，我希望在 IDE 右侧直接预览应用效果，无需弹出外部浏览器窗口，以便获得所见即所得的开发体验。

#### 验收标准

1. THE Fule SHALL 在编辑器右侧集成不可脱离主界面的 Embedded_Preview 面板
2. THE Fule SHALL 支持用户自定义预览面板的宽度比例及显隐状态
3. WHEN Embedded_Preview 中发生运行时崩溃或编译错误时，THE Fule SHALL 在面板底层提供清晰的错误堆栈浮窗

### 需求 11：插件化架构

**用户故事：** 作为开发者或第三方扩展作者，我希望通过插件机制扩展 IDE 功能，以便满足不同项目和团队的定制化需求。

#### 验收标准

1. THE Fule SHALL 采用微内核设计，非核心功能（如特定语言支持、主题）均通过 Plugin_System 机制实现
2. THE Plugin_System SHALL 提供插件生命周期管理（安装、加载、禁用、卸载）及安全的沙箱运行环境，防止插件崩溃导致 IDE 主进程挂掉

### 需求 12：强制技术栈约束

**用户故事：** 作为项目维护者，我希望明确技术栈选型，以便确保项目的技术一致性和可维护性。

#### 验收标准

1. THE Fule SHALL 使用 React + TypeScript + Tailwind CSS 作为核心框架
2. THE Fule SHALL 使用 Electron 作为桌面容器
3. THE Fule SHALL 使用 Monaco_Editor 作为编辑器内核
