/**
 * 项目状态管理 Store
 * 管理当前打开的项目目录路径
 */
import { create } from 'zustand'

/** 项目 Store 接口 */
interface ProjectStore {
  /** 当前项目根目录路径（未打开项目时为 null） */
  projectPath: string | null
  /** 设置项目路径 */
  setProjectPath: (path: string | null) => void
}

/**
 * 项目状态管理 Store
 */
export const useProjectStore = create<ProjectStore>((set) => ({
  projectPath: null,

  setProjectPath: (path) => {
    set({ projectPath: path })
  },
}))
