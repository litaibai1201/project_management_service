/**
 * GanttChart — 自製甘特圖（純 CSS/div，無需外部庫）
 * 支持：日/週/月 視圖 · 狀態顏色 · 里程碑標記 · 今日線 · 進度條 · 分組視圖
 */
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { Segmented, Tooltip, Empty, Select } from 'antd'
import { FunnelIcon, FolderIcon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { ProjectFunction, Milestone, Requirement } from '@/types/api.types'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { useTranslation } from 'react-i18next'
import dayjs, { Dayjs } from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import weekOfYear from 'dayjs/plugin/weekOfYear'
dayjs.extend(isBetween)
dayjs.extend(weekOfYear)

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month'

interface Column { label: string; date: Dayjs; width: number }

interface GroupData {
  name: string
  items: ProjectFunction[]
  minDate: Dayjs | null   // earliest expected_start_date
  maxDate: Dayjs | null   // latest expected_end_date
  actualStart: Dayjs | null  // earliest start_time among items
  actualEnd: Dayjs | null    // latest end_time (only when ALL items are done)
  avgProgress: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_H   = 44
const GROUP_H = 36
const NAME_W  = 230
const COL_W   = { day: 30, week: 70, month: 100 }
// Left-side dot color for a task row
function getDotColor(f: ProjectFunction, today: Dayjs): string {
  if (f.status === 1) return '#94a3b8'
  if (f.status === 3) return '#d97706'
  if (f.status === 4) {
    const late = f.end_time && f.expected_end_date && f.end_time > f.expected_end_date
    return late ? '#ef4444' : '#16a34a'
  }
  const overdue = f.expected_end_date && dayjs(f.expected_end_date).isBefore(today)
  return overdue ? '#ef4444' : '#f59e0b'
}

const LEGEND_KEYS = [
  { key: 'gantt.legendNotStarted', color: '#d1d5db' },
  { key: 'gantt.legendOnTime',     color: '#fbbf24' },
  { key: 'gantt.legendOverdue',    color: '#f87171' },
  { key: 'gantt.legendCompleted',  color: '#4ade80' },
]

const GROUP_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildColumns(start: Dayjs, end: Dayjs, mode: ViewMode, monthFmt?: (m: number) => string): Column[] {
  const cols: Column[] = []
  let cur = start.clone()
  const w = COL_W[mode]
  while (!cur.isAfter(end)) {
    let label = ''
    if (mode === 'day')   label = cur.format('D')
    else if (mode === 'week') label = `${cur.format('M/D')}`
    else label = monthFmt ? monthFmt(cur.month() + 1) : cur.format('M月')
    cols.push({ label, date: cur, width: w })
    if (mode === 'day')   cur = cur.add(1, 'day')
    else if (mode === 'week') cur = cur.add(1, 'week')
    else cur = cur.add(1, 'month')
  }
  return cols
}

function dateToOffset(date: Dayjs, start: Dayjs, mode: ViewMode): number {
  const w = COL_W[mode]
  if (mode === 'day')   return date.diff(start, 'day') * w
  if (mode === 'week')  return (date.diff(start, 'day') / 7) * w
  return (date.diff(start, 'month', true)) * w
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface GanttChartProps {
  functions: ProjectFunction[]
  milestones?: Milestone[]
  requirements?: Requirement[]
}

const GanttChart: React.FC<GanttChartProps> = ({ functions, milestones = [], requirements = [] }) => {
  const { t } = useTranslation()
  const [mode, setMode]              = useState<ViewMode>('week')
  const [filterGroup, setFilterGroup] = useState<string | null>(null)
  const [filterDev,   setFilterDev]   = useState<string | null>(null)
  const [groupView,   setGroupView]   = useState<'flat' | 'grouped' | 'by_req'>('by_req')
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set())
  const toName = useWorkNoToName()
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleGroup = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }, [])

  // Requirement name map
  const reqNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    requirements.forEach((r) => { m[r.id] = r.req_nm })
    return m
  }, [requirements])

  // Build unique group & developer options from functions
  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(functions.map((f) => f.group1).filter(Boolean)))
    return groups.map((g) => ({ label: g === '__stage__' ? t('common.stageTask') : g, value: g }))
  }, [functions])

  const devOptions = useMemo(() => {
    const devSet = new Set<string>()
    functions.forEach((f) => {
      if (Array.isArray(f.responsible)) f.responsible.forEach((d) => d && devSet.add(d))
    })
    return Array.from(devSet).map((d) => ({ label: toName(d), value: d }))
  }, [functions, toName])

  // Filtered functions
  const visibleFunctions = useMemo(() => {
    return functions.filter((f) => {
      if (filterGroup && f.group1 !== filterGroup) return false
      if (filterDev && (!Array.isArray(f.responsible) || !f.responsible.includes(filterDev))) return false
      return true
    })
  }, [functions, filterGroup, filterDev])

  // Group data (only for 'grouped' mode)
  const groups: GroupData[] = useMemo(() => {
    if (groupView !== 'grouped') return []
    const map = new Map<string, ProjectFunction[]>()
    visibleFunctions.forEach((f) => {
      const g = f.group1 || '__nogroup__'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    })
    return Array.from(map.entries()).map(([name, items]) => {
      const dates = items.flatMap((f) => [
        f.expected_start_date ? dayjs(f.expected_start_date) : null,
        f.expected_end_date ? dayjs(f.expected_end_date) : null,
      ]).filter(Boolean) as Dayjs[]
      const startTimes = items.map((f) => f.start_time ? dayjs(f.start_time) : null).filter(Boolean) as Dayjs[]
      const allDone = items.every((f) => f.status === 4)
      const endTimes = allDone ? items.map((f) => f.end_time ? dayjs(f.end_time) : null).filter(Boolean) as Dayjs[] : []
      return {
        name,
        items,
        minDate: dates.length > 0 ? dates.reduce((a, b) => (a.isBefore(b) ? a : b)) : null,
        maxDate: dates.length > 0 ? dates.reduce((a, b) => (a.isAfter(b) ? a : b)) : null,
        actualStart: startTimes.length > 0 ? startTimes.reduce((a, b) => (a.isBefore(b) ? a : b)) : null,
        actualEnd: endTimes.length > 0 && allDone ? endTimes.reduce((a, b) => (a.isAfter(b) ? a : b)) : null,
        avgProgress: Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
      }
    })
  }, [visibleFunctions, groupView])

  // Build flat row list for rendering (group header + tasks, respecting collapse)
  type RowItem =
    | { type: 'req'; reqKey: string; reqNm: string; taskCount: number; minDate: Dayjs | null; maxDate: Dayjs | null; actualStart: Dayjs | null; actualEnd: Dayjs | null; avgProgress: number }
    | { type: 'group'; group: GroupData; colorIdx: number; insideReq: boolean; toggleKey: string }
    | { type: 'task'; func: ProjectFunction; oddRow: boolean; paddingLeft: number }

  const buildGroupData = (name: string, items: ProjectFunction[]): GroupData => {
    const dates = items.flatMap((f) => [
      f.expected_start_date ? dayjs(f.expected_start_date) : null,
      f.expected_end_date   ? dayjs(f.expected_end_date)   : null,
    ]).filter(Boolean) as Dayjs[]
    const startTimes = items.map((f) => f.start_time ? dayjs(f.start_time) : null).filter(Boolean) as Dayjs[]
    const allDone    = items.every((f) => f.status === 4)
    const endTimes   = allDone ? items.map((f) => f.end_time ? dayjs(f.end_time) : null).filter(Boolean) as Dayjs[] : []
    return {
      name,
      items,
      minDate:      dates.length      ? dates.reduce((a, b) => (a.isBefore(b) ? a : b))      : null,
      maxDate:      dates.length      ? dates.reduce((a, b) => (a.isAfter(b)  ? a : b))      : null,
      actualStart:  startTimes.length ? startTimes.reduce((a, b) => (a.isBefore(b) ? a : b)) : null,
      actualEnd:    endTimes.length   ? endTimes.reduce((a, b) => (a.isAfter(b)  ? a : b))   : null,
      avgProgress:  Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
    }
  }

  const rows: RowItem[] = useMemo(() => {
    if (groupView === 'flat') {
      return visibleFunctions.map((f, idx) => ({ type: 'task' as const, func: f, oddRow: idx % 2 === 1, paddingLeft: 12 }))
    }
    if (groupView === 'grouped') {
      const result: RowItem[] = []
      groups.forEach((g, gi) => {
        result.push({ type: 'group', group: g, colorIdx: gi, insideReq: false, toggleKey: g.name })
        if (!collapsed.has(g.name)) {
          g.items.forEach((f, fi) => {
            result.push({ type: 'task', func: f, oddRow: fi % 2 === 1, paddingLeft: 28 })
          })
        }
      })
      return result
    }

    // ── by_req mode ───────────────────────────────────────────────────────────
    const result: RowItem[] = []
    const byReqMap = new Map<string, ProjectFunction[]>()
    visibleFunctions.forEach((f) => {
      const k = f.requirement_id || '__none__'
      if (!byReqMap.has(k)) byReqMap.set(k, [])
      byReqMap.get(k)!.push(f)
    })
    const hasAnyReq   = [...byReqMap.keys()].some((k) => k !== '__none__')
    const reqKeys     = [...byReqMap.keys()].sort((a, b) => (a === '__none__' ? 1 : b === '__none__' ? -1 : 0))
    let colorIdx = 0

    reqKeys.forEach((reqKey) => {
      const tasks      = byReqMap.get(reqKey)!
      const isReqGroup = hasAnyReq && reqKey !== '__none__'

      // Requirement header row
      if (isReqGroup) {
        const gd = buildGroupData(reqKey, tasks)
        result.push({
          type: 'req', reqKey,
          reqNm:       reqNameMap[reqKey] || reqKey,
          taskCount:   tasks.length,
          minDate:     gd.minDate,
          maxDate:     gd.maxDate,
          actualStart: gd.actualStart,
          actualEnd:   gd.actualEnd,
          avgProgress: gd.avgProgress,
        })
        if (collapsed.has(`r:${reqKey}`)) return
      }

      // Sub-group by group1
      const byGroupMap = new Map<string, ProjectFunction[]>()
      tasks.forEach((f) => {
        const g = f.group1 || '__nogroup__'
        if (!byGroupMap.has(g)) byGroupMap.set(g, [])
        byGroupMap.get(g)!.push(f)
      })
      const singleUnnamed = byGroupMap.size === 1 && byGroupMap.has('__nogroup__')
      const showGroups    = !singleUnnamed

      if (showGroups) {
        ;[...byGroupMap.entries()].forEach(([gKey, gTasks]) => {
          const gName      = gKey === '__nogroup__' ? t('gantt.ungrouped') : gKey
          const grpTogKey  = isReqGroup ? `rg:${reqKey}::${gKey}` : `tg:${gKey}`
          const grpOpen    = !collapsed.has(grpTogKey)
          result.push({
            type: 'group',
            group:     buildGroupData(gName, gTasks),
            colorIdx:  colorIdx++ % GROUP_COLORS.length,
            insideReq: isReqGroup,
            toggleKey: grpTogKey,
          })
          if (grpOpen) {
            gTasks.forEach((f, fi) => {
              result.push({ type: 'task', func: f, oddRow: fi % 2 === 1, paddingLeft: isReqGroup ? 44 : 28 })
            })
          }
        })
      } else {
        tasks.forEach((f, fi) => {
          result.push({ type: 'task', func: f, oddRow: fi % 2 === 1, paddingLeft: isReqGroup ? 32 : 12 })
        })
      }
    })
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupView, groups, visibleFunctions, collapsed, reqNameMap])

  // Compute date range from visible functions
  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates: Dayjs[] = []
    visibleFunctions.forEach((f) => {
      if (f.expected_start_date) dates.push(dayjs(f.expected_start_date))
      if (f.expected_end_date)   dates.push(dayjs(f.expected_end_date))
      if (f.start_time)          dates.push(dayjs(f.start_time))
      if (f.end_time)            dates.push(dayjs(f.end_time))
    })
    milestones.forEach((m) => {
      if (m.target_date) dates.push(dayjs(m.target_date))
      if (m.achieved_at) dates.push(dayjs(m.achieved_at.slice(0, 10)))
    })
    if (dates.length === 0) return { rangeStart: dayjs().subtract(1, 'week'), rangeEnd: dayjs().add(8, 'week') }
    const min = dates.reduce((a, b) => (a.isBefore(b) ? a : b))
    const max = dates.reduce((a, b) => (a.isAfter(b) ? a : b))
    const start = mode === 'day'   ? min.subtract(2, 'day')
                : mode === 'week'  ? min.subtract(1, 'week').startOf('week')
                : min.subtract(1, 'month').startOf('month')
    // 右边界：只有存在未完结任务时才延伸到「今天 + 缓冲」，已全部完结的专案直接用最晚日期
    const hasActiveTasks = visibleFunctions.some((f) => f.status !== 4 && f.status !== 9)
    const buffer = mode === 'day' ? dayjs().add(1, 'month') : mode === 'week' ? dayjs().add(2, 'month') : dayjs().add(3, 'month')
    const effectiveMax = hasActiveTasks && buffer.isAfter(max) ? buffer : max
    const end   = mode === 'day'   ? effectiveMax.add(2, 'day')
                : mode === 'week'  ? effectiveMax.add(1, 'week').endOf('week')
                : effectiveMax.add(1, 'month').endOf('month')
    return { rangeStart: start, rangeEnd: end }
  }, [visibleFunctions, milestones, mode])

  const monthFmt = useCallback((m: number) => t('gantt.monthFormat', { month: m }), [t])
  const columns = useMemo(() => buildColumns(rangeStart, rangeEnd, mode, monthFmt), [rangeStart, rangeEnd, mode, monthFmt])
  const totalW  = columns.reduce((s, c) => s + c.width, 0)
  const today   = dayjs()
  const todayX  = dateToOffset(today, rangeStart, mode) + COL_W[mode] / 2

  // Scroll to show today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = Math.max(0, todayX - 200)
      scrollRef.current.scrollLeft = scrollTo
    }
  }, [mode, todayX])

  if (functions.length === 0) return <Empty description={t('gantt.noTasks')} className="my-12" />
  const isFiltered = filterGroup !== null || filterDev !== null

  // Month label groups (for week/day modes, show month header)
  const monthGroups = useMemo(() => {
    if (mode === 'month') return []
    const mGroups: { label: string; span: number }[] = []
    let cur = rangeStart.startOf('month')
    while (!cur.isAfter(rangeEnd)) {
      const next = cur.add(1, 'month').startOf('month')
      const span = columns.filter((c) => c.date.month() === cur.month() && c.date.year() === cur.year()).length
      if (span > 0) mGroups.push({ label: t('gantt.yearMonthFormat', { year: cur.year(), month: cur.month() + 1 }), span })
      cur = next
    }
    return mGroups
  }, [columns, rangeStart, rangeEnd, mode])

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderTaskBar = (f: ProjectFunction) => {
    const planStart = f.expected_start_date ? dayjs(f.expected_start_date) : null
    const planEnd   = f.expected_end_date   ? dayjs(f.expected_end_date)   : null
    if (!planStart || !planEnd) return null

    const actualStart = f.start_time ? dayjs(f.start_time) : null
    const actualEnd   = f.end_time   ? dayjs(f.end_time)   : null

    // Reschedule info
    const originalPlanEnd  = f.original_end_date ? dayjs(f.original_end_date) : null
    const hasReschedule    = (f.reschedule_count ?? 0) > 0 && !!originalPlanEnd && planEnd.isAfter(originalPlanEnd)

    const GRAY   = '#d1d5db'
    const YELLOW = '#fbbf24'
    const RED    = '#f87171'
    const GREEN  = '#4ade80'

    // Right edge of the whole bar
    const barEnd = actualEnd && actualEnd.isAfter(planEnd)
      ? actualEnd
      : !actualEnd && today.isAfter(planEnd) && actualStart
        ? today
        : planEnd

    const toX = (d: Dayjs) => Math.max(0, dateToOffset(d, rangeStart, mode))

    interface Seg { key: string; left: number; width: number; color: string }
    const segs: Seg[] = []

    const addSeg = (from: Dayjs, to: Dayjs, color: string, key: string) => {
      if (to.isBefore(from)) return
      const x1 = toX(from)
      const x2 = toX(to.add(1, 'day'))
      const w  = x2 - x1
      if (w > 0) segs.push({ key, left: x1, width: w, color })
    }

    if (!actualStart) {
      // Not started: full gray
      addSeg(planStart, planEnd, GRAY, 'g0')
    } else {
      // Pre-start gray (actual start was later than plan start)
      if (actualStart.isAfter(planStart)) {
        addSeg(planStart, actualStart.subtract(1, 'day'), GRAY, 'g-pre')
      }

      if (actualEnd) {
        if (!actualEnd.isAfter(planEnd)) {
          // Completed on time or early
          if (!actualEnd.subtract(1, 'day').isBefore(actualStart)) {
            addSeg(actualStart, actualEnd.subtract(1, 'day'), YELLOW, 'y')
          }
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
          // Trailing gray for remaining planned time
          if (actualEnd.isBefore(planEnd)) {
            addSeg(actualEnd.add(1, 'day'), planEnd, GRAY, 'g-trail')
          }
        } else {
          // Completed late
          addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
          addSeg(planEnd, actualEnd.subtract(1, 'day'), RED, 'r')
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
        }
      } else if (today.isAfter(planEnd)) {
        // Still in progress, overdue
        addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
        addSeg(planEnd, today, RED, 'r')
      } else {
        // Still in progress, on time
        addSeg(actualStart, today, YELLOW, 'y')
        if (today.isBefore(planEnd)) {
          addSeg(today.add(1, 'day'), planEnd, GRAY, 'g-future')
        }
      }
    }

    const containerX = toX(planStart)
    const containerW = Math.max(8, toX(barEnd.add(1, 'day')) - containerX)
    const isLateDone  = actualEnd && actualEnd.isAfter(planEnd)

    const tooltipContent = (
      <div style={{ fontSize: 11 }}>
        <div className="font-semibold mb-1">{f.function_nm}</div>
        <div className="opacity-70">{t('gantt.plan')}：{f.expected_start_date || '—'} → {f.expected_end_date || '—'}</div>
        {(f.start_time || f.end_time) && (
          <div className={isLateDone ? 'text-red-300' : 'text-green-300'}>
            {t('gantt.actual')}：{f.start_time || '—'} → {f.end_time || t('gantt.inProgress')}
            {isLateDone ? ` ⚠ ${t('gantt.overdue')}` : f.end_time ? ` ✓ ${t('gantt.onTime')}` : ''}
          </div>
        )}
        {hasReschedule && (
          <div className="text-orange-300 mt-0.5">
            {t('gantt.originalDeadline')}：{f.original_end_date}，{t('gantt.rescheduledTimes', { count: f.reschedule_count })}
          </div>
        )}
        <div className="opacity-70 mt-0.5">{t('common.progress')} {f.progress}%</div>
      </div>
    )

    return (
      <Tooltip title={tooltipContent}>
        <div
          style={{
            position: 'absolute',
            left: containerX, top: 12,
            height: 20, width: containerW,
            borderRadius: 4, overflow: 'hidden', cursor: 'pointer',
          }}
        >
          {segs.map((seg) => (
            <div
              key={seg.key}
              style={{
                position: 'absolute',
                left: seg.left - containerX,
                top: 0, bottom: 0,
                width: seg.width,
                background: seg.color,
              }}
            />
          ))}
          {/* B: Delay extension overlay — semi-transparent orange tint + left border at reschedule boundary */}
          {hasReschedule && originalPlanEnd && (() => {
            const extLeft  = toX(originalPlanEnd.add(1, 'day')) - containerX
            const extWidth = toX(planEnd.add(1, 'day')) - toX(originalPlanEnd.add(1, 'day'))
            if (extWidth <= 0) return null
            return (
              <div style={{
                position: 'absolute',
                left: extLeft, top: 0, bottom: 0,
                width: extWidth,
                background: 'rgba(251,146,60,0.28)',
                borderLeft: '2px solid #f97316',
                pointerEvents: 'none',
              }} />
            )
          })()}
          {containerW > 44 && (
            <span style={{
              position: 'absolute', left: 6, top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10, fontWeight: 700, color: '#374151',
              whiteSpace: 'nowrap', zIndex: 1,
              textShadow: '0 0 3px rgba(255,255,255,0.9)',
            }}>
              {f.progress}%
            </span>
          )}
        </div>
      </Tooltip>
    )
  }

  const renderGroupBand = (g: GroupData, _colorIdx: number) => {
    const planStart = g.minDate
    const planEnd   = g.maxDate
    if (!planStart || !planEnd) return null

    const actualStart = g.actualStart
    const actualEnd   = g.actualEnd

    const GRAY   = '#d1d5db'
    const YELLOW = '#fbbf24'
    const RED    = '#f87171'
    const GREEN  = '#4ade80'

    const barEnd = actualEnd && actualEnd.isAfter(planEnd)
      ? actualEnd
      : !actualEnd && today.isAfter(planEnd) && actualStart
        ? today
        : planEnd

    const toX = (d: Dayjs) => Math.max(0, dateToOffset(d, rangeStart, mode))

    interface Seg { key: string; left: number; width: number; color: string }
    const segs: Seg[] = []

    const addSeg = (from: Dayjs, to: Dayjs, color: string, key: string) => {
      if (to.isBefore(from)) return
      const x1 = toX(from)
      const x2 = toX(to.add(1, 'day'))
      const w  = x2 - x1
      if (w > 0) segs.push({ key, left: x1, width: w, color })
    }

    if (!actualStart) {
      addSeg(planStart, planEnd, GRAY, 'g0')
    } else {
      if (actualStart.isAfter(planStart)) {
        addSeg(planStart, actualStart.subtract(1, 'day'), GRAY, 'g-pre')
      }
      if (actualEnd) {
        if (!actualEnd.isAfter(planEnd)) {
          if (!actualEnd.subtract(1, 'day').isBefore(actualStart)) {
            addSeg(actualStart, actualEnd.subtract(1, 'day'), YELLOW, 'y')
          }
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
          if (actualEnd.isBefore(planEnd)) {
            addSeg(actualEnd.add(1, 'day'), planEnd, GRAY, 'g-trail')
          }
        } else {
          addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
          addSeg(planEnd, actualEnd.subtract(1, 'day'), RED, 'r')
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
        }
      } else if (today.isAfter(planEnd)) {
        addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
        addSeg(planEnd, today, RED, 'r')
      } else {
        addSeg(actualStart, today, YELLOW, 'y')
        if (today.isBefore(planEnd)) {
          addSeg(today.add(1, 'day'), planEnd, GRAY, 'g-future')
        }
      }
    }

    const containerX = toX(planStart)
    const containerW = Math.max(20, toX(barEnd.add(1, 'day')) - containerX)

    return (
      <Tooltip title={t('gantt.groupTooltip', { name: g.name === '__nogroup__' ? t('gantt.ungrouped') : g.name === '__stage__' ? t('common.stageTask') : g.name, count: g.items.length, progress: g.avgProgress })}>
        <div
          style={{
            position: 'absolute',
            left: containerX, top: 6, height: GROUP_H - 12, width: containerW,
            borderRadius: 5, overflow: 'hidden', cursor: 'pointer',
          }}
        >
          {segs.map((seg) => (
            <div
              key={seg.key}
              style={{
                position: 'absolute',
                left: seg.left - containerX,
                top: 0, bottom: 0,
                width: seg.width,
                background: seg.color,
                opacity: 0.75,
              }}
            />
          ))}
          {containerW > 44 && (
            <span style={{
              position: 'absolute', left: 8, top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 10, fontWeight: 700, color: '#374151',
              whiteSpace: 'nowrap', zIndex: 1,
              textShadow: '0 0 3px rgba(255,255,255,0.9)',
            }}>
              {g.avgProgress}%
            </span>
          )}
        </div>
      </Tooltip>
    )
  }

  const renderReqBand = (row: Extract<RowItem, { type: 'req' }>) => {
    const { minDate: planStart, maxDate: planEnd, actualStart, actualEnd, avgProgress } = row
    if (!planStart || !planEnd) return null

    const GRAY   = '#d1d5db'
    const YELLOW = '#fbbf24'
    const RED    = '#f87171'
    const GREEN  = '#4ade80'

    const barEnd = actualEnd && actualEnd.isAfter(planEnd)
      ? actualEnd
      : !actualEnd && today.isAfter(planEnd) && actualStart ? today : planEnd

    const toX = (d: Dayjs) => Math.max(0, dateToOffset(d, rangeStart, mode))
    interface Seg { key: string; left: number; width: number; color: string }
    const segs: Seg[] = []
    const addSeg = (from: Dayjs, to: Dayjs, color: string, key: string) => {
      if (to.isBefore(from)) return
      const w = toX(to.add(1, 'day')) - toX(from)
      if (w > 0) segs.push({ key, left: toX(from), width: w, color })
    }

    if (!actualStart) {
      addSeg(planStart, planEnd, GRAY, 'g0')
    } else {
      if (actualStart.isAfter(planStart)) addSeg(planStart, actualStart.subtract(1, 'day'), GRAY, 'g-pre')
      if (actualEnd) {
        if (!actualEnd.isAfter(planEnd)) {
          if (!actualEnd.subtract(1, 'day').isBefore(actualStart)) addSeg(actualStart, actualEnd.subtract(1, 'day'), YELLOW, 'y')
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
          if (actualEnd.isBefore(planEnd)) addSeg(actualEnd.add(1, 'day'), planEnd, GRAY, 'g-trail')
        } else {
          addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
          addSeg(planEnd, actualEnd.subtract(1, 'day'), RED, 'r')
          addSeg(actualEnd, actualEnd, GREEN, 'g-done')
        }
      } else if (today.isAfter(planEnd)) {
        addSeg(actualStart, planEnd.subtract(1, 'day'), YELLOW, 'y')
        addSeg(planEnd, today, RED, 'r')
      } else {
        addSeg(actualStart, today, YELLOW, 'y')
        if (today.isBefore(planEnd)) addSeg(today.add(1, 'day'), planEnd, GRAY, 'g-future')
      }
    }

    const containerX = toX(planStart)
    const containerW = Math.max(20, toX(barEnd.add(1, 'day')) - containerX)

    return (
      <Tooltip title={t('gantt.groupTooltip', { name: row.reqNm, count: row.taskCount, progress: avgProgress })}>
        <div style={{ position: 'absolute', left: containerX, top: 6, height: GROUP_H - 12, width: containerW, borderRadius: 5, overflow: 'hidden', cursor: 'pointer' }}>
          {segs.map((seg) => (
            <div key={seg.key} style={{ position: 'absolute', left: seg.left - containerX, top: 0, bottom: 0, width: seg.width, background: seg.color, opacity: 0.75 }} />
          ))}
          {containerW > 44 && (
            <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', zIndex: 1, textShadow: '0 0 3px rgba(255,255,255,0.9)' }}>
              {avgProgress}%
            </span>
          )}
        </div>
      </Tooltip>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-1">
        {/* Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
          {LEGEND_KEYS.map((item) => (
            <div key={item.key} className="flex items-center gap-1">
              <div className="w-5 h-3 rounded-sm flex-shrink-0" style={{ background: item.color }} />
              <span>{t(item.key)}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded-sm flex-shrink-0" style={{ background: 'rgba(251,146,60,0.28)', borderLeft: '2px solid #f97316' }} />
            <span>{t('gantt.legendRescheduleRange')}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-base leading-none" style={{ color: '#2563eb' }}>◆</span>
            <span>{t('gantt.milestone')}</span>
          </div>
        </div>

        {/* Right controls: filters + view toggles */}
        <div className="flex items-center gap-2">
          {/* Group view toggle */}
          <Segmented
            size="small"
            value={groupView}
            onChange={(v) => setGroupView(v as 'flat' | 'grouped' | 'by_req')}
            options={[
              { label: t('gantt.viewByReq'),   value: 'by_req'  },
              { label: t('gantt.viewGrouped'), value: 'grouped' },
              { label: t('gantt.viewFlat'),    value: 'flat'    },
            ]}
          />

          <div className="w-px h-4 bg-slate-200" />

          {/* Filter icon */}
          <FunnelIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isFiltered ? 'text-blue-500' : 'text-slate-400'}`} />

          {/* Group filter */}
          {groupOptions.length > 0 && (
            <Select
              allowClear
              placeholder={t('gantt.filterGroup')}
              size="small"
              style={{ width: 90 }}
              value={filterGroup}
              onChange={(v) => setFilterGroup(v ?? null)}
              options={groupOptions}
            />
          )}

          {/* Developer filter */}
          {devOptions.length > 0 && (
            <Select
              allowClear
              placeholder={t('gantt.filterDeveloper')}
              size="small"
              style={{ width: 90 }}
              value={filterDev}
              onChange={(v) => setFilterDev(v ?? null)}
              options={devOptions}
            />
          )}

          {/* View mode */}
          <Segmented
            size="small"
            value={mode}
            onChange={(v) => setMode(v as ViewMode)}
            options={[
              { label: t('gantt.modeDay'),   value: 'day' },
              { label: t('gantt.modeWeek'),  value: 'week' },
              { label: t('gantt.modeMonth'), value: 'month' },
            ]}
          />
        </div>
      </div>

      {/* Empty state after filter */}
      {visibleFunctions.length === 0 && (
        <Empty description={isFiltered ? t('gantt.noTasksFiltered') : t('gantt.noTasks')} className="my-8" />
      )}

      {/* Gantt Table */}
      {visibleFunctions.length === 0 ? null : <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="flex">
          {/* Left fixed column — task names */}
          <div style={{ width: NAME_W, minWidth: NAME_W, flexShrink: 0, zIndex: 2, background: 'white' }}>
            {/* Header row */}
            <div
              className="border-b border-r border-slate-200 bg-slate-50 flex items-center px-3"
              style={{ height: mode === 'month' ? ROW_H : ROW_H * 2 }}
            >
              <span className="text-xs font-semibold text-slate-500">{t('gantt.functionTasks')}</span>
            </div>
            {/* Task / Group rows */}
            {rows.map((row) => {
              if (row.type === 'req') {
                const isOpen = !collapsed.has(`r:${row.reqKey}`)
                return (
                  <div
                    key={`r-${row.reqKey}`}
                    className="flex items-center px-2 gap-1.5 border-b border-r border-slate-200 cursor-pointer select-none"
                    style={{ height: GROUP_H, background: '#faf5ff' }}
                    onClick={() => toggleGroup(`r:${row.reqKey}`)}
                  >
                    {isOpen
                      ? <ChevronDownIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />
                      : <ChevronRightIcon className="w-3 h-3 text-purple-400 flex-shrink-0" />}
                    <span className="text-xs font-bold text-purple-700 truncate">{row.reqNm}</span>
                    <span className="text-[10px] text-purple-400 flex-shrink-0 ml-auto">{t('gantt.itemCount', { count: row.taskCount })}</span>
                  </div>
                )
              }
              if (row.type === 'group') {
                const isOpen = !collapsed.has(row.toggleKey)
                const color  = GROUP_COLORS[row.colorIdx % GROUP_COLORS.length]
                return (
                  <div
                    key={`g-${row.toggleKey}`}
                    className="flex items-center gap-1.5 border-b border-r border-slate-200 cursor-pointer select-none"
                    style={{ height: GROUP_H, background: '#f1f5f9', paddingLeft: row.insideReq ? 20 : 8, paddingRight: 8 }}
                    onClick={() => toggleGroup(row.toggleKey)}
                  >
                    {isOpen
                      ? <ChevronDownIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      : <ChevronRightIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                    <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                    <span className="text-xs font-bold text-slate-600 truncate">{row.group.name === '__nogroup__' ? t('gantt.ungrouped') : row.group.name === '__stage__' ? t('common.stageTask') : row.group.name}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">{t('gantt.itemCount', { count: row.group.items.length })}</span>
                  </div>
                )
              }
              return (
                <div
                  key={row.func.id}
                  className="flex items-center gap-2 border-b border-r border-slate-100"
                  style={{
                    height: ROW_H,
                    background: row.oddRow ? '#fafafa' : 'white',
                    paddingLeft: row.paddingLeft,
                    paddingRight: 12,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: getDotColor(row.func, today) }}
                  />
                  <Tooltip title={row.func.function_nm}>
                    <span className="text-xs text-slate-700 truncate font-medium">{row.func.function_nm}</span>
                  </Tooltip>
                </div>
              )
            })}
            {/* Milestone rows */}
            {milestones.length > 0 && (
              <div className="border-t-2 border-slate-200">
                <div className="flex items-center px-3 border-b border-r border-slate-200 bg-slate-50" style={{ height: ROW_H }}>
                  <span className="text-xs font-semibold text-slate-500">{t('gantt.milestone')}</span>
                </div>
                {milestones.map((m) => {
                  // Dot color: if achieved, reflect early/on-time/late
                  let dotColor = '#2563eb'
                  if (m.status === 'overdue') dotColor = '#dc2626'
                  else if (m.status === 'achieved' && m.achieved_at) {
                    const diff = dayjs(m.achieved_at.slice(0, 10)).diff(dayjs(m.target_date), 'day')
                    dotColor = diff < 0 ? '#16a34a' : diff === 0 ? '#2563eb' : '#dc2626'
                  } else if (m.status === 'achieved') dotColor = '#16a34a'
                  return (
                    <div key={m.id} className="flex items-center px-3 gap-2 border-b border-r border-slate-100" style={{ height: ROW_H }}>
                      <span className="text-base leading-none" style={{ color: dotColor }}>◆</span>
                      <span className="text-xs text-slate-700 truncate">{m.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Right scrollable area */}
          <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', position: 'relative' }}>
            <div style={{ width: totalW, minWidth: totalW, position: 'relative' }}>
              {/* Header */}
              <div style={{ height: mode === 'month' ? ROW_H : ROW_H * 2, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1 }}>
                {/* Month row (for day/week modes) */}
                {mode !== 'month' && (
                  <div className="flex" style={{ height: ROW_H, borderBottom: '1px solid #e2e8f0' }}>
                    {monthGroups.map((g, i) => (
                      <div
                        key={i}
                        style={{ width: g.span * COL_W[mode], borderRight: '1px solid #e2e8f0', flexShrink: 0 }}
                        className="flex items-center px-2"
                      >
                        <span className="text-xs font-semibold text-slate-500">{g.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Column labels row */}
                <div className="flex" style={{ height: ROW_H }}>
                  {columns.map((col, i) => {
                    const isToday = mode === 'day' && col.date.isSame(today, 'day')
                    return (
                      <div
                        key={i}
                        style={{ width: col.width, borderRight: '1px solid #e2e8f0', flexShrink: 0 }}
                        className={`flex items-center justify-center ${isToday ? 'bg-blue-50' : ''}`}
                      >
                        <span className={`text-[10px] font-medium ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                          {col.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Task bars area */}
              <div style={{ position: 'relative' }}>
                {/* Background grid */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none' }}>
                  {columns.map((col, i) => {
                    const isWeekend = mode === 'day' && (col.date.day() === 0 || col.date.day() === 6)
                    const isTodayCol = mode === 'day' && col.date.isSame(today, 'day')
                    return (
                      <div
                        key={i}
                        style={{
                          width: col.width, flexShrink: 0,
                          borderRight: '1px solid #f1f5f9',
                          background: isWeekend ? '#f8fafc' : isTodayCol ? '#eff6ff' : 'transparent',
                        }}
                      />
                    )
                  })}
                </div>

                {/* Rows — req / group headers + task bars */}
                {rows.map((row) => {
                  if (row.type === 'req') {
                    return (
                      <div
                        key={`r-${row.reqKey}`}
                        style={{ height: GROUP_H, borderBottom: '1px solid #e2e8f0', position: 'relative', background: '#faf5ff' }}
                      >
                        {renderReqBand(row)}
                      </div>
                    )
                  }
                  if (row.type === 'group') {
                    return (
                      <div
                        key={`g-${row.toggleKey}`}
                        style={{ height: GROUP_H, borderBottom: '1px solid #e2e8f0', position: 'relative', background: '#f1f5f9' }}
                      >
                        {renderGroupBand(row.group, row.colorIdx)}
                      </div>
                    )
                  }
                  return (
                    <div
                      key={row.func.id}
                      style={{ height: ROW_H, borderBottom: '1px solid #f1f5f9', position: 'relative', background: row.oddRow ? '#fafafa' : 'white' }}
                    >
                      {renderTaskBar(row.func)}
                    </div>
                  )
                })}

                {/* Milestone rows */}
                {milestones.length > 0 && (
                  <>
                    {/* Section header row */}
                    <div style={{ height: ROW_H, borderTop: '2px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }} />
                    {milestones.map((m) => {
                      const targetDate = dayjs(m.target_date)
                      const tx = dateToOffset(targetDate, rangeStart, mode) + COL_W[mode] / 2

                      // Actual achievement diamond (only when achieved)
                      let ax: number | null = null
                      let actualColor = '#16a34a'
                      if (m.status === 'achieved' && m.achieved_at) {
                        const achievedDate = dayjs(m.achieved_at.slice(0, 10))
                        ax = dateToOffset(achievedDate, rangeStart, mode) + COL_W[mode] / 2
                        const diff = achievedDate.diff(targetDate, 'day')
                        actualColor = diff < 0 ? '#16a34a' : diff === 0 ? '#2563eb' : '#dc2626'
                      }

                      const tooltipText = m.status === 'achieved' && m.achieved_at
                        ? `${m.name} · ${t('gantt.target')}: ${m.target_date} · ${t('gantt.achieved')}: ${m.achieved_at.slice(0, 10)}`
                        : `${m.name} · ${t('gantt.target')}: ${m.target_date}`

                      return (
                        <div key={m.id} style={{ height: ROW_H, borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                          {/* Target date diamond — always shown (hollow/gray) */}
                          <Tooltip title={tooltipText}>
                            <div
                              style={{
                                position: 'absolute',
                                left: tx - 9,
                                top: 12,
                                fontSize: 18,
                                color: '#94a3b8',
                                cursor: 'pointer',
                                userSelect: 'none',
                                WebkitTextStroke: '1px #64748b',
                              }}
                            >
                              ◇
                            </div>
                          </Tooltip>
                          {/* Actual achievement diamond — only when achieved */}
                          {ax !== null && (
                            <Tooltip title={tooltipText}>
                              <div
                                style={{
                                  position: 'absolute',
                                  left: ax - 9,
                                  top: 12,
                                  fontSize: 18,
                                  color: actualColor,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                                }}
                              >
                                ◆
                              </div>
                            </Tooltip>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}

                {/* Today vertical line */}
                {todayX >= 0 && todayX <= totalW && (
                  <div
                    style={{
                      position: 'absolute',
                      left: todayX,
                      top: 0,
                      bottom: 0,
                      width: 2,
                      background: '#ef4444',
                      opacity: 0.7,
                      pointerEvents: 'none',
                      zIndex: 5,
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
                      width: 8, height: 8, borderRadius: '50%', background: '#ef4444',
                    }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>}
    </div>
  )
}

export default GanttChart
