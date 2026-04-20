/**
 * Shell 词法分析器单元测试
 * 验证 shellTokenize 对引号、转义、空格等场景的正确处理
 */
import { describe, expect, it } from 'vitest'

import { shellTokenize } from '@main/services/command-gateway/shell-tokenizer'

describe('shellTokenize', () => {
  describe('基本空格分隔', () => {
    it('应正确拆分简单的空格分隔命令', () => {
      expect(shellTokenize('ls -la /tmp')).toEqual(['ls', '-la', '/tmp'])
    })

    it('应忽略多余的连续空格', () => {
      expect(shellTokenize('npm   run   dev')).toEqual(['npm', 'run', 'dev'])
    })

    it('应忽略首尾空格', () => {
      expect(shellTokenize('  git status  ')).toEqual(['git', 'status'])
    })

    it('空字符串应返回空数组', () => {
      expect(shellTokenize('')).toEqual([])
    })

    it('纯空格字符串应返回空数组', () => {
      expect(shellTokenize('   ')).toEqual([])
    })

    it('单个 token 应正确返回', () => {
      expect(shellTokenize('ls')).toEqual(['ls'])
    })
  })

  describe('双引号处理', () => {
    it('双引号内的空格不应作为分隔符', () => {
      expect(shellTokenize('echo "hello world"')).toEqual([
        'echo',
        'hello world',
      ])
    })

    it('双引号内的内容应保留为单个 token', () => {
      expect(shellTokenize('grep "foo bar" file.txt')).toEqual([
        'grep',
        'foo bar',
        'file.txt',
      ])
    })

    it('空双引号应产生空字符串 token', () => {
      expect(shellTokenize('echo ""')).toEqual(['echo', ''])
    })
  })

  describe('单引号处理', () => {
    it('单引号内的空格不应作为分隔符', () => {
      expect(shellTokenize("echo 'hello world'")).toEqual([
        'echo',
        'hello world',
      ])
    })

    it('单引号内的反斜杠不应触发转义', () => {
      // 单引号内 \ 是普通字符
      expect(shellTokenize("echo 'hello\\nworld'")).toEqual([
        'echo',
        'hello\\nworld',
      ])
    })

    it('单引号内的双引号视为普通字符', () => {
      expect(shellTokenize("echo 'he said \"hi\"'")).toEqual([
        'echo',
        'he said "hi"',
      ])
    })
  })

  describe('反斜杠转义', () => {
    it('反斜杠应转义空格', () => {
      expect(shellTokenize('echo hello\\ world')).toEqual([
        'echo',
        'hello world',
      ])
    })

    it('反斜杠应转义引号', () => {
      expect(shellTokenize('echo \\"hello\\"')).toEqual(['echo', '"hello"'])
    })

    it('反斜杠应转义反斜杠自身', () => {
      expect(shellTokenize('echo \\\\')).toEqual(['echo', '\\'])
    })
  })

  describe('混合引号场景', () => {
    it('双引号和单引号混合使用', () => {
      expect(shellTokenize(`echo "hello" 'world'`)).toEqual([
        'echo',
        'hello',
        'world',
      ])
    })

    it('引号紧邻拼接应合并为一个 token', () => {
      expect(shellTokenize(`echo "hello"'world'`)).toEqual([
        'echo',
        'helloworld',
      ])
    })

    it('复杂的混合引号命令', () => {
      expect(
        shellTokenize(`git commit -m "fix: resolve 'bug' in parser"`),
      ).toEqual(['git', 'commit', '-m', "fix: resolve 'bug' in parser"])
    })
  })

  describe('实际命令场景', () => {
    it('npm run 命令', () => {
      expect(shellTokenize('npm run build -- --mode production')).toEqual([
        'npm',
        'run',
        'build',
        '--',
        '--mode',
        'production',
      ])
    })

    it('带路径前缀的命令', () => {
      expect(shellTokenize('/usr/bin/rm -rf /tmp/cache')).toEqual([
        '/usr/bin/rm',
        '-rf',
        '/tmp/cache',
      ])
    })

    it('带等号的标志位', () => {
      expect(shellTokenize('node --max-old-space-size=4096 app.js')).toEqual([
        'node',
        '--max-old-space-size=4096',
        'app.js',
      ])
    })
  })
})
