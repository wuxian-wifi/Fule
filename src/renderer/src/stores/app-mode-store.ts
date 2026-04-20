/**
 * 应用模式状态管理 Store
 * 管理 Vibe Coding 模式与 Spec 模式之间的切换，
 * 包括布局快照保存/恢复和防重入切换锁
 */
import { create } from 'zustand'

/** 应用模式：vibe（极简对话式编程）或 spec（规范驱动开发） */
export type AppMode = 'vibe' | 'spec'

/** 布局快照，记录各面板的尺寸和可见性 */
export interface LayoutSnapshot {
  /** 编辑器宽度比例 */
  editorWidth: number
  /** 预览面板宽度比例 */
  previewWidth: number
  /** 预览面板是否可见 */
  previewVisible: boolean
  /** 终端面板高度 */
  terminalHeight: number
  /** 终端面板是否可见 */
  terminalVisible: boolean
  /** 侧边栏宽度 */
  sidebarWidth: number
  /** Spec 模式特有：规范面板是否可见 */
  specPanelVisible?: boolean
  /** Spec 模式特有：规范面板宽度 */
  specPanelWidth?: number
}

/** Vibe 模式默认布局 */
const DEFAULT_VIBE_LAYOUT: LayoutSnapshot = {
  editorWidth: 50,
  previewWidth: 320,
  previewVisible: true,
  terminalHeight: 200,
  terminalVisible: true,
  sidebarWidth: 240,
  specPanelVisible: false,
  specPanelWidth: 0,
}

/** Spec 模式默认布局 */
const DEFAULT_SPEC_LAYOUT: LayoutSnapshot = {
  editorWidth: 45,
  previewWidth: 280,
  previewVisible: true,
  terminalHeight: 200,
  terminalVisible: true,
  sidebarWidth: 240,
  specPanelVisible: true,
  specPanelWidth: 280,
}

/** 应用模式 Store 接口 */
interface AppModeStore {
  /** 当前激活的模式 */
  currentMode: AppMode
  /** 每个模式独立保存的布局快照 */
  layoutSnapshots: Record<AppMode, LayoutSnapshot>
  /** 切换锁，防止切换过程中的并发操作 */
  isSwitching: boolean

  /** 设置当前模式 */
  setCurrentMode: (mode: AppMode) => void
  /** 保存指定模式的布局快照 */
  saveLayoutSnapshot: (mode: AppMode, snapshot: LayoutSnapshot) => void
  /** 获取指定模式的布局快照 */
  getLayoutSnapshot: (mode: AppMode) => LayoutSnapshot
  /** 设置切换锁状态 */
  setIsSwitching: (switching: boolean) => void
}

/**
 * 应用模式状态管理 Store
 * 负责双模式切换的核心状态：当前模式、布局快照、切换锁
 */
export const useAppModeStore = create<AppModeStore>((set, get) => ({
  currentMode: 'vibe',
  layoutSnapshots: {
    vibe: { ...DEFAULT_VIBE_LAYOUT },
    spec: { ...DEFAULT_SPEC_LAYOUT },
  },
  isSwitching: false,

  setCurrentMode: (mode) => {
    set({ currentMode: mode })
  },

  saveLayoutSnapshot: (mode, snapshot) => {
    set((state) => ({
      layoutSnapshots: {
        ...state.layoutSnapshots,
        [mode]: snapshot,
      },
    }))
  },

  getLayoutSnapshot: (mode) => {
    return get().layoutSnapshots[mode]
  },

  setIsSwitching: (switching) => {
    set({ isSwitching: switching })
  },
}))
