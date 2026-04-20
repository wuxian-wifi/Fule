import { describe, it, expect } from 'vitest'
import {
  SyncIgnoreEngine,
  DEFAULT_SYNC_IGNORE_PATTERNS,
} from '@renderer/services/sync/sync-ignore-engine'

describe('SyncIgnoreEngine - 同步忽略规则引擎', () => {
  describe('默认忽略模式', () => {
    const engine = new SyncIgnoreEngine()

    it('应忽略 node_modules 目录下的文件', () => {
      expect(engine.shouldIgnore('node_modules/react/index.js')).toBe(true)
      expect(engine.shouldIgnore('node_modules/.package-lock.json')).toBe(true)
    })

    it('应忽略 package-lock.json', () => {
      expect(engine.shouldIgnore('package-lock.json')).toBe(true)
    })

    it('应忽略 yarn.lock', () => {
      expect(engine.shouldIgnore('yarn.lock')).toBe(true)
    })

    it('应忽略 pnpm-lock.yaml', () => {
      expect(engine.shouldIgnore('pnpm-lock.yaml')).toBe(true)
    })

    it('应忽略 dist 目录下的文件', () => {
      expect(engine.shouldIgnore('dist/index.js')).toBe(true)
      expect(engine.shouldIgnore('dist/assets/style.css')).toBe(true)
    })

    it('应忽略 build 目录下的文件', () => {
      expect(engine.shouldIgnore('build/bundle.js')).toBe(true)
    })

    it('应忽略 .next 目录下的文件', () => {
      expect(engine.shouldIgnore('.next/server/pages/index.js')).toBe(true)
    })

    it('应忽略 .nuxt 目录下的文件', () => {
      expect(engine.shouldIgnore('.nuxt/dist/client/app.js')).toBe(true)
    })

    it('应忽略 .cache 目录下的文件', () => {
      expect(engine.shouldIgnore('.cache/some-cache-file')).toBe(true)
    })

    it('应忽略 .parcel-cache 目录下的文件', () => {
      expect(engine.shouldIgnore('.parcel-cache/data.blob')).toBe(true)
    })

    it('应忽略 .vite 目录下的文件', () => {
      expect(engine.shouldIgnore('.vite/deps/react.js')).toBe(true)
    })

    it('应忽略 .tmp 临时文件', () => {
      expect(engine.shouldIgnore('data.tmp')).toBe(true)
    })

    it('应忽略 .swp 交换文件', () => {
      expect(engine.shouldIgnore('.app.tsx.swp')).toBe(true)
    })

    it('应忽略以 ~ 开头的临时文件', () => {
      expect(engine.shouldIgnore('~backup.txt')).toBe(true)
    })

    it('不应忽略普通源代码文件', () => {
      expect(engine.shouldIgnore('src/app.tsx')).toBe(false)
      expect(engine.shouldIgnore('src/utils/helper.ts')).toBe(false)
      expect(engine.shouldIgnore('package.json')).toBe(false)
      expect(engine.shouldIgnore('tsconfig.json')).toBe(false)
      expect(engine.shouldIgnore('README.md')).toBe(false)
    })
  })

  describe('项目级忽略配置', () => {
    it('应加载项目级 .fule/sync-ignore 配置', () => {
      const projectIgnore = `
# 项目特定的忽略规则
coverage/**
.env
*.log
`
      const engine = new SyncIgnoreEngine(projectIgnore)

      // 项目级规则生效
      expect(engine.shouldIgnore('coverage/lcov.info')).toBe(true)
      expect(engine.shouldIgnore('.env')).toBe(true)
      expect(engine.shouldIgnore('error.log')).toBe(true)

      // 默认规则仍然生效
      expect(engine.shouldIgnore('node_modules/react/index.js')).toBe(true)
    })

    it('应忽略注释行和空行', () => {
      const projectIgnore = `
# 这是注释
  # 带缩进的注释

*.bak

`
      const engine = new SyncIgnoreEngine(projectIgnore)
      const patterns = engine.getPatterns()

      // 注释和空行不应出现在模式列表中
      const projectPatterns = patterns.slice(DEFAULT_SYNC_IGNORE_PATTERNS.length)
      expect(projectPatterns).toEqual(['*.bak'])
    })

    it('应去除每行首尾空白', () => {
      const projectIgnore = '  *.bak  \n  temp/**  '
      const engine = new SyncIgnoreEngine(projectIgnore)
      const patterns = engine.getPatterns()

      const projectPatterns = patterns.slice(DEFAULT_SYNC_IGNORE_PATTERNS.length)
      expect(projectPatterns).toEqual(['*.bak', 'temp/**'])
    })

    it('无项目配置时应只使用默认模式', () => {
      const engine = new SyncIgnoreEngine()
      expect(engine.getPatterns()).toEqual(DEFAULT_SYNC_IGNORE_PATTERNS)
    })

    it('空字符串配置不应添加额外模式', () => {
      const engine = new SyncIgnoreEngine('')
      expect(engine.getPatterns()).toEqual(DEFAULT_SYNC_IGNORE_PATTERNS)
    })
  })

  describe('shouldIgnore - 路径匹配', () => {
    it('应支持 glob 通配符匹配', () => {
      const engine = new SyncIgnoreEngine('src/**/*.test.ts')
      expect(engine.shouldIgnore('src/utils/helper.test.ts')).toBe(true)
      expect(engine.shouldIgnore('src/utils/helper.ts')).toBe(false)
    })

    it('应支持精确文件名匹配', () => {
      const engine = new SyncIgnoreEngine('.env.local')
      expect(engine.shouldIgnore('.env.local')).toBe(true)
      expect(engine.shouldIgnore('.env')).toBe(false)
    })
  })
})
