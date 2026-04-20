/**
 * Ollama 本地模型提供商
 *
 * 支持本地 Ollama 实例的流式对话和健康监控。
 * 通过 /api/tags 端点检测 Ollama 运行状态和可用模型。
 */
import type {
  AIProvider,
  AIProviderConfig,
  ChatMessage,
  ModelInfo,
  HealthStatus,
} from './unified-ai-backend'

/** Ollama 流式响应数据块 */
interface OllamaStreamChunk {
  /** 模型名称 */
  model: string
  /** 响应消息 */
  message: {
    /** 角色 */
    role: string
    /** 文本内容片段 */
    content: string
  }
  /** 是否完成 */
  done: boolean
}

/** Ollama 模型标签响应 */
interface OllamaTagsResponse {
  /** 模型列表 */
  models: Array<{
    /** 模型名称 */
    name: string
    /** 模型大小 */
    size: number
    /** 修改时间 */
    modified_at: string
  }>
}

/**
 * Ollama 本地模型提供商
 *
 * 通过 Ollama 的 /api/chat 接口进行流式对话，
 * 通过 /api/tags 接口进行健康监控和模型列表查询。
 */
export class OllamaProvider implements AIProvider {
  /**
   * 流式对话
   *
   * Ollama 的流式响应是 NDJSON 格式（每行一个 JSON 对象），
   * 与 OpenAI 的 SSE 格式不同。
   *
   * @param messages - 对话消息列表
   * @param config - 提供商配置
   * @returns 异步可迭代的文本流
   */
  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig
  ): AsyncIterable<string> {
    const url = `${config.baseUrl}/api/chat`

    const body = JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        num_predict: config.maxTokens,
        temperature: config.temperature,
      },
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!response.ok) {
      throw new Error(`Ollama API 请求失败: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('Ollama API 响应无 body')
    }

    // 解析 NDJSON 数据流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // NDJSON 以换行分隔
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const chunk: OllamaStreamChunk = JSON.parse(trimmed)
            if (chunk.done) return
            if (chunk.message?.content) {
              yield chunk.message.content
            }
          } catch {
            // 忽略无法解析的行
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 列出可用模型
   *
   * 通过 /api/tags 端点获取本地已下载的模型列表
   */
  async listModels(config: AIProviderConfig): Promise<ModelInfo[]> {
    const url = `${config.baseUrl}/api/tags`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`获取 Ollama 模型列表失败: ${response.status}`)
    }

    const data: OllamaTagsResponse = await response.json()

    return (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
      provider: 'ollama' as const,
    }))
  }

  /**
   * 健康检查
   *
   * 通过 /api/tags 端点检测 Ollama 实例是否可达，
   * 同时获取可用模型列表和版本信息。
   */
  async checkHealth(config: AIProviderConfig): Promise<HealthStatus> {
    try {
      const url = `${config.baseUrl}/api/tags`
      const response = await fetch(url)

      if (!response.ok) {
        return { status: 'error', models: [], version: 'unknown' }
      }

      const data: OllamaTagsResponse = await response.json()
      const version = response.headers.get('x-ollama-version') ?? 'unknown'

      return {
        status: 'healthy',
        models: (data.models ?? []).map((m) => m.name),
        version,
      }
    } catch {
      return { status: 'unreachable', models: [], version: 'unknown' }
    }
  }
}
