import { describe, it, expect, beforeEach } from 'vitest'
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'

describe('FingerprintCalculator - 文件指纹计算器', () => {
  let calculator: FingerprintCalculator

  beforeEach(async () => {
    calculator = new FingerprintCalculator()
    await calculator.init()
  })

  describe('init - 初始化', () => {
    it('初始化后应能正常计算指纹', async () => {
      const calc = new FingerprintCalculator()
      await calc.init()
      const hash = calc.calculate('hello')
      expect(typeof hash).toBe('string')
      expect(hash.length).toBeGreaterThan(0)
    })

    it('未初始化时调用 calculate 应抛出错误', () => {
      const calc = new FingerprintCalculator()
      expect(() => calc.calculate('test')).toThrow('未初始化')
    })
  })

  describe('calculate - 指纹计算', () => {
    it('相同字符串输入应产生相同指纹', () => {
      const hash1 = calculator.calculate('hello world')
      const hash2 = calculator.calculate('hello world')
      expect(hash1).toBe(hash2)
    })

    it('不同字符串输入应产生不同指纹', () => {
      const hash1 = calculator.calculate('hello')
      const hash2 = calculator.calculate('world')
      expect(hash1).not.toBe(hash2)
    })

    it('空字符串应产生有效指纹', () => {
      const hash = calculator.calculate('')
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(16) // 两个 32 位十六进制 = 16 字符
    })

    it('指纹应为十六进制字符串', () => {
      const hash = calculator.calculate('test content')
      expect(hash).toMatch(/^[0-9a-f]{16}$/)
    })

    it('支持 Uint8Array 输入', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
      const hash = calculator.calculate(data)
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(16)
    })

    it('字符串与等价 Uint8Array 应产生相同指纹', () => {
      const text = 'Hello'
      const bytes = new TextEncoder().encode(text)
      const hashFromString = calculator.calculate(text)
      const hashFromBytes = calculator.calculate(bytes)
      expect(hashFromString).toBe(hashFromBytes)
    })

    it('包含中文字符的内容应正常计算指纹', () => {
      const hash1 = calculator.calculate('你好世界')
      const hash2 = calculator.calculate('你好世界')
      expect(hash1).toBe(hash2)

      const hash3 = calculator.calculate('你好')
      expect(hash1).not.toBe(hash3)
    })

    it('包含特殊字符的内容应正常计算指纹', () => {
      const hash = calculator.calculate('line1\nline2\ttab\r\n')
      expect(hash).toMatch(/^[0-9a-f]{16}$/)
    })
  })
})
