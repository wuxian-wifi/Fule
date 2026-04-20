import FileChangeDialog from './components/common/file-change-dialog'
import LayoutManager from './components/layout/layout-manager'
import { useExternalFileChange } from './hooks/use-external-file-change'

/**
 * 根组件，作为 Fule IDE 的顶层布局容器
 * 使用 LayoutManager 管理所有面板的布局与可见性
 */
function App(): React.JSX.Element {
  const { prompt, handleReload, handleKeep } = useExternalFileChange()

  return (
    <>
      <LayoutManager />
      {prompt && (
        <FileChangeDialog
          filePath={prompt.filePath}
          onReload={handleReload}
          onKeep={handleKeep}
        />
      )}
    </>
  )
}

export default App
