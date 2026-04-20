/**
 * 命令规范化模块
 * 将原始 Shell 命令字符串解析为结构化的 NormalizedCommand 对象，
 * 支持管道链解析、路径前缀剥离、子命令/标志位/位置参数分类
 */

import { shellTokenize } from './shell-tokenizer'

/** 规范化后的命令结构 */
export interface NormalizedCommand {
  /** 主命令，如 'npm', 'rm', 'git'（已去除路径前缀） */
  executable: string
  /** 子命令，如 ['run', 'dev'] */
  subcommand: string[]
  /** 标志位集合，如 {'--force', '-r'} */
  flags: Set<string>
  /** 位置参数（非标志位、非子命令的参数） */
  positionalArgs: string[]
  /** 原始命令字符串 */
  rawCommand: string
  /** 管道链中的后续命令 */
  pipes: NormalizedCommand[]
}

/**
 * 已知命令的子命令映射表
 * key 为主命令名，value 为该命令支持的子命令数量上限
 * 用于区分子命令和位置参数
 */
const KNOWN_SUBCOMMAND_COUNTS: Record<string, number> = {
  npm: 2,     // npm run dev, npm run build
  npx: 1,     // npx create-react-app
  yarn: 2,    // yarn workspace add
  pnpm: 2,    // pnpm run dev
  git: 2,     // git stash pop, git remote add
  docker: 2,  // docker compose up
  kubectl: 2, // kubectl get pods
  cargo: 1,   // cargo build
  pip: 1,     // pip install
  pip3: 1,    // pip3 install
  brew: 1,    // brew install
  apt: 1,     // apt install
  yum: 1,     // yum install
}

/**
 * 将原始 Shell 命令字符串规范化为结构化对象
 *
 * 处理流程：
 * 1. 去除首尾空白和多余空格
 * 2. 按管道符拆分为多个命令段
 * 3. 对第一个命令段进行词法分析
 * 4. 识别主命令（去除路径前缀）
 * 5. 分离子命令、标志位和位置参数
 * 6. 递归解析管道后续命令
 *
 * @param raw - 原始命令字符串
 * @returns 规范化后的命令对象
 */
export function normalizeCommand(raw: string): NormalizedCommand {
  // 去除首尾空白和多余空格
  const trimmed = raw.trim().replace(/\s+/g, ' ')

  // 解析管道链 — 每个管道段独立校验
  const pipeSegments = splitByPipes(trimmed)

  // 空命令处理（管道拆分后无任何段）
  if (pipeSegments.length === 0) {
    return {
      executable: '',
      subcommand: [],
      flags: new Set(),
      positionalArgs: [],
      rawCommand: raw,
      pipes: [],
    }
  }

  // 解析第一个命令段
  const tokens = shellTokenize(pipeSegments[0])

  // 空 token 处理（命令段解析后无有效 token）
  if (tokens.length === 0) {
    return {
      executable: '',
      subcommand: [],
      flags: new Set(),
      positionalArgs: [],
      rawCommand: raw,
      pipes: [],
    }
  }

  // 识别主命令（处理路径前缀，如 /usr/bin/rm → rm）
  const executable = extractBasename(tokens[0])

  // 分离子命令、标志位和位置参数
  const { subcommand, flags, positionalArgs } = classifyTokens(
    executable,
    tokens.slice(1),
  )

  // 递归解析管道后续命令
  const pipes = pipeSegments.slice(1).map((seg) => normalizeCommand(seg))

  return {
    executable,
    subcommand,
    flags,
    positionalArgs,
    rawCommand: raw,
    pipes,
  }
}

/**
 * 按管道符 `|` 拆分命令字符串，正确处理引号内的管道符
 *
 * 引号内的 `|` 不作为管道分隔符处理
 *
 * @param input - 经过空白规范化的命令字符串
 * @returns 管道段数组
 */
export function splitByPipes(input: string): string[] {
  const segments: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (const char of input) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true
      current += char
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    // 管道符在引号外才作为分隔符
    if (char === '|' && !inSingleQuote && !inDoubleQuote) {
      segments.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  // 处理最后一段
  const lastSegment = current.trim()
  if (lastSegment) {
    segments.push(lastSegment)
  }

  return segments
}

/**
 * 将 token 列表分类为子命令、标志位和位置参数
 *
 * 分类逻辑：
 * - 以 `-` 开头的 token 视为标志位
 * - 对于已知命令（npm, git, docker 等），前 N 个非标志位 token 视为子命令
 * - 对于未知命令，所有非标志位 token 视为位置参数
 *
 * @param executable - 主命令名
 * @param tokens - 主命令之后的 token 列表
 * @returns 分类结果
 */
export function classifyTokens(
  executable: string,
  tokens: string[],
): {
  subcommand: string[]
  flags: Set<string>
  positionalArgs: string[]
} {
  const flags = new Set<string>()
  const subcommand: string[] = []
  const positionalArgs: string[] = []

  // 查找该命令允许的最大子命令数量
  const maxSubcommands = KNOWN_SUBCOMMAND_COUNTS[executable] ?? 0

  let subcommandCount = 0

  for (const token of tokens) {
    // 标志位判断：以 `-` 开头
    if (token.startsWith('-')) {
      flags.add(token)
      continue
    }

    // 已知命令：前 N 个非标志位 token 作为子命令
    if (subcommandCount < maxSubcommands) {
      subcommand.push(token)
      subcommandCount++
      continue
    }

    // 其余作为位置参数
    positionalArgs.push(token)
  }

  return { subcommand, flags, positionalArgs }
}

/**
 * 从可能包含路径前缀的命令中提取基础命令名
 * 例如 /usr/bin/rm → rm, ./node_modules/.bin/vite → vite
 *
 * @param command - 可能包含路径的命令字符串
 * @returns 基础命令名
 */
function extractBasename(command: string): string {
  // 查找最后一个路径分隔符
  const lastSlash = command.lastIndexOf('/')
  if (lastSlash === -1) {
    return command
  }
  return command.substring(lastSlash + 1)
}
