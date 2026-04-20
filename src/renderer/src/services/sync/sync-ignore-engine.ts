/**
 * 同步忽略规则引擎
 *
 * 某些文件不应参与 Electron ↔ WebContainers 双向同步，例如：
 * - node_modules — 由 WebContainers 内的 npm 管理
 * - 编译产物（dist、build、.next 等）— 由构建工具生成
 * - 缓存文件（.cache、.vite 等）— 临时文件无需同步
 * - lock 文件 — 由包管理器自动生成
 *
 * 本引擎支持默认忽略模式和项目级 `.fule/sync-ignore` 配置文件。
 */

import { minimatch } from 'minimatch'

/** 默认忽略模式列表 */
const DEFAULT_SYNC_IGNORE_PATTERNS: string[] = [
  // Node.js 依赖目录
  'node_modules/**',

  // lock 文件 — 由包管理器自动生成
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',

  // 编译产物
  'dist/**',
  'build/**',
  '.next/**',
  '.nuxt/**',

  // 缓存目录
  '.cache/**',
  '.parcel-cache/**',
  '.vite/**',

  // 临时文件
  '*.tmp',
  '*.swp',
  '~*',
]

/**
 * 同步忽略规则引擎 — 判断文件是否应被排除在双向同步之外
 */
export class SyncIgnoreEngine {
  /** 所有生效的忽略模式（默认 + 项目级） */
  private patterns: string[]

  /**
   * 创建忽略规则引擎
   *
   * @param projectIgnoreContent - 项目级 `.fule/sync-ignore` 文件内容（可选）
   */
  constructor(projectIgnoreContent?: string) {
    this.patterns = [...DEFAULT_SYNC_IGNORE_PATTERNS]
    if (projectIgnoreContent) {
      // 解析项目级忽略配置并追加到模式列表
      const projectPatterns = this.parseIgnoreFile(projectIgnoreContent)
      this.patterns.push(...projectPatterns)
    }
  }

  /**
   * 判断指定文件路径是否应被忽略
   *
   * @param filePath - 相对文件路径
   * @returns 是否应忽略该文件
   */
  shouldIgnore(filePath: string): boolean {
    // dot: true 确保匹配以 . 开头的文件和目录（如 .cache、.swp）
    return this.patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }))
  }

  /**
   * 获取当前所有生效的忽略模式（用于调试和测试）
   */
  getPatterns(): readonly string[] {
    return this.patterns
  }

  /**
   * 解析忽略配置文件内容
   *
   * 格式与 .gitignore 类似：
   * - 每行一个模式
   * - 空行和以 # 开头的注释行被忽略
   * - 首尾空白被自动去除
   *
   * @param content - 配置文件内容
   * @returns 解析后的模式列表
   */
  private parseIgnoreFile(content: string): string[] {
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  }
}

export { DEFAULT_SYNC_IGNORE_PATTERNS }
