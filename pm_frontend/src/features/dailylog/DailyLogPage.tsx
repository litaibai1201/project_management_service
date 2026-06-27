/**
 * DailyLogPage — 個人工作日誌
 * 三個視圖模式：日視圖（填寫/查看）、週視圖（表格匯總）、月視圖（日曆熱力圖）
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Card, Button, Tag, Modal, Form, Select, InputNumber, Input, message,
  Switch, Upload, Segmented, Empty, Badge, Popconfirm, Popover,
  AutoComplete, Alert, Spin, DatePicker, Dropdown,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  PlusIcon, PaperClipIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon,
  PencilSquareIcon, TrashIcon, ClockIcon, CalendarDaysIcon, CheckCircleIcon,
  ArrowUpTrayIcon, ArrowsPointingOutIcon,
  DocumentTextIcon, SunIcon, MoonIcon, BriefcaseIcon,
  AcademicCapIcon, UsersIcon,
  EllipsisHorizontalCircleIcon, ArrowDownTrayIcon, ServerIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import type { DailyLog, DailyLogEntry, WorkCategory } from '@/types/api.types'
import { dailyLogApi, entriesToBackend, backendDetailToLog } from '@/api/daily_log.api'
import { showToast } from '@/utils/toast'
import { tokenStorage } from '@/api/httpClient'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import RichTextContent from '@/components/common/RichTextContent'
import RichTextEditor from '@/components/common/RichTextEditor'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { systemApi } from '@/api/system.api'
import { userApi } from '@/api/user.api'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { formatGroupName } from '@/utils/status'
import dayjs, { Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { exportDailyReport, exportRangeReport } from './exportDailyReport'

dayjs.extend(isoWeek)

// ─── Constants ──────────────────────────────────────────────────────────────
const STANDARD_DAILY_HOURS = 8.0

const WORK_CATEGORIES: { value: WorkCategory; labelKey: string; color: string; icon: React.ReactNode }[] = [
  { value: 'project',    labelKey: 'dailyLog.catProject',    color: '#2563eb', icon: <BriefcaseIcon className="w-4 h-4" /> },
  { value: 'system_req', labelKey: 'dailyLog.catSystemReq',  color: '#0891b2', icon: <ServerIcon className="w-4 h-4" /> },
  { value: 'training',   labelKey: 'dailyLog.catTraining',   color: '#d97706', icon: <AcademicCapIcon className="w-4 h-4" /> },
  { value: 'meeting',    labelKey: 'dailyLog.catMeeting',    color: '#dc2626', icon: <UsersIcon className="w-4 h-4" /> },
  { value: 'duty',       labelKey: 'dailyLog.catDuty',       color: '#7c3aed', icon: <DocumentTextIcon className="w-4 h-4" /> },
  { value: 'leave',      labelKey: 'dailyLog.catLeave',      color: '#10b981', icon: <SunIcon className="w-4 h-4" /> },
  { value: 'other',      labelKey: 'dailyLog.catOther',      color: '#94a3b8', icon: <EllipsisHorizontalCircleIcon className="w-4 h-4" /> },
]

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  project: 'dailyLog.catProject',
  system_req: 'dailyLog.catSystemReq',
  cr_ar: 'dailyLog.catCrAr',
  training: 'dailyLog.catTraining',
  meeting: 'dailyLog.catMeeting',
  duty: 'dailyLog.catDuty',
  leave: 'dailyLog.catLeave',
  other: 'dailyLog.catOther',
}

const CATEGORY_MAP = Object.fromEntries(WORK_CATEGORIES.map((c) => [c.value, c]))

// ─── Grouped view types & helper ─────────────────────────────────────────────

interface TaskGroup {
  taskKey:            string
  taskNm:             string
  expectedStartDate?: string
  expectedEndDate?:   string
  entries:            DailyLogEntry[]
  totalHours:         number
}

interface GroupSection {
  groupKey:   string   // group1\x00group2, or '__no_group__'
  groupNm:    string   // '' if no group
  tasks:      TaskGroup[]
  totalHours: number
}

interface RequirementSection {
  reqKey:     string   // requirement_nm, or '__no_req__'
  reqNm:      string   // '' if no requirement
  groups:     GroupSection[]
  totalHours: number
}

interface ProjectSubGroup {
  projKey:      string
  projNm:       string   // project_nm / system_nm / '' for unnamed
  linkUrl?:     string   // clickable link to project/system detail
  requirements: RequirementSection[]
  totalHours:   number
}

/** Top-level: one card per WorkCategory */
interface CategorySection {
  category:      WorkCategory
  label:         string
  color:         string
  totalHours:    number
  projectGroups: ProjectSubGroup[]
}

/** Count all leaf tasks across the whole hierarchy */
function countTasks(projectGroups: ProjectSubGroup[]): number {
  return projectGroups.flatMap((pg) => pg.requirements.flatMap((r) => r.groups.flatMap((g) => g.tasks))).length
}
function countEntries(projectGroups: ProjectSubGroup[]): number {
  return projectGroups.flatMap((pg) => pg.requirements.flatMap((r) => r.groups.flatMap((g) => g.tasks.flatMap((t) => t.entries)))).length
}

/** Build Requirement → Group → Task hierarchy from a flat entry list.
 *  Entries are first aggregated by task key so that inconsistent metadata
 *  (e.g. one entry has requirement_nm, another doesn't) never splits the
 *  same task across multiple sections. */
function buildRequirements(
  entries: DailyLogEntry[],
  getKey: (e: DailyLogEntry) => string,
  getNm:  (e: DailyLogEntry) => string,
): RequirementSection[] {
  // Step 1: aggregate all entries by task key
  const taskMap = new Map<string, DailyLogEntry[]>()
  for (const e of entries) {
    const k = getKey(e)
    if (!taskMap.has(k)) taskMap.set(k, [])
    taskMap.get(k)!.push(e)
  }

  // Step 2: derive canonical metadata per task (first non-empty value wins)
  const taskMeta = new Map<string, { reqNm: string; g1: string; g2: string }>()
  for (const [k, te] of taskMap) {
    taskMeta.set(k, {
      reqNm: te.find((e) => e.requirement_nm)?.requirement_nm ?? '',
      g1:    te.find((e) => e.group1)?.group1 ?? '',
      g2:    te.find((e) => e.group2)?.group2 ?? '',
    })
  }

  // Step 3: build Requirement → Group → Task using canonical metadata
  const reqMap = new Map<string, { nm: string; taskKeys: string[] }>()
  for (const [k, meta] of taskMeta) {
    const rk = meta.reqNm || '__no_req__'
    if (!reqMap.has(rk)) reqMap.set(rk, { nm: meta.reqNm, taskKeys: [] })
    reqMap.get(rk)!.taskKeys.push(k)
  }

  const sections: RequirementSection[] = []
  for (const [reqKey, rg] of reqMap) {
    const grpMap = new Map<string, { nm: string; taskKeys: string[] }>()
    for (const tk of rg.taskKeys) {
      const { g1, g2 } = taskMeta.get(tk)!
      const gk = (g1 || g2) ? `${g1}\x00${g2}` : '__no_group__'
      const g1Label = formatGroupName(g1) || g1
      const nm = g1Label ? (g2 ? `${g1Label} / ${g2}` : g1Label) : (g2 || '')
      if (!grpMap.has(gk)) grpMap.set(gk, { nm, taskKeys: [] })
      grpMap.get(gk)!.taskKeys.push(tk)
    }

    const groups: GroupSection[] = []
    for (const [groupKey, gg] of grpMap) {
      const tasks: TaskGroup[] = gg.taskKeys.map((tk) => {
        const te = taskMap.get(tk)!
        return {
          taskKey:           tk,
          taskNm:            getNm(te[0]),
          expectedStartDate: te[0].expected_start_date,
          expectedEndDate:   te[0].expected_end_date,
          entries:           te,
          totalHours:        te.reduce((s, e) => s + e.hours, 0),
        }
      })
      tasks.sort((a, b) => {
        const sa = a.expectedStartDate ?? '9999-99-99', sb = b.expectedStartDate ?? '9999-99-99'
        if (sa !== sb) return sa.localeCompare(sb)
        return (a.expectedEndDate ?? '9999-99-99').localeCompare(b.expectedEndDate ?? '9999-99-99')
      })
      const grpHours = tasks.reduce((s, t) => s + t.totalHours, 0)
      groups.push({ groupKey, groupNm: gg.nm, tasks, totalHours: grpHours })
    }
    groups.sort((a, b) => (!a.groupNm && b.groupNm ? 1 : a.groupNm && !b.groupNm ? -1 : 0))
    const reqHours = groups.reduce((s, g) => s + g.totalHours, 0)
    sections.push({ reqKey, reqNm: rg.nm, groups, totalHours: reqHours })
  }
  sections.sort((a, b) => (!a.reqNm && b.reqNm ? 1 : a.reqNm && !b.reqNm ? -1 : a.reqNm.localeCompare(b.reqNm)))
  return sections
}

function groupDailyEntries(entries: DailyLogEntry[]): CategorySection[] {
  const result: CategorySection[] = []

  for (const catInfo of WORK_CATEGORIES) {
    const catEntries = entries.filter((e) => e.work_category === catInfo.value)
    if (catEntries.length === 0) continue

    let projectGroups: ProjectSubGroup[] = []

    if (catInfo.value === 'project') {
      const projMap = new Map<string, { nm: string; list: DailyLogEntry[] }>()
      for (const e of catEntries) {
        const k = e.project_id ?? '__no_proj__'
        if (!projMap.has(k)) projMap.set(k, { nm: e.project_nm ?? i18n.t('dailyLog.unknownProject'), list: [] })
        projMap.get(k)!.list.push(e)
      }
      for (const [projKey, pg] of projMap) {
        projectGroups.push({
          projKey, projNm: pg.nm,
          linkUrl: projKey !== '__no_proj__' ? `/projects/${projKey}` : undefined,
          requirements: buildRequirements(pg.list, (e) => e.function_id ?? e.entry_id, (e) => e.function_nm ?? ''),
          totalHours: pg.list.reduce((s, e) => s + e.hours, 0),
        })
      }
    } else if (catInfo.value === 'duty') {
      projectGroups = [{
        projKey: '__duty__', projNm: '',
        requirements: buildRequirements(catEntries, (e) => e.duty_id ?? e.entry_id, (e) => e.duty_nm ?? ''),
        totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
      }]
    } else if (catInfo.value === 'system_req') {
      const sysMap = new Map<string, { nm: string; sysId?: string; list: DailyLogEntry[] }>()
      for (const e of catEntries) {
        const k = e.system_id ?? e.system_nm ?? '__no_sys__'
        if (!sysMap.has(k)) sysMap.set(k, { nm: e.system_nm ?? '', sysId: e.system_id, list: [] })
        sysMap.get(k)!.list.push(e)
      }
      for (const [sysKey, sg] of sysMap) {
        projectGroups.push({
          projKey: sysKey, projNm: sg.nm,
          linkUrl: sg.sysId ? `/systems/${sg.sysId}` : undefined,
          requirements: buildRequirements(sg.list, (e) => e.duty_id ?? e.entry_id, (e) => e.duty_nm ?? ''),
          totalHours: sg.list.reduce((s, e) => s + e.hours, 0),
        })
      }
    } else {
      // training / meeting / other — flat list
      projectGroups = [{
        projKey: catInfo.value, projNm: '',
        requirements: [{ reqKey: '__flat__', reqNm: '', totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
          groups: [{ groupKey: '__flat__', groupNm: '', totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
            tasks: [{ taskKey: catInfo.value, taskNm: '', entries: catEntries, totalHours: catEntries.reduce((s, e) => s + e.hours, 0) }],
          }],
        }],
        totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
      }]
    }

    result.push({
      category: catInfo.value, label: catInfo.labelKey, color: catInfo.color,
      totalHours: catEntries.reduce((s, e) => s + e.hours, 0),
      projectGroups,
    })
  }

  return result
}

// ─── Runtime types for API-loaded dropdown options ───────────────────────────
interface ProjectOpt  { id: string; name: string }
interface FunctionOpt {
  id: string; name: string
  requirement_nm?: string
  group1?: string; group2?: string
  expected_start_date?: string; expected_end_date?: string
}
interface DutyOpt     { id: string; name: string; requirement_nm?: string; group?: string; system_nm?: string; expected_start_date?: string; expected_end_date?: string }
// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportDailyLogCSV(logs: DailyLog[], rangeLabel: string) {
  const bom = '\uFEFF'
  const _t = i18n.t.bind(i18n)
  const headers = [_t('dailyLog.csvDate'), _t('dailyLog.csvCategory'), _t('dailyLog.csvProject'), _t('dailyLog.csvTask'), _t('dailyLog.csvBu'), _t('dailyLog.csvContent'), _t('dailyLog.csvHours'), _t('dailyLog.csvOvertime'), _t('dailyLog.csvOvertimeHours')]
  const rows = logs.flatMap((log) =>
    log.entries.map((e) => [
      log.log_date,
      CATEGORY_LABEL_KEYS[e.work_category] ? _t(CATEGORY_LABEL_KEYS[e.work_category]) : e.work_category,
      e.project_nm ?? '—',
      e.function_nm ?? e.duty_nm ?? '—',
      e.bu_unit ?? '—',
      e.description,
      String(e.hours),
      e.is_overtime ? _t('common.yes') : _t('common.no'),
      e.is_overtime ? String(e.overtime_hours ?? e.hours) : '0',
    ])
  )
  const csv = bom + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${i18n.t('dailyLog.title')}_${rangeLabel}.csv`; a.click()
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
  const { t } = useTranslation()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  const initRef = useRef(false)

  // Collect logs in range (chronological)
  const rangeLogs: DailyLog[] = []
  let cur = startDate
  while (!cur.isAfter(endDate, 'day')) {
    const l = logs[cur.format('YYYY-MM-DD')]
    if (l) rangeLogs.push(l)
    cur = cur.add(1, 'day')
  }

  const allEntries = rangeLogs.flatMap((l) => l.entries.map((e) => ({ ...e, log_date: l.log_date, log_status: l.status })))
  const workEntries = allEntries.filter((e) => e.work_category !== 'leave')
  const leaveEntries = allEntries.filter((e) => e.work_category === 'leave')
  const totalHours  = workEntries.reduce((s, e) => s + e.hours, 0)
  const totalLeave  = leaveEntries.reduce((s, e) => s + e.hours, 0)
  const totalOT     = workEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
  const totalNormal = totalHours - totalOT
  const submittedHours = workEntries.filter((e) => e.log_status === 'submitted').reduce((s, e) => s + e.hours, 0)
  const draftHours     = totalHours - submittedHours
  const workedDays  = rangeLogs.length

  const catTotals = WORK_CATEGORIES.map((cat) => ({
    ...cat,
    total: allEntries.filter((e) => e.work_category === cat.value).reduce((s, e) => s + e.hours, 0),
  })).filter((c) => c.total > 0)

  // Default: collapse all levels (category / project / requirement) — user opens one by one
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sectionsForInit = useMemo(() => groupDailyEntries(allEntries), [JSON.stringify(allEntries.map((e) => e.entry_id))])
  useEffect(() => {
    if (initRef.current || sectionsForInit.length === 0) return
    initRef.current = true
    const keys = new Set<string>()
    for (const sec of sectionsForInit) {
      // collapse category level
      keys.add(sec.category)
      for (const pg of sec.projectGroups) {
        // collapse project level
        keys.add(`${sec.category}::proj::${pg.projKey}`)
        for (const req of pg.requirements) {
          // collapse requirement level
          keys.add(`${sec.category}::proj::${pg.projKey}::req::${req.reqKey}`)
        }
      }
    }
    if (keys.size > 0) setCollapsedGroups(keys)
  }, [sectionsForInit])

  return (
    <div className="space-y-4">
      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: t('dailyLog.periodTotalHours'), value: totalHours.toFixed(1),  unit: 'h',  color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
          { label: t('dailyLog.submittedHours'),   value: submittedHours.toFixed(1), unit: 'h', color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleIcon className="w-4 h-4 text-green-500" /> },
          { label: t('dailyLog.draftHours'),       value: draftHours.toFixed(1),  unit: 'h',  color: '#f59e0b', bg: '#fffbeb', icon: <DocumentTextIcon className="w-4 h-4 text-amber-500" /> },
          { label: t('dailyLog.normalHours'),      value: totalNormal.toFixed(1), unit: 'h',  color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
          { label: t('dailyLog.overtimeHoursLabel'), value: totalOT.toFixed(1),   unit: 'h',  color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
          ...(totalLeave > 0 ? [{ label: t('dailyLog.leaveHoursLabel'), value: totalLeave.toFixed(1), unit: 'h', color: '#10b981', bg: '#ecfdf5', icon: <SunIcon className="w-4 h-4 text-emerald-500" /> }] : []),
          { label: t('dailyLog.reportedDays'),     value: workedDays,              unit: t('dailyLog.unitDay'), color: '#64748b', bg: '#f8fafc', icon: <CalendarDaysIcon className="w-4 h-4 text-slate-500" /> },
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
        <Card variant="borderless" className="shadow-sm" title={<span className="text-sm font-semibold text-slate-700">{t('dailyLog.categoryDistribution')}</span>}>
          <div className="flex flex-col gap-2.5">
            {catTotals.map((c) => (
              <div key={c.value} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                  <div className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
                  <span className="text-xs text-slate-600">{t(CATEGORY_LABEL_KEYS[c.value as WorkCategory])}</span>
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

      {/* ── Progress updates — Requirement → Group → Task hierarchy ── */}
      {(() => {
        if (rangeLogs.length === 0) {
          return (
            <Card variant="borderless" className="shadow-sm">
              <Empty description={t('dailyLog.noPeriodRecords')} className="py-6" />
            </Card>
          )
        }

        type RichEntry = DailyLogEntry & { log_date: string; log_status: DailyLog['status'] }
        const richEntries = allEntries as RichEntry[]
        const sections = groupDailyEntries(richEntries as DailyLogEntry[])
        const totalEntries = sections.reduce((s, cs) => s + countEntries(cs.projectGroups), 0)
        const totalTasks = sections.reduce((s, cs) => s + countTasks(cs.projectGroups), 0)
        const DOW = [t('dailyLog.dowSun'), t('dailyLog.dowMon'), t('dailyLog.dowTue'), t('dailyLog.dowWed'), t('dailyLog.dowThu'), t('dailyLog.dowFri'), t('dailyLog.dowSat')]

        return (
          <div className="space-y-3">
            {/* Section title */}
            <div className="flex items-center gap-2 px-1">
              <DocumentTextIcon className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">{t('dailyLog.progressUpdates')}</span>
              <span className="text-xs text-slate-400 font-normal">{t('dailyLog.recordsAndTasks', { records: totalEntries, tasks: totalTasks })}</span>
            </div>

            {sections.map((section) => {
              const collapsed = collapsedGroups.has(section.category)
              const isTaskCategory = ['project', 'system_req', 'duty'].includes(section.category)
              const taskCount = countTasks(section.projectGroups)
              const entryCount = countEntries(section.projectGroups)
              return (
                <div key={section.category} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  {/* ── Category header ── */}
                  <button onClick={() => toggleGroup(section.category)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left border-0 outline-none cursor-pointer"
                    style={{ background: section.color + '12', borderBottom: collapsed ? 'none' : `2px solid ${section.color}30` }}>
                    <Tag style={{ fontSize: 10, padding: '0 7px', margin: 0, lineHeight: '22px', background: section.color + '22', color: section.color, border: `1px solid ${section.color}55`, fontWeight: 700 }}>
                      {t(CATEGORY_LABEL_KEYS[section.category])}
                    </Tag>
                    {isTaskCategory
                      ? taskCount > 0 && <span className="text-xs text-slate-400">{t('dailyLog.nTasks', { count: taskCount })}</span>
                      : entryCount > 0 && <span className="text-xs text-slate-400">{t('dailyLog.nRecords', { count: entryCount })}</span>
                    }
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums" style={{ color: section.color }}>
                        <ClockIcon className="w-3.5 h-3.5 inline mr-0.5" />{fmtH(section.totalHours)}h
                      </span>
                      <ChevronDownIcon className="w-3.5 h-3.5 transition-transform duration-150" style={{ color: section.color, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                    </div>
                  </button>

                  {!collapsed && (
                    <div>
                      {section.projectGroups.map((pg, pgIdx) => {
                        const projCollapseKey = `${section.category}::proj::${pg.projKey}`
                        const projCollapsed = collapsedGroups.has(projCollapseKey)
                        return (
                          <div key={pg.projKey}>
                            {/* ── Project row ── */}
                            {pg.projNm && (
                              <button onClick={() => toggleGroup(projCollapseKey)}
                                className="w-full flex items-center gap-2 px-4 py-2.5 border-0 outline-none text-left cursor-pointer hover:bg-slate-50 transition-colors"
                                style={{ background: section.color + '08', borderTop: pgIdx > 0 ? `1px solid ${section.color}20` : undefined, borderBottom: `1px solid ${section.color}20` }}>
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                {pg.linkUrl
                                  ? <span className="text-sm font-bold text-blue-600 hover:underline truncate" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); window.open(pg.linkUrl!, '_blank') }}>{pg.projNm}</span>
                                  : <span className="text-sm font-bold text-slate-800 truncate">{pg.projNm}</span>
                                }
                                <span className="flex-1" />
                                <span className="text-xs text-slate-400 mr-1 flex-shrink-0">{t('dailyLog.nTasks', { count: countTasks([pg]) })}</span>
                                <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: section.color }}>{fmtH(pg.totalHours)}h</span>
                                <ChevronDownIcon className="w-3.5 h-3.5 ml-1 transition-transform duration-150 flex-shrink-0" style={{ color: section.color, transform: projCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                              </button>
                            )}

                            {(!pg.projNm || !projCollapsed) && (
                              <div className={pg.projNm ? 'pl-3' : ''}>
                                {pg.requirements.map((req, rIdx) => {
                                  const reqCKey = `${section.category}::proj::${pg.projKey}::req::${req.reqKey}`
                                  const reqCollapsed = collapsedGroups.has(reqCKey)
                                  return (
                                    <div key={req.reqKey} style={{ borderTop: rIdx > 0 && !pg.projNm ? '1px solid #f1f5f9' : undefined }}>
                                      {/* ── Requirement sub-header ── */}
                                      {req.reqNm && (
                                        <button onClick={() => toggleGroup(reqCKey)}
                                          className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none text-left cursor-pointer hover:brightness-95 transition-all"
                                          style={{ background: '#eff6ff', borderTop: rIdx > 0 ? `1px solid ${section.color}18` : undefined, borderBottom: `1px solid ${section.color}18` }}>
                                          <div className="w-1 h-3.5 rounded-full flex-shrink-0 bg-blue-400" />
                                          <span className="text-[11px] font-semibold text-blue-600 flex-1 min-w-0">{req.reqNm}</span>
                                          <span className="text-[10px] text-slate-400 mr-1">{t('dailyLog.nTasks', { count: req.groups.flatMap((g) => g.tasks).length })}</span>
                                          <span className="text-[10px] font-semibold text-blue-500">{fmtH(req.totalHours)}h</span>
                                          <ChevronDownIcon className="w-3 h-3 ml-1 text-blue-400 transition-transform duration-150 flex-shrink-0" style={{ transform: reqCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                        </button>
                                      )}

                                      {(!req.reqNm || !reqCollapsed) && (
                                        <div className={req.reqNm ? 'pl-3' : ''}>
                                          {req.groups.map((group, gIdx) => {
                                            const grpCKey = `${reqCKey}::grp::${group.groupKey}`
                                            const grpCollapsed = collapsedGroups.has(grpCKey)
                                            return (
                                              <div key={group.groupKey} style={{ borderTop: gIdx > 0 ? '1px solid #f1f5f9' : undefined }}>
                                                {/* ── Group sub-header ── */}
                                                {group.groupNm && (
                                                  <button onClick={() => toggleGroup(grpCKey)}
                                                    className="w-full flex items-center gap-2 px-4 py-1.5 border-0 outline-none text-left cursor-pointer hover:bg-slate-100/60 transition-all"
                                                    style={{ background: '#f8fafc', borderTop: gIdx > 0 ? '1px solid #e2e8f0' : undefined, borderBottom: '1px solid #e2e8f0' }}>
                                                    <div className="w-0.5 h-3 rounded-full flex-shrink-0 bg-slate-400" />
                                                    <span className="text-[11px] font-medium text-slate-600 flex-1 min-w-0">{group.groupNm}</span>
                                                    <span className="text-[10px] text-slate-400 mr-1">{t('dailyLog.nTasks', { count: group.tasks.length })}</span>
                                                    <span className="text-[10px] font-medium text-slate-500">{fmtH(group.totalHours)}h</span>
                                                    <ChevronDownIcon className="w-3 h-3 ml-1 text-slate-400 transition-transform duration-150 flex-shrink-0" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                                  </button>
                                                )}

                                                {(!group.groupNm || !grpCollapsed) && (
                                                  <div className={group.groupNm ? 'pl-3' : ''}>
                                                    {group.tasks.map((task, tIdx) => {
                                                      const taskCKey = `${grpCKey}::task::${task.taskKey}`
                                                      const taskCollapsed = collapsedGroups.has(taskCKey)
                                                      const sortedEntries = [...task.entries].sort((a, b) =>
                                                        ((a as RichEntry).log_date ?? '').localeCompare((b as RichEntry).log_date ?? ''))
                                                      return (
                                                        <div key={task.taskKey} style={{ borderTop: tIdx > 0 ? '1px solid #f1f5f9' : undefined }}>
                                                          {/* Task header */}
                                                          {task.taskNm && (
                                                            <button onClick={() => toggleGroup(taskCKey)}
                                                              className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none bg-slate-50/60 hover:bg-slate-100/70 transition-colors text-left cursor-pointer">
                                                              <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                                              <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0">{task.taskNm}</span>
                                                              {(section.category === 'project' || section.category === 'duty' || section.category === 'system_req') && (() => {
                                                                const latestProgress = [...task.entries].reverse().find((e) => e.progress != null)?.progress
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
                                                          {/* Entries sorted by log_date ascending */}
                                                          {(!task.taskNm || !taskCollapsed) && (
                                                            <div>
                                                              {sortedEntries.map((entry, eIdx) => {
                                                                const re = entry as RichEntry
                                                                const d = dayjs(re.log_date)
                                                                return (
                                                                  <div key={`${re.log_date ?? ''}-${entry.entry_id}`}>
                                                                    {eIdx > 0 && <div style={{ height: '1px', background: '#e2e8f0', margin: '0 16px' }} />}
                                                                    <div className="flex items-center gap-3 px-4 py-2.5" style={re.log_date === dayjs().format('YYYY-MM-DD') ? { background: '#fffbeb', borderLeft: '3px solid #f59e0b' } : undefined}>
                                                                      <div className="flex-1 min-w-0">
                                                                        <div className="flex items-start gap-2">
                                                                          <div className="flex-1 min-w-0">
                                                                            {entry.description
                                                                              ? <RichTextContent html={entry.description} onImageClick={(src) => onPreviewFile(authToken ? `${src}?token=${authToken}` : src, src.split('/').pop()?.split('?')[0] ?? 'image.png')} />
                                                                              : <span className="text-slate-300 italic text-sm">{t('dailyLog.noDescription')}</span>}
                                                                          </div>
                                                                          {entry.source === 'updated' && (
                                                                            <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px', flexShrink: 0 }}>{t('dailyLog.sourceUpdated')}</Tag>
                                                                          )}
                                                                          {entry.source === 'manual' && (
                                                                            <Tag color="green" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px', flexShrink: 0 }}>{t('dailyLog.sourceManual')}</Tag>
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
                                                                          {entry.is_overtime && <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>{t('dailyLog.overtime')}{fmtH(entry.overtime_hours ?? entry.hours)}h</Tag>}
                                                                        </div>
                                                                        <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">{d.format('MM/DD')} {t('dailyLog.weekPrefix')}{DOW[d.day()]}</div>
                                                                        <Tag
                                                                          color={re.log_status === 'confirmed' ? 'success' : re.log_status === 'submitted' ? 'processing' : 'default'}
                                                                          style={{ fontSize: 9, padding: '0 4px', margin: '2px 0 0', lineHeight: '14px' }}>
                                                                          {re.log_status === 'confirmed' ? t('dailyLog.confirmed') : re.log_status === 'submitted' ? t('dailyLog.submitted') : t('dailyLog.draft')}
                                                                        </Tag>
                                                                      </div>
                                                                    </div>
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
type ViewMode = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'text'

// ─── Helpers: map frontend entries ↔ backend payload ────────────────────────

// entriesToPayload delegates to the shared adapter in daily_log.api.ts
const entriesToPayload = entriesToBackend
// Format hours: show up to 2 decimal places, stripping trailing zeros (e.g. 1.50 → "1.5", 1.00 → "1")
const fmtH = (h: number) => parseFloat(h.toFixed(2))

// Re-export SelfReportView so it can be used from the progress report tab
export { SelfReportView, WORK_CATEGORIES, CATEGORY_MAP, fmtH }

// ─── Main Page ──────────────────────────────────────────────────────────────

const DailyLogPage: React.FC = () => {
  const { t } = useTranslation()
  const workNo     = useAppSelector((s) => s.auth.workNo)
  const userName   = useAppSelector((s) => s.auth.name)
  const department = useAppSelector((s) => s.auth.department)
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
  const [descExpandOpen, setDescExpandOpen] = useState(false)
  const [descExpandDraft, setDescExpandDraft] = useState('')

  const handleImageUpload = React.useCallback(async (file: File): Promise<string> => {
    const { dutyApi } = await import('@/api/duty.api')
    const result = await dutyApi.uploadInlineImage(file)
    return result.url
  }, [])
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)
  const [logs, setLogs] = useState<Record<string, DailyLog>>({})
  // Suggest entries are kept separate and NEVER saved to DB.
  // They are refreshed from /suggest on every day-view load.
  const [suggestMap, setSuggestMap] = useState<Record<string, DailyLogEntry[]>>({})
  // Explicit task-progress overrides: updated whenever user saves a progress value.
  // Key = task_id (function_id or duty_id), Value = latest user-entered progress %.
  const [taskProgressState, setTaskProgressState] = useState<Record<string, number>>({})
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsRefreshKey, setLogsRefreshKey] = useState(0)
  // 记录后端已保存的 entry IDs（用于区分新追加的条目）
  const [savedEntryIds, setSavedEntryIds] = useState<Set<string>>(new Set())
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

  // ── Text editor state (frontend-only cache) ──
  const [textEditorContent, setTextEditorContent] = useState<string>('')
  const [textEditorInited, setTextEditorInited] = useState(false)

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
  const [selectedFuncReq, setSelectedFuncReq] = useState<string | undefined>()
  const [selectedFuncGrp, setSelectedFuncGrp] = useState<string | undefined>()

  // Dropdown options loaded from real API
  const [projectOpts, setProjectOpts] = useState<ProjectOpt[]>([])
  const [functionsMap, setFunctionsMap] = useState<Record<string, FunctionOpt[]>>({})
  const [dutyOpts, setDutyOpts] = useState<DutyOpt[]>([])
  const [systemOpts, setSystemOpts] = useState<{ id: string; name: string }[]>([])
  const [departmentOpts, setDepartmentOpts] = useState<string[]>([])
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [selectedSysReq, setSelectedSysReq] = useState<string | undefined>()
  const [selectedSysGrp, setSelectedSysGrp] = useState<string | undefined>()
  const [systemDutiesMap, setSystemDutiesMap] = useState<Record<string, DutyOpt[]>>({})

  // Filtered function options for project tasks
  const filteredFuncOpts = useMemo(() => {
    let list = functionsMap[selectedProject ?? ''] ?? []
    if (selectedFuncReq) list = list.filter((f) => (f.requirement_nm || '') === selectedFuncReq)
    if (selectedFuncGrp) list = list.filter((f) => (formatGroupName(f.group1) || f.group1 || '') === selectedFuncGrp)
    return list
  }, [functionsMap, selectedProject, selectedFuncReq, selectedFuncGrp])

  const funcReqOpts = useMemo(() => {
    const list = functionsMap[selectedProject ?? ''] ?? []
    return Array.from(new Set(list.map((f) => f.requirement_nm).filter(Boolean) as string[]))
      .map((v) => ({ value: v, label: v }))
  }, [functionsMap, selectedProject])

  const funcGrpOpts = useMemo(() => {
    let list = functionsMap[selectedProject ?? ''] ?? []
    if (selectedFuncReq) list = list.filter((f) => (f.requirement_nm || '') === selectedFuncReq)
    return Array.from(new Set(list.map((f) => formatGroupName(f.group1) || f.group1).filter(Boolean) as string[]))
      .map((v) => ({ value: v, label: v }))
  }, [functionsMap, selectedProject, selectedFuncReq])

  // Filtered duty options for system tasks
  const filteredSysDutyOpts = useMemo(() => {
    let list = systemDutiesMap[selectedSystem ?? ''] ?? []
    if (selectedSysReq) list = list.filter((d) => (d.requirement_nm || '') === selectedSysReq)
    if (selectedSysGrp) list = list.filter((d) => (formatGroupName(d.group) || d.group || '') === selectedSysGrp)
    return list
  }, [systemDutiesMap, selectedSystem, selectedSysReq, selectedSysGrp])

  const sysReqOpts = useMemo(() => {
    const list = systemDutiesMap[selectedSystem ?? ''] ?? []
    return Array.from(new Set(list.map((d) => d.requirement_nm).filter(Boolean) as string[]))
      .map((v) => ({ value: v, label: v }))
  }, [systemDutiesMap, selectedSystem])

  const sysGrpOpts = useMemo(() => {
    let list = systemDutiesMap[selectedSystem ?? ''] ?? []
    if (selectedSysReq) list = list.filter((d) => (d.requirement_nm || '') === selectedSysReq)
    return Array.from(new Set(list.map((d) => formatGroupName(d.group) || d.group).filter(Boolean) as string[]))
      .map((v) => ({ value: v, label: v }))
  }, [systemDutiesMap, selectedSystem, selectedSysReq])

  // Load project list once on mount
  useEffect(() => {
    projectApi.list({ page: 1, size: 200 })
      .then((res) => {
        const list = ((res.content as { project_list?: { id: string; project_nm: string; status?: number }[] })?.project_list ?? [])
          .filter((p) => p.status !== 7)  // 排除已完結
        setProjectOpts(list.map((p) => ({ id: p.id, name: p.project_nm })))
      })
      .catch(() => {})
  }, [])

  // Load department list once on mount
  useEffect(() => {
    userApi.departments()
      .then((res) => {
        const list = (res.content as { id: string | null; name: string }[]) ?? []
        setDepartmentOpts(list.map((d) => d.name).filter(Boolean))
      })
      .catch(() => {})
  }, [])

  // Load duty list once on mount — 僅返回當前用戶為責任人、狀態為未開始/進行中的 AR
  useEffect(() => {
    dutyApi.taskList({ page: 1, size: 200 })
      .then((res) => {
        const list = (res.content as { data_list?: { id: string; duty_nm: string; system_id?: string; system_nm?: string; requirement_nm?: string; group?: string; expected_start_date?: string; expected_end_date?: string }[] })?.data_list ?? []
        setDutyOpts(list.map((d) => ({
          id: d.id, name: d.duty_nm,
          system_nm: d.system_nm || undefined,
          requirement_nm: d.requirement_nm || undefined,
          group: d.group || undefined,
          expected_start_date: d.expected_start_date || undefined,
          expected_end_date: d.expected_end_date || undefined,
        })))
      })
      .catch(() => {})
  }, [])

  // Load system list once on mount
  useEffect(() => {
    systemApi.list({ page: 1, size: 200 })
      .then((res) => {
        const list = res.content?.data_list ?? []
        setSystemOpts(list.map((s) => ({ id: s.id, name: s.sys_nm })))
      })
      .catch(() => {})
  }, [])

  // Load functions when a project is selected
  useEffect(() => {
    if (!selectedProject) return
    if (functionsMap[selectedProject]) return  // already cached
    projectApi.functionList(selectedProject, { page: 1, size: 200 })
      .then((res) => {
        type RawFunc = { id: string; function_nm: string; status?: number; requirement_nm?: string; group1?: string; group2?: string; expected_start_date?: string; expected_end_date?: string }
        const list = (res.content as { data_list?: RawFunc[] })?.data_list ?? []
        setFunctionsMap((prev) => ({
          ...prev,
          [selectedProject]: list
            .filter((f) => f.status != null && ![0, 4, 9].includes(f.status!))
            .map((f) => ({
              id: f.id, name: f.function_nm,
              requirement_nm: f.requirement_nm || undefined,
              group1: f.group1, group2: f.group2,
              expected_start_date: f.expected_start_date,
              expected_end_date: f.expected_end_date,
            })),
        }))
      })
      .catch(() => {})
  }, [selectedProject]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load system duties when a system is selected
  useEffect(() => {
    if (!selectedSystem) return
    if (systemDutiesMap[selectedSystem]) return
    dutyApi.list({ page: 1, size: 200, system_id: selectedSystem })
      .then((res) => {
        const list = (res.content as { data_list?: { id: string; duty_nm: string; status?: number; requirement_nm?: string; group?: string; expected_start_date?: string; expected_end_date?: string }[] })?.data_list ?? []
        setSystemDutiesMap((prev) => ({
          ...prev,
          [selectedSystem]: list
            .filter((d) => d.status != null && ![0, 3, 8, 9].includes(d.status!))
            .map((d) => ({
              id: d.id, name: d.duty_nm,
              requirement_nm: d.requirement_nm || undefined,
              group: d.group || undefined,
              expected_start_date: d.expected_start_date || undefined,
              expected_end_date: d.expected_end_date || undefined,
            })),
        }))
      })
      .catch(() => {})
  }, [selectedSystem]) // eslint-disable-line react-hooks/exhaustive-deps

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
        // 记录后端已保存的 entry IDs
        const todayLog = incoming[startStr]
        if (todayLog) {
          setSavedEntryIds(new Set(todayLog.entries.map((e) => e.entry_id)))
        }

        // In day view: always fetch fresh suggest entries into separate state.
        // Suggest entries are NEVER written to the DB — only manually added/edited
        // entries are persisted. This ensures the latest task progress always shows.
        if (viewMode === 'day') {
          dailyLogApi.suggest(startStr)
            .then((suggestRes) => {
              const items = suggestRes.content ?? []
              const freshEntries: DailyLogEntry[] = items.map((item, i) => ({
                entry_id:      `suggest-${startStr}-${i}`,
                work_category: (item.task_type === 'duty' ? (item.system_nm ? 'system_req' : 'duty') : 'project') as DailyLogEntry['work_category'],
                project_id:    item.task_type === 'project' ? (item.project_id || undefined) : undefined,
                function_id:   item.task_type === 'project' ? item.task_id : undefined,
                function_nm:   item.task_type === 'project' ? item.task_nm : undefined,
                duty_id:       item.task_type === 'duty' ? item.task_id : undefined,
                duty_nm:       item.task_type === 'duty' ? item.task_nm : undefined,
                system_nm:      item.task_type === 'duty' ? (item.system_nm || undefined) : undefined,
                requirement_nm: item.requirement_nm || undefined,
                project_nm:     item.project_nm ?? undefined,
                group1:               item.group1 || undefined,
                group2:               item.group2 || undefined,
                expected_start_date:  item.expected_start_date || undefined,
                expected_end_date:    item.expected_end_date || undefined,
                description:          item.description,
                hours:         item.work_hours || 0,
                progress:      item.progress,
                is_overtime:   item.is_overtime ?? false,
                overtime_hours: item.overtime_hours ?? 0,
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
  }, [currentDate, viewMode, logsRefreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
  const isReadOnly = currentLog?.status === 'submitted' || currentLog?.status === 'confirmed'
  const displayEntries = useMemo(() => {
    const promotedSuggestIds = new Set(
      (currentLog?.entries ?? []).map((e) => e.suggest_id).filter(Boolean) as string[],
    )
    const dismissedIds = getDismissedIds(dateStr)
    const dedupedSuggest = suggestEntries.filter(
      (e) => !e.suggest_id || (!promotedSuggestIds.has(e.suggest_id) && !dismissedIds.has(e.suggest_id))
    )
    return [...(currentLog?.entries ?? []), ...dedupedSuggest]
  }, [currentLog, suggestEntries, dateStr, dismissedVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  // 已提交日报中待追加的条目数量（suggest entries + 手动追加的新条目）
  const pendingAppendCount = useMemo(() => {
    if (!isReadOnly) return 0
    return displayEntries.filter((e) => !savedEntryIds.has(e.entry_id)).length
  }, [isReadOnly, displayEntries, savedEntryIds])

  const dayWorkEntries = displayEntries.filter((e) => e.work_category !== 'leave')
  const dayLeaveHours = displayEntries.filter((e) => e.work_category === 'leave').reduce((s, e) => s + e.hours, 0)
  const totalHours = dayWorkEntries.reduce((s, e) => s + e.hours, 0)
  const overtimeHours = dayWorkEntries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)

  const sufficiencyPct = Math.round(((totalHours + dayLeaveHours) / STANDARD_DAILY_HOURS) * 100)

  // Reset text editor init flag when date changes
  useEffect(() => { setTextEditorInited(false) }, [currentDate])

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
    if (viewMode === 'day') return currentDate.format(t('dailyLog.dateFmtDay'))
    if (viewMode === 'week') {
      const ws = currentDate.startOf('isoWeek')
      return `${ws.format('MM/DD')} — ${ws.add(6, 'day').format('MM/DD')} (${ws.format('YYYY')} W${currentDate.isoWeek()})`
    }
    if (viewMode === 'month') return currentDate.format(t('dailyLog.dateFmtMonth'))
    if (viewMode === 'quarter') {
      const q = Math.ceil((currentDate.month() + 1) / 3)
      return t('dailyLog.dateFmtQuarter', { year: currentDate.format('YYYY'), quarter: q })
    }
    return currentDate.format(t('dailyLog.dateFmtYear'))
  }, [currentDate, viewMode, t])

  // Open add/edit modal
  const openEntryModal = (entry?: DailyLogEntry) => {
    if (entry) {
      setEditingEntry(entry)
      const projId = entry.project_id ?? null
      setSelectedProject(projId)
      // Ensure the project option is present (e.g. from a progress-synced entry)
      if (projId && entry.project_nm) {
        setProjectOpts((prev) =>
          prev.some((p) => p.id === projId)
            ? prev
            : [...prev, { id: projId, name: entry.project_nm! }]
        )
      }
      // Eagerly load function list if not yet cached (needed for suggest entries)
      const ensureFuncOption = () => {
        if (entry.function_id && entry.function_nm && projId) {
          setFunctionsMap((prev) => {
            const list = prev[projId] ?? []
            return list.some((f) => f.id === entry.function_id)
              ? prev
              : { ...prev, [projId]: [...list, { id: entry.function_id!, name: entry.function_nm! }] }
          })
        }
      }
      if (projId && !functionsMap[projId]) {
        projectApi.functionList(projId, { page: 1, size: 200 })
          .then((res) => {
            type RawFunc = { id: string; function_nm: string; status?: number; end_time?: string; group1?: string; group2?: string; expected_start_date?: string; expected_end_date?: string }
            const list = (res.content as { data_list?: RawFunc[] })?.data_list ?? []
            setFunctionsMap((prev) => ({
              ...prev,
              [projId]: list
                .filter((f) => f.status != null && ![0, 4, 9].includes(f.status!))
                .map((f) => ({
                  id: f.id, name: f.function_nm,
                  group1: f.group1, group2: f.group2,
                  expected_start_date: f.expected_start_date,
                  expected_end_date: f.expected_end_date,
                })),
            }))
            ensureFuncOption()
          })
          .catch(() => {})
      } else {
        ensureFuncOption()
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
      // For system_req entries, restore selectedSystem so the duty dropdown
      // is enabled and its options are loaded.
      let restoredSysId: string | null = null
      if (entry.work_category === 'system_req' && entry.system_nm) {
        const sys = systemOpts.find((s) => s.name === entry.system_nm)
        restoredSysId = sys?.id ?? null
        if (restoredSysId) {
          setSelectedSystem(restoredSysId)
          // Ensure the duty is present in the system duties map as a fallback
          // in case it has a status that was filtered out on initial load
          if (entry.duty_id && entry.duty_nm) {
            setSystemDutiesMap((prev) => {
              const existing = prev[restoredSysId!] ?? []
              if (existing.some((d) => d.id === entry.duty_id)) return prev
              return { ...prev, [restoredSysId!]: [...existing, { id: entry.duty_id!, name: entry.duty_nm! }] }
            })
          }
        }
      }
      form.setFieldsValue({
        work_category: entry.work_category,
        system_id: restoredSysId,
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
      if (department) form.setFieldsValue({ bu_unit: department })
    }
    setFileList([])
    setSyncProgress(true)
    if (!entry || entry.work_category !== 'system_req') {
      setSelectedSystem(null)
    }
    // For non-progress entries, load existing files into editable state
    const entryFiles = (entry?.files ?? [])
    setExistingFiles(entry?.source !== 'progress' ? entryFiles : [])
    setModalOpen(true)
  }

  // Save entry
  const handleSaveEntry = async (values: Record<string, unknown>) => {
    const cat = values.work_category as WorkCategory

    // ── 休假批量填写 ─────────────────────────────────────────────
    if (cat === 'leave' && values.leave_range) {
      const [startDay, endDay] = values.leave_range as [dayjs.Dayjs, dayjs.Dayjs]
      if (startDay && endDay) {
        setSaving(true)
        try {
          const defaultHours = (values.hours as number) ?? 8
          const overrides = (values.leave_day_hours as Record<string, number>) ?? {}
          const desc = (values.description as string) || t('dailyLog.leaveDefault')

          // Collect workdays from the date range
          const workdays: string[] = []
          let cur = startDay.startOf('day')
          while (cur.isBefore(endDay) || cur.isSame(endDay, 'day')) {
            if (cur.day() !== 0 && cur.day() !== 6) workdays.push(cur.format('YYYY-MM-DD'))
            cur = cur.add(1, 'day')
          }

          for (const d of workdays) {
            const hours = overrides[d] ?? defaultHours
            const prevLog = logs[d] ?? { log_id: `log-${d}`, work_no: workNo, log_date: d, entries: [], total_hours: 0, overtime_hours: 0, status: 'draft' as const }
            const hasLeave = prevLog.entries.some((e) => e.work_category === 'leave')
            if (!hasLeave) {
              const leaveEntry: DailyLogEntry = {
                entry_id: `e-${Date.now()}-${d}`,
                work_category: 'leave',
                description: desc,
                hours,
                  is_overtime: false,
                  overtime_hours: 0,
                  source: 'manual',
                  record_time: dayjs().format('HH:mm'),
                }
                const newEntries = [...prevLog.entries, leaveEntry]
                const newTotal = newEntries.reduce((s, e) => s + e.hours, 0)
                // 休假满8小时的日自动标记为已提交
                const autoSubmit = hours >= 8
                const newStatus = autoSubmit ? 'submitted' as const : prevLog.status
                setLogs((p) => ({ ...p, [d]: { ...prevLog, entries: newEntries, total_hours: newTotal, status: newStatus } }))
                // Persist to backend
                const hasRealId = !!(prevLog.log_id && !prevLog.log_id.startsWith('log-'))
                const payload = entriesToPayload(newEntries, d)
                if (hasRealId) {
                  await dailyLogApi.update(prevLog.log_id!, { task_items: payload.task_items, free_items: payload.free_items, ...(autoSubmit ? { status: 2 } : {}) }).catch(() => {})
                } else {
                  const createPayload = { ...payload, ...(autoSubmit ? { status: 2 as const } : {}) }
                  const res = await dailyLogApi.create(createPayload).catch(() => null)
                  if (res?.content?.log_id) {
                    setLogs((p) => ({ ...p, [d]: { ...p[d], log_id: res.content!.log_id } }))
                  }
                }
              }
            }
          showToast.success(t('dailyLog.leaveFilled', { start: startDay.format('MM/DD'), end: endDay.format('MM/DD') }))
        } catch { showToast.error(t('common.error')) }
        finally { setSaving(false); setModalOpen(false); form.resetFields() }
        return
      }
    }

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
        group1: selectedFunc?.group1 ?? (cat !== 'project' ? (dutyOpts.find((d) => d.id === dutyId) ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId))?.group : undefined) ?? editingEntry?.group1,
        group2: selectedFunc?.group2 ?? editingEntry?.group2,
        duty_id: dutyId, duty_nm: dutyOpts.find((d) => d.id === dutyId)?.name ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId)?.name ?? editingEntry?.duty_nm,
        system_nm: cat === 'system_req' ? (systemOpts.find((s) => s.id === selectedSystem)?.name ?? editingEntry?.system_nm) : undefined,
        requirement_nm: cat === 'project'
          ? (selectedFunc?.requirement_nm ?? editingEntry?.requirement_nm)
          : ((dutyOpts.find((d) => d.id === dutyId) ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId))?.requirement_nm ?? editingEntry?.requirement_nm),
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
      group1: selectedFunc?.group1 ?? (cat !== 'project' ? (dutyOpts.find((d) => d.id === dutyId) ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId))?.group : undefined) ?? editingEntry?.group1,
      group2: selectedFunc?.group2 ?? editingEntry?.group2,
      duty_id: dutyId, duty_nm: dutyOpts.find((d) => d.id === dutyId)?.name ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId)?.name ?? editingEntry?.duty_nm,
      system_nm: cat === 'system_req' ? (systemOpts.find((s) => s.id === selectedSystem)?.name ?? editingEntry?.system_nm) : undefined,
      requirement_nm: cat === 'project'
        ? (selectedFunc?.requirement_nm ?? editingEntry?.requirement_nm)
        : ((dutyOpts.find((d) => d.id === dutyId) ?? Object.values(systemDutiesMap).flat().find((d) => d.id === dutyId))?.requirement_nm ?? editingEntry?.requirement_nm),
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

    // 已提交日報的追加模式：不立即保存到後端，等用戶點「追加提交」
    if (logId && !isReadOnly) {
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
      }).then(() => {
        // 删除条目后回滚关联任务的进度
        if (target?.function_id) {
          dailyLogApi.revertTaskProgress('project', target.function_id).catch(() => {})
        } else if (target?.duty_id) {
          dailyLogApi.revertTaskProgress('duty', target.duty_id).catch(() => {})
        }
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
    setTimeout(() => setLogsRefreshKey((v) => v + 1), 300)
  }

  // 追加提交（已提交日報追加新條目）
  const handleAppendSubmit = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logId = (currentLog as any)?.log_id as string | undefined
    if (!logId || logId.startsWith('log-')) return
    const payload = entriesToPayload(displayEntries, dateStr)
    dailyLogApi.update(logId, {
      task_items: payload.task_items,
      free_items: payload.free_items,
    }).then(() => {
      // 同步追加條目中的任務進度
      const newSuggestEntries = displayEntries.filter((e) => e.entry_id.startsWith('suggest-'))
      for (const entry of newSuggestEntries) {
        if (typeof entry.progress === 'number') {
          const taskId = entry.function_id ?? entry.duty_id
          const taskType = entry.function_id ? 'project' : 'duty'
          if (taskId) dailyLogApi.syncTaskProgress(taskType as 'project' | 'duty', taskId, entry.progress).catch(() => {})
        }
      }
      showToast.success(t('dailyLog.appendSubmitSuccess'))
    }).catch(() => {})
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
      },
    }))
    setTimeout(() => setLogsRefreshKey((v) => v + 1), 300)
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
    { key: 'today',   label: t('dailyLog.exportToday') },
    { key: 'week',    label: t('dailyLog.exportWeek') },
    { key: 'month',   label: t('dailyLog.exportMonth') },
    { key: 'quarter', label: t('dailyLog.exportQuarter') },
    { key: 'year',    label: t('dailyLog.exportYear') },
    { type: 'divider' as const },
    { key: 'last1m',  label: t('dailyLog.exportLast1m') },
    { key: 'last6m',  label: t('dailyLog.exportLast6m') },
    { key: 'last1y',  label: t('dailyLog.exportLast1y') },
    { type: 'divider' as const },
    { key: 'custom',  label: t('dailyLog.exportCustom') },
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
      {currentLog.status === 'confirmed' ? t('dailyLog.statusConfirmed') : currentLog.status === 'submitted' ? t('dailyLog.statusSubmitted') : t('dailyLog.statusDraft')}
    </Tag>
  ) : (
    <Tag color="error" style={{ fontSize: 11 }}>{t('dailyLog.statusNotFilled')}</Tag>
  )

  return (
    <Spin spinning={logsLoading} tip={t('common.loading')} size="large">
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('dailyLog.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('dailyLog.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'day' && currentLog && (
            <Button
              icon={<ArrowDownTrayIcon className="w-4 h-4" />}
              size="small"
              loading={exportingDocx}
              onClick={handleExportDailyDocx}
            >
              {t('dailyLog.exportDailyReport')}
            </Button>
          )}
          <Dropdown
            menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}
            disabled={rangeExportLoading}
            trigger={['click']}
          >
            <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} size="small" loading={rangeExportLoading}>
              {t('dailyLog.exportReport')}
            </Button>
          </Dropdown>
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} size="small" onClick={handleExport}>
            {t('dailyLog.exportCsv')}
          </Button>
          <Segmented
            value={viewMode}
            onChange={(v) => setViewMode(v as ViewMode)}
            options={[
              { label: t('dailyLog.viewDay'), value: 'day' },
              { label: t('dailyLog.viewWeek'), value: 'week' },
              { label: t('dailyLog.viewMonth'), value: 'month' },
              { label: t('dailyLog.viewQuarter'), value: 'quarter' },
              { label: t('dailyLog.viewYear'), value: 'year' },
              { label: t('dailyLog.viewText'), value: 'text' },
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
              <span className="text-sm font-semibold text-amber-800">{t('dailyLog.managerSettings')}</span>
              <Tag color="gold" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>{t('dailyLog.managerLevel')}</Tag>
            </div>
            <p className="text-xs text-amber-600 mt-0.5">
              {t('dailyLog.managerSettingsDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-amber-700 font-medium">{dailyLogOptOut ? t('dailyLog.logDisabled') : t('dailyLog.logEnabled')}</span>
            <Switch
              checked={!dailyLogOptOut}
              onChange={(checked) => setDailyLogOptOut(!checked)}
              checkedChildren={t('common.enabled')}
              unCheckedChildren={t('dailyLog.switchOff')}
            />
          </div>
        </div>
      )}

      {/* Opt-out notice */}
      {isManager && dailyLogOptOut && (
        <Alert
          message={t('dailyLog.optOutMessage')}
          description={t('dailyLog.optOutDescription')}
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
        <Button size="small" onClick={goToday} className="text-xs">{t('dailyLog.today')}</Button>
        <Button icon={<ChevronRightIcon className="w-4 h-4" />} type="text" size="small" onClick={() => navigate(1)} />
      </div>

      {/* ─── Day View ──────────────────────────────────────────────── */}
      {viewMode === 'day' && (
        <>
          {/* Daily hours summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { label: t('dailyLog.todayTotalHours'), value: `${fmtH(totalHours)}`, unit: `/ ${STANDARD_DAILY_HOURS}h`, color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
              { label: t('dailyLog.normalHours'),     value: `${fmtH(totalHours - overtimeHours)}`, unit: 'h', color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
              { label: t('dailyLog.overtimeHoursLabel'), value: `${fmtH(overtimeHours)}`, unit: 'h', color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
              ...(dayLeaveHours > 0 ? [{ label: t('dailyLog.leaveHoursLabel'), value: `${fmtH(dayLeaveHours)}`, unit: 'h', color: '#10b981', bg: '#ecfdf5', icon: <SunIcon className="w-4 h-4 text-emerald-500" /> }] : []),
              { label: t('dailyLog.sufficiencyRate'), value: `${sufficiencyPct}`, unit: '%', color: sufficiencyPct >= 100 ? '#16a34a' : sufficiencyPct >= 75 ? '#d97706' : '#dc2626', bg: '#f8fafc', icon: <CalendarDaysIcon className="w-4 h-4 text-slate-500" /> },
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
            <span className="text-sm font-semibold text-slate-700">{t('dailyLog.entries')}</span>
            <Badge count={displayEntries.length} color="#2563eb" />
            {dismissedSuggestCount > 0 && (
              <Popover
                trigger="click"
                placement="bottomLeft"
                title={<span className="text-xs font-semibold text-slate-600">{t('dailyLog.hiddenProgress', { count: dismissedSuggestCount })}</span>}
                content={
                  <div className="w-72 max-h-64 overflow-y-auto">
                    {dismissedSuggestEntries.map((e) => (
                      <div key={e.suggest_id} className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">
                            {e.function_nm ?? e.duty_nm ?? t('dailyLog.unknownTask')}
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
                          {t('dailyLog.restore')}
                        </button>
                      </div>
                    ))}
                    {dismissedSuggestEntries.length > 1 && (
                      <button
                        className="w-full text-[11px] text-slate-400 hover:text-blue-600 border-0 outline-none bg-transparent p-0 pt-2 cursor-pointer text-center"
                        onClick={() => { clearDismissedIds(dateStr); setDismissedVersion((v) => v + 1) }}
                      >
                        {t('dailyLog.restoreAll')}
                      </button>
                    )}
                  </div>
                }
              >
                <button className="text-[11px] text-slate-400 hover:text-blue-600 underline underline-offset-2 cursor-pointer border-0 outline-none bg-transparent p-0">
                  {t('dailyLog.nProgressHidden', { count: dismissedSuggestCount })}
                </button>
              </Popover>
            )}
            {!isReadOnly ? (
              <Button type="primary" size="small" icon={<PlusIcon className="w-4 h-4" />}
                style={{ background: '#2563eb' }} className="ml-auto" onClick={() => openEntryModal()}>
                {t('dailyLog.addEntry')}
              </Button>
            ) : (
              <div className="ml-auto flex items-center gap-2">
                {pendingAppendCount > 0 && (
                  <span className="text-xs text-orange-500">{t('dailyLog.pendingSuggest', { count: pendingAppendCount })}</span>
                )}
                <Button size="small" icon={<PlusIcon className="w-4 h-4" />}
                  onClick={() => openEntryModal()}
                  style={{ borderColor: '#d97706', color: '#d97706' }}>
                  {t('dailyLog.appendEntry')}
                </Button>
              </div>
            )}
          </div>

          {/* Entries */}
          <div className="mb-5">
            {displayEntries.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm py-10 flex flex-col items-center gap-3">
                <Empty description={t('dailyLog.noEntriesToday')} />
                {!isReadOnly && (
                  <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                    style={{ background: '#2563eb' }} onClick={() => openEntryModal()}>
                    {t('dailyLog.addFirstEntry')}
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
                          {t(CATEGORY_LABEL_KEYS[section.category])}
                        </Tag>
                        {['project', 'system_req', 'duty'].includes(section.category)
                          ? <span className="text-xs text-slate-400">{t('dailyLog.nTasks', { count: countTasks(section.projectGroups) })}</span>
                          : <span className="text-xs text-slate-400">{t('dailyLog.nRecords', { count: countEntries(section.projectGroups) })}</span>
                        }
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
                            const projKey = `day::${section.category}::proj::${pg.projKey}`
                            const projCollapsed = collapsedDayGroups.has(projKey)
                            return (
                            <div key={pg.projKey}>
                              {/* ── Project / System sub-header ── */}
                              {pg.projNm && (
                                <button type="button"
                                  className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none text-left cursor-pointer hover:brightness-95 transition-all"
                                  style={{ background: section.color + '08', borderTop: pgIdx > 0 ? `1px solid ${section.color}20` : undefined, borderBottom: `1px solid ${section.color}20` }}
                                  onClick={() => toggleDayGroup(projKey)}>
                                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                  {pg.linkUrl
                                    ? <span className="text-sm font-bold text-blue-600 hover:underline truncate" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); window.open(pg.linkUrl!, '_blank') }}>{pg.projNm}</span>
                                    : <span className="text-sm font-bold text-slate-800 truncate">{pg.projNm}</span>
                                  }
                                  <span className="flex-1" />
                                  <span className="text-xs text-slate-400 mr-1 flex-shrink-0">{t('dailyLog.nTasks', { count: countTasks([pg]) })}</span>
                                  <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: section.color }}>{fmtH(pg.totalHours)}h</span>
                                  <ChevronDownIcon className="w-3.5 h-3.5 ml-1 transition-transform duration-150 flex-shrink-0" style={{ color: section.color, transform: projCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                </button>
                              )}

                              {(!pg.projNm || !projCollapsed) && (
                              <div className={pg.projNm ? 'pl-3' : ''}>
                                {pg.requirements.map((req, rIdx) => {
                                  const reqCKey = `${projKey}::req::${req.reqKey}`
                                  const reqCollapsed = collapsedDayGroups.has(reqCKey)
                                  return (
                                  <div key={req.reqKey} style={{ borderTop: rIdx > 0 && !pg.projNm ? '1px solid #f1f5f9' : undefined }}>

                                    {/* ── Requirement sub-header ── */}
                                    {req.reqNm && (
                                      <button type="button"
                                        className="w-full flex items-center gap-2 px-4 py-2 border-0 outline-none text-left cursor-pointer hover:brightness-95 transition-all"
                                        style={{ background: '#eff6ff', borderTop: rIdx > 0 ? `1px solid ${section.color}18` : undefined, borderBottom: `1px solid ${section.color}18` }}
                                        onClick={() => toggleDayGroup(reqCKey)}>
                                        <div className="w-1 h-3.5 rounded-full flex-shrink-0 bg-blue-400" />
                                        <span className="text-[11px] font-semibold text-blue-600 flex-1 min-w-0">{req.reqNm}</span>
                                        <span className="text-[10px] text-slate-400 mr-1">{t('dailyLog.nTasks', { count: req.groups.flatMap((g) => g.tasks).length })}</span>
                                        <span className="text-[10px] font-semibold text-blue-500">{fmtH(req.totalHours)}h</span>
                                        <ChevronDownIcon className="w-3 h-3 ml-1 text-blue-400 transition-transform duration-150 flex-shrink-0" style={{ transform: reqCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                      </button>
                                    )}

                                    {(!req.reqNm || !reqCollapsed) && (
                                    <div className={req.reqNm ? 'pl-3' : ''}>
                                      {req.groups.map((group, gIdx) => {
                                        const grpCKey = `${reqCKey}::grp::${group.groupKey}`
                                        const grpCollapsed = collapsedDayGroups.has(grpCKey)
                                        return (
                                        <div key={group.groupKey} style={{ borderTop: gIdx > 0 ? '1px solid #f1f5f9' : undefined }}>

                                          {/* ── Group sub-header ── */}
                                          {group.groupNm && (
                                            <button type="button"
                                              className="w-full flex items-center gap-2 px-4 py-1.5 border-0 outline-none text-left cursor-pointer hover:bg-slate-100/60 transition-all"
                                              style={{ background: '#f8fafc', borderTop: gIdx > 0 ? '1px solid #e2e8f0' : undefined, borderBottom: '1px solid #e2e8f0' }}
                                              onClick={() => toggleDayGroup(grpCKey)}>
                                              <div className="w-0.5 h-3 rounded-full flex-shrink-0 bg-slate-400" />
                                              <span className="text-[11px] font-medium text-slate-600 flex-1 min-w-0">{group.groupNm}</span>
                                              <span className="text-[10px] text-slate-400 mr-1">{t('dailyLog.nTasks', { count: group.tasks.length })}</span>
                                              <span className="text-[10px] font-medium text-slate-500">{fmtH(group.totalHours)}h</span>
                                              <ChevronDownIcon className="w-3 h-3 ml-1 text-slate-400 transition-transform duration-150 flex-shrink-0" style={{ transform: grpCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                                            </button>
                                          )}

                                          {(!group.groupNm || !grpCollapsed) && (
                                          <div className={group.groupNm ? 'pl-3' : ''}>
                                            {group.tasks.map((task, tIdx) => {
                                              const taskCKey = `${grpCKey}::task::${task.taskKey}`
                                              const taskCollapsed = collapsedDayGroups.has(taskCKey)
                                              return (
                                              <div key={task.taskKey} style={{ borderTop: tIdx > 0 ? '1px solid #f1f5f9' : undefined }}>

                                                {/* ── Task sub-header ── */}
                                                {task.taskNm && (
                                                  <div className="flex items-center gap-2 px-4 py-2 bg-slate-50/60 group/task">
                                                    <button type="button"
                                                      className="flex-1 min-w-0 flex items-center gap-2 border-0 outline-none bg-transparent cursor-pointer text-left p-0"
                                                      onClick={() => toggleDayGroup(taskCKey)}>
                                                      <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: section.color }} />
                                                      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                                                        <span className="text-sm font-semibold text-slate-700">{task.taskNm}</span>
                                                        {(section.category === 'project' || section.category === 'duty' || section.category === 'system_req') && (() => {
                                                          const stateProgress = taskProgressState[`${dateStr}-${task.taskKey}`]
                                                          if (typeof stateProgress === 'number') {
                                                            return <Tag color="blue" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0 }}>{stateProgress}%</Tag>
                                                          }
                                                          const myEntries = task.entries.filter((e) => !e.suggest_submitter)
                                                          const latestProgress =
                                                            [...myEntries].reverse().find((e) => e.progress != null)?.progress
                                                            ?? [...task.entries].reverse().find((e) => e.progress != null)?.progress
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
                                                        title={task.entries.length > 1 ? t('dailyLog.confirmDeleteAllEntries', { count: task.entries.length }) : t('dailyLog.confirmDeleteEntry')}
                                                        onConfirm={() => task.entries.forEach((e) => handleDeleteEntry(e.entry_id))}
                                                        okText={t('common.delete')} cancelText={t('common.cancel')} placement="topRight">
                                                        <Button size="small" type="text" danger
                                                          icon={<TrashIcon className="w-3.5 h-3.5" />}
                                                          className="text-slate-400 hover:!text-red-500 flex-shrink-0 ml-1 opacity-0 group-hover/task:opacity-100 transition-opacity" />
                                                      </Popconfirm>
                                                    )}
                                                  </div>
                                                )}

                                                {/* ── Entries (sorted by record_time asc) ── */}
                                                {(!task.taskNm || !taskCollapsed) && (
                                                <div>
                                                  {[...task.entries].sort((a, b) => (a.record_time ?? '00:00').localeCompare(b.record_time ?? '00:00')).map((entry, idx) => (
                                                    <div key={entry.entry_id}>
                                                      <div className="px-4 py-2 group flex items-center gap-3">
                                                        <div className="flex-1 min-w-0">
                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                            {entry.description
                                                              ? <RichTextContent html={entry.description} onImageClick={(src) => setPreviewFile({ url: src, name: src.split('/').pop()?.split('?')[0] ?? 'image.png' })} />
                                                              : <span className="text-slate-300 italic text-sm">{t('dailyLog.noDescription')}</span>}
                                                            {entry.suggest_submitter && (
                                                              <Tag color="purple" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                                                {t('dailyLog.submittedBy', { name: toName(entry.suggest_submitter) || entry.suggest_submitter })}
                                                              </Tag>
                                                            )}
                                                          </div>
                                                          {entry.files && entry.files.length > 0 && (
                                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                              {entry.files.map((f, fi) => {
                                                                const token = tokenStorage.get()
                                                                const previewUrl = token ? `${f.url}?token=${token}` : f.url
                                                                return (
                                                                  <button key={fi} onClick={() => setPreviewFile({ url: previewUrl, name: f.name })}
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
                                                            <span className="flex items-center gap-0.5 text-sm font-semibold" style={{ color: entry.is_overtime ? '#d97706' : section.color }}>
                                                              <ClockIcon className="w-4 h-4" />{fmtH(entry.hours)}h
                                                            </span>
                                                            {entry.is_overtime && <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dailyLog.overtime')}{fmtH(entry.overtime_hours ?? entry.hours)}h</Tag>}
                                                            <span className="text-xs text-slate-400 tabular-nums">{entry.record_time ?? '—'}</span>
                                                            {entry.source === 'updated' && <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dailyLog.sourceUpdated')}</Tag>}
                                                            {entry.source === 'manual' && <Tag color="green" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dailyLog.sourceManual')}</Tag>}
                                                          </div>
                                                          {(() => {
                                                            const isSuggest = entry.entry_id.startsWith('suggest-')
                                                            const isNewAppend = isReadOnly && !isSuggest && !savedEntryIds.has(entry.entry_id)
                                                            if (!isReadOnly || isSuggest || isNewAppend) return (
                                                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                              <Button size="small" type="text" icon={<PencilSquareIcon className="w-3.5 h-3.5" />}
                                                                className="text-slate-400 hover:!text-blue-500 !h-6 !w-6 !p-0 !min-w-0"
                                                                onClick={() => openEntryModal(entry)} />
                                                              {isSuggest ? (
                                                                <Button size="small" type="text" className="text-slate-300 hover:!text-slate-500 !h-6 !w-6 !p-0 !min-w-0"
                                                                  onClick={() => { addDismissedId(dateStr, entry.suggest_id ?? entry.entry_id); setDismissedVersion((v) => v + 1) }}>
                                                                  <XMarkIcon className="w-3.5 h-3.5" />
                                                                </Button>
                                                              ) : (
                                                                <Popconfirm title={t('dailyLog.confirmDeleteEntry')} onConfirm={() => handleDeleteEntry(entry.entry_id)}
                                                                  okText={t('common.delete')} cancelText={t('common.cancel')} placement="topRight">
                                                                  <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                                                                    className="text-slate-400 hover:!text-red-500 !h-6 !w-6 !p-0 !min-w-0" />
                                                                </Popconfirm>
                                                              )}
                                                            </div>
                                                            )
                                                            return null
                                                          })()}
                                                        </div>
                                                      </div>
                                                      {idx < task.entries.length - 1 && <div style={{ height: '1px', background: '#e2e8f0', margin: '0 16px' }} />}
                                                    </div>
                                                  ))}
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
              <Popconfirm title={t('dailyLog.confirmSubmit')} onConfirm={handleSubmit} okText={t('dailyLog.confirmSubmitOk')} cancelText={t('common.cancel')}>
                <Button type="primary" icon={<ArrowUpTrayIcon className="w-4 h-4" />} size="large"
                  style={{ background: '#2563eb', borderRadius: 10, height: 42 }}>
                  {t('dailyLog.submitLog')}
                </Button>
              </Popconfirm>
            </div>
          )}
          {isReadOnly && pendingAppendCount > 0 && (
            <div className="flex justify-end gap-3">
              <Popconfirm title={t('dailyLog.confirmAppendSubmit')} onConfirm={handleAppendSubmit} okText={t('dailyLog.confirmSubmitOk')} cancelText={t('common.cancel')}>
                <Button type="primary" icon={<ArrowUpTrayIcon className="w-4 h-4" />} size="large"
                  style={{ background: '#d97706', borderRadius: 10, height: 42 }}>
                  {t('dailyLog.appendSubmit', { count: pendingAppendCount })}
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

      {/* ─── Text Editor View ────────────────────────────────────── */}
      {viewMode === 'text' && (() => {
        const cacheKey = `dailylog_text_${currentDate.format('YYYY-MM-DD')}`
        // Generate text from current day's entries
        const generateText = () => {
          const dateStr = currentDate.format('YYYY-MM-DD')
          const dayLog = logs[dateStr]
          if (!dayLog || dayLog.entries.length === 0) return `${dateStr}\n\n${t('dailyLog.noEntries')}`
          const lines: string[] = [`${dateStr}\n`]
          let idx = 0
          const entries = dayLog.entries
          // Group project entries by project
          const projMap = new Map<string, DailyLogEntry[]>()
          // Group system entries by system
          const sysMap = new Map<string, DailyLogEntry[]>()
          // AR entries
          const arEntries: DailyLogEntry[] = []
          // Other category entries
          const otherEntries: { cat: string; entry: DailyLogEntry }[] = []

          for (const e of entries) {
            if (e.work_category === 'project') {
              const key = e.project_nm || '—'
              if (!projMap.has(key)) projMap.set(key, [])
              projMap.get(key)!.push(e)
            } else if (e.work_category === 'system_req') {
              const key = e.system_nm || '—'
              if (!sysMap.has(key)) sysMap.set(key, [])
              sysMap.get(key)!.push(e)
            } else if (e.work_category === 'duty') {
              arEntries.push(e)
            } else if (e.work_category !== 'leave') {
              otherEntries.push({ cat: e.work_category, entry: e })
            }
          }

          const stripHtml = (s: string) => s?.replace(/<[^>]*>/g, '').trim() || ''

          // Project tasks
          for (const [projNm, pEntries] of projMap) {
            idx++
            lines.push(`${idx}. ${projNm}`)
            for (const e of pEntries) {
              const parts = [e.requirement_nm, e.function_nm].filter(Boolean)
              const desc = stripHtml(e.description)
              lines.push(`   - ${parts.join(' / ')}`)
              if (desc) lines.push(`     ${desc}`)
            }
            lines.push('')
          }

          // System tasks
          for (const [sysNm, sEntries] of sysMap) {
            idx++
            lines.push(`${idx}. ${sysNm}`)
            for (const e of sEntries) {
              const parts = [e.requirement_nm, e.duty_nm].filter(Boolean)
              const desc = stripHtml(e.description)
              lines.push(`   - ${parts.join(' / ')}`)
              if (desc) lines.push(`     ${desc}`)
            }
            lines.push('')
          }

          // AR tasks
          if (arEntries.length > 0) {
            idx++
            lines.push(`${idx}. AR`)
            for (const e of arEntries) {
              const desc = stripHtml(e.description)
              lines.push(`   - ${e.duty_nm || '—'}`)
              if (desc) lines.push(`     ${desc}`)
            }
            lines.push('')
          }

          // Other categories (training, meeting, other)
          const otherByCat = new Map<string, DailyLogEntry[]>()
          for (const { cat, entry } of otherEntries) {
            if (!otherByCat.has(cat)) otherByCat.set(cat, [])
            otherByCat.get(cat)!.push(entry)
          }
          for (const [cat, catEntries] of otherByCat) {
            idx++
            lines.push(`${idx}. ${t(CATEGORY_LABEL_KEYS[cat])}`)
            for (const e of catEntries) {
              const desc = stripHtml(e.description)
              if (desc) lines.push(`   - ${desc}`)
            }
            lines.push('')
          }

          return lines.join('\n')
        }
        // Init from cache or generate
        if (!textEditorInited) {
          const cached = localStorage.getItem(cacheKey)
          setTextEditorContent(cached ?? generateText())
          setTextEditorInited(true)
        }
        const handleTextChange = (val: string) => {
          setTextEditorContent(val)
          localStorage.setItem(cacheKey, val)
        }
        const handleRegenerate = () => {
          const text = generateText()
          setTextEditorContent(text)
          localStorage.setItem(cacheKey, text)
        }
        const handleCopy = () => {
          navigator.clipboard.writeText(textEditorContent).then(() => message.success(t('dailyLog.textCopied')))
        }
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">{t('dailyLog.textEditorTitle')}</span>
              <div className="flex items-center gap-2">
                <Button size="small" onClick={handleRegenerate}>{t('dailyLog.textRegenerate')}</Button>
                <Button size="small" onClick={handleCopy}>{t('dailyLog.textCopy')}</Button>
              </div>
            </div>
            <Input.TextArea
              value={textEditorContent}
              onChange={(e) => handleTextChange(e.target.value)}
              autoSize={{ minRows: 15, maxRows: 40 }}
              className="font-mono text-sm"
              style={{ borderRadius: 10, padding: 16 }}
            />
            <div className="text-xs text-slate-400">{t('dailyLog.textCacheHint')}</div>
          </div>
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
        title={editingEntry ? t('dailyLog.editEntry') : t('dailyLog.addEntryTitle')}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        footer={null}
        width="min(680px, 88vw)"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSaveEntry} className="mt-4">
          {(() => {
            const hasTaskLink = (watchedCategory === 'project' && !!watchedFunctionId) || (watchedCategory === 'duty' && !!watchedDutyId) || (watchedCategory === 'system_req' && !!watchedDutyId)
            return (
              <div className={`grid gap-x-3 ${hasTaskLink ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <Form.Item name="work_category" label={t('dailyLog.workCategory')} rules={[{ required: true, message: t('dailyLog.pleaseSelectCategory') }]}>
                  <Select placeholder={t('dailyLog.selectCategory')} onChange={(v: WorkCategory) => {
                    if (v !== 'project') {
                      form.setFieldsValue({ project_id: undefined, function_id: undefined })
                      setSelectedProject(null)
                    }
                    if (v !== 'duty' && v !== 'system_req') form.setFieldsValue({ duty_id: undefined })
                    if (v !== 'system_req') {
                      form.setFieldsValue({ system_id: undefined })
                      setSelectedSystem(null)
                    }
                  }}>
                    {WORK_CATEGORIES.map((c) => (
                      <Select.Option key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
                          {t(CATEGORY_LABEL_KEYS[c.value])}
                        </div>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item name="hours" label={t('dailyLog.hoursLabel')} rules={[{ required: true, message: t('dailyLog.pleaseInputHours') }]}>
                  <InputNumber min={0.01} max={24} step={0.01} precision={2} style={{ width: '100%' }} suffix="h" />
                </Form.Item>
                {hasTaskLink && (
                  <Form.Item name="progress" label={t('dailyLog.progressLabel')}
                    rules={[{ type: 'number', min: 0, max: 100, message: '0-100' }]}>
                    <InputNumber min={0} max={100} step={1} precision={0} style={{ width: '100%' }} suffix="%" />
                  </Form.Item>
                )}
              </div>
            )
          })()}

          {/* 同步任務進度選項：僅在關聯任務且進度值有變更時顯示 */}
          {(() => {
            const hasTaskLink = (watchedCategory === 'project' && !!watchedFunctionId) || (watchedCategory === 'duty' && !!watchedDutyId) || (watchedCategory === 'system_req' && !!watchedDutyId)
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
                  {t('dailyLog.syncProgressTo')} <span className="font-semibold">{watchedProgress}%</span>
                </label>
              </div>
            )
          })()}

          {watchedCategory === 'project' && (
            <>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="project_id" label={t('dailyLog.relatedProject')} rules={[{ required: true, message: t('dailyLog.pleaseSelectProject') }]}>
                  <Select placeholder={t('dailyLog.selectProject')} allowClear onChange={(v: string) => {
                    setSelectedProject(v)
                    setSelectedFuncReq(undefined); setSelectedFuncGrp(undefined)
                    form.setFieldsValue({ function_id: undefined })
                  }}>
                    {projectOpts.map((p) => (
                      <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <div className="grid grid-cols-2 gap-x-2">
                  <Form.Item label={t('requirement.name')}>
                    <Select placeholder={t('common.all')} allowClear value={selectedFuncReq} disabled={!selectedProject}
                      onChange={(v) => { setSelectedFuncReq(v); setSelectedFuncGrp(undefined); form.setFieldsValue({ function_id: undefined }) }}
                      options={funcReqOpts} />
                  </Form.Item>
                  <Form.Item label={t('function.group')}>
                    <Select placeholder={t('common.all')} allowClear value={selectedFuncGrp} disabled={!selectedProject}
                      onChange={(v) => { setSelectedFuncGrp(v); form.setFieldsValue({ function_id: undefined }) }}
                      options={funcGrpOpts} />
                  </Form.Item>
                </div>
              </div>
              <Form.Item name="function_id" label={t('dailyLog.relatedTask')}>
                <Select
                  placeholder={t('dailyLog.selectFunction')} allowClear disabled={!selectedProject}
                  optionLabelProp="label" showSearch optionFilterProp="label"
                  dropdownStyle={{ minWidth: 320 }}
                >
                  {filteredFuncOpts.map((f) => (
                    <Select.Option key={f.id} value={f.id} label={f.name}>
                      <div className="py-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {f.requirement_nm && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-px leading-none flex-shrink-0">{f.requirement_nm}</span>
                          )}
                          {f.group1 && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-px leading-none flex-shrink-0">{formatGroupName(f.group1) || f.group1}</span>
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
            </>
          )}
          {watchedCategory === 'duty' && (
            <Form.Item name="duty_id" label={t('dailyLog.relatedAR')} rules={[{ required: true, message: t('dailyLog.pleaseSelectTask') }]}>
              <Select placeholder={t('dailyLog.selectAR')} allowClear showSearch optionLabelProp="label" dropdownStyle={{ minWidth: 300 }}>
                {dutyOpts.map((d) => (
                  <Select.Option key={d.id} value={d.id} label={d.name}>
                    <div className="py-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {d.system_nm && (
                          <span className="text-[10px] bg-cyan-50 text-cyan-600 border border-cyan-200 rounded px-1.5 py-px leading-none flex-shrink-0">{d.system_nm}</span>
                        )}
                        {d.group && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-px leading-none flex-shrink-0">{formatGroupName(d.group) || d.group}</span>
                        )}
                        <span className="text-sm text-slate-800 font-medium">{d.name}</span>
                      </div>
                      {(d.expected_start_date || d.expected_end_date) && (
                        <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                          {d.expected_start_date ?? '—'} ~ {d.expected_end_date ?? '—'}
                        </div>
                      )}
                    </div>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {watchedCategory === 'system_req' && (
            <>
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="system_id" label={t('dailyLog.relatedSystem')} rules={[{ required: true, message: t('dailyLog.pleaseSelectSystem') }]}>
                  <Select
                    placeholder={t('dailyLog.selectSystem')} allowClear showSearch optionFilterProp="children"
                    onChange={(v: string) => {
                      setSelectedSystem(v ?? null)
                      setSelectedSysReq(undefined); setSelectedSysGrp(undefined)
                      form.setFieldsValue({ duty_id: undefined })
                    }}
                  >
                    {systemOpts.map((s) => (
                      <Select.Option key={s.id} value={s.id}>{s.name}</Select.Option>
                    ))}
                  </Select>
                </Form.Item>
                <div className="grid grid-cols-2 gap-x-2">
                  <Form.Item label={t('requirement.name')}>
                    <Select placeholder={t('common.all')} allowClear value={selectedSysReq} disabled={!selectedSystem}
                      onChange={(v) => { setSelectedSysReq(v); setSelectedSysGrp(undefined); form.setFieldsValue({ duty_id: undefined }) }}
                      options={sysReqOpts} />
                  </Form.Item>
                  <Form.Item label={t('function.group')}>
                    <Select placeholder={t('common.all')} allowClear value={selectedSysGrp} disabled={!selectedSystem}
                      onChange={(v) => { setSelectedSysGrp(v); form.setFieldsValue({ duty_id: undefined }) }}
                      options={sysGrpOpts} />
                  </Form.Item>
                </div>
              </div>
              <Form.Item name="duty_id" label={t('dailyLog.relatedTask')} rules={[{ required: true, message: t('dailyLog.pleaseSelectTask') }]}>
                <Select
                  placeholder={selectedSystem ? t('dailyLog.selectTask') : t('dailyLog.pleaseSelectSystemFirst')}
                  allowClear showSearch disabled={!selectedSystem}
                  optionLabelProp="label"
                  dropdownStyle={{ minWidth: 280 }}
                >
                  {filteredSysDutyOpts.map((d) => (
                    <Select.Option key={d.id} value={d.id} label={d.name}>
                      <div className="py-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {!d.requirement_nm && (
                            <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 rounded px-1.5 py-px leading-none flex-shrink-0">AR</span>
                          )}
                          {d.requirement_nm && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-px leading-none flex-shrink-0">{d.requirement_nm}</span>
                          )}
                          {d.group && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-px leading-none flex-shrink-0">{formatGroupName(d.group) || d.group}</span>
                          )}
                          <span className="text-sm text-slate-800 font-medium">{d.name}</span>
                        </div>
                        {(d.expected_start_date || d.expected_end_date) && (
                          <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                            {d.expected_start_date ?? '—'} ~ {d.expected_end_date ?? '—'}
                          </div>
                        )}
                      </div>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}

          {watchedCategory === 'leave' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-x-3">
                <Form.Item name="leave_range" label={t('dailyLog.leaveDateRange')}>
                  <DatePicker.RangePicker style={{ width: '100%' }} onChange={() => {
                    // Reset overrides when range changes
                    form.setFieldsValue({ leave_day_hours: {} })
                  }} />
                </Form.Item>
                <Form.Item name="hours" label={t('dailyLog.leaveHoursDefault')} initialValue={8}>
                  <InputNumber min={0.5} max={8} step={0.5} style={{ width: '100%' }} suffix="h" />
                </Form.Item>
              </div>
              {/* Hidden field to store per-day overrides */}
              <Form.Item name="leave_day_hours" hidden><input /></Form.Item>
              <Form.Item noStyle shouldUpdate>
                {({ getFieldValue }) => {
                  const range = getFieldValue('leave_range') as [dayjs.Dayjs, dayjs.Dayjs] | null
                  if (!range?.[0] || !range?.[1]) return null
                  const defaultH = getFieldValue('hours') ?? 8
                  const overrides = (getFieldValue('leave_day_hours') as Record<string, number>) ?? {}
                  // Collect workdays
                  const workdays: string[] = []
                  let c = range[0].startOf('day')
                  while (c.isBefore(range[1]) || c.isSame(range[1], 'day')) {
                    if (c.day() !== 0 && c.day() !== 6) workdays.push(c.format('YYYY-MM-DD'))
                    c = c.add(1, 'day')
                  }
                  // Only show overridden days (different from default)
                  const adjustedDays = workdays.filter((d) => overrides[d] !== undefined && overrides[d] !== defaultH)
                  // Days available to add override (not yet overridden)
                  const availableDays = workdays.filter((d) => overrides[d] === undefined || overrides[d] === defaultH)
                  return (
                    <div className="mt-1">
                      {adjustedDays.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {adjustedDays.map((date) => (
                            <div key={date} className="flex items-center gap-1.5 bg-white rounded-lg px-2.5 py-1 border border-green-200">
                              <span className="text-xs text-slate-600">{date.slice(5)} <span className="text-slate-400">{dayjs(date).format('ddd')}</span></span>
                              <InputNumber size="small" min={0.5} max={8} step={0.5} value={overrides[date]} style={{ width: 60 }}
                                onChange={(v) => {
                                  const next = { ...overrides }
                                  if (v != null && v !== defaultH) next[date] = v
                                  else delete next[date]
                                  form.setFieldsValue({ leave_day_hours: next })
                                }}
                              />
                              <span className="text-[10px] text-slate-400">h</span>
                              <button type="button" className="text-slate-400 hover:text-red-500 text-xs cursor-pointer border-0 bg-transparent p-0"
                                onClick={() => {
                                  const next = { ...overrides }; delete next[date]
                                  form.setFieldsValue({ leave_day_hours: next })
                                }}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {availableDays.length > 0 && (
                        <Dropdown trigger={['click']} menu={{
                          items: availableDays.map((d) => ({
                            key: d,
                            label: `${d.slice(5)} ${dayjs(d).format('ddd')}`,
                            onClick: () => form.setFieldsValue({ leave_day_hours: { ...overrides, [d]: defaultH === 8 ? 4 : defaultH } }),
                          })),
                        }}>
                          <Button size="small" type="dashed" icon={<PlusIcon className="w-3 h-3" />} className="text-green-600 border-green-300">
                            {t('dailyLog.leaveAdjustDay')}
                          </Button>
                        </Dropdown>
                      )}
                      <p className="text-xs text-green-600 mt-2">{t('dailyLog.leaveHint', { count: workdays.length, hours: defaultH })}</p>
                    </div>
                  )
                }}
              </Form.Item>
            </div>
          )}

          <Form.Item name="bu_unit" label={t('dailyLog.buUnit')}>
            <AutoComplete
              placeholder={t('dailyLog.buPlaceholder')}
              options={departmentOpts.map((d) => ({ value: d }))}
              filterOption={(input, option) => (option?.value ?? '').includes(input)}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label={
              <div className="flex items-center justify-between w-full">
                <span>{t('dailyLog.workContent')}</span>
                <button
                  type="button"
                  onClick={() => {
                    const cur = form.getFieldValue('description') ?? ''
                    setDescExpandDraft(cur)
                    setDescExpandOpen(true)
                  }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-0.5 hover:border-blue-300 bg-white transition-colors ml-2"
                >
                  <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                  {t('dailyLog.expandEdit')}
                </button>
              </div>
            }
            rules={[{ required: watchedCategory !== 'leave', message: t('dailyLog.pleaseInputContent') }]}
          >
            <RichTextEditor
              placeholder={t('dailyLog.descriptionPlaceholder')}
              minHeight={120}
              onImageUpload={handleImageUpload}
            />
          </Form.Item>

          <Form.Item name="is_overtime" label={t('dailyLog.isOvertime')} valuePropName="checked">
            <Switch
              checkedChildren={t('dailyLog.overtime')}
              unCheckedChildren={t('dailyLog.normal')}
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
              label={t('dailyLog.overtimeHoursField')}
              rules={[{ required: true, message: t('dailyLog.pleaseInputOvertimeHours') }]}
              extra={t('dailyLog.overtimeHoursExtra')}
            >
              <InputNumber min={0.01} max={24} step={0.5} precision={2} style={{ width: '100%' }} suffix="h" />
            </Form.Item>
          )}

          {/* Attachments from progress record (read-only) */}
          {editingEntry?.source === 'progress' && editingEntry.files && editingEntry.files.length > 0 && (
            <Form.Item label={t('dailyLog.progressAttachments')}>
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
            <Form.Item label={t('dailyLog.uploadedAttachments')}>
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

          <Form.Item label={t('dailyLog.newAttachments')}>
            <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple>
              <Button icon={<PaperClipIcon className="w-4 h-4" />} size="small">{t('dailyLog.selectFiles')}</Button>
            </Upload>
          </Form.Item>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button disabled={saving} onClick={() => { setModalOpen(false); form.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ background: '#2563eb' }}>
              {editingEntry ? t('dailyLog.update') : t('common.add')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* ─── Description Expand Modal ──────────────────────────────── */}
      <Modal
        open={descExpandOpen}
        title={t('dailyLog.workContent')}
        onCancel={() => setDescExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDescExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              form.setFieldValue('description', descExpandDraft)
              setDescExpandOpen(false)
            }}>{t('dailyLog.done')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={descExpandDraft}
          onChange={setDescExpandDraft}
          placeholder={t('dailyLog.descriptionPlaceholder')}
          minHeight={480}
          onImageUpload={handleImageUpload}
        />
      </Modal>

      {/* ─── Range Report Export Modal ─────────────────────────────── */}
      <Modal
        title={t('dailyLog.exportRangeTitle')}
        open={rangeExportOpen}
        onCancel={() => setRangeExportOpen(false)}
        onOk={handleExportRange}
        okText={t('dailyLog.exportDocx')}
        cancelText={t('common.cancel')}
        confirmLoading={rangeExportLoading}
        width="min(440px, 88vw)"
      >
        <div className="py-4">
          <p className="text-sm text-slate-500 mb-3">{t('dailyLog.todayHighlightHint', { date: dayjs().format('YYYY-MM-DD') })}</p>
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
