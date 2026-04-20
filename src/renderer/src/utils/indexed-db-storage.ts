/**
 * 基于 IndexedDB 的 Zustand persist 自定义存储适配器
 * 用于将对话历史等大量数据持久化到 IndexedDB，
 * 避免使用 localStorage（技术栈约束禁止）
 */
import type { StateStorage } from 'zustand/middleware'

/** IndexedDB 数据库名称 */
const DB_NAME = 'fule-ide-storage'
/** IndexedDB 数据库版本 */
const DB_VERSION = 1
/** 对象存储名称 */
const STORE_NAME = 'zustand-persist'

/** 打开或创建 IndexedDB 数据库连接 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 在非浏览器环境（如 Node.js 测试）中 indexedDB 不可用
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 在当前环境中不可用'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 创建基于 IndexedDB 的 Zustand StateStorage 适配器
 * 符合 Zustand persist 中间件要求的 getItem / setItem / removeItem 接口
 */
export const indexedDBStorage: StateStorage = {
  async getItem(name: string): Promise<string | null> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(name)

        request.onsuccess = () => {
          resolve(request.result ?? null)
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      // IndexedDB 不可用时静默降级，返回 null
      return null
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(value, name)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // IndexedDB 不可用时静默降级
    }
  },

  async removeItem(name: string): Promise<void> {
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.delete(name)

        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    } catch {
      // IndexedDB 不可用时静默降级
    }
  },
}
