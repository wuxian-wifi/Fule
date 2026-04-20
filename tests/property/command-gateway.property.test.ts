/**
 * Property 7: Command Gateway 命令分类正确性
 * 验证: 需求 5.2, 5.3, 5.4
 *
 * 对任意 Shell 命令和白名单规则集，匹配白名单且无危险标志位应放行；
 * 否则应阻止并触发审批。
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import { normalizeCommand } from '@main/services/command-gateway/command-normalizer'
import {
  matchWhitelist,
  matchPattern,
  checkDangerousFlags,
  BUILTIN_WHITELIST,
  DANGEROUS_FLAGS,
} from '@main/services/command-gateway/whitelist-engine'
import type {
  WhitelistRule,
  CommandPattern,
} from '@main/services/command-gateway/whitelist-engine'

// ===== 生成器定义 =====

/** 安全的可执行命令名生成器（避免特殊字符干扰词法分析） */
const executableArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
  ),
  { minLength: 1, maxLength: 15 }
)

/** 子命令生成器 */
const subcommandArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')
  ),
  { minLength: 1, maxLength: 10 }
)

/** 标志位生成器 — 生成合法的 Shell 标志位 */
const flagArb = fc.oneof(
  // 短标志位：-x
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyz'.split('')
  ).map((c) => `-${c}`),
  // 长标志位：--xxx
  fc.stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyz-'.split('')
    ),
    { minLength: 2, maxLength: 12 }
  ).map((s) => `--${s}`)
)

/** 命令结构生成器 */
const commandRecordArb = fc.record({
  executable: executableArb,
  subcommands: fc.array(subcommandArb, { minLength: 0, maxLength: 2 }),
  flags: fc.array(flagArb, { minLength: 0, maxLength: 3 }),
})

/** exact 模式白名单规则生成器 */
const exactPatternArb = fc.record({
  executable: executableArb,
  subcommands: fc.option(
    fc.array(subcommandArb, { minLength: 1, maxLength: 2 }),
    { nil: undefined }
  ),
}).map(
  (r): CommandPattern => ({
    type: 'exact',
    executable: r.executable,
    subcommands: r.subcommands,
  })
)

/** prefix 模式白名单规则生成器 */
const prefixPatternArb = fc.record({
  executable: executableArb,
  allowedSubcommands: fc.array(
    fc.array(subcommandArb, { minLength: 1, maxLength: 2 }),
    { minLength: 1, maxLength: 3 }
  ),
}).map(
  (r): CommandPattern => ({
    type: 'prefix',
    executable: r.executable,
    allowedSubcommands: r.allowedSubcommands,
  })
)

/** 白名单规则生成器（仅 exact 和 prefix，避免 glob/regex 的复杂性） */
const whitelistRuleArb: fc.Arbitrary<WhitelistRule> = fc
  .record({
    id: fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')
      ),
      { minLength: 3, maxLength: 15 }
    ),
    pattern: fc.oneof(exactPatternArb, prefixPatternArb),
    source: fc.constantFrom('builtin' as const, 'global' as const, 'project' as const),
    description: fc.constant('测试规则'),
  })

describe('Property 7: Command Gateway 命令分类正确性', () => {
  it('匹配白名单且无危险标志位的命令应放行', () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * 构造一个命令，使其精确匹配某条白名单规则，
     * 且不包含任何危险标志位，验证 matchWhitelist 返回 matched=true
     */
    fc.assert(
      fc.property(
        executableArb,
        fc.array(subcommandArb, { minLength: 0, maxLength: 2 }),
        (executable, subcommands) => {
          // 构造命令字符串：executable + subcommands（不加任何危险标志位）
          const rawCmd = [executable, ...subcommands].join(' ')
          const cmd = normalizeCommand(rawCmd)

          // 构造精确匹配该命令的白名单规则
          const rule: WhitelistRule = {
            id: 'test-rule',
            pattern: {
              type: 'exact',
              executable: cmd.executable,
              subcommands:
                cmd.subcommand.length > 0 ? cmd.subcommand : undefined,
            },
            source: 'builtin',
            description: '测试规则',
          }

          const result = matchWhitelist(cmd, [rule])

          // 无危险标志位时应放行
          if (!result.hasDangerousFlags) {
            expect(result.matched).toBe(true)
            expect(result.rule).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('不匹配任何白名单规则的命令应被阻止', () => {
    /**
     * Validates: Requirements 5.3, 5.4
     *
     * 对任意命令和不包含该命令的白名单规则集，
     * matchWhitelist 应返回 matched=false
     */
    fc.assert(
      fc.property(
        commandRecordArb,
        fc.array(whitelistRuleArb, { minLength: 0, maxLength: 5 }),
        ({ executable, subcommands, flags }, rules) => {
          // 构造命令字符串
          const rawCmd = [executable, ...subcommands, ...flags].join(' ')
          const cmd = normalizeCommand(rawCmd)

          // 过滤掉可能意外匹配的规则
          const nonMatchingRules = rules.filter(
            (rule) => !matchPattern(cmd, rule.pattern)
          )

          const result = matchWhitelist(cmd, nonMatchingRules)

          // 无匹配规则时应阻止
          expect(result.matched).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('包含危险标志位的命令即使匹配白名单也应被阻止', () => {
    /**
     * Validates: Requirements 5.3
     *
     * 对 DANGEROUS_FLAGS 中定义的命令和以 `-` 开头的危险标志位组合，
     * 即使命令匹配白名单规则，也应因危险标志位被阻止。
     * 注意：yarn 的 "global" 不以 `-` 开头，会被归类为子命令而非标志位，
     * 因此只测试标志位格式的危险项。
     */

    // 构造 [executable, dangerousFlag] 对，仅包含以 `-` 开头的标志位
    const dangerousPairs: Array<[string, string]> = []
    for (const [exec, flagSet] of Object.entries(DANGEROUS_FLAGS)) {
      for (const flag of flagSet) {
        if (flag.startsWith('-')) {
          dangerousPairs.push([exec, flag])
        }
      }
    }

    fc.assert(
      fc.property(
        fc.constantFrom(...dangerousPairs),
        ([executable, dangerousFlag]) => {
          // 构造包含危险标志位的命令
          const rawCmd = `${executable} ${dangerousFlag} somefile`
          const cmd = normalizeCommand(rawCmd)

          // 构造匹配该命令的白名单规则
          const rule: WhitelistRule = {
            id: 'test-dangerous',
            pattern: { type: 'exact', executable },
            source: 'builtin',
            description: '测试危险标志位',
          }

          const result = matchWhitelist(cmd, [rule])

          // 应检测到危险标志位
          expect(result.hasDangerousFlags).toBe(true)
          expect(result.dangerousFlags.length).toBeGreaterThan(0)
          // 应被阻止
          expect(result.matched).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('管道链中所有命令都匹配白名单时应放行', () => {
    /**
     * Validates: Requirements 5.2
     *
     * 构造管道链命令，每个管道段都在白名单中，
     * 验证整条管道链被放行
     */
    fc.assert(
      fc.property(
        // 从内置白名单的 exact 类型规则中选取命令
        fc.constantFrom('ls', 'cat', 'head', 'tail', 'wc', 'echo', 'pwd'),
        fc.constantFrom('ls', 'cat', 'head', 'tail', 'wc', 'echo', 'pwd'),
        (cmd1, cmd2) => {
          const rawCmd = `${cmd1} | ${cmd2}`
          const cmd = normalizeCommand(rawCmd)
          const result = matchWhitelist(cmd, BUILTIN_WHITELIST)

          // 两个命令都在内置白名单中，应放行
          expect(result.matched).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('管道链中任一命令不在白名单时整条链应被阻止', () => {
    /**
     * Validates: Requirements 5.2, 5.4
     *
     * 构造管道链命令，其中一个管道段不在白名单中，
     * 验证整条管道链被阻止
     */
    fc.assert(
      fc.property(
        // 第一个命令在白名单中
        fc.constantFrom('ls', 'cat', 'head'),
        // 第二个命令不在白名单中（使用随机生成的命令名）
        executableArb,
        (safeCmd, unsafeCmd) => {
          // 确保不安全命令确实不在内置白名单中
          const testCmd = normalizeCommand(unsafeCmd)
          const testResult = matchWhitelist(testCmd, BUILTIN_WHITELIST)
          fc.pre(!testResult.matched)

          const rawCmd = `${safeCmd} | ${unsafeCmd}`
          const cmd = normalizeCommand(rawCmd)
          const result = matchWhitelist(cmd, BUILTIN_WHITELIST)

          // 管道链中有不安全命令，应阻止
          expect(result.matched).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('checkDangerousFlags 对不在黑名单中的命令应返回空数组', () => {
    /**
     * Validates: Requirements 5.3
     *
     * 对任意不在 DANGEROUS_FLAGS 中的命令，
     * checkDangerousFlags 应始终返回空数组
     */
    fc.assert(
      fc.property(
        executableArb,
        fc.array(flagArb, { minLength: 0, maxLength: 5 }),
        (executable, flags) => {
          // 确保命令不在危险标志位映射表中
          fc.pre(!(executable in DANGEROUS_FLAGS))

          const rawCmd = [executable, ...flags].join(' ')
          const cmd = normalizeCommand(rawCmd)
          const result = checkDangerousFlags(cmd)

          expect(result).toEqual([])
        }
      ),
      { numRuns: 100 }
    )
  })
})
