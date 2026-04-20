---
inclusion: always
---

# 项目目录结构规范

## 顶层目录结构

```
fule/
├── src/
│   ├── main/              # Electron 主进程代码
│   │   ├── ipc/           # IPC handler 定义
│   │   ├── services/      # 主进程服务（文件系统、进程管理等）
│   │   └── index.ts       # 主进程入口
│   ├── preload/           # preload 脚本（contextBridge）
│   │   └── index.ts
│   ├── renderer/          # 渲染进程代码（React 应用）
│   │   ├── components/    # UI 组件
│   │   │   ├── editor/    # Monaco Editor 相关组件
│   │   │   ├── chat/      # AI 对话面板组件
│   │   │   ├── terminal/  # 终端面板组件
│   │   │   ├── preview/   # 内嵌预览面板组件
│   │   │   ├── layout/    # 布局与面板管理组件
│   │   │   └── common/    # 通用 UI 组件
│   │   ├── stores/        # Zustand 状态存储
│   │   ├── hooks/         # 自定义 React Hooks
│   │   ├── services/      # 渲染进程服务层
│   │   ├── types/         # 共享类型定义
│   │   ├── utils/         # 工具函数
│   │   ├── App.tsx        # 根组件
│   │   └── main.tsx       # 渲染进程入口
│   └── shared/            # 主进程与渲染进程共享的类型和常量
│       ├── ipc-channels.ts
│       └── types.ts
├── tests/                 # 测试文件
│   ├── unit/              # 单元测试
│   └── property/          # 属性测试（fast-check）
├── resources/             # Electron 静态资源（图标等）
├── electron.vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

## 目录规则

- `src/main/` 只放 Electron 主进程代码，禁止引入 React 或 DOM 相关模块
- `src/renderer/` 只放渲染进程代码，禁止直接引入 Node.js 模块
- `src/shared/` 只放纯类型定义和常量，禁止放任何运行时逻辑
- `src/preload/` 只放 contextBridge 暴露的 API 定义
- 组件目录按功能域划分（editor/chat/terminal/preview），不按技术类型划分
- 每个功能域目录下可包含子组件、hooks 和 types 文件

## 导入路径规则

- 使用 `@main/`、`@renderer/`、`@shared/`、`@preload/` 路径别名
- 禁止使用超过两层的相对路径（如 `../../../`），改用路径别名
- 测试文件使用 `@tests/` 路径别名
