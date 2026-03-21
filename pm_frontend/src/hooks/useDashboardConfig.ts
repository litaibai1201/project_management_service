import { useState, useEffect, useCallback } from 'react'
import { dashboardConfigApi } from '@/api/dashboard_config.api'
import type { WidgetConfig, DashboardViewType } from '@/types/api.types'

/** react-grid-layout Layout item */
export interface GridLayout {
  i: string
  x: number; y: number; w: number; h: number
  minW?: number; minH?: number; maxW?: number; maxH?: number
  static?: boolean; isDraggable?: boolean; isResizable?: boolean; moved?: boolean
}

// ── 網格預設尺寸 (12 列網格) ─────────────────────────────────────────────────

export type DefaultLayoutMap = Record<string, Omit<GridLayout, 'i'>>

export const DEFAULT_LAYOUTS: DefaultLayoutMap = {
  // Personal  (rowHeight=40, margin=12 → h=3→144px, h=2→92px, h=6→300px …)
  project_stats:      { x: 0, y: 0,  w: 6,  h: 3,  minW: 3,  minH: 3  },
  task_stats:         { x: 6, y: 0,  w: 6,  h: 3,  minW: 3,  minH: 3  },
  pending_review:     { x: 0, y: 3,  w: 4,  h: 3,  minW: 3,  minH: 2  },
  daily_log:          { x: 4, y: 3,  w: 8,  h: 2,  minW: 4,  minH: 2  },
  activity_chart:     { x: 0, y: 6,  w: 8,  h: 7,  minW: 4,  minH: 4  },
  my_projects:        { x: 0, y: 13, w: 8,  h: 9,  minW: 4,  minH: 4  },
  monthly_attendance: { x: 8, y: 6,  w: 4,  h: 11, minW: 3,  minH: 6  },
  latest_news:        { x: 8, y: 17, w: 4,  h: 5,  minW: 3,  minH: 3  },
  // Manager  (rowHeight=40, margin=12)
  team_project:          { x: 0, y: 0,  w: 4,  h: 3,  minW: 3,  minH: 3 },
  team_task:             { x: 4, y: 0,  w: 4,  h: 3,  minW: 3,  minH: 3 },
  team_pending:          { x: 8, y: 0,  w: 4,  h: 3,  minW: 3,  minH: 3 },
  team_size:             { x: 0, y: 3,  w: 2,  h: 2,  minW: 2,  minH: 2 },
  daily_report_status:   { x: 2, y: 3,  w: 2,  h: 2,  minW: 2,  minH: 2 },
  member_task_chart:     { x: 0, y: 5,  w: 8,  h: 10, minW: 6,  minH: 5 },
  member_detail:         { x: 8, y: 3,  w: 4,  h: 12, minW: 3,  minH: 5 },
}

// ── localStorage ─────────────────────────────────────────────────────────────

const LAYOUT_KEY = (vt: DashboardViewType) => `dashboard_grid_${vt}`

function loadLayout(vt: DashboardViewType): GridLayout[] {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY(vt)) ?? '[]') }
  catch { return [] }
}

function saveLayout(vt: DashboardViewType, layouts: GridLayout[]) {
  localStorage.setItem(LAYOUT_KEY(vt), JSON.stringify(layouts))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WidgetEntry extends WidgetConfig {
  layout: GridLayout
}

function buildEntries(widgets: WidgetConfig[], saved: GridLayout[]): WidgetEntry[] {
  const savedMap = Object.fromEntries(saved.map((l) => [l.i, l]))
  return widgets.map((w) => {
    const def = DEFAULT_LAYOUTS[w.widget_id] ?? { x: 0, y: 99, w: 4, h: 2 }
    const saved_ = savedMap[w.widget_id]
    return {
      ...w,
      layout: saved_
        ? { ...def, ...saved_, i: w.widget_id }
        : { ...def, i: w.widget_id },
    }
  })
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseDashboardConfigReturn {
  allWidgets:     WidgetEntry[]
  visibleWidgets: WidgetEntry[]
  gridLayout:     GridLayout[]
  loading:        boolean
  isEditing:      boolean
  setIsEditing:   (v: boolean) => void
  onLayoutChange: (layout: GridLayout[]) => void
  showWidget:     (widgetId: string) => Promise<void>
  hideWidget:     (widgetId: string) => Promise<void>
}

export function useDashboardConfig(viewType: DashboardViewType): UseDashboardConfigReturn {
  const [allWidgets, setAllWidgets] = useState<WidgetEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [isEditing, setIsEditing]   = useState(false)

  useEffect(() => {
    setLoading(true)
    dashboardConfigApi.getConfig(viewType)
      .then((res) => {
        const widgets = Array.isArray(res.content) ? res.content : []
        setAllWidgets(buildEntries(widgets, loadLayout(viewType)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [viewType])

  const onLayoutChange = useCallback((layout: GridLayout[]) => {
    saveLayout(viewType, layout)
    setAllWidgets((prev) =>
      prev.map((w) => {
        const u = layout.find((l) => l.i === w.widget_id)
        return u ? { ...w, layout: u } : w
      })
    )
  }, [viewType])

  const showWidget = useCallback(async (widgetId: string) => {
    setAllWidgets((prev) =>
      prev.map((w): WidgetEntry => {
        if (w.widget_id !== widgetId) return w
        const def = DEFAULT_LAYOUTS[widgetId] ?? { x: 0, y: 99, w: 4, h: 2 }
        return { ...w, is_visible: true, layout: { ...def, i: widgetId } }
      })
    )
    await dashboardConfigApi.saveConfig(viewType, [{ widget_id: widgetId, is_visible: true }])
  }, [viewType])

  const hideWidget = useCallback(async (widgetId: string) => {
    setAllWidgets((prev) =>
      prev.map((w): WidgetEntry => (w.widget_id === widgetId ? { ...w, is_visible: false } : w))
    )
    await dashboardConfigApi.saveConfig(viewType, [{ widget_id: widgetId, is_visible: false }])
  }, [viewType])

  const visibleWidgets = allWidgets.filter((w) => w.is_visible)
  const gridLayout     = visibleWidgets.map((w) => w.layout)

  return {
    allWidgets, visibleWidgets, gridLayout,
    loading, isEditing, setIsEditing,
    onLayoutChange, showWidget, hideWidget,
  }
}
