/**
 * Terminal 错误拦截器单元测试
 * 测试 parseTerminalOutput、extractFullStack、extractSourceLocation 的核心逻辑
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  parseTerminalOutput,
  extractFullStack,
  extractSourceLocation,
  TerminalErrorInterceptor,
  ERROR_PATTERNS,
} from '@renderer/services/error-interceptors/terminal-error-interceptor'
import { ErrorType } from '@renderer/services/error-interceptors/types'

describe('parseTerminalOutput 终端输出解析', () => {
  it('应正确解析 Node.js TypeError', () => {
    const output = `TypeError: Cannot read properties of undefined (reading 'map')
    at renderList (./src/components/List.tsx:42:10)
    at Object.render (./src/App.tsx:15:3)`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.type).toBe(ErrorType.TERMINAL_ERROR)
    expect(result!.message).toBe(
      "Cannot read properties of undefined (reading 'map')",
    )
    expect(result!.sourceFile).toBe('src/components/List.tsx')
    expect(result!.sourceLine).toBe(42)
  })

  it('应正确解析 Node.js ReferenceError', () => {
    const output = `ReferenceError: myVariable is not defined
    at main (./src/index.ts:10:5)`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toBe('myVariable is not defined')
    expect(result!.sourceFile).toBe('src/index.ts')
    expect(result!.sourceLine).toBe(10)
  })

  it('应正确解析 Node.js SyntaxError', () => {
    const output = `SyntaxError: Unexpected token '}'
    at Object.compileFunction (node:vm:360:18)`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toBe("Unexpected token '}'")
  })

  it('应正确解析 Vite 编译错误', () => {
    const output = `[vite] Internal server Error: Transform failed with 1 error
  > ./src/App.tsx:25:0
    25 |  const x = {`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toContain('Error')
  })

  it('应正确解析 Webpack 编译错误', () => {
    const output = `ERROR in ./src/components/Button.tsx
Module build failed: SyntaxError: Unexpected token (15:3)`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toContain('./src/components/Button.tsx')
  })

  it('应正确解析 npm 错误', () => {
    const output = `npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toBe('code ERESOLVE')
  })

  it('应正确解析通用 stderr 错误', () => {
    const output = `error: Something went wrong in the build process`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toBe(
      'Something went wrong in the build process',
    )
  })

  it('应正确解析带方括号标签的通用错误', () => {
    const output = `error[E0001]: mismatched types found`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.message).toBe('mismatched types found')
  })

  it('无错误模式的输出应返回 null', () => {
    const output = `> fule-ide@0.1.0 dev
> electron-vite dev

Server running at http://localhost:5173`

    const result = parseTerminalOutput(output)

    expect(result).toBeNull()
  })

  it('空字符串应返回 null', () => {
    expect(parseTerminalOutput('')).toBeNull()
  })

  it('解析结果应包含完整的 CapturedError 结构', () => {
    const output = `Error: Connection refused
    at connect (./src/services/api.ts:88:12)`

    const result = parseTerminalOutput(output)

    expect(result).not.toBeNull()
    expect(result!.id).toBeTruthy()
    expect(result!.type).toBe(ErrorType.TERMINAL_ERROR)
    expect(result!.timestamp).toBeGreaterThan(0)
    expect(result!.fingerprint).toBeTruthy()
    expect(result!.context).toBeDefined()
    expect(result!.raw).toBe(output)
  })
})

describe('extractFullStack 堆栈提取', () => {
  it('应提取以 "at " 开头的堆栈行', () => {
    const output = `TypeError: Cannot read property 'x' of null
    at Foo (./src/foo.ts:10:5)
    at Bar (./src/bar.ts:20:3)
some other output`

    const stack = extractFullStack(output, 0)

    expect(stack).toContain('TypeError:')
    expect(stack).toContain('at Foo')
    expect(stack).toContain('at Bar')
    expect(stack).not.toContain('some other output')
  })

  it('应提取包含行号指示符的代码行', () => {
    const output = `SyntaxError: Unexpected token
  10 | const x = {
  11 |   foo: bar
  12 | }
next line`

    const stack = extractFullStack(output, 0)

    expect(stack).toContain('SyntaxError:')
    expect(stack).toContain('10 |')
    expect(stack).toContain('12 |')
    expect(stack).not.toContain('next line')
  })

  it('应从指定的 errorIndex 开始提取', () => {
    const output = `some prefix output
TypeError: Something failed
    at main (./src/index.ts:5:1)`

    const errorIndex = output.indexOf('TypeError:')
    const stack = extractFullStack(output, errorIndex)

    expect(stack).toContain('TypeError:')
    expect(stack).toContain('at main')
    expect(stack).not.toContain('some prefix output')
  })

  it('只有错误行没有堆栈时应只返回错误行', () => {
    const output = `Error: simple error
no stack here`

    const stack = extractFullStack(output, 0)

    expect(stack).toBe('Error: simple error')
  })
})

describe('extractSourceLocation 源文件位置提取', () => {
  it('应从绝对路径格式提取文件和行号', () => {
    const stack = `TypeError: fail
    at render (/Users/dev/project/src/App.tsx:42:10)`

    const location = extractSourceLocation(stack)

    expect(location).not.toBeNull()
    expect(location!.file).toBe('Users/dev/project/src/App.tsx')
    expect(location!.line).toBe(42)
  })

  it('应从相对路径格式提取文件和行号', () => {
    const stack = `Error: fail
    at handler (./src/services/api.ts:15:3)`

    const location = extractSourceLocation(stack)

    expect(location).not.toBeNull()
    expect(location!.file).toBe('src/services/api.ts')
    expect(location!.line).toBe(15)
  })

  it('无文件路径的堆栈应返回 null', () => {
    const stack = `Error: something went wrong
    at Object.<anonymous> (node:internal/main:1:1)`

    const location = extractSourceLocation(stack)

    // node: 协议路径不匹配 / 或 ./ 开头的模式
    expect(location).toBeNull()
  })

  it('空字符串应返回 null', () => {
    expect(extractSourceLocation('')).toBeNull()
  })
})

describe('TerminalErrorInterceptor 类', () => {
  let interceptor: TerminalErrorInterceptor

  beforeEach(() => {
    interceptor = new TerminalErrorInterceptor()
  })

  it('handleOutput 检测到错误时应触发回调', () => {
    const callback = vi.fn()
    interceptor.onError(callback)

    interceptor.handleOutput(`TypeError: Cannot read property 'x' of null
    at main (./src/index.ts:1:1)`)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].type).toBe(ErrorType.TERMINAL_ERROR)
  })

  it('handleOutput 无错误时不应触发回调', () => {
    const callback = vi.fn()
    interceptor.onError(callback)

    interceptor.handleOutput('Server started on port 3000')

    expect(callback).not.toHaveBeenCalled()
  })

  it('onError 返回的函数应取消注册回调', () => {
    const callback = vi.fn()
    const unsubscribe = interceptor.onError(callback)

    unsubscribe()

    interceptor.handleOutput('Error: test error')

    expect(callback).not.toHaveBeenCalled()
  })

  it('dispose 后不应再触发回调', () => {
    const callback = vi.fn()
    interceptor.onError(callback)

    interceptor.dispose()

    interceptor.handleOutput('Error: test error')

    expect(callback).not.toHaveBeenCalled()
  })

  it('应支持多个回调同时注册', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()
    interceptor.onError(callback1)
    interceptor.onError(callback2)

    interceptor.handleOutput('Error: test error')

    expect(callback1).toHaveBeenCalledTimes(1)
    expect(callback2).toHaveBeenCalledTimes(1)
  })
})

describe('ERROR_PATTERNS 错误模式覆盖', () => {
  it('应包含至少 5 种错误模式', () => {
    expect(ERROR_PATTERNS.length).toBeGreaterThanOrEqual(5)
  })

  it('每个模式应至少有一个捕获组', () => {
    // 验证每个正则都有捕获组（用于提取错误消息）
    for (const pattern of ERROR_PATTERNS) {
      const source = pattern.source
      expect(source).toContain('(')
    }
  })
})
