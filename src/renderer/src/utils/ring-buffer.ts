/**
 * 环形缓冲区（RingBuffer）
 * 用于终端输出等需要限制内存使用的场景，
 * 当缓冲区满时自动覆盖最旧的数据
 */
export class RingBuffer<T> {
  /** 内部存储数组 */
  private buffer: (T | undefined)[]
  /** 下一个写入位置 */
  private head: number = 0
  /** 当前已存储的元素数量 */
  private count: number = 0
  /** 缓冲区最大容量 */
  readonly capacity: number

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('RingBuffer 容量必须大于 0')
    }
    this.capacity = capacity
    this.buffer = new Array(capacity)
  }

  /** 向缓冲区追加一个元素，满时覆盖最旧元素 */
  push(item: T): void {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) {
      this.count++
    }
  }

  /** 获取当前缓冲区中的所有元素（按插入顺序） */
  toArray(): T[] {
    if (this.count === 0) return []

    const result: T[] = []
    // 计算最旧元素的起始位置
    const start = this.count < this.capacity
      ? 0
      : this.head

    for (let i = 0; i < this.count; i++) {
      const index = (start + i) % this.capacity
      result.push(this.buffer[index] as T)
    }
    return result
  }

  /** 当前已存储的元素数量 */
  get size(): number {
    return this.count
  }

  /** 缓冲区是否已满 */
  get isFull(): boolean {
    return this.count === this.capacity
  }

  /** 清空缓冲区 */
  clear(): void {
    this.buffer = new Array(this.capacity)
    this.head = 0
    this.count = 0
  }
}
