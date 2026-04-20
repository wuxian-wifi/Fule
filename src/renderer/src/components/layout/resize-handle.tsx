import React, { useCallback, useEffect, useRef, useState } from 'react'

/** 拖拽方向：垂直分割（左右面板）或水平分割（上下面板） */
type ResizeDirection = 'horizontal' | 'vertical'

/** ResizeHandle 组件 props */
interface ResizeHandleProps {
  /** 拖拽方向：horizontal 为左右拖拽，vertical 为上下拖拽 */
  direction: ResizeDirection
  /** 拖拽过程中的回调，参数为鼠标移动的像素增量 */
  onResize: (delta: number) => void
  /** 拖拽结束回调，用于持久化最终尺寸 */
  onResizeEnd?: () => void
}

/**
 * 可拖拽的面板分隔条组件
 * 通过原生鼠标事件实现面板尺寸调整，不依赖外部库
 */
const ResizeHandle = React.memo(function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
}: ResizeHandleProps): React.JSX.Element {
  const [isDragging, setIsDragging] = useState(false)
  /** 记录拖拽起始位置，用于计算增量 */
  const startPosRef = useRef(0)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      startPosRef.current = direction === 'horizontal' ? e.clientX : e.clientY
    },
    [direction],
  )

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent): void => {
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = currentPos - startPosRef.current
      startPosRef.current = currentPos
      onResize(delta)
    }

    const handleMouseUp = (): void => {
      setIsDragging(false)
      onResizeEnd?.()
    }

    // 在 document 上监听，确保鼠标移出分隔条后仍能追踪
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, direction, onResize, onResizeEnd])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      className={`shrink-0 ${
        isHorizontal
          ? 'w-1 cursor-col-resize hover:bg-blue-500'
          : 'h-1 cursor-row-resize hover:bg-blue-500'
      } ${isDragging ? 'bg-blue-500' : 'bg-gray-700'} transition-colors`}
      onMouseDown={handleMouseDown}
    />
  )
})

export default ResizeHandle
