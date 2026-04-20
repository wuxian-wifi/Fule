import { describe, it, expect, beforeEach } from 'vitest'
import { useAppModeStore } from '@renderer/stores/app-mode-store'

import type { LayoutSnapshot } from '@renderer/stores/app-mode-store'

describe('AppModeStore - 应用模式状态管理', () => {
  beforeEach(() => {
    // 每个测试前重置 store 状态
    useAppModeStore.setState({
      currentMode: 'vibe',
      layoutSnapshots: {
        vibe: {
          editorWidth: 50,
          previewWidth: 30,
          previewVisible: true,
          terminalHeight: 200,
          terminalVisible: true,
          sidebarWidth: 240,
          specPanelVisible: false,
          specPanelWidth: 0,
        },
        spec: {
          editorWidth: 45,
          previewWidth: 25,
          previewVisible: true,
          terminalHeight: 200,
          terminalVisible: true,
          sidebarWidth: 240,
          specPanelVisible: true,
          specPanelWidth: 280,
        },
      },
      isSwitching: false,
    })
  })

  describe('setCurrentMode - 模式切换', () => {
    it('默认模式应为 vibe', () => {
      expect(useAppModeStore.getState().currentMode).toBe('vibe')
    })

    it('应能切换到 spec 模式', () => {
      useAppModeStore.getState().setCurrentMode('spec')
      expect(useAppModeStore.getState().currentMode).toBe('spec')
    })

    it('应能从 spec 切换回 vibe 模式', () => {
      const store = useAppModeStore.getState()
      store.setCurrentMode('spec')
      store.setCurrentMode('vibe')
      expect(useAppModeStore.getState().currentMode).toBe('vibe')
    })
  })

  describe('saveLayoutSnapshot / getLayoutSnapshot - 布局快照', () => {
    it('应能保存并恢复 vibe 模式的布局快照', () => {
      const snapshot: LayoutSnapshot = {
        editorWidth: 60,
        previewWidth: 20,
        previewVisible: false,
        terminalHeight: 300,
        terminalVisible: true,
        sidebarWidth: 200,
      }

      useAppModeStore.getState().saveLayoutSnapshot('vibe', snapshot)
      const restored = useAppModeStore.getState().getLayoutSnapshot('vibe')

      expect(restored.editorWidth).toBe(60)
      expect(restored.previewVisible).toBe(false)
      expect(restored.terminalHeight).toBe(300)
    })

    it('保存一个模式的快照不应影响另一个模式', () => {
      const vibeSnapshot: LayoutSnapshot = {
        editorWidth: 70,
        previewWidth: 10,
        previewVisible: false,
        terminalHeight: 100,
        terminalVisible: false,
        sidebarWidth: 180,
      }

      useAppModeStore.getState().saveLayoutSnapshot('vibe', vibeSnapshot)

      // spec 模式的快照应保持不变
      const specSnapshot = useAppModeStore.getState().getLayoutSnapshot('spec')
      expect(specSnapshot.editorWidth).toBe(45)
      expect(specSnapshot.specPanelVisible).toBe(true)
    })

    it('应能保存包含 spec 特有字段的布局快照', () => {
      const snapshot: LayoutSnapshot = {
        editorWidth: 40,
        previewWidth: 20,
        previewVisible: true,
        terminalHeight: 200,
        terminalVisible: true,
        sidebarWidth: 240,
        specPanelVisible: true,
        specPanelWidth: 320,
      }

      useAppModeStore.getState().saveLayoutSnapshot('spec', snapshot)
      const restored = useAppModeStore.getState().getLayoutSnapshot('spec')

      expect(restored.specPanelVisible).toBe(true)
      expect(restored.specPanelWidth).toBe(320)
    })
  })

  describe('setIsSwitching - 切换锁', () => {
    it('默认切换锁应为 false', () => {
      expect(useAppModeStore.getState().isSwitching).toBe(false)
    })

    it('应能设置切换锁为 true', () => {
      useAppModeStore.getState().setIsSwitching(true)
      expect(useAppModeStore.getState().isSwitching).toBe(true)
    })

    it('应能释放切换锁', () => {
      const store = useAppModeStore.getState()
      store.setIsSwitching(true)
      store.setIsSwitching(false)
      expect(useAppModeStore.getState().isSwitching).toBe(false)
    })
  })
})
