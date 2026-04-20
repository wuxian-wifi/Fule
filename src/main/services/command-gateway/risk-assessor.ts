/**
 * 风险等级评估器
 * 对未命中白名单的命令进行风险等级评估，生成用户可读的风险说明与建议，
 * 用于人工审批弹窗展示
 */

import type { NormalizedCommand } from './command-normalizer'

/** 风险等级 — 四级分类 */
export enum RiskLevel {
  /** 低风险：文件创建、目录创建等无破坏性操作 */
  LOW = 'low',
  /** 中风险：依赖安装、Git 写操作等可逆操作 */
  MEDIUM = 'medium',
  /** 高风险：文件删除、全局安装、权限修改等难以撤销的操作 */
  HIGH = 'high',
  /** 极高风险：递归删除、系统级操作等可能造成严重后果的操作 */
  CRITICAL = 'critical',
}

/** 风险评估结果 */
export interface RiskAssessment {
  /** 风险等级 */
  level: RiskLevel
  /** 风险原因列表（每条原因对应一个触发的规则） */
  reasons: string[]
  /** 给用户的建议说明（中文可读文本） */
  suggestion: string
}

/**
 * 风险等级数值映射，用于比较风险等级高低
 * 数值越大风险越高
 */
const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.CRITICAL]: 3,
}

/**
 * 比较两个风险等级，返回较高的那个
 *
 * @param a - 第一个风险等级
 * @param b - 第二个风险等级
 * @returns 较高的风险等级
 */
function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_LEVEL_ORDER[a] >= RISK_LEVEL_ORDER[b] ? a : b
}

/**
 * 对规范化命令进行风险等级评估
 *
 * 评估规则（按优先级排列）：
 * 1. 文件删除操作（rm/rmdir/unlink）→ HIGH，带 -r/-rf 标志 → CRITICAL
 * 2. 全局安装（npm -g）→ HIGH
 * 3. 权限修改（chmod/chown/chgrp）→ HIGH
 * 4. 包管理器安装（npm/yarn/pnpm install）→ MEDIUM
 * 5. Git 写操作（push/commit/reset/rebase/merge）→ MEDIUM
 *
 * @param cmd - 规范化后的命令对象
 * @returns 风险评估结果，包含等级、原因和建议
 */
export function assessRisk(cmd: NormalizedCommand): RiskAssessment {
  const reasons: string[] = []
  let level = RiskLevel.LOW

  // 规则 1：文件删除操作
  if (['rm', 'rmdir', 'unlink'].includes(cmd.executable)) {
    level = RiskLevel.HIGH
    reasons.push('该命令会删除文件或目录')

    // 递归删除标志提升至 CRITICAL
    if (cmd.flags.has('-r') || cmd.flags.has('-rf') || cmd.flags.has('-fr') || cmd.flags.has('--recursive')) {
      level = RiskLevel.CRITICAL
      reasons.push('递归删除可能影响大量文件')
    }

    // --force 标志额外警告
    if (cmd.flags.has('--force') || cmd.flags.has('-f')) {
      // 仅在非 CRITICAL 时追加原因（-rf 已包含 force 语义）
      if (level !== RiskLevel.CRITICAL) {
        reasons.push('强制删除将跳过确认提示')
      }
    }
  }

  // 规则 2：全局安装
  if (cmd.executable === 'npm' && (cmd.flags.has('-g') || cmd.flags.has('--global'))) {
    level = maxRiskLevel(level, RiskLevel.HIGH)
    reasons.push('全局安装会修改系统级 Node.js 环境')
  }

  // 规则 3：权限修改
  if (['chmod', 'chown', 'chgrp'].includes(cmd.executable)) {
    level = maxRiskLevel(level, RiskLevel.HIGH)
    reasons.push('该命令会修改文件权限')
  }

  // 规则 4：包管理器安装（项目级）
  if (
    ['npm', 'yarn', 'pnpm'].includes(cmd.executable) &&
    cmd.subcommand[0] === 'install'
  ) {
    level = maxRiskLevel(level, RiskLevel.MEDIUM)
    reasons.push('将安装新的依赖包')
  }

  // 规则 5：Git 写操作
  if (
    cmd.executable === 'git' &&
    ['push', 'commit', 'reset', 'rebase', 'merge'].includes(cmd.subcommand[0])
  ) {
    level = maxRiskLevel(level, RiskLevel.MEDIUM)
    reasons.push('Git 写操作会修改版本历史')
  }

  return {
    level,
    reasons,
    suggestion: generateSuggestion(cmd, level, reasons),
  }
}

/**
 * 根据命令、风险等级和原因生成用户可读的中文建议说明
 *
 * @param cmd - 规范化后的命令对象
 * @param level - 评估出的风险等级
 * @param reasons - 风险原因列表
 * @returns 中文建议文本
 */
export function generateSuggestion(
  cmd: NormalizedCommand,
  level: RiskLevel,
  reasons: string[],
): string {
  // 无风险原因时返回通用提示
  if (reasons.length === 0) {
    return `命令 "${cmd.executable}" 不在白名单中，请确认是否允许执行。`
  }

  // 根据风险等级生成不同严重程度的建议
  switch (level) {
    case RiskLevel.CRITICAL:
      return `⚠️ 极高风险操作！命令 "${cmd.rawCommand}" 可能造成不可逆的数据丢失。请仔细确认操作目标路径，建议先备份相关文件。`

    case RiskLevel.HIGH:
      return `⚠️ 高风险操作。命令 "${cmd.executable}" ${reasons[0]}。请确认操作范围和目标是否正确。`

    case RiskLevel.MEDIUM:
      return `该命令涉及 ${reasons[0]}，属于中等风险操作。请确认后执行。`

    case RiskLevel.LOW:
      return `命令 "${cmd.executable}" 不在白名单中，请确认是否允许执行。`
  }
}
