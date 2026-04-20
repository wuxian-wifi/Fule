/**
 * 白名单匹配引擎单元测试
 * 验证 matchPattern、checkDangerousFlags、matchWhitelist、loadProjectWhitelist 的正确性
 */
import { describe, expect, it } from 'vitest'

import { normalizeCommand } from '@main/services/command-gateway/command-normalizer'
import {
  BUILTIN_WHITELIST,
  DANGEROUS_FLAGS,
  matchPattern,
  checkDangerousFlags,
  matchWhitelist,
  loadProjectWhitelist,
} from '@main/services/command-gateway/whitelist-engine'
import type {
  CommandPattern,
  WhitelistRule,
  MatchResult,
} from '@main/services/command-gateway/whitelist-engine'

describe('BUILTIN_WHITELIST', () => {
  it('应包含文件浏览类命令', () => {
    const ids = BUILTIN_WHITELIST.map((r) => r.id)
    expect(ids).toContain('fs-read-ls')
    expect(ids).toContain('fs-read-cat')
    expect(ids).toContain('fs-read-pwd')
    expect(ids).toContain('fs-read-head')
    expect(ids).toContain('fs-read-tail')
    expect(ids).toContain('fs-read-find')
    expect(ids).toContain('fs-read-wc')
  })

  it('应包含 Node.js 开发类命令', () => {
    const ids = BUILTIN_WHITELIST.map((r) => r.id)
    expect(ids).toContain('npm-run')
    expect(ids).toContain('npx-exec')
    expect(ids).toContain('node-exec')
  })

  it('应包含 Git 只读操作', () => {
    const ids = BUILTIN_WHITELIST.map((r) => r.id)
    expect(ids).toContain('git-read')
  })

  it('应包含信息查询类命令', () => {
    const ids = BUILTIN_WHITELIST.map((r) => r.id)
    expect(ids).toContain('which')
    expect(ids).toContain('echo')
  })

  it('所有内置规则的 source 应为 builtin', () => {
    for (const rule of BUILTIN_WHITELIST) {
      expect(rule.source).toBe('builtin')
    }
  })
})

describe('DANGEROUS_FLAGS', () => {
  it('rm 命令应包含递归和强制删除标志', () => {
    expect(DANGEROUS_FLAGS['rm']).toBeDefined()
    expect(DANGEROUS_FLAGS['rm'].has('-r')).toBe(true)
    expect(DANGEROUS_FLAGS['rm'].has('-rf')).toBe(true)
    expect(DANGEROUS_FLAGS['rm'].has('--recursive')).toBe(true)
    expect(DANGEROUS_FLAGS['rm'].has('--force')).toBe(true)
  })

  it('npm 命令应包含全局安装标志', () => {
    expect(DANGEROUS_FLAGS['npm']).toBeDefined()
    expect(DANGEROUS_FLAGS['npm'].has('-g')).toBe(true)
    expect(DANGEROUS_FLAGS['npm'].has('--global')).toBe(true)
  })

  it('chmod 和 chown 应包含递归标志', () => {
    expect(DANGEROUS_FLAGS['chmod'].has('-R')).toBe(true)
    expect(DANGEROUS_FLAGS['chown'].has('-R')).toBe(true)
  })
})

describe('matchPattern', () => {
  describe('exact 模式', () => {
    it('主命令名完全匹配时应返回 true', () => {
      const cmd = normalizeCommand('ls -la')
      const pattern: CommandPattern = { type: 'exact', executable: 'ls' }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })

    it('主命令名不匹配时应返回 false', () => {
      const cmd = normalizeCommand('rm file.txt')
      const pattern: CommandPattern = { type: 'exact', executable: 'ls' }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })

    it('指定子命令时应精确匹配子命令', () => {
      const cmd = normalizeCommand('git status')
      const pattern: CommandPattern = {
        type: 'exact',
        executable: 'git',
        subcommands: ['status'],
      }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })

    it('子命令不匹配时应返回 false', () => {
      const cmd = normalizeCommand('git push')
      const pattern: CommandPattern = {
        type: 'exact',
        executable: 'git',
        subcommands: ['status'],
      }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })

    it('未指定子命令时应忽略子命令匹配', () => {
      const cmd = normalizeCommand('npx create-react-app my-app')
      const pattern: CommandPattern = { type: 'exact', executable: 'npx' }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })
  })

  describe('prefix 模式', () => {
    it('子命令匹配允许列表中的某一项时应返回 true', () => {
      const cmd = normalizeCommand('npm run dev')
      const pattern: CommandPattern = {
        type: 'prefix',
        executable: 'npm',
        allowedSubcommands: [['run'], ['start'], ['test']],
      }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })

    it('子命令不在允许列表中时应返回 false', () => {
      const cmd = normalizeCommand('npm install react')
      const pattern: CommandPattern = {
        type: 'prefix',
        executable: 'npm',
        allowedSubcommands: [['run'], ['start'], ['test']],
      }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })

    it('主命令名不匹配时应返回 false', () => {
      const cmd = normalizeCommand('yarn run dev')
      const pattern: CommandPattern = {
        type: 'prefix',
        executable: 'npm',
        allowedSubcommands: [['run']],
      }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })

    it('多级子命令前缀匹配应正确工作', () => {
      const cmd = normalizeCommand('npm run dev')
      const pattern: CommandPattern = {
        type: 'prefix',
        executable: 'npm',
        allowedSubcommands: [['run', 'dev'], ['run', 'build']],
      }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })
  })

  describe('glob 模式', () => {
    it('glob 模式匹配原始命令字符串时应返回 true', () => {
      const cmd = normalizeCommand('npm run dev')
      const pattern: CommandPattern = { type: 'glob', pattern: 'npm run *' }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })

    it('glob 模式不匹配时应返回 false', () => {
      const cmd = normalizeCommand('yarn start')
      const pattern: CommandPattern = { type: 'glob', pattern: 'npm *' }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })
  })

  describe('regex 模式', () => {
    it('正则匹配原始命令字符串时应返回 true', () => {
      const cmd = normalizeCommand('npm run dev')
      const pattern: CommandPattern = {
        type: 'regex',
        pattern: /^npm\s+run\s+\w+$/,
      }
      expect(matchPattern(cmd, pattern)).toBe(true)
    })

    it('正则不匹配时应返回 false', () => {
      const cmd = normalizeCommand('yarn start')
      const pattern: CommandPattern = {
        type: 'regex',
        pattern: /^npm\s+/,
      }
      expect(matchPattern(cmd, pattern)).toBe(false)
    })
  })
})

describe('checkDangerousFlags', () => {
  it('rm -rf 应检测到危险标志位', () => {
    const cmd = normalizeCommand('rm -rf /tmp/cache')
    const flags = checkDangerousFlags(cmd)
    expect(flags).toContain('-rf')
  })

  it('rm 无危险标志位时应返回空数组', () => {
    const cmd = normalizeCommand('rm file.txt')
    const flags = checkDangerousFlags(cmd)
    expect(flags).toEqual([])
  })

  it('npm -g 应检测到全局安装标志', () => {
    const cmd = normalizeCommand('npm install -g typescript')
    const flags = checkDangerousFlags(cmd)
    expect(flags).toContain('-g')
  })

  it('不在黑名单中的命令应返回空数组', () => {
    const cmd = normalizeCommand('ls -la')
    const flags = checkDangerousFlags(cmd)
    expect(flags).toEqual([])
  })

  it('chmod -R 应检测到递归标志', () => {
    const cmd = normalizeCommand('chmod -R 755 /tmp')
    const flags = checkDangerousFlags(cmd)
    expect(flags).toContain('-R')
  })
})

describe('matchWhitelist', () => {
  describe('基本匹配', () => {
    it('白名单内的命令应放行', () => {
      const cmd = normalizeCommand('ls -la')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(true)
      expect(result.rule?.id).toBe('fs-read-ls')
      expect(result.hasDangerousFlags).toBe(false)
    })

    it('不在白名单中的命令应阻止', () => {
      const cmd = normalizeCommand('rm file.txt')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(false)
    })

    it('npm run dev 应通过内置白名单', () => {
      const cmd = normalizeCommand('npm run dev')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(true)
      expect(result.rule?.id).toBe('npm-run')
    })

    it('git status 应通过内置白名单', () => {
      const cmd = normalizeCommand('git status')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(true)
      expect(result.rule?.id).toBe('git-read')
    })

    it('git push 不应通过内置白名单', () => {
      const cmd = normalizeCommand('git push origin main')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(false)
    })
  })

  describe('危险标志位检测', () => {
    it('npm install -g 即使匹配白名单也应因危险标志位被阻止', () => {
      // 创建一个允许 npm install 的自定义规则
      const rules: WhitelistRule[] = [
        {
          id: 'npm-install',
          pattern: {
            type: 'prefix',
            executable: 'npm',
            allowedSubcommands: [['install']],
          },
          source: 'project',
          description: '允许 npm install',
        },
      ]
      const cmd = normalizeCommand('npm install -g typescript')
      const result = matchWhitelist(cmd, rules)
      expect(result.matched).toBe(false)
      expect(result.hasDangerousFlags).toBe(true)
      expect(result.dangerousFlags).toContain('-g')
    })
  })

  describe('管道链匹配', () => {
    it('管道链中所有命令都在白名单内时应放行', () => {
      const cmd = normalizeCommand('cat file.txt | head -10')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(true)
    })

    it('管道链中有命令不在白名单内时应阻止', () => {
      const cmd = normalizeCommand('cat file.txt | rm -rf /')
      const result = matchWhitelist(cmd, BUILTIN_WHITELIST)
      expect(result.matched).toBe(false)
    })
  })
})

describe('loadProjectWhitelist', () => {
  it('应正确解析项目级白名单配置', () => {
    const json = JSON.stringify({
      version: 1,
      rules: [
        {
          id: 'custom-deploy',
          pattern: {
            type: 'exact',
            executable: 'deploy',
            subcommands: ['staging'],
          },
          description: '允许部署到 staging 环境',
        },
      ],
    })
    const rules = loadProjectWhitelist(json)
    expect(rules).toHaveLength(1)
    expect(rules[0].id).toBe('custom-deploy')
    expect(rules[0].source).toBe('project')
    expect(rules[0].pattern.type).toBe('exact')
  })

  it('应支持多条规则', () => {
    const json = JSON.stringify({
      version: 1,
      rules: [
        {
          id: 'rule-1',
          pattern: { type: 'exact', executable: 'deploy' },
          description: '部署',
        },
        {
          id: 'rule-2',
          pattern: { type: 'glob', pattern: 'docker-compose *' },
          description: 'Docker Compose',
        },
      ],
    })
    const rules = loadProjectWhitelist(json)
    expect(rules).toHaveLength(2)
    expect(rules[0].source).toBe('project')
    expect(rules[1].source).toBe('project')
  })

  it('空规则列表应返回空数组', () => {
    const json = JSON.stringify({ version: 1, rules: [] })
    const rules = loadProjectWhitelist(json)
    expect(rules).toEqual([])
  })
})
