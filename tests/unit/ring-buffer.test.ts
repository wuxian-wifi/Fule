import { describe, it, expect } from 'vitest'
import { RingBuffer } from '@renderer/utils/ring-buffer'

describe('RingBuffer - 环形缓冲区', () => {
  describe('构造函数', () => {
    it('应正确初始化指定容量的缓冲区', () => {
      const buf = new RingBuffer<number>(5)
      expect(buf.capacity).toBe(5)
      expect(buf.size).toBe(0)
      expect(buf.isFull).toBe(false)
    })

    it('容量为 0 或负数时应抛出错误', () => {
      expect(() => new RingBuffer(0)).toThrow()
      expect(() => new RingBuffer(-1)).toThrow()
    })
  })

  describe('push - 追加元素', () => {
    it('应能追加元素并增加 size', () => {
      const buf = new RingBuffer<number>(3)
      buf.push(1)
      expect(buf.size).toBe(1)
      buf.push(2)
      expect(buf.size).toBe(2)
    })

    it('缓冲区满后继续追加应覆盖最旧元素', () => {
      const buf = new RingBuffer<number>(3)
      buf.push(1)
      buf.push(2)
      buf.push(3)
      expect(buf.isFull).toBe(true)

      // 覆盖最旧的 1
      buf.push(4)
      expect(buf.size).toBe(3)
      expect(buf.toArray()).toEqual([2, 3, 4])
    })

    it('容量为 1 时每次 push 都覆盖', () => {
      const buf = new RingBuffer<string>(1)
      buf.push('a')
      expect(buf.toArray()).toEqual(['a'])
      buf.push('b')
      expect(buf.toArray()).toEqual(['b'])
      expect(buf.size).toBe(1)
    })
  })

  describe('toArray - 按插入顺序输出', () => {
    it('空缓冲区应返回空数组', () => {
      const buf = new RingBuffer<number>(5)
      expect(buf.toArray()).toEqual([])
    })

    it('未满时应按插入顺序返回所有元素', () => {
      const buf = new RingBuffer<number>(5)
      buf.push(10)
      buf.push(20)
      buf.push(30)
      expect(buf.toArray()).toEqual([10, 20, 30])
    })

    it('溢出后应按正确顺序返回最新的 N 个元素', () => {
      const buf = new RingBuffer<number>(3)
      for (let i = 1; i <= 7; i++) {
        buf.push(i)
      }
      // 容量 3，最新的 3 个是 5, 6, 7
      expect(buf.toArray()).toEqual([5, 6, 7])
    })
  })

  describe('isFull - 满状态检测', () => {
    it('未满时应返回 false', () => {
      const buf = new RingBuffer<number>(3)
      buf.push(1)
      buf.push(2)
      expect(buf.isFull).toBe(false)
    })

    it('刚好满时应返回 true', () => {
      const buf = new RingBuffer<number>(2)
      buf.push(1)
      buf.push(2)
      expect(buf.isFull).toBe(true)
    })
  })

  describe('clear - 清空缓冲区', () => {
    it('清空后 size 应为 0 且 toArray 返回空', () => {
      const buf = new RingBuffer<number>(3)
      buf.push(1)
      buf.push(2)
      buf.clear()
      expect(buf.size).toBe(0)
      expect(buf.isFull).toBe(false)
      expect(buf.toArray()).toEqual([])
    })

    it('清空后应能正常继续使用', () => {
      const buf = new RingBuffer<number>(2)
      buf.push(1)
      buf.push(2)
      buf.clear()
      buf.push(3)
      expect(buf.toArray()).toEqual([3])
    })
  })
})
