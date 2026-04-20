/**
 * MCP（Model Context Protocol）管理器
 *
 * 从配置文件动态注册 MCP 端点，支持 stdio / sse / streamable-http 协议。
 * 实现连接健康检查机制：每 30 秒心跳探测，端点不可达时标记为 disconnected
 * 并从 AI 请求上下文中移除，端点恢复后自动重连。
 */

/** MCP 传输协议类型 */
export type MCPProtocol = 'stdio' | 'sse' | 'streamable-http'

/** MCP 端点连接状态 */
export type MCPStatus = 'connected' | 'disconnected' | 'error'

/**
 * MCP 端点配置
 * 描述一个外部上下文服务端点的连接信息
 */
export interface MCPEndpoint {
  /** 端点唯一标识 */
  id: string
  /** 端点显示名称 */
  name: string
  /** 端点 URL（对 stdio 类型为命令路径） */
  url: string
  /** 传输协议 */
  protocol: MCPProtocol
  /** 端点提供的能力列表 */
  capabilities: string[]
  /** 当前连接状态 */
  status: MCPStatus
}

/** MCP 配置文件格式 */
export interface MCPConfig {
  /** MCP 服务端点列表 */
  mcpServers: MCPEndpoint[]
}

/**
 * MCP 连接客户端接口
 * 通过依赖注入解耦实际的网络连接逻辑
 */
export interface MCPClient {
  /** 连接到端点 */
  connect(endpoint: MCPEndpoint): Promise<boolean>
  /** 心跳探测 */
  ping(endpoint: MCPEndpoint): Promise<boolean>
  /** 断开连接 */
  disconnect(endpoint: MCPEndpoint): Promise<void>
}

/** 健康检查间隔（毫秒）— 每 30 秒 */
const HEALTH_CHECK_INTERVAL = 30_000

/**
 * MCP 管理器
 *
 * 核心职责：
 * 1. 从配置文件动态注册/注销 MCP 端点
 * 2. 定期心跳探测端点可用性
 * 3. 端点不可达时标记为 disconnected 并从上下文中移除
 * 4. 端点恢复后自动重连
 */
export class MCPManager {
  /** 已注册的端点 Map */
  private endpoints: Map<string, MCPEndpoint> = new Map()
  /** MCP 连接客户端 */
  private client: MCPClient
  /** 健康检查定时器 */
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  /** 健康检查间隔（毫秒），可通过构造函数自定义 */
  private healthCheckInterval: number

  constructor(client: MCPClient, healthCheckInterval: number = HEALTH_CHECK_INTERVAL) {
    this.client = client
    this.healthCheckInterval = healthCheckInterval
  }

  /**
   * 从配置文件加载并注册所有 MCP 端点
   *
   * @param config - MCP 配置对象
   */
  async loadFromConfig(config: MCPConfig): Promise<void> {
    for (const endpoint of config.mcpServers) {
      await this.register(endpoint)
    }
  }

  /**
   * 注册单个 MCP 端点
   *
   * 尝试连接端点，成功则标记为 connected，失败则标记为 disconnected。
   * 注册后端点会被纳入健康检查循环。
   *
   * @param endpoint - 端点配置
   */
  async register(endpoint: MCPEndpoint): Promise<void> {
    try {
      const connected = await this.client.connect(endpoint)
      endpoint.status = connected ? 'connected' : 'disconnected'
    } catch {
      endpoint.status = 'disconnected'
    }

    this.endpoints.set(endpoint.id, { ...endpoint })

    // 首次注册端点时启动健康检查
    if (!this.healthCheckTimer && this.endpoints.size > 0) {
      this.startHealthCheck()
    }
  }

  /**
   * 注销 MCP 端点
   *
   * 断开连接并从管理器中移除。
   * 当所有端点都被移除时，停止健康检查。
   *
   * @param endpointId - 端点 ID
   */
  async unregister(endpointId: string): Promise<void> {
    const endpoint = this.endpoints.get(endpointId)
    if (!endpoint) return

    try {
      await this.client.disconnect(endpoint)
    } catch {
      // 断开连接失败不影响注销
    }

    this.endpoints.delete(endpointId)

    // 无端点时停止健康检查
    if (this.endpoints.size === 0) {
      this.stopHealthCheck()
    }
  }

  /**
   * 获取所有已注册端点
   */
  getEndpoints(): MCPEndpoint[] {
    return [...this.endpoints.values()]
  }

  /**
   * 获取指定端点
   */
  getEndpoint(id: string): MCPEndpoint | undefined {
    return this.endpoints.get(id)
  }

  /**
   * 获取所有已连接的端点
   * 仅返回 status 为 connected 的端点，用于 AI 请求上下文注入
   */
  getConnectedEndpoints(): MCPEndpoint[] {
    return [...this.endpoints.values()].filter((ep) => ep.status === 'connected')
  }

  /**
   * 启动健康检查定时器
   * 每 30 秒对所有已注册端点进行心跳探测
   */
  startHealthCheck(): void {
    if (this.healthCheckTimer) return

    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck()
    }, this.healthCheckInterval)
  }

  /**
   * 停止健康检查定时器
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 执行一次健康检查
   *
   * 对所有已注册端点进行心跳探测：
   * - 已连接端点：ping 失败则标记为 disconnected
   * - 已断开端点：尝试重连，成功则恢复为 connected
   */
  async performHealthCheck(): Promise<void> {
    const checks = [...this.endpoints.entries()].map(async ([id, endpoint]) => {
      try {
        const isAlive = await this.client.ping(endpoint)

        if (isAlive && endpoint.status !== 'connected') {
          // 端点恢复，自动重连
          const reconnected = await this.client.connect(endpoint)
          if (reconnected) {
            endpoint.status = 'connected'
            this.endpoints.set(id, { ...endpoint })
          }
        } else if (!isAlive && endpoint.status === 'connected') {
          // 端点不可达，标记为 disconnected
          endpoint.status = 'disconnected'
          this.endpoints.set(id, { ...endpoint })
        }
      } catch {
        // ping 异常，标记为 disconnected
        if (endpoint.status === 'connected') {
          endpoint.status = 'disconnected'
          this.endpoints.set(id, { ...endpoint })
        }
      }
    })

    await Promise.all(checks)
  }

  /**
   * 销毁管理器，清理所有资源
   */
  async destroy(): Promise<void> {
    this.stopHealthCheck()

    // 断开所有端点
    for (const [id] of this.endpoints) {
      await this.unregister(id)
    }
  }
}
