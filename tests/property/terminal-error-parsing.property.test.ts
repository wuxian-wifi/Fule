/**
 * Property 10: 终端错误堆栈解析
 * 验证: 需求 7.3
 *
 * 对任意包含标准错误模式的终端输出字符串，解析器应正确提取错误类型、消息、
 * 源文件路径和行号。使用自定义错误字符串生成器。
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'

import {
  parseTerminalOutput,
  extractFullStack,
  extractSourceLocation,
} from '@renderer/services/error-interceptors/terminal-error-interceptor'
import { ErrorType } from '@renderer/services/error-interceptors/types'

// ===== 自定义生成器 =====

/** 安全的错误消息生成器（避免包含换行符，且不以空白开头，防止被正则 \s+ 吞掉） */
const errorMessageArb = fc
  .tuple(
    // 首字符不能是空白，避免被正则中的 \s+ 消费
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
    ),
    fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-\'".()[]{}:,;!?'.split(''),
      ),
      { minLength: 0, maxLength: 79 },
    ),
  )
  .map(([first, rest]) => `${first}${rest}`)

/** 文件名生成器（合法的文件路径字符） */
const fileNameArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'.split(''),
  ),
  { minLength: 1, maxLength: 20 },
)

/** 文件扩展名生成器 */
const fileExtArb = fc.constantFrom('ts', 'tsx', 'js', 'jsx', 'vue', 'mjs', 'cjs')

/** 源文件路径生成器（如 src/components/App.tsx） */
const sourceFilePathArb = fc
  .tuple(
    fc.array(fileNameArb, { minLength: 1, maxLength: 3 }),
    fileNameArb,
    fileExtArb,
  )
  .map(([dirs, name, ext]) => `${dirs.join('/')}/${name}.${ext}`)

/** 行号生成器 */
const lineNumberArb = fc.integer({ min: 1, max: 9999 })

/** 列号生成器 */
const columnNumberArb = fc.integer({ min: 1, max: 200 })

/** Node.js 错误类型生成器 */
const nodeErrorTypeArb = fc.constantFrom(
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'URIError',
  'EvalError',
)

/**
 * Node.js 错误输出生成器
 * 生成格式：ErrorType: message\n    at func (./path/to/file.ext:line:col)
 */
const nodeErrorOutputArb = fc
  .tuple(
    nodeErrorTypeArb,
    errorMessageArb,
    sourceFilePathArb,
    lineNumberArb,
    columnNumberArb,
    fc.array(
      fc.tuple(fileNameArb, sourceFilePathArb, lineNumberArb, columnNumberArb),
      { minLength: 0, maxLength: 3 },
    ),
  )
  .map(([errorType, message, file, line, col, extraFrames]) => {
    const lines = [`${errorType}: ${message}`]
    lines.push(`    at handler (./${file}:${line}:${col})`)
    for (const [func, f, l, c] of extraFrames) {
      lines.push(`    at ${func} (./${f}:${l}:${c})`)
    }
    return {
      output: lines.join('\n'),
      expectedMessage: message,
      expectedFile: file,
      expectedLine: line,
    }
  })

/**
 * npm 错误输出生成器
 * 生成格式：npm ERR! message
 */
const npmErrorOutputArb = errorMessageArb.map((message) => ({
  output: `npm ERR! ${message}`,
  expectedMessage: message,
}))

/**
 * 通用 stderr 错误输出生成器
 * 生成格式：error: message 或 error[tag]: message
 */
const genericErrorOutputArb = fc
  .tuple(
    errorMessageArb,
    fc.option(
      fc.stringOf(
        fc.constantFrom(
          ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
        ),
        { minLength: 1, maxLength: 6 },
      ),
      { nil: undefined },
    ),
  )
  .map(([message, tag]) => {
    const prefix = tag ? `error[${tag}]` : 'error'
    return {
      output: `${prefix}: ${message}`,
      expectedMessage: message,
    }
  })

/**
 * Vite 编译错误输出生成器
 * 生成格式：[vite] SomeError: message
 */
const viteErrorOutputArb = fc
  .tuple(errorMessageArb, sourceFilePathArb, lineNumberArb)
  .map(([message, file, line]) => ({
    output: `[vite] TransformError: ${message}\n  > ./${file}:${line}:0`,
    expectedMessage: `TransformError: ${message}`,
  }))

/**
 * Webpack 编译错误输出生成器
 * 生成格式：ERROR in ./path/to/file.ext
 */
const webpackErrorOutputArb = fc
  .tuple(sourceFilePathArb, errorMessageArb)
  .map(([file, message]) => ({
    output: `ERROR in ./${file}\n${message}`,
    expectedFile: file,
  }))

// ===== 属性测试 =====

describe('Property 10: 终端错误堆栈解析', () => {
  it('对任意 Node.js 错误输出，应正确提取错误消息、源文件和行号', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意生成的 Node.js 错误输出字符串，parseTerminalOutput 应：
     * 1. 返回非 null 结果
     * 2. 正确提取错误消息
     * 3. 正确提取源文件路径
     * 4. 正确提取行号
     */
    fc.assert(
      fc.property(nodeErrorOutputArb, ({ output, expectedMessage, expectedFile, expectedLine }) => {
        const result = parseTerminalOutput(output)

        // 应成功解析
        expect(result).not.toBeNull()
        expect(result!.type).toBe(ErrorType.TERMINAL_ERROR)

        // 应正确提取错误消息
        expect(result!.message).toBe(expectedMessage)

        // 应正确提取源文件路径
        expect(result!.sourceFile).toBe(expectedFile)

        // 应正确提取行号
        expect(result!.sourceLine).toBe(expectedLine)
      }),
      { numRuns: 100 },
    )
  })

  it('对任意 npm 错误输出，应正确提取错误消息', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意生成的 npm 错误输出字符串，parseTerminalOutput 应正确提取错误消息
     */
    fc.assert(
      fc.property(npmErrorOutputArb, ({ output, expectedMessage }) => {
        const result = parseTerminalOutput(output)

        expect(result).not.toBeNull()
        expect(result!.type).toBe(ErrorType.TERMINAL_ERROR)
        expect(result!.message).toBe(expectedMessage)
      }),
      { numRuns: 100 },
    )
  })

  it('对任意通用 stderr 错误输出，应正确提取错误消息', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意生成的通用 stderr 错误输出字符串，parseTerminalOutput 应正确提取错误消息
     */
    fc.assert(
      fc.property(genericErrorOutputArb, ({ output, expectedMessage }) => {
        const result = parseTerminalOutput(output)

        expect(result).not.toBeNull()
        expect(result!.type).toBe(ErrorType.TERMINAL_ERROR)
        expect(result!.message).toBe(expectedMessage)
      }),
      { numRuns: 100 },
    )
  })

  it('解析结果应始终包含有效的 id、timestamp 和 fingerprint', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意包含错误模式的终端输出，解析结果的结构化字段应始终有效
     */
    fc.assert(
      fc.property(nodeErrorOutputArb, ({ output }) => {
        const result = parseTerminalOutput(output)

        expect(result).not.toBeNull()
        // id 应非空
        expect(result!.id).toBeTruthy()
        expect(typeof result!.id).toBe('string')
        // timestamp 应为正数
        expect(result!.timestamp).toBeGreaterThan(0)
        // fingerprint 应非空
        expect(result!.fingerprint).toBeTruthy()
        expect(typeof result!.fingerprint).toBe('string')
      }),
      { numRuns: 100 },
    )
  })

  it('extractFullStack 应始终包含错误首行', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意错误输出，extractFullStack 提取的堆栈应始终包含错误首行
     */
    fc.assert(
      fc.property(nodeErrorOutputArb, ({ output }) => {
        const stack = extractFullStack(output, 0)
        const firstLine = output.split('\n')[0]

        // 堆栈应包含错误首行
        expect(stack).toContain(firstLine)
      }),
      { numRuns: 100 },
    )
  })

  it('extractSourceLocation 对包含有效路径的堆栈应返回非 null', () => {
    /**
     * Validates: Requirements 7.3
     *
     * 对任意包含 ./path/to/file.ext:line:col 格式的堆栈字符串，
     * extractSourceLocation 应成功提取文件路径和行号
     */
    fc.assert(
      fc.property(
        sourceFilePathArb,
        lineNumberArb,
        columnNumberArb,
        (file, line, col) => {
          const stack = `Error: test\n    at handler (./${file}:${line}:${col})`
          const location = extractSourceLocation(stack)

          expect(location).not.toBeNull()
          expect(location!.file).toBe(file)
          expect(location!.line).toBe(line)
        },
      ),
      { numRuns: 100 },
    )
  })
})
