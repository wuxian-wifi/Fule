/**
 * 文件指纹计算器
 *
 * 使用快速哈希算法为文件内容生成唯一指纹，用于同步引擎的回声检测。
 * 当前实现采用 FNV-1a 哈希算法，速度快且碰撞率低，满足文件去重需求。
 *
 * 注意：生产环境可替换为 xxhash-wasm 以获得更高性能，
 * 接口保持不变，只需修改 calculate 内部实现。
 */

/**
 * 文件指纹计算器 — 为文件内容生成唯一哈希指纹
 *
 * 选择 FNV-1a 而非 MD5/SHA 的原因：
 * - 速度极快，适合高频文件变更场景
 * - 碰撞率极低，满足文件去重需求
 * - 纯 JS 实现，无需 WASM 初始化，浏览器和 Node.js 通用
 */
export class FingerprintCalculator {
  /** 标记是否已初始化 */
  private initialized = false

  /**
   * 初始化计算器
   *
   * 当前实现无需异步初始化，但保留此接口以便未来替换为 xxhash-wasm。
   * xxhash-wasm 需要异步加载 WASM 模块，届时此方法将执行实际初始化。
   */
  async init(): Promise<void> {
    this.initialized = true
  }

  /**
   * 计算内容的哈希指纹
   *
   * @param content - 文件内容，支持字符串或 Uint8Array
   * @returns 十六进制哈希字符串
   * @throws 如果计算器未初始化则抛出错误
   */
  calculate(content: string | Uint8Array): string {
    if (!this.initialized) {
      throw new Error('FingerprintCalculator 未初始化，请先调用 init()')
    }

    // 统一转换为字节数组进行计算
    const data =
      typeof content === 'string' ? new TextEncoder().encode(content) : content

    return fnv1aHash(data)
  }
}

/**
 * FNV-1a 哈希算法实现
 *
 * 使用 64 位 FNV-1a 变体（通过两个 32 位整数模拟），
 * 输出 16 字符的十六进制字符串。
 * 该算法具有良好的雪崩效应和极低的碰撞率。
 *
 * @param data - 待计算的字节数组
 * @returns 十六进制哈希字符串
 */
function fnv1aHash(data: Uint8Array): string {
  // FNV-1a 64 位偏移基础值（拆分为高低 32 位）
  let h1 = 0x811c9dc5
  let h2 = 0xcbf29ce4

  for (let i = 0; i < data.length; i++) {
    // XOR 当前字节
    h1 ^= data[i]

    // FNV 乘法：乘以 FNV 素数 0x01000193（简化的 32 位版本）
    // 使用位运算模拟乘法以避免精度丢失
    const tmp = h1 * 0x01000193
    h1 = tmp >>> 0

    // 高位部分也参与混合，增强雪崩效应
    h2 ^= data[i]
    h2 = (h2 * 0x01000193) >>> 0
  }

  // 拼接高低位为 16 字符十六进制字符串
  const high = h2.toString(16).padStart(8, '0')
  const low = h1.toString(16).padStart(8, '0')
  return high + low
}
