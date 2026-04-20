/**
 * Shell 词法分析器
 * 将 Shell 命令字符串拆分为 token 数组，
 * 正确处理单引号、双引号和反斜杠转义
 */

/**
 * 将 Shell 命令字符串按照 Shell 语法规则拆分为 token 数组
 *
 * 规则：
 * - 单引号内的内容原样保留，不处理转义
 * - 双引号内的内容保留空格，但反斜杠仍可转义
 * - 反斜杠在非单引号环境下转义下一个字符
 * - 未被引号包裹的空格作为 token 分隔符
 *
 * @param input - 原始 Shell 命令字符串
 * @returns token 数组
 */
export function shellTokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false
  // 标记当前 token 是否由引号开启（用于区分空引号 "" 和无内容）
  let hasQuotedSegment = false

  for (const char of input) {
    // 上一个字符是反斜杠，当前字符直接追加（转义处理）
    if (escaped) {
      current += char
      escaped = false
      continue
    }

    // 反斜杠在单引号外才有转义功能
    if (char === '\\' && !inSingleQuote) {
      escaped = true
      continue
    }

    // 单引号切换（双引号内的单引号视为普通字符）
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      hasQuotedSegment = true
      continue
    }

    // 双引号切换（单引号内的双引号视为普通字符）
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      hasQuotedSegment = true
      continue
    }

    // 空格在引号外作为分隔符
    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current || hasQuotedSegment) {
        tokens.push(current)
        current = ''
        hasQuotedSegment = false
      }
      continue
    }

    current += char
  }

  // 处理末尾残留的 token（包括空引号产生的空字符串）
  if (current || hasQuotedSegment) {
    tokens.push(current)
  }

  return tokens
}
