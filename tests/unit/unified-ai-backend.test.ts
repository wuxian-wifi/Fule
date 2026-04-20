/**
 * 统一 AI 后端单元测试
 *
 * 测试 UnifiedAIBackend 的模型热切换、提供商路由和健康检查功能。
 * 外部 HTTP 调用通过 mock fetch 模拟。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UnifiedAIBackend } from '@renderer/services/ai-backend/unified-ai-backend'
import { OpenAICompatibleProvider } from '@renderer/services/ai-backend/openai-provider'
import { OllamaProvider } from '@renderer/services/ai-backend/ollama-provider'

import type { AIProviderConfig, ChatMessage } from '@renderer/services/ai-backend/unified-ai-backend'

/** 创建 OpenAI 兼容配置 */
function createOpenAIConfig(overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    id: 'openai-1',
    type: 'openai-compatible',
    name: 'GPT-4',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4',
    maxTokens: 4096,
    temperature: 0.7,
    ...overrides,
  }
}

/** 创建 Ollama 配置 */
function createOllamaConfig(overrides: Partial<AIProviderConfig> = {}): AIProviderConfig {
  return {
    id: 'ollama-1',
    type: 'ollama',
    name: 'Llama 3',
    baseUrl: 'http://localhost:11434',
    model: 'llama3',
    maxTokens: 2048,
    temperature: 0.5,
    ...overrides,
  }
}

/** 模拟消息 */
const testMessages: ChatMessage[] = [
  { role: 'user', content: '你好' },
]

describe('UnifiedAIBackend', () => {
  let backend: UnifiedAIBackend

  beforeEach(() => {
    backend = new UnifiedAIBackend()
  })

  describe('switchModel', () => {
    it('应更新活跃配置', () => {
      expect(backend.getActiveConfig()).toBeNull()

      const config = createOpenAIConfig()
      backend.switchModel(config)

      expect(backend.getActiveConfig()).toBe(config)
    })

    it('应支持从 OpenAI 切换到 Ollama', () => {
      backend.switchModel(createOpenAIConfig())
      expect(backend.getActiveConfig()!.type).toBe('openai-compatible')

      backend.switchModel(createOllamaConfig())
      expect(backend.getActiveConfig()!.type).toBe('ollama')
    })

    it('应支持切换同类型不同模型', () => {
      backend.switchModel(createOpenAIConfig({ model: 'gpt-4' }))
      expect(backend.getActiveConfig()!.model).toBe('gpt-4')

      backend.switchModel(createOpenAIConfig({ model: 'gpt-3.5-turbo' }))
      expect(backend.getActiveConfig()!.model).toBe('gpt-3.5-turbo')
    })
  })

  describe('chat', () => {
    it('应对未知提供商类型抛出错误', async () => {
      const badConfig = createOpenAIConfig({ type: 'unknown' as AIProviderConfig['type'] })

      const iter = backend.chat(testMessages, badConfig)
      await expect(iter.next()).rejects.toThrow('未知的 AI 提供商类型')
    })
  })
})

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    provider = new OpenAICompatibleProvider()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkHealth', () => {
    it('API 可达时应返回 healthy', async () => {
      // 模拟 fetch 返回模型列表
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }] }),
      })

      const config = createOpenAIConfig()
      const health = await provider.checkHealth(config)

      expect(health.status).toBe('healthy')
      expect(health.models).toContain('gpt-4')
      expect(health.models).toContain('gpt-3.5-turbo')
    })

    it('API 不可达时应返回 unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('网络错误'))

      const config = createOpenAIConfig()
      const health = await provider.checkHealth(config)

      expect(health.status).toBe('unreachable')
      expect(health.models).toHaveLength(0)
    })
  })

  describe('listModels', () => {
    it('应正确解析模型列表', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 'model-a' }, { id: 'model-b' }] }),
      })

      const config = createOpenAIConfig()
      const models = await provider.listModels(config)

      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('model-a')
      expect(models[0].provider).toBe('openai-compatible')
    })

    it('API 返回错误时应抛出异常', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      })

      const config = createOpenAIConfig()
      await expect(provider.listModels(config)).rejects.toThrow('获取模型列表失败')
    })
  })

  describe('streamChat', () => {
    it('应正确发送请求头和 body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      })
      globalThis.fetch = mockFetch

      const config = createOpenAIConfig()
      const iter = provider.streamChat(testMessages, config)
      // 消费迭代器
      for await (const _chunk of iter) {
        // 不应有数据
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          }),
        })
      )
    })
  })
})

describe('OllamaProvider', () => {
  let provider: OllamaProvider
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    provider = new OllamaProvider()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('checkHealth', () => {
    it('Ollama 可达时应返回 healthy', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama3', size: 1000, modified_at: '2024-01-01' },
              { name: 'codellama', size: 2000, modified_at: '2024-01-01' },
            ],
          }),
        headers: new Map([['x-ollama-version', '0.1.0']]),
      })

      const config = createOllamaConfig()
      const health = await provider.checkHealth(config)

      expect(health.status).toBe('healthy')
      expect(health.models).toContain('llama3')
      expect(health.models).toContain('codellama')
    })

    it('Ollama 不可达时应返回 unreachable', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('连接被拒绝'))

      const config = createOllamaConfig()
      const health = await provider.checkHealth(config)

      expect(health.status).toBe('unreachable')
      expect(health.models).toHaveLength(0)
    })

    it('Ollama 返回错误状态码时应返回 error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })

      const config = createOllamaConfig()
      const health = await provider.checkHealth(config)

      expect(health.status).toBe('error')
    })
  })

  describe('listModels', () => {
    it('应正确解析 Ollama 模型列表', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'llama3', size: 1000, modified_at: '2024-01-01' }],
          }),
      })

      const config = createOllamaConfig()
      const models = await provider.listModels(config)

      expect(models).toHaveLength(1)
      expect(models[0].id).toBe('llama3')
      expect(models[0].provider).toBe('ollama')
    })

    it('models 为空时应返回空数组', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      const config = createOllamaConfig()
      const models = await provider.listModels(config)

      expect(models).toHaveLength(0)
    })
  })
})
