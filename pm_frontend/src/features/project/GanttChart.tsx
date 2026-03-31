/**
 * GanttChart — 自製甘特圖（純 CSS/div，無需外部庫）
 * 支持：日/週/月 視圖 · 狀態顏色 · 里程碑標記 · 今日線 · 進度條 · 分組視圖
 */
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { Segmented, Tooltip, Empty, Select } from 'antd'
import { FunnelIcon, FolderIcon, ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { ProjectFunction, Milestone } from '@/types/api.types'
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
  minDate: Dayjs | null
  maxDate: Dayjs | null
  avgProgress: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_H   = 44
const GROUP_H = 36
const NAME_W  = 230
const COL_W   = { day: 30, week: 70, month: 100 }
const STATUS_COLORS: Record<number, { bar: string; text: string }> = {
  1: { bar: '#cbd5e1', text: '#64748b' }, // 待開始
  2: { bar: '#93c5fd', text: '#2563eb' }, // 進行中
  3: { bar: '#fcd34d', text: '#d97706' }, // 完結審核
  4: { bar: '#86efac', text: '#16a34a' }, // 已完結
}
const GROUP_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildColumns(start: Dayjs, end: Dayjs, mode: ViewMode): Column[] {
  const cols: Column[] = []
  let cur = start.clone()
  const w = COL_W[mode]
  while (!cur.isAfter(end)) {
    let label = ''
    if (mode === 'day')   label = cur.format('D')
    else if (mode === 'week') label = `${cur.format('M/D')}`
    else label = cur.format('M月')
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
}

const GanttChart: React.FC<GanttChartProps> = ({ functions, milestones = [] }) => {
  const [mode, setMode]              = useState<ViewMode>('week')
  const [filterGroup, setFilterGroup] = useState<string | null>(null)
  const [filterDev,   setFilterDev]   = useState<string | null>(null)
  const [groupView,   setGroupView]   = useState<'flat' | 'grouped'>('grouped')
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const toggleGroup = useCallback((name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }, [])

  // Build unique group & developer options from functions
  const groupOptions = useMemo(() => {
    const groups = Array.from(new Set(functions.map((f) => f.group1).filter(Boolean)))
    return groups.map((g) => ({ label: g, value: g }))
  }, [functions])

  const devOptions = useMemo(() => {
    const devSet = new Set<string>()
    functions.forEach((f) => {
      if (Array.isArray(f.responsible)) f.responsible.forEach((d) => d && devSet.add(d))
    })
    return Array.from(devSet).map((d) => ({ label: d, value: d }))
  }, [functions])

  // Filtered functions
  const visibleFunctions = useMemo(() => {
    return functions.filter((f) => {
      if (filterGroup && f.group1 !== filterGroup) return false
      if (filterDev && (!Array.isArray(f.responsible) || !f.responsible.includes(filterDev))) return false
      return true
    })
  }, [functions, filterGroup, filterDev])

  // Group data
  const groups: GroupData[] = useMemo(() => {
    if (groupView === 'flat') return []
    const map = new Map<string, ProjectFunction[]>()
    visibleFunctions.forEach((f) => {
      const g = f.group1 || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    })
    return Array.from(map.entries()).map(([name, items]) => {
      const dates = items.flatMap((f) => [
        f.expected_start_date ? dayjs(f.expected_start_date) : null,
        f.expected_end_date ? dayjs(f.expected_end_date) : null,
      ]).filter(Boolean) as Dayjs[]
      return {
        name,
        items,
        minDate: dates.length > 0 ? dates.reduce((a, b) => (a.isBefore(b) ? a : b)) : null,
        maxDate: dates.length > 0 ? dates.reduce((a, b) => (a.isAfter(b) ? a : b)) : null,
        avgProgress: Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
      }
    })
  }, [visibleFunctions, groupView])

  // Build flat row list for rendering (group header + tasks, respecting collapse)
  type RowItem =
    | { type: 'group'; group: GroupData; colorIdx: number }
    | { type: 'task'; func: ProjectFunction; oddRow: boolean }
  const rows: RowItem[] = useMemo(() => {
    if (groupView === 'flat') {
      return visibleFunctions.map((f, idx) => ({ type: 'task' as const, func: f, oddRow: idx % 2 === 1 }))
    }
    const result: RowItem[] = []
    groups.forEach((g, gi) => {
      result.push({ type: 'group', group: g, colorIdx: gi })
      if (!collapsed.has(g.name)) {
        g.items.forEach((f, fi) => {
          result.push({ type: 'task', func: f, oddRow: fi % 2 === 1 })
        })
      }
    })
    return result
  }, [groupView, groups, visibleFunctions, collapsed])

  // Compute date range from visible functions
  const { rangeStart, rangeEnd } = useMemo(() => {
    const dates: Dayjs[] = []
    visibleFunctions.forEach((f) => {
      if (f.expected_start_date) dates.push(dayjs(f.expected_start_date))
      if (f.expected_end_date)   dates.push(dayjs(f.expected_end_date))
    })
    milestones.forEach((m) => dates.push(dayjs(m.target_date)))
    if (dates.length === 0) return { rangeStart: dayjs().subtract(1, 'week'), rangeEnd: dayjs().add(8, 'week') }
    const min = dates.reduce((a, b) => (a.isBefore(b) ? a : b))
    const max = dates.reduce((a, b) => (a.isAfter(b) ? a : b))
    const start = mode === 'day'   ? min.subtract(2, 'day')
                : mode === 'week'  ? min.subtract(1, 'week').startOf('week')
                : min.subtract(1, 'month').startOf('month')
    const end   = mode === 'day'   ? max.add(2, 'day')
                : mode === 'week'  ? max.add(1, 'week').endOf('week')
                : max.add(1, 'month').endOf('month')
    return { rangeStart: start, rangeEnd: end }
  }, [visibleFunctions, milestones, mode])

  const columns = useMemo(() => buildColumns(rangeStart, rangeEnd, mode), [rangeStart, rangeEnd, mode])
  const totalW  = columns.reduce((s, c) => s + c.width, 0)
  const today   = dayjs()
  const todayX  = dateToOffset(today, rangeStart, mode)

  // Scroll to show today on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo = Math.max(0, todayX - 200)
      scrollRef.current.scrollLeft = scrollTo
    }
  }, [mode, todayX])

  if (functions.length === 0) return <Empty description="暫無功能任務" className="my-12" />
  const isFiltered = filterGroup !== null || filterDev !== null

  // Month label groups (for week/day modes, show month header)
  const monthGroups = useMemo(() => {
    if (mode === 'month') return []
    const mGroups: { label: string; span: number }[] = []
    let cur = rangeStart.startOf('month')
    while (!cur.isAfter(rangeEnd)) {
      const next = cur.add(1, 'month').startOf('month')
      const span = columns.filter((c) => c.date.month() === cur.month() && c.date.year() === cur.year()).length
      if (span > 0) mGroups.push({ label: cur.format('YYYY年M月'), span })
      cur = next
    }
    return mGroups
  }, [columns, rangeStart, rangeEnd, mode])

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderTaskBar = (f: ProjectFunction) => {
    const start = f.expected_start_date ? dayjs(f.expected_start_date) : null
    const end   = f.expected_end_date   ? dayjs(f.expected_end_date)   : null
    if (!start || !end) return null

    const x1  = Math.max(0, dateToOffset(start, rangeStart, mode))
    const x2  = dateToOffset(end.add(1, 'day'), rangeStart, mode)
    const w   = Math.max(8, x2 - x1)
    const colors = STATUS_COLORS[f.status] ?? STATUS_COLORS[1]
    const isOverdue = end.isBefore(today) && f.status !== 4

    return (
      <Tooltip
        title={
          <div>
            <div className="font-semibold">{f.function_nm}</div>
            <div className="text-xs opacity-80 mt-0.5">{f.expected_start_date} → {f.expected_end_date}</div>
            <div className="text-xs opacity-80">進度 {f.progress}%</div>
          </div>
        }
      >
        <div
          style={{
            position: 'absolute',
            left: x1, top: 10, height: 24, width: w,
            borderRadius: 4,
            background: isOverdue ? '#fecaca' : colors.bar,
            border: `1.5px solid ${isOverdue ? '#f87171' : colors.text}40`,
            cursor: 'pointer',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${f.progress}%`,
              background: `${colors.text}30`,
              borderRadius: 4,
            }}
          />
          {w > 50 && (
            <span
              style={{
                position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                fontSize: 10, fontWeight: 600, color: colors.text, whiteSpace: 'nowrap',
              }}
            >
              {f.progress}%
            </span>
          )}
        </div>
      </Tooltip>
    )
  }

  const renderGroupBand = (g: GroupData, colorIdx: number) => {
    if (!g.minDate || !g.maxDate) return null
    const x1 = Math.max(0, dateToOffset(g.minDate, rangeStart, mode))
    const x2 = dateToOffset(g.maxDate.add(1, 'day'), rangeStart, mode)
    const w  = Math.max(20, x2 - x1)
    const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length]

    return (
      <Tooltip title={`${g.name}：${g.items.length} 項任務，平均進度 ${g.avgProgress}%`}>
        <div
          style={{
            position: 'absolute',
            left: x1, top: 6, height: GROUP_H - 12, width: w,
            borderRadius: 6,
            background: `${color}18`,
            border: `1.5px solid ${color}50`,
            overflow: 'hidden',
          }}
        >
          {/* Progress fill */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${g.avgProgress}%`,
              background: `${color}25`,
              borderRadius: 6,
            }}
          />
          <span
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap',
            }}
          >
            {g.avgProgress}%
          </span>
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
          {Object.entries(STATUS_COLORS).map(([status, c]) => (
            <div key={status} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: c.bar }} />
              <span>{{ 1:'待開始', 2:'進行中', 3:'完結審核', 4:'已完結' }[Number(status)]}</span>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-base leading-none" style={{ color: '#2563eb' }}>◆</span>
            <span>里程碑</span>
          </div>
        </div>

        {/* Right controls: filters + view toggles */}
        <div className="flex items-center gap-2">
          {/* Group view toggle */}
          <Segmented
            size="small"
            value={groupView}
            onChange={(v) => setGroupView(v as 'flat' | 'grouped')}
            options={[
              { label: '分組', value: 'grouped' },
              { label: '平面', value: 'flat'    },
            ]}
          />

          <div className="w-px h-4 bg-slate-200" />

          {/* Filter icon */}
          <FunnelIcon className={`w-3.5 h-3.5 flex-shrink-0 ${isFiltered ? 'text-blue-500' : 'text-slate-400'}`} />

          {/* Group filter */}
          {groupOptions.length > 0 && (
            <Select
              allowClear
              placeholder="分組"
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
              placeholder="負責人"
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
              { label: '日', value: 'day' },
              { label: '週', value: 'week' },
              { label: '月', value: 'month' },
            ]}
          />
        </div>
      </div>

      {/* Empty state after filter */}
      {visibleFunctions.length === 0 && (
        <Empty description={`過濾條件下暫無任務${isFiltered ? '，請調整篩選條件' : ''}`} className="my-8" />
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
              <span className="text-xs font-semibold text-slate-500">功能任務</span>
            </div>
            {/* Task / Group rows */}
            {rows.map((row) => {
              if (row.type === 'group') {
                const isOpen = !collapsed.has(row.group.name)
                const color = GROUP_COLORS[row.colorIdx % GROUP_COLORS.length]
                return (
                  <div
                    key={`g-${row.group.name}`}
                    className="flex items-center px-2 gap-1.5 border-b border-r border-slate-200 cursor-pointer select-none"
                    style={{ height: GROUP_H, background: '#f1f5f9' }}
                    onClick={() => toggleGroup(row.group.name)}
                  >
                    {isOpen
                      ? <ChevronDownIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      : <ChevronRightIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />}
                    <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
                    <span className="text-xs font-bold text-slate-600 truncate">{row.group.name}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">{row.group.items.length} 項</span>
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
                    paddingLeft: groupView === 'grouped' ? 28 : 12,
                    paddingRight: 12,
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: STATUS_COLORS[row.func.status]?.bar ?? '#cbd5e1' }}
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
                  <span className="text-xs font-semibold text-slate-500">里程碑</span>
                </div>
                {milestones.map((m) => (
                  <div key={m.id} className="flex items-center px-3 gap-2 border-b border-r border-slate-100" style={{ height: ROW_H }}>
                    <span className="text-base leading-none" style={{
                      color: m.status === 'achieved' ? '#16a34a' : m.status === 'overdue' ? '#dc2626' : '#2563eb'
                    }}>◆</span>
                    <span className="text-xs text-slate-700 truncate">{m.name}</span>
                  </div>
                ))}
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

                {/* Rows — group headers + task bars */}
                {rows.map((row) => {
                  if (row.type === 'group') {
                    return (
                      <div
                        key={`g-${row.group.name}`}
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
                      const mDate = dayjs(m.target_date)
                      const mx = dateToOffset(mDate, rangeStart, mode)
                      const markerColor = m.status === 'achieved' ? '#16a34a' : m.status === 'overdue' ? '#dc2626' : '#2563eb'
                      return (
                        <div key={m.id} style={{ height: ROW_H, borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
                          <Tooltip title={`${m.name} · 目標: ${m.target_date}`}>
                            <div
                              style={{
                                position: 'absolute',
                                left: mx - 9,
                                top: 12,
                                fontSize: 18,
                                color: markerColor,
                                cursor: 'pointer',
                                userSelect: 'none',
                                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))',
                              }}
                            >
                              ◆
                            </div>
                          </Tooltip>
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
