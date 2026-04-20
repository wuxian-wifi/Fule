/**
 * MCP 管理器单元测试
 *
 * 测试端点注册/注销、健康检查、自动重连和断开检测功能。
 * 使用 mock MCPClient 模拟网络连接。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCPManager } from '@renderer/services/context/mcp-manager'

import type { MCPClient, MCPEndpoint } from '@renderer/services/context/mcp-manager'

/** 创建测试用端点 */
function createEndpoint(overrides: Partial<MCPEndpoint> = {}): MCPEndpoint {
  return {
    id: 'test-endpoint',
    name: '测试端点',
    url: 'http://localhost:3000',
    protocol: 'sse',
    capabilities: ['file-read', 'search'],
    status: 'disconnected',
    ...overrides,
  }
}

/** 创建 mock MCPClient */
function createMockClient(overrides: Partial<MCPClient> = {}): MCPClient {
  return {
    connect: vi.fn().mockResolvedValue(true),
    ping: vi.fn().mockResolvedValue(true),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('MCPManager', () => {
  let manager: MCPManager
  let mockClient: MCPClient

  beforeEach(() => {
    // 使用较短的健康检查间隔便于测试
    mockClient = createMockClient()
    manager = new MCPManager(mockClient, 100)
  })

  afterEach(async () => {
    await manager.destroy()
  })

  describe('register', () => {
    it('连接成功时应标记为 connected', async () => {
      const endpoint = createEndpoint({ id: 'ep-1' })
      await manager.register(endpoint)

      const registered = manager.getEndpoint('ep-1')
      expect(registered).toBeDefined()
      expect(registered!.status).toBe('connected')
    })

    it('连接失败时应标记为 disconnected', async () => {
      const failClient = createMockClient({
        connect: vi.fn().mockResolvedValue(false),
      })
      const failManager = new MCPManager(failClient, 100)

      const endpoint = createEndpoint({ id: 'ep-fail' })
      await failManager.register(endpoint)

      const registered = failManager.getEndpoint('ep-fail')
      expect(registered!.status).toBe('disconnected')

      await failManager.destroy()
    })

    it('连接抛出异常时应标记为 disconnected', async () => {
      const errorClient = createMockClient({
        connect: vi.fn().mockRejectedValue(new Error('连接超时')),
      })
      const errorManager = new MCPManager(errorClient, 100)

      const endpoint = createEndpoint({ id: 'ep-error' })
      await errorManager.register(endpoint)

      const registered = errorManager.getEndpoint('ep-error')
      expect(registered!.status).toBe('disconnected')

      await errorManager.destroy()
    })
  })

  describe('unregister', () => {
    it('应移除端点并调用 disconnect', async () => {
      const endpoint = createEndpoint({ id: 'ep-remove' })
      await manager.register(endpoint)
      expect(manager.getEndpoints()).toHaveLength(1)

      await manager.unregister('ep-remove')
      expect(manager.getEndpoints()).toHaveLength(0)
      expect(mockClient.disconnect).toHaveBeenCalled()
    })

    it('注销不存在的端点应静默处理', async () => {
      await manager.unregister('non-existent')
      // 不应抛出异常
    })
  })

  describe('getConnectedEndpoints', () => {
    it('应只返回已连接的端点', async () => {
      // 注册两个端点，一个连接成功，一个失败
      const successClient = createMockClient({
        connect: vi.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false),
      })
      const testManager = new MCPManager(successClient, 100)

      await testManager.register(createEndpoint({ id: 'ep-ok' }))
      await testManager.register(createEndpoint({ id: 'ep-fail' }))

      const connected = testManager.getConnectedEndpoints()
      expect(connected).toHaveLength(1)
      expect(connected[0].id).toBe('ep-ok')

      await testManager.destroy()
    })
  })

  describe('loadFromConfig', () => {
    it('应注册配置中的所有端点', async () => {
      const config = {
        mcpServers: [
          createEndpoint({ id: 'ep-1', name: '端点1' }),
          createEndpoint({ id: 'ep-2', name: '端点2' }),
        ],
      }

      await manager.loadFromConfig(config)

      expect(manager.getEndpoints()).toHaveLength(2)
    })
  })

  describe('performHealthCheck', () => {
    it('已连接端点 ping 失败时应标记为 disconnected', async () => {
      await manager.register(createEndpoint({ id: 'ep-1' }))
      expect(manager.getEndpoint('ep-1')!.status).toBe('connected')

      // 模拟 ping 失败
      vi.mocked(mockClient.ping).mockResolvedValue(false)

      await manager.performHealthCheck()

      expect(manager.getEndpoint('ep-1')!.status).toBe('disconnected')
    })

    it('已断开端点 ping 成功时应自动重连', async () => {
      // 先注册一个连接失败的端点
      const failClient = createMockClient({
        connect: vi.fn()
          .mockResolvedValueOnce(false) // 首次注册失败
          .mockResolvedValueOnce(true), // 重连成功
        ping: vi.fn().mockResolvedValue(true),
      })
      const testManager = new MCPManager(failClient, 100)

      await testManager.register(createEndpoint({ id: 'ep-recover' }))
      expect(testManager.getEndpoint('ep-recover')!.status).toBe('disconnected')

      // 执行健康检查，应触发重连
      await testManager.performHealthCheck()

      expect(testManager.getEndpoint('ep-recover')!.status).toBe('connected')

      await testManager.destroy()
    })

    it('ping 抛出异常时应标记为 disconnected', async () => {
      await manager.register(createEndpoint({ id: 'ep-1' }))

      // 模拟 ping 抛出异常
      vi.mocked(mockClient.ping).mockRejectedValue(new Error('网络错误'))

      await manager.performHealthCheck()

      expect(manager.getEndpoint('ep-1')!.status).toBe('disconnected')
    })

    it('已连接端点 ping 成功时应保持 connected', async () => {
      await manager.register(createEndpoint({ id: 'ep-1' }))

      await manager.performHealthCheck()

      expect(manager.getEndpoint('ep-1')!.status).toBe('connected')
    })
  })

  describe('健康检查定时器', () => {
    it('注册首个端点时应启动健康检查', async () => {
      // 使用 spy 监控 setInterval
      const spy = vi.spyOn(global, 'setInterval')

      const freshManager = new MCPManager(mockClient, 5000)
      await freshManager.register(createEndpoint({ id: 'ep-1' }))

      expect(spy).toHaveBeenCalled()

      await freshManager.destroy()
      spy.mockRestore()
    })

    it('所有端点注销后应停止健康检查', async () => {
      const spy = vi.spyOn(global, 'clearInterval')

      await manager.register(createEndpoint({ id: 'ep-1' }))
      await manager.unregister('ep-1')

      expect(spy).toHaveBeenCalled()

      spy.mockRestore()
    })
  })

  describe('协议支持', () => {
    it('应支持 stdio 协议端点', async () => {
      const endpoint = createEndpoint({
        id: 'stdio-ep',
        protocol: 'stdio',
        url: '/usr/local/bin/mcp-server',
      })
      await manager.register(endpoint)

      expect(manager.getEndpoint('stdio-ep')!.protocol).toBe('stdio')
    })

    it('应支持 sse 协议端点', async () => {
      const endpoint = createEndpoint({
        id: 'sse-ep',
        protocol: 'sse',
        url: 'http://localhost:3000/sse',
      })
      await manager.register(endpoint)

      expect(manager.getEndpoint('sse-ep')!.protocol).toBe('sse')
    })

    it('应支持 streamable-http 协议端点', async () => {
      const endpoint = createEndpoint({
        id: 'http-ep',
        protocol: 'streamable-http',
        url: 'http://localhost:3000/mcp',
      })
      await manager.register(endpoint)

      expect(manager.getEndpoint('http-ep')!.protocol).toBe('streamable-http')
    })
  })
})
