import React from 'react'
import { Tooltip } from 'antd'
import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import type { UseDashboardConfigReturn, WidgetEntry } from '@/hooks/useDashboardConfig'
import { DEFAULT_LAYOUTS } from '@/hooks/useDashboardConfig'

interface TrayProps {
  isEditing:     boolean
  hiddenWidgets: WidgetEntry[]
  onShow:        UseDashboardConfigReturn['showWidget']
}

interface EditToggleProps {
  isEditing:    boolean
  setIsEditing: (v: boolean) => void
}

/** 编辑模式开关按钮 */
export const EditToggleButton: React.FC<EditToggleProps> = ({
  isEditing, setIsEditing,
}) => (
  <Tooltip title={isEditing ? '完成編輯' : '自定義首頁佈局'}>
    <button
      onClick={() => setIsEditing(!isEditing)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        isEditing
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      <PencilSquareIcon className="w-4 h-4" />
      <span>{isEditing ? '完成' : '自定義'}</span>
    </button>
  </Tooltip>
)

/** 编辑模式下显示在页面顶部的 widget 托盘 */
export const WidgetTray: React.FC<TrayProps> = ({ isEditing, hiddenWidgets, onShow }) => {
  if (!isEditing) return null
  return (
    <div className="mb-4 p-3 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50">
      <p className="text-xs text-blue-500 font-medium mb-2">
        點擊卡片加入首頁；拖曳網格中的卡片移動位置，拖曳右下角調整大小，點擊 × 移除。
      </p>
      {hiddenWidgets.length === 0 ? (
        <p className="text-xs text-slate-400">所有卡片已顯示於首頁中</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {hiddenWidgets.map((w) => (
            <TrayItem key={w.widget_id} widget={w} onAdd={onShow} />
          ))}
        </div>
      )}
    </div>
  )
}

const TrayItem: React.FC<{ widget: WidgetEntry; onAdd: (id: string) => void }> = ({ widget, onAdd }) => {
  const def = DEFAULT_LAYOUTS[widget.widget_id]
  return (
    <button
      onClick={() => onAdd(widget.widget_id)}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-blue-200 text-sm text-slate-700 hover:border-blue-400 hover:shadow-sm transition-all"
    >
      <span>{widget.label}</span>
      {def && (
        <span className="text-[10px] text-slate-400 font-mono">{def.w}×{def.h}</span>
      )}
    </button>
  )
}

/** 覆盖在网格 widget 上的编辑层（移除按钮 + 蓝色边框提示） */
export const WidgetEditOverlay: React.FC<{
  widgetId:  string
  isEditing: boolean
  onHide:    (id: string) => void
  removable: boolean
}> = ({ widgetId, isEditing, onHide, removable }) => {
  if (!isEditing) return null
  return (
    <div className="absolute inset-0 z-10 pointer-events-none rounded-lg ring-2 ring-blue-300 ring-inset">
      {removable && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onHide(widgetId) }}
          className="pointer-events-auto absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-sm transition-colors"
        >
          <XMarkIcon className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
