import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FingerprintCalculator } from '@renderer/services/sync/fingerprint-calculator'
import { OperationTracker } from '@renderer/services/sync/operation-tracker'

describe('OperationTracker - 操作追踪器', () => {
  let fingerprinter: FingerprintCalculator
  let tracker: OperationTracker

  beforeEach(async () => {
    vi.useFakeTimers()
    fingerprinter = new FingerprintCalculator()
    await fingerprinter.init()
    tracker = new OperationTracker(fingerprinter)
  })

  afterEach(() => {
    tracker.dispose()
    vi.useRealTimers()
  })

  describe('recordOperation - 记录同步操作', () => {
    it('应返回唯一的操作 ID', () => {
      const id1 = tracker.recordOperation('a.ts', 'content1', 'electron')
      const id2 = tracker.recordOperation('b.ts', 'content2', 'webcontainer')
      expect(id1).toMatch(/^op_\d+$/)
      expect(id2).toMatch(/^op_\d+$/)
      expect(id1).not.toBe(id2)
    })

    it('同一文件的多次操作应递增序列号', () => {
      const id1 = tracker.recordOperation('a.ts', 'v1', 'electron')
      const id2 = tracker.recordOperation('a.ts', 'v2', 'electron')
      // 提取序列号并比较
      const seq1 = parseInt(id1.split('_')[1])
      const seq2 = parseInt(id2.split('_')[1])
      expect(seq2).toBeGreaterThan(seq1)
    })
  })

  describe('isEchoEvent - 回声事件检测', () => {
    it('记录 origin_A 写入后，收到 origin_B 的相同内容应判定为回声', () => {
      const content = 'export default function App() {}'
      tracker.recordOperation('app.tsx', content, 'electron')

      // WebContainers 触发相同内容的变更事件
      const echo = tracker.isEchoEvent('app.tsx', content, 'webcontainer')
      expect(echo).not.toBeNull()
      expect(echo!.origin).toBe('electron')
    })

    it('记录 origin_A 写入后，收到 origin_B 的不同内容应判定为非回声', () => {
      tracker.recordOperation('app.tsx', 'original content', 'electron')

      const echo = tracker.isEchoEvent('app.tsx', 'different content', 'webcontainer')
      expect(echo).toBeNull()
    })

    it('相同来源的相同内容不应判定为回声', () => {
      const content = 'same content'
      tracker.recordOperation('a.ts', content, 'electron')

      // 同一来源的事件不是回声
      const echo = tracker.isEchoEvent('a.ts', content, 'electron')
      expect(echo).toBeNull()
    })

    it('不同文件路径的相同内容不应判定为回声', () => {
      const content = 'shared content'
      tracker.recordOperation('a.ts', content, 'electron')

      const echo = tracker.isEchoEvent('b.ts', content, 'webcontainer')
      expect(echo).toBeNull()
    })

    it('没有记录的文件应返回 null', () => {
      const echo = tracker.isEchoEvent('unknown.ts', 'content', 'webcontainer')
      expect(echo).toBeNull()
    })

    it('回声记录应被一次性消费（匹配后移除）', () => {
      const content = 'one-time content'
      tracker.recordOperation('a.ts', content, 'electron')

      // 第一次匹配成功
      const echo1 = tracker.isEchoEvent('a.ts', content, 'webcontainer')
      expect(echo1).not.toBeNull()

      // 第二次匹配应失败（记录已被消费）
      const echo2 = tracker.isEchoEvent('a.ts', content, 'webcontainer')
      expect(echo2).toBeNull()
    })

    it('多次记录同一文件的不同内容，应能分别匹配', () => {
      tracker.recordOperation('a.ts', 'version1', 'electron')
      tracker.recordOperation('a.ts', 'version2', 'electron')

      // 匹配 version2
      const echo1 = tracker.isEchoEvent('a.ts', 'version2', 'webcontainer')
      expect(echo1).not.toBeNull()

      // 匹配 version1
      const echo2 = tracker.isEchoEvent('a.ts', 'version1', 'webcontainer')
      expect(echo2).not.toBeNull()
    })
  })

  describe('TTL 过期清理', () => {
    it('超过 TTL 的记录不应匹配为回声', () => {
      const content = 'expired content'
      tracker.recordOperation('a.ts', content, 'electron')

      // 快进超过 TTL（5 秒）
      vi.advanceTimersByTime(5001)

      const echo = tracker.isEchoEvent('a.ts', content, 'webcontainer')
      expect(echo).toBeNull()
    })

    it('未过期的记录应正常匹配', () => {
      const content = 'fresh content'
      tracker.recordOperation('a.ts', content, 'electron')

      // 快进 4 秒（未超过 5 秒 TTL）
      vi.advanceTimersByTime(4000)

      const echo = tracker.isEchoEvent('a.ts', content, 'webcontainer')
      expect(echo).not.toBeNull()
    })

    it('定期清理应移除过期记录', () => {
      tracker.recordOperation('a.ts', 'old', 'electron')

      // 快进超过 TTL + 清理间隔
      vi.advanceTimersByTime(15000)

      // 过期记录已被清理，即使内容匹配也应返回 null
      const echo = tracker.isEchoEvent('a.ts', 'old', 'webcontainer')
      expect(echo).toBeNull()
    })
  })

  describe('最大记录数限制', () => {
    it('超过最大记录数时应移除最旧的记录', () => {
      // 写入 11 条记录（超过限制 10 条）
      for (let i = 0; i < 11; i++) {
        tracker.recordOperation('a.ts', `content_${i}`, 'electron')
      }

      // 最旧的 content_0 应已被移除
      const echo0 = tracker.isEchoEvent('a.ts', 'content_0', 'webcontainer')
      expect(echo0).toBeNull()

      // 较新的 content_1 应仍然存在
      const echo1 = tracker.isEchoEvent('a.ts', 'content_1', 'webcontainer')
      expect(echo1).not.toBeNull()
    })
  })

  describe('dispose - 资源清理', () => {
    it('销毁后定时器应被清理', () => {
      tracker.dispose()
      // 不应抛出错误
      expect(() => vi.advanceTimersByTime(20000)).not.toThrow()
    })
  })
})
