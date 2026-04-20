import type { FuleAPI } from '@shared/types'

/** 扩展 Window 接口，声明 preload 脚本暴露的 fuleAPI */
declare global {
  interface Window {
    /** 通过 contextBridge 暴露的类型安全 API */
    fuleAPI: FuleAPI
  }
}
