/**
 * DailyLogPage — 個人工作日誌
 * 三個視圖模式：日視圖（填寫/查看）、週視圖（表格匯總）、月視圖（日曆熱力圖）
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Card, Button, Tag, Progress, Modal, Form, Select, Input, InputNumber,
  Switch, Upload, Segmented, Empty, Badge, Popconfirm,
  AutoComplete, Alert, Spin,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  PlusIcon, PaperClipIcon, ChevronLeftIcon, ChevronRightIcon,
  PencilSquareIcon, TrashIcon, ClockIcon, CalendarDaysIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon, SunIcon, MoonIcon, BriefcaseIcon,
  AcademicCapIcon, UsersIcon, WrenchScrewdriverIcon,
  EllipsisHorizontalCircleIcon, ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import type { DailyLog, DailyLogEntry, WorkCategory } from '@/types/api.types'
import { dailyLogApi, entriesToBackend, backendDetailToLog } from '@/api/daily_log.api'
import { tokenStorage } from '@/api/httpClient'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import dayjs, { Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

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
  taskKey:    string
  taskNm:     string
  group1?:    string
  group2?:    string
  entries:    DailyLogEntry[]
  totalHours: number
}

interface SectionGroup {
  sectionKey:   string
  sectionLabel: string
  color:        string
  tasks:        TaskGroup[]
  totalHours:   number
}

function groupDailyEntries(entries: DailyLogEntry[]): SectionGroup[] {
  const sections: SectionGroup[] = []

  // 1. Project entries: group by project_nm → function_id
  const projEntries = entries.filter((e) => e.work_category === 'project')
  if (projEntries.length > 0) {
    const projMap = new Map<string, Map<string, DailyLogEntry[]>>()
    for (const e of projEntries) {
      const projNm  = e.project_nm ?? '未知專案'
      const funcKey = e.function_id ?? e.entry_id
      if (!projMap.has(projNm)) projMap.set(projNm, new Map())
      const tm = projMap.get(projNm)!
      if (!tm.has(funcKey)) tm.set(funcKey, [])
      tm.get(funcKey)!.push(e)
    }
    for (const [projNm, taskMap] of projMap) {
      const tasks: TaskGroup[] = []
      for (const [, taskEntries] of taskMap) {
        tasks.push({
          taskKey:    taskEntries[0].function_id ?? taskEntries[0].entry_id,
          taskNm:     taskEntries[0].function_nm ?? '',
          group1:     taskEntries[0].group1,
          group2:     taskEntries[0].group2,
          entries:    taskEntries,
          totalHours: taskEntries.reduce((s, e) => s + e.hours, 0),
        })
      }
      sections.push({
        sectionKey:   `proj-${projNm}`,
        sectionLabel: projNm,
        color:        '#2563eb',
        tasks,
        totalHours: tasks.reduce((s, t) => s + t.totalHours, 0),
      })
    }
  }

  // 2. Duty entries: group by duty_id under one "臨時任務" section
  const dutyEntries = entries.filter((e) => e.work_category === 'duty')
  if (dutyEntries.length > 0) {
    const dutyMap = new Map<string, DailyLogEntry[]>()
    for (const e of dutyEntries) {
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
    sections.push({
      sectionKey:   'duty',
      sectionLabel: '臨時任務',
      color:        '#7c3aed',
      tasks,
      totalHours: tasks.reduce((s, t) => s + t.totalHours, 0),
    })
  }

  // 3. Free entries (cr_ar / training / meeting / other): one section per category
  const freeCategories: WorkCategory[] = ['cr_ar', 'training', 'meeting', 'other']
  for (const cat of freeCategories) {
    const catEntries = entries.filter((e) => e.work_category === cat)
    if (catEntries.length === 0) continue
    const catInfo = CATEGORY_MAP[cat]
    sections.push({
      sectionKey:   cat,
      sectionLabel: catInfo?.label ?? cat,
      color:        catInfo?.color ?? '#94a3b8',
      tasks: catEntries.map((e) => ({
        taskKey: e.entry_id, taskNm: '', entries: [e], totalHours: e.hours,
      })),
      totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
    })
  }

  return sections
}

// ─── Runtime types for API-loaded dropdown options ───────────────────────────
interface ProjectOpt  { id: string; name: string }
interface FunctionOpt { id: string; name: string }
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
}> = ({ startDate, endDate, logs }) => {
  // Collect logs in range (chronological)
  const rangeLogs: DailyLog[] = []
  let cur = startDate
  while (!cur.isAfter(endDate, 'day')) {
    const l = logs[cur.format('YYYY-MM-DD')]
    if (l) rangeLogs.push(l)
    cur = cur.add(1, 'day')
  }

  const allEntries = rangeLogs.flatMap((l) => l.entries.map((e) => ({ ...e, log_date: l.log_date, log_status: l.status })))
  const totalHours  = rangeLogs.reduce((s, l) => s + l.total_hours, 0)
  const totalOT     = rangeLogs.reduce((s, l) => s + l.overtime_hours, 0)
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

      {/* ── Progress updates — Project → Function → chronological entries ── */}
      {(() => {
        if (rangeLogs.length === 0) {
          return (
            <Card bordered={false} className="shadow-sm">
              <Empty description="此期間尚無日報記錄" className="py-6" />
            </Card>
          )
        }

        type RichEntry = DailyLogEntry & { log_date: string; log_status: DailyLog['status'] }
        // Level-2: function / duty sub-group
        type SubGroup = { key: string; label: string; entries: RichEntry[]; totalHours: number }
        // Level-1: project / category group
        type ProjectGroup = {
          key: string
          cat: typeof WORK_CATEGORIES[0]
          projectNm: string   // project name, duty name, or '' for pure-category
          totalHours: number
          subGroups: Map<string, SubGroup>
        }

        const catOrder = WORK_CATEGORIES.map((c) => c.value)
        const projMap = new Map<string, ProjectGroup>()

        for (const log of rangeLogs) {
          for (const e of log.entries) {
            // ── Level-1 key (project group) ──
            let projKey: string
            let projNm: string
            let subKey: string
            let subLabel: string

            if (e.work_category === 'project' || e.work_category === 'cr_ar') {
              projKey  = `${e.work_category}__${e.project_id ?? 'none'}`
              projNm   = e.project_nm ?? ''
              subKey   = e.function_id ?? '__no_func__'
              subLabel = e.function_nm ?? '（無關聯任務）'
            } else if (e.work_category === 'duty') {
              projKey  = `duty__${e.duty_id ?? 'none'}`
              projNm   = e.duty_nm ?? ''
              subKey   = '__only__'
              subLabel = ''
            } else {
              projKey  = `cat__${e.work_category}`
              projNm   = ''
              subKey   = '__only__'
              subLabel = ''
            }

            if (!projMap.has(projKey)) {
              projMap.set(projKey, {
                key: projKey,
                cat: CATEGORY_MAP[e.work_category] ?? WORK_CATEGORIES[0],
                projectNm: projNm,
                totalHours: 0,
                subGroups: new Map(),
              })
            }
            const pg = projMap.get(projKey)!
            pg.totalHours += e.hours

            if (!pg.subGroups.has(subKey)) {
              pg.subGroups.set(subKey, { key: subKey, label: subLabel, entries: [], totalHours: 0 })
            }
            const sg = pg.subGroups.get(subKey)!
            sg.entries.push({ ...e, log_date: log.log_date, log_status: log.status })
            sg.totalHours += e.hours
          }
        }

        // Sort project groups by category order, then project name
        const projectGroups = [...projMap.values()].sort((a, b) => {
          const ci = catOrder.indexOf(a.cat.value) - catOrder.indexOf(b.cat.value)
          return ci !== 0 ? ci : a.projectNm.localeCompare(b.projectNm)
        })

        // Sort sub-groups and their entries chronologically
        for (const pg of projectGroups) {
          for (const sg of pg.subGroups.values()) {
            sg.entries.sort((a, b) => a.log_date.localeCompare(b.log_date))
          }
        }

        const DOW = ['日', '一', '二', '三', '四', '五', '六']
        const totalGroups = projectGroups.reduce((s, pg) => s + pg.subGroups.size, 0)

        return (
          <div className="space-y-4">
            {/* Section title */}
            <div className="flex items-center gap-2 px-1">
              <DocumentTextIcon className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">進度更新</span>
              <span className="text-xs text-slate-400 font-normal">
                {allEntries.length} 條記錄 · {totalGroups} 個任務
              </span>
            </div>

            {projectGroups.map((pg) => {
              const subList = [...pg.subGroups.values()]
              const onlySub = subList.length === 1 && subList[0].key === '__only__'
              return (
                <div key={pg.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  {/* ── Level-1: Project / category header ── */}
                  <div
                    className="flex items-center gap-2.5 px-4 py-3 flex-wrap"
                    style={{ background: pg.cat.color + '0e', borderBottom: `2px solid ${pg.cat.color}30` }}
                  >
                    <Tag
                      style={{ fontSize: 10, padding: '0 7px', margin: 0, lineHeight: '22px', background: pg.cat.color + '22', color: pg.cat.color, border: `1px solid ${pg.cat.color}55`, fontWeight: 700 }}
                    >
                      {pg.cat.label}
                    </Tag>
                    {pg.projectNm && (
                      <span className="text-sm font-bold text-slate-800">{pg.projectNm}</span>
                    )}
                    <div className="ml-auto flex items-center gap-1 text-xs font-bold" style={{ color: pg.cat.color }}>
                      <ClockIcon className="w-3.5 h-3.5" />
                      {pg.totalHours}h
                    </div>
                  </div>

                  {/* ── Level-2: Function sub-groups ── */}
                  <div className={onlySub ? '' : 'divide-y divide-slate-100'}>
                    {subList.map((sg) => (
                      <div key={sg.key}>
                        {/* Function sub-header (only shown when project has named sub-tasks) */}
                        {!onlySub && sg.label && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/70 border-b border-slate-100">
                            <div className="w-1 h-3.5 rounded-full flex-shrink-0" style={{ background: pg.cat.color }} />
                            <span className="text-xs font-semibold text-slate-600">{sg.label}</span>
                            <span className="ml-auto text-[11px] font-semibold text-slate-400">{sg.totalHours}h</span>
                          </div>
                        )}

                        {/* Entries sorted by date */}
                        <div className="divide-y divide-slate-50">
                          {sg.entries.map((entry) => {
                            const d = dayjs(entry.log_date)
                            const dow = DOW[d.day()]
                            return (
                              <div key={entry.entry_id} className="px-4 py-3">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                                    {d.format('MM/DD')} 週{dow}
                                  </span>
                                  <Tag
                                    color={entry.log_status === 'confirmed' ? 'success' : entry.log_status === 'submitted' ? 'processing' : 'default'}
                                    style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}
                                  >
                                    {entry.log_status === 'confirmed' ? '已確認' : entry.log_status === 'submitted' ? '已提交' : '草稿'}
                                  </Tag>
                                  <div className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: entry.is_overtime ? '#d97706' : '#2563eb' }}>
                                    <ClockIcon className="w-3 h-3" />
                                    {entry.hours}h
                                    {entry.is_overtime && (
                                      <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>加班</Tag>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm text-slate-700 leading-relaxed">{entry.description}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
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

// ─── Main Page ──────────────────────────────────────────────────────────────

const DailyLogPage: React.FC = () => {
  const workNo = useAppSelector((s) => s.auth.workNo)
  // Mock: role-based daily log requirement
  // In production this comes from user profile / API
  const isManager = false  // TODO: derive from user role API
  const [dailyLogOptOut, setDailyLogOptOut] = useState(false) // manager opt-out setting

  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DailyLogEntry | null>(null)
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)
  const [logs, setLogs] = useState<Record<string, DailyLog>>({})
  // Suggest entries are kept separate and NEVER saved to DB.
  // They are refreshed from /suggest on every day-view load.
  const [suggestMap, setSuggestMap] = useState<Record<string, DailyLogEntry[]>>({})
  const [logsLoading, setLogsLoading] = useState(false)
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
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
        const list = (res.content as { data_list?: { id: string; function_nm: string }[] })?.data_list ?? []
        setFunctionsMap((prev) => ({
          ...prev,
          [selectedProject]: list.map((f) => ({ id: f.id, name: f.function_nm })),
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
                group1:        item.group1 || undefined,
                group2:        item.group2 || undefined,
                description:   item.description,
                hours:         item.work_hours || 0,
                is_overtime:   false,
                overtime_hours: 0,
                files:         item.files?.length ? item.files : undefined,
                suggest_id:    item.suggest_id,
                record_time:   item.record_time ?? undefined,
              }))
              setSuggestMap((prev) => ({ ...prev, [startStr]: freshEntries }))
            })
            .catch(() => {})
        }
      })
      .catch(() => { /* silently ignore — user sees empty state */ })
      .finally(() => setLogsLoading(false))
  }, [currentDate, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Display = manual entries (from DB) + suggest entries (from API, fresh each load).
  // On page refresh, suggest entries whose suggest_id already appear in a manual entry
  // are filtered out — those progress records have already been promoted and saved.
  const suggestEntries = suggestMap[dateStr] ?? []
  const displayEntries = useMemo(() => {
    const promotedSuggestIds = new Set(
      (currentLog?.entries ?? []).map((e) => e.suggest_id).filter(Boolean) as string[],
    )
    const dedupedSuggest = promotedSuggestIds.size > 0
      ? suggestEntries.filter((e) => !e.suggest_id || !promotedSuggestIds.has(e.suggest_id))
      : suggestEntries
    return [...(currentLog?.entries ?? []), ...dedupedSuggest]
  }, [currentLog, suggestEntries])

  const totalHours = displayEntries.reduce((s, e) => s + e.hours, 0)
  const overtimeHours = displayEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
  const normalHours = totalHours - overtimeHours
  const sufficiencyPct = Math.min(100, Math.round((normalHours / STANDARD_DAILY_HOURS) * 100))
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
            const list = (res.content as { data_list?: { id: string; function_nm: string }[] })?.data_list ?? []
            setFunctionsMap((prev) => ({ ...prev, [projId]: list.map((f) => ({ id: f.id, name: f.function_nm })) }))
          })
          .catch(() => {})
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
      })
    } else {
      setEditingEntry(null)
      setSelectedProject(null)
      form.resetFields()
    }
    setFileList([])
    setModalOpen(true)
  }

  // Save entry
  const handleSaveEntry = (values: Record<string, unknown>) => {
    const cat = values.work_category as WorkCategory
    const projId = values.project_id as string | undefined
    const funcId = values.function_id as string | undefined
    const dutyId = values.duty_id as string | undefined

    const newEntry: DailyLogEntry = {
      // If editing a suggest-originated entry, promote it to a manual entry
      // so it won't be overwritten by auto-suggest on next page load.
      entry_id: editingEntry
        ? (editingEntry.entry_id.startsWith('suggest-') ? `e-${Date.now()}` : editingEntry.entry_id)
        : `e-${Date.now()}`,
      work_category: cat,
      project_id: projId,
      project_nm: projectOpts.find((p) => p.id === projId)?.name,
      function_id: funcId,
      function_nm: functionsMap[projId ?? '']?.find((f) => f.id === funcId)?.name,
      duty_id: dutyId,
      duty_nm: dutyOpts.find((d) => d.id === dutyId)?.name,
      bu_unit: values.bu_unit as string | undefined,
      description: values.description as string,
      hours: values.hours as number,
      is_overtime: (values.is_overtime as boolean) ?? false,
      overtime_hours: (values.is_overtime as boolean) ? (values.hours as number) : 0,
      // Carry over the source progress-record ID so refreshes can deduplicate precisely
      suggest_id: editingEntry?.suggest_id,
      // Preserve attachments from the original progress record
      files: editingEntry?.files?.length ? editingEntry.files : undefined,
      // Preserve submission time; for brand-new entries record current time
      record_time: editingEntry?.record_time ?? dayjs().format('HH:mm'),
    }

    const isSuggestEdit = editingEntry?.entry_id.startsWith('suggest-') ?? false

    // If the user edited a suggest entry, remove it from suggestMap
    // (it will live in manual entries from now on)
    if (isSuggestEdit && editingEntry) {
      setSuggestMap((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] ?? []).filter((e) => e.entry_id !== editingEntry.entry_id),
      }))
    }

    // Compute new entries and updated log outside the state updater to avoid
    // running side effects (API calls) inside the updater, which React may invoke
    // more than once (e.g. in StrictMode).
    const prevLog = logs[dateStr] ?? {
      log_id: `log-${dateStr}`, work_no: workNo, log_date: dateStr,
      entries: [], total_hours: 0, overtime_hours: 0, status: 'draft' as const,
    }
    const newEntries = editingEntry && !isSuggestEdit
      ? prevLog.entries.map((e) => e.entry_id === editingEntry.entry_id ? newEntry : e)
      : [...prevLog.entries, newEntry]
    const newTotal = newEntries.reduce((s, e) => s + e.hours, 0)
    const newOt = newEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
    const updatedLog = { ...prevLog, entries: newEntries, total_hours: newTotal, overtime_hours: newOt }

    setLogs((prev) => ({ ...prev, [dateStr]: updatedLog }))

    // Persist to backend — called once, outside the state updater
    const backendPayload = entriesToPayload(newEntries, dateStr)
    const hasRealId = prevLog.log_id && !prevLog.log_id.startsWith('log-')
    if (hasRealId) {
      dailyLogApi.update(prevLog.log_id!, {
        task_items: backendPayload.task_items,
        free_items: backendPayload.free_items,
      }).catch(() => {})
    } else {
      dailyLogApi.create(backendPayload)
        .then((res) => {
          if (res.content?.log_id) {
            setLogs((p) => ({
              ...p,
              [dateStr]: { ...p[dateStr], log_id: res.content.log_id },
            }))
          }
        })
        .catch(() => {})
    }
    setModalOpen(false)
    form.resetFields()
  }

  // Delete entry
  const handleDeleteEntry = (entryId: string) => {
    if (entryId.startsWith('suggest-')) {
      // Suggest entries are local-only — just remove from suggestMap
      setSuggestMap((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] ?? []).filter((e) => e.entry_id !== entryId),
      }))
      return
    }
    const log = logs[dateStr]
    if (!log) return
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
    // Clear suggest entries for this date (they're now persisted in the submitted log)
    setSuggestMap((prev) => ({ ...prev, [dateStr]: [] }))
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

  // Export
  const handleExport = () => {
    const allLogs = Object.values(logs).sort((a, b) => a.log_date.localeCompare(b.log_date))
    exportDailyLogCSV(allLogs, dateLabel.replace(/\s/g, '_'))
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">工作日誌</h1>
          <p className="text-slate-400 text-sm mt-0.5">每日記錄工作內容 · 週/月/季/年報自動從日報彙整</p>
        </div>
        <div className="flex items-center gap-2">
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
            <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '14px 18px' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <SunIcon className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">正常工時</div>
                  <div className="text-xl font-bold text-blue-600">{normalHours}<span className="text-xs font-normal text-slate-400 ml-0.5">/ {STANDARD_DAILY_HOURS}h</span></div>
                </div>
              </div>
            </Card>
            <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '14px 18px' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                  <MoonIcon className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">加班工時</div>
                  <div className="text-xl font-bold text-orange-500">{overtimeHours}<span className="text-xs font-normal text-slate-400 ml-0.5">h</span></div>
                </div>
              </div>
            </Card>
            <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '14px 18px' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
                  <ClockIcon className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-medium">總工時</div>
                  <div className="text-xl font-bold text-slate-700">{totalHours}<span className="text-xs font-normal text-slate-400 ml-0.5">h</span></div>
                </div>
              </div>
            </Card>
            <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '14px 18px' }}>
              <div className="text-[10px] text-slate-400 font-medium mb-1">工時充足率</div>
              <Progress
                percent={sufficiencyPct}
                size="small"
                strokeColor={sufficiencyPct >= 100 ? '#16a34a' : sufficiencyPct >= 75 ? '#d97706' : '#dc2626'}
                format={(p) => <span className={`text-xs font-bold ${(p ?? 0) >= 100 ? 'text-green-600' : (p ?? 0) >= 75 ? 'text-orange-500' : 'text-red-500'}`}>{p}%</span>}
              />
              <div className="text-[10px] text-slate-300 mt-0.5">
                {displayEntries.length} 條記錄
              </div>
            </Card>
          </div>

          {/* Entries header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <PencilSquareIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">日誌條目</span>
            <Badge count={displayEntries.length} color="#2563eb" />
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
              <div className="space-y-4">
                {groupDailyEntries(displayEntries).map((section) => (
                  <div key={section.sectionKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">

                    {/* ── Level-1: Category / project section header ── */}
                    <div
                      className="flex items-center gap-2.5 px-4 py-3 flex-wrap"
                      style={{ background: section.color + '0e', borderBottom: `2px solid ${section.color}30` }}
                    >
                      {(() => {
                        const catKey = section.sectionKey.startsWith('proj-') ? 'project' : section.sectionKey
                        const catLabel = CATEGORY_MAP[catKey as WorkCategory]?.label ?? section.sectionLabel
                        return (
                          <Tag style={{
                            fontSize: 10, padding: '0 7px', margin: 0, lineHeight: '22px',
                            background: section.color + '22', color: section.color,
                            border: `1px solid ${section.color}55`, fontWeight: 700,
                          }}>
                            {catLabel}
                          </Tag>
                        )
                      })()}
                      {/* For project sections, show project name as a separate title */}
                      {section.sectionKey.startsWith('proj-') && (
                        <span className="text-sm font-bold text-slate-800">{section.sectionLabel}</span>
                      )}
                      <div className="ml-auto flex items-center gap-1 text-xs font-bold" style={{ color: section.color }}>
                        <ClockIcon className="w-3.5 h-3.5" />
                        {section.totalHours}h
                      </div>
                    </div>

                    {/* ── Level-2: Task groups ── */}
                    <div className="divide-y divide-slate-100">
                      {section.tasks.map((task) => (
                        <div key={task.taskKey}>

                          {/* Function / duty sub-header */}
                          {task.taskNm && (
                            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/70">
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
                              <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0">{task.taskNm}</span>
                              <span className="text-[11px] font-semibold text-slate-400 flex-shrink-0">{task.totalHours}h</span>
                              {!isReadOnly && (
                                <div className="flex gap-0.5 flex-shrink-0 ml-1">
                                  <Button size="small" type="text"
                                    icon={<PencilSquareIcon className="w-3.5 h-3.5" />}
                                    className="text-slate-400 hover:!text-blue-500"
                                    onClick={() => openEntryModal(task.entries[0])} />
                                  <Popconfirm title="確定刪除此任務所有記錄？"
                                    onConfirm={() => task.entries.forEach((e) => handleDeleteEntry(e.entry_id))}
                                    okText="刪除" cancelText="取消" placement="topRight">
                                    <Button size="small" type="text" danger
                                      icon={<TrashIcon className="w-3.5 h-3.5" />}
                                      className="text-slate-400 hover:!text-red-500" />
                                  </Popconfirm>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Entries */}
                          <div>
                            {task.entries.map((entry, idx) => (
                              <div key={entry.entry_id}>
                                <div className="px-4 py-2 group flex items-start gap-3">
                                  {/* Left: description + attachments */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-700 leading-relaxed">
                                      {entry.description || <span className="text-slate-300 italic">（無說明）</span>}
                                    </p>
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

                                  {/* Right: hours on top, time below, actions */}
                                  <div className="flex items-start gap-1 flex-shrink-0">
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="flex items-center gap-0.5 text-xs font-semibold"
                                        style={{ color: entry.is_overtime ? '#d97706' : section.color }}>
                                        <ClockIcon className="w-3 h-3" />{entry.hours}h
                                      </span>
                                      {entry.is_overtime && (
                                        <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }}>加班</Tag>
                                      )}
                                      <span className="text-[10px] text-slate-400 tabular-nums">
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

                                {/* Divider between entries */}
                                {idx < task.entries.length - 1 && (
                                  <div style={{ height: '1px', background: '#e2e8f0', margin: '0 16px' }} />
                                )}
                              </div>
                            ))}
                          </div>

                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSaveEntry} className="mt-4">
          <div className="grid grid-cols-2 gap-x-3">
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
              <InputNumber min={0.5} max={16} step={0.5} style={{ width: '100%' }} addonAfter="h" />
            </Form.Item>
          </div>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.work_category !== cur.work_category}>
            {({ getFieldValue }) => {
              const cat = getFieldValue('work_category') as WorkCategory
              const showProject = cat === 'project' || cat === 'cr_ar'
              const showDuty = cat === 'duty'
              return (
                <>
                  {showProject && (
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
                        <Select placeholder="選擇功能任務" allowClear disabled={!selectedProject}>
                          {(functionsMap[selectedProject ?? ''] ?? []).map((f) => (
                            <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </div>
                  )}
                  {showDuty && (
                    <Form.Item name="duty_id" label="關聯臨時任務" rules={[{ required: true, message: '請選擇任務' }]}>
                      <Select placeholder="選擇臨時任務" allowClear>
                        {dutyOpts.map((d) => (
                          <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}
                </>
              )
            }}
          </Form.Item>

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
            <Switch checkedChildren="加班" unCheckedChildren="正常" />
          </Form.Item>

          {/* Existing attachments from the progress record (read-only) */}
          {editingEntry?.files && editingEntry.files.length > 0 && (
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

          <Form.Item label="新增附件">
            <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple>
              <Button icon={<PaperClipIcon className="w-4 h-4" />} size="small">選擇附件</Button>
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button onClick={() => { setModalOpen(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" style={{ background: '#2563eb' }}>
              {editingEntry ? '更新' : '新增'}
            </Button>
          </div>
        </Form>
      </Modal>

    </div>
    </Spin>
  )
}

export default DailyLogPage
