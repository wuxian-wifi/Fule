/**
 * 风险等级评估器单元测试
 * 验证 assessRisk 函数对各类命令的风险等级判定和建议生成
 */

import { describe, it, expect } from 'vitest'

import {
  RiskLevel,
  assessRisk,
  generateSuggestion,
} from '@main/services/command-gateway/risk-assessor'
import type { NormalizedCommand } from '@main/services/command-gateway/command-normalizer'

/**
 * 创建测试用的 NormalizedCommand 对象
 * 提供合理的默认值，只需覆盖需要测试的字段
 */
function makeCommand(overrides: Partial<NormalizedCommand> = {}): NormalizedCommand {
  return {
    executable: '',
    subcommand: [],
    flags: new Set<string>(),
    positionalArgs: [],
    rawCommand: '',
    pipes: [],
    ...overrides,
  }
}

describe('风险等级评估器（assessRisk）', () => {
  describe('规则 1：文件删除操作', () => {
    it('rm 命令应评估为 HIGH 风险', () => {
      const cmd = makeCommand({ executable: 'rm', rawCommand: 'rm file.txt' })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('该命令会删除文件或目录')
    })

    it('rmdir 命令应评估为 HIGH 风险', () => {
      const cmd = makeCommand({ executable: 'rmdir', rawCommand: 'rmdir mydir' })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('该命令会删除文件或目录')
    })

    it('unlink 命令应评估为 HIGH 风险', () => {
      const cmd = makeCommand({ executable: 'unlink', rawCommand: 'unlink file.txt' })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
    })

    it('rm -r 应评估为 CRITICAL 风险', () => {
      const cmd = makeCommand({
        executable: 'rm',
        flags: new Set(['-r']),
        rawCommand: 'rm -r mydir',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.CRITICAL)
      expect(result.reasons).toContain('递归删除可能影响大量文件')
    })

    it('rm -rf 应评估为 CRITICAL 风险', () => {
      const cmd = makeCommand({
        executable: 'rm',
        flags: new Set(['-rf']),
        rawCommand: 'rm -rf node_modules',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.CRITICAL)
    })

    it('rm -fr 应评估为 CRITICAL 风险', () => {
      const cmd = makeCommand({
        executable: 'rm',
        flags: new Set(['-fr']),
        rawCommand: 'rm -fr dist',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.CRITICAL)
    })

    it('rm --recursive 应评估为 CRITICAL 风险', () => {
      const cmd = makeCommand({
        executable: 'rm',
        flags: new Set(['--recursive']),
        rawCommand: 'rm --recursive mydir',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.CRITICAL)
    })
  })

  describe('规则 2：全局安装', () => {
    it('npm -g install 应评估为 HIGH 风险', () => {
      const cmd = makeCommand({
        executable: 'npm',
        subcommand: ['install'],
        flags: new Set(['-g']),
        rawCommand: 'npm install -g typescript',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('全局安装会修改系统级 Node.js 环境')
    })

    it('npm --global 应评估为 HIGH 风险', () => {
      const cmd = makeCommand({
        executable: 'npm',
        subcommand: ['install'],
        flags: new Set(['--global']),
        rawCommand: 'npm install --global eslint',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('全局安装会修改系统级 Node.js 环境')
    })
  })

  describe('规则 3：权限修改', () => {
    it('chmod 应评估为 HIGH 风险', () => {
      const cmd = makeCommand({
        executable: 'chmod',
        rawCommand: 'chmod 755 script.sh',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('该命令会修改文件权限')
    })

    it('chown 应评估为 HIGH 风险', () => {
      const cmd = makeCommand({
        executable: 'chown',
        rawCommand: 'chown user:group file.txt',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
    })

    it('chgrp 应评估为 HIGH 风险', () => {
      const cmd = makeCommand({
        executable: 'chgrp',
        rawCommand: 'chgrp staff file.txt',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.HIGH)
    })
  })

  describe('规则 4：包管理器安装', () => {
    it('npm install 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'npm',
        subcommand: ['install'],
        rawCommand: 'npm install lodash',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
      expect(result.reasons).toContain('将安装新的依赖包')
    })

    it('yarn install 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'yarn',
        subcommand: ['install'],
        rawCommand: 'yarn install',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })

    it('pnpm install 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'pnpm',
        subcommand: ['install'],
        rawCommand: 'pnpm install',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })
  })

  describe('规则 5：Git 写操作', () => {
    it('git push 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'git',
        subcommand: ['push'],
        rawCommand: 'git push origin main',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
      expect(result.reasons).toContain('Git 写操作会修改版本历史')
    })

    it('git commit 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'git',
        subcommand: ['commit'],
        rawCommand: 'git commit -m "test"',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })

    it('git reset 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'git',
        subcommand: ['reset'],
        rawCommand: 'git reset --hard HEAD~1',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })

    it('git rebase 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'git',
        subcommand: ['rebase'],
        rawCommand: 'git rebase main',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })

    it('git merge 应评估为 MEDIUM 风险', () => {
      const cmd = makeCommand({
        executable: 'git',
        subcommand: ['merge'],
        rawCommand: 'git merge feature',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.MEDIUM)
    })
  })

  describe('默认风险等级', () => {
    it('未匹配任何规则的命令应评估为 LOW 风险', () => {
      const cmd = makeCommand({
        executable: 'curl',
        rawCommand: 'curl https://example.com',
      })
      const result = assessRisk(cmd)

      expect(result.level).toBe(RiskLevel.LOW)
      expect(result.reasons).toHaveLength(0)
    })
  })

  describe('复合规则优先级', () => {
    it('npm install -g 应取 HIGH（全局安装优先于项目安装的 MEDIUM）', () => {
      const cmd = makeCommand({
        executable: 'npm',
        subcommand: ['install'],
        flags: new Set(['-g']),
        rawCommand: 'npm install -g typescript',
      })
      const result = assessRisk(cmd)

      // 全局安装 HIGH 优先于项目安装 MEDIUM
      expect(result.level).toBe(RiskLevel.HIGH)
      expect(result.reasons).toContain('全局安装会修改系统级 Node.js 环境')
      expect(result.reasons).toContain('将安装新的依赖包')
    })
  })
})

describe('建议生成器（generateSuggestion）', () => {
  it('CRITICAL 风险应生成极高风险警告', () => {
    const cmd = makeCommand({
      executable: 'rm',
      rawCommand: 'rm -rf /',
    })
    const suggestion = generateSuggestion(cmd, RiskLevel.CRITICAL, [
      '该命令会删除文件或目录',
      '递归删除可能影响大量文件',
    ])

    expect(suggestion).toContain('极高风险')
    expect(suggestion).toContain('rm -rf /')
  })

  it('HIGH 风险应生成高风险提示', () => {
    const cmd = makeCommand({
      executable: 'chmod',
      rawCommand: 'chmod 777 file.txt',
    })
    const suggestion = generateSuggestion(cmd, RiskLevel.HIGH, [
      '该命令会修改文件权限',
    ])

    expect(suggestion).toContain('高风险')
    expect(suggestion).toContain('chmod')
  })

  it('MEDIUM 风险应生成中等风险提示', () => {
    const cmd = makeCommand({
      executable: 'npm',
      rawCommand: 'npm install lodash',
    })
    const suggestion = generateSuggestion(cmd, RiskLevel.MEDIUM, [
      '将安装新的依赖包',
    ])

    expect(suggestion).toContain('中等风险')
  })

  it('LOW 风险且无原因应生成通用提示', () => {
    const cmd = makeCommand({
      executable: 'curl',
      rawCommand: 'curl https://example.com',
    })
    const suggestion = generateSuggestion(cmd, RiskLevel.LOW, [])

    expect(suggestion).toContain('不在白名单中')
    expect(suggestion).toContain('curl')
  })
})
