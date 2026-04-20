/**
 * 命令审批弹窗组件
 * 当 AI 尝试执行非白名单命令时弹出，展示命令内容、风险等级、
 * 风险原因和建议说明，由用户决定是否允许执行
 */

import React, { useCallback } from 'react'

/** 风险等级 — 与主进程 RiskLevel 枚举保持一致的字符串字面量 */
type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** CommandApprovalDialog 组件的 props */
interface CommandApprovalDialogProps {
  /** 待审批的原始命令字符串 */
  command: string
  /** 风险等级 */
  riskLevel: RiskLevel
  /** 风险原因列表 */
  reasons: string[]
  /** 给用户的建议说明 */
  suggestion: string
  /** 用户点击"允许执行"后的回调 */
  onApprove: () => void
  /** 用户点击"拒绝"后的回调 */
  onReject: () => void
}

/**
 * 风险等级对应的显示标签和颜色配置
 * 颜色方案：LOW=蓝色, MEDIUM=黄色, HIGH=橙色, CRITICAL=红色
 */
const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; badgeClass: string; borderClass: string }
> = {
  low: {
    label: '低风险',
    badgeClass: 'bg-blue-600 text-blue-100',
    borderClass: 'border-blue-600',
  },
  medium: {
    label: '中风险',
    badgeClass: 'bg-yellow-600 text-yellow-100',
    borderClass: 'border-yellow-600',
  },
  high: {
    label: '高风险',
    badgeClass: 'bg-orange-600 text-orange-100',
    borderClass: 'border-orange-600',
  },
  critical: {
    label: '极高风险',
    badgeClass: 'bg-red-600 text-red-100',
    borderClass: 'border-red-600',
  },
}

/**
 * 命令审批弹窗
 * 以模态遮罩层形式展示，包含命令内容、风险等级徽章、风险原因列表、
 * 建议说明以及"允许执行"和"拒绝"两个操作按钮。
 * 通过 IPC cmd:approve / cmd:reject 通道与主进程通信。
 */
const CommandApprovalDialog = React.memo(function CommandApprovalDialog({
  command,
  riskLevel,
  reasons,
  suggestion,
  onApprove,
  onReject,
}: CommandApprovalDialogProps): React.JSX.Element {
  const config = RISK_LEVEL_CONFIG[riskLevel]

  /** 处理允许执行 — 通过 IPC cmd:approve 通道通知主进程 */
  const handleApprove = useCallback(() => {
    onApprove()
  }, [onApprove])

  /** 处理拒绝 — 通过 IPC cmd:reject 通道通知主进程 */
  const handleReject = useCallback(() => {
    onReject()
  }, [onReject])

  return (
    /* 模态遮罩层 — 半透明深色背景 */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      {/* 弹窗主体 */}
      <div
        className={`w-full max-w-md rounded-lg border ${config.borderClass} bg-gray-800 p-5 shadow-2xl`}
      >
        {/* 标题栏：标题 + 风险等级徽章 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">命令审批</h3>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${config.badgeClass}`}
          >
            {config.label}
          </span>
        </div>

        {/* 命令内容 — 等宽字体展示 */}
        <div className="mb-4 rounded bg-gray-900 p-3">
          <code className="break-all text-xs text-green-400">{command}</code>
        </div>

        {/* 风险原因列表 */}
        {reasons.length > 0 && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-medium text-gray-400">风险原因：</p>
            <ul className="list-inside list-disc space-y-1">
              {reasons.map((reason, index) => (
                <li key={index} className="text-xs text-gray-300">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 建议说明 */}
        {suggestion && (
          <div className="mb-4 rounded bg-gray-700/50 p-2">
            <p className="text-xs text-gray-300">{suggestion}</p>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={handleReject}
            className="rounded bg-gray-600 px-4 py-1.5 text-xs text-gray-200 hover:bg-gray-500"
          >
            拒绝
          </button>
          <button
            onClick={handleApprove}
            className="rounded bg-green-600 px-4 py-1.5 text-xs text-white hover:bg-green-500"
          >
            允许执行
          </button>
        </div>
      </div>
    </div>
  )
})

export default CommandApprovalDialog
