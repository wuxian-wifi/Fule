/**
 * 统一 AI 后端服务
 *
 * 提供统一的流式对话接口，支持 OpenAI 兼容 API 和本地 Ollama 实例。
 * 通过 switchModel 实现模型热切换，无需重启应用。
 */
import { OpenAICompatibleProvider } from './openai-provider'
import { OllamaProvider } from './ollama-provider'

/** AI 提供商类型 */
export type AIProviderType = 'openai-compatible' | 'ollama'

/**
 * AI 提供商配置
 * 包含连接信息、模型参数等
 */
export interface AIProviderConfig {
  /** 配置唯一标识 */
  id: string
  /** 提供商类型 */
  type: AIProviderType
  /** 显示名称 */
  name: string
  /** API 基础 URL */
  baseUrl: string
  /** API 密钥（OpenAI 兼容 API 需要） */
  apiKey?: string
  /** 模型标识 */
  model: string
  /** 最大生成 token 数 */
  maxTokens: number
  /** 温度参数（0-2） */
  temperature: number
}

/** 模型信息 */
export interface ModelInfo {
  /** 模型标识 */
  id: string
  /** 模型名称 */
  name: string
  /** 所属提供商 */
  provider: AIProviderType
}

/** 健康状态 */
export interface HealthStatus {
  /** 状态：healthy / unreachable / error */
  status: 'healthy' | 'unreachable' | 'error'
  /** 可用模型列表 */
  models: string[]
  /** 版本信息 */
  version: string
}

/** 对话消息 */
export interface ChatMessage {
  /** 消息角色 */
  role: 'user' | 'assistant' | 'system'
  /** 消息内容 */
  content: string
}

/**
 * AI 提供商接口
 * 所有提供商必须实现此接口
 */
export interface AIProvider {
  /** 流式对话 */
  streamChat(messages: ChatMessage[], config: AIProviderConfig): AsyncIterable<string>
  /** 列出可用模型 */
  listModels(config: AIProviderConfig): Promise<ModelInfo[]>
  /** 健康检查 */
  checkHealth(config: AIProviderConfig): Promise<HealthStatus>
}

/**
 * 统一 AI 后端
 *
 * 封装多种 AI 提供商，对外暴露统一的流式对话接口。
 * 支持运行时热切换模型，无需重启应用。
 */
export class UnifiedAIBackend {
  /** 当前活跃的提供商配置 */
  private activeConfig: AIProviderConfig | null = null
  /** OpenAI 兼容提供商实例 */
  private openaiProvider: OpenAICompatibleProvider
  /** Ollama 提供商实例 */
  private ollamaProvider: OllamaProvider

  constructor() {
    this.openaiProvider = new OpenAICompatibleProvider()
    this.ollamaProvider = new OllamaProvider()
  }

  /**
   * 统一的流式对话接口
   *
   * 根据配置的提供商类型自动路由到对应实现，
   * 接口完全一致，调用方无需关心底层差异。
   *
   * @param messages - 对话消息列表
   * @param config - AI 提供商配置
   * @returns 异步可迭代的文本流
   */
  async *chat(messages: ChatMessage[], config: AIProviderConfig): AsyncIterable<string> {
    const provider = this.getProvider(config.type)
    yield* provider.streamChat(messages, config)
  }

  /**
   * 列出指定提供商的可用模型
   */
  async listModels(config: AIProviderConfig): Promise<ModelInfo[]> {
    const provider = this.getProvider(config.type)
    return provider.listModels(config)
  }

  /**
   * 检查指定提供商的健康状态
   */
  async checkHealth(config: AIProviderConfig): Promise<HealthStatus> {
    const provider = this.getProvider(config.type)
    return provider.checkHealth(config)
  }

  /**
   * 热切换模型
   *
   * 只需更新配置，下次请求自动使用新模型。
   * 不中断当前流式响应，仅影响后续请求。
   *
   * @param newConfig - 新的提供商配置
   */
  switchModel(newConfig: AIProviderConfig): void {
    this.activeConfig = newConfig
  }

  /**
   * 获取当前活跃的提供商配置
   */
  getActiveConfig(): AIProviderConfig | null {
    return this.activeConfig
  }

  /**
   * 根据提供商类型获取对应实例
   */
  private getProvider(type: AIProviderType): AIProvider {
    switch (type) {
      case 'openai-compatible':
        return this.openaiProvider
      case 'ollama':
        return this.ollamaProvider
      default:
        throw new Error(`未知的 AI 提供商类型: ${type}`)
    }
  }
}
