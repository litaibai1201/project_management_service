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

// ── localStorage（即时缓存，跨设备回退用数据库） ─────────────────────────────

const LAYOUT_KEY = (vt: DashboardViewType) => `dashboard_grid_${vt}`

function loadLocalLayout(vt: DashboardViewType): GridLayout[] {
  try { return JSON.parse(localStorage.getItem(LAYOUT_KEY(vt)) ?? '[]') }
  catch { return [] }
}

function saveLocalLayout(vt: DashboardViewType, layouts: GridLayout[]) {
  localStorage.setItem(LAYOUT_KEY(vt), JSON.stringify(layouts))
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WidgetEntry extends WidgetConfig {
  layout: GridLayout
}

/**
 * Build WidgetEntry list.
 * Priority: DB layout (from API response) > localStorage > DEFAULT_LAYOUTS
 */
function buildEntries(widgets: WidgetConfig[], localSaved: GridLayout[]): WidgetEntry[] {
  const localMap = Object.fromEntries(localSaved.map((l) => [l.i, l]))
  return widgets.map((w) => {
    const def      = DEFAULT_LAYOUTS[w.widget_id] ?? { x: 0, y: 99, w: 4, h: 2 }
    const dbLayout = w.layout  // {x,y,w,h} from API or null
    const local    = localMap[w.widget_id]
    if (dbLayout) {
      // DB is authoritative — also sync back to localStorage
      return { ...w, layout: { ...def, ...dbLayout, i: w.widget_id } }
    }
    if (local) {
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
}

// Debounce delay for persisting layout to the database (ms).
// Keeps API calls minimal during drag operations.
const DB_SAVE_DEBOUNCE = 800

export function useDashboardConfig(viewType: DashboardViewType): UseDashboardConfigReturn {
  const [allWidgets, setAllWidgets] = useState<WidgetEntry[]>([])
  const [loading, setLoading]       = useState(true)
  const [isEditing, setIsEditing]   = useState(false)

  // Prevent onLayoutChange from saving while the config is still loading.
  // react-grid-layout fires onLayoutChange on every render change (including
  // the initial empty-layout state), which would overwrite the persisted layout
  // before the API response arrives.
  const isInitialized  = useRef(false)
  const dbSaveTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep a ref to the latest allWidgets so the debounced callback can read it
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
        // Sync DB layout back to localStorage so it's available on next load
        saveLocalLayout(viewType, entries.map((e) => e.layout))
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        isInitialized.current = true
      })

    // Cancel any pending DB save when switching view type
    return () => {
      if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
    }
  }, [viewType])

  const persistLayoutToDB = useCallback((layout: GridLayout[]) => {
    // Build save payload: all visible widgets with their current layout
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
    if (!isInitialized.current) return  // skip spurious calls during load

    // 1. Update state immediately
    setAllWidgets((prev) =>
      prev.map((w) => {
        const u = layout.find((l) => l.i === w.widget_id)
        return u ? { ...w, layout: u } : w
      })
    )

    // 2. Write to localStorage immediately (fast, no network)
    saveLocalLayout(viewType, layout)

    // 3. Debounce the database write
    if (dbSaveTimer.current) clearTimeout(dbSaveTimer.current)
    dbSaveTimer.current = setTimeout(() => persistLayoutToDB(layout), DB_SAVE_DEBOUNCE)
  }, [viewType, persistLayoutToDB])

  const showWidget = useCallback(async (widgetId: string) => {
    const def = DEFAULT_LAYOUTS[widgetId] ?? { x: 0, y: 99, w: 4, h: 2 }
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

  const visibleWidgets = allWidgets.filter((w) => w.is_visible)
  const gridLayout     = visibleWidgets.map((w) => w.layout)

  return {
    allWidgets, visibleWidgets, gridLayout,
    loading, isEditing, setIsEditing,
    onLayoutChange, showWidget, hideWidget,
  }
}
