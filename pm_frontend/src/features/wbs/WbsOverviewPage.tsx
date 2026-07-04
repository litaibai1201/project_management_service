/**
 * WbsOverviewPage — 部門專案進度總覽（WBS 視角）
 *
 * 以部門所有專案為主，展開功能模塊 → 詳細任務的 WBS 結構
 * 呈現重點：
 *   - 各任務完成度（100% = 已完成，50% = 顯示百分比）
 *   - 超時標記 + 最新進度說明
 *   - 上週完成 / 本週進行中 / 下週待辦 的時間段標記
 *   - 預計完成時間
 *   - 以專案為中心，非個人為中心
 *   - 角色控制：僅主管可見
 *   - 支援「全部顯示」模式（含歷史任務）
 *   - 可跳轉專案詳情，可展開任務進度追蹤記錄
 *   - 會議備注：任務行快速記錄 + 專案維度彙整
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useAppSelector } from '@/hooks/redux'
import {
  Tag, Tooltip, Progress, Collapse, Empty, Segmented, Input, Button, Timeline, Popover, Modal, Avatar,
} from 'antd'
import {
  FolderIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon,
  ExclamationTriangleIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, CalendarDaysIcon,
  ChartBarIcon, MagnifyingGlassIcon, ArrowDownTrayIcon,
  EyeIcon, ChatBubbleOvalLeftEllipsisIcon, PlusIcon, CheckIcon, XMarkIcon,
  PresentationChartBarIcon,
} from '@heroicons/react/24/outline'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { standaloneReqApi } from '@/api/standalone_req.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { tokenStorage } from '@/api/httpClient'
import RichTextContent from '@/components/common/RichTextContent'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import FunctionDetailDrawer from '@/features/project/FunctionDetailDrawer'
import DutyDetailDrawer from '@/features/duty/DutyDetailDrawer'
import { TemporaryDuty } from '@/types/api.types'
import { meetingNoteApi, type MeetingNote as ApiMeetingNote } from '@/api/meeting_note.api'
import reportLogoUrl from '@/assets/report_logo.png'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { formatGroupName, formatGroupNamePlain } from '@/utils/status'

dayjs.extend(isoWeek)

const { Panel } = Collapse

// ─── Types ─────────────────────────────────────────────────────────────────

type WeekTag = 'last_week' | 'this_week' | 'next_week'
type TaskStatus = 'completed' | 'in_progress' | 'not_started' | 'overdue' | 'suspended'
type NoteType = '決策' | '行動項' | '風險' | '待確認'
type NoteStatus = 'pending' | 'resolved'

interface TaskProgressEntry {
  date: string
  created_at?: string
  content: string
  progress: number
  author: string
  work_no?: string
  time_consum?: number
  cooperator?: string[]
  files?: { name: string; url: string; size?: number }[]
}

interface WbsTask {
  id: string
  name: string
  assignee: string
  progress: number
  status: TaskStatus
  is_overdue?: boolean       // independent of status — a not_started task can also be overdue
  is_suspended?: boolean     // function_status === 8 (搁置)
  expected_end: string
  original_end?: string      // 原始預計完成時間（延期前）
  reschedule_count?: number  // 延期次數
  reschedule_reason?: string // 最新延期原因
  actual_end?: string
  days_overdue?: number
  latest_update?: string
  week_tag: WeekTag[]
  project_id?: string        // for navigation
  function_id?: string       // for navigation
  progress_history?: TaskProgressEntry[]
  requirement_id?: string
  requirement_nm?: string
}

interface WbsFunction {
  id: string
  name: string
  progress: number
  tasks: WbsTask[]
}

interface WbsProject {
  id: string
  name: string
  department: string
  pm: string
  product_pm?: string
  progress: number
  priority: number
  start_date?: string
  expected_end: string
  functions: WbsFunction[]
  is_completed?: boolean
  end_time?: string
}

interface MeetingNote {
  id: string
  projectId: string
  type: NoteType
  content: string
  taskId?: string
  taskName?: string
  author: string
  createdAt: string   // ISO datetime string
  status: NoteStatus
}

// ─── Week markers ───────────────────────────────────────────────────────────

const WEEK_TAG_CONFIG: Record<WeekTag, { labelKey: string; color: string; bg: string }> = {
  last_week:  { labelKey: 'wbs.lastWeek', color: '#64748b', bg: '#f1f5f9' },
  this_week:  { labelKey: 'wbs.thisWeek', color: '#2563eb', bg: '#eff6ff' },
  next_week:  { labelKey: 'wbs.nextWeek', color: '#7c3aed', bg: '#f5f3ff' },
}

const STATUS_CONFIG: Record<TaskStatus, { labelKey: string; color: string; icon: React.ReactNode }> = {
  completed:   { labelKey: 'wbs.statusCompleted',  color: '#2563eb', icon: <CheckCircleIcon className="w-3.5 h-3.5 text-blue-500" /> },
  in_progress: { labelKey: 'wbs.statusInProgress', color: '#16a34a', icon: <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-green-500" /> },
  not_started: { labelKey: 'wbs.statusNotStarted', color: '#94a3b8', icon: <ClockIcon className="w-3.5 h-3.5 text-slate-400" /> },
  overdue:     { labelKey: 'wbs.statusOverdue',    color: '#dc2626', icon: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" /> },
  suspended:   { labelKey: 'wbs.statusSuspended',  color: '#d97706', icon: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" /> },
}

const NOTE_TYPE_CONFIG: Record<NoteType, { antColor: string; bg: string; color: string }> = {
  '決策':   { antColor: 'blue',   bg: '#eff6ff', color: '#2563eb' },
  '行動項': { antColor: 'green',  bg: '#f0fdf4', color: '#16a34a' },
  '風險':   { antColor: 'red',    bg: '#fef2f2', color: '#dc2626' },
  '待確認': { antColor: 'orange', bg: '#fff7ed', color: '#d97706' },
}

// ─── WBS data is loaded from the API ──────────────────────────────────────────

// ─── CSV export utility ─────────────────────────────────────────────────────

function exportWbsCSV(projects: WbsProject[], t: (key: string) => string) {
  const bom = '\uFEFF'
  const headers = [t('wbs.csv.projectName'), t('wbs.csv.functionModule'), t('wbs.csv.taskName'), t('wbs.csv.assignee'), t('wbs.csv.status'), t('wbs.csv.progress'), t('wbs.csv.expectedEnd'), t('wbs.csv.actualEnd'), t('wbs.csv.overdueDays'), t('wbs.csv.weekTag'), t('wbs.csv.latestUpdate')]
  const statusLabel = (s: TaskStatus) => ({ completed: t('wbs.rpt.completed'), in_progress: t('wbs.rpt.inProgress'), not_started: t('wbs.rpt.notStarted'), overdue: t('wbs.rpt.overdue'), suspended: t('wbs.rpt.suspended') }[s])
  const weekTagLabel = (wt: WeekTag) => ({ last_week: t('wbs.lastWeek'), this_week: t('wbs.thisWeek'), next_week: t('wbs.nextWeek') }[wt])
  const rows = projects.flatMap((p) =>
    p.functions.flatMap((f) =>
      f.tasks.map((tk) => [
        p.name, formatGroupNamePlain(f.name) || f.name, tk.name, tk.assignee, statusLabel(tk.status),
        String(tk.progress), tk.expected_end, tk.actual_end ?? '',
        String(tk.days_overdue ?? ''), tk.week_tag.map((wt) => weekTagLabel(wt)).join('+'),
        (tk.latest_update ?? '').replace(/<[^>]*>/g, ''),
      ])
    )
  )
  const csv = bom + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `${t('wbs.csv.fileName')}_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── PPT Export (matching 专案周报.pptx template) ────────────────────────────
//
// Color scheme:
//   已完成 → #0070C0 (blue, bold)     進行中 → #00B050 (green, bold)
//   風險   → #FFC000 (yellow)         delay  → #FF0000 (red)
//   Header bg → #002FA7               Title  → #0070C0

type PptTextRun = {
  text: string
  options?: { bold?: boolean; italic?: boolean; color?: string; fontSize?: number; breakType?: string; strike?: boolean; fontFace?: string }
}

const PPT_FONT_SIZE = 14
const PPT_FONT_FACE = '標楷體'

const _run = (text: string, extra: object = {}): PptTextRun => ({
  text, options: { fontSize: PPT_FONT_SIZE, fontFace: PPT_FONT_FACE, ...extra },
})

function _statusRuns(task: WbsTask): PptTextRun[] {
  if (task.status === 'completed') {
    return [
      _run('(', { color: '0070C0' }),
      _run(i18n.t('wbs.rpt.completed'), { bold: true, color: '0070C0' }),
      _run(')', { color: '0070C0' }),
    ]
  }
  if (task.status === 'suspended' || task.is_suspended) {
    return [
      _run('(', { color: 'D97706' }),
      _run(i18n.t('wbs.rpt.suspended'), { bold: true, color: 'D97706' }),
      _run(')', { color: 'D97706' }),
    ]
  }
  if (task.is_overdue) {
    return [
      _run('(', { color: 'FF0000' }),
      _run('delay', { bold: true, color: 'FF0000' }),
      _run(')', { color: 'FF0000' }),
    ]
  }
  if (task.status === 'in_progress') {
    return [
      _run('('),
      _run(i18n.t('wbs.rpt.inProgress'), { bold: true, color: '00B050' }),
      _run(')'),
    ]
  }
  return [_run(`(${i18n.t('wbs.rpt.notStarted')})`, { color: '94A3B8' })]
}

const WEEK_TAG_PPT: Record<WeekTag, { labelKey: string; color: string }> = {
  last_week: { labelKey: 'wbs.lastWeek', color: '7F7F7F' },
  this_week: { labelKey: 'wbs.thisWeek', color: '0070C0' },
  next_week: { labelKey: 'wbs.nextWeek', color: '7030A0' },
}

function buildProgressTextRuns(project: WbsProject): PptTextRun[] {
  const runs: PptTextRun[] = []

  // Build same sections structure as preview: req → func → task
  const allItems: { task: WbsTask; funcName: string }[] = []
  project.functions.forEach((func) => {
    func.tasks.forEach((task) => allItems.push({ task, funcName: func.name }))
  })

  const hasRequirements = allItems.some((item) => !!item.task.requirement_nm)

  type Section =
    | { kind: 'req'; name: string; funcs: { name: string; tasks: WbsTask[] }[] }
    | { kind: 'grp'; name: string; tasks: WbsTask[] }

  const sections: Section[] = []

  if (hasRequirements) {
    const reqMap = new Map<string, { name: string; funcs: Map<string, { name: string; tasks: WbsTask[] }> }>()
    for (const { task, funcName } of allItems) {
      const rKey = task.requirement_id ?? '__none__'
      const rName = (task.requirement_nm ?? '').trim()
      if (!reqMap.has(rKey)) reqMap.set(rKey, { name: rName, funcs: new Map() })
      const req = reqMap.get(rKey)!
      const fKey = funcName
      if (!req.funcs.has(fKey)) req.funcs.set(fKey, { name: funcName, tasks: [] })
      req.funcs.get(fKey)!.tasks.push(task)
    }
    for (const [, req] of reqMap.entries()) {
      if (req.name) {
        sections.push({
          kind: 'req', name: req.name,
          funcs: Array.from(req.funcs.values()),
        })
      } else {
        for (const func of req.funcs.values()) {
          sections.push({ kind: 'grp', name: func.name, tasks: func.tasks })
        }
      }
    }
  } else {
    for (const func of project.functions) {
      if (func.tasks.length > 0) sections.push({ kind: 'grp', name: func.name, tasks: func.tasks })
    }
  }

  // Render sections → runs
  const nameLabel = (n: string) => formatGroupNamePlain(n) || n

  if (sections.length === 0) {
    allItems.forEach(({ task }, i) => {
      if (i > 0) runs.push({ text: '\n' })
      const lineColor = task.status === 'completed' ? '0070C0' : '000000'
      runs.push(_run(`${i + 1}. `, { color: lineColor }))
      runs.push(..._statusRuns(task))
      _appendTaskDetail(runs, task)
    })
    return runs
  }

  let first = true
  sections.forEach((section, si) => {
    if (!first) runs.push({ text: '\n' })
    first = false
    const num = si + 1
    if (section.kind === 'req') {
      const reqStatus = (section.funcs[0]?.tasks[0] as unknown as { requirement_status?: number })?.requirement_status
      const isReqShelved = reqStatus === 8
      const reqColor = isReqShelved ? 'D97706' : '002FA7'
      runs.push(_run(`${num}. ${nameLabel(section.name)}`, { bold: true, color: reqColor, fontSize: PPT_FONT_SIZE }))
      if (isReqShelved) {
        runs.push(_run(` [${i18n.t('wbs.rpt.suspended')}]`, { bold: true, color: 'D97706', fontSize: PPT_FONT_SIZE }))
        const reqShelvedAt = (section.funcs[0]?.tasks[0] as unknown as { requirement_shelved_at?: string })?.requirement_shelved_at || ''
        const reqShelveReason = (section.funcs[0]?.tasks[0] as unknown as { requirement_shelve_reason?: string })?.requirement_shelve_reason || ''
        runs.push({ text: '\n' })
        runs.push(_run(`   ↳ ${reqShelvedAt} ${i18n.t('wbs.shelveReasonLabel')}${reqShelveReason || '—'}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
      }
    } else {
      runs.push(_run(`${num}. ${nameLabel(section.name)}`, { bold: true, color: '002FA7', fontSize: PPT_FONT_SIZE }))
    }

    if (section.kind === 'req') {
      section.funcs.forEach((func) => {
        runs.push({ text: '\n' })
        runs.push(_run(`   ▸ ${nameLabel(func.name)}`, { bold: true, color: '374151', fontSize: PPT_FONT_SIZE }))
        func.tasks.forEach((task) => {
          runs.push({ text: '\n' })
          runs.push(_run('      - ', {}))
          runs.push(..._statusRuns(task))
          _appendTaskDetail(runs, task, '         ')
        })
      })
    } else {
      section.tasks.forEach((task) => {
        runs.push({ text: '\n' })
        runs.push(_run('   - ', {}))
        runs.push(..._statusRuns(task))
        _appendTaskDetail(runs, task, '      ')
      })
    }
  })

  return runs
}

function _appendTaskDetail(runs: PptTextRun[], task: WbsTask, indent = '') {
  const lineColor = task.status === 'completed' ? '0070C0' : '000000'
  const isShelved = task.is_suspended
  runs.push(_run(` ${task.name}`, { color: lineColor }))
  // 責任人（所有任務都顯示）
  if (task.assignee && task.assignee !== i18n.t('common.notAssigned')) {
    runs.push(_run(` (${task.assignee})`, { color: '6B7280', fontSize: PPT_FONT_SIZE - 1 }))
  }
  // 搁置任務不顯示日期/延期
  if (!isShelved) {
    const hasReschedule = (task.reschedule_count ?? 0) > 0 && !!task.original_end
    if (hasReschedule) {
      runs.push(_run(` (`, { color: lineColor }))
      runs.push(_run(task.original_end ?? '', { color: 'AAAAAA', strike: true }))
      runs.push(_run(` ${task.expected_end}`, { color: 'D97706', bold: true }))
      runs.push(_run(` ${i18n.t('wbs.rpt.rescheduledTimes', { count: task.reschedule_count })}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
      runs.push(_run(`)`, { color: lineColor }))
    } else if (task.status === 'completed') {
      const dateStr = task.actual_end || task.expected_end
      if (dateStr) runs.push(_run(` (${dateStr}${i18n.t('wbs.rpt.completed')})`, { color: '6B7280' }))
    } else if (task.expected_end) {
      runs.push(_run(` (${i18n.t('wbs.rpt.targetDate', { date: task.expected_end })})`, { color: '6B7280' }))
    }
    if (task.week_tag.length > 0) {
      task.week_tag.forEach((wt) => {
        const cfg = WEEK_TAG_PPT[wt]
        runs.push(_run(` [${i18n.t(cfg.labelKey)}]`, { bold: true, color: cfg.color }))
      })
    }
    if (task.is_overdue && task.days_overdue && task.expected_end) {
      runs.push(_run(` [${i18n.t('wbs.rpt.overdue')}${task.days_overdue}${i18n.t('common.day')}]`, { color: 'FF0000' }))
    }
    if (hasReschedule && task.reschedule_reason) {
      runs.push({ text: '\n' })
      runs.push(_run(`${indent}  ↳ ${i18n.t('wbs.rpt.rescheduleReason')}${task.reschedule_reason}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
    }
  } else {
    // 搁置任務顯示周標籤（基於搁置時間）+ 搁置原因
    if (task.week_tag.length > 0) {
      task.week_tag.forEach((wt) => {
        const cfg = WEEK_TAG_PPT[wt]
        runs.push(_run(` [${i18n.t(cfg.labelKey)}]`, { bold: true, color: cfg.color }))
      })
    }
    const shelvedAt = (task as unknown as { shelved_at?: string }).shelved_at || ''
    const shelveReason = (task as unknown as { shelve_reason?: string }).shelve_reason || ''
    runs.push({ text: '\n' })
    runs.push(_run(`${indent}  ↳ ${shelvedAt} ${i18n.t('wbs.shelveReasonLabel')}${shelveReason || '—'}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
  }
  if (task.latest_update && task.status !== 'completed' && !isShelved) {
    runs.push({ text: '\n' })
    runs.push(_run(`${indent}  ${task.latest_update.replace(/<[^>]*>/g, '')}`, { color: '555555', fontSize: PPT_FONT_SIZE - 1 }))
  }
}

function _dutyStatusLabel(d: TemporaryDuty, t: (key: string) => string): { label: string; color: string } {
  if (d.status === 3) return { label: t('wbs.rpt.completed'), color: RPT_STATUS_COLOR.completed }
  if (d.status === 8) return { label: t('wbs.rpt.suspended'), color: RPT_STATUS_COLOR.suspended }
  const isOverdue = !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')
  if (isOverdue) return { label: 'delay', color: RPT_STATUS_COLOR.overdue }
  if (d.status === 1 || d.status === 2 || d.status === 5) return { label: t('wbs.rpt.inProgress'), color: RPT_STATUS_COLOR.in_progress }
  return { label: t('wbs.rpt.notStarted'), color: RPT_STATUS_COLOR.not_started }
}

function _dutyListDotColor(ds: TemporaryDuty[]): string {
  const today = dayjs()
  if (ds.some(d => d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(today, 'day'))) return 'FF0000'
  if (ds.every(d => d.status === 3) && ds.length > 0) return '0070C0'
  return '00B050'
}

function _projectDotColor(project: WbsProject): string {
  const hasOverdue = project.functions.some((f) => f.tasks.some((t) => !!t.is_overdue))
  if (hasOverdue) return 'FF0000'
  const allDone = project.functions.every((f) => f.tasks.every((t) => t.status === 'completed'))
  if (allDone && project.functions.length > 0) return '0070C0'
  return '00B050'
}

// (行数通过 splitRunsToLines 实际计算，不再需要估算函数)

function buildDutyProgressRuns(
  duties: TemporaryDuty[],
  reqNameMap: Record<string, string>,
  reqStatusMap: Record<string, number>,
  reqShelveReasonMap: Record<string, string>,
  reqShelvedAtMap: Record<string, string>,
  toName: (wn: string) => string,
  isDutyVisible: (d: TemporaryDuty) => boolean,
): PptTextRun[] {
  const runs: PptTextRun[] = []
  const visible = duties.filter(isDutyVisible)
  if (visible.length === 0) return [_run(i18n.t('wbs.noWeeklyUpdate'), { color: '94A3B8' })]

  // Group by req
  const byReq = new Map<string, TemporaryDuty[]>()
  duties.forEach((d) => {
    const key = d.standalone_req_id || '__none__'
    if (!byReq.has(key)) byReq.set(key, [])
    byReq.get(key)!.push(d)
  })
  const sorted = [...byReq.entries()].sort(([a], [b]) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return (reqNameMap[a] ?? a).localeCompare(reqNameMap[b] ?? b, 'zh-TW')
  })

  let secIdx = 0
  let first = true
  for (const [reqKey, reqDuties] of sorted) {
    const reqVisible = reqDuties.filter(isDutyVisible)
    if (reqVisible.length === 0) continue
    const reqNm = reqKey !== '__none__' ? (reqNameMap[reqKey] ?? null) : null
    secIdx++
    if (!first) runs.push({ text: '\n' })
    first = false

    if (reqNm) {
      const isReqShelved = reqStatusMap[reqKey] === 8
      runs.push(_run(`${secIdx}. ${reqNm}`, { bold: true, color: isReqShelved ? 'D97706' : '002FA7' }))
      if (isReqShelved) {
        runs.push(_run(` [${i18n.t('wbs.rpt.suspended')}]`, { bold: true, color: 'D97706' }))
        runs.push({ text: '\n' })
        runs.push(_run(`   ↳ ${reqShelvedAtMap[reqKey] || ''} ${i18n.t('wbs.shelveReasonLabel')}${reqShelveReasonMap[reqKey] || '—'}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
      }
    }

    // Group by group within req
    const byGroup = new Map<string, TemporaryDuty[]>()
    reqVisible.forEach((d) => {
      const g = d.group || '__nogroup__'
      if (!byGroup.has(g)) byGroup.set(g, [])
      byGroup.get(g)!.push(d)
    })
    const sortedGroups = [...byGroup.entries()].sort(([a], [b]) => {
      if (a === '__nogroup__') return 1
      if (b === '__nogroup__') return -1
      return a.localeCompare(b)
    })

    for (const [grp, grpDuties] of sortedGroups) {
      if (grp !== '__nogroup__') {
        runs.push({ text: '\n' })
        runs.push(_run(`   ▸ ${formatGroupNamePlain(grp) || grp}`, { bold: true, color: '374151' }))
      }
      for (const d of grpDuties.sort((a, b) => (a.expected_end_date ?? '').localeCompare(b.expected_end_date ?? ''))) {
        runs.push({ text: '\n' })
        const isShelved = d.status === 8
        // Status
        if (d.status === 3) {
          runs.push(_run('   - (', { color: '0070C0' }))
          runs.push(_run(i18n.t('wbs.rpt.completed'), { bold: true, color: '0070C0' }))
          runs.push(_run(') ', { color: '0070C0' }))
        } else if (isShelved) {
          runs.push(_run('   - (', { color: 'D97706' }))
          runs.push(_run(i18n.t('wbs.rpt.suspended'), { bold: true, color: 'D97706' }))
          runs.push(_run(') ', { color: 'D97706' }))
        } else {
          const isOverdue = !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')
          if (isOverdue) {
            runs.push(_run('   - (', { color: 'FF0000' }))
            runs.push(_run('delay', { bold: true, color: 'FF0000' }))
            runs.push(_run(') ', { color: 'FF0000' }))
          } else if (d.status === 1 || d.status === 2 || d.status === 5) {
            runs.push(_run('   - ('))
            runs.push(_run(i18n.t('wbs.rpt.inProgress'), { bold: true, color: '00B050' }))
            runs.push(_run(') '))
          } else {
            runs.push(_run(`   - (${i18n.t('wbs.rpt.notStarted')}) `, { color: '94A3B8' }))
          }
        }
        // Name + assignee
        runs.push(_run(d.duty_nm, {}))
        if (d.responsible?.length) {
          runs.push(_run(` (${d.responsible.map((wn) => toName(wn) || wn).join(', ')})`, { color: '6B7280', fontSize: PPT_FONT_SIZE - 1 }))
        }
        // Date (not for shelved)
        if (!isShelved) {
          if (d.status === 3) {
            const dateStr = d.end_time?.slice(0, 10) || d.expected_end_date
            if (dateStr) runs.push(_run(` (${dateStr}${i18n.t('wbs.rpt.completed')})`, { color: '6B7280' }))
          } else if (d.expected_end_date) {
            runs.push(_run(` (${i18n.t('wbs.rpt.targetDate', { date: d.expected_end_date })})`, { color: '6B7280' }))
          }
          // Week tags
          const weekTags = computeDutyWeekTags(d)
          weekTags.forEach((wt) => {
            const cfg = WEEK_TAG_PPT[wt]
            runs.push(_run(` [${i18n.t(cfg.labelKey)}]`, { bold: true, color: cfg.color }))
          })
        }
        // Shelve reason
        if (isShelved) {
          const shelvedAt = ((d as unknown as { updated_at?: string }).updated_at ?? '').slice(0, 10)
          const reason = (d as unknown as { shelve_reason?: string }).shelve_reason || ''
          runs.push({ text: '\n' })
          runs.push(_run(`      ↳ ${shelvedAt} ${i18n.t('wbs.shelveReasonLabel')}${reason || '—'}`, { color: 'D97706', fontSize: PPT_FONT_SIZE - 1 }))
        }
      }
    }
  }
  return runs
}

async function exportWbsPptx(
  projects: WbsProject[],
  department: string,
  duties?: TemporaryDuty[],
  systemInfoMap?: Record<string, { sys_nm: string; maintainers?: string[] }>,
  reqNameMap?: Record<string, string>,
  reqResponsibleMap?: Record<string, string[]>,
  reqStatusMap?: Record<string, number>,
  reqShelveReasonMap?: Record<string, string>,
  reqShelvedAtMap?: Record<string, string>,
  toName?: (wn: string) => string,
  isDutyVisible?: (d: TemporaryDuty) => boolean,
) {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13.33 × 7.5 in

  // ── Load logo image as base64 ──
  let logoBase64 = ''
  try {
    const logoModule = await import('@/assets/report_logo.png')
    const resp = await fetch(logoModule.default)
    const blob = await resp.blob()
    logoBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
  } catch { /* logo optional */ }

  const F = PPT_FONT_FACE
  const HDR_BG = '002FA7'

  const mkHdr = (text: string) => ({
    text,
    options: { bold: true, color: 'FFFFFF', fill: { color: HDR_BG }, align: 'center' as const, valign: 'middle' as const, fontSize: 15, fontFace: F },
  })
  const headerRow = [
    mkHdr('進\n度'), mkHdr('序\n號'), mkHdr('重點項目\nTOP3'), mkHdr('-需求使用者\n-專案PM'), mkHdr('DRI'), mkHdr('專案啟動日'), mkHdr('預計結案日'), mkHdr('進度'),
  ]

  // ── 将进度 runs 按 \n 拆分为行组 ──
  const splitRunsToLines = (runs: PptTextRun[]): PptTextRun[][] => {
    const lines: PptTextRun[][] = [[]]
    for (const r of runs) {
      if (r.text === '\n') {
        lines.push([])
      } else if (typeof r.text === 'string' && r.text.includes('\n')) {
        const parts = r.text.split('\n')
        parts.forEach((part, i) => {
          if (i > 0) lines.push([])
          if (part) lines[lines.length - 1].push({ ...r, text: part })
        })
      } else {
        lines[lines.length - 1].push(r)
      }
    }
    return lines.filter((l) => l.length > 0)
  }

  const joinLines = (lineGroups: PptTextRun[][]): PptTextRun[] => {
    const result: PptTextRun[] = []
    lineGroups.forEach((line, i) => {
      if (i > 0) result.push({ text: '\n' })
      result.push(...line)
    })
    return result
  }

  const MAX_LINES = 21
  const cellMid = (extra: object = {}) => ({ valign: 'middle' as const, align: 'center' as const, fontSize: PPT_FONT_SIZE, fontFace: F, color: '000000', ...extra })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeProjectCells = (project: WbsProject, idx: number, progressRuns: PptTextRun[]) => {
    const dotColor = _projectDotColor(project)
    return [
      { text: '●', options: cellMid({ color: dotColor, fill: { color: 'FFFFFF' } }) },
      { text: String(idx + 1), options: cellMid() },
      { text: project.name, options: cellMid({ align: 'left' as const }) },
      { text: project.product_pm || project.pm, options: cellMid({ align: 'left' as const }) },
      { text: project.pm, options: cellMid({ align: 'left' as const }) },
      { text: project.start_date ?? '-', options: cellMid() },
      { text: project.is_completed ? (project.end_time || project.expected_end || '-') : (project.expected_end || '-'), options: cellMid({ color: project.is_completed ? '0070C0' : '000000' }) },
      { text: progressRuns, options: { valign: 'top' as const, fontSize: PPT_FONT_SIZE, fontFace: F, color: '000000' } },
    ]
  }

  // 构建分页行：大专案按行拆分，续页重复专案信息
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pages: any[][] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentPage: any[] = []
  let currentLines = 0

  projects.forEach((project, idx) => {
    const progressRuns = buildProgressTextRuns(project)
    const allLineGroups = splitRunsToLines(progressRuns)
    const totalLines = allLineGroups.length
    const remaining = MAX_LINES - currentLines

    if (totalLines <= remaining) {
      // 整个专案放得下
      currentPage.push(makeProjectCells(project, idx, progressRuns))
      currentLines += totalLines
    } else {
      // 需要拆分：先放能放下的行数
      if (remaining > 0 && currentPage.length > 0) {
        // 当前页放前 remaining 行
        const firstPart = joinLines(allLineGroups.slice(0, remaining))
        currentPage.push(makeProjectCells(project, idx, firstPart))
        pages.push(currentPage)

        // 剩余行按 MAX_LINES 继续拆
        let offset = remaining
        while (offset < totalLines) {
          const chunk = allLineGroups.slice(offset, offset + MAX_LINES)
          const chunkRuns = joinLines(chunk)
          pages.push([makeProjectCells(project, idx, chunkRuns)])
          offset += MAX_LINES
        }
        currentPage = []
        currentLines = 0
      } else {
        // 当前页为空或剩余空间为0，直接按 MAX_LINES 拆
        if (currentPage.length > 0) pages.push(currentPage)
        let offset = 0
        while (offset < totalLines) {
          const chunk = allLineGroups.slice(offset, offset + MAX_LINES)
          const chunkRuns = joinLines(chunk)
          if (offset + MAX_LINES < totalLines) {
            pages.push([makeProjectCells(project, idx, chunkRuns)])
          } else {
            // 最后一块放到新的 currentPage，后续专案可以接着放
            currentPage = [makeProjectCells(project, idx, chunkRuns)]
            currentLines = chunk.length
          }
          offset += MAX_LINES
        }
      }
    }
  })

  // ── System duty rows ──
  if (duties && isDutyVisible && toName) {
    const sysMap = new Map<string, TemporaryDuty[]>()
    const arList: TemporaryDuty[] = []
    duties.forEach((d) => {
      if (d.system_id) {
        if (!sysMap.has(d.system_id)) sysMap.set(d.system_id, [])
        sysMap.get(d.system_id)!.push(d)
      } else {
        arList.push(d)
      }
    })

    let sysIdx = projects.length
    for (const [sysId, sysDuties] of sysMap.entries()) {
      if (!sysDuties.some(isDutyVisible)) continue
      sysIdx++
      const sysInfo = systemInfoMap?.[sysId]
      const sysNm = sysInfo?.sys_nm ?? sysId
      const maintainers = (sysInfo?.maintainers ?? []).map((wn) => toName(wn) || wn).join('、') || '—'
      const reqIds = [...new Set(sysDuties.map((d) => d.standalone_req_id).filter(Boolean) as string[])]
      const dri = reqIds.length > 0
        ? [...new Set(reqIds.flatMap((rid) => reqResponsibleMap?.[rid] ?? []))].map((wn) => toName(wn) || wn).join('、') || '—'
        : [...new Set(sysDuties.flatMap((d) => d.responsible ?? []))].map((wn) => toName(wn) || wn).join('、') || '—'
      const dotColor = _dutyListDotColor(sysDuties)
      const progressRuns = buildDutyProgressRuns(sysDuties, reqNameMap ?? {}, reqStatusMap ?? {}, reqShelveReasonMap ?? {}, reqShelvedAtMap ?? {}, toName, isDutyVisible)

      const cells = [
        { text: '●', options: cellMid({ color: dotColor, fill: { color: 'FFFFFF' } }) },
        { text: String(sysIdx), options: cellMid() },
        { text: `${sysNm} [${i18n.t('wbs.rpt.system')}]`, options: cellMid({ align: 'left' as const }) },
        { text: maintainers, options: cellMid({ align: 'left' as const }) },
        { text: dri, options: cellMid({ align: 'left' as const }) },
        { text: '—', options: cellMid() },
        { text: '—', options: cellMid() },
        { text: progressRuns, options: { valign: 'top' as const, fontSize: PPT_FONT_SIZE, fontFace: F, color: '000000' } },
      ]
      const allLineGroups = splitRunsToLines(progressRuns)
      const remaining = MAX_LINES - currentLines
      if (allLineGroups.length <= remaining) {
        currentPage.push(cells)
        currentLines += allLineGroups.length
      } else {
        if (currentPage.length > 0) pages.push(currentPage)
        currentPage = [cells]
        currentLines = allLineGroups.length
      }
    }

    // AR standalone
    if (arList.some(isDutyVisible)) {
      sysIdx++
      const dotColor = _dutyListDotColor(arList)
      const progressRuns = buildDutyProgressRuns(arList, reqNameMap ?? {}, reqStatusMap ?? {}, reqShelveReasonMap ?? {}, reqShelvedAtMap ?? {}, toName, isDutyVisible)
      const cells = [
        { text: '●', options: cellMid({ color: dotColor, fill: { color: 'FFFFFF' } }) },
        { text: String(sysIdx), options: cellMid() },
        { text: `AR ${i18n.t('wbs.rpt.arTasks')}`, options: cellMid({ align: 'left' as const }) },
        { text: '—', options: cellMid({ align: 'left' as const }) },
        { text: [...new Set(arList.flatMap((d) => d.responsible ?? []))].map((wn) => toName(wn) || wn).join('、') || '—', options: cellMid({ align: 'left' as const }) },
        { text: '—', options: cellMid() },
        { text: '—', options: cellMid() },
        { text: progressRuns, options: { valign: 'top' as const, fontSize: PPT_FONT_SIZE, fontFace: F, color: '000000' } },
      ]
      const allLineGroups = splitRunsToLines(progressRuns)
      const remaining = MAX_LINES - currentLines
      if (allLineGroups.length <= remaining) {
        currentPage.push(cells)
        currentLines += allLineGroups.length
      } else {
        if (currentPage.length > 0) pages.push(currentPage)
        currentPage = [cells]
        currentLines = allLineGroups.length
      }
    }
  }

  if (currentPage.length > 0) pages.push(currentPage)
  if (pages.length === 0) pages.push([])

  // ── 為每頁建立獨立 slide ──
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageRows = pages[pageIdx]
    const slide = pptx.addSlide()

    if (logoBase64) {
      slide.addImage({ data: logoBase64, x: 0.12, y: 0.06, w: 2.3, h: 0.58 })
    }

    slide.addText(
      [{ text: `${department} (系統) – Overview`, options: { color: '0070C0', fontSize: 36, bold: true, fontFace: F } }],
      { x: 0, y: 0.0, w: 13.33, h: 0.72, align: 'center', valign: 'middle' },
    )

    slide.addText(
      [
        { text: '●已完成', options: { color: '0070C0', fontSize: 12, fontFace: F } },
        { text: '  ', options: { fontSize: 12 } },
        { text: '●進行中', options: { color: '00B050', fontSize: 12, fontFace: F } },
        { text: '  ', options: { fontSize: 12 } },
        { text: '●風險',   options: { color: 'FFC000', fontSize: 12, fontFace: F } },
        { text: '  ', options: { fontSize: 12 } },
        { text: '●delay',  options: { color: 'FF0000', fontSize: 12, fontFace: F } },
      ],
      { x: 9.8, y: 0.0, w: 3.5, h: 0.72, align: 'right', valign: 'middle' },
    )

    slide.addTable([headerRow, ...pageRows], {
      x: 0.12, y: 0.78, w: 13.1,
      colW: [0.3, 0.3, 1.0, 1.6, 0.6, 0.85, 0.85, 7.25],
      border: { type: 'solid', color: 'B4C6E7', pt: 0.5 },
    })

    // Footer
    slide.addText(
      [{ text: 'ZDT Confidential', options: { fontSize: 9, bold: true, color: 'FF0000', fontFace: F } }],
      { x: 0.03, y: 7.1, w: 3.0, h: 0.35 },
    )
  }

  await pptx.writeFile({ fileName: `專案進度週報_${dayjs().format('YYYY-MM-DD')}.pptx` })
}

// ─── Week filter type ────────────────────────────────────────────────────────

type WeekFilter = 'all' | 'show_all' | WeekTag

// ─── Task Progress Detail Panel ─────────────────────────────────────────────

const TaskProgressDetail: React.FC<{ task: WbsTask }> = ({ task }) => {
  const { t } = useTranslation()
  const history = task.progress_history ?? []
  const toName  = useWorkNoToName()
  const token   = tokenStorage.get()

  const withToken = (url: string) => token ? `${url}?token=${token}` : url
  const addToken  = (files?: { name: string; url: string; size?: number }[]) =>
    (files ?? []).map((f) => ({ ...f, url: withToken(f.url) }))

  return (
    <div className="bg-slate-50/80 border-t border-slate-100 px-6 py-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-semibold text-slate-600">{t('wbs.progressHistory')}</span>
        <span className="text-[10px] text-slate-400">{t('wbs.progressHistoryCount', { count: history.length })}</span>
      </div>
      {history.length === 0 ? (
        <p className="text-[10px] text-slate-400">{t('wbs.noProgressHistory')}</p>
      ) : (
        <Timeline
          className="ml-1 mt-2"
          items={history.map((entry) => ({
            dot: (
              <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {entry.author?.[0]?.toUpperCase()}
              </Avatar>
            ),
            children: (
              <div className="pb-3">
                {/* Header row: name + cooperators + progress + hours */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-semibold text-slate-700 text-sm">{entry.author}</span>
                  {(() => {
                    const coops = Array.isArray(entry.cooperator) ? entry.cooperator : []
                    return coops.length > 0 ? (
                      <Tooltip title={t('wbs.cooperators', { names: coops.map((c) => toName(c) || c).join('、') })}>
                        <div className="flex items-center gap-0.5">
                          <span className="text-xs text-slate-400">+</span>
                          {coops.map((c) => (
                            <Avatar key={c} size={18} style={{ background: '#7c3aed', fontSize: 9, fontWeight: 700, marginLeft: 2 }}>
                              {(toName(c) || c)[0]?.toUpperCase()}
                            </Avatar>
                          ))}
                        </div>
                      </Tooltip>
                    ) : null
                  })()}
                  <Tag color="blue" style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>
                    {entry.progress}%
                  </Tag>
                  {(entry.time_consum ?? 0) > 0 && (
                    <Tag style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>
                      {entry.time_consum}h
                    </Tag>
                  )}
                </div>
                {/* Progress description */}
                {entry.content && (
                  <p className="text-sm text-slate-600 leading-snug mt-1 mb-0" style={{ margin: '4px 0 0 0' }}>
                    {entry.content}
                  </p>
                )}
                {/* Attachments */}
                <AttachmentPreview files={addToken(entry.files)} />
                {/* Timestamp */}
                <span className="text-xs text-slate-300 mt-1 block">
                  {entry.created_at || entry.date}
                </span>
              </div>
            ),
          }))}
        />
      )}
    </div>
  )
}

// ─── Note Popover (view existing + add new) ─────────────────────────────────

const NotePopover: React.FC<{
  taskName?: string
  context?: string  // e.g. "需求名 / 分组名"
  notes?: MeetingNote[]
  onAdd: (type: NoteType, content: string) => void
  onResolve?: (noteId: string) => void
  onDelete?: (noteId: string) => void
  children: React.ReactNode
}> = ({ taskName, context, notes = [], onAdd, onResolve, onDelete, children }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [noteType, setNoteType] = useState<NoteType>('行動項')
  const [noteContent, setNoteContent] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  const handleAdd = () => {
    if (!noteContent.trim()) return
    onAdd(noteType, noteContent.trim())
    setNoteContent('')
    setShowAddForm(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (!v) { setNoteContent(''); setShowAddForm(false) }
  }

  const hasNotes = notes.length > 0

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomRight"
      title={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-semibold text-slate-700">
              {taskName
                ? (context
                  ? <>{context && <span className="text-slate-400 font-normal">{context} / </span>}{taskName}</>
                  : t('wbs.noteTitle', { taskName }))
                : t('wbs.projectNoteTitle')}
            </span>
          </div>
          {hasNotes && !showAddForm && (
            <button
              className="border-0 bg-transparent cursor-pointer flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors"
              onClick={() => setShowAddForm(true)}
            >
              <PlusIcon className="w-3 h-3" /> {t('wbs.addNoteBtn')}
            </button>
          )}
        </div>
      }
      content={
        <div className="w-72" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {/* ── Existing notes list ── */}
          {hasNotes && (
            <div className="mb-2 divide-y divide-slate-100">
              {notes.map((n) => (
                <div key={n.id} className={`py-2 first:pt-0 group/ni ${n.status === 'resolved' ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Tag
                      color={NOTE_TYPE_CONFIG[n.type]?.antColor ?? 'default'}
                      style={{ fontSize: 10, lineHeight: '16px', margin: 0, padding: '0 4px', flexShrink: 0 }}
                    >
                      {t(`wbs.noteType.${n.type}`)}
                    </Tag>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-relaxed m-0 ${n.status === 'resolved' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {n.content}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-slate-400">{n.author}</span>
                        <span className="text-[10px] text-slate-300">{dayjs(n.createdAt).format('MM/DD HH:mm')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/ni:opacity-100 transition-opacity">
                      {onResolve && (
                        <Tooltip title={n.status === 'pending' ? t('wbs.markResolved') : t('wbs.undoMark')}>
                          <button
                            className={`border-0 bg-transparent cursor-pointer p-0.5 rounded transition-colors ${n.status === 'resolved' ? 'text-green-500' : 'text-slate-300 hover:text-green-500 hover:bg-green-50'}`}
                            onClick={() => onResolve(n.id)}
                          >
                            <CheckIcon className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                      {onDelete && (
                        <Tooltip title={t('common.delete')}>
                          <button
                            className="border-0 bg-transparent cursor-pointer p-0.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                            onClick={() => onDelete(n.id)}
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Add form (always shown if no notes, toggled if has notes) ── */}
          {(!hasNotes || showAddForm) && (
            <div className={hasNotes ? 'border-t border-slate-100 pt-2' : ''}>
              <div className="flex gap-1 mb-2 flex-wrap">
                {(['決策', '行動項', '風險', '待確認'] as NoteType[]).map((nt) => (
                  <Tag
                    key={nt}
                    color={noteType === nt ? NOTE_TYPE_CONFIG[nt].antColor : 'default'}
                    style={{ fontSize: 10, lineHeight: '18px', margin: 0, padding: '0 6px', cursor: 'pointer' }}
                    onClick={() => setNoteType(nt)}
                  >
                    {t(`wbs.noteType.${nt}`)}
                  </Tag>
                ))}
              </div>
              <Input.TextArea
                rows={2}
                placeholder={noteType === '決策' ? t('wbs.noteTypePlaceholderDecision') + '...' : noteType === '行動項' ? t('wbs.noteTypePlaceholderAction') + '...' : noteType === '風險' ? t('wbs.noteTypePlaceholderRisk') + '...' : t('wbs.noteTypePlaceholderPending') + '...'}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onKeyDown={handleKeyDown}
                size="small"
                autoFocus
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[9px] text-slate-300">{t('wbs.noteSubmitHint')}</span>
                <div className="flex gap-1.5">
                  {hasNotes && <Button size="small" onClick={() => { setShowAddForm(false); setNoteContent('') }}>{t('common.cancel')}</Button>}
                  <Button size="small" type="primary" onClick={handleAdd} disabled={!noteContent.trim()}>{t('wbs.recordNote')}</Button>
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasNotes && !noteContent && (
            <p className="text-[10px] text-slate-300 text-center mt-1 mb-0">{t('wbs.noNotesYet')}</p>
          )}
        </div>
      }
    >
      {children}
    </Popover>
  )
}

// ─── Meeting Notes Panel ─────────────────────────────────────────────────────

const MeetingNotesPanel: React.FC<{
  notes: MeetingNote[]
  onAddProjectNote: (type: NoteType, content: string) => void
  onResolve: (noteId: string) => void
  onDelete: (noteId: string) => void
}> = ({ notes, onAddProjectNote, onResolve, onDelete }) => {
  const { t } = useTranslation()
  const pendingNotes = notes.filter((n) => n.status === 'pending')
  const resolvedNotes = notes.filter((n) => n.status === 'resolved')
  const [showResolved, setShowResolved] = useState(false)

  const displayedNotes = showResolved ? notes : pendingNotes

  return (
    <div className="border border-dashed border-blue-200 rounded-lg overflow-hidden bg-blue-50/20">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50/60 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-blue-700">{t('wbs.meetingNotes')}</span>
          {pendingNotes.length > 0 && (
            <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
              {pendingNotes.length}
            </span>
          )}
          {resolvedNotes.length > 0 && (
            <button
              className="border-0 bg-transparent cursor-pointer text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved ? t('wbs.hideResolved') : t('wbs.resolvedCount', { count: resolvedNotes.length })}
            </button>
          )}
        </div>
        <NotePopover onAdd={onAddProjectNote}>
          <button
            className="border-0 bg-transparent cursor-pointer flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded px-2 py-1 transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            {t('wbs.addNewNote')}
          </button>
        </NotePopover>
      </div>

      {/* Notes list */}
      {displayedNotes.length === 0 ? (
        <div className="px-4 py-4 text-center">
          <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6 text-slate-200 mx-auto mb-1" />
          <p className="text-[11px] text-slate-400">
            {notes.length === 0
              ? t('wbs.meetingNoteHint')
              : t('wbs.allNotesResolved')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-blue-50">
          {displayedNotes.map((note) => (
            <div
              key={note.id}
              className={`px-3 py-2.5 flex gap-2.5 items-start transition-colors hover:bg-blue-50/30 ${note.status === 'resolved' ? 'opacity-50' : ''}`}
            >
              <Tag
                color={NOTE_TYPE_CONFIG[note.type].antColor}
                style={{ fontSize: 9, lineHeight: '14px', margin: 0, padding: '0 4px', flexShrink: 0, marginTop: 2 }}
              >
                {t(`wbs.noteType.${note.type}`)}
              </Tag>
              <div className="flex-1 min-w-0">
                <p className={`text-[11px] leading-relaxed ${note.status === 'resolved' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {note.content}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {note.taskName && (
                    <span className="text-[9px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                      📌 {note.taskName}
                    </span>
                  )}
                  {!note.taskName && (
                    <span className="text-[9px] text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5">
                      {t('wbs.projectLevel')}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-300">
                    {note.author} · {dayjs(note.createdAt).format('HH:mm')}
                  </span>
                  {note.status === 'resolved' && (
                    <span className="text-[9px] text-green-500">{t('wbs.resolvedMark')}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Tooltip title={note.status === 'pending' ? t('wbs.markAsResolved') : t('wbs.undoResolve')}>
                  <button
                    className={`border-0 bg-transparent cursor-pointer p-1 rounded transition-colors ${note.status === 'resolved' ? 'text-green-500 hover:bg-green-50' : 'text-slate-300 hover:text-green-500 hover:bg-green-50'}`}
                    onClick={() => onResolve(note.id)}
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                <Tooltip title={t('wbs.deleteNote')}>
                  <button
                    className="border-0 bg-transparent cursor-pointer p-1 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                    onClick={() => onDelete(note.id)}
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Row Component ─────────────────────────────────────────────────────

const TaskRow: React.FC<{
  task: WbsTask
  context?: string
  onWeekTagClick?: (wt: WeekTag) => void
  expanded?: boolean
  onToggleExpand?: () => void
  notes?: MeetingNote[]
  onAddNote?: (type: NoteType, content: string) => void
  onResolveNote?: (noteId: string) => void
  onDeleteNote?: (noteId: string) => void
}> = ({ task, context, onWeekTagClick, expanded = false, onToggleExpand, notes = [], onAddNote, onResolveNote, onDeleteNote }) => {
  const { t } = useTranslation()
  const sc = STATUS_CONFIG[task.status]
  const isOverdue = !!task.is_overdue
  const isCompleted = task.status === 'completed'
  const hasHistory = (task.progress_history?.length ?? 0) > 0
  const pendingCount = notes.filter((n) => n.status === 'pending').length
  const hasPending = pendingCount > 0

  return (
    <>
      <div className={`group flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''} ${hasPending ? 'border-l-[3px] border-l-blue-400' : ''}`}>
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">{sc.icon}</div>

        {/* Task name + assignee */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-medium ${hasHistory ? 'cursor-pointer hover:underline decoration-dotted underline-offset-2' : ''} ${isCompleted ? 'text-blue-600 line-through decoration-blue-300' : isOverdue ? 'text-red-700' : 'text-slate-700'} ${hasHistory && !isCompleted ? 'hover:text-blue-600' : ''}`}
              onClick={(e) => { if (hasHistory) { e.stopPropagation(); onToggleExpand?.() } }}
            >
              {task.name}
              {hasHistory && (
                <EyeIcon className="w-3 h-3 inline-block ml-1 -mt-0.5 text-slate-300 group-hover:text-blue-400 transition-colors" />
              )}
            </span>
            <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{task.assignee}</span>
            {/* Week tags — clickable for quick filter */}
            {task.week_tag.map((wt) => (
              <span
                key={wt}
                className="text-[9px] font-medium rounded px-1.5 py-0.5 cursor-pointer hover:opacity-80 transition-opacity"
                style={{ color: WEEK_TAG_CONFIG[wt].color, background: WEEK_TAG_CONFIG[wt].bg }}
                onClick={(e) => { e.stopPropagation(); onWeekTagClick?.(wt) }}
              >
                {wt === 'last_week' ? t('wbs.lastWeek') : wt === 'this_week' ? t('wbs.thisWeek') : t('wbs.nextWeek')}
              </span>
            ))}
            {isOverdue && (
              <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
                {t('wbs.overdueDays', { days: task.days_overdue })}
              </Tag>
            )}
            {task.is_suspended && (
              <Tag color="warning" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
                {t('wbs.suspended')}
              </Tag>
            )}
          </div>
          {/* Shelve reason */}
          {task.is_suspended && (
            <div className="text-[10px] mt-1 text-amber-600 bg-amber-50 rounded px-2 py-1">
              {(task as unknown as { shelved_at?: string }).shelved_at && (
                <span className="font-semibold mr-1">{(task as unknown as { shelved_at?: string }).shelved_at}</span>
              )}
              <span className="font-semibold">{t('wbs.shelveReasonLabel')}</span>{(task as unknown as { shelve_reason?: string }).shelve_reason || '—'}
            </div>
          )}
          {/* Latest update for overdue / in_progress */}
          {task.latest_update && (task.is_overdue || task.status === 'in_progress') && (
            <div className={`text-[10px] mt-1 leading-relaxed ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
              <span className="font-medium">{t('wbs.latestProgressLabel')}</span>
              <RichTextContent html={task.latest_update} />
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 flex-shrink-0 w-[120px]">
          {isCompleted ? (
            <span className="text-xs font-semibold text-blue-600">{t('wbs.doneLabel')}</span>
          ) : (
            <>
              <Progress
                percent={task.progress}
                size="small"
                strokeColor={isOverdue ? '#f87171' : task.progress >= 80 ? '#16a34a' : '#2563eb'}
                trailColor="#e2e8f0"
                style={{ width: 70, marginBottom: 0 }}
                format={() => ''}
              />
              <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-500' : 'text-slate-500'}`}>{task.progress}%</span>
            </>
          )}
        </div>

        {/* Expected / actual end date */}
        <div className="flex-shrink-0 text-right w-[85px]">
          {isCompleted ? (
            <Tooltip title={t('wbs.plannedActual', { expected: task.expected_end, actual: task.actual_end })}>
              <span className="text-[10px] text-blue-600">{task.actual_end}</span>
            </Tooltip>
          ) : (task.reschedule_count ?? 0) > 0 ? (
            <Tooltip title={t('wbs.rescheduledDetail', { count: task.reschedule_count, original: task.original_end })}>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-slate-300 line-through">{task.original_end}</span>
                <span className="text-[10px] text-orange-500 font-semibold">{task.expected_end}</span>
                <span className="text-[8px] text-orange-400">{t('wbs.rescheduledTimes', { count: task.reschedule_count })}</span>
              </div>
            </Tooltip>
          ) : (
            <Tooltip title={t('wbs.expectedEndTooltip')}>
              <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
                {task.expected_end}
              </span>
            </Tooltip>
          )}
        </div>

        {/* Meeting note button — click to view notes + add new */}
        {onAddNote && (
          <div className="flex-shrink-0 w-[24px] flex items-center justify-center">
            <NotePopover taskName={task.name} context={context} notes={notes} onAdd={onAddNote} onResolve={onResolveNote} onDelete={onDeleteNote}>
              <button
                className={`border-0 bg-transparent cursor-pointer relative p-0.5 rounded transition-all ${hasPending || notes.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} hover:bg-blue-50`}
                onClick={(e) => e.stopPropagation()}
                title={hasPending ? t('wbs.pendingNoteCount', { count: pendingCount }) : t('wbs.meetingNotes')}
              >
                <ChatBubbleOvalLeftEllipsisIcon className={`w-3.5 h-3.5 transition-colors ${hasPending ? 'text-blue-500' : notes.length > 0 ? 'text-blue-300' : 'text-slate-400 hover:text-blue-500'}`} />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[8px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center leading-none">
                    {pendingCount > 9 ? '9+' : pendingCount}
                  </span>
                )}
              </button>
            </NotePopover>
          </div>
        )}

      </div>
      {/* Expandable progress detail */}
      {expanded && <TaskProgressDetail task={task} />}
    </>
  )
}

// ─── Function Module Component (collapsible) ────────────────────────────────

const FunctionModule: React.FC<{
  func: WbsFunction
  reqName?: string
  defaultOpen?: boolean
  onWeekTagClick?: (wt: WeekTag) => void
  expandedTaskId: string | null
  onToggleTaskExpand: (taskId: string) => void
  notesByTaskId: Record<string, MeetingNote[]>
  onAddNote: (taskId: string, taskName: string, type: NoteType, content: string) => void
  onResolveNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
}> = ({ func, reqName, defaultOpen = false, onWeekTagClick, expandedTaskId, onToggleTaskExpand, notesByTaskId, onAddNote, onResolveNote, onDeleteNote }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(defaultOpen)
  const overdueCount = func.tasks.filter((t) => !!t.is_overdue).length
  const completedCount = func.tasks.filter((t) => t.status === 'completed').length
  const thisWeekCount = func.tasks.filter((t) => t.week_tag.includes('this_week')).length
  // 根据当前过滤后的任务重新计算进度（而非后端原始分组进度）
  const calcProgress = func.tasks.length ? Math.round(func.tasks.reduce((s, t) => s + t.progress, 0) / func.tasks.length) : 0

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden mb-2 last:mb-0">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 cursor-pointer hover:bg-slate-100/60 transition-colors select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDownIcon className="w-3 h-3 text-slate-400 transition-transform" />
          : <ChevronRightIcon className="w-3 h-3 text-slate-400 transition-transform" />
        }
        <span className="text-xs font-semibold text-slate-600">{formatGroupName(func.name) || func.name}</span>
        {func.name !== '功能任務' && func.name !== '__nogroup__' && (
          <>
            <Progress
              percent={calcProgress}
              size="small"
              strokeColor={calcProgress >= 100 ? '#16a34a' : calcProgress >= 60 ? '#2563eb' : '#d97706'}
              trailColor="#e2e8f0"
              style={{ width: 60, marginBottom: 0 }}
              format={() => ''}
            />
            <span className="text-[10px] font-semibold text-slate-500">{calcProgress}%</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{t('wbs.doneCount', { done: completedCount, total: func.tasks.length })}</span>
          {thisWeekCount > 0 && (
            <Tag color="blue" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              {t('wbs.thisWeekCountLabel', { count: thisWeekCount })}
            </Tag>
          )}
          {overdueCount > 0 && (
            <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              {t('wbs.overdueCountLabel', { count: overdueCount })}
            </Tag>
          )}
        </div>
      </div>
      {expanded && (
        <div>
          {func.tasks.map((t) => {
            const ctx = [reqName, formatGroupName(func.name) || func.name].filter(Boolean).join(' / ')
            const ctxPlain = [reqName, formatGroupNamePlain(func.name) || func.name].filter(Boolean).join(' / ')
            const fullName = ctxPlain ? `${ctxPlain} / ${t.name}` : t.name
            return (
            <TaskRow
              key={t.id}
              task={t}
              context={ctx || undefined}
              onWeekTagClick={onWeekTagClick}
              expanded={expandedTaskId === t.id}
              onToggleExpand={() => onToggleTaskExpand(t.id)}
              notes={notesByTaskId[t.id] ?? []}
              onAddNote={(type, content) => onAddNote(t.id, fullName, type, content)}
              onResolveNote={onResolveNote}
              onDeleteNote={onDeleteNote}
            />
          )})}
        </div>
      )}
    </div>
  )
}

// ─── Requirement Group Wrapper (按需求模式的外層需求摺疊) ────────────────────

const ReqGroupWrapper: React.FC<{
  name: string
  progress: number
  taskCount: number
  overdueCount: number
  isShelved?: boolean
  shelveReason?: string
  shelvedAt?: string
  children: React.ReactNode
}> = ({ name, progress, taskCount, overdueCount, isShelved, shelveReason, shelvedAt, children }) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`border rounded-lg overflow-hidden mb-2 last:mb-0 ${isShelved ? 'border-amber-300 opacity-70' : 'border-purple-200'}`}>
      <div
        className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors select-none ${isShelved ? 'bg-amber-50/80 hover:bg-amber-100/60' : 'bg-purple-50/80 hover:bg-purple-100/60'}`}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDownIcon className={`w-3 h-3 transition-transform ${isShelved ? 'text-amber-400' : 'text-purple-400'}`} />
          : <ChevronRightIcon className={`w-3 h-3 transition-transform ${isShelved ? 'text-amber-400' : 'text-purple-400'}`} />
        }
        <span className={`text-xs font-semibold ${isShelved ? 'text-amber-700' : 'text-purple-700'}`}>{name}</span>
        {isShelved && <Tag color="warning" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>{t('wbs.suspended')}</Tag>}
        <Progress
          percent={progress} size="small"
          strokeColor={progress >= 100 ? '#16a34a' : '#7c3aed'}
          trailColor="#e9d5ff"
          style={{ width: 60, marginBottom: 0 }}
          format={() => ''}
        />
        <span className="text-[10px] font-semibold text-purple-600">{progress}%</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{t('common.itemCount', { count: taskCount })}</span>
          {overdueCount > 0 && (
            <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              {t('wbs.overdueCountLabel', { count: overdueCount })}
            </Tag>
          )}
        </div>
      </div>
      {isShelved && (
        <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-700">
          {shelvedAt && <span className="font-semibold mr-1">{shelvedAt}</span>}
          <span className="font-semibold">{t('wbs.shelveReasonLabel')}</span> {shelveReason || '—'}
        </div>
      )}
      {expanded && <div className="pl-2 pr-1 py-1">{children}</div>}
    </div>
  )
}

// ─── Project Card Component ─────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: WbsProject
  originalProject: WbsProject
  onWeekTagClick?: (wt: WeekTag) => void
  expandedTaskId: string | null
  onToggleTaskExpand: (taskId: string) => void
  notes: MeetingNote[]
  onAddNote: (taskId: string | null, taskName: string | null, type: NoteType, content: string) => void
  onResolveNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
  groupMode?: 'by_group' | 'by_req'
}> = ({ project, originalProject, onWeekTagClick, expandedTaskId, onToggleTaskExpand, notes, onAddNote, onResolveNote, onDeleteNote, groupMode = 'by_group' }) => {
  const { t } = useTranslation()

  // Use ORIGINAL project data for summary stats to avoid filter distortion
  const totalTasks = originalProject.functions.reduce((s, f) => s + f.tasks.length, 0)
  const completedTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.status === 'completed').length, 0)
  const overdueTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => !!t.is_overdue).length, 0)
  const thisWeekTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('this_week')).length, 0)
  const nextWeekTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('next_week')).length, 0)
  const lastWeekCompleted = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('last_week') && t.status === 'completed').length, 0)

  const filteredTaskCount = project.functions.reduce((s, f) => s + f.tasks.length, 0)
  const totalWbsTasks = originalProject.functions.reduce((s, f) => s + f.tasks.length, 0)
  const isFiltered = filteredTaskCount !== totalWbsTasks

  const priorityColor = originalProject.priority >= 4 ? '#dc2626' : originalProject.priority >= 3 ? '#d97706' : originalProject.priority >= 2 ? '#2563eb' : '#94a3b8'
  const priorityLabel = originalProject.priority >= 4 ? t('wbs.priorityUrgent') : originalProject.priority >= 3 ? t('wbs.priorityHigh') : originalProject.priority >= 2 ? t('wbs.priorityMedium') : t('wbs.priorityLow')

  const pendingNoteCount = notes.filter((n) => n.status === 'pending').length

  // Group notes by taskId (task-level notes for inline display)
  const notesByTaskId = useMemo(() => {
    const map: Record<string, MeetingNote[]> = {}
    notes.forEach((n) => {
      if (n.taskId) {
        ;(map[n.taskId] = map[n.taskId] ?? []).push(n)
      }
    })
    return map
  }, [notes])

  // Auto-expand notes panel when first note is added
  const [showNotes, setShowNotes] = useState(false)
  const prevNoteCountRef = React.useRef(notes.length)
  React.useEffect(() => {
    if (notes.length > prevNoteCountRef.current) {
      setShowNotes(true)
    }
    prevNoteCountRef.current = notes.length
  }, [notes.length])

  return (
    <Collapse
      defaultActiveKey={[]}
      className="mb-4 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
      expandIconPosition="end"
    >
      <Panel
        key="main"
        header={
          <div className="flex items-center gap-3 flex-wrap">
            <FolderIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            {/* Clickable project name → navigate to detail */}
            <span
              className="font-semibold text-slate-700 text-sm hover:text-blue-600 cursor-pointer hover:underline decoration-dotted underline-offset-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); window.open(`/projects/${originalProject.id}`, '_blank') }}
            >
              {originalProject.name}
            </span>
            <Tag style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px', color: priorityColor, borderColor: priorityColor + '44', background: priorityColor + '0D' }}>
              {priorityLabel}
            </Tag>
            <span className="text-[10px] text-slate-400">PM: {originalProject.pm}</span>
            {overdueTasks > 0 && (
              <div className="flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] text-red-500 font-semibold">{t('wbs.overdueItems', { count: overdueTasks })}</span>
              </div>
            )}
            {pendingNoteCount > 0 && (
              <div className="flex items-center gap-1">
                <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-blue-500 font-semibold">{t('wbs.pendingNotes', { count: pendingNoteCount })}</span>
              </div>
            )}
            {isFiltered && (
              <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 4px' }} color="processing">
                {t('wbs.filterShowing', { shown: filteredTaskCount, total: totalWbsTasks })}
              </Tag>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Tooltip title={t('wbs.overallProgressTooltip')}>
              <div className="flex items-center gap-1.5">
                <Progress
                  type="circle"
                  percent={originalProject.progress}
                  size={32}
                  strokeColor={originalProject.progress >= 80 ? '#16a34a' : originalProject.progress >= 40 ? '#2563eb' : '#d97706'}
                  format={(p) => <span className="text-[9px] font-bold">{p}%</span>}
                />
              </div>
            </Tooltip>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">{t('wbs.doneCount', { done: completedTasks, total: totalTasks })}</div>
              <div className="text-[10px] text-slate-400">{t('wbs.dueDate', { date: originalProject.expected_end })}</div>
            </div>
          </div>
        }
      >
        {/* Week summary banner */}
        <div className="flex gap-3 mb-3 px-1">
          <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[10px] text-slate-400 mb-0.5">{t('wbs.lastWeekDone')}</div>
            <div className="text-sm font-bold text-slate-600">{lastWeekCompleted} {t('wbs.unitItem')}</div>
          </div>
          <div className="flex-1 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <div className="text-[10px] text-blue-500 mb-0.5">{t('wbs.thisWeekInProgress')}</div>
            <div className="text-sm font-bold text-blue-600">{thisWeekTasks} {t('wbs.unitItem')}</div>
          </div>
          <div className="flex-1 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
            <div className="text-[10px] text-violet-500 mb-0.5">{t('wbs.nextWeekTodo')}</div>
            <div className="text-sm font-bold text-violet-600">{nextWeekTasks} {t('wbs.unitItem')}</div>
          </div>
          {overdueTasks > 0 && (
            <div className="flex-1 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <div className="text-[10px] text-red-500 mb-0.5">{t('wbs.overdueTask')}</div>
              <div className="text-sm font-bold text-red-600">{overdueTasks} {t('wbs.unitItem')}</div>
            </div>
          )}
        </div>

        {/* Function modules (filtered) */}
        {groupMode === 'by_req' ? (() => {
          const allTasks = project.functions.flatMap((f) => f.tasks)
          const reqMap = new Map<string, { name: string; tasks: WbsTask[]; reqStatus?: number; shelveReason?: string; shelvedAt?: string }>()
          allTasks.forEach((t) => {
            const key = t.requirement_id || '__none__'
            const ext = t as unknown as { requirement_status?: number; requirement_shelve_reason?: string; requirement_shelved_at?: string }
            if (!reqMap.has(key)) reqMap.set(key, { name: t.requirement_nm || '', tasks: [], reqStatus: ext.requirement_status, shelveReason: ext.requirement_shelve_reason, shelvedAt: ext.requirement_shelved_at })
            reqMap.get(key)!.tasks.push(t)
          })

          // Given a task set, get the original function groups that contain those tasks
          const buildSubFunctions = (tasks: WbsTask[]) => {
            const ids = new Set(tasks.map((t) => t.id))
            return project.functions
              .map((f) => ({ ...f, tasks: f.tasks.filter((t) => ids.has(t.id)) }))
              .filter((f) => f.tasks.length > 0)
          }

          // Render tasks directly (no inner group header) — used when only one group
          const renderDirectTasks = (tasks: WbsTask[], rName?: string) =>
            tasks.map((t) => {
              const fullName = rName ? `${rName} / ${t.name}` : t.name
              return (
              <TaskRow key={t.id} task={t}
                context={rName || undefined}
                onWeekTagClick={onWeekTagClick}
                expanded={expandedTaskId === t.id}
                onToggleExpand={() => onToggleTaskExpand(t.id)}
                notes={notesByTaskId[t.id] ?? []}
                onAddNote={(type, content) => onAddNote(t.id, fullName, type, content)}
                onResolveNote={onResolveNote}
                onDeleteNote={onDeleteNote}
              />
            )})

          // Render FunctionModules with group headers — used when multiple groups
          const renderFuncModules = (fns: typeof project.functions, rName?: string) =>
            fns.map((f) => (
              <FunctionModule key={f.id} func={f} reqName={rName}
                defaultOpen={false}
                onWeekTagClick={onWeekTagClick} expandedTaskId={expandedTaskId}
                onToggleTaskExpand={onToggleTaskExpand} notesByTaskId={notesByTaskId}
                onAddNote={(tid, tnm, type, content) => onAddNote(tid, tnm, type, content)}
                onResolveNote={onResolveNote} onDeleteNote={onDeleteNote}
              />
            ))

          const reqGroups = [...reqMap.entries()]
            .filter(([key]) => key !== '__none__')
            .map(([key, { name, tasks, reqStatus, shelveReason, shelvedAt }]) => ({
              key, name, tasks, reqStatus, shelveReason, shelvedAt,
              subFunctions: buildSubFunctions(tasks),
              progress: tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0,
              overdueCount: tasks.filter((t) => !!t.is_overdue).length,
            }))

          const noReqFunctions = buildSubFunctions(reqMap.get('__none__')?.tasks ?? [])

          return (
            <>
              {reqGroups.map((g) => (
                <ReqGroupWrapper key={g.key} name={g.name} progress={g.progress}
                  taskCount={g.tasks.length} overdueCount={g.overdueCount}
                  isShelved={g.reqStatus === 8} shelveReason={g.shelveReason} shelvedAt={g.shelvedAt}>
                  {/* Single group → show tasks directly; multiple groups → show with group headers */}
                  {g.subFunctions.length === 1
                    ? renderDirectTasks(g.subFunctions[0].tasks, g.name)
                    : renderFuncModules(g.subFunctions, g.name)}
                </ReqGroupWrapper>
              ))}
              {/* Tasks with no requirement → use original function groups directly */}
              {renderFuncModules(noReqFunctions)}
            </>
          )
        })() : project.functions.map((f) => (
          <FunctionModule
            key={f.id}
            func={f}
            defaultOpen={false}
            onWeekTagClick={onWeekTagClick}
            expandedTaskId={expandedTaskId}
            onToggleTaskExpand={onToggleTaskExpand}
            notesByTaskId={notesByTaskId}
            onAddNote={(taskId, taskName, type, content) => onAddNote(taskId, taskName, type, content)}
            onResolveNote={onResolveNote}
            onDeleteNote={onDeleteNote}
          />
        ))}

        {/* Meeting Notes Section — all notes (task-level + project-level) */}
        <div className="mt-3 px-1">
          <button
            className="border-0 bg-transparent cursor-pointer w-full flex items-center gap-2 py-1.5 text-left group/notes"
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes
              ? <ChevronDownIcon className="w-3 h-3 text-blue-400" />
              : <ChevronRightIcon className="w-3 h-3 text-slate-400 group-hover/notes:text-blue-400 transition-colors" />
            }
            <ChatBubbleOvalLeftEllipsisIcon className={`w-3.5 h-3.5 ${showNotes || pendingNoteCount > 0 ? 'text-blue-500' : 'text-slate-400 group-hover/notes:text-blue-400 transition-colors'}`} />
            <span className={`text-[11px] font-semibold ${showNotes || pendingNoteCount > 0 ? 'text-blue-600' : 'text-slate-400 group-hover/notes:text-blue-500 transition-colors'}`}>
              {t('wbs.meetingNotes')}
            </span>
            {pendingNoteCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {pendingNoteCount}
              </span>
            )}
            {notes.length === 0 && (
              <span className="text-[10px] text-slate-300">{t('wbs.clickToExpandHint')}</span>
            )}
          </button>
          {showNotes && (
            <MeetingNotesPanel
              notes={notes}
              onAddProjectNote={(type, content) => onAddNote(null, null, type, content)}
              onResolve={onResolveNote}
              onDelete={onDeleteNote}
            />
          )}
        </div>
      </Panel>
    </Collapse>
  )
}

// ─── Report Preview Modal (matching 专案周报.pptx template) ────────────────

// Status → color mapping matching template
const RPT_STATUS_COLOR: Record<string, string> = {
  completed: '#0070C0', in_progress: '#00B050', overdue: '#FF0000', not_started: '#94a3b8', suspended: '#d97706',
}

function _taskStatusLabel(task: WbsTask, t: (key: string) => string): { label: string; color: string } {
  if (task.status === 'completed') return { label: t('wbs.rpt.completed'), color: RPT_STATUS_COLOR.completed }
  if (task.status === 'suspended' || task.is_suspended) return { label: t('wbs.rpt.suspended'), color: RPT_STATUS_COLOR.suspended }
  if (task.is_overdue) return { label: 'delay', color: RPT_STATUS_COLOR.overdue }
  if (task.status === 'in_progress') return { label: t('wbs.rpt.inProgress'), color: RPT_STATUS_COLOR.in_progress }
  return { label: t('wbs.rpt.notStarted'), color: RPT_STATUS_COLOR.not_started }
}

const isUuidStr = (s: string) => /^[0-9a-f]{32}$/i.test(s) || /^[0-9a-f-]{36}$/i.test(s)

const ReportPreviewModal: React.FC<{
  open: boolean
  projects: WbsProject[]
  duties: TemporaryDuty[]
  systemInfoMap: Record<string, SystemItem>
  reqNameMap: Record<string, string>
  reqResponsibleMap: Record<string, string[]>
  reqStatusMap: Record<string, number>
  reqShelveReasonMap: Record<string, string>
  reqShelvedAtMap: Record<string, string>
  meetingNotes: Record<string, MeetingNote[]>
  dutyNotes: Record<string, MeetingNote[]>
  toName: (wn: string) => string
  onClose: () => void
}> = ({ open, projects, duties, systemInfoMap, reqNameMap, reqResponsibleMap, reqStatusMap, reqShelveReasonMap, reqShelvedAtMap, meetingNotes, dutyNotes, toName, onClose }) => {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)

  // ── Pending-note helpers ──────────────────────────────────────────────────
  const getDutyPendingNotes = useCallback((d: TemporaryDuty): MeetingNote[] => {
    const noteKey = d.system_id || 'ar_standalone'
    return (dutyNotes[noteKey] ?? []).filter((n) => n.taskId === d.id && n.status === 'pending')
  }, [dutyNotes])

  const getTaskPendingNotes = useCallback((projectId: string, taskId: string): MeetingNote[] => {
    return (meetingNotes[projectId] ?? []).filter((n) => n.taskId === taskId && n.status === 'pending')
  }, [meetingNotes])

  // Group duties by system / standalone AR
  const systemDutiesMap = useMemo(() => {
    const map = new Map<string, TemporaryDuty[]>()
    duties.forEach((d) => {
      if (d.system_id) {
        if (!map.has(d.system_id)) map.set(d.system_id, [])
        map.get(d.system_id)!.push(d)
      }
    })
    return map
  }, [duties])

  const arDuties = useMemo(() => duties.filter((d) => !d.system_id), [duties])

  // Only show duties whose expected_end falls within last/this/next week,
  // OR that have pending meeting notes (force-show for accountability — approach A)
  const isDutyVisible = useCallback((d: TemporaryDuty) => {
    if (d.status === 8) {
      // 搁置的任务按 updated_at 判断是否在上周/本周内
      const upd = (d as unknown as { updated_at?: string }).updated_at?.slice(0, 10)
      if (!upd) return false
      const dt = dayjs(upd)
      const tw = dayjs().startOf('isoWeek')
      const nwEnd = tw.add(2, 'week')
      return !dt.isBefore(tw.subtract(1, 'week')) && dt.isBefore(nwEnd)
    }
    return computeDutyWeekTags(d).length > 0 || getDutyPendingNotes(d).length > 0
  }, [getDutyPendingNotes])

  // Render a single duty task line — mirrors renderTaskRow for projects (with reschedule info)
  const renderDutyTask = (d: TemporaryDuty, indent: number) => {
    const { label, color } = _dutyStatusLabel(d, t)
    const isShelved = d.status === 8
    const lineColor = d.status === 3 ? '#0070C0' : '#000'
    const hasReschedule = !isShelved && (d.reschedule_count ?? 0) > 0 && !!d.original_end_date
    const rescheduleReason = d.reschedule_history?.at(-1)?.reason
    const dateStr = isShelved ? null
      : d.status === 3
        ? t('wbs.rpt.completedOnDate', { date: d.end_time?.slice(0, 10) || d.expected_end_date })
        : d.expected_end_date ? t('wbs.rpt.targetDate', { date: d.expected_end_date }) : null
    // 搁置的任务按 updated_at 计算周标签
    const weekTags = isShelved
      ? (() => {
          const upd = (d as unknown as { updated_at?: string }).updated_at?.slice(0, 10)
          if (!upd) return []
          const tags: WeekTag[] = []
          const dt = dayjs(upd)
          const tw = dayjs().startOf('isoWeek')
          const lw = tw.subtract(1, 'week')
          if (!dt.isBefore(lw) && dt.isBefore(tw)) tags.push('last_week')
          else if (!dt.isBefore(tw) && dt.isBefore(tw.add(1, 'week'))) tags.push('this_week')
          return tags
        })()
      : computeDutyWeekTags(d)
    const pendingNotes = getDutyPendingNotes(d)
    const isOutsideWindow = weekTags.length === 0
    return (
      <div key={d.id} style={{ paddingLeft: indent, marginBottom: pendingNotes.length > 0 ? 4 : 0 }}>
        <div style={{ color: isOutsideWindow ? '#6b7280' : lineColor }}>
          <span>- </span>
          <span style={{ color, fontWeight: 700 }}>({label})</span>
          <span> {d.duty_nm}</span>
          {d.responsible?.length ? <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 4 }}>({d.responsible.map((wn) => toName(wn) || wn).join(', ')})</span> : null}
          {hasReschedule ? (
            <span>
              {' ('}
              <s style={{ color: '#aaa', fontSize: 11 }}>{d.original_end_date}</s>
              <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 3 }}>{d.expected_end_date}</span>
              <span style={{ color: '#d97706', fontSize: 10, marginLeft: 2 }}>{t('wbs.rpt.rescheduledTimes', { count: d.reschedule_count })}</span>
              {')'}
            </span>
          ) : dateStr ? (
            <span style={{ color: '#6b7280', marginLeft: 4 }}>({dateStr})</span>
          ) : null}
          {weekTags.map((wt) => (
            <span key={wt} style={{ color: WEEK_TAG_CONFIG[wt].color, fontWeight: 700, marginLeft: 3 }}>
              [{wt === 'last_week' ? t('wbs.lastWeek') : wt === 'this_week' ? t('wbs.thisWeek') : t('wbs.nextWeek')}]
            </span>
          ))}
          {isOutsideWindow && pendingNotes.length > 0 && (
            <span style={{ color: '#d97706', fontSize: 10, marginLeft: 4 }}>[{t('wbs.rpt.hasPendingNotes')}]</span>
          )}
          {hasReschedule && rescheduleReason && (
            <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
              ↳ {t('wbs.rpt.rescheduleReason')}{rescheduleReason}
            </div>
          )}
          {d.status === 8 && (
            <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
              ↳ {((d as unknown as { updated_at?: string }).updated_at ?? '').slice(0, 10)} {t('wbs.shelveReasonLabel')}{(d as unknown as { shelve_reason?: string }).shelve_reason || '—'}
            </div>
          )}
        </div>
        {pendingNotes.map((n) => (
          <div key={n.id} style={{ paddingLeft: 16, marginTop: 2, color: '#92400e', fontSize: 11, background: '#fffbeb', borderLeft: '3px solid #f59e0b', paddingTop: 2, paddingBottom: 2 }}>
            💬 [{t(`wbs.noteType.${n.type}`)}] {n.content}
          </div>
        ))}
      </div>
    )
  }

  // Render duties in requirement → group → task hierarchy (mirrors project task sections)
  const renderDutyProgress = (dutyList: TemporaryDuty[]) => {
    const visible = dutyList.filter(isDutyVisible)
    if (visible.length === 0) return <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('wbs.noWeeklyUpdate')}</span>

    // Group all duties by req (use full list for structure, filter per section)
    const byReq = new Map<string, TemporaryDuty[]>()
    dutyList.forEach((d) => {
      const key = d.standalone_req_id || '__none__'
      if (!byReq.has(key)) byReq.set(key, [])
      byReq.get(key)!.push(d)
    })

    // Sort: named reqs first (by req name), then __none__
    const sortedReqs = [...byReq.entries()].sort(([a], [b]) => {
      if (a === '__none__') return 1
      if (b === '__none__') return -1
      return (reqNameMap[a] ?? a).localeCompare(reqNameMap[b] ?? b, 'zh-TW')
    })

    let secIdx = 0
    return sortedReqs.map(([reqKey, reqDuties]) => {
      const reqVisible = reqDuties.filter(isDutyVisible)
      if (reqVisible.length === 0) return null
      const reqNm = reqKey !== '__none__' ? (reqNameMap[reqKey] ?? null) : null
      secIdx++
      const num = secIdx

      // Group by duty.group within req, sort: named groups first, then __nogroup__
      const byGroup = new Map<string, TemporaryDuty[]>()
      reqVisible.forEach((d) => {
        const g = (d.group && !isUuidStr(d.group)) ? d.group : '__nogroup__'
        if (!byGroup.has(g)) byGroup.set(g, [])
        byGroup.get(g)!.push(d)
      })
      const sortedGroups = [...byGroup.entries()].sort(([a], [b]) => {
        if (a === '__nogroup__') return 1
        if (b === '__nogroup__') return -1
        return a.localeCompare(b, 'zh-TW')
      })
      const singleUnnamed = sortedGroups.length === 1 && sortedGroups[0][0] === '__nogroup__'

      return (
        <div key={reqKey} style={{ marginBottom: 4 }}>
          {reqNm && (
            <div style={{ fontWeight: 700, color: reqStatusMap[reqKey] === 8 ? '#d97706' : '#002FA7' }}>
              {num}. {reqNm}
              {reqStatusMap[reqKey] === 8 && <span style={{ color: '#d97706', fontWeight: 700, fontSize: 12 }}> [{t('wbs.rpt.suspended')}]</span>}
              {reqStatusMap[reqKey] === 8 && (
                <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11, fontWeight: 400 }}>
                  ↳ {reqShelvedAtMap[reqKey] || ''} {t('wbs.shelveReasonLabel')}{reqShelveReasonMap[reqKey] || '—'}
                </div>
              )}
            </div>
          )}
          {singleUnnamed ? (
            sortedGroups[0][1]
              .sort((a, b) => (a.expected_end_date ?? '').localeCompare(b.expected_end_date ?? ''))
              .map((d) => renderDutyTask(d, reqNm ? 16 : 0))
          ) : (
            sortedGroups.map(([grp, grpDuties]) => (
              <div key={grp}>
                {grp !== '__nogroup__' && (
                  <div style={{ fontWeight: 600, color: '#374151', paddingLeft: reqNm ? 12 : 0 }}>▸ {formatGroupName(grp) || grp}</div>
                )}
                {grpDuties
                  .sort((a, b) => (a.expected_end_date ?? '').localeCompare(b.expected_end_date ?? ''))
                  .map((d) => renderDutyTask(d, reqNm ? (grp !== '__nogroup__' ? 24 : 16) : (grp !== '__nogroup__' ? 16 : 0)))}
              </div>
            ))
          )}
        </div>
      )
    })
  }

  const TD_MID: React.CSSProperties = { verticalAlign: 'middle', border: '1px solid #B4C6E7', color: '#000' }
  const TD_CENTER: React.CSSProperties = { ...TD_MID, textAlign: 'center', whiteSpace: 'nowrap' }

  const handleExportPptx = async () => {
    setExporting(true)
    const department = projects[0]?.department || t('wbs.rpt.defaultDept')
    try {
      await exportWbsPptx(
        projects, department, duties, systemInfoMap as Record<string, { sys_nm: string; maintainers?: string[] }>,
        reqNameMap, reqResponsibleMap, reqStatusMap, reqShelveReasonMap, reqShelvedAtMap, toName, isDutyVisible,
      )
    } finally { setExporting(false) }
  }

  const handlePrint = () => {
    const el = document.getElementById('wbs-weekly-report')
    if (!el) return
    const win = window.open('', '_blank', 'width=1200,height=800')
    if (!win) return
    win.document.write(`<html><head><title>${t('wbs.weeklyReportTitle')}</title><style>
      *{box-sizing:border-box}body{font-family:'Microsoft YaHei',Arial,sans-serif;margin:1cm;font-size:14px}
      table{border-collapse:collapse;width:100%}
      th{background:#002FA7;color:#fff;padding:8px 6px;font-size:14px;text-align:center;border:1px solid #002FA7}
      td{border:1px solid #B4C6E7;padding:6px 8px;vertical-align:top;font-size:14px}
      @media print{@page{size:A3 landscape;margin:.8cm}}
    </style></head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 400)
  }

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          <PresentationChartBarIcon className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-slate-700">{t('wbs.weeklyReportTitle')}</span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width="96%"
      style={{ top: 16 }}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={handlePrint} icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />}>
            {t('wbs.printOrPdf')}
          </Button>
          <Button
            type="primary"
            loading={exporting}
            onClick={handleExportPptx}
            icon={<PresentationChartBarIcon className="w-3.5 h-3.5" />}
            style={{ background: '#002FA7' }}
          >
            {t('wbs.exportPptx')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </div>
      }
      destroyOnHidden
    >
      <div className="overflow-auto max-h-[75vh]">
        <div id="wbs-weekly-report">
          {/* Header: logo + title + legend */}
          {/* Logo top-left + Legend top-right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: 4 }}>
            <img src={reportLogoUrl} alt="logo" style={{ height: 36 }} />
            <div style={{ fontSize: 12 }}>
              <span style={{ color: '#0070C0' }}>●{t('wbs.rpt.completed')}</span>
              <span>{'   '}</span>
              <span style={{ color: '#00B050' }}>●{t('wbs.rpt.inProgress')}</span>
              <span>{'   '}</span>
              <span style={{ color: '#FFC000' }}>●{t('wbs.rpt.risk')}</span>
              <span>{' '}</span>
              <span style={{ color: '#FF0000' }}>●delay</span>
            </div>
          </div>
          {/* Title centered */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <span style={{ color: '#0070C0', fontSize: 20, fontWeight: 700 }}>
              {projects[0]?.department || t('wbs.rpt.defaultDept')} ({t('wbs.rpt.system')}) – Overview
            </span>
          </div>

          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, fontFamily: "'Microsoft YaHei',Arial,sans-serif" }}>
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '3.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '49%' }} />
            </colgroup>
            <thead>
              <tr>
                {[t('wbs.rpt.colProgress'), t('wbs.rpt.colSeq'), t('wbs.rpt.colTopItems'), `${t('wbs.rpt.colReqUser')}\n${t('wbs.rpt.colProjectPM')}`, 'DRI', t('wbs.rpt.colStartDate'), t('wbs.rpt.colEndDate'), t('wbs.rpt.colProgress')].map((h) => (
                  <th key={h} style={{ background: '#002FA7', color: '#fff', padding: '8px 5px', fontSize: 14, textAlign: 'center', border: '1px solid #002FA7', whiteSpace: 'pre-line' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.filter((project) => project.functions.some((f) => f.tasks.some((t) =>
                t.week_tag.length > 0 || (t.is_overdue && t.status !== 'completed') || t.is_suspended
              ))).map((project, idx) => {
                const dotClr = `#${_projectDotColor(project)}`

                return (
                  <tr key={project.id}>
                    {/* ● dot */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', fontSize: 18, border: '1px solid #B4C6E7', background: '#fff' }}>
                      <span style={{ color: dotClr }}>●</span>
                    </td>
                    {/* 序號 */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', border: '1px solid #B4C6E7' }}>{idx + 1}</td>
                    {/* 重點項目 */}
                    <td style={{ verticalAlign: 'middle', border: '1px solid #B4C6E7', color: '#000' }}>
                      {project.name}
                      {project.is_completed && (
                        <span style={{ marginLeft: 4, color: '#2563eb', fontWeight: 700, fontSize: 11 }}>[{t('wbs.rpt.closed')}]</span>
                      )}
                    </td>
                    {/* 需求使用者（產品PM） */}
                    <td style={{ verticalAlign: 'middle', border: '1px solid #B4C6E7', color: '#000' }}>
                      {project.product_pm || project.pm}
                    </td>
                    {/* DRI — 只顯示專案PM */}
                    <td style={{ verticalAlign: 'middle', border: '1px solid #B4C6E7', color: '#000' }}>
                      {project.pm}
                    </td>
                    {/* 專案啟動日 */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', border: '1px solid #B4C6E7', color: '#000', whiteSpace: 'nowrap' }}>
                      {project.start_date ?? '-'}
                    </td>
                    {/* 結案日（完結專案顯示實際完結日，否則顯示預計） */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', border: '1px solid #B4C6E7', color: project.is_completed ? '#2563eb' : '#000', whiteSpace: 'nowrap', fontWeight: project.is_completed ? 700 : 400 }}>
                      {project.is_completed ? (project.end_time || project.expected_end || '-') : (project.expected_end || '-')}
                    </td>
                    {/* 進度 — rich-text matching template style */}
                    <td style={{ verticalAlign: 'top', border: '1px solid #B4C6E7', lineHeight: 1.8 }}>
                      {(() => {
                        const thisWeekStart = dayjs().startOf('isoWeek')
                        const lastWeekStart = thisWeekStart.subtract(1, 'week')
                        const nextWeekStart = thisWeekStart.add(1, 'week')
                        const isRecentComplete = (task: WbsTask) => {
                          if (task.status !== 'completed') return false
                          const d = dayjs(task.actual_end || task.expected_end)
                          return !d.isBefore(lastWeekStart) && d.isBefore(nextWeekStart)
                        }
                        const isVisible = (task: WbsTask) =>
                          task.week_tag.length > 0 ||
                          (task.is_overdue && task.status !== 'completed') ||
                          task.is_suspended ||
                          isRecentComplete(task) ||
                          getTaskPendingNotes(project.id, task.id).length > 0

                        const allItems = project.functions.flatMap((func) =>
                          func.tasks.filter(isVisible).map((task) => ({ task, funcName: func.name, funcId: func.id }))
                        )

                        // 週標籤片段（上週/本週/下週）
                        const renderWeekTags = (task: WbsTask) =>
                          task.week_tag.map((wt) => (
                            <span key={wt} style={{ color: WEEK_TAG_CONFIG[wt].color, fontWeight: 700, marginLeft: 3 }}>
                              [{wt === 'last_week' ? t('wbs.lastWeek') : wt === 'this_week' ? t('wbs.thisWeek') : t('wbs.nextWeek')}]
                            </span>
                          ))

                        // 渲染單一任務行（縮進 + - 開頭）
                        const renderTaskRow = (task: WbsTask, indent: number) => {
                          const { label, color } = _taskStatusLabel(task, t)
                          const isShelved = task.is_suspended
                          const lineColor = task.status === 'completed' ? '#0070C0' : '#000'
                          const hasReschedule = !isShelved && (task.reschedule_count ?? 0) > 0 && !!task.original_end
                          const dateStr = isShelved ? null
                            : task.status === 'completed'
                              ? t('wbs.rpt.completedOnDate', { date: task.actual_end || task.expected_end })
                              : task.expected_end ? t('wbs.rpt.targetDate', { date: task.expected_end }) : null
                          const taskPendingNotes = getTaskPendingNotes(project.id, task.id)
                          const isOutsideWindow = task.week_tag.length === 0 && !task.is_overdue && !task.is_suspended && !isRecentComplete(task)
                          return (
                            <div key={task.id} style={{ paddingLeft: indent, marginBottom: taskPendingNotes.length > 0 ? 4 : 0 }}>
                              <div style={{ color: isOutsideWindow ? '#6b7280' : lineColor }}>
                                <span>- </span>
                                <span style={{ color, fontWeight: 700 }}>({label})</span>
                                <span> {task.name}</span>
                                <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 4 }}>({task.assignee})</span>
                                {hasReschedule ? (
                                  <span>
                                    {' ('}
                                    <s style={{ color: '#aaa', fontSize: 11 }}>{task.original_end}</s>
                                    <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 3 }}>{task.expected_end}</span>
                                    <span style={{ color: '#d97706', fontSize: 10, marginLeft: 2 }}>{t('wbs.rpt.rescheduledTimes', { count: task.reschedule_count })}</span>
                                    {')'}
                                  </span>
                                ) : dateStr ? (
                                  <span style={{ color: '#6b7280', marginLeft: 4 }}>({dateStr})</span>
                                ) : null}
                                {renderWeekTags(task)}
                                {isOutsideWindow && taskPendingNotes.length > 0 && (
                                  <span style={{ color: '#d97706', fontSize: 10, marginLeft: 4 }}>[{t('wbs.rpt.hasPendingNotes')}]</span>
                                )}
                                {hasReschedule && task.reschedule_reason && (
                                  <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
                                    ↳ {t('wbs.rpt.rescheduleReason')}{task.reschedule_reason}
                                  </div>
                                )}
                                {task.is_suspended && (
                                  <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
                                    ↳ {(task as unknown as { shelved_at?: string }).shelved_at || ''} {t('wbs.shelveReasonLabel')}{(task as unknown as { shelve_reason?: string }).shelve_reason || '—'}
                                  </div>
                                )}
                              </div>
                              {taskPendingNotes.map((n) => (
                                <div key={n.id} style={{ paddingLeft: 16, marginTop: 2, color: '#92400e', fontSize: 11, background: '#fffbeb', borderLeft: '3px solid #f59e0b', paddingTop: 2, paddingBottom: 2 }}>
                                  💬 [{t(`wbs.noteType.${n.type}`)}] {n.content}
                                </div>
                              ))}
                            </div>
                          )
                        }

                        // 渲染序號任務行（無分組時直接用序號）
                        let flatSeq = 0
                        const renderTaskFlat = (task: WbsTask) => {
                          flatSeq++
                          const { label, color } = _taskStatusLabel(task, t)
                          const lineColor = task.status === 'completed' ? '#0070C0' : '#000'
                          const hasReschedule = (task.reschedule_count ?? 0) > 0 && !!task.original_end
                          const dateStr = task.status === 'completed'
                            ? t('wbs.rpt.completedOnDate', { date: task.actual_end || task.expected_end })
                            : task.expected_end ? t('wbs.rpt.targetDate', { date: task.expected_end }) : null
                          const seq = flatSeq
                          return (
                            <div key={task.id} style={{ color: lineColor }}>
                              <span>{seq}. </span>
                              <span style={{ color, fontWeight: 700 }}>({label})</span>
                              <span> {task.name}</span>
                              <span style={{ color: '#6b7280', fontSize: 11, marginLeft: 4 }}>({task.assignee})</span>
                              {hasReschedule ? (
                                <span>
                                  {' ('}
                                  <s style={{ color: '#aaa', fontSize: 11 }}>{task.original_end}</s>
                                  <span style={{ color: '#d97706', fontWeight: 700, marginLeft: 3 }}>{task.expected_end}</span>
                                  <span style={{ color: '#d97706', fontSize: 10, marginLeft: 2 }}>{t('wbs.rpt.rescheduledTimes', { count: task.reschedule_count })}</span>
                                  {')'}
                                </span>
                              ) : dateStr ? (
                                <span style={{ color: '#6b7280', marginLeft: 4 }}>({dateStr})</span>
                              ) : null}
                              {renderWeekTags(task)}
                              {hasReschedule && task.reschedule_reason && (
                                <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
                                  ↳ {t('wbs.rpt.rescheduleReason')}{task.reschedule_reason}
                                </div>
                              )}
                              {task.is_suspended && (
                                <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11 }}>
                                  ↳ {(task as unknown as { shelved_at?: string }).shelved_at || ''} {t('wbs.shelveReasonLabel')}{(task as unknown as { shelve_reason?: string }).shelve_reason || '—'}
                                </div>
                              )}
                            </div>
                          )
                        }

                        const hasRequirements = allItems.some((item) => !!item.task.requirement_nm)

                        // 統一 sections 結構：有名稱的需求 or 分組 都作為同級條目
                        type Section =
                          | { kind: 'req'; key: string; name: string; funcs: { key: string; name: string; tasks: WbsTask[] }[] }
                          | { kind: 'grp'; key: string; name: string; tasks: WbsTask[] }

                        const sections: Section[] = []

                        if (hasRequirements) {
                          const reqMap = new Map<string, { name: string; funcs: Map<string, { name: string; tasks: WbsTask[] }> }>()
                          for (const { task, funcName, funcId } of allItems) {
                            const rKey = task.requirement_id ?? '__none__'
                            const rName = (task.requirement_nm ?? '').trim()
                            if (!reqMap.has(rKey)) reqMap.set(rKey, { name: rName, funcs: new Map() })
                            const req = reqMap.get(rKey)!
                            if (!req.funcs.has(funcId)) req.funcs.set(funcId, { name: funcName, tasks: [] })
                            req.funcs.get(funcId)!.tasks.push(task)
                          }
                          for (const [rKey, req] of reqMap.entries()) {
                            if (req.name) {
                              // 有名稱的需求 → 作為需求條目，分組為子層
                              sections.push({
                                kind: 'req', key: rKey, name: req.name,
                                funcs: Array.from(req.funcs.entries()).map(([fKey, func]) => ({ key: fKey, name: func.name, tasks: func.tasks })),
                              })
                            } else {
                              // 無名稱需求 → 各分組直接提升為頂層條目
                              for (const [fKey, func] of req.funcs.entries()) {
                                sections.push({ kind: 'grp', key: fKey, name: func.name, tasks: func.tasks })
                              }
                            }
                          }
                        } else {
                          for (const func of project.functions) {
                            const tasks = func.tasks.filter(isVisible)
                            if (tasks.length > 0) sections.push({ kind: 'grp', key: func.id, name: func.name, tasks })
                          }
                        }

                        if (sections.length === 0) {
                          // 無分組無需求 → 序號直排
                          return allItems.map(({ task }) => renderTaskFlat(task))
                        }

                        return sections.map((section, si) => {
                          const num = si + 1
                          if (section.kind === 'req') {
                            const reqStatus = (section.funcs[0]?.tasks[0] as unknown as { requirement_status?: number })?.requirement_status
                            const reqShelveReason = (section.funcs[0]?.tasks[0] as unknown as { requirement_shelve_reason?: string })?.requirement_shelve_reason
                            const reqShelvedAt = (section.funcs[0]?.tasks[0] as unknown as { requirement_shelved_at?: string })?.requirement_shelved_at
                            const isReqShelved = reqStatus === 8
                            return (
                              <div key={section.key} style={{ marginBottom: 4 }}>
                                <div style={{ fontWeight: 700, color: isReqShelved ? '#d97706' : '#002FA7' }}>
                                  {num}. {formatGroupNamePlain(section.name) || section.name}
                                  {isReqShelved && <span style={{ color: '#d97706', fontWeight: 700, fontSize: 12 }}> [{t('wbs.rpt.suspended')}]</span>}
                                  {isReqShelved && (
                                    <div style={{ paddingLeft: 20, color: '#d97706', fontSize: 11, fontWeight: 400 }}>
                                      ↳ {reqShelvedAt || ''} {t('wbs.shelveReasonLabel')}{reqShelveReason || '—'}
                                    </div>
                                  )}
                                </div>
                                {section.funcs.map((func) => (
                                  <div key={func.key} style={{ paddingLeft: 12 }}>
                                    <div style={{ fontWeight: 600, color: '#374151' }}>▸ {formatGroupNamePlain(func.name) || func.name}</div>
                                    {func.tasks.map((task) => renderTaskRow(task, 24))}
                                  </div>
                                ))}
                              </div>
                            )
                          } else {
                            return (
                              <div key={section.key} style={{ marginBottom: 4 }}>
                                <div style={{ fontWeight: 700, color: '#002FA7' }}>{num}. {formatGroupNamePlain(section.name) || section.name}</div>
                                {section.tasks.map((task) => renderTaskRow(task, 16))}
                              </div>
                            )
                          }
                        })
                      })()}
                    </td>
                  </tr>
                )
              })}
              {/* ── System rows ── */}
              {/* ── System rows ── */}
              {[...systemDutiesMap.entries()].filter(([, sysDuties]) => sysDuties.some(isDutyVisible)).map(([sysId, sysDuties], sysIdx) => {
                const sysInfo = systemInfoMap[sysId]
                const sysNm = sysInfo?.sys_nm ?? (sysDuties[0]?.system_nm ?? sysId)
                const maintainers = (sysInfo?.maintainers ?? []).length > 0
                  ? (sysInfo.maintainers as string[]).map((wn) => toName(wn) || wn).join('、')
                  : '—'
                // DRI = unique responsible from linked standalone reqs (需求负责人)
                const reqIds = [...new Set(sysDuties.map((d) => d.standalone_req_id).filter(Boolean) as string[])]
                const dri = reqIds.length > 0
                  ? [...new Set(reqIds.flatMap((rid) => reqResponsibleMap[rid] ?? []))]
                      .map((wn) => toName(wn) || wn).join('、') || '—'
                  : [...new Set(sysDuties.flatMap((d) => d.responsible ?? []))]
                      .map((wn) => toName(wn) || wn).join('、') || '—'
                const dotClr = `#${_dutyListDotColor(sysDuties)}`
                return (
                  <tr key={`sys-${sysId}`}>
                    <td style={{ ...TD_CENTER, fontSize: 18 }}><span style={{ color: dotClr }}>●</span></td>
                    <td style={TD_CENTER}>{projects.length + sysIdx + 1}</td>
                    <td style={TD_MID}>
                      {sysNm}
                      <span style={{ marginLeft: 4, fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>[{t('wbs.rpt.system')}]</span>
                    </td>
                    <td style={TD_MID}>{maintainers}</td>
                    <td style={TD_MID}>{dri}</td>
                    <td style={TD_CENTER}>—</td>
                    <td style={TD_CENTER}>—</td>
                    <td style={{ verticalAlign: 'top', border: '1px solid #B4C6E7', lineHeight: 1.8 }}>
                      {renderDutyProgress(sysDuties)}
                    </td>
                  </tr>
                )
              })}

              {/* ── AR Tasks row ── */}
              {arDuties.some(isDutyVisible) && (() => {
                const creators = [...new Set(arDuties.map((d) => d.creator))]
                  .map((wn) => toName(wn) || wn).join('、') || '—'
                const responsible = [...new Set(arDuties.flatMap((d) => d.responsible ?? []))]
                  .map((wn) => toName(wn) || wn).join('、') || '—'
                const dotClr = `#${_dutyListDotColor(arDuties)}`
                const rowIdx = projects.length + systemDutiesMap.size + 1
                return (
                  <tr key="ar-duties">
                    <td style={{ ...TD_CENTER, fontSize: 18 }}><span style={{ color: dotClr }}>●</span></td>
                    <td style={TD_CENTER}>{rowIdx}</td>
                    <td style={TD_MID}>
                      {t('wbs.rpt.arTasks')}
                      <span style={{ marginLeft: 4, fontSize: 10, color: '#d97706', fontWeight: 700 }}>[AR]</span>
                    </td>
                    <td style={TD_MID}>{creators}</td>
                    <td style={TD_MID}>{responsible}</td>
                    <td style={TD_CENTER}>—</td>
                    <td style={TD_CENTER}>—</td>
                    <td style={{ verticalAlign: 'top', border: '1px solid #B4C6E7', lineHeight: 1.8 }}>
                      {renderDutyProgress(arDuties)}
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>

          {/* ── B: Pending notes summary ───────────────────────────────── */}
          {(() => {
            // Collect all pending notes across projects, systems, AR
            type PendingEntry = { source: string; taskName?: string; type: NoteType; content: string; author: string; createdAt: string }
            const entries: PendingEntry[] = []

            // Project notes
            projects.forEach((p) => {
              const notes = meetingNotes[p.id] ?? []
              notes.filter((n) => n.status === 'pending').forEach((n) => {
                entries.push({ source: p.name, taskName: n.taskName ?? undefined, type: n.type, content: n.content, author: n.author, createdAt: n.createdAt })
              })
            })
            // System / AR duty notes
            const dutyNoteKeys = new Set<string>()
            duties.forEach((d) => dutyNoteKeys.add(d.system_id || 'ar_standalone'))
            dutyNoteKeys.forEach((key) => {
              const notes = dutyNotes[key] ?? []
              const sourceName = key === 'ar_standalone' ? t('wbs.rpt.arTasks')
                : (systemInfoMap[key]?.sys_nm ?? key)
              notes.filter((n) => n.status === 'pending').forEach((n) => {
                entries.push({ source: sourceName, taskName: n.taskName ?? undefined, type: n.type, content: n.content, author: n.author, createdAt: n.createdAt })
              })
            })

            if (entries.length === 0) return null
            return (
              <div style={{ marginTop: 20, border: '1px solid #fde68a', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ background: '#fef3c7', padding: '6px 12px', fontWeight: 700, fontSize: 13, color: '#92400e', borderBottom: '1px solid #fde68a' }}>
                  {t('wbs.pendingNotesTitle', { count: entries.length })}
                </div>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#fffbeb' }}>
                      {[t('wbs.sourceCol'), t('wbs.relatedTask'), t('wbs.typeCol'), t('wbs.contentCol'), t('wbs.recordedBy'), t('wbs.timeCol')].map((h) => (
                        <th key={h} style={{ border: '1px solid #fde68a', padding: '4px 8px', textAlign: 'left', color: '#92400e', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} style={{ background: i % 2 === 1 ? '#fffbeb' : '#fff' }}>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#374151', whiteSpace: 'nowrap' }}>{e.source}</td>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#6b7280' }}>{e.taskName ?? '—'}</td>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#92400e', whiteSpace: 'nowrap' }}>{t(`wbs.noteType.${e.type}`)}</td>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#111827' }}>{e.content}</td>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>{e.author}</td>
                        <td style={{ border: '1px solid #fde68a', padding: '4px 8px', color: '#6b7280', whiteSpace: 'nowrap' }}>{dayjs(e.createdAt).format('MM/DD HH:mm')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* Footer matching master */}
          <div style={{ marginTop: 16, paddingLeft: 8, fontSize: 11, color: '#FF0000', fontWeight: 700 }}>
            ZDT Confidential
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Duty week tags utility ──────────────────────────────────────────────────

function computeDutyWeekTags(d: TemporaryDuty): WeekTag[] {
  if (!d.expected_end_date) return []
  const today   = dayjs()
  const twStart = today.startOf('isoWeek')
  const twEnd   = today.endOf('isoWeek')
  const lwStart = twStart.subtract(1, 'week')
  const lwEnd   = twEnd.subtract(1, 'week')
  const nwStart = twStart.add(1, 'week')
  const nwEnd   = twEnd.add(1, 'week')
  const end = dayjs(d.expected_end_date)
  const tags: WeekTag[] = []
  if (!end.isBefore(lwStart) && !end.isAfter(lwEnd)) tags.push('last_week')
  if (!end.isBefore(twStart) && !end.isAfter(twEnd))  tags.push('this_week')
  if (!end.isBefore(nwStart) && !end.isAfter(nwEnd))  tags.push('next_week')
  return tags
}

// ─── Duty Task Row (matches TaskRow style) ──────────────────────────────────

const DutyTaskRow: React.FC<{
  duty: TemporaryDuty
  context?: string
  onSelect: (id: string) => void
  onWeekTagClick?: (wt: WeekTag) => void
  notes?: MeetingNote[]
  onAddNote?: (type: NoteType, content: string) => void
  onResolveNote?: (noteId: string) => void
  onDeleteNote?: (noteId: string) => void
}> = ({ duty: d, context, onSelect, onWeekTagClick, notes = [], onAddNote, onResolveNote, onDeleteNote }) => {
  const { t } = useTranslation()
  const toName       = useWorkNoToName()
  const isShelved    = d.status === 8
  const isOverdue    = !isShelved && d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')
  const isCompleted  = d.status === 3
  const isInProgress = d.status === 1 || d.status === 2
  const weekTags     = computeDutyWeekTags(d)
  const priorityColor = d.priority >= 4 ? '#dc2626' : d.priority >= 3 ? '#d97706' : d.priority >= 2 ? '#2563eb' : '#94a3b8'
  const priorityLabel = d.priority >= 4 ? t('wbs.priorityUrgent') : d.priority >= 3 ? t('wbs.priorityHigh') : d.priority >= 2 ? t('wbs.priorityMedium') : t('wbs.priorityLow')
  const pendingCount  = notes.filter((n) => n.status === 'pending').length
  const hasPending    = pendingCount > 0

  return (
    <div className={`group flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''} ${hasPending ? 'border-l-[3px] border-l-blue-400' : ''}`}>
      <div className="mt-0.5 flex-shrink-0">
        {isCompleted  ? <CheckCircleIcon className="w-3.5 h-3.5 text-blue-500" />
         : isShelved  ? <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
         : isOverdue  ? <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
         : isInProgress ? <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-green-500" />
         : <ClockIcon className="w-3.5 h-3.5 text-slate-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-medium cursor-pointer hover:underline decoration-dotted underline-offset-2 ${isCompleted ? 'text-blue-600 line-through decoration-blue-300' : isOverdue ? 'text-red-700' : 'text-slate-700 hover:text-blue-600'}`}
            onClick={() => onSelect(d.id)}
          >
            {d.duty_nm}
          </span>
          {weekTags.map((wt) => (
            <span
              key={wt}
              className="text-[10px] font-semibold rounded px-1.5 py-0.5 cursor-pointer select-none"
              style={{ color: WEEK_TAG_CONFIG[wt].color, background: WEEK_TAG_CONFIG[wt].bg }}
              onClick={() => onWeekTagClick?.(wt)}
            >
              {wt === 'last_week' ? t('wbs.lastWeek') : wt === 'this_week' ? t('wbs.thisWeek') : t('wbs.nextWeek')}
            </span>
          ))}
          {isOverdue && <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 4px' }} color="error">{t('wbs.overdue')}</Tag>}
          {isShelved && (
            <Tooltip title={(d as unknown as { shelve_reason?: string }).shelve_reason || undefined}>
              <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 4px', cursor: 'pointer' }} color="warning">{t('wbs.suspended')}</Tag>
            </Tooltip>
          )}
        </div>
        {isShelved && (
          <div className="text-[10px] mt-1 text-amber-600 bg-amber-50 rounded px-2 py-1">
            {(d as unknown as { updated_at?: string }).updated_at && (
              <span className="font-semibold mr-1">{((d as unknown as { updated_at?: string }).updated_at ?? '').slice(0, 10)}</span>
            )}
            <span className="font-semibold">{t('wbs.shelveReasonLabel')}</span>{(d as unknown as { shelve_reason?: string }).shelve_reason || '—'}
          </div>
        )}
        {(d.responsible?.length || d.progress > 0) && (
          <div className="flex items-center gap-2 mt-0.5">
            {d.responsible && d.responsible.length > 0 && (
              <span className="text-[10px] text-slate-400">
                {d.responsible.slice(0, 2).map((r) => toName(r) || r).join('、')}{d.responsible.length > 2 ? ` +${d.responsible.length - 2}` : ''}
              </span>
            )}
            {d.progress > 0 && <span className="text-[10px] text-slate-400">{d.progress}%</span>}
          </div>
        )}
      </div>

      {/* Priority tag */}
      <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 4px', color: priorityColor, borderColor: priorityColor + '44', background: priorityColor + '0D', flexShrink: 0 }}>
        {priorityLabel}
      </Tag>

      {/* Expected end date */}
      <div className="flex-shrink-0 text-right w-[85px]">
        <Tooltip title={t('wbs.expectedEndTooltip')}>
          <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
            {d.expected_end_date ?? ''}
          </span>
        </Tooltip>
      </div>

      {/* Meeting note button — far right, same as TaskRow */}
      {onAddNote && (
        <div className="flex-shrink-0 w-[24px] flex items-center justify-center">
          <NotePopover taskName={d.duty_nm} context={context} notes={notes} onAdd={onAddNote} onResolve={onResolveNote} onDelete={onDeleteNote}>
            <button
              className={`border-0 bg-transparent cursor-pointer relative p-0.5 rounded transition-all ${hasPending || notes.length > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} hover:bg-blue-50`}
              onClick={(e) => e.stopPropagation()}
              title={hasPending ? t('wbs.pendingNoteCount', { count: pendingCount }) : t('wbs.meetingNotes')}
            >
              <ChatBubbleOvalLeftEllipsisIcon className={`w-3.5 h-3.5 transition-colors ${hasPending ? 'text-blue-500' : notes.length > 0 ? 'text-blue-300' : 'text-slate-400 hover:text-blue-500'}`} />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[8px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center leading-none">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </button>
          </NotePopover>
        </div>
      )}
    </div>
  )
}

// ─── Duty Function Block (matches FunctionModule style) ─────────────────────

const DutyFunctionBlock: React.FC<{
  groupNm: string
  reqName?: string
  duties: TemporaryDuty[]
  onSelect: (id: string) => void
  onWeekTagClick?: (wt: WeekTag) => void
  defaultOpen?: boolean
  notesByDutyId: Record<string, MeetingNote[]>
  onAddNote: (dutyId: string, dutyNm: string, type: NoteType, content: string) => void
  onResolveNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
}> = ({ groupNm, reqName, duties, onSelect, onWeekTagClick, defaultOpen = false, notesByDutyId, onAddNote, onResolveNote, onDeleteNote }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  const completed  = duties.filter((d) => d.status === 3).length
  const overdue    = duties.filter((d) => d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')).length
  const thisWeek   = duties.filter((d) => computeDutyWeekTags(d).includes('this_week')).length
  const progress   = duties.length > 0 ? Math.round(completed / duties.length * 100) : 0

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden mb-2 last:mb-0">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 cursor-pointer hover:bg-slate-100/60 transition-colors select-none"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDownIcon className="w-3 h-3 text-slate-400" /> : <ChevronRightIcon className="w-3 h-3 text-slate-400" />}
        <span className="text-xs font-semibold text-slate-600">{formatGroupName(groupNm) || groupNm}</span>
        {groupNm !== t('common.ungrouped') && groupNm !== '__nogroup__' && groupNm !== '未分組' && groupNm !== '未分组' && (
          <>
            <Progress percent={progress} size="small"
              strokeColor={progress >= 100 ? '#16a34a' : progress >= 60 ? '#2563eb' : '#d97706'}
              trailColor="#e2e8f0" style={{ width: 60, marginBottom: 0 }} format={() => ''} />
            <span className="text-[10px] font-semibold text-slate-500">{progress}%</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{t('wbs.doneCount', { done: completed, total: duties.length })}</span>
          {thisWeek > 0 && <Tag color="blue" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>{t('wbs.thisWeekCountLabel', { count: thisWeek })}</Tag>}
          {overdue > 0 && <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>{t('wbs.overdueCountLabel', { count: overdue })}</Tag>}
        </div>
      </div>
      {open && duties.map((d) => {
        const ctx = [reqName, formatGroupName(groupNm) || groupNm].filter((s) => s && s !== t('common.ungrouped')).join(' / ')
        const ctxPlain = [reqName, formatGroupNamePlain(groupNm) || groupNm].filter((s) => s && s !== t('common.ungrouped')).join(' / ')
        const fullName = ctxPlain ? `${ctxPlain} / ${d.duty_nm}` : d.duty_nm
        return (
        <DutyTaskRow
          key={d.id}
          duty={d}
          context={ctx || undefined}
          onSelect={onSelect}
          onWeekTagClick={onWeekTagClick}
          notes={notesByDutyId[d.id] ?? []}
          onAddNote={(type, content) => onAddNote(d.id, fullName, type, content)}
          onResolveNote={onResolveNote}
          onDeleteNote={onDeleteNote}
        />
      )})}
    </div>
  )
}

// ─── Duty Card (matches ProjectCard style exactly) ───────────────────────────

const DutyCard: React.FC<{
  title: string
  duties: TemporaryDuty[]
  notes: MeetingNote[]
  onSelect: (id: string) => void
  onWeekTagClick?: (wt: WeekTag) => void
  onAddNote: (taskId: string | null, taskName: string | null, type: NoteType, content: string) => void
  onResolveNote: (noteId: string) => void
  onDeleteNote: (noteId: string) => void
  tag?: string
  systemInfo?: SystemItem
  reqNameMap?: Record<string, string>
  reqStatusMap?: Record<string, number>
  reqShelveReasonMap?: Record<string, string>
  reqShelvedAtMap?: Record<string, string>
}> = ({ title, duties, notes, onSelect, onWeekTagClick, onAddNote, onResolveNote, onDeleteNote, tag, systemInfo, reqNameMap = {}, reqStatusMap = {}, reqShelveReasonMap = {}, reqShelvedAtMap = {} }) => {
  const { t } = useTranslation()
  const today   = dayjs()
  const twStart = today.startOf('isoWeek')
  const twEnd   = today.endOf('isoWeek')
  const lwStart = twStart.subtract(1, 'week')
  const lwEnd   = twEnd.subtract(1, 'week')
  const nwStart = twStart.add(1, 'week')
  const nwEnd   = twEnd.add(1, 'week')

  const totalCount     = duties.length
  const completedCount = duties.filter((d) => d.status === 3).length
  const overdueCount   = duties.filter((d) => d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(today, 'day')).length
  const thisWeekCount  = duties.filter((d) => { const e = d.expected_end_date ? dayjs(d.expected_end_date) : null; return !!e && !e.isBefore(twStart) && !e.isAfter(twEnd) }).length
  const nextWeekCount  = duties.filter((d) => { const e = d.expected_end_date ? dayjs(d.expected_end_date) : null; return !!e && !e.isBefore(nwStart) && !e.isAfter(nwEnd) }).length
  const lastWeekDone   = duties.filter((d) => { const e = d.expected_end_date ? dayjs(d.expected_end_date) : null; return d.status === 3 && !!e && !e.isBefore(lwStart) && !e.isAfter(lwEnd) }).length
  const progress       = totalCount > 0 ? Math.round(completedCount / totalCount * 100) : 0

  const pendingNoteCount = notes.filter((n) => n.status === 'pending').length

  // Notes by duty id (task-level)
  const notesByDutyId = useMemo(() => {
    const map: Record<string, MeetingNote[]> = {}
    notes.forEach((n) => { if (n.taskId) (map[n.taskId] = map[n.taskId] ?? []).push(n) })
    return map
  }, [notes])

  // Auto-expand notes panel when first note added
  const [showNotes, setShowNotes] = useState(false)
  const prevNoteCountRef = React.useRef(notes.length)
  React.useEffect(() => {
    if (notes.length > prevNoteCountRef.current) setShowNotes(true)
    prevNoteCountRef.current = notes.length
  }, [notes.length])

  // Group by requirement → group
  const reqGroupMap = useMemo(() => {
    const rMap = new Map<string, { reqNm: string; groups: Map<string, TemporaryDuty[]> }>()
    duties.forEach((d) => {
      const rk = d.standalone_req_id || '__none__'
      if (!rMap.has(rk)) rMap.set(rk, { reqNm: reqNameMap[rk] ?? '', groups: new Map() })
      const g = d.group || t('common.ungrouped')
      const req = rMap.get(rk)!
      if (!req.groups.has(g)) req.groups.set(g, [])
      req.groups.get(g)!.push(d)
    })
    return rMap
  }, [duties, t, reqNameMap])

  return (
    <Collapse
      defaultActiveKey={[]}
      className="mb-4 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
      expandIconPosition="end"
    >
      <Panel
        key="main"
        header={
          <div className="flex items-center gap-3 flex-wrap">
            <FolderIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <span className="font-semibold text-slate-700 text-sm">{title}</span>
            {tag && (
              <Tag style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px', color: '#7c3aed', borderColor: '#7c3aed44', background: '#7c3aed0D' }}>
                {tag}
              </Tag>
            )}
            {systemInfo?.maintainer_names && systemInfo.maintainer_names.length > 0 && (
              <span className="text-[10px] text-slate-400">
                {t('wbs.responsiblePerson')} {systemInfo.maintainer_names.slice(0, 2).map((m) => m.name).join('、')}
                {systemInfo.maintainer_names.length > 2 && ` +${systemInfo.maintainer_names.length - 2}`}
              </span>
            )}
            {systemInfo?.go_live_date && (
              <span className="text-[10px] text-slate-400">{t('wbs.liveDate')} {systemInfo.go_live_date}</span>
            )}
            {overdueCount > 0 && (
              <div className="flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] text-red-500 font-semibold">{t('wbs.overdueItems', { count: overdueCount })}</span>
              </div>
            )}
            {pendingNoteCount > 0 && (
              <div className="flex items-center gap-1">
                <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-blue-500 font-semibold">{t('wbs.pendingNotes', { count: pendingNoteCount })}</span>
              </div>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Tooltip title={t('wbs.overallCompletion')}>
              <div className="flex items-center gap-1.5">
                <Progress
                  type="circle" percent={progress} size={32}
                  strokeColor={progress >= 80 ? '#16a34a' : progress >= 40 ? '#2563eb' : '#d97706'}
                  format={(p) => <span className="text-[9px] font-bold">{p}%</span>}
                />
              </div>
            </Tooltip>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">{t('wbs.doneCount', { done: completedCount, total: totalCount })}</div>
            </div>
          </div>
        }
      >
        {/* Week summary banner — same as ProjectCard */}
        <div className="flex gap-3 mb-3 px-1">
          <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[10px] text-slate-400 mb-0.5">{t('wbs.lastWeekDone')}</div>
            <div className="text-sm font-bold text-slate-600">{lastWeekDone} {t('wbs.unitItem')}</div>
          </div>
          <div className="flex-1 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <div className="text-[10px] text-blue-500 mb-0.5">{t('wbs.thisWeekInProgress')}</div>
            <div className="text-sm font-bold text-blue-600">{thisWeekCount} {t('wbs.unitItem')}</div>
          </div>
          <div className="flex-1 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
            <div className="text-[10px] text-violet-500 mb-0.5">{t('wbs.nextWeekTodo')}</div>
            <div className="text-sm font-bold text-violet-600">{nextWeekCount} {t('wbs.unitItem')}</div>
          </div>
          {overdueCount > 0 && (
            <div className="flex-1 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <div className="text-[10px] text-red-500 mb-0.5">{t('wbs.overdueTask')}</div>
              <div className="text-sm font-bold text-red-600">{overdueCount} {t('wbs.unitItem')}</div>
            </div>
          )}
        </div>

        {/* Group blocks — matches FunctionModule layout */}
        {(() => {
          const sorted = Array.from(reqGroupMap.entries())
            .sort(([a], [b]) => a === '__none__' ? 1 : b === '__none__' ? -1 : (reqNameMap[a] ?? a).localeCompare(reqNameMap[b] ?? b))

          const renderGroups = (groups: Map<string, TemporaryDuty[]>, rName?: string) =>
            Array.from(groups.entries()).map(([groupNm, groupDuties]) => (
              <DutyFunctionBlock
                key={groupNm}
                groupNm={groupNm}
                reqName={rName}
                duties={groupDuties}
                onSelect={onSelect}
                onWeekTagClick={onWeekTagClick}
                defaultOpen={false}
                notesByDutyId={notesByDutyId}
                onAddNote={(dutyId, dutyNm, type, content) => onAddNote(dutyId, dutyNm, type, content)}
                onResolveNote={onResolveNote}
                onDeleteNote={onDeleteNote}
              />
            ))

          return sorted.map(([reqKey, { reqNm, groups }]) => {
            const allDuties = Array.from(groups.values()).flat()
            if (reqNm) {
              const progress = allDuties.length ? Math.round(allDuties.reduce((s, d) => s + (d.progress ?? 0), 0) / allDuties.length) : 0
              const overdueCount = allDuties.filter((d) => d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')).length
              return (
                <ReqGroupWrapper key={reqKey} name={reqNm} progress={progress}
                  taskCount={allDuties.length} overdueCount={overdueCount}
                  isShelved={reqStatusMap[reqKey] === 8} shelveReason={reqShelveReasonMap[reqKey]} shelvedAt={reqShelvedAtMap[reqKey]}>
                  {renderGroups(groups, reqNm)}
                </ReqGroupWrapper>
              )
            }
            return <div key={reqKey}>{renderGroups(groups)}</div>
          })
        })()}

        {/* Meeting Notes Section — same as ProjectCard */}
        <div className="mt-3 px-1">
          <button
            className="border-0 bg-transparent cursor-pointer w-full flex items-center gap-2 py-1.5 text-left group/notes"
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes
              ? <ChevronDownIcon className="w-3 h-3 text-blue-400" />
              : <ChevronRightIcon className="w-3 h-3 text-slate-400 group-hover/notes:text-blue-400 transition-colors" />
            }
            <ChatBubbleOvalLeftEllipsisIcon className={`w-3.5 h-3.5 ${showNotes || pendingNoteCount > 0 ? 'text-blue-500' : 'text-slate-400 group-hover/notes:text-blue-400 transition-colors'}`} />
            <span className={`text-[11px] font-semibold ${showNotes || pendingNoteCount > 0 ? 'text-blue-600' : 'text-slate-400 group-hover/notes:text-blue-500 transition-colors'}`}>
              {t('wbs.meetingNotes')}
            </span>
            {pendingNoteCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {pendingNoteCount}
              </span>
            )}
            {notes.length === 0 && (
              <span className="text-[10px] text-slate-300">{t('wbs.clickToExpandHint')}</span>
            )}
          </button>
          {showNotes && (
            <MeetingNotesPanel
              notes={notes}
              onAddProjectNote={(type, content) => onAddNote(null, null, type, content)}
              onResolve={onResolveNote}
              onDelete={onDeleteNote}
            />
          )}
        </div>
      </Panel>
    </Collapse>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const WbsOverviewPage: React.FC = () => {
  const { t } = useTranslation()
  const isManager = useAppSelector((s) => s.auth.isSupervisor)
  const toName    = useWorkNoToName()

  const [wbsData, setWbsData] = useState<WbsProject[]>([])
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [wbsGroupMode, setWbsGroupMode] = useState<'by_group' | 'by_req'>('by_req')
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [selectedFuncTask, setSelectedFuncTask] = useState<{ projectId: string; functionId: string } | null>(null)
  const [meetingNotes, setMeetingNotes] = useState<Record<string, MeetingNote[]>>({})
  const [previewOpen, setPreviewOpen] = useState(false)
  const [allDuties, setAllDuties] = useState<TemporaryDuty[]>([])
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(null)
  const [systemInfoMap, setSystemInfoMap] = useState<Record<string, SystemItem>>({})
  const [reqNameMap, setReqNameMap] = useState<Record<string, string>>({})
  const [reqResponsibleMap, setReqResponsibleMap] = useState<Record<string, string[]>>({})
  const [reqStatusMap, setReqStatusMap] = useState<Record<string, number>>({})
  const [reqShelveReasonMap, setReqShelveReasonMap] = useState<Record<string, string>>({})
  const [reqShelvedAtMap, setReqShelvedAtMap] = useState<Record<string, string>>({})

  // Load WBS data
  useEffect(() => {
    projectApi.wbsOverview()
      .then((res) => { if (Array.isArray(res.content)) setWbsData(res.content as WbsProject[]) })
      .catch(() => {})
  }, [])

  // Load all active AR tasks
  useEffect(() => {
    dutyApi.list({ page: 1, size: 1000 })
      .then((res) => {
        const data = (res.content as { data_list?: TemporaryDuty[] }).data_list ?? []
        setAllDuties(data.filter((d) => d.status !== 9))
      })
      .catch(() => {})
  }, [])

  // Load system info and standalone req names
  useEffect(() => {
    systemApi.list({ page: 1, size: 1000 })
      .then((res) => {
        const list = (res.content as { data_list?: SystemItem[] }).data_list ?? []
        const map: Record<string, SystemItem> = {}
        list.forEach((s) => { map[s.id] = s })
        setSystemInfoMap(map)
      })
      .catch(() => {})
    standaloneReqApi.list({ page: 1, size: 2000 })
      .then((res) => {
        const list = (res.content as any).data_list ?? []
        const nameMap: Record<string, string> = {}
        const respMap: Record<string, string[]> = {}
        const statusMap: Record<string, number> = {}
        const reasonMap: Record<string, string> = {}
        const shelvedAtMap: Record<string, string> = {}
        list.forEach((r: any) => {
          nameMap[r.id] = r.req_nm
          respMap[r.id] = r.responsible ?? []
          statusMap[r.id] = r.status ?? 0
          reasonMap[r.id] = r.shelve_reason ?? ''
          if (r.status === 8) shelvedAtMap[r.id] = (r.updated_at ?? '').slice(0, 10)
        })
        setReqNameMap(nameMap)
        setReqResponsibleMap(respMap)
        setReqStatusMap(statusMap)
        setReqShelveReasonMap(reasonMap)
        setReqShelvedAtMap(shelvedAtMap)
      })
      .catch(() => {})
  }, [])

  // Load all meeting notes for visible projects after WBS data arrives
  useEffect(() => {
    if (wbsData.length === 0) return
    Promise.all(
      wbsData.map((p) =>
        meetingNoteApi.list(p.id)
          .then((res) => ({ projectId: p.id, notes: Array.isArray(res.content) ? res.content : [] }))
          .catch(() => ({ projectId: p.id, notes: [] }))
      )
    ).then((results) => {
      const map: Record<string, MeetingNote[]> = {}
      results.forEach(({ projectId, notes }) => {
        map[projectId] = notes.map((n: ApiMeetingNote) => ({
          id:        n.id,
          projectId: n.projectId,
          type:      n.type,
          content:   n.content,
          taskId:    n.taskId ?? undefined,
          taskName:  n.taskName ?? undefined,
          author:    n.author,
          createdAt: n.createdAt,
          status:    n.status,
        }))
      })
      setMeetingNotes(map)
    })
  }, [wbsData])

  // Build task lookup map so we can find project_id + function_id by task id
  const taskMap = useMemo(() => {
    const map = new Map<string, WbsTask>()
    wbsData.forEach((p) => p.functions.forEach((f) => f.tasks.forEach((t) => map.set(t.id, t))))
    return map
  }, [wbsData])

  const handleToggleTaskExpand = (taskId: string) => {
    const task = taskMap.get(taskId)
    if (task?.project_id && task?.function_id) {
      setSelectedFuncTask({ projectId: task.project_id, functionId: task.function_id })
      return
    }
    setExpandedTaskId((prev) => prev === taskId ? null : taskId)
  }

  const handleAddNote = useCallback((
    projectId: string,
    taskId: string | null,
    taskName: string | null,
    type: NoteType,
    content: string
  ) => {
    meetingNoteApi.create(projectId, {
      note_type: type,
      content,
      task_id:   taskId,
      task_name: taskName,
    }).then((res) => {
      if (!res.content) return
      const n = res.content as ApiMeetingNote
      const note: MeetingNote = {
        id: n.id, projectId: n.projectId, type: n.type,
        content: n.content, taskId: n.taskId ?? undefined,
        taskName: n.taskName ?? undefined,
        author: n.author, createdAt: n.createdAt, status: n.status,
      }
      setMeetingNotes((prev) => ({
        ...prev,
        [projectId]: [note, ...(prev[projectId] ?? [])],
      }))
    }).catch(() => {})
  }, [])

  const handleResolveNote = useCallback((projectId: string, noteId: string) => {
    // Optimistic update
    setMeetingNotes((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((n) =>
        n.id === noteId ? { ...n, status: n.status === 'pending' ? 'resolved' : 'pending' } : n
      ),
    }))
    const currentNotes = meetingNotes[projectId] ?? []
    const note = currentNotes.find((n) => n.id === noteId)
    const newStatus = note?.status === 'pending' ? 'resolved' : 'pending'
    meetingNoteApi.updateStatus(noteId, newStatus).catch(() => {
      // Rollback on failure
      setMeetingNotes((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map((n) =>
          n.id === noteId ? { ...n, status: note?.status ?? 'pending' } : n
        ),
      }))
    })
  }, [meetingNotes])

  const handleDeleteNote = useCallback((projectId: string, noteId: string) => {
    // Optimistic update
    setMeetingNotes((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter((n) => n.id !== noteId),
    }))
    meetingNoteApi.delete(noteId).catch(() => {
      // Could reload on failure, but for simplicity just ignore
    })
  }, [])

  // Summary stats — week filter applies to all except overdue (always full-data)
  const summary = useMemo(() => {
    const allTasks = wbsData.flatMap((p) => p.functions.flatMap((f) => f.tasks))

    const matchesPeriod = (task: WbsTask) => {
      if (weekFilter === 'show_all') return true
      if (weekFilter === 'all') return task.week_tag.length > 0
      return task.week_tag.includes(weekFilter as WeekTag)
    }

    const today = dayjs()
    const twStart = today.startOf('isoWeek')
    const twEnd   = today.endOf('isoWeek')
    const lwStart = twStart.subtract(1, 'week')
    const nwStart = twStart.add(1, 'week')
    const nwEnd   = twEnd.add(1, 'week')

    const periodTasks = allTasks.filter(matchesPeriod)
    const periodProjectIds = new Set(
      wbsData.filter((p) => p.functions.some((f) => f.tasks.some(matchesPeriod))).map((p) => p.id)
    )

    const activeDuties = allDuties.filter((d) => d.status !== 9)
    const dutyMatchesPeriod = (d: TemporaryDuty) => {
      if (weekFilter === 'show_all') return true
      const end = d.expected_end_date ? dayjs(d.expected_end_date) : null
      if (weekFilter === 'all') return (end && !end.isBefore(lwStart) && !end.isAfter(nwEnd)) || d.status === 1 || d.status === 2
      if (weekFilter === 'last_week') return !!end && !end.isBefore(lwStart) && !end.isAfter(twStart.subtract(1, 'day'))
      if (weekFilter === 'this_week') return !!end && !end.isBefore(twStart) && !end.isAfter(twEnd)
      if (weekFilter === 'next_week') return !!end && !end.isBefore(nwStart) && !end.isAfter(nwEnd)
      return false
    }
    const periodDuties = activeDuties.filter(dutyMatchesPeriod)

    return {
      totalProjects: periodProjectIds.size,
      totalTasks:    periodTasks.length + periodDuties.length,
      completed:     periodTasks.filter((t) => t.status === 'completed').length + periodDuties.filter((d) => d.status === 3).length,
      inProgress:    periodTasks.filter((t) => t.status === 'in_progress').length + periodDuties.filter((d) => d.status === 1 || d.status === 2).length,
      overdue:       allTasks.filter((t) => !!t.is_overdue).length + activeDuties.filter((d) => d.status !== 3 && d.status !== 8 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(today, 'day')).length,
      notStarted:    periodTasks.filter((t) => t.status === 'not_started').length + periodDuties.filter((d) => d.status === 0).length,
      suspended:     allTasks.filter((t) => t.status === 'suspended').length + activeDuties.filter((d) => d.status === 8).length,
      thisWeek:      allTasks.filter((t) => t.week_tag.includes('this_week')).length + activeDuties.filter((d) => !!d.expected_end_date && !dayjs(d.expected_end_date).isBefore(twStart) && !dayjs(d.expected_end_date).isAfter(twEnd)).length,
      nextWeek:      allTasks.filter((t) => t.week_tag.includes('next_week')).length + activeDuties.filter((d) => !!d.expected_end_date && !dayjs(d.expected_end_date).isBefore(nwStart) && !dayjs(d.expected_end_date).isAfter(nwEnd)).length,
    }
  }, [wbsData, weekFilter, allDuties])

  // Total pending notes across all projects (for header indicator)
  const totalPendingNotes = useMemo(() => {
    return Object.values(meetingNotes).reduce((sum, notes) => sum + notes.filter((n) => n.status === 'pending').length, 0)
  }, [meetingNotes])

  // Apply filters to projects
  const filteredProjects = useMemo(() => {
    const kw = searchKeyword.toLowerCase()
    return wbsData.map((project) => {
      const filteredFunctions = project.functions.map((func) => {
        const filteredTasks = func.tasks.filter((task) => {
          const weekMatch =
            weekFilter === 'show_all' ? true :
            weekFilter === 'all' ? (task.week_tag.length > 0 || task.status === 'in_progress' || task.is_overdue) :
            task.week_tag.includes(weekFilter)
          const statusMatch =
            statusFilter === 'all' ? true :
            statusFilter === 'overdue' ? !!task.is_overdue :
            task.status === statusFilter
          const searchMatch = !kw || task.name.toLowerCase().includes(kw) || task.assignee.toLowerCase().includes(kw)
          return weekMatch && statusMatch && searchMatch
        })
        return { ...func, tasks: filteredTasks }
      }).filter((f) => f.tasks.length > 0)

      return { ...project, functions: filteredFunctions }
    }).filter((p) => p.functions.length > 0)
  }, [wbsData, weekFilter, statusFilter, searchKeyword])

  const originalProjectMap = useMemo(() => {
    const map: Record<string, WbsProject> = {}
    wbsData.forEach((p) => { map[p.id] = p })
    return map
  }, [wbsData])

  const filteredTaskCount = filteredProjects.reduce((s, p) => s + p.functions.reduce((s2, f) => s2 + f.tasks.length, 0), 0)

  const filteredDuties = useMemo(() => {
    const today = dayjs()
    const twStart = today.startOf('isoWeek')
    const twEnd   = today.endOf('isoWeek')
    const lwStart = twStart.subtract(1, 'week')
    const lwEnd   = twEnd.subtract(1, 'week')
    const nwStart = twStart.add(1, 'week')
    const nwEnd   = twEnd.add(1, 'week')
    const kw = searchKeyword.toLowerCase()

    return allDuties.filter((d) => {
      // status filter
      if (statusFilter === 'completed' && d.status !== 3) return false
      if (statusFilter === 'not_started' && d.status !== 0) return false
      if (statusFilter === 'in_progress' && !(d.status === 1 || d.status === 2)) return false
      if (statusFilter === 'suspended' && d.status !== 8) return false
      if (statusFilter === 'overdue') {
        const isOverdue = d.status !== 3 && !!d.expected_end_date && dayjs(d.expected_end_date).isBefore(today, 'day')
        if (!isOverdue) return false
      }
      // week filter
      if (weekFilter !== 'show_all') {
        const end = d.expected_end_date ? dayjs(d.expected_end_date) : null
        if (weekFilter === 'all') {
          const inRange = end && !end.isBefore(lwStart) && !end.isAfter(nwEnd)
          const isActive = d.status === 1 || d.status === 2
          if (!inRange && !isActive) return false
        } else if (weekFilter === 'last_week') {
          if (!end || end.isBefore(lwStart) || end.isAfter(lwEnd)) return false
        } else if (weekFilter === 'this_week') {
          if (!end || end.isBefore(twStart) || end.isAfter(twEnd)) return false
        } else if (weekFilter === 'next_week') {
          if (!end || end.isBefore(nwStart) || end.isAfter(nwEnd)) return false
        }
      }
      // search
      if (kw && !d.duty_nm?.toLowerCase().includes(kw)) return false
      return true
    })
  }, [allDuties, weekFilter, statusFilter, searchKeyword])

  // Split filtered AR tasks: bound to a system vs standalone
  const systemDuties     = useMemo(() => filteredDuties.filter((d) => !!d.system_id), [filteredDuties])
  const standaloneDuties = useMemo(() => filteredDuties.filter((d) => !d.system_id),  [filteredDuties])

  // Meeting notes for duty cards, keyed by note ref key
  const [dutyNotes, setDutyNotes] = useState<Record<string, MeetingNote[]>>({})

  // Load duty notes after allDuties arrives
  useEffect(() => {
    if (allDuties.length === 0) return
    const keys = new Set<string>()
    allDuties.forEach((d) => keys.add(d.system_id || 'ar_standalone'))
    Promise.all(
      Array.from(keys).map((key) =>
        meetingNoteApi.list(key)
          .then((res) => ({ key, notes: Array.isArray(res.content) ? res.content : [] }))
          .catch(() => ({ key, notes: [] }))
      )
    ).then((results) => {
      const map: Record<string, MeetingNote[]> = {}
      results.forEach(({ key, notes }) => {
        map[key] = notes.map((n: ApiMeetingNote) => ({
          id: n.id, projectId: n.projectId, type: n.type,
          content: n.content, taskId: n.taskId ?? undefined,
          taskName: n.taskName ?? undefined,
          author: n.author, createdAt: n.createdAt, status: n.status,
        }))
      })
      setDutyNotes(map)
    })
  }, [allDuties])

  const handleAddDutyNote = useCallback((
    noteKey: string,
    taskId: string | null,
    taskName: string | null,
    type: NoteType,
    content: string
  ) => {
    meetingNoteApi.create(noteKey, { note_type: type, content, task_id: taskId, task_name: taskName })
      .then((res) => {
        if (!res.content) return
        const n = res.content as ApiMeetingNote
        const note: MeetingNote = {
          id: n.id, projectId: n.projectId, type: n.type,
          content: n.content, taskId: n.taskId ?? undefined,
          taskName: n.taskName ?? undefined,
          author: n.author, createdAt: n.createdAt, status: n.status,
        }
        setDutyNotes((prev) => ({ ...prev, [noteKey]: [note, ...(prev[noteKey] ?? [])] }))
      }).catch(() => {})
  }, [])

  const handleResolveDutyNote = useCallback((noteKey: string, noteId: string) => {
    setDutyNotes((prev) => ({
      ...prev,
      [noteKey]: (prev[noteKey] ?? []).map((n) =>
        n.id === noteId ? { ...n, status: n.status === 'pending' ? 'resolved' : 'pending' } : n
      ),
    }))
    const note = (dutyNotes[noteKey] ?? []).find((n) => n.id === noteId)
    const newStatus = note?.status === 'pending' ? 'resolved' : 'pending'
    meetingNoteApi.updateStatus(noteId, newStatus).catch(() => {
      setDutyNotes((prev) => ({
        ...prev,
        [noteKey]: (prev[noteKey] ?? []).map((n) =>
          n.id === noteId ? { ...n, status: note?.status ?? 'pending' } : n
        ),
      }))
    })
  }, [dutyNotes])

  const handleDeleteDutyNote = useCallback((noteKey: string, noteId: string) => {
    setDutyNotes((prev) => ({
      ...prev,
      [noteKey]: (prev[noteKey] ?? []).filter((n) => n.id !== noteId),
    }))
    meetingNoteApi.delete(noteId).catch(() => {})
  }, [])

  const weekLabel = useMemo(() => {
    const ws = dayjs().isoWeekday(1)
    return `${ws.format('MM/DD')} — ${ws.add(6, 'day').format('MM/DD')}`
  }, [])

  const handleWeekTagClick = (wt: WeekTag) => {
    setWeekFilter((prev) => prev === wt ? 'all' : wt)
  }

  if (!isManager) {
    return (
      <div className="p-6">
        <Empty description={t('wbs.managerOnly')} className="py-20" />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('wbs.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {t('wbs.subtitle', { week: weekLabel })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalPendingNotes > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600">
                {t('wbs.pendingNotesTotal', { count: totalPendingNotes })}
              </span>
            </div>
          )}
          <button
            onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 border border-blue-200 hover:border-blue-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            <PresentationChartBarIcon className="w-3.5 h-3.5" />
            {t('wbs.weeklyReportPreview')}
          </button>
          <button
            onClick={() => exportWbsCSV(wbsData, t)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            {t('wbs.exportCsv')}
          </button>
          <span className="text-xs text-slate-500 bg-slate-100 rounded-lg px-2 py-1">
            <CalendarDaysIcon className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
            {dayjs().format('YYYY/MM/DD dddd')}
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label: t('wbs.summaryProjects'), value: summary.totalProjects, unit: t('wbs.unitCount'), color: '#2563eb', bg: '#eff6ff' },
          { label: t('wbs.summaryTotal'),    value: summary.totalTasks,    unit: t('wbs.unitItem'),  color: '#64748b', bg: '#f8fafc' },
          { label: t('wbs.summaryCompleted'),value: summary.completed,     unit: t('wbs.unitItem'),  color: '#2563eb', bg: '#eff6ff' },
          { label: t('wbs.summaryInProgress'),value: summary.inProgress,   unit: t('wbs.unitItem'),  color: '#16a34a', bg: '#f0fdf4' },
          { label: t('wbs.summaryOverdue'),  value: summary.overdue,       unit: t('wbs.unitItem'),  color: '#dc2626', bg: '#fef2f2' },
          { label: t('wbs.summaryNotStarted'),value: summary.notStarted,   unit: t('wbs.unitItem'),  color: '#94a3b8', bg: '#f8fafc' },
          { label: t('wbs.summaryThisWeek'), value: summary.thisWeek,      unit: t('wbs.unitItem'),  color: '#2563eb', bg: '#eff6ff' },
          { label: t('wbs.summaryNextWeek'), value: summary.nextWeek,      unit: t('wbs.unitItem'),  color: '#7c3aed', bg: '#f5f3ff' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2.5">
            <div className="text-[10px] text-slate-400 mb-0.5">{s.label}</div>
            <div className="text-lg font-bold leading-tight" style={{ color: s.color }}>
              {s.value}<span className="text-[10px] font-normal text-slate-400 ml-0.5">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500">{t('wbs.weekFilter')}</span>
          <Segmented
            value={weekFilter}
            onChange={(v) => setWeekFilter(v as WeekFilter)}
            options={[
              { label: t('wbs.recentThreeWeeks'), value: 'all' },
              { label: t('wbs.lastWeek'), value: 'last_week' },
              { label: t('wbs.thisWeek'), value: 'this_week' },
              { label: t('wbs.nextWeek'), value: 'next_week' },
              { label: t('wbs.showAllTasks'), value: 'show_all' },
            ]}
            size="small"
          />
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500">{t('wbs.statusFilter')}</span>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TaskStatus | 'all')}
            options={[
              { label: t('common.all'), value: 'all' },
              { label: t('wbs.inProgress'), value: 'in_progress' },
              { label: t('wbs.overdue'), value: 'overdue' },
              { label: t('wbs.completed'), value: 'completed' },
              { label: t('wbs.notStarted'), value: 'not_started' },
              { label: t('wbs.suspended'), value: 'suspended' },
            ]}
            size="small"
          />
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <FolderIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500">{t('wbs.groupFilter')}</span>
          <Segmented
            value={wbsGroupMode}
            onChange={(v) => setWbsGroupMode(v as 'by_group' | 'by_req')}
            options={[
              { label: t('wbs.byGroup'), value: 'by_group' },
              { label: t('common.byReq'), value: 'by_req' },
            ]}
            size="small"
          />
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />
          <Input
            placeholder={t('wbs.searchPlaceholder')}
            allowClear
            size="small"
            style={{ width: 160, borderRadius: 8 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
        <div className="ml-auto text-xs text-slate-400">
          {t('wbs.showingItems', { filtered: filteredTaskCount, total: summary.totalTasks })}
          {weekFilter === 'show_all' && <Tag color="orange" style={{ fontSize: 9, margin: '0 0 0 6px', lineHeight: '14px', padding: '0 3px' }}>{t('wbs.includesHistory')}</Tag>}
        </div>
      </div>

      {/* Empty state — only when both sections are empty */}
      {filteredProjects.length === 0 && filteredDuties.length === 0 && (
        <Empty description={t('wbs.noMatchingTasks')} className="my-16" />
      )}

      {/* Project cards */}
      {filteredProjects.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-700">{t('wbs.projectTasks')}</span>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              {t('wbs.projectCount', { count: filteredProjects.length })}
            </span>
          </div>
          {filteredProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              originalProject={originalProjectMap[p.id]}
              onWeekTagClick={handleWeekTagClick}
              expandedTaskId={expandedTaskId}
              onToggleTaskExpand={handleToggleTaskExpand}
              notes={meetingNotes[p.id] ?? []}
              onAddNote={(taskId, taskName, type, content) => handleAddNote(p.id, taskId, taskName, type, content)}
              onResolveNote={(noteId) => handleResolveNote(p.id, noteId)}
              onDeleteNote={(noteId) => handleDeleteNote(p.id, noteId)}
              groupMode={wbsGroupMode}
            />
          ))}
        </>
      )}

      {/* System-bound AR Tasks — one DutyCard per system */}
      {systemDuties.length > 0 && (() => {
        const systemMap = new Map<string, { systemNm: string; duties: TemporaryDuty[]; noteKey: string }>()
        systemDuties.forEach((d) => {
          const key     = d.system_id!
          const noteKey = key   // system_id is a 32-char UUID, fits VARCHAR(32)
          if (!systemMap.has(key)) systemMap.set(key, { systemNm: d.system_nm ?? key, duties: [], noteKey })
          systemMap.get(key)!.duties.push(d)
        })
        return (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-semibold text-slate-700">{t('wbs.systemTasks')}</span>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{t('common.itemCount', { count: systemDuties.length })}</span>
            </div>
            {Array.from(systemMap.entries()).map(([sysId, { systemNm, duties, noteKey }]) => (
              <DutyCard
                key={systemNm}
                title={systemNm}
                duties={duties}
                notes={dutyNotes[noteKey] ?? []}
                onSelect={setSelectedDutyId}
                onWeekTagClick={handleWeekTagClick}
                onAddNote={(tid, tnm, type, content) => handleAddDutyNote(noteKey, tid, tnm, type, content)}
                onResolveNote={(noteId) => handleResolveDutyNote(noteKey, noteId)}
                onDeleteNote={(noteId) => handleDeleteDutyNote(noteKey, noteId)}
                tag="AR"
                systemInfo={systemInfoMap[sysId]}
                reqNameMap={reqNameMap}
                reqStatusMap={reqStatusMap}
                reqShelveReasonMap={reqShelveReasonMap}
                reqShelvedAtMap={reqShelvedAtMap}
              />
            ))}
          </div>
        )
      })()}

      {/* Standalone AR Tasks (no system) — single DutyCard */}
      {standaloneDuties.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-slate-700">{t('wbs.arTasks')}</span>
            <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{t('common.itemCount', { count: standaloneDuties.length })}</span>
          </div>
          <DutyCard
            title={t('wbs.arTasks')}
            duties={standaloneDuties}
            notes={dutyNotes['ar_standalone'] ?? []}
            onSelect={setSelectedDutyId}
            onWeekTagClick={handleWeekTagClick}
            onAddNote={(tid, tnm, type, content) => handleAddDutyNote('ar_standalone', tid, tnm, type, content)}
            onResolveNote={(noteId) => handleResolveDutyNote('ar_standalone', noteId)}
            onDeleteNote={(noteId) => handleDeleteDutyNote('ar_standalone', noteId)}
          />
        </div>
      )}

      <ReportPreviewModal
        open={previewOpen}
        projects={wbsData}
        duties={allDuties}
        systemInfoMap={systemInfoMap}
        reqNameMap={reqNameMap}
        reqResponsibleMap={reqResponsibleMap}
        reqStatusMap={reqStatusMap}
        reqShelveReasonMap={reqShelveReasonMap}
        reqShelvedAtMap={reqShelvedAtMap}
        meetingNotes={meetingNotes}
        dutyNotes={dutyNotes}
        toName={toName}
        onClose={() => setPreviewOpen(false)}
      />

      {selectedFuncTask && (
        <FunctionDetailDrawer
          open
          projectId={selectedFuncTask.projectId}
          functionId={selectedFuncTask.functionId}
          onClose={() => setSelectedFuncTask(null)}
        />
      )}

      <DutyDetailDrawer
        open={selectedDutyId !== null}
        dutyId={selectedDutyId}
        onClose={() => setSelectedDutyId(null)}
      />

    </div>
  )
}

export default WbsOverviewPage
