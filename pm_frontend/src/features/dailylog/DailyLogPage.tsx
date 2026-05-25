/**
 * DailyLogPage — 個人工作日誌
 * 三個視圖模式：日視圖（填寫/查看）、週視圖（表格匯總）、月視圖（日曆熱力圖）
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Card, Button, Tag, Progress, Modal, Form, Select, Input, InputNumber,
  Switch, Upload, Segmented, Empty, Badge, Popconfirm, Popover,
  AutoComplete, Alert, Spin, DatePicker, Dropdown,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  PlusIcon, PaperClipIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon,
  PencilSquareIcon, TrashIcon, ClockIcon, CalendarDaysIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon, SunIcon, MoonIcon, BriefcaseIcon,
  AcademicCapIcon, UsersIcon, WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import type { DailyLog, DailyLogEntry, WorkCategory } from '@/types/api.types'
import { dailyLogApi, entriesToBackend, backendDetailToLog } from '@/api/daily_log.api'
import { tokenStorage } from '@/api/httpClient'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import dayjs, { Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { exportDailyReport, exportRangeReport } from './exportDailyReport'

dayjs.extend(isoWeek)

// ─── Constants ──────────────────────────────────────────────────────────────
const STANDARD_DAILY_HOURS = 8.0

const WORK_CATEGORIES: { value: WorkCategory; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'project',  label: '專案工作',    color: '#2563eb', icon: <BriefcaseIcon className="w-4 h-4" /> },
  { value: 'cr_ar',    label: 'CR / AR',     color: '#16a34a', icon: <WrenchScrewdriverIcon className="w-4 h-4" /> },
  { value: 'training', label: '教育訓練',    color: '#d97706', icon: <AcademicCapIcon className="w-4 h-4" /> },
  { value: 'meeting',  label: '週會 / 月會', color: '#dc2626', icon: <UsersIcon className="w-4 h-4" /> },
  { value: 'duty',     label: '臨時任務',    color: '#7c3aed', icon: <DocumentTextIcon className="w-4 h-4" /> },
  { value: 'other',    label: '其他',        color: '#94a3b8', icon: <EllipsisHorizontalCircleIcon className="w-4 h-4" /> },
]

const CATEGORY_MAP = Object.fromEntries(WORK_CATEGORIES.map((c) => [c.value, c]))

// ─── Grouped view types & helper ─────────────────────────────────────────────

interface TaskGroup {
  taskKey:             string
  taskNm:              string
  group1?:             string
  group2?:             string
  expectedStartDate?:  string
  expectedEndDate?:    string
  entries:             DailyLogEntry[]
  totalHours:          number
}

/** Second-level: project / duty sub-group inside a category */
interface ProjectSubGroup {
  projKey:    string
  projNm:     string   // project_nm, duty_nm, or '' for unnamed
  totalHours: number
  tasks:      TaskGroup[]
}

/** Top-level: one card per WorkCategory */
interface CategorySection {
  category:      WorkCategory
  label:         string
  color:         string
  totalHours:    number
  projectGroups: ProjectSubGroup[]
}

function groupDailyEntries(entries: DailyLogEntry[]): CategorySection[] {
  const result: CategorySection[] = []

  for (const catInfo of WORK_CATEGORIES) {
    const catEntries = entries.filter((e) => e.work_category === catInfo.value)
    if (catEntries.length === 0) continue

    let projectGroups: ProjectSubGroup[] = []

    if (catInfo.value === 'project' || catInfo.value === 'cr_ar') {
      // Group by project → function
      const projMap = new Map<string, { nm: string; taskMap: Map<string, DailyLogEntry[]> }>()
      for (const e of catEntries) {
        const projKey = e.project_id ?? '__no_proj__'
        const projNm  = e.project_nm ?? (catInfo.value === 'project' ? '未知專案' : '')
        if (!projMap.has(projKey)) projMap.set(projKey, { nm: projNm, taskMap: new Map() })
        const pg = projMap.get(projKey)!
        const taskKey = e.function_id ?? e.entry_id
        if (!pg.taskMap.has(taskKey)) pg.taskMap.set(taskKey, [])
        pg.taskMap.get(taskKey)!.push(e)
      }
      for (const [projKey, pg] of projMap) {
        const tasks: TaskGroup[] = []
        for (const [, taskEntries] of pg.taskMap) {
          tasks.push({
            taskKey:           taskEntries[0].function_id ?? taskEntries[0].entry_id,
            taskNm:            taskEntries[0].function_nm ?? '',
            group1:            taskEntries[0].group1,
            group2:            taskEntries[0].group2,
            expectedStartDate: taskEntries[0].expected_start_date,
            expectedEndDate:   taskEntries[0].expected_end_date,
            entries:           taskEntries,
            totalHours:        taskEntries.reduce((s, e) => s + e.hours, 0),
          })
        }
        // Two-phase sort: keep same-group tasks together, order groups by their
        // earliest start date (so backend always precedes testing even after re-work).
        // Phase 1: compute each (group1, group2) pair's earliest start date.
        const gKey = (t: TaskGroup) => `${t.group1 ?? ''}\x00${t.group2 ?? ''}`
        const groupEarliest = new Map<string, string>()
        for (const t of tasks) {
          const k = gKey(t)
          const cur = groupEarliest.get(k) ?? '9999-99-99'
          const ts  = t.expectedStartDate ?? '9999-99-99'
          if (ts < cur) groupEarliest.set(k, ts)
        }
        // Phase 2: sort by group's earliest start → task's own start → end date.
        tasks.sort((a, b) => {
          const ga = groupEarliest.get(gKey(a)) ?? '9999-99-99'
          const gb = groupEarliest.get(gKey(b)) ?? '9999-99-99'
          if (ga !== gb) return ga.localeCompare(gb)
          // Same group: sort by task's own start date
          const sa = a.expectedStartDate ?? '9999-99-99'
          const sb = b.expectedStartDate ?? '9999-99-99'
          if (sa !== sb) return sa.localeCompare(sb)
          // Same start: by end date
          const ea = a.expectedEndDate ?? '9999-99-99'
          const eb = b.expectedEndDate ?? '9999-99-99'
          return ea.localeCompare(eb)
        })
        projectGroups.push({
          projKey,
          projNm: pg.nm,
          totalHours: tasks.reduce((s, t) => s + t.totalHours, 0),
          tasks,
        })
      }
    } else if (catInfo.value === 'duty') {
      // Group by duty_id, all under one unnamed proj group
      const dutyMap = new Map<string, DailyLogEntry[]>()
      for (const e of catEntries) {
        const key = e.duty_id ?? e.entry_id
        if (!dutyMap.has(key)) dutyMap.set(key, [])
        dutyMap.get(key)!.push(e)
      }
      const tasks: TaskGroup[] = []
      for (const [, taskEntries] of dutyMap) {
        tasks.push({
          taskKey:    taskEntries[0].duty_id ?? taskEntries[0].entry_id,
          taskNm:     taskEntries[0].duty_nm ?? '',
          entries:    taskEntries,
          totalHours: taskEntries.reduce((s, e) => s + e.hours, 0),
        })
      }
      projectGroups = [{
        projKey: '__duty__', projNm: '',
        totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
        tasks,
      }]
    } else {
      // training / meeting / other — flat list, no sub-grouping
      projectGroups = [{
        projKey: catInfo.value, projNm: '',
        totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
        tasks: [{
          taskKey: catInfo.value, taskNm: '',
          entries: catEntries,
          totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
        }],
      }]
    }

    result.push({
      category:      catInfo.value,
      label:         catInfo.label,
      color:         catInfo.color,
      totalHours:    catEntries.reduce((s, e) => s + e.hours, 0),
      projectGroups,
    })
  }

  return result
}

// ─── Runtime types for API-loaded dropdown options ───────────────────────────
interface ProjectOpt  { id: string; name: string }
interface FunctionOpt {
  id: string; name: string
  group1?: string; group2?: string
  expected_start_date?: string; expected_end_date?: string
}
interface DutyOpt     { id: string; name: string }
const BU_OPTIONS = ['製造部', '品保部', '資訊部', '業務部', '人資部', '財務部', '研發部', '客服中心']

// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportDailyLogCSV(logs: DailyLog[], rangeLabel: string) {
  const bom = '\uFEFF'
  const headers = ['日期', '工作分類', '關聯專案', '關聯任務', 'BU/單位', '工作內容', '耗時(h)', '加班', '加班時數(h)']
  const rows = logs.flatMap((log) =>
    log.entries.map((e) => [
      log.log_date,
      CATEGORY_MAP[e.work_category]?.label ?? e.work_category,
      e.project_nm ?? '—',
      e.function_nm ?? e.duty_nm ?? '—',
      e.bu_unit ?? '—',
      e.description,
      String(e.hours),
      e.is_overtime ? '是' : '否',
      e.is_overtime ? String(e.overtime_hours ?? e.hours) : '0',
    ])
  )
  const csv = bom + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `工作日誌_${rangeLabel}.csv`; a.click()
  URL.revokeObjectURL(url)
}


// ─── Self Report View (週報/月報/季報/年報) ───────────────────────────────────
// Renders the engineer's own period report in the same format as the manager's
// MemberReportCard in StatisticsPage — grouped by date, each entry styled as a
// progress-update card with category, project, description, hours & status.

const SelfReportView: React.FC<{
  startDate: Dayjs
  endDate: Dayjs
  logs: Record<string, DailyLog>
  onPreviewFile: (url: string, name: string) => void
  authToken: string | null
}> = ({ startDate, endDate, logs, onPreviewFile, authToken }) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  // Collect logs in range (chronological)
  const rangeLogs: DailyLog[] = []
  let cur = startDate
  while (!cur.isAfter(endDate, 'day')) {
    const l = logs[cur.format('YYYY-MM-DD')]
    if (l) rangeLogs.push(l)
    cur = cur.add(1, 'day')
  }

  const allEntries = rangeLogs.flatMap((l) => l.entries.map((e) => ({ ...e, log_date: l.log_date, log_status: l.status })))
  const totalHours  = allEntries.reduce((s, e) => s + e.hours, 0)
  const totalOT     = allEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
  const totalNormal = totalHours - totalOT
  const workedDays  = rangeLogs.length

  const catTotals = WORK_CATEGORIES.map((cat) => ({
    ...cat,
    total: allEntries.filter((e) => e.work_category === cat.value).reduce((s, e) => s + e.hours, 0),
  })).filter((c) => c.total > 0)

  return (
    <div className="space-y-4">
      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '本期總工時', value: totalHours.toFixed(1),  unit: 'h',  color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
          { label: '正常工時',   value: totalNormal.toFixed(1), unit: 'h',  color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
          { label: '加班工時',   value: totalOT.toFixed(1),     unit: 'h',  color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
          { label: '已填報天數', value: workedDays,              unit: '天', color: '#64748b', bg: '#f8fafc', icon: <CalendarDaysIcon className="w-4 h-4 text-slate-500" /> },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="text-[10px] text-slate-400">{s.label}</div>
              <div className="font-bold text-lg leading-tight" style={{ color: s.color }}>
                {s.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{s.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Category breakdown ── */}
      {catTotals.length > 0 && (
        <Card bordered={false} className="shadow-sm" title={<span className="text-sm font-semibold text-slate-700">工作分類分佈</span>}>
          <div className="flex flex-col gap-2.5">
            {catTotals.map((c) => (
              <div key={c.value} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                  <div className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
                  <span className="text-xs text-slate-600">{c.label}</span>
                </div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ background: c.color, width: `${Math.round((c.total / totalHours) * 100)}%` }} />
                </div>
                <span className="text-xs font-semibold text-slate-500 w-10 text-right">{c.total}h</span>
                <span className="text-xs text-slate-300 w-8 text-right">{Math.round((c.total / totalHours) * 100)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Progress updates — same 3-level layout as day view ── */}
      {(() => {
        if (rangeLogs.length === 0) {
          return (
            <Card bordered={false} className="shadow-sm">
              <Empty description="此期間尚無日報記錄" className="py-6" />
            </Card>
          )
        }

        type RichEntry = DailyLogEntry & { log_date: string; log_status: DailyLog['status'] }
        type RichTaskGroup = { taskKey: string; taskNm: string; group1?: string; group2?: string; expectedStartDate?: string; expectedEndDate?: string; totalHours: number; entries: RichEntry[] }
        type RichProjGroup = { projKey: string; projNm: string; totalHours: number; tasks: RichTaskGroup[] }
        type RichCatSection = { catKey: WorkCategory; cat: typeof WORK_CATEGORIES[0]; totalHours: number; projGroups: RichProjGroup[] }

        // Build 3-level hierarchy mirroring groupDailyEntries
        const catMap = new Map<string, { cat: typeof WORK_CATEGORIES[0]; totalHours: number; projMap: Map<string, { projNm: string; totalHours: number; taskMap: Map<string, { taskKey: string; taskNm: string; group1?: string; group2?: string; expectedStartDate?: string; expectedEndDate?: string; totalHours: number; entries: RichEntry[] }> }> }>()

        for (const log of rangeLogs) {
          for (const e of log.entries) {
            const catKey = e.work_category
            const cat = CATEGORY_MAP[catKey] ?? WORK_CATEGORIES[0]
            if (!catMap.has(catKey)) catMap.set(catKey, { cat, totalHours: 0, projMap: new Map() })
            const cs = catMap.get(catKey)!
            cs.totalHours += e.hours

            let projKey: string, projNm: string, taskKey: string, taskNm: string
            if (catKey === 'project' || catKey === 'cr_ar') {
              projKey = e.project_id ?? '__no_proj__'; projNm = e.project_nm ?? ''
              taskKey = e.function_id ?? e.entry_id;   taskNm = e.function_nm ?? '（無關聯任務）'
            } else if (catKey === 'duty') {
              projKey = '__duty__'; projNm = ''
              taskKey = e.duty_id ?? e.entry_id; taskNm = e.duty_nm ?? ''
            } else {
              projKey = '__flat__'; projNm = ''
              taskKey = '__flat__'; taskNm = ''
            }

            if (!cs.projMap.has(projKey)) cs.projMap.set(projKey, { projNm, totalHours: 0, taskMap: new Map() })
            const pg = cs.projMap.get(projKey)!
            pg.totalHours += e.hours

            if (!pg.taskMap.has(taskKey)) pg.taskMap.set(taskKey, { taskKey, taskNm, group1: e.group1, group2: e.group2, expectedStartDate: e.expected_start_date, expectedEndDate: e.expected_end_date, totalHours: 0, entries: [] })
            const tg = pg.taskMap.get(taskKey)!
            tg.totalHours += e.hours
            tg.entries.push({ ...e, log_date: log.log_date, log_status: log.status })
          }
        }

        // Sort and build final structure
        const sections: RichCatSection[] = WORK_CATEGORIES
          .filter((c) => catMap.has(c.value))
          .map((c) => {
            const cs = catMap.get(c.value)!
            const projGroups: RichProjGroup[] = [...cs.projMap.entries()]
              .sort(([, a], [, b]) => a.projNm.localeCompare(b.projNm))
              .map(([projKey, pg]) => {
                const tasks: RichTaskGroup[] = [...pg.taskMap.values()]
                // Two-phase task sort (same as day view)
                const gKey = (t: RichTaskGroup) => `${t.group1 ?? ''}\x00${t.group2 ?? ''}`
                const groupEarliest = new Map<string, string>()
                for (const t of tasks) { const k = gKey(t); const cur = groupEarliest.get(k) ?? '9999-99-99'; const ts = t.expectedStartDate ?? '9999-99-99'; if (ts < cur) groupEarliest.set(k, ts) }
                tasks.sort((a, b) => { const ga = groupEarliest.get(gKey(a)) ?? '9999-99-99'; const gb = groupEarliest.get(gKey(b)) ?? '9999-99-99'; if (ga !== gb) return ga.localeCompare(gb); const sa = a.expectedStartDate ?? '9999-99-99'; const sb = b.expectedStartDate ?? '9999-99-99'; if (sa !== sb) return sa.localeCompare(sb); return (a.expectedEndDate ?? '9999-99-99').localeCompare(b.expectedEndDate ?? '9999-99-99') })
                // Sort entries chronologically within each task
                for (const t of tasks) t.entries.sort((a, b) => (a.log_date ?? '').localeCompare(b.log_date ?? ''))
                return { projKey, projNm: pg.projNm, totalHours: pg.totalHours, tasks }
              })
            return { catKey: c.value as WorkCategory, cat: cs.cat, totalHours: cs.totalHours, projGroups }
          })

        const DOW = ['日', '一', '二', '三', '四', '五', '六']
        const totalTasks = sections.reduce((s, cs) => s + cs.projGroups.reduce((ps, pg) => ps + pg.tasks.filter(t => t.taskKey !== '__flat__').length, 0), 0)

        return (
          <div className="space-y-3">
            {/* Section title */}
            <div className="flex items-center gap-2 px-1">
              <DocumentTextIcon className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">進度更新</span>
              <span className="text-xs text-slate-400 font-normal">{allEntries.length} 條記錄 · {totalTasks} 個任務</span>
            </div>

            {sections.map((section) => {
              const collapsed = collapsedGroups.has(section.catKey)
              const taskCount = section.projGroups.reduce((s, pg) => s + pg.tasks.filter(t => t.taskKey !== '__flat__').length, 0)
              return (
                <div key={section.catKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  {/* ── Category header ── */}
                  <button onClick={() => toggleGroup(section.catKey)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left border-0 outline-none cursor-pointer"
                    style={{ background: section.cat.color + '12', borderBottom: collapsed ? 'none' : `2px solid ${section.cat.color}30` }}>
                    <Tag style={{ fontSize: 10, padding: '0 7px', margin: 0, lineHeight: '22px', background: section.cat.color + '22', color: section.cat.color, border: `1px solid ${section.cat.color}55`, fontWeight: 700 }}>
                      {section.cat.label}
                    </Tag>
                    {taskCount > 0 && <span className="text-xs text-slate-400">{taskCount} 個任務</span>}
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums" style={{ color: section.cat.color }}>
                        <ClockIcon className="w-3.5 h-3.5 inline mr-0.5" />{fmtH(section.totalHours)}h
                      </span>
                      <ChevronDownIcon className="w-3.5 h-3.5 transition-transform duration-150" style={{ color: section.cat.color, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                    </div>
                  </button>

                  {!collapsed && (
                    <div>
                      {section.projGroups.map((pg) => {
                        const showProjRow = pg.projNm !== ''
                        const projCollapseKey = `${section.catKey}::proj::${pg.projKey}`
                        const projCollapsed = collapsedGroups.has(projCollapseKey)
                        return (
                          <div key={pg.projKey}>
                            {/* ── Project row ── */}
                            {showProjRow && (
                              <button onClick={() => toggleGroup(projCollapseKey)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 border-0 border-b border-slate-100 outline-none text-left cursor-pointer hover:bg-slate-50 transition-colors"
                                style={{ background: 'transparent' }}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: section.cat.color }} />
                                <span className="text-sm font-semibold text-slate-700">{pg.projNm}</span>
                                <span className="text-xs text-slate-400">{pg.tasks.length} 個任務</span>
                                <div className="ml-auto flex items-center gap-1.5">
                                  <span className="text-xs font-semibold tabular-nums" style={{ color: section.cat.color }}>{fmtH(pg.totalHours)}h</span>
                                  <ChevronDownIcon className="w-3.5 h-3.5 transition-transform duration-150" style={{ color: section.cat.color, transform: projCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                </div>
                              </button>
                            )}
                            {/* ── Tasks ── */}
                            {(!showProjRow || !projCollapsed) && (
                            <div className={showProjRow ? 'pl-3' : ''}>
                              {pg.tasks.map((task) => {
                                const showTaskRow = task.taskNm !== ''
                                const taskCollapseKey = `${section.catKey}::proj::${pg.projKey}::task::${task.taskKey}`
                                const taskCollapsed = collapsedGroups.has(taskCollapseKey)
                                return (
                                  <div key={task.taskKey} className="border-b border-slate-100 last:border-0">
                                    {/* Task header */}
                                    {showTaskRow && (
                                      <button onClick={() => toggleGroup(taskCollapseKey)}
                                        className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none bg-slate-50/60 hover:bg-slate-100/70 transition-colors text-left cursor-pointer">
                                        <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: section.cat.color }} />
                                        {task.group1 && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-medium">{task.group1}</span>}
                                        {task.group2 && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 font-medium">{task.group2}</span>}
                                        <span className="text-xs font-semibold text-slate-700">{task.taskNm}</span>
                                        {(section.catKey === 'project' || section.catKey === 'duty') && (() => {
                                          const entries = task.entries
                                          const latestProgress =
                                            [...entries].reverse().find((e) => e.progress != null && e.source === 'updated')?.progress
                                            ?? [...entries].reverse().find((e) => e.progress != null && e.source === 'manual')?.progress
                                            ?? [...entries].find((e) => e.source === 'progress' && e.progress != null)?.progress
                                          return latestProgress != null
                                            ? <Tag color="blue" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0 }}>{latestProgress}%</Tag>
                                            : null
                                        })()}
                                        {(task.expectedStartDate || task.expectedEndDate) && (
                                          <span className="text-[10px] text-slate-400 tabular-nums">{task.expectedStartDate ?? '—'} ~ {task.expectedEndDate ?? '—'}</span>
                                        )}
                                        <div className="ml-auto flex items-center gap-1.5">
                                          <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{fmtH(task.totalHours)}h</span>
                                          <ChevronDownIcon className="w-3 h-3 transition-transform duration-150 text-slate-400" style={{ transform: taskCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                        </div>
                                      </button>
                                    )}
                                    {/* Entries */}
                                    {(!showTaskRow || !taskCollapsed) && <div>
                                      {task.entries.map((entry, eIdx) => {
                                        const d = dayjs(entry.log_date)
                                        return (
                                          <div key={`${entry.log_date ?? ''}-${entry.entry_id}`}>
                                            {eIdx > 0 && <div style={{ height: '1px', background: '#e2e8f0', margin: '0 16px' }} />}
                                            <div className="flex items-center gap-3 px-4 py-2.5">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <p className="text-sm text-slate-700 leading-relaxed">{entry.description || <span className="text-slate-300 italic">（無說明）</span>}</p>
                                                  {entry.source === 'updated' && (
                                                    <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>日誌更新</Tag>
                                                  )}
                                                  {entry.source === 'manual' && (
                                                    <Tag color="green" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>日誌新增</Tag>
                                                  )}
                                                </div>
                                                {entry.files && entry.files.length > 0 && (
                                                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {entry.files.map((f, fi) => {
                                                      const previewUrl = authToken ? `${f.url}?token=${authToken}` : f.url
                                                      return (
                                                        <button key={fi} onClick={() => onPreviewFile(previewUrl, f.name)}
                                                          className="inline-flex items-center gap-1 text-[11px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-2 py-0.5 hover:bg-blue-100 transition-colors max-w-[180px] cursor-pointer">
                                                          <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                                          <span className="truncate">{f.name}</span>
                                                        </button>
                                                      )
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                              <div className="flex-shrink-0 text-right">
                                                <div className="flex items-center gap-0.5 text-xs font-semibold justify-end" style={{ color: entry.is_overtime ? '#d97706' : '#2563eb' }}>
                                                  <ClockIcon className="w-3.5 h-3.5" />{fmtH(entry.hours)}h
                                                  {entry.is_overtime && <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>加班</Tag>}
                                                </div>
                                                <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">{d.format('MM/DD')} 週{DOW[d.day()]}</div>
                                                <Tag
                                                  color={entry.log_status === 'confirmed' ? 'success' : entry.log_status === 'submitted' ? 'processing' : 'default'}
                                                  style={{ fontSize: 9, padding: '0 4px', margin: '2px 0 0', lineHeight: '14px' }}>
                                                  {entry.log_status === 'confirmed' ? '已確認' : entry.log_status === 'submitted' ? '已提交' : '草稿'}
                                                </Tag>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>}
                                  </div>
                                )
                              })}
                            </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month' | 'quarter' | 'year'

// ─── Helpers: map frontend entries ↔ backend payload ────────────────────────

// entriesToPayload delegates to the shared adapter in daily_log.api.ts
const entriesToPayload = entriesToBackend
// Format hours: show up to 2 decimal places, stripping trailing zeros (e.g. 1.50 → "1.5", 1.00 → "1")
const fmtH = (h: number) => parseFloat(h.toFixed(2))

// Re-export SelfReportView so it can be used from the progress report tab
export { SelfReportView, WORK_CATEGORIES, CATEGORY_MAP, fmtH }

// ─── Main Page ──────────────────────────────────────────────────────────────

const DailyLogPage: React.FC = () => {
  const workNo   = useAppSelector((s) => s.auth.workNo)
  const userName = useAppSelector((s) => s.auth.name)
  const toName   = useWorkNoToName()
  // Mock: role-based daily log requirement
  // In production this comes from user profile / API
  const isManager = false  // TODO: derive from user role API
  const [dailyLogOptOut, setDailyLogOptOut] = useState(false) // manager opt-out setting

  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DailyLogEntry | null>(null)
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)
  const [logs, setLogs] = useState<Record<string, DailyLog>>({})
  // Suggest entries are kept separate and NEVER saved to DB.
  // They are refreshed from /suggest on every day-view load.
  const [suggestMap, setSuggestMap] = useState<Record<string, DailyLogEntry[]>>({})
  // Explicit task-progress overrides: updated whenever user saves a progress value.
  // Key = task_id (function_id or duty_id), Value = latest user-entered progress %.
  const [taskProgressState, setTaskProgressState] = useState<Record<string, number>>({})
  const [logsLoading, setLogsLoading] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<WorkCategory>>(new Set())
  const toggleSection = (cat: WorkCategory) =>
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  const [collapsedDayGroups, setCollapsedDayGroups] = useState<Set<string>>(new Set())
  const toggleDayGroup = (key: string) =>
    setCollapsedDayGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const [form] = Form.useForm()
  const watchedCategory   = Form.useWatch('work_category', form) as WorkCategory | undefined
  const watchedFunctionId = Form.useWatch('function_id',   form) as string | undefined
  const watchedDutyId     = Form.useWatch('duty_id',       form) as string | undefined
  const watchedProgress   = Form.useWatch('progress',      form) as number | null | undefined
  const watchedIsOvertime = Form.useWatch('is_overtime',   form) as boolean | undefined
  const watchedHours      = Form.useWatch('hours',         form) as number | undefined
  const [syncProgress, setSyncProgress] = useState(true)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  // Files already saved on the entry (non-progress source) — user can delete individual ones
  const [existingFiles, setExistingFiles] = useState<{ name: string; url: string; size?: number }[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Dropdown options loaded from real API
  const [projectOpts, setProjectOpts] = useState<ProjectOpt[]>([])
  const [functionsMap, setFunctionsMap] = useState<Record<string, FunctionOpt[]>>({})
  const [dutyOpts, setDutyOpts] = useState<DutyOpt[]>([])

  // Load project list once on mount
  useEffect(() => {
    projectApi.list({ page: 1, size: 200, status: 5 })  // status=5 → 執行中
      .then((res) => {
        const list = (res.content as { project_list?: { id: string; project_nm: string }[] })?.project_list ?? []
        setProjectOpts(list.map((p) => ({ id: p.id, name: p.project_nm })))
      })
      .catch(() => {})
  }, [])

  // Load duty list once on mount
  useEffect(() => {
    dutyApi.list({ page: 1, size: 200, status: 2 })  // status=2 → 進行中
      .then((res) => {
        const list = (res.content as { data_list?: { id: string; duty_nm: string }[] })?.data_list ?? []
        setDutyOpts(list.map((d) => ({ id: d.id, name: d.duty_nm })))
      })
      .catch(() => {})
  }, [])

  // Load functions when a project is selected
  useEffect(() => {
    if (!selectedProject) return
    if (functionsMap[selectedProject]) return  // already cached
    projectApi.functionList(selectedProject, { page: 1, size: 200 })
      .then((res) => {
        type RawFunc = { id: string; function_nm: string; group1?: string; group2?: string; expected_start_date?: string; expected_end_date?: string }
        const list = (res.content as { data_list?: RawFunc[] })?.data_list ?? []
        setFunctionsMap((prev) => ({
          ...prev,
          [selectedProject]: list.map((f) => ({
            id: f.id, name: f.function_nm,
            group1: f.group1, group2: f.group2,
            expected_start_date: f.expected_start_date,
            expected_end_date: f.expected_end_date,
          })),
        }))
      })
      .catch(() => {})
  }, [selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  const dateStr = currentDate.format('YYYY-MM-DD')
  const currentLog = logs[dateStr]

  // ── Fetch logs for the visible date range ───────────────────────────────────
  useEffect(() => {
    const { start, end } = viewMode === 'day'
      ? { start: currentDate, end: currentDate }
      : getPeriodRange(currentDate, viewMode)
    const startStr = start.format('YYYY-MM-DD')
    const endStr   = end.format('YYYY-MM-DD')

    setLogsLoading(true)
    dailyLogApi.list({ page: 1, size: 100, start_date: startStr, end_date: endStr })
      .then(async (res) => {
        const summaries = res.content?.list ?? []
        const incoming: Record<string, DailyLog> = {}

        // For each summary, fetch detail to get task_items/free_items → entries
        await Promise.all(
          summaries.map(async (s) => {
            try {
              const detailRes = await dailyLogApi.detail(s.log_id)
              incoming[s.log_date] = backendDetailToLog(detailRes.content)
            } catch {
              // If detail fails, store a stub so the date shows as existing
              incoming[s.log_date] = {
                log_id: s.log_id, work_no: s.work_no, log_date: s.log_date,
                entries: [], total_hours: Number(s.total_hours), overtime_hours: 0,
                status: s.status === 2 ? 'submitted' : 'draft',
              }
            }
          }),
        )

        setLogs((prev) => ({ ...prev, ...incoming }))

        // In day view: always fetch fresh suggest entries into separate state.
        // Suggest entries are NEVER written to the DB — only manually added/edited
        // entries are persisted. This ensures the latest task progress always shows.
        if (viewMode === 'day') {
          dailyLogApi.suggest(startStr)
            .then((suggestRes) => {
              const items = suggestRes.content ?? []
              const freshEntries: DailyLogEntry[] = items.map((item, i) => ({
                entry_id:      `suggest-${startStr}-${i}`,
                work_category: (item.task_type === 'duty' ? 'duty' : 'project') as DailyLogEntry['work_category'],
                project_id:    item.task_type === 'project' ? (item.project_id || undefined) : undefined,
                function_id:   item.task_type === 'project' ? item.task_id : undefined,
                function_nm:   item.task_type === 'project' ? item.task_nm : undefined,
                duty_id:       item.task_type === 'duty' ? item.task_id : undefined,
                duty_nm:       item.task_type === 'duty' ? item.task_nm : undefined,
                project_nm:    item.project_nm ?? undefined,
                group1:               item.group1 || undefined,
                group2:               item.group2 || undefined,
                expected_start_date:  item.expected_start_date || undefined,
                expected_end_date:    item.expected_end_date || undefined,
                description:          item.description,
                hours:         item.work_hours || 0,
                progress:      item.progress,
                is_overtime:   false,
                overtime_hours: 0,
                source:           'progress' as const,
                files:            item.files?.length ? item.files : undefined,
                suggest_id:       item.suggest_id,
                record_time:      item.record_time ?? undefined,
                suggest_submitter: (item.submitter && item.submitter !== workNo) ? item.submitter : undefined,
              }))
              setSuggestMap((prev) => ({ ...prev, [startStr]: freshEntries }))
            })
            .catch(() => {})
        }
      })
      .catch(() => { /* silently ignore — user sees empty state */ })
      .finally(() => setLogsLoading(false))
  }, [currentDate, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dismissed suggest IDs (persisted in localStorage) ──────────────────────
  // When a user explicitly deletes an entry that originated from a suggest record,
  // we store its suggest_id so it won't resurface after a page refresh.
  const dismissedKey = (date: string) => `daily_log_dismissed_${date}`
  const getDismissedIds = (date: string): Set<string> => {
    try {
      const raw = localStorage.getItem(dismissedKey(date))
      return new Set(raw ? JSON.parse(raw) : [])
    } catch { return new Set() }
  }
  const addDismissedId = (date: string, suggestId: string) => {
    const ids = getDismissedIds(date)
    ids.add(suggestId)
    localStorage.setItem(dismissedKey(date), JSON.stringify([...ids]))
  }
  const clearDismissedIds = (date: string) => {
    localStorage.removeItem(dismissedKey(date))
  }
  const removeDismissedId = (date: string, suggestId: string) => {
    const ids = getDismissedIds(date)
    ids.delete(suggestId)
    if (ids.size === 0) localStorage.removeItem(dismissedKey(date))
    else localStorage.setItem(dismissedKey(date), JSON.stringify([...ids]))
  }

  // Display = manual entries (from DB) + suggest entries (from API, fresh each load).
  // Suggest entries are excluded when: already promoted to manual, or explicitly deleted.
  const suggestEntries = suggestMap[dateStr] ?? []
  const [dismissedVersion, setDismissedVersion] = useState(0)
  // Dismissed suggest entries (hidden) for the current date — used for the restore popover
  const dismissedSuggestEntries = useMemo(() => {
    const dismissedIds = getDismissedIds(dateStr)
    if (dismissedIds.size === 0) return []
    const promotedSuggestIds = new Set(
      (currentLog?.entries ?? []).map((e) => e.suggest_id).filter(Boolean) as string[],
    )
    // Entries that are dismissed AND not yet promoted to a manual entry
    return suggestEntries.filter(
      (e) => e.suggest_id && dismissedIds.has(e.suggest_id) && !promotedSuggestIds.has(e.suggest_id),
    )
  }, [currentLog, suggestEntries, dateStr, dismissedVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const dismissedSuggestCount = dismissedSuggestEntries.length
  const displayEntries = useMemo(() => {
    const logStatus = currentLog?.status
    // Only show suggest entries for draft logs; submitted/confirmed logs show DB entries only
    if (logStatus === 'submitted' || logStatus === 'confirmed') {
      return currentLog?.entries ?? []
    }
    const promotedSuggestIds = new Set(
      (currentLog?.entries ?? []).map((e) => e.suggest_id).filter(Boolean) as string[],
    )
    const dismissedIds = getDismissedIds(dateStr)
    const dedupedSuggest = suggestEntries.filter(
      (e) => !e.suggest_id || (!promotedSuggestIds.has(e.suggest_id) && !dismissedIds.has(e.suggest_id))
    )
    return [...(currentLog?.entries ?? []), ...dedupedSuggest]
  }, [currentLog, suggestEntries, dateStr, dismissedVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalHours = displayEntries.reduce((s, e) => s + e.hours, 0)
  const overtimeHours = displayEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)

  const sufficiencyPct = Math.round((totalHours / STANDARD_DAILY_HOURS) * 100)
  const isReadOnly = currentLog?.status === 'submitted' || currentLog?.status === 'confirmed'

  // Navigation
  const navigate = (delta: number) => {
    if (viewMode === 'day') setCurrentDate((d) => d.add(delta, 'day'))
    else if (viewMode === 'week') setCurrentDate((d) => d.add(delta * 7, 'day'))
    else if (viewMode === 'quarter') setCurrentDate((d) => d.add(delta * 3, 'month'))
    else if (viewMode === 'year') setCurrentDate((d) => d.add(delta, 'year'))
    else setCurrentDate((d) => d.add(delta, 'month'))
  }

  // Period range helpers
  const getPeriodRange = useCallback((date: Dayjs, mode: ViewMode): { start: Dayjs; end: Dayjs } => {
    if (mode === 'week') {
      const start = date.startOf('isoWeek')
      return { start, end: start.add(6, 'day') }
    }
    if (mode === 'month') return { start: date.startOf('month'), end: date.endOf('month') }
    if (mode === 'quarter') {
      const q = Math.floor(date.month() / 3)
      const start = date.month(q * 3).startOf('month')
      return { start, end: start.add(2, 'month').endOf('month') }
    }
    if (mode === 'year') return { start: date.startOf('year'), end: date.endOf('year') }
    return { start: date, end: date }
  }, [])

  const goToday = () => setCurrentDate(dayjs())

  // Date label
  const dateLabel = useMemo(() => {
    if (viewMode === 'day') return currentDate.format('YYYY 年 MM 月 DD 日 dddd')
    if (viewMode === 'week') {
      const ws = currentDate.startOf('isoWeek')
      return `${ws.format('MM/DD')} — ${ws.add(6, 'day').format('MM/DD')} (${ws.format('YYYY')} W${currentDate.isoWeek()})`
    }
    if (viewMode === 'month') return currentDate.format('YYYY 年 MM 月')
    if (viewMode === 'quarter') {
      const q = Math.ceil((currentDate.month() + 1) / 3)
      return `${currentDate.format('YYYY')} 年 第 ${q} 季度`
    }
    return currentDate.format('YYYY 年')
  }, [currentDate, viewMode])

  // Open add/edit modal
  const openEntryModal = (entry?: DailyLogEntry) => {
    if (entry) {
      setEditingEntry(entry)
      const projId = entry.project_id ?? null
      setSelectedProject(projId)
      // Eagerly load function list if not yet cached (needed for suggest entries)
      if (projId && !functionsMap[projId]) {
        projectApi.functionList(projId, { page: 1, size: 200 })
          .then((res) => {
            type RawFunc = { id: string; function_nm: string; group1?: string; group2?: string; expected_start_date?: string; expected_end_date?: string }
            const list = (res.content as { data_list?: RawFunc[] })?.data_list ?? []
            setFunctionsMap((prev) => ({
              ...prev,
              [projId]: list.map((f) => ({
                id: f.id, name: f.function_nm,
                group1: f.group1, group2: f.group2,
                expected_start_date: f.expected_start_date,
                expected_end_date: f.expected_end_date,
              })),
            }))
          })
          .catch(() => {})
      }
      // Ensure the duty option is present even if it wasn't in the initial list
      // (e.g. duty with a non-active status, or duty from a suggest entry)
      if (entry.duty_id && entry.duty_nm) {
        setDutyOpts((prev) =>
          prev.some((d) => d.id === entry.duty_id)
            ? prev
            : [...prev, { id: entry.duty_id!, name: entry.duty_nm! }]
        )
      }
      form.setFieldsValue({
        work_category: entry.work_category,
        project_id: entry.project_id,
        function_id: entry.function_id,
        duty_id: entry.duty_id,
        bu_unit: entry.bu_unit,
        description: entry.description,
        hours: entry.hours,
        is_overtime: entry.is_overtime,
        overtime_hours: entry.is_overtime ? (entry.overtime_hours ?? entry.hours) : entry.hours,
        progress: entry.progress,
      })
    } else {
      setEditingEntry(null)
      setSelectedProject(null)
      form.resetFields()
    }
    setFileList([])
    setSyncProgress(true)
    // For non-progress entries, load existing files into editable state
    const entryFiles = (entry?.files ?? [])
    setExistingFiles(entry?.source !== 'progress' ? entryFiles : [])
    setModalOpen(true)
  }

  // Save entry
  const handleSaveEntry = async (values: Record<string, unknown>) => {
    const cat = values.work_category as WorkCategory
    const projId = values.project_id as string | undefined
    const funcId = values.function_id as string | undefined
    const dutyId = values.duty_id as string | undefined

    const selectedFunc = functionsMap[projId ?? '']?.find((f) => f.id === funcId)
    const isSuggestEdit = editingEntry?.entry_id.startsWith('suggest-') ?? false

    setSaving(true)
    try {

    // If the user edited a suggest entry, remove it from suggestMap
    if (isSuggestEdit && editingEntry) {
      setSuggestMap((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] ?? []).filter((e) => e.entry_id !== editingEntry.entry_id),
      }))
    }

    const prevLog = logs[dateStr] ?? {
      log_id: `log-${dateStr}`, work_no: workNo, log_date: dateStr,
      entries: [], total_hours: 0, overtime_hours: 0, status: 'draft' as const,
    }
    const hasRealId = !!(prevLog.log_id && !prevLog.log_id.startsWith('log-'))

    // Step 1 — get (or create) the log_id so we can upload files against it
    let logId = hasRealId ? prevLog.log_id! : ''
    if (!hasRealId) {
      // Need to create the log first (without new files) to obtain a log_id
      const placeholderEntry: DailyLogEntry = {
        entry_id: editingEntry
          ? (isSuggestEdit ? `e-${Date.now()}` : editingEntry.entry_id)
          : `e-${Date.now()}`,
        work_category: cat,
        project_id: projId,
        project_nm: projectOpts.find((p) => p.id === projId)?.name,
        function_id: funcId, function_nm: selectedFunc?.name,
        group1: selectedFunc?.group1 ?? editingEntry?.group1,
        group2: selectedFunc?.group2 ?? editingEntry?.group2,
        duty_id: dutyId, duty_nm: dutyOpts.find((d) => d.id === dutyId)?.name ?? editingEntry?.duty_nm,
        bu_unit: values.bu_unit as string | undefined,
        description: values.description as string,
        hours: values.hours as number,
        is_overtime: (values.is_overtime as boolean) ?? false,
        overtime_hours: (values.is_overtime as boolean) ? ((values.overtime_hours as number) ?? (values.hours as number)) : 0,
        source: (!editingEntry || editingEntry.source === 'manual') ? 'manual' : 'updated',
        suggest_id: editingEntry?.suggest_id,
        progress: values.progress as number | undefined,
        expected_start_date: selectedFunc?.expected_start_date ?? editingEntry?.expected_start_date,
        expected_end_date: selectedFunc?.expected_end_date ?? editingEntry?.expected_end_date,
        files: editingEntry?.source === 'progress'
          ? (editingEntry.files?.length ? editingEntry.files : undefined)
          : (existingFiles.length ? existingFiles : undefined),
        record_time: editingEntry?.record_time ?? dayjs().format('HH:mm'),
      }
      const tmpEntries = [...prevLog.entries, placeholderEntry]
      try {
        const res = await dailyLogApi.create(entriesToPayload(tmpEntries, dateStr))
        logId = res.content?.log_id ?? ''
        if (logId) {
          setLogs((p) => ({ ...p, [dateStr]: { ...p[dateStr], log_id: logId } }))
        }
      } catch { /* continue without log_id */ }
    }

    // Step 2 — upload new files to server and get real URLs
    const newFileObjs = fileList.filter((f) => f.originFileObj).map((f) => f.originFileObj!)
    let uploadedFiles: { name: string; url: string; size?: number }[] = []
    if (newFileObjs.length > 0 && logId) {
      try {
        const res = await dailyLogApi.uploadAttachments(logId, newFileObjs)
        uploadedFiles = (res.content ?? []).map((u) => ({ name: u.file_name, url: u.url, size: u.file_size }))
      } catch { /* if upload fails, skip attachments */ }
    }

    // Step 3 — build final entry with server URLs
    // For progress entries keep original files; for manual/updated entries use the editable existingFiles list
    const baseFiles = editingEntry?.source === 'progress' ? (editingEntry?.files ?? []) : existingFiles
    const mergedFiles = [...baseFiles, ...uploadedFiles]
    const newEntry: DailyLogEntry = {
      entry_id: editingEntry
        ? (isSuggestEdit ? `e-${Date.now()}` : editingEntry.entry_id)
        : `e-${Date.now()}`,
      work_category: cat,
      project_id: projId,
      project_nm: projectOpts.find((p) => p.id === projId)?.name,
      function_id: funcId, function_nm: selectedFunc?.name,
      group1: selectedFunc?.group1 ?? editingEntry?.group1,
      group2: selectedFunc?.group2 ?? editingEntry?.group2,
      duty_id: dutyId, duty_nm: dutyOpts.find((d) => d.id === dutyId)?.name ?? editingEntry?.duty_nm,
      bu_unit: values.bu_unit as string | undefined,
      description: values.description as string,
      hours: values.hours as number,
      is_overtime: (values.is_overtime as boolean) ?? false,
      overtime_hours: (values.is_overtime as boolean) ? ((values.overtime_hours as number) ?? (values.hours as number)) : 0,
      source: (!editingEntry || editingEntry.source === 'manual') ? 'manual' : 'updated',
      suggest_id: editingEntry?.suggest_id,
      progress: values.progress as number | undefined,
      expected_start_date: selectedFunc?.expected_start_date ?? editingEntry?.expected_start_date,
      expected_end_date: selectedFunc?.expected_end_date ?? editingEntry?.expected_end_date,
      files: mergedFiles.length > 0 ? mergedFiles : undefined,
      record_time: editingEntry?.record_time ?? dayjs().format('HH:mm'),
    }

    // Step 4 — update local state and persist to backend
    const currentLog = logs[dateStr] ?? prevLog
    const newEntries = editingEntry && !isSuggestEdit
      ? currentLog.entries.map((e) => e.entry_id === editingEntry.entry_id ? newEntry : e)
      : [...currentLog.entries.filter((e) => e.entry_id !== newEntry.entry_id), newEntry]
    const newTotal = newEntries.reduce((s, e) => s + e.hours, 0)
    const newOt = newEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
    setLogs((prev) => ({
      ...prev,
      [dateStr]: { ...currentLog, log_id: logId || currentLog.log_id, entries: newEntries, total_hours: newTotal, overtime_hours: newOt },
    }))

    // Immediately update taskProgressState so the % tag reflects the new value without
    // relying on entry-level priority scanning (which can be confused by null values).
    // Key by "date-taskId" to prevent cross-date contamination when navigating.
    const savedTaskId = funcId ?? dutyId
    if (savedTaskId != null) {
      const savedProgress = newEntry.progress
      if (typeof savedProgress === 'number') {
        setTaskProgressState((prev) => ({ ...prev, [`${dateStr}-${savedTaskId}`]: savedProgress }))
      }
    }

    if (logId) {
      const backendPayload = entriesToPayload(newEntries, dateStr)
      try {
        await dailyLogApi.update(logId, {
          task_items: backendPayload.task_items,
          free_items: backendPayload.free_items,
        })
      } catch { /* best-effort */ }
    }

    // 同步任務進度：僅當用戶勾選且進度值確實改變時才調用
    if (syncProgress && typeof newEntry.progress === 'number') {
      const syncTaskId = funcId ?? dutyId
      const syncTaskType = funcId ? 'project' : 'duty'
      if (syncTaskId) {
        try {
          await dailyLogApi.syncTaskProgress(syncTaskType, syncTaskId, newEntry.progress)
        } catch { /* best-effort, 同步失敗不影響日誌保存 */ }
      }
    }

    } finally {
      setSaving(false)
      setModalOpen(false)
      form.resetFields()
    }
  }

  // Delete entry
  const handleDeleteEntry = (entryId: string) => {
    if (entryId.startsWith('suggest-')) {
      // Suggest-only entry — persist dismissal; keep in suggestMap so the restore popover can list it
      const target = (suggestMap[dateStr] ?? []).find((e) => e.entry_id === entryId)
      if (target?.suggest_id) { addDismissedId(dateStr, target.suggest_id); setDismissedVersion((v) => v + 1) }
      return
    }
    const log = logs[dateStr]
    if (!log) return
    const target = log.entries.find((e) => e.entry_id === entryId)
    // If the entry originated from a suggest record, mark it dismissed so it
    // won't resurface from the suggest API after a page refresh.
    if (target?.suggest_id) { addDismissedId(dateStr, target.suggest_id); setDismissedVersion((v) => v + 1) }
    const entries = log.entries.filter((e) => e.entry_id !== entryId)
    const total = entries.reduce((s, e) => s + e.hours, 0)
    const ot = entries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
    setLogs((prev) => ({ ...prev, [dateStr]: { ...log, entries, total_hours: total, overtime_hours: ot } }))
    if (log.log_id && !log.log_id.startsWith('log-')) {
      const backendPayload = entriesToPayload(entries, dateStr)
      dailyLogApi.update(log.log_id, {
        task_items: backendPayload.task_items,
        free_items: backendPayload.free_items,
      }).catch(() => {})
    }
  }

  // Submit — merge manual + suggest entries, save all to DB, mark submitted
  const handleSubmit = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logId = (currentLog as any)?.log_id as string | undefined
    const payload = entriesToPayload(displayEntries, dateStr)
    if (logId && !logId.startsWith('log-')) {
      dailyLogApi.update(logId, {
        task_items: payload.task_items,
        free_items: payload.free_items,
        status: 2,
      }).catch(() => {})
    } else {
      dailyLogApi.create(payload)
        .then((res) => {
          if (res.content?.log_id) {
            const newLogId = res.content.log_id
            setLogs((p) => ({ ...p, [dateStr]: { ...p[dateStr], log_id: newLogId } }))
            dailyLogApi.update(newLogId, { status: 2 }).catch(() => {})
          }
        })
        .catch(() => {})
    }
    // Clear suggest entries and dismissed list for this date (log is now submitted)
    setSuggestMap((prev) => ({ ...prev, [dateStr]: [] }))
    clearDismissedIds(dateStr)
    setDismissedVersion((v) => v + 1)
    setLogs((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] ?? {}),
        entries: displayEntries,
        total_hours: totalHours,
        status: 'submitted',
        submitted_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      },
    }))
  }

  // Export CSV
  const handleExport = () => {
    const allLogs = Object.values(logs).sort((a, b) => (a.log_date ?? '').localeCompare(b.log_date ?? ''))
    exportDailyLogCSV(allLogs, dateLabel.replace(/\s/g, '_'))
  }

  // Export daily report DOCX (day view only)
  const [exportingDocx, setExportingDocx] = useState(false)
  const handleExportDailyDocx = async () => {
    if (!currentLog || !workNo) return
    setExportingDocx(true)
    try {
      await exportDailyReport({
        date: dateStr,
        workNo,
        userName: userName ?? workNo,
        entries: displayEntries,
      })
    } finally {
      setExportingDocx(false)
    }
  }

  // Export range report DOCX
  const [rangeExportOpen,    setRangeExportOpen]    = useState(false)
  const [rangeExportDates,   setRangeExportDates]   = useState<[Dayjs, Dayjs] | null>(null)
  const [rangeExportLoading, setRangeExportLoading] = useState(false)

  const doExportRange = async (start: Dayjs, end: Dayjs) => {
    if (!workNo) return
    const startStr = start.format('YYYY-MM-DD')
    const endStr   = end.format('YYYY-MM-DD')
    const todayStr = dayjs().format('YYYY-MM-DD')

    setRangeExportLoading(true)
    try {
      const res = await dailyLogApi.list({ page: 1, size: 366, start_date: startStr, end_date: endStr })
      const summaries = res.content?.list ?? []
      const dateEntryMap: Record<string, DailyLogEntry[]> = {}
      await Promise.all(summaries.map(async (s) => {
        try {
          const detailRes = await dailyLogApi.detail(s.log_id)
          dateEntryMap[s.log_date] = backendDetailToLog(detailRes.content).entries
        } catch { /* skip */ }
      }))

      const days: { date: string; entries: DailyLogEntry[] }[] = []
      let cur = start
      while (!cur.isAfter(end, 'day')) {
        const d = cur.format('YYYY-MM-DD')
        if (dateEntryMap[d]?.length) days.push({ date: d, entries: dateEntryMap[d] })
        cur = cur.add(1, 'day')
      }

      await exportRangeReport({ startDate: startStr, endDate: endStr, workNo, userName: userName ?? workNo, today: todayStr, days })
      setRangeExportOpen(false)
    } finally {
      setRangeExportLoading(false)
    }
  }

  const handleExportRange = async () => {
    if (!rangeExportDates) return
    await doExportRange(rangeExportDates[0], rangeExportDates[1])
  }

  const today = dayjs()
  const quarterStart = today.month(Math.floor(today.month() / 3) * 3).startOf('month')
  const exportMenuItems = [
    { key: 'today',   label: '今日日報' },
    { key: 'week',    label: '本週週報' },
    { key: 'month',   label: '本月月報' },
    { key: 'quarter', label: '本季季報' },
    { key: 'year',    label: '本年年報' },
    { type: 'divider' as const },
    { key: 'last1m',  label: '最近一個月' },
    { key: 'last6m',  label: '最近半年' },
    { key: 'last1y',  label: '最近一年' },
    { type: 'divider' as const },
    { key: 'custom',  label: '自定義範圍...' },
  ]

  const handleExportMenuClick = ({ key }: { key: string }) => {
    if (key === 'custom') { setRangeExportOpen(true); return }
    const ranges: Record<string, [Dayjs, Dayjs]> = {
      today:   [today, today],
      week:    [today.startOf('isoWeek'), today],
      month:   [today.startOf('month'), today],
      quarter: [quarterStart, today],
      year:    [today.startOf('year'), today],
      last1m:  [today.subtract(1, 'month'), today],
      last6m:  [today.subtract(6, 'month'), today],
      last1y:  [today.subtract(1, 'year'), today],
    }
    const [s, e] = ranges[key] ?? [today, today]
    doExportRange(s, e)
  }

  // Status badge
  const statusBadge = currentLog ? (
    <Tag
      color={currentLog.status === 'confirmed' ? 'success' : currentLog.status === 'submitted' ? 'processing' : 'default'}
      style={{ fontSize: 11 }}
    >
      {currentLog.status === 'confirmed' ? '✅ 已確認' : currentLog.status === 'submitted' ? '📤 已提交' : '📝 草稿'}
    </Tag>
  ) : (
    <Tag color="error" style={{ fontSize: 11 }}>⚠️ 未填寫</Tag>
  )

  return (
    <Spin spinning={logsLoading} tip="載入中..." size="large">
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">工作日誌</h1>
          <p className="text-slate-400 text-sm mt-0.5">每日記錄工作內容 · 週/月/季/年報自動從日報彙整</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'day' && currentLog && (
            <Button
              icon={<ArrowDownTrayIcon className="w-4 h-4" />}
              size="small"
              loading={exportingDocx}
              onClick={handleExportDailyDocx}
            >
              導出日報
            </Button>
          )}
          <Dropdown
            menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}
            disabled={rangeExportLoading}
            trigger={['click']}
          >
            <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} size="small" loading={rangeExportLoading}>
              導出報告
            </Button>
          </Dropdown>
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} size="small" onClick={handleExport}>
            導出 CSV
          </Button>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: '日', value: 'day' },
              { label: '週報', value: 'week' },
              { label: '月報', value: 'month' },
              { label: '季報', value: 'quarter' },
              { label: '年報', value: 'year' },
            ]}
            size="small"
          />
        </div>
      </div>

      {/* Manager daily-log opt-out setting */}
      {isManager && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-amber-800">主管日報設定</span>
              <Tag color="gold" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>主管級</Tag>
            </div>
            <p className="text-xs text-amber-600 mt-0.5">
              主管級以上人員可選擇是否填寫日報。關閉後系統將不再提醒您填寫日報，但您仍可隨時手動填寫。
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-amber-700 font-medium">{dailyLogOptOut ? '已關閉日報' : '日報啟用中'}</span>
            <Switch
              checked={!dailyLogOptOut}
              onChange={(checked) => setDailyLogOptOut(!checked)}
              checkedChildren="啟用"
              unCheckedChildren="關閉"
            />
          </div>
        </div>
      )}

      {/* Opt-out notice */}
      {isManager && dailyLogOptOut && (
        <Alert
          message="您已關閉日報填寫功能"
          description="系統不再要求您每日填寫日報。如需重新啟用，請在上方切換開關。"
          type="info"
          showIcon
          className="mb-4"
        />
      )}

      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <Button icon={<ChevronLeftIcon className="w-4 h-4" />} type="text" size="small" onClick={() => navigate(-1)} />
        <div className="flex items-center gap-2 flex-1">
          <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 text-sm">{dateLabel}</span>
          {viewMode === 'day' && statusBadge}
        </div>
        <Button size="small" onClick={goToday} className="text-xs">今天</Button>
        <Button icon={<ChevronRightIcon className="w-4 h-4" />} type="text" size="small" onClick={() => navigate(1)} />
      </div>

      {/* ─── Day View ──────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <>
          {/* Daily hours summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: '今日總工時', value: `${fmtH(totalHours)}`, unit: `/ ${STANDARD_DAILY_HOURS}h`, color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
              { label: '正常工時',   value: `${fmtH(totalHours - overtimeHours)}`, unit: 'h', color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
              { label: '加班工時',   value: `${fmtH(overtimeHours)}`, unit: 'h', color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
              { label: '工時充足率', value: `${sufficiencyPct}`, unit: '%', color: sufficiencyPct >= 100 ? '#16a34a' : sufficiencyPct >= 75 ? '#d97706' : '#dc2626', bg: '#f8fafc', icon: <CalendarDaysIcon className="w-4 h-4 text-slate-500" /> },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>{s.icon}</div>
                <div>
                  <div className="text-[10px] text-slate-400">{s.label}</div>
                  <div className="font-bold text-lg leading-tight" style={{ color: s.color }}>
                    {s.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{s.unit}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Entries header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <PencilSquareIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">日誌條目</span>
            <Badge count={displayEntries.length} color="#2563eb" />
            {dismissedSuggestCount > 0 && !isReadOnly && (
              <Popover
                trigger="click"
                placement="bottomLeft"
                title={<span className="text-xs font-semibold text-slate-600">已隱藏的任務進度（{dismissedSuggestCount} 條）</span>}
                content={
                  <div className="w-72 max-h-64 overflow-y-auto">
                    {dismissedSuggestEntries.map((e) => (
                      <div key={e.suggest_id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {e.function_nm ?? e.duty_nm ?? '未知任務'}
                          </div>
                          {e.description && (
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">{e.description}</div>
                          )}
                          <div className="text-[10px] text-slate-300 mt-0.5 tabular-nums">{fmtH(e.hours)}h · {e.record_time ?? ''}</div>
                        </div>
                        <button
                          className="text-[11px] text-blue-500 hover:text-blue-700 border-0 outline-none bg-transparent p-0 flex-shrink-0 cursor-pointer whitespace-nowrap"
                          onClick={() => { removeDismissedId(dateStr, e.suggest_id!); setDismissedVersion((v) => v + 1) }}
                        >
                          恢復
                        </button>
                      </div>
                    ))}
                    {dismissedSuggestEntries.length > 1 && (
                      <button
                        className="w-full text-[11px] text-slate-400 hover:text-blue-600 border-0 outline-none bg-transparent p-0 pt-2 cursor-pointer text-center"
                        onClick={() => { clearDismissedIds(dateStr); setDismissedVersion((v) => v + 1) }}
                      >
                        全部恢復
                      </button>
                    )}
                  </div>
                }
              >
                <button className="text-[11px] text-slate-400 hover:text-blue-600 underline underline-offset-2 cursor-pointer border-0 outline-none bg-transparent p-0">
                  {dismissedSuggestCount} 條進度已隱藏
                </button>
              </Popover>
            )}
            {!isReadOnly && (
              <Button type="primary" size="small" icon={<PlusIcon className="w-4 h-4" />}
                style={{ background: '#2563eb' }} className="ml-auto" onClick={() => openEntryModal()}>
                新增條目
              </Button>
            )}
          </div>

          {/* Entries */}
          <div className="mb-5">
            {displayEntries.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm py-10 flex flex-col items-center gap-3">
                <Empty description="今日尚無工作記錄" />
                {!isReadOnly && (
                  <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                    style={{ background: '#2563eb' }} onClick={() => openEntryModal()}>
                    新增第一條記錄
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {groupDailyEntries(displayEntries).map((section) => {
                  const collapsed = collapsedSections.has(section.category)
                  return (
                    <div key={section.category} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">

                      {/* ── Category header (clickable to collapse) ── */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:brightness-95 transition-all outline-none border-0"
                        style={{ background: section.color + '0e', borderBottom: collapsed ? 'none' : `2px solid ${section.color}30` }}
                        onClick={() => toggleSection(section.category)}
                      >
                        <Tag style={{
                          fontSize: 11, padding: '0 8px', margin: 0, lineHeight: '24px',
                          background: section.color + '22', color: section.color,
                          border: `1px solid ${section.color}55`, fontWeight: 700,
                        }}>
                          {section.label}
                        </Tag>
                        <span className="text-xs text-slate-400">{section.projectGroups.reduce((s, g) => s + g.tasks.length, 0)} 個任務</span>
                        <div className="ml-auto flex items-center gap-2">
                          <span className="flex items-center gap-1 text-xs font-bold" style={{ color: section.color }}>
                            <ClockIcon className="w-3.5 h-3.5" />{fmtH(section.totalHours)}h
                          </span>
                          <ChevronDownIcon
                            className="w-4 h-4 text-slate-400 transition-transform duration-200"
                            style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          />
                        </div>
                      </button>

                      {/* ── Collapsible body ── */}
                      {!collapsed && (
                        <div>
                          {section.projectGroups.map((pg, pgIdx) => {
                            const projCollapseKey = `day::${section.category}::proj::${pg.projKey}`
                            const projCollapsed = collapsedDayGroups.has(projCollapseKey)
                            return (
                            <div key={pg.projKey}>
                              {/* Project sub-header (only for project / cr_ar with a named project) */}
                              {pg.projNm && (
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none text-left cursor-pointer hover:brightness-95 transition-all"
                                  style={{
                                    background: section.color + '08',
                                    borderTop: pgIdx > 0 ? `1px solid ${section.color}20` : undefined,
                                    borderBottom: `1px solid ${section.color}20`,
                                  }}
                                  onClick={() => toggleDayGroup(projCollapseKey)}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                  <span className="text-sm font-bold text-slate-800 flex-1 min-w-0">{pg.projNm}</span>
                                  <span className="text-xs text-slate-400 mr-1">{pg.tasks.length} 個任務</span>
                                  <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: section.color }}>{fmtH(pg.totalHours)}h</span>
                                  <ChevronDownIcon className="w-3.5 h-3.5 ml-1 transition-transform duration-150 flex-shrink-0" style={{ color: section.color, transform: projCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                </button>
                              )}

                              {/* Tasks within this project group */}
                              {(!pg.projNm || !projCollapsed) && (
                              <div className={pg.projNm ? 'pl-3' : ''}>
                                {pg.tasks.map((task, tIdx) => {
                                  const taskCollapseKey = `day::${section.category}::proj::${pg.projKey}::task::${task.taskKey}`
                                  const taskCollapsed = collapsedDayGroups.has(taskCollapseKey)
                                  return (
                                  <div key={task.taskKey} style={{ borderTop: tIdx > 0 ? '1px solid #f1f5f9' : undefined }}>

                                    {/* Task sub-header */}
                                    {task.taskNm && (
                                      <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/60 group/task">
                                        <button
                                          type="button"
                                          className="flex-1 min-w-0 flex items-center gap-2 border-0 outline-none bg-transparent cursor-pointer text-left p-0"
                                          onClick={() => toggleDayGroup(taskCollapseKey)}
                                        >
                                          <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                          {(task.group1 || task.group2) && (
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              {task.group1 && (
                                                <span className="text-[10px] bg-white border border-slate-200 text-slate-500 rounded px-1.5 py-px leading-none">{task.group1}</span>
                                              )}
                                              {task.group2 && (
                                                <>
                                                  <span className="text-slate-300 text-[10px]">/</span>
                                                  <span className="text-[10px] bg-white border border-slate-200 text-slate-400 rounded px-1.5 py-px leading-none">{task.group2}</span>
                                                </>
                                              )}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                            <span className="text-sm font-semibold text-slate-700">{task.taskNm}</span>
                                            {(section.category === 'project' || section.category === 'duty') && (() => {
                                              const stateProgress = taskProgressState[`${dateStr}-${task.taskKey}`]
                                              if (typeof stateProgress === 'number') {
                                                return <Tag color="blue" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0 }}>{stateProgress}%</Tag>
                                              }
                                              const entries = task.entries
                                              const latestProgress =
                                                [...entries].reverse().find((e) => e.progress != null && e.source === 'updated')?.progress
                                                ?? [...entries].reverse().find((e) => e.progress != null && e.source === 'manual')?.progress
                                                ?? [...entries].find((e) => e.source === 'progress' && e.progress != null)?.progress
                                              return latestProgress != null
                                                ? <Tag color="blue" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0 }}>{latestProgress}%</Tag>
                                                : null
                                            })()}
                                            {(task.expectedStartDate || task.expectedEndDate) && (
                                              <span className="text-[11px] text-slate-400 tabular-nums">
                                                {task.expectedStartDate ?? '—'} ~ {task.expectedEndDate ?? '—'}
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-[11px] font-semibold text-slate-400 flex-shrink-0">{fmtH(task.totalHours)}h</span>
                                          <ChevronDownIcon className="w-3 h-3 text-slate-400 transition-transform duration-150 flex-shrink-0" style={{ transform: taskCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                        </button>
                                        {!isReadOnly && (
                                          <Popconfirm
                                            title={task.entries.length > 1
                                              ? `確定刪除此任務下全部 ${task.entries.length} 條進度記錄？`
                                              : '確定刪除此條目？'}
                                            onConfirm={() => task.entries.forEach((e) => handleDeleteEntry(e.entry_id))}
                                            okText="刪除" cancelText="取消" placement="topRight">
                                            <Button size="small" type="text" danger
                                              icon={<TrashIcon className="w-3.5 h-3.5" />}
                                              className="text-slate-400 hover:!text-red-500 flex-shrink-0 ml-1 opacity-0 group-hover/task:opacity-100 transition-opacity" />
                                          </Popconfirm>
                                        )}
                                      </div>
                                    )}

                                    {/* Entries */}
                                    {(!task.taskNm || !taskCollapsed) && <div>
                                      {task.entries.map((entry, idx) => (
                                        <div key={entry.entry_id}>
                                          <div className="px-4 py-2 group flex items-center gap-3">
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-sm text-slate-700 leading-relaxed">
                                                  {entry.description || <span className="text-slate-300 italic">（無說明）</span>}
                                                </p>
                                                {entry.source === 'updated' && (
                                                  <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>日誌更新</Tag>
                                                )}
                                                {entry.source === 'manual' && (
                                                  <Tag color="green" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>日誌新增</Tag>
                                                )}
                                                {entry.suggest_submitter && (
                                                  <Tag color="purple" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                                    由 {toName(entry.suggest_submitter) || entry.suggest_submitter} 提交
                                                  </Tag>
                                                )}
                                              </div>
                                              {entry.files && entry.files.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                  {entry.files.map((f, fi) => {
                                                    const token = tokenStorage.get()
                                                    const previewUrl = token ? `${f.url}?token=${token}` : f.url
                                                    return (
                                                      <button key={fi}
                                                        onClick={() => setPreviewFile({ url: previewUrl, name: f.name })}
                                                        className="inline-flex items-center gap-1 text-[11px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-2 py-0.5 hover:bg-blue-100 hover:border-blue-200 transition-colors max-w-[180px] cursor-pointer">
                                                        <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                                        <span className="truncate">{f.name}</span>
                                                      </button>
                                                    )
                                                  })}
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <div className="flex flex-col items-center gap-0.5">
                                                <span className="flex items-center gap-0.5 text-sm font-semibold"
                                                  style={{ color: entry.is_overtime ? '#d97706' : section.color }}>
                                                  <ClockIcon className="w-4 h-4" />{fmtH(entry.hours)}h
                                                </span>
                                                {entry.is_overtime && (
                                                  <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>加班</Tag>
                                                )}
                                                <span className="text-xs text-slate-400 tabular-nums">
                                                  {entry.record_time ?? '—'}
                                                </span>
                                              </div>
                                              {!isReadOnly && (
                                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                  <Button size="small" type="text"
                                                    icon={<PencilSquareIcon className="w-3.5 h-3.5" />}
                                                    className="text-slate-400 hover:!text-blue-500 !h-6 !w-6 !p-0 !min-w-0"
                                                    onClick={() => openEntryModal(entry)} />
                                                  <Popconfirm title="確定刪除此條目？" onConfirm={() => handleDeleteEntry(entry.entry_id)}
                                                    okText="刪除" cancelText="取消" placement="topRight">
                                                    <Button size="small" type="text" danger
                                                      icon={<TrashIcon className="w-3.5 h-3.5" />}
                                                      className="text-slate-400 hover:!text-red-500 !h-6 !w-6 !p-0 !min-w-0" />
                                                  </Popconfirm>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          {idx < task.entries.length - 1 && (
                                            <div style={{ height: '1px', background: '#e2e8f0', margin: '0 16px' }} />
                                          )}
                                        </div>
                                      ))}
                                    </div>}

                                  </div>
                                )})}
                              </div>
                              )}

                            </div>
                          )})}

                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          {currentLog?.status !== 'submitted' && currentLog?.status !== 'confirmed' && displayEntries.length > 0 && (
            <div className="flex justify-end gap-3">
              <Popconfirm title="確定提交日報？提交後不可再修改。" onConfirm={handleSubmit} okText="確定提交" cancelText="取消">
                <Button type="primary" icon={<ArrowUpTrayIcon className="w-4 h-4" />} size="large"
                  style={{ background: '#2563eb', borderRadius: 10, height: 42 }}>
                  提交日報
                </Button>
              </Popconfirm>
            </div>
          )}
        </>
      )}

      {/* ─── Week Report ───────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <SelfReportView
          startDate={currentDate.startOf('isoWeek')}
          endDate={currentDate.startOf('isoWeek').add(6, 'day')}
          logs={logs}
          onPreviewFile={(url, name) => setPreviewFile({ url, name })}
          authToken={tokenStorage.get()}
        />
      )}

      {/* ─── Month / Quarter / Year Report ─────────────────────────── */}
      {(viewMode === 'month' || viewMode === 'quarter' || viewMode === 'year') && (() => {
        const { start, end } = getPeriodRange(currentDate, viewMode)
        return (
          <SelfReportView
            startDate={start}
            endDate={end}
            logs={logs}
            onPreviewFile={(url, name) => setPreviewFile({ url, name })}
            authToken={tokenStorage.get()}
          />
        )
      })()}

      {/* ─── File Preview Modal ────────────────────────────────────── */}
      {previewFile && (
        <FilePreviewModal
          directUrl={previewFile.url}
          filename={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* ─── Entry Modal ───────────────────────────────────────────── */}
      <Modal
        title={editingEntry ? '編輯日誌條目' : '新增日誌條目'}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width="min(680px, 88vw)"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSaveEntry} className="mt-4">
          {(() => {
            const hasTaskLink = (watchedCategory === 'project' && !!watchedFunctionId) || (watchedCategory === 'duty' && !!watchedDutyId)
            return (
              <div className={`grid gap-x-3 ${hasTaskLink ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <Form.Item name="work_category" label="工作分類" rules={[{ required: true, message: '請選擇分類' }]}>
                  <Select placeholder="選擇分類" onChange={(v: WorkCategory) => {
                    if (v !== 'project' && v !== 'cr_ar') {
                      form.setFieldsValue({ project_id: undefined, function_id: undefined })
                      setSelectedProject(null)
                    }
                    if (v !== 'duty') form.setFieldsValue({ duty_id: undefined })
                  }}>
                    {WORK_CATEGORIES.map((c) => (
                      <Select.Option key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
                          {c.label}
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="hours" label="耗時 (h)" rules={[{ required: true, message: '請輸入耗時' }]}>
                  <InputNumber min={0.01} max={24} step={0.01} precision={2} style={{ width: '100%' }} addonAfter="h" />
                </Form.Item>
                {hasTaskLink && (
                  <Form.Item name="progress" label="進度 (%)"
                    rules={[{ type: 'number', min: 0, max: 100, message: '0-100' }]}>
                    <InputNumber min={0} max={100} step={1} precision={0} style={{ width: '100%' }} addonAfter="%" />
                  </Form.Item>
                )}
              </div>
            )
          })()}

          {/* 同步任務進度選項：僅在關聯任務且進度值有變更時顯示 */}
          {(() => {
            const hasTaskLink = (watchedCategory === 'project' && !!watchedFunctionId) || (watchedCategory === 'duty' && !!watchedDutyId)
            const originalProgress = editingEntry?.progress
            const progressChanged = typeof watchedProgress === 'number' && watchedProgress !== originalProgress
            if (!hasTaskLink || !progressChanged) return null
            return (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                <input
                  type="checkbox"
                  id="sync-progress-check"
                  checked={syncProgress}
                  onChange={(e) => setSyncProgress(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600 cursor-pointer flex-shrink-0"
                />
                <label htmlFor="sync-progress-check" className="text-xs text-blue-700 cursor-pointer select-none">
                  同步更新任務進度至 <span className="font-semibold">{watchedProgress}%</span>
                </label>
              </div>
            )
          })()}

          {(watchedCategory === 'project' || watchedCategory === 'cr_ar') && (
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Item name="project_id" label="關聯專案" rules={[{ required: true, message: '請選擇專案' }]}>
                <Select placeholder="選擇專案" allowClear onChange={(v: string) => {
                  setSelectedProject(v)
                  form.setFieldsValue({ function_id: undefined })
                }}>
                  {projectOpts.map((p) => (
                    <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item name="function_id" label="關聯任務">
                <Select
                  placeholder="選擇功能任務" allowClear disabled={!selectedProject}
                  optionLabelProp="label"
                  dropdownStyle={{ minWidth: 320 }}
                >
                  {(functionsMap[selectedProject ?? ''] ?? []).map((f) => (
                    <Select.Option key={f.id} value={f.id} label={f.name}>
                      <div className="py-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {f.group1 && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-px leading-none flex-shrink-0">{f.group1}</span>
                          )}
                          {f.group2 && (
                            <span className="text-[10px] bg-slate-100 text-slate-400 rounded px-1.5 py-px leading-none flex-shrink-0">{f.group2}</span>
                          )}
                          <span className="text-sm text-slate-800 font-medium">{f.name}</span>
                        </div>
                        {(f.expected_start_date || f.expected_end_date) && (
                          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                            {f.expected_start_date ?? '—'} ~ {f.expected_end_date ?? '—'}
                          </div>
                        )}
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>
          )}
          {watchedCategory === 'duty' && (
            <Form.Item name="duty_id" label="關聯臨時任務" rules={[{ required: true, message: '請選擇任務' }]}>
              <Select placeholder="選擇臨時任務" allowClear>
                {dutyOpts.map((d) => (
                  <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Form.Item name="bu_unit" label="BU / 單位（需求方）">
            <AutoComplete
              placeholder="輸入或選擇 BU"
              options={BU_OPTIONS.map((b) => ({ value: b }))}
              filterOption={(input, option) => (option?.value ?? '').includes(input)}
            />
          </Form.Item>

          <Form.Item name="description" label="工作內容" rules={[
            { required: true, message: '請填寫工作內容' },
            { min: 10, message: '工作描述至少 10 個字' },
          ]}>
            <Input.TextArea rows={3} placeholder="清楚描述本次工作內容（≥10字）..." showCount maxLength={500} />
          </Form.Item>

          <Form.Item name="is_overtime" label="是否加班" valuePropName="checked">
            <Switch
              checkedChildren="加班"
              unCheckedChildren="正常"
              onChange={(checked) => {
                if (checked) {
                  // 默认加班时数 = 当前耗时
                  form.setFieldValue('overtime_hours', watchedHours ?? undefined)
                }
              }}
            />
          </Form.Item>

          {watchedIsOvertime && (
            <Form.Item
              name="overtime_hours"
              label="加班時數 (h)"
              rules={[{ required: true, message: '請輸入加班時數' }]}
              extra="默認與耗時相同，可手動調整實際加班時數"
            >
              <InputNumber min={0.01} max={24} step={0.5} precision={2} style={{ width: '100%' }} addonAfter="h" />
            </Form.Item>
          )}

          {/* Attachments from progress record (read-only) */}
          {editingEntry?.source === 'progress' && editingEntry.files && editingEntry.files.length > 0 && (
            <Form.Item label="進度附件（來自任務進度記錄）">
              <div className="flex flex-wrap gap-1.5">
                {editingEntry.files.map((f, fi) => {
                  const token = tokenStorage.get()
                  const previewUrl = token ? `${f.url}?token=${token}` : f.url
                  return (
                    <button key={fi} type="button"
                      onClick={() => setPreviewFile({ url: previewUrl, name: f.name })}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-2 py-1 hover:bg-blue-100 hover:border-blue-200 transition-colors max-w-[180px]">
                      <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </button>
                  )
                })}
              </div>
            </Form.Item>
          )}

          {/* Existing saved attachments (editable — can delete) */}
          {editingEntry?.source !== 'progress' && existingFiles.length > 0 && (
            <Form.Item label="已上傳附件">
              <div className="flex flex-wrap gap-1.5">
                {existingFiles.map((f, fi) => {
                  const token = tokenStorage.get()
                  const previewUrl = token ? `${f.url}?token=${token}` : f.url
                  return (
                    <div key={fi} className="inline-flex items-center gap-1 text-[11px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-2 py-1 max-w-[200px]">
                      <button type="button" onClick={() => setPreviewFile({ url: previewUrl, name: f.name })}
                        className="inline-flex items-center gap-1 border-0 outline-none bg-transparent p-0 cursor-pointer text-blue-500 min-w-0">
                        <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                      <button type="button"
                        onClick={() => setExistingFiles((prev) => prev.filter((_, i) => i !== fi))}
                        className="border-0 outline-none bg-transparent p-0 cursor-pointer text-slate-300 hover:text-red-400 flex-shrink-0 ml-0.5">
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>
            </Form.Item>
          )}

          <Form.Item label="新增附件">
            <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple>
              <Button icon={<PaperClipIcon className="w-4 h-4" />} size="small">選擇附件</Button>
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button disabled={saving} onClick={() => { setModalOpen(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ background: '#2563eb' }}>
              {editingEntry ? '更新' : '新增'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ─── Range Report Export Modal ─────────────────────────────── */}
      <Modal
        title="導出範圍報告"
        open={rangeExportOpen}
        onCancel={() => setRangeExportOpen(false)}
        onOk={handleExportRange}
        okText="導出 DOCX"
        cancelText="取消"
        confirmLoading={rangeExportLoading}
        width="min(440px, 88vw)"
      >
        <div className="py-4">
          <p className="text-sm text-slate-500 mb-3">今日（{dayjs().format('YYYY-MM-DD')}）的記錄將以黃色高亮顯示。</p>
          <DatePicker.RangePicker
            value={rangeExportDates}
            onChange={(v) => setRangeExportDates(v as [Dayjs, Dayjs] | null)}
            style={{ width: '100%' }}
            disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          />
        </div>
      </Modal>

    </div>
    </Spin>
  )
}

export default DailyLogPage
