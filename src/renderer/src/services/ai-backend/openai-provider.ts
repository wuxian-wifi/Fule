/**
 * OpenAI 兼容 API 提供商
 *
 * 支持所有兼容 OpenAI Chat Completions API 的服务端点，
 * 通过 SSE（Server-Sent Events）实现流式响应。
 */
import type {
  AIProvider,
  AIProviderConfig,
  ChatMessage,
  ModelInfo,
  HealthStatus,
} from './unified-ai-backend'

/** OpenAI API 流式响应的 SSE 数据块 */
interface OpenAIStreamChunk {
  /** 选择列表 */
  choices: Array<{
    /** 增量内容 */
    delta: {
      /** 文本内容片段 */
      content?: string
    }
    /** 结束原因 */
    finish_reason: string | null
  }>
}

/** OpenAI 模型列表响应 */
interface OpenAIModelsResponse {
  /** 模型数据列表 */
  data: Array<{
    /** 模型 ID */
    id: string
  }>
}

/**
 * OpenAI 兼容 API 提供商
 *
 * 通过标准的 OpenAI Chat Completions API 进行流式对话，
 * 支持任何兼容此 API 格式的服务（如 Azure OpenAI、Anthropic 代理等）。
 */
export class OpenAICompatibleProvider implements AIProvider {
  /**
   * 流式对话
   *
   * 通过 SSE 接收 AI 响应的文本流，逐块 yield 给调用方。
   * 使用 fetch API 发送请求，手动解析 SSE 数据流。
   *
   * @param messages - 对话消息列表
   * @param config - 提供商配置
   * @returns 异步可迭代的文本流
   */
  async *streamChat(
    messages: ChatMessage[],
    config: AIProviderConfig
  ): AsyncIterable<string> {
    const url = `${config.baseUrl}/chat/completions`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // API 密钥通过 Authorization 头传递
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    const body = JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    })

    if (!response.ok) {
      throw new Error(`OpenAI API 请求失败: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
      throw new Error('OpenAI API 响应无 body')
    }

    // 解析 SSE 数据流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // SSE 数据以双换行分隔
        const lines = buffer.split('\n')
        // 保留最后一个可能不完整的行
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6) // 去掉 "data: " 前缀
          if (data === '[DONE]') return

          try {
            const chunk: OpenAIStreamChunk = JSON.parse(data)
            const content = chunk.choices[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            // 忽略无法解析的数据块
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 列出可用模型
   */
  async listModels(config: AIProviderConfig): Promise<ModelInfo[]> {
    const url = `${config.baseUrl}/models`

    const headers: Record<string, string> = {}
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`获取模型列表失败: ${response.status}`)
    }

    const data: OpenAIModelsResponse = await response.json()

    return data.data.map((m) => ({
      id: m.id,
      name: m.id,
      provider: 'openai-compatible' as const,
    }))
  }

  /**
   * 健康检查
   *
   * 通过请求模型列表接口验证 API 可用性
   */
  async checkHealth(config: AIProviderConfig): Promise<HealthStatus> {
    try {
      const models = await this.listModels(config)
      return {
        status: 'healthy',
        models: models.map((m) => m.id),
        version: 'unknown',
      }
    } catch {
      return {
        status: 'unreachable',
        models: [],
        version: 'unknown',
      }
    }
  }
}
