/**
 * 智能上下文裁剪引擎
 *
 * 基于 AST 分析，根据用户当前编辑位置动态提取最相关的代码上下文，
 * 在 token 预算内优先填充高相关性内容，避免上下文超载。
 */

/** 光标位置 */
export interface CursorPosition {
  /** 行号（从 1 开始） */
  line: number
  /** 列号（从 1 开始） */
  column: number
}

/** 文件上下文 */
export interface FileContext {
  /** 文件路径 */
  path: string
  /** 文件内容（可能被裁剪） */
  content: string
  /** 相关性分数（0-1，越高越相关） */
  relevance: number
}

/** 上下文窗口 */
export interface ContextWindow {
  /** 系统提示词（Steering 规则） */
  systemPrompt: string
  /** 相关文件上下文列表 */
  fileContext: FileContext[]
  /** 对话历史 */
  conversationHistory: Array<{ role: string; content: string }>
  /** 当前使用的 token 数（估算） */
  totalTokens: number
  /** 最大 token 数 */
  maxTokens: number
}

/** AST 节点信息（简化表示） */
export interface ASTNodeInfo {
  /** 节点类型（function / class / variable / import） */
  type: 'function' | 'class' | 'variable' | 'import' | 'other'
  /** 节点名称 */
  name: string
  /** 起始行 */
  startLine: number
  /** 结束行 */
  endLine: number
  /** 节点内容 */
  content: string
}

/**
 * AST 解析器接口
 * 通过依赖注入解耦具体的 AST 解析实现
 */
export interface ASTParser {
  /** 解析文件内容为 AST 节点列表 */
  parse(content: string, language: string): ASTNodeInfo[]
}

/**
 * 文件读取器接口
 * 通过依赖注入解耦文件系统访问
 */
export interface FileReader {
  /** 读取文件内容 */
  readFile(path: string): Promise<string | null>
}

/**
 * 智能上下文裁剪引擎
 *
 * 核心算法：
 * 1. 解析当前文件的 AST，找到光标所在的作用域
 * 2. 提取当前函数/类的完整定义
 * 3. 分析 import 依赖，提取相关文件的类型签名
 * 4. 按相关性排序，在 token 预算内填充上下文
 */
export class ContextTrimmingEngine {
  /** AST 解析器 */
  private parser: ASTParser
  /** 文件读取器 */
  private fileReader: FileReader

  /** 每个 token 约等于 4 个字符（粗略估算） */
  private static readonly CHARS_PER_TOKEN = 4

  constructor(parser: ASTParser, fileReader: FileReader) {
    this.parser = parser
    this.fileReader = fileReader
  }

  /**
   * 构建上下文窗口
   *
   * 根据当前编辑位置，智能提取最相关的代码上下文，
   * 在 token 预算内优先填充高相关性内容。
   *
   * @param activeFile - 当前编辑的文件路径
   * @param fileContent - 当前文件内容
   * @param cursorPosition - 光标位置
   * @param language - 编程语言
   * @param maxTokens - 最大 token 预算
   * @param systemPrompt - 系统提示词
   * @param conversationHistory - 对话历史
   * @returns 构建好的上下文窗口
   */
  async buildContext(
    activeFile: string,
    fileContent: string,
    cursorPosition: CursorPosition,
    language: string,
    maxTokens: number,
    systemPrompt: string = '',
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<ContextWindow> {
    // 计算已用 token（系统提示词 + 对话历史）
    let usedTokens = this.estimateTokens(systemPrompt)
    for (const msg of conversationHistory) {
      usedTokens += this.estimateTokens(msg.content)
    }

    const remainingTokens = maxTokens - usedTokens
    const fileContexts: FileContext[] = []

    if (remainingTokens <= 0) {
      return {
        systemPrompt,
        fileContext: [],
        conversationHistory,
        totalTokens: usedTokens,
        maxTokens,
      }
    }

    // 1. 解析当前文件 AST
    const nodes = this.parser.parse(fileContent, language)

    // 2. 找到光标所在的作用域节点
    const currentScope = this.findScopeAtPosition(nodes, cursorPosition)

    // 3. 优先添加当前作用域内容（最高相关性）
    if (currentScope) {
      const scopeTokens = this.estimateTokens(currentScope.content)
      if (scopeTokens <= remainingTokens) {
        fileContexts.push({
          path: activeFile,
          content: currentScope.content,
          relevance: 1.0,
        })
        usedTokens += scopeTokens
      }
    } else {
      // 无法定位作用域时，添加整个文件（截断到预算内）
      const trimmed = this.trimToTokenBudget(fileContent, remainingTokens)
      fileContexts.push({
        path: activeFile,
        content: trimmed,
        relevance: 0.8,
      })
      usedTokens += this.estimateTokens(trimmed)
    }

    // 4. 提取 import 依赖文件
    const imports = nodes.filter((n) => n.type === 'import')
    const importPaths = imports.map((n) => n.name).filter(Boolean)

    // 5. 按相关性填充依赖文件的类型签名
    for (const importPath of importPaths) {
      const currentRemaining = maxTokens - usedTokens
      if (currentRemaining <= 0) break

      const depContent = await this.fileReader.readFile(importPath)
      if (!depContent) continue

      // 提取依赖文件的类型签名（函数签名、接口定义等）
      const depNodes = this.parser.parse(depContent, language)
      const signatures = this.extractSignatures(depNodes)
      const sigContent = signatures.join('\n')

      const sigTokens = this.estimateTokens(sigContent)
      if (sigTokens <= currentRemaining && sigContent.length > 0) {
        fileContexts.push({
          path: importPath,
          content: sigContent,
          relevance: 0.5,
        })
        usedTokens += sigTokens
      }
    }

    return {
      systemPrompt,
      fileContext: fileContexts.sort((a, b) => b.relevance - a.relevance),
      conversationHistory,
      totalTokens: usedTokens,
      maxTokens,
    }
  }

  /**
   * 找到光标所在的作用域节点
   * 优先匹配函数和类定义
   */
  findScopeAtPosition(nodes: ASTNodeInfo[], position: CursorPosition): ASTNodeInfo | null {
    // 找到包含光标位置的最小作用域
    let bestMatch: ASTNodeInfo | null = null
    let bestSize = Infinity

    for (const node of nodes) {
      if (
        (node.type === 'function' || node.type === 'class') &&
        node.startLine <= position.line &&
        node.endLine >= position.line
      ) {
        const size = node.endLine - node.startLine
        if (size < bestSize) {
          bestMatch = node
          bestSize = size
        }
      }
    }

    return bestMatch
  }

  /**
   * 提取 AST 节点的类型签名
   * 只保留函数签名和类/接口声明，不包含实现体
   */
  extractSignatures(nodes: ASTNodeInfo[]): string[] {
    return nodes
      .filter((n) => n.type === 'function' || n.type === 'class')
      .map((n) => {
        // 简化：取第一行作为签名
        const firstLine = n.content.split('\n')[0]
        return firstLine
      })
      .filter(Boolean)
  }

  /**
   * 估算文本的 token 数
   * 使用粗略的字符数 / 4 估算
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / ContextTrimmingEngine.CHARS_PER_TOKEN)
  }

  /**
   * 将文本截断到指定 token 预算内
   */
  trimToTokenBudget(text: string, maxTokens: number): string {
    const maxChars = maxTokens * ContextTrimmingEngine.CHARS_PER_TOKEN
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars)
  }
}
