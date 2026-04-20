/**
 * 命令规范化算法单元测试
 * 验证 normalizeCommand、splitByPipes、classifyTokens 的正确性
 */
import { describe, expect, it } from 'vitest'

import {
  normalizeCommand,
  splitByPipes,
  classifyTokens,
} from '@main/services/command-gateway/command-normalizer'

describe('splitByPipes', () => {
  it('无管道符时应返回单个段', () => {
    expect(splitByPipes('ls -la')).toEqual(['ls -la'])
  })

  it('应正确拆分管道链', () => {
    expect(splitByPipes('cat file.txt | grep error | wc -l')).toEqual([
      'cat file.txt',
      'grep error',
      'wc -l',
    ])
  })

  it('引号内的管道符不应作为分隔符', () => {
    expect(splitByPipes('echo "hello | world"')).toEqual([
      'echo "hello | world"',
    ])
  })

  it('单引号内的管道符不应作为分隔符', () => {
    expect(splitByPipes("echo 'a | b' | grep a")).toEqual([
      "echo 'a | b'",
      'grep a',
    ])
  })

  it('空字符串应返回空数组', () => {
    expect(splitByPipes('')).toEqual([])
  })

  it('管道符两侧的空白应被去除', () => {
    expect(splitByPipes('ls  |  grep txt')).toEqual(['ls', 'grep txt'])
  })
})

describe('classifyTokens', () => {
  describe('已知命令的子命令识别', () => {
    it('npm 命令应识别子命令', () => {
      const result = classifyTokens('npm', ['run', 'dev'])
      expect(result.subcommand).toEqual(['run', 'dev'])
      expect(result.positionalArgs).toEqual([])
      expect(result.flags.size).toBe(0)
    })

    it('git 命令应识别子命令和标志位', () => {
      const result = classifyTokens('git', [
        'commit',
        '-m',
        'fix bug',
      ])
      expect(result.subcommand).toEqual(['commit', 'fix bug'])
      expect(result.flags).toEqual(new Set(['-m']))
    })

    it('npm install 应识别子命令、标志位和位置参数', () => {
      const result = classifyTokens('npm', [
        'install',
        'react',
        '--save',
      ])
      expect(result.subcommand).toEqual(['install', 'react'])
      expect(result.flags).toEqual(new Set(['--save']))
      expect(result.positionalArgs).toEqual([])
    })

    it('超出子命令数量上限的 token 应归为位置参数', () => {
      const result = classifyTokens('npm', [
        'run',
        'dev',
        'extra-arg',
      ])
      // npm 最多 2 个子命令
      expect(result.subcommand).toEqual(['run', 'dev'])
      expect(result.positionalArgs).toEqual(['extra-arg'])
    })
  })

  describe('未知命令的参数分类', () => {
    it('未知命令的所有非标志位 token 应归为位置参数', () => {
      const result = classifyTokens('myapp', [
        'input.txt',
        'output.txt',
        '--verbose',
      ])
      expect(result.subcommand).toEqual([])
      expect(result.positionalArgs).toEqual(['input.txt', 'output.txt'])
      expect(result.flags).toEqual(new Set(['--verbose']))
    })
  })

  describe('标志位识别', () => {
    it('短标志位应被正确识别', () => {
      const result = classifyTokens('rm', ['-r', '-f', 'dir'])
      expect(result.flags).toEqual(new Set(['-r', '-f']))
      expect(result.positionalArgs).toEqual(['dir'])
    })

    it('长标志位应被正确识别', () => {
      const result = classifyTokens('ls', ['--all', '--long', '/tmp'])
      expect(result.flags).toEqual(new Set(['--all', '--long']))
      expect(result.positionalArgs).toEqual(['/tmp'])
    })

    it('合并短标志位应被识别为单个标志', () => {
      const result = classifyTokens('rm', ['-rf', 'dir'])
      expect(result.flags).toEqual(new Set(['-rf']))
      expect(result.positionalArgs).toEqual(['dir'])
    })
  })
})

describe('normalizeCommand', () => {
  describe('基本命令解析', () => {
    it('应正确解析简单命令', () => {
      const result = normalizeCommand('ls -la /tmp')
      expect(result.executable).toBe('ls')
      expect(result.flags).toEqual(new Set(['-la']))
      expect(result.positionalArgs).toEqual(['/tmp'])
      expect(result.pipes).toEqual([])
    })

    it('应去除首尾空白和多余空格', () => {
      const result = normalizeCommand('  npm   run   dev  ')
      expect(result.executable).toBe('npm')
      expect(result.subcommand).toEqual(['run', 'dev'])
    })

    it('空命令应返回空 executable', () => {
      const result = normalizeCommand('')
      expect(result.executable).toBe('')
      expect(result.subcommand).toEqual([])
      expect(result.flags.size).toBe(0)
    })
  })

  describe('路径前缀处理', () => {
    it('应去除绝对路径前缀', () => {
      const result = normalizeCommand('/usr/bin/rm -rf /tmp/cache')
      expect(result.executable).toBe('rm')
      expect(result.flags).toEqual(new Set(['-rf']))
    })

    it('应去除相对路径前缀', () => {
      const result = normalizeCommand('./node_modules/.bin/vite build')
      expect(result.executable).toBe('vite')
    })
  })

  describe('管道链解析', () => {
    it('应递归解析管道链中的每个命令', () => {
      const result = normalizeCommand('cat file.txt | grep error | wc -l')
      expect(result.executable).toBe('cat')
      expect(result.positionalArgs).toEqual(['file.txt'])
      expect(result.pipes).toHaveLength(2)

      expect(result.pipes[0].executable).toBe('grep')
      expect(result.pipes[0].positionalArgs).toEqual(['error'])

      expect(result.pipes[1].executable).toBe('wc')
      expect(result.pipes[1].flags).toEqual(new Set(['-l']))
    })

    it('引号内的管道符不应触发管道拆分', () => {
      const result = normalizeCommand('echo "hello | world"')
      expect(result.executable).toBe('echo')
      expect(result.positionalArgs).toEqual(['hello | world'])
      expect(result.pipes).toHaveLength(0)
    })
  })

  describe('已知命令子命令识别', () => {
    it('npm run dev 应正确识别子命令', () => {
      const result = normalizeCommand('npm run dev')
      expect(result.executable).toBe('npm')
      expect(result.subcommand).toEqual(['run', 'dev'])
    })

    it('git commit -m "message" 应正确分类', () => {
      const result = normalizeCommand('git commit -m "fix bug"')
      expect(result.executable).toBe('git')
      expect(result.subcommand).toEqual(['commit', 'fix bug'])
      expect(result.flags).toEqual(new Set(['-m']))
    })

    it('docker compose up -d 应正确分类', () => {
      const result = normalizeCommand('docker compose up -d')
      expect(result.executable).toBe('docker')
      expect(result.subcommand).toEqual(['compose', 'up'])
      expect(result.flags).toEqual(new Set(['-d']))
    })
  })

  describe('rawCommand 保留', () => {
    it('应保留原始命令字符串', () => {
      const raw = '  npm   run   dev  '
      const result = normalizeCommand(raw)
      expect(result.rawCommand).toBe(raw)
    })
  })
})
