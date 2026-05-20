import React, { useState, useCallback } from 'react'
import type { ColumnType } from 'antd/es/table'
import { Resizable } from 'react-resizable'
import 'react-resizable/css/styles.css'

// react-resizable types mark all props as required even though most have defaults
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResizableCompat = Resizable as any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResizableTitle: React.FC<any> = ({ onResize, width, ...restProps }) => {
  if (!width) return <th {...restProps} />
  return (
    <ResizableCompat
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          style={{
            position: 'absolute', right: 0, bottom: 0,
            zIndex: 1, width: 6, height: '100%', cursor: 'col-resize',
          }}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} style={{ ...(restProps.style ?? {}), position: 'relative' }} />
    </ResizableCompat>
  )
}

/** 固定的 Table components，传给 <Table components={tableComponents} /> */
export const tableComponents = {
  header: { cell: ResizableTitle },
}

/**
 * 为 Ant Design Table 提供列宽拖拽调整能力。
 *
 * 用法：
 *   const { mergeColumns } = useResizableColumns(rawColumns)
 *   <Table columns={mergeColumns} components={tableComponents} ... />
 */
export function useResizableColumns<T>(rawColumns: ColumnType<T>[]) {
  const [widths, setWidths] = useState<(number | undefined)[]>(
    () => rawColumns.map((c) => (typeof c.width === 'number' ? c.width : undefined)),
  )

  const handleResize = useCallback(
    (index: number) =>
      (_: React.SyntheticEvent, { size }: { size: { width: number } }) => {
        setWidths((prev) => {
          const next = [...prev]
          next[index] = Math.max(size.width, 40)
          return next
        })
      },
    [],
  )

  const mergeColumns: ColumnType<T>[] = rawColumns.map((col, index) => {
    const w = widths[index]
    if (!w) return col
    return {
      ...col,
      width: w,
      onHeaderCell: () => ({
        width: w,
        onResize: handleResize(index),
      }),
    }
  })

  return { mergeColumns }
}
