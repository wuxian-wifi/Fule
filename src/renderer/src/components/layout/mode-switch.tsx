import React, { useCallback } from 'react'

import { useAppModeStore } from '@renderer/stores/app-mode-store'
import { switchMode } from '@renderer/services/mode-switcher'

import type { AppMode } from '@renderer/stores/app-mode-store'

/** 模式选项配置 */
interface ModeOption {
  /** 模式标识 */
  mode: AppMode
  /** 显示标签 */
  label: string
}

/** 可用的模式选项列表 */
const MODE_OPTIONS: ModeOption[] = [
  { mode: 'vibe', label: 'Vibe' },
  { mode: 'spec', label: 'Spec' },
]

/**
 * 模式切换控件，提供 Vibe / Spec 双模式的紧凑水平切换按钮
 * 当前激活模式以蓝色高亮显示，切换过程中禁用交互防止重入
 */
const ModeSwitch = React.memo(function ModeSwitch(): React.JSX.Element {
  const currentMode = useAppModeStore((s) => s.currentMode)
  const isSwitching = useAppModeStore((s) => s.isSwitching)

  const handleSwitch = useCallback(
    (targetMode: AppMode) => {
      // 防止切换到当前已激活的模式
      if (targetMode === currentMode) return
      switchMode(targetMode)
    },
    [currentMode],
  )

  return (
    <div className="flex items-center rounded-md bg-gray-800 p-0.5">
      {MODE_OPTIONS.map(({ mode, label }) => {
        const isActive = currentMode === mode
        return (
          <button
            key={mode}
            disabled={isSwitching}
            onClick={() => handleSwitch(mode)}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-gray-200'
            } ${isSwitching ? 'cursor-not-allowed opacity-50' : ''}`}
            aria-pressed={isActive}
            aria-label={`切换到 ${label} 模式`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
})

export default ModeSwitch
