/**
 * 语言检测工具，根据文件扩展名推断 Monaco Editor 语言标识符
 */

/** 文件扩展名到 Monaco 语言标识符的映射表 */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  // JavaScript / TypeScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Web 标记与样式
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',

  // 数据格式
  '.json': 'json',
  '.jsonc': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.svg': 'xml',

  // 文档
  '.md': 'markdown',
  '.mdx': 'markdown',

  // 后端语言
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'cpp',
  '.cs': 'csharp',

  // Shell 与配置
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.dockerfile': 'dockerfile',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',

  // 其他
  '.ini': 'ini',
  '.toml': 'ini',
  '.env': 'plaintext',
  '.txt': 'plaintext',
  '.log': 'plaintext',
}

/** 特殊文件名到语言标识符的映射（无扩展名或特殊文件名） */
const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'makefile': 'shell',
  '.gitignore': 'plaintext',
  '.editorconfig': 'ini',
  '.env': 'plaintext',
  '.env.local': 'plaintext',
  '.env.development': 'plaintext',
  '.env.production': 'plaintext',
}

/**
 * 根据文件路径推断 Monaco Editor 语言标识符
 * 优先匹配特殊文件名，再匹配扩展名，未知类型返回 'plaintext'
 *
 * @param filePath - 文件路径（可以是完整路径或仅文件名）
 * @returns Monaco Editor 语言标识符
 */
export function detectLanguage(filePath: string): string {
  if (!filePath) return 'plaintext'

  // 提取文件名（取路径最后一段）
  const segments = filePath.replace(/\\/g, '/').split('/')
  const fileName = segments[segments.length - 1]?.toLowerCase() ?? ''

  // 优先匹配特殊文件名
  const byName = FILENAME_LANGUAGE_MAP[fileName]
  if (byName) return byName

  // 提取扩展名并匹配
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return 'plaintext'

  const ext = fileName.slice(dotIndex)
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext'
}
