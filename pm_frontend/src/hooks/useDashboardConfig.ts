import { useState, useEffect, useCallback, useRef } from 'react'
import { dashboardConfigApi } from '@/api/dashboard_config.api'
import type { WidgetConfig, DashboardViewType } from '@/types/api.types'

/** react-grid-layout Layout item */
export interface GridLayout {
  i: string
  x: number; y: number; w: number; h: number
  minW?: number; minH?: number; maxW?: number; maxH?: number
  static?: boolean; isDraggable?: boolean; isResizable?: boolean; moved?: boolean
}

// ── 網格預設尺寸 (120 列網格，rowHeight=4，精度 0.1 舊單位) ──────────────────
//   舊格式 (cols=12, rowHeight=40) 每單位 = 10 個新單位
//   所有 w/h/x/y/minW/minH 值均為舊值 × 10

export type DefaultLayoutMap = Record<string, Omit<GridLayout, 'i'>>

export const DEFAULT_LAYOUTS: DefaultLayoutMap = {
  // Personal (layout from work_no 123445)
  project_stats:      { x: 0,   y: 0,   w: 25,  h: 26,  minW: 12,  minH: 20  },
  task_stats:         { x: 25,  y: 0,   w: 25,  h: 26,  minW: 12,  minH: 20  },
  pending_review:     { x: 50,  y: 0,   w: 18,  h: 26,  minW: 12,  minH: 20  },
  daily_log:          { x: 68,  y: 0,   w: 52,  h: 26,  minW: 12,  minH: 12  },
  activity_chart:     { x: 0,   y: 26,  w: 32,  h: 53,  minW: 12,  minH: 20  },
  my_projects:        { x: 32,  y: 26,  w: 48,  h: 53,  minW: 12,  minH: 20  },
  my_tasks:           { x: 0,   y: 79,  w: 32,  h: 88,  minW: 12,  minH: 20  },
  my_pending_review:  { x: 32,  y: 79,  w: 48,  h: 88,  minW: 12,  minH: 20  },
  monthly_attendance: { x: 80,  y: 26,  w: 40,  h: 91,  minW: 12,  minH: 20  },
  latest_news:        { x: 80,  y: 117, w: 40,  h: 50,  minW: 12,  minH: 20  },
  // Manager (layout from work_no 123445)
  team_benefit:          { x: 0,   y: 0,   w: 19,  h: 79,  minW: 15,  minH: 50 },
  team_benefit_detail:   { x: 19,  y: 0,   w: 40,  h: 79,  minW: 20,  minH: 30 },
  team_project:          { x: 59,  y: 0,   w: 29,  h: 24,  minW: 12,  minH: 20 },
  team_requirement:      { x: 88,  y: 0,   w: 32,  h: 24,  minW: 12,  minH: 20 },
  team_task:             { x: 59,  y: 24,  w: 29,  h: 27,  minW: 12,  minH: 20 },
  team_ar_task:          { x: 88,  y: 24,  w: 32,  h: 27,  minW: 12,  minH: 20 },
  team_pending:          { x: 59,  y: 51,  w: 22,  h: 28,  minW: 12,  minH: 20 },
  daily_report_status:   { x: 81,  y: 51,  w: 21,  h: 28,  minW: 12,  minH: 12 },
  team_size:             { x: 102, y: 51,  w: 18,  h: 28,  minW: 12,  minH: 12 },
  team_project_status:   { x: 0,   y: 79,  w: 40,  h: 68,  minW: 12,  minH: 20 },
  team_task_pie:         { x: 40,  y: 79,  w: 40,  h: 68,  minW: 12,  minH: 20 },
  team_project_progress: { x: 80,  y: 79,  w: 40,  h: 68,  minW: 12,  minH: 20 },
  latest_news:           { x: 80,  y: 117, w: 40,  h: 50,  minW: 12,  minH: 20 },
  member_task_chart:     { x: 0,   y: 147, w: 40,  h: 65,  minW: 12,  minH: 20 },
  team_review_types:     { x: 40,  y: 147, w: 40,  h: 65,  minW: 12,  minH: 20 },
  member_detail:         { x: 80,  y: 147, w: 40,  h: 65,  minW: 12,  minH: 20 },
  team_log_today:        { x: 0,   y: 212, w: 120, h: 60,  minW: 12,  minH: 20 },
}

// ── localStorage（使用 v2 key 避免與舊格式衝突） ─────────────────────────────

const LAYOUT_KEY = (vt: DashboardViewType) => `dashboard_grid_v2_${vt}`

function loadLocalLayout(vt: DashboardViewType): GridLayout[] {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY(vt)) ?? '[]') }
  catch { return [] }
}

function saveLocalLayout(vt: DashboardViewType, layouts: GridLayout[]) {
  localStorage.setItem(LAYOUT_KEY(vt), JSON.stringify(layouts))
}

// ── 舊格式遷移（cols=12 舊值 × 10 → cols=120 新值） ─────────────────────────

function isOldScale(layout: { w: number }): boolean {
  // 舊格式 w 最大 12；新格式最小 minW=18（≥20），此處以 13 為分界
  return layout.w <= 13
}

function migrateLayout(l: GridLayout): GridLayout {
  return {
    ...l,
    x: Math.round(l.x * 10),
    y: Math.round(l.y * 10),
    w: Math.round(l.w * 10),
    h: Math.round(l.h * 10),
    ...(l.minW !== undefined ? { minW: Math.round(l.minW * 10) } : {}),
    ...(l.minH !== undefined ? { minH: Math.round(l.minH * 10) } : {}),
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WidgetEntry extends WidgetConfig {
  layout: GridLayout
}

/**
 * Build WidgetEntry list.
 * Priority: DB layout (from API response) > localStorage > DEFAULT_LAYOUTS
 * DB/local layouts saved in old scale (cols=12) are auto-migrated to new scale (cols=120).
 */
function buildEntries(widgets: WidgetConfig[], localSaved: GridLayout[]): WidgetEntry[] {
  const localMap = Object.fromEntries(localSaved.map((l) => [l.i, l]))
  return widgets.map((w) => {
    const def      = DEFAULT_LAYOUTS[w.widget_id] ?? { x: 0, y: 990, w: 40, h: 20 }
    const rawDb    = w.layout  // {x,y,w,h} from API or null
    const rawLocal = localMap[w.widget_id]

    if (rawDb) {
      const dbLayout = isOldScale(rawDb as { w: number })
        ? migrateLayout({ ...rawDb, i: w.widget_id } as GridLayout)
        : { ...def, ...rawDb, i: w.widget_id }
      return { ...w, layout: dbLayout }
    }
    if (rawLocal) {
      const local = isOldScale(rawLocal)
        ? migrateLayout(rawLocal)
        : rawLocal
      return { ...w, layout: { ...def, ...local, i: w.widget_id } }
    }
    return { ...w, layout: { ...def, i: w.widget_id } }
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
  resetLayout:    () => Promise<void>
}

const DB_SAVE_DEBOUNCE = 800

export function useDashboardConfig(viewType: DashboardViewType): UseDashboardConfigReturn {
  const [allWidgets, setAllWidgets] = useState<WidgetEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [isEditing, setIsEditing]   = useState(false)

  const isInitialized  = useRef(false)
  const dbSaveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allWidgetsRef  = useRef<WidgetEntry[]>([])
  allWidgetsRef.current = allWidgets

  useEffect(() => {
    isInitialized.current = false
    setLoading(true)
    dashboardConfigApi.getConfig(viewType)
      .then((res) => {
        const widgets = Array.isArray(res.content) ? res.content : []
        const entries = buildEntries(widgets, loadLocalLayout(viewType))
        setAllWidgets(entries)
        saveLocalLayout(viewType, entries.map((e) => e.layout))
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        isInitialized.current = true
      })

    return () => {
      if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
    }
  }, [viewType])

  const persistLayoutToDB = useCallback((layout: GridLayout[]) => {
    const widgets = allWidgetsRef.current
      .filter((w) => w.is_visible)
      .map((w) => {
        const l = layout.find((li) => li.i === w.widget_id)
        return {
          widget_id:  w.widget_id,
          is_visible: w.is_visible,
          layout:     l ? { x: l.x, y: l.y, w: l.w, h: l.h } : null,
        }
      })
    dashboardConfigApi.saveConfig(viewType, widgets).catch(() => {})
  }, [viewType])

  const onLayoutChange = useCallback((layout: GridLayout[]) => {
    if (!isInitialized.current) return

    setAllWidgets((prev) =>
      prev.map((w) => {
        const u = layout.find((l) => l.i === w.widget_id)
        return u ? { ...w, layout: u } : w
      })
    )
    saveLocalLayout(viewType, layout)

    if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
    dbSaveTimer.current = setTimeout(() => persistLayoutToDB(layout), DB_SAVE_DEBOUNCE)
  }, [viewType, persistLayoutToDB])

  const showWidget = useCallback(async (widgetId: string) => {
    const def = DEFAULT_LAYOUTS[widgetId] ?? { x: 0, y: 990, w: 40, h: 20 }
    const newLayout = { ...def, i: widgetId }
    setAllWidgets((prev) =>
      prev.map((w): WidgetEntry => {
        if (w.widget_id !== widgetId) return w
        return { ...w, is_visible: true, layout: newLayout }
      })
    )
    await dashboardConfigApi.saveConfig(viewType, [{
      widget_id:  widgetId,
      is_visible: true,
      layout:     { x: def.x, y: def.y, w: def.w, h: def.h },
    }])
  }, [viewType])

  const hideWidget = useCallback(async (widgetId: string) => {
    setAllWidgets((prev) =>
      prev.map((w): WidgetEntry => (w.widget_id === widgetId ? { ...w, is_visible: false } : w))
    )
    await dashboardConfigApi.saveConfig(viewType, [{ widget_id: widgetId, is_visible: false }])
  }, [viewType])

  const resetLayout = useCallback(async () => {
    // Clear localStorage
    localStorage.removeItem(LAYOUT_KEY(viewType))
    // Reset all widgets to default layout and visible
    setAllWidgets((prev) =>
      prev.map((w): WidgetEntry => {
        const def = DEFAULT_LAYOUTS[w.widget_id] ?? { x: 0, y: 990, w: 40, h: 20 }
        return { ...w, is_visible: true, layout: { ...def, i: w.widget_id } }
      })
    )
    // Persist defaults to DB
    const payload = Object.entries(DEFAULT_LAYOUTS).map(([widget_id, def]) => ({
      widget_id,
      is_visible: true,
      layout: { x: def.x, y: def.y, w: def.w, h: def.h },
    }))
    await dashboardConfigApi.saveConfig(viewType, payload).catch(() => {})
  }, [viewType])

  const visibleWidgets = allWidgets.filter((w) => w.is_visible)
  const gridLayout     = visibleWidgets.map((w) => w.layout)

  return {
    allWidgets, visibleWidgets, gridLayout,
    loading, isEditing, setIsEditing,
    onLayoutChange, showWidget, hideWidget, resetLayout,
  }
}
