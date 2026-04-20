/**
 * 白名单匹配引擎
 * 实现 Command Gateway 的白名单规则定义、内置白名单、
 * 危险标志位黑名单以及匹配算法，用于判断 AI 执行的 Shell 命令是否可自动放行
 */

import { minimatch } from 'minimatch'

import type { NormalizedCommand } from './command-normalizer'

// ===== 类型定义 =====

/** 命令匹配模式 — 支持精确匹配、前缀匹配、glob 和正则四种方式 */
export type CommandPattern =
  | {
      /** 精确匹配：主命令名完全一致，可选子命令也完全一致 */
      type: 'exact'
      /** 主命令名 */
      executable: string
      /** 可选的子命令列表，省略时只匹配主命令 */
      subcommands?: string[]
    }
  | {
      /** 前缀匹配：主命令名一致，子命令匹配允许列表中的某一项前缀 */
      type: 'prefix'
      /** 主命令名 */
      executable: string
      /** 允许的子命令组合列表 */
      allowedSubcommands: string[][]
    }
  | {
      /** glob 匹配：对原始命令字符串进行 glob 模式匹配 */
      type: 'glob'
      /** glob 模式字符串 */
      pattern: string
    }
  | {
      /** 正则匹配：对原始命令字符串进行正则表达式匹配 */
      type: 'regex'
      /** 正则表达式 */
      pattern: RegExp
    }

/** 白名单规则 */
export interface WhitelistRule {
  /** 规则唯一标识 */
  id: string
  /** 命令匹配模式 */
  pattern: CommandPattern
  /** 规则来源：内置 / 全局配置 / 项目配置 */
  source: 'builtin' | 'global' | 'project'
  /** 规则描述（用于审计日志和审批弹窗展示） */
  description: string
}

/** 白名单匹配结果 */
export interface MatchResult {
  /** 是否匹配白名单且无危险标志位（true 表示放行） */
  matched: boolean
  /** 匹配到的白名单规则（未匹配时为 undefined） */
  rule?: WhitelistRule
  /** 是否包含危险标志位 */
  hasDangerousFlags: boolean
  /** 检测到的危险标志位列表 */
  dangerousFlags: string[]
}

// ===== 内置白名单 =====

/** 内置白名单规则集 — 覆盖文件浏览、Node.js 开发、Git 只读操作和信息查询类命令 */
export const BUILTIN_WHITELIST: WhitelistRule[] = [
  // 文件浏览类 — 只读操作
  {
    id: 'fs-read-ls',
    pattern: { type: 'exact', executable: 'ls' },
    source: 'builtin',
    description: '列出目录内容',
  },
  {
    id: 'fs-read-pwd',
    pattern: { type: 'exact', executable: 'pwd' },
    source: 'builtin',
    description: '显示当前目录',
  },
  {
    id: 'fs-read-cat',
    pattern: { type: 'exact', executable: 'cat' },
    source: 'builtin',
    description: '查看文件内容',
  },
  {
    id: 'fs-read-head',
    pattern: { type: 'exact', executable: 'head' },
    source: 'builtin',
    description: '查看文件头部',
  },
  {
    id: 'fs-read-tail',
    pattern: { type: 'exact', executable: 'tail' },
    source: 'builtin',
    description: '查看文件尾部',
  },
  {
    id: 'fs-read-find',
    pattern: { type: 'exact', executable: 'find' },
    source: 'builtin',
    description: '搜索文件',
  },
  {
    id: 'fs-read-wc',
    pattern: { type: 'exact', executable: 'wc' },
    source: 'builtin',
    description: '统计文件',
  },

  // Node.js 开发类
  {
    id: 'npm-run',
    pattern: {
      type: 'prefix',
      executable: 'npm',
      allowedSubcommands: [
        ['run'],
        ['start'],
        ['test'],
        ['run', 'dev'],
        ['run', 'build'],
        ['run', 'lint'],
      ],
    },
    source: 'builtin',
    description: 'npm 脚本执行',
  },
  {
    id: 'npx-exec',
    pattern: { type: 'exact', executable: 'npx' },
    source: 'builtin',
    description: 'npx 执行',
  },
  {
    id: 'node-exec',
    pattern: { type: 'exact', executable: 'node' },
    source: 'builtin',
    description: 'Node.js 执行',
  },

  // Git 只读操作
  {
    id: 'git-read',
    pattern: {
      type: 'prefix',
      executable: 'git',
      allowedSubcommands: [
        ['status'],
        ['log'],
        ['diff'],
        ['branch'],
        ['show'],
      ],
    },
    source: 'builtin',
    description: 'Git 只读操作',
  },

  // 信息查询类
  {
    id: 'which',
    pattern: { type: 'exact', executable: 'which' },
    source: 'builtin',
    description: '查找命令路径',
  },
  {
    id: 'echo',
    pattern: { type: 'exact', executable: 'echo' },
    source: 'builtin',
    description: '输出文本',
  },
]

// ===== 危险标志位黑名单 =====

/**
 * 危险标志位映射表
 * 即使命令匹配白名单，包含这些标志位时仍需人工审批
 * key 为主命令名，value 为该命令的危险标志位集合
 */
export const DANGEROUS_FLAGS: Record<string, Set<string>> = {
  rm: new Set(['-r', '-rf', '-fr', '--recursive', '--force']),
  chmod: new Set(['-R', '--recursive']),
  chown: new Set(['-R', '--recursive']),
  npm: new Set(['--global', '-g']),
  yarn: new Set(['global']),
}

// ===== 匹配算法 =====

/**
 * 判断两个字符串数组是否完全相等
 *
 * @param a - 第一个数组
 * @param b - 第二个数组
 * @returns 两个数组长度相同且每个元素相等时返回 true
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, idx) => val === b[idx])
}

/**
 * 判断规范化命令是否匹配指定的命令模式
 *
 * @param cmd - 规范化后的命令对象
 * @param pattern - 要匹配的命令模式
 * @returns 匹配成功返回 true
 */
export function matchPattern(
  cmd: NormalizedCommand,
  pattern: CommandPattern
): boolean {
  switch (pattern.type) {
    case 'exact':
      // 精确匹配：主命令名一致，子命令（如有）也完全一致
      return (
        cmd.executable === pattern.executable &&
        (!pattern.subcommands ||
          arraysEqual(cmd.subcommand, pattern.subcommands))
      )

    case 'prefix':
      // 前缀匹配：主命令名一致，子命令匹配允许列表中的某一项
      return (
        cmd.executable === pattern.executable &&
        pattern.allowedSubcommands.some((allowed) =>
          arraysEqual(cmd.subcommand.slice(0, allowed.length), allowed)
        )
      )

    case 'glob':
      // glob 匹配：对原始命令字符串进行 glob 模式匹配
      return minimatch(cmd.rawCommand, pattern.pattern)

    case 'regex':
      // 正则匹配：对原始命令字符串进行正则表达式匹配
      return pattern.pattern.test(cmd.rawCommand)
  }
}

/**
 * 检查命令是否包含危险标志位
 *
 * @param cmd - 规范化后的命令对象
 * @returns 检测到的危险标志位列表（空数组表示无危险标志位）
 */
export function checkDangerousFlags(cmd: NormalizedCommand): string[] {
  const dangerous = DANGEROUS_FLAGS[cmd.executable]
  if (!dangerous) return []
  return [...cmd.flags].filter((flag) => dangerous.has(flag))
}

/**
 * 对规范化命令执行白名单匹配
 *
 * 匹配逻辑：
 * 1. 管道链中的每个命令都必须通过白名单
 * 2. 逐规则匹配主命令
 * 3. 即使匹配白名单，也检查危险标志位 — 有危险标志位则不放行
 *
 * @param cmd - 规范化后的命令对象
 * @param rules - 白名单规则集（内置 + 全局 + 项目级）
 * @returns 匹配结果
 */
export function matchWhitelist(
  cmd: NormalizedCommand,
  rules: WhitelistRule[]
): MatchResult {
  // 1. 检查管道链 — 管道中的每个命令都必须通过白名单
  if (cmd.pipes.length > 0) {
    for (const pipedCmd of cmd.pipes) {
      const pipeResult = matchWhitelist(pipedCmd, rules)
      if (!pipeResult.matched) {
        return {
          matched: false,
          hasDangerousFlags: pipeResult.hasDangerousFlags,
          dangerousFlags: pipeResult.dangerousFlags,
        }
      }
    }
  }

  // 2. 逐规则匹配主命令
  for (const rule of rules) {
    if (matchPattern(cmd, rule.pattern)) {
      // 3. 即使匹配白名单，也检查危险标志位
      const dangerousFlags = checkDangerousFlags(cmd)
      return {
        matched: dangerousFlags.length === 0,
        rule,
        hasDangerousFlags: dangerousFlags.length > 0,
        dangerousFlags,
      }
    }
  }

  // 未匹配任何规则
  return { matched: false, hasDangerousFlags: false, dangerousFlags: [] }
}

// ===== 项目级白名单配置加载 =====

/**
 * 项目级白名单配置文件格式
 * 对应 .fule/command-whitelist.json
 */
interface ProjectWhitelistConfig {
  /** 配置版本号 */
  version: number
  /** 自定义规则列表 */
  rules: Array<{
    /** 规则唯一标识 */
    id: string
    /** 命令匹配模式（JSON 序列化格式，不含 RegExp） */
    pattern: ProjectCommandPattern
    /** 规则描述 */
    description: string
  }>
}

/** 项目配置中的命令模式（JSON 可序列化，不支持 regex 类型） */
type ProjectCommandPattern =
  | { type: 'exact'; executable: string; subcommands?: string[] }
  | { type: 'prefix'; executable: string; allowedSubcommands: string[][] }
  | { type: 'glob'; pattern: string }

/**
 * 从 JSON 字符串加载项目级白名单配置
 *
 * @param jsonContent - .fule/command-whitelist.json 文件内容
 * @returns 解析后的白名单规则数组（source 标记为 'project'）
 */
export function loadProjectWhitelist(jsonContent: string): WhitelistRule[] {
  const config: ProjectWhitelistConfig = JSON.parse(jsonContent)
  return config.rules.map((rule) => ({
    id: rule.id,
    pattern: rule.pattern as CommandPattern,
    source: 'project' as const,
    description: rule.description,
  }))
}
