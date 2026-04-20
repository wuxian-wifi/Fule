---
inclusion: always
---

# 组件与技术选型约束

## 强制技术栈

- UI 框架：React 18+
- 开发语言：TypeScript 5+（strict 模式）
- 样式方案：Tailwind CSS 3+，禁止使用 CSS Modules、styled-components 或其他 CSS-in-JS 方案
- 编辑器内核：Monaco Editor（通过 `@monaco-editor/react`）
- 桌面容器：Electron（最新稳定版）
- 构建工具：Vite（通过 electron-vite）
- 状态管理：Zustand，禁止使用 Redux、MobX 或 Jotai
- 内嵌预览：WebContainers（`@webcontainer/api`）或 Sandpack
- 终端模拟：xterm.js
- 文件监听：chokidar
- 文件指纹：xxhash-wasm
- 日志：electron-log
- 测试框架：Vitest + fast-check
- 包管理器：npm

## 禁止使用的库和 API

- 禁止使用 jQuery 或任何 DOM 操作库
- 禁止在渲染进程中直接使用 Node.js API（`fs`、`path`、`child_process` 等），必须通过 IPC 调用主进程
- 禁止使用 `eval()`、`Function()` 构造器或 `new Function()`
- 禁止使用 `window.open()` 弹出外部浏览器窗口，所有预览必须在内嵌面板中完成
- 禁止使用 `localStorage`/`sessionStorage` 存储应用状态，使用 Zustand persist + IndexedDB
- 禁止将 API Key 等敏感信息明文写入 electron-store 或任何配置文件，必须使用 Electron 的 `safeStorage` API 加密后再存储
- 日志模块统一使用 `electron-log`，禁止使用 `console.log` 作为正式日志；开发调试时可使用 `console.debug`，但提交前必须移除或替换为 `electron-log`

## React 组件规范

- 所有组件必须使用函数式组件 + Hooks，禁止使用 class 组件
- 使用 `React.memo` 包裹纯展示组件以优化性能
- 自定义 Hook 必须以 `use` 前缀命名
- 组件 props 必须定义 interface 类型
