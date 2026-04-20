/**
 * 模式切换状态机与 switchMode 算法
 * 负责 Vibe / Spec 双模式之间的无损切换，
 * 包括布局快照保存/恢复、流式响应暂停/恢复、对话指针保存/恢复和防重入锁
 */
import { useAppModeStore } from '@renderer/stores/app-mode-store'
import { useConversationStore } from '@renderer/stores/conversation-store'

import type { AppMode, LayoutSnapshot } from '@renderer/stores/app-mode-store'

/**
 * 捕获当前布局快照
 * 从 AppModeStore 中读取当前模式对应的布局状态，
 * 未来可扩展为从 DOM 或布局管理器读取实际面板尺寸
 */
export function captureLayoutSnapshot(): LayoutSnapshot {
  const { currentMode, layoutSnapshots } = useAppModeStore.getState()
  // 当前阶段直接返回 store 中保存的快照作为"当前布局"
  // 后续集成 LayoutManager 后，改为从 DOM 面板实际尺寸读取
  return { ...layoutSnapshots[currentMode] }
}

/**
 * 将布局快照应用到指定模式
 * 后续集成 LayoutManager 后，此函数还需驱动面板尺寸变更
 */
export function applyLayoutSnapshot(mode: AppMode, snapshot: LayoutSnapshot): void {
  // 将快照写入指定模式的布局记录
  // 后续 LayoutManager 会监听此变更并调整面板尺寸
  useAppModeStore.getState().saveLayoutSnapshot(mode, snapshot)
}

/**
 * 暂停流式响应的 UI 渲染
 * 仅设置标记位，不中断底层数据流，避免丢失 AI 响应内容
 */
export function pauseStreamingUI(): void {
  const { streamingState } = useConversationStore.getState()
  if (streamingState && streamingState.isStreaming) {
    // 暂停 UI 渲染但保留流式数据接收
    useConversationStore.getState().setStreamingState({
      ...streamingState,
      isStreaming: false,
    })
  }
}

/**
 * 恢复流式响应的 UI 渲染
 * 将之前暂停的流式状态重新激活
 */
export function resumeStreamingUI(): void {
  const { streamingState } = useConversationStore.getState()
  if (streamingState && !streamingState.isStreaming) {
    useConversationStore.getState().setStreamingState({
      ...streamingState,
      isStreaming: true,
    })
  }
}

/**
 * 保存指定模式的活跃对话指针
 * 对话数据本身不移动，仅记录当前模式正在查看的对话 ID
 */
export function saveActiveConversation(mode: AppMode): void {
  const { activeConversationId } = useConversationStore.getState()
  // 指针已经按模式独立存储，此处确保当前值被正确保留
  useConversationStore.getState().setActiveConversation(
    mode,
    activeConversationId[mode],
  )
}

/**
 * 恢复指定模式的活跃对话指针
 * 切换到目标模式时，恢复该模式上次查看的对话
 */
export function restoreActiveConversation(mode: AppMode): void {
  const { activeConversationId } = useConversationStore.getState()
  // 指针已按模式独立存储，读取目标模式的指针即可
  useConversationStore.getState().setActiveConversation(
    mode,
    activeConversationId[mode],
  )
}

/**
 * 模式切换核心算法
 * 按照状态机流程执行：防重入检查 → 快照布局 → 暂停流式 → 保存对话指针
 * → 恢复目标布局 → 恢复对话指针 → 恢复流式 → 更新模式
 *
 * @param targetMode - 目标模式
 */
export async function switchMode(targetMode: AppMode): Promise<void> {
  const appModeStore = useAppModeStore.getState()

  // 1. 防重入锁 — 正在切换或目标与当前相同时直接返回
  if (appModeStore.isSwitching || appModeStore.currentMode === targetMode) {
    return
  }

  useAppModeStore.getState().setIsSwitching(true)

  try {
    const sourceMode = useAppModeStore.getState().currentMode

    // 2. 快照当前布局 — 记录所有面板尺寸和可见性
    const currentLayout = captureLayoutSnapshot()
    useAppModeStore.getState().saveLayoutSnapshot(sourceMode, currentLayout)

    // 3. 处理流式响应 — 不中断数据流，仅暂停 UI 渲染
    const streamingBefore = useConversationStore.getState().streamingState
    const wasStreaming = streamingBefore?.isStreaming ?? false
    if (wasStreaming) {
      pauseStreamingUI()
    }

    // 4. 保存当前模式的活跃对话指针
    saveActiveConversation(sourceMode)

    // 5. 恢复目标模式的布局快照
    const targetLayout = useAppModeStore.getState().getLayoutSnapshot(targetMode)
    applyLayoutSnapshot(targetMode, targetLayout)

    // 6. 恢复目标模式的活跃对话指针
    restoreActiveConversation(targetMode)

    // 7. 恢复流式渲染（如果目标模式有进行中的流）
    if (wasStreaming) {
      resumeStreamingUI()
    }

    // 8. 更新模式标识
    useAppModeStore.getState().setCurrentMode(targetMode)
  } finally {
    // 确保切换锁始终被释放，即使发生异常
    useAppModeStore.getState().setIsSwitching(false)
  }
}
