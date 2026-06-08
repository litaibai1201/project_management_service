/**
 * StatisticsPage — 工作量統計 + 成員管理（合併頁面）
 * Tab 1 工時分析：工時趨勢折線圖 · 任務完成柱狀圖 · 超時分析橫條圖 · 個人餅圖
 * Tab 2 進度報告：日/週/月/季/年快捷切換 + 每位工程師進度彙整報告卡
 * Tab 3 個人工時分析：專案/BU/分類餅圖 + 加班統計
 * Tab 4 成員總覽：部門分組卡片 + 成員詳情抽屜（工時/專案/任務）
 */
import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import {
  Card, Row, Col, Table, Tag, Avatar, DatePicker, Segmented,
  Skeleton, Button, Dropdown, Tabs, Collapse, Badge, Tooltip,
  Empty, Drawer, Input, Progress,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'
import {
  ChartBarIcon, ClockIcon, CheckCircleIcon, ChevronDownIcon,
  ExclamationTriangleIcon, UserGroupIcon, ArrowDownTrayIcon,
  DocumentTextIcon, CalendarDaysIcon, BoltIcon, SunIcon,
  UserIcon, MagnifyingGlassIcon, BriefcaseIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import type { MenuProps } from 'antd'
import { projectApi } from '@/api/project.api'
import { groupApi } from '@/api/group.api'
import { MemberWorkStat } from '@/types/api.types'
import type { DailyLog } from '@/types/api.types'
import { backendDetailToLog } from '@/api/daily_log.api'
import { SelfReportView } from '@/features/dailylog/DailyLogPage'
import { tokenStorage } from '@/api/httpClient'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import { PROJECT_STATUS_MAP, DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import dayjs, { Dayjs } from 'dayjs'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'

const { RangePicker } = DatePicker
const { Panel } = Collapse

// ─── CSV export utility ────────────────────────────────────────────────────────
function exportCSV(filename: string, rows: string[][]): void {
  const bom = '\uFEFF'
  const csv = bom + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Project-hours distribution per member (loaded from API) ──────────────────
const PIE_PALETTE = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#db2777']

// ─── Progress Report Mock Data ─────────────────────────────────────────────────

interface CompletedTask  { id: string; name: string; project: string; type: 'function'|'duty'; completed_at: string; hours: number; expected_start_date?: string; expected_end_date?: string; requirement_nm?: string; group?: string }
interface InProgressTask { id: string; name: string; project: string; progress: number; days_left: number; status: 'normal'|'urgent'|'overdue'; expected_start_date?: string; expected_end_date?: string; hours?: number; requirement_nm?: string; group?: string }
interface OverdueTask    { id: string; name: string; project: string; days_overdue: number; requirement_nm?: string; group?: string }

interface ReportDailyLog {
  log_id:      string
  work_no:     string
  log_date:    string
  total_hours: number
  status:      number
  task_items:  Record<string, unknown>[]
  free_items:  Record<string, unknown>[]
  remark:      string
}

interface ReportMember {
  work_no:        string
  name:           string
  period_hours:   number
  updates_count:  number
  completed:      CompletedTask[]
  in_progress:    InProgressTask[]
  not_started?:   InProgressTask[]
  daily_logs:     ReportDailyLog[]
  overdue:        OverdueTask[]
}

// Report data is loaded from the API per period selection

// ─── Period presets ────────────────────────────────────────────────────────────
type PeriodKey = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
interface PeriodPreset { key: PeriodKey; labelKey: string; range: () => [Dayjs, Dayjs] }
const PERIOD_PRESETS: PeriodPreset[] = [
  { key: 'day',     labelKey: 'statistics.today',       range: () => [dayjs().startOf('day'),    dayjs().endOf('day')]    },
  { key: 'week',    labelKey: 'statistics.thisWeek',    range: () => [dayjs().startOf('week'),   dayjs().endOf('week')]   },
  { key: 'month',   labelKey: 'statistics.thisMonth',   range: () => [dayjs().startOf('month'),  dayjs().endOf('month')]  },
  { key: 'quarter', labelKey: 'statistics.thisQuarter', range: () => {
    const m = dayjs().month(); const q = Math.floor(m / 3)
    return [dayjs().month(q * 3).startOf('month'), dayjs().month(q * 3 + 2).endOf('month')]
  }},
  { key: 'year',    labelKey: 'statistics.thisYear',    range: () => [dayjs().startOf('year'),   dayjs().endOf('year')]   },
]

// ─── Colors & helpers ─────────────────────────────────────────────────────────
const COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#dc2626']

// ─── Stat mini-card ───────────────────────────────────────────────────────────
const MiniStatCard: React.FC<{
  title: string; value: number; unit?: string
  icon: React.ReactNode; color: string; bg: string
}> = ({ title, value, unit = '', icon, color, bg }) => (
  <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '16px 20px' }}>
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-400 font-medium">{title}</div>
        <div className="text-2xl font-bold leading-tight" style={{ color }}>
          {value}<span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>
        </div>
      </div>
    </div>
  </Card>
)

// ─── Export Button ─────────────────────────────────────────────────────────────
const ExportButton: React.FC<{ stats: MemberWorkStat[] }> = ({ stats }) => {
  const { t } = useTranslation()

  const handleExportCSV = () => {
    const headers = [t('statistics.memberColumn'), t('auth.workNo'), t('statistics.accumulatedHoursColumn')+'(h)', t('statistics.completedTasksColumn'), t('statistics.overdueTasksColumn'), t('statistics.inProgressColumn')]
    const rows = stats.map((m) => [m.name, m.work_no, String(m.total_hours), String(m.completed_tasks), String(m.overdue_tasks), String(m.in_progress_tasks)])
    exportCSV(`${t('statistics.workloadStatsTitle')}_${dayjs().format('YYYY-MM-DD')}.csv`, [headers, ...rows])
  }

  const handleExportDetailCSV = () => {
    const rows: string[][] = [[t('statistics.memberColumn'), t('auth.workNo'), t('wbs.title'), t('common.hours')+'(h)']]
    stats.forEach((m) => {
      m.weekly_hours?.forEach((w) => {
        rows.push([m.name, m.work_no, w.week, String(w.hours)])
      })
    })
    exportCSV(`${t('statistics.workloadStatsTitle')}_${dayjs().format('YYYY-MM-DD')}.csv`, rows)
  }

  const menuItems: MenuProps['items'] = [
    { key: 'summary', label: t('statistics.exportSummaryCSV'),     icon: <ArrowDownTrayIcon className="w-4 h-4" />, onClick: handleExportCSV       },
    { key: 'detail',  label: t('statistics.exportWeeklyDetailCSV'), icon: <ArrowDownTrayIcon className="w-4 h-4" />, onClick: handleExportDetailCSV },
  ]

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
      <Button size="small" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />} className="text-slate-600">
        {t('statistics.export')}
      </Button>
    </Dropdown>
  )
}

// ─── Progress Report Export ────────────────────────────────────────────────────
// ── Shared: build hierarchy tree from all members' logs ────────────────────────
interface FlatEntry { category: string; projectNm: string; reqNm: string; group: string; taskNm: string; date: string; description: string; hours: number; member: string; isToday: boolean }
interface TaskLeaf { entries: FlatEntry[]; hours: number }
type HierTree = Map<string, Map<string, Map<string, Map<string, Map<string, TaskLeaf>>>>>

function buildReportTree(reports: ReportMember[], t: (k: string) => string): { tree: HierTree; catLabels: Record<string, string> } {
  const today = dayjs().format('YYYY-MM-DD')
  const catLabels: Record<string, string> = {
    project: t('duty.projectTask'), system_req: t('duty.systemTask'), duty: 'AR',
    cr_ar: 'CR/AR',
    training: t('dailyLog.catTraining' as string) || '教育训练', meeting: t('dailyLog.catMeeting' as string) || '工作会议',
    other: t('dailyLog.catOther' as string) || '其他', management: t('dailyLog.catManagement' as string) || '管理',
    overtime: t('dailyLog.catOvertime' as string) || '加班', leave: t('dailyLog.catLeave' as string) || '休假',
  }
  const tree: HierTree = new Map()

  for (const r of reports) {
    for (const lg of (r.daily_logs ?? [])) {
      const isToday = lg.log_date === today
      for (const item of (lg.task_items ?? []).map((x) => ({ ...x as object, _src: 'task' })).concat(
        (lg.free_items ?? []).map((x) => ({ ...x as object, _src: 'free' }))
      )) {
        const ti = item as Record<string, unknown>
        // task_items: task_type='project'|'duty', system_nm → system_req
        // free_items: category='meeting'|'training'|...
        const rawCat = ti._src === 'task'
          ? (ti.system_nm ? 'system_req' : String(ti.task_type ?? 'project'))
          : String(ti.category ?? 'other')
        const fi: FlatEntry = {
          category:    rawCat,
          projectNm:   String(ti.project_nm ?? ti.system_nm ?? ''),
          reqNm:       String(ti.requirement_nm ?? ''),
          group:       String(ti.group1 === '__stage__' ? (t('common.stageTaskPlain') || '评估与规划') : (ti.group1 ?? '')),
          taskNm:      String(ti.task_nm ?? ti.duty_nm ?? ti.category ?? ''),
          date:        lg.log_date ?? '',
          description: String(ti.description ?? '').replace(/<[^>]*>/g, ''),
          hours:       Number(ti.work_hours ?? 0),
          member:      r.name,
          isToday,
        }
        if (!tree.has(fi.category)) tree.set(fi.category, new Map())
        const projMap = tree.get(fi.category)!
        if (!projMap.has(fi.projectNm)) projMap.set(fi.projectNm, new Map())
        const reqMap = projMap.get(fi.projectNm)!
        const rk = fi.reqNm || '-'
        if (!reqMap.has(rk)) reqMap.set(rk, new Map())
        const grpMap = reqMap.get(rk)!
        const gk = fi.group || '-'
        if (!grpMap.has(gk)) grpMap.set(gk, new Map())
        const taskNodes = grpMap.get(gk)!
        if (!taskNodes.has(fi.taskNm)) taskNodes.set(fi.taskNm, { entries: [], hours: 0 })
        const tn = taskNodes.get(fi.taskNm)!
        tn.entries.push(fi)
        tn.hours += fi.hours
      }
    }
  }
  return { tree, catLabels }
}

// ── CSV Export ─────────────────────────────────────────────────────────────────
function exportReportCSV(reports: ReportMember[], periodLabel: string, t: (key: string) => string) {
  const { tree, catLabels } = buildReportTree(reports, t)

  // Part 1: Member summary table
  const rows: string[][] = [
    [t('statistics.csvReportPeriod'), periodLabel],
    [],
    [t('statistics.csvName'), t('statistics.csvWorkNo'), t('statistics.csvPeriodHours'), t('statistics.csvUpdatesCount'), t('statistics.csvCompletedCount'), t('statistics.csvInProgressCount'), t('statistics.csvOverdueCount')],
    ...reports.map((r) => [
      r.name, r.work_no, String(r.period_hours), String(r.updates_count),
      String(r.completed.length), String(r.in_progress.length), String(r.overdue.length),
    ]),
  ]

  // Part 2: Detail flat table sorted by category → project → req → group → task → date
  rows.push([], [`─── ${t('statistics.csvDailyLogDetail')} ───`])
  const detailHeaders = [t('common.type'), t('projectReport.project') + '/' + t('projectReport.system'), t('nav.requirementList'), t('projectDetail.colGroup'), t('statistics.csvTaskName'), t('statistics.csvDate'), t('statistics.csvWorkContent'), t('statistics.csvWorkHours'), t('statistics.csvName')]
  rows.push(detailHeaders)

  // Flatten tree into sorted rows
  for (const [cat, projMap] of tree) {
    const catLabel = catLabels[cat] ?? cat
    for (const [projNm, reqMap] of projMap) {
      for (const [rk, grpMap] of reqMap) {
        for (const [gk, taskNodes] of grpMap) {
          for (const [taskNm, tn] of taskNodes) {
            const sorted = [...tn.entries].sort((a, b) => a.date.localeCompare(b.date))
            for (const e of sorted) {
              rows.push([catLabel, projNm, rk === '-' ? '' : rk, gk === '-' ? '' : gk, taskNm, e.date, e.description, `${e.hours}`, e.member])
            }
          }
        }
      }
    }
  }

  exportCSV(`${t('statistics.csvProgressReport')}_${periodLabel}_${dayjs().format('YYYY-MM-DD')}.csv`, rows)
}

// ── Word Export ────────────────────────────────────────────────────────────────
async function exportReportWord(reports: ReportMember[], periodLabel: string, t: (key: string) => string) {
  const { Document, Packer, Paragraph, TextRun, Table: DocTable, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel } = await import('docx')
  const { tree, catLabels } = buildReportTree(reports, t)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = []

  // ── Part 1: Title + Member summary table ──
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: t('statistics.csvProgressReport'), bold: true, size: 32 })],
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: periodLabel, size: 20, color: '666666' })],
  }))

  // Summary table
  const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
  const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  const summaryHeaders = [t('statistics.csvName'), t('statistics.csvPeriodHours'), t('statistics.csvCompletedCount'), t('statistics.csvInProgressCount'), t('statistics.csvOverdueCount')]
  const summaryHeaderRow = new TableRow({
    children: summaryHeaders.map((h) => new TableCell({
      borders: cellBorders,
      shading: { type: 'clear' as unknown as undefined, fill: 'EFF6FF' },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, size: 18, color: '1E3A5F' })] })],
    })),
  })
  const summaryDataRows = reports.map((r) => new TableRow({
    children: [
      new TableCell({ borders: cellBorders, children: [new Paragraph({ children: [new TextRun({ text: r.name, size: 18 })] })] }),
      new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${r.period_hours}h`, size: 18 })] })] }),
      new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.completed.length), size: 18, color: '16A34A' })] })] }),
      new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.in_progress.length), size: 18, color: '2563EB' })] })] }),
      new TableCell({ borders: cellBorders, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(r.overdue.length), size: 18, color: r.overdue.length > 0 ? 'DC2626' : '333333' })] })] }),
    ],
  }))
  children.push(new DocTable({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [summaryHeaderRow, ...summaryDataRows],
  }))

  // ── Part 2: Detail flat table (same as CSV) ──
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 500 },
    children: [new TextRun({ text: t('statistics.csvDailyLogDetail'), bold: true, size: 26 })],
  }))

  // Build flat rows from tree
  const detailHeaders = [t('common.type'), t('projectReport.project') + '/' + t('projectReport.system'), t('nav.requirementList'), t('projectDetail.colGroup'), t('statistics.csvTaskName'), t('statistics.csvDate'), t('statistics.csvWorkContent'), t('statistics.csvWorkHours'), t('statistics.csvName')]
  const detailWidths = [8, 10, 8, 7, 10, 7, 33, 6, 7]

  const detailHeaderCells = detailHeaders.map((h, i) => new TableCell({
    borders: cellBorders,
    width: { size: detailWidths[i], type: WidthType.PERCENTAGE },
    shading: { type: 'clear' as unknown as undefined, fill: 'EFF6FF' },
    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 15, color: '1E3A5F' })] })],
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detailDataRows: any[] = []
  for (const [cat, projMap] of tree) {
    const catLabel = catLabels[cat] ?? cat
    for (const [projNm, reqMap] of projMap) {
      for (const [rk, grpMap] of reqMap) {
        for (const [gk, taskNodes] of grpMap) {
          for (const [taskNm, tn] of taskNodes) {
            const sorted = [...tn.entries].sort((a, b) => a.date.localeCompare(b.date))
            for (const e of sorted) {
              const tc = e.isToday ? 'B45309' : '333333'
              const bg = e.isToday ? 'FFFBEB' : undefined
              const vals = [catLabel, projNm, rk === '-' ? '' : rk, gk === '-' ? '' : gk, taskNm, e.date.slice(5), e.description || '-', `${e.hours}h`, e.member]
              detailDataRows.push(new TableRow({
                children: vals.map((v, i) => new TableCell({
                  borders: cellBorders,
                  width: { size: detailWidths[i], type: WidthType.PERCENTAGE },
                  ...(bg ? { shading: { type: 'clear' as unknown as undefined, fill: bg } } : {}),
                  children: [new Paragraph({ children: [new TextRun({ text: v, size: 15, color: tc, bold: e.isToday && (i === 5 || i === 7) })] })],
                })),
              }))
            }
          }
        }
      }
    }
  }

  children.push(new DocTable({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: detailHeaderCells }), ...detailDataRows],
  }))

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${t('statistics.csvProgressReport')}_${periodLabel}_${dayjs().format('YYYY-MM-DD')}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Report Member Card ────────────────────────────────────────────────────────
const MemberReportCard: React.FC<{ report: ReportMember; initialExpanded?: boolean }> = ({ report, initialExpanded = false }) => {
  const { t } = useTranslation()
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const avatarBg = report.overdue.length > 0 ? '#fef2f2' : '#eff6ff'
  const avatarColor = report.overdue.length > 0 ? '#dc2626' : '#2563eb'

  React.useEffect(() => {
    if (initialExpanded && cardRef.current) {
      setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    }
  }, [initialExpanded])

  const headerExtra = (
    <div className="flex items-center gap-2">
      <Tooltip title={t('statistics.periodHoursTooltip')}>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <ClockIcon className="w-3.5 h-3.5" />
          <span className="font-semibold text-blue-600">{report.period_hours}h</span>
        </div>
      </Tooltip>
      <Tooltip title={t('statistics.updatesCountTooltip')}>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <DocumentTextIcon className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-600">{t('statistics.updateCount', { count: report.updates_count })}</span>
        </div>
      </Tooltip>
      {report.overdue.length > 0 && (
        <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}>
          {t('statistics.overdueCountTag', { count: report.overdue.length })}
        </Tag>
      )}
      <Tag
        color={report.completed.length > 0 ? 'success' : 'default'}
        style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}
      >
        {t('statistics.completedCountTag', { count: report.completed.length })}
      </Tag>
    </div>
  )

  return (
    <>
    <div ref={cardRef}>
    <Collapse
      defaultActiveKey={initialExpanded ? ['main'] : []}
      className="mb-3 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
      expandIconPosition="end"
    >
      <Panel
        key="main"
        header={
          <div className="flex items-center gap-3">
            <Avatar
              size={32}
              style={{ background: avatarBg, color: avatarColor, fontSize: 12, fontWeight: 700, flexShrink: 0 }}
            >
              {report.name[0]}
            </Avatar>
            <span className="font-semibold text-slate-700 text-sm">{report.name}</span>
            <span className="text-xs text-slate-400">{report.work_no}</span>
            {report.overdue.length > 0 && (
              <div className="flex items-center gap-1 ml-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-500 font-medium">{t('statistics.overdueTasksNote')}</span>
              </div>
            )}
          </div>
        }
        extra={headerExtra}
      >
        <div className="pt-1 pb-2">
          {/* ─── Daily log view (reusing SelfReportView from DailyLogPage) ── */}
          {(() => {
            // Convert backend daily_logs to DailyLog format
            const logsMap: Record<string, DailyLog> = {}
            for (const raw of report.daily_logs ?? []) {
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dl = backendDetailToLog(raw as any)
                logsMap[dl.log_date] = dl
              } catch { /* skip malformed */ }
            }
            const dates = Object.keys(logsMap).sort()
            const startDate = dates.length > 0 ? dayjs(dates[0]) : dayjs()
            const endDate   = dates.length > 0 ? dayjs(dates[dates.length - 1]) : dayjs()
            return (
              <SelfReportView
                startDate={startDate}
                endDate={endDate}
                logs={logsMap}
                onPreviewFile={(url, name) => setPreviewFile({ url, name })}
                authToken={tokenStorage.get()}
              />
            )
          })()}

          {/* ─── Task panels (3 columns, grouped by project) ─── */}
          {(() => {
            // Group tasks by project for each category
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const groupByProject = <T extends { id: string; project: string }>(tasks: T[]): Map<string, T[]> => {
              const m = new Map<string, T[]>()
              tasks.forEach((t) => { const k = t.project || '—'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) })
              return m
            }
            const completedByProj = groupByProject(report.completed)
            const inProgressByProj = groupByProject(report.in_progress)
            const notStartedByProj = groupByProject(report.not_started ?? [])

            const renderProjectGroup = (projNm: string, children: React.ReactNode, count: number, color: string) => (
              <details key={projNm} className="group mb-2">
                <summary className="flex items-center gap-2 cursor-pointer list-none px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors select-none">
                  <ChevronDownIcon className="w-3 h-3 text-slate-400 transition-transform group-open:rotate-0 -rotate-90 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-slate-700 flex-1 truncate">{projNm}</span>
                  <Badge count={count} color={color} style={{ fontSize: 9 }} />
                </summary>
                <div className="pl-2 space-y-1.5 mt-1">{children}</div>
              </details>
            )

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
                {/* ── Completed ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-3.5 rounded bg-green-500" />
                    <span className="text-xs font-semibold text-slate-600">{t('statistics.periodCompletedTasks')}</span>
                    <Badge count={report.completed.length} color="#16a34a" />
                  </div>
                  {report.completed.length === 0
                    ? <p className="text-xs text-slate-300 pl-3">{t('statistics.noPeriodCompletedTasks')}</p>
                    : [...completedByProj.entries()].map(([proj, tasks]) =>
                        renderProjectGroup(proj, tasks.map((task) => (
                          <div key={task.id} className="flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                            <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-700">{task.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {task.requirement_nm && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="purple">{task.requirement_nm}</Tag>}
                                {task.group && task.group !== '__stage__' && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="cyan">{task.group}</Tag>}
                                <span className="text-[10px] text-slate-400">{t('statistics.completedAt', { date: task.completed_at })}</span>
                                {Number(task.hours) > 0 && <span className="text-[10px] text-green-600 font-medium">{task.hours}h</span>}
                              </div>
                            </div>
                          </div>
                        )), tasks.length, '#16a34a')
                      )
                  }
                </div>

                {/* ── In-Progress ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-3.5 rounded bg-blue-500" />
                    <span className="text-xs font-semibold text-slate-600">{t('statistics.inProgressTasks')}</span>
                    <Badge count={report.in_progress.length} color="#2563eb" />
                  </div>
                  {report.in_progress.length === 0
                    ? <p className="text-xs text-slate-300 pl-3">{t('statistics.noInProgressTasks')}</p>
                    : [...inProgressByProj.entries()].map(([proj, tasks]) =>
                        renderProjectGroup(proj, tasks.map((task) => {
                          const borderColor = task.status === 'overdue' ? '#fecaca' : task.status === 'urgent' ? '#fed7aa' : '#e2e8f0'
                          const bgColor     = task.status === 'overdue' ? '#fef2f2' : task.status === 'urgent' ? '#fff7ed' : '#f8fafc'
                          return (
                            <div key={task.id} className="rounded-lg px-3 py-2 border" style={{ background: bgColor, borderColor }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{task.name}</span>
                                {task.status === 'overdue' && <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">{t('statistics.overdueBy', { days: Math.abs(task.days_left) })}</span>}
                                {task.status === 'urgent' && <span className="text-[10px] text-orange-500 font-semibold flex-shrink-0">{t('statistics.daysLeftShort', { days: task.days_left })}</span>}
                                {task.status === 'normal' && <span className="text-[10px] text-slate-400 flex-shrink-0">{t('statistics.daysLeftShort', { days: task.days_left })}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-white rounded-full h-1.5 overflow-hidden border border-slate-100">
                                  <div className="h-full rounded-full" style={{ width: `${task.progress}%`, background: task.status === 'overdue' ? '#f87171' : task.status === 'urgent' ? '#fb923c' : '#60a5fa' }} />
                                </div>
                                <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0 w-7 text-right">{task.progress}%</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {task.requirement_nm && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="purple">{task.requirement_nm}</Tag>}
                                {task.group && task.group !== '__stage__' && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="cyan">{task.group}</Tag>}
                                {(task.expected_start_date || task.expected_end_date) && (
                                  <span className="text-[10px] text-slate-300">{task.expected_start_date || '—'} ~ {task.expected_end_date || '—'}</span>
                                )}
                                {(task.hours ?? 0) > 0 && <span className="text-[10px] text-blue-600 font-medium">{task.hours}h</span>}
                              </div>
                            </div>
                          )
                        }), tasks.length, '#2563eb')
                      )
                  }
                </div>

                {/* ── Not Started ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-1 h-3.5 rounded bg-slate-400" />
                    <span className="text-xs font-semibold text-slate-600">{t('statistics.notStartedTasks')}</span>
                    <Badge count={(report.not_started ?? []).length} color="#94a3b8" />
                  </div>
                  {(report.not_started ?? []).length === 0
                    ? <p className="text-xs text-slate-300 pl-3">{t('statistics.noNotStartedTasks')}</p>
                    : [...notStartedByProj.entries()].map(([proj, tasks]) =>
                        renderProjectGroup(proj, tasks.map((task) => {
                          const isOverdue = task.status === 'overdue'
                          return (
                            <div key={task.id} className={`rounded-lg px-3 py-2 border ${isOverdue ? 'bg-red-50/50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-medium text-slate-700 flex-1 truncate">{task.name}</span>
                                {isOverdue && <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">{t('statistics.alreadyOverdue')}</span>}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {task.requirement_nm && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="purple">{task.requirement_nm}</Tag>}
                                {task.group && task.group !== '__stage__' && <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '14px' }} color="cyan">{task.group}</Tag>}
                                <span className="text-[10px] text-slate-300">
                                  {t('statistics.expectedPeriod', { start: task.expected_start_date || '—', end: task.expected_end_date || '—' })}
                                </span>
                              </div>
                            </div>
                          )
                        }), tasks.length, '#94a3b8')
                      )
                  }
                </div>
              </div>
            )
          })()}
        </div>
      </Panel>
    </Collapse>
    </div>

    {previewFile && (
      <FilePreviewModal
        directUrl={previewFile.url}
        filename={previewFile.name}
        onClose={() => setPreviewFile(null)}
      />
    )}
    </>
  )
}

// ─── Progress Report Tab ───────────────────────────────────────────────────────
const ProgressReportTab: React.FC<{ initialPeriod?: PeriodKey; initialMember?: string }> = ({ initialPeriod = 'week', initialMember }) => {
  const { t } = useTranslation()
  const [period,      setPeriod]      = useState<PeriodKey>(initialPeriod)
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [reports,     setReports]     = useState<ReportMember[]>([])

  const currentPreset = PERIOD_PRESETS.find((p) => p.key === period)
  const range  = period === 'custom' && customRange ? customRange : (currentPreset?.range() ?? [dayjs().startOf('week'), dayjs().endOf('week')])
  const dateLabel = `${range[0].format('YYYY/MM/DD')} — ${range[1].format('YYYY/MM/DD')}`
  const periodLabel = period === 'custom' ? dateLabel : (currentPreset ? t(currentPreset.labelKey) : '') + ' ' + dateLabel

  useEffect(() => {
    const startStr = range[0].format('YYYY-MM-DD')
    const endStr   = range[1].format('YYYY-MM-DD')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(projectApi as any).progressReport({ start_date: startStr, end_date: endStr })
      .then((res: { content?: unknown }) => {
        if (Array.isArray(res.content)) setReports(res.content as ReportMember[])
        else setReports([])
      })
      .catch(() => setReports([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customRange])

  const totalHours    = reports.reduce((s, r) => s + r.period_hours, 0)
  const totalUpdates  = reports.reduce((s, r) => s + r.updates_count, 0)
  const totalDone     = reports.reduce((s, r) => s + r.completed.length, 0)
  const totalOverdue  = reports.reduce((s, r) => s + r.overdue.length, 0)
  const atRiskCount   = reports.filter((r) => r.overdue.length > 0 || r.in_progress.some((t) => t.status !== 'normal')).length

  const REPORT_PRESETS = [
    { labelKey: 'statistics.lastWeek',    range: () => [dayjs().subtract(1, 'week').startOf('week'), dayjs().subtract(1, 'week').endOf('week')] as [Dayjs, Dayjs] },
    { labelKey: 'statistics.thisWeek',    range: () => [dayjs().startOf('week'), dayjs().endOf('week')] as [Dayjs, Dayjs] },
    { labelKey: 'statistics.thisMonth',   range: () => [dayjs().startOf('month'), dayjs().endOf('month')] as [Dayjs, Dayjs] },
    { labelKey: 'statistics.thisQuarter', range: () => { const m = dayjs().month(); const q = Math.floor(m / 3); return [dayjs().month(q * 3).startOf('month'), dayjs().month(q * 3 + 2).endOf('month')] as [Dayjs, Dayjs] } },
    { labelKey: 'statistics.thisYear',    range: () => [dayjs().startOf('year'), dayjs().endOf('year')] as [Dayjs, Dayjs] },
  ]

  return (
    <div>
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <CalendarDaysIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{t('statistics.reportPeriod')}</span>

        {/* Quick preset buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {REPORT_PRESETS.map((p) => {
            const [ps, pe] = p.range()
            const active = range[0].isSame(ps, 'day') && range[1].isSame(pe, 'day')
            return (
              <button
                key={p.labelKey}
                onClick={() => { setPeriod('custom'); setCustomRange(p.range()) }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border-0 outline-none cursor-pointer ${
                  active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t(p.labelKey)}
              </button>
            )
          })}
        </div>

        <RangePicker
          size="small"
          style={{ borderRadius: 8 }}
          value={[range[0], range[1]]}
          onChange={(dates) => { if (dates) { setPeriod('custom'); setCustomRange([dates[0]!, dates[1]!]) } }}
        />

        <div className="ml-auto flex items-center gap-2">
          <Dropdown menu={{ items: [
            { key: 'csv', label: 'CSV', icon: <ArrowDownTrayIcon className="w-4 h-4" />, onClick: () => exportReportCSV(reports, periodLabel, t) },
            { key: 'word', label: 'Word', icon: <DocumentTextIcon className="w-4 h-4" />, onClick: () => exportReportWord(reports, periodLabel, t) },
          ] }} placement="bottomRight" trigger={['click']}>
            <Button
              size="small"
              icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />}
              className="text-slate-600"
            >
              {t('statistics.exportReport')}
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: t('statistics.periodTotalHours'),    value: totalHours,   unit: 'h',  color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" />              },
          { label: t('statistics.progressUpdates'),     value: totalUpdates, unit: '',   color: '#7c3aed', bg: '#f5f3ff', icon: <DocumentTextIcon className="w-4 h-4 text-violet-500" />     },
          { label: t('statistics.completedTasksCount'), value: totalDone,    unit: '',   color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />        },
          { label: t('statistics.overdueTasksCount'),   value: totalOverdue, unit: '',   color: '#dc2626', bg: '#fef2f2', icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />  },
          { label: t('statistics.membersNeedAttention'),value: atRiskCount,  unit: '',   color: '#d97706', bg: '#fff7ed', icon: <BoltIcon className="w-4 h-4 text-orange-500" />               },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="text-[10px] text-slate-400 leading-none mb-0.5">{s.label}</div>
              <div className="font-bold text-lg leading-none" style={{ color: s.color }}>
                {s.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{s.unit}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Member report cards */}
      <div className="mb-2 flex items-center gap-2">
        <DocumentTextIcon className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-600">{t('statistics.engineerProgressSummary')}</span>
        <span className="text-xs text-slate-400">{t('statistics.clickToExpand')}</span>
      </div>

      {reports.length === 0 ? (
        <Empty description={t('statistics.noProgressData')} className="my-12" />
      ) : (
        [...reports]
          .sort((a, b) => b.updates_count - a.updates_count || b.period_hours - a.period_hours)
          .map((r) => <MemberReportCard key={r.work_no} report={r} initialExpanded={r.work_no === initialMember} />)
      )}
    </div>
  )
}

// ─── Personal Work Analysis Tab ──────────────────────────────────────────────
// Data loaded from API per member selection
// ─── Member Overview Tab (merged from GroupMembersPage) ──────────────────────

const { Search } = Input

interface MemberRow {
  work_no:    string
  name:       string
  department: string
  position?:  string
}

interface MemberOverview {
  total_hours:       number
  completed_tasks:   number
  in_progress_tasks: number
  overdue_tasks:     number
  weekly_hours:      { week: string; hours: number }[]
}

const DEPT_COLORS: Record<string, string> = {
  '技術部': '#2563eb', '産品部': '#7c3aed', '運營部': '#d97706', '設計部': '#db2777',
  '資訊部': '#0891b2', '研發部': '#16a34a', '品保部': '#f59e0b',
}

const MiniMemberStat: React.FC<{
  label: string; value: number; unit?: string; icon: React.ReactNode; color: string; bg: string
}> = ({ label, value, unit = '', icon, color, bg }) => (
  <div className={`rounded-xl p-3 ${bg} flex items-center gap-3`}>
    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + '22' }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-800 leading-tight">
        {value}<span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>
      </div>
    </div>
  </div>
)

const MemberOverviewTab: React.FC = () => {
  const { t } = useTranslation()
  const [members,    setMembers]    = useState<MemberRow[]>([])
  const [filtered,   setFiltered]   = useState<MemberRow[]>([])
  const [isMemberLoading, setIsMemberLoading] = useState(false)
  const [keyword,    setKeyword]    = useState('')

  // Drawer state
  const [selectedMember,  setSelectedMember]  = useState<MemberRow | null>(null)
  const [overview,        setOverview]        = useState<MemberOverview | null>(null)
  const [memberProjects,  setMemberProjects]  = useState<Record<string, unknown>[]>([])
  const [memberDuties,    setMemberDuties]    = useState<Record<string, unknown>[]>([])
  const [drawerLoading,   setDrawerLoading]   = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsMemberLoading(true)
      try {
        const res = await groupApi.members({ page: 1, size: 100 })
        const c = res.content as { data_list?: MemberRow[]; project_list?: MemberRow[] }
        const list = (c.data_list ?? c.project_list ?? []) as MemberRow[]
        setMembers(list)
        setFiltered(list)
      } catch { /* global */ }
      finally { setIsMemberLoading(false) }
    }
    load()
  }, [])

  useEffect(() => {
    const kw = keyword.toLowerCase()
    setFiltered(kw ? members.filter((m) => m.name.includes(kw) || m.work_no.toLowerCase().includes(kw) || (m.department ?? '').includes(kw)) : members)
  }, [keyword, members])

  const openDrawer = async (member: MemberRow) => {
    setSelectedMember(member)
    setDrawerLoading(true)
    setOverview(null); setMemberProjects([]); setMemberDuties([])
    try {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
      const end   = today.toISOString().slice(0, 10)
      const [ovRes, prRes, duRes] = await Promise.all([
        groupApi.overview(member.work_no, { start_date: start, end_date: end }),
        groupApi.memberProjects(member.work_no, { page: 1, size: 10 }),
        groupApi.memberDuties(member.work_no, { page: 1, size: 10 }),
      ])
      setOverview(ovRes.content as MemberOverview)
      const pc = prRes.content as { data_list?: Record<string, unknown>[]; project_list?: Record<string, unknown>[] }
      setMemberProjects((pc.data_list ?? pc.project_list ?? []) as Record<string, unknown>[])
      const dc = duRes.content as { data_list?: Record<string, unknown>[] }
      setMemberDuties((dc.data_list ?? []) as Record<string, unknown>[])
    } catch { /* global */ }
    finally { setDrawerLoading(false) }
  }

  const closeDrawer = () => { setSelectedMember(null); setOverview(null) }
  const avatarColor = (m: MemberRow) => DEPT_COLORS[m.department] ?? '#64748b'

  const deptMap = filtered.reduce<Record<string, MemberRow[]>>((acc, m) => {
    ;(acc[m.department] = acc[m.department] ?? []).push(m)
    return acc
  }, {})

  return (
    <div>
      {/* Search bar */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 mb-5 flex gap-3">
        <Search
          placeholder={t('statistics.searchPlaceholder')}
          allowClear
          style={{ width: 280 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => setKeyword(v)}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <span className="text-xs text-slate-400 self-center">
          {keyword ? t('statistics.foundCount', { count: filtered.length }) : t('statistics.totalMembers', { count: members.length })}
        </span>
      </div>

      {/* Member cards by department */}
      {isMemberLoading ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} lg={8}><Card><Skeleton active avatar paragraph={{ rows: 2 }} /></Card></Col>
          ))}
        </Row>
      ) : filtered.length === 0 ? (
        <Empty description={t('statistics.noMatchingMembers')} className="py-20" />
      ) : (
        Object.entries(deptMap).map(([dept, list]) => (
          <div key={dept} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full" style={{ background: DEPT_COLORS[dept] ?? '#94a3b8' }} />
              <span className="font-semibold text-slate-600 text-sm">{dept}</span>
              <span className="text-xs text-slate-400">{t('statistics.memberCount', { count: list.length })}</span>
            </div>
            <Row gutter={[12, 12]}>
              {list.map((m) => (
                <Col key={m.work_no} xs={24} sm={12} lg={8}>
                  <Card
                    bordered={false}
                    className="shadow-sm hover:shadow-md cursor-pointer transition-all border border-slate-100 hover:border-blue-200"
                    bodyStyle={{ padding: '16px 20px' }}
                    onClick={() => openDrawer(m)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar size={44} style={{ background: avatarColor(m), fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
                        {m.name[0]}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm">{m.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{m.position ?? m.department}</div>
                        <div className="text-xs text-slate-300 mt-0.5 font-mono">{m.work_no}</div>
                      </div>
                      <Tag style={{ fontSize: 10, padding: '0 6px', flexShrink: 0 }} color={DEPT_COLORS[m.department] ? 'blue' : 'default'}>
                        {m.department}
                      </Tag>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}

      {/* Member Detail Drawer */}
      <Drawer
        title={
          selectedMember ? (
            <div className="flex items-center gap-3">
              <Avatar size={36} style={{ background: avatarColor(selectedMember), fontSize: 14, fontWeight: 700 }}>
                {selectedMember.name[0]}
              </Avatar>
              <div>
                <div className="font-semibold text-slate-800 text-sm leading-tight">{selectedMember.name}</div>
                <div className="text-xs text-slate-400">{selectedMember.position ?? selectedMember.department} · {selectedMember.work_no}</div>
              </div>
            </div>
          ) : t('statistics.memberOverviewTitle')
        }
        open={!!selectedMember}
        onClose={closeDrawer}
        width={600}
        bodyStyle={{ padding: '16px 20px' }}
      >
        {drawerLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : (
          <Tabs
            size="small"
            items={[
              {
                key: 'overview',
                label: t('statistics.thisMonthOverview'),
                children: overview ? (
                  <div className="flex flex-col gap-4">
                    <Row gutter={[10, 10]}>
                      <Col span={12}>
                        <MiniMemberStat label={t('statistics.accumulatedHours')} value={overview.total_hours} unit="h"
                          icon={<ClockIcon className="w-4 h-4" />} color="#2563eb" bg="bg-blue-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label={t('statistics.completedTasksLabel')} value={overview.completed_tasks} unit=""
                          icon={<CheckCircleIcon className="w-4 h-4" />} color="#16a34a" bg="bg-green-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label={t('statistics.inProgressLabel')} value={overview.in_progress_tasks} unit=""
                          icon={<BriefcaseIcon className="w-4 h-4" />} color="#7c3aed" bg="bg-purple-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label={t('statistics.overdueTasksLabel')} value={overview.overdue_tasks} unit=""
                          icon={<ExclamationTriangleIcon className="w-4 h-4" />}
                          color={overview.overdue_tasks > 0 ? '#dc2626' : '#94a3b8'}
                          bg={overview.overdue_tasks > 0 ? 'bg-red-50' : 'bg-slate-50'} />
                      </Col>
                      {(overview as any).leave_hours > 0 && (
                        <Col span={12}>
                          <MiniMemberStat label={t('statistics.leaveHours')} value={(overview as any).leave_hours} unit="h"
                            icon={<SunIcon className="w-4 h-4" />} color="#10b981" bg="bg-emerald-50" />
                        </Col>
                      )}
                    </Row>
                    {overview.weekly_hours?.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <div className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">{t('statistics.weeklyHoursTrend')}</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={overview.weekly_hours} barCategoryGap="40%">
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <RTooltip formatter={(v: number, name: string) => [`${v}h`, name]} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                            <Bar dataKey="hours" name={t('statistics.workHoursBarName')} fill="#2563eb" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ) : (
                  <Empty description={t('common.noData')} className="py-10" />
                ),
              },
              {
                key: 'projects',
                label: t('statistics.participatingProjects', { count: memberProjects.length }),
                children: memberProjects.length === 0 ? (
                  <Empty description={t('statistics.noParticipatingProjects')} className="py-10" />
                ) : (
                  <div className="flex flex-col gap-2 mt-1">
                    {memberProjects.map((p) => {
                      const st = PROJECT_STATUS_MAP[p.status as number]
                      const pr = PRIORITY_MAP[p.priority as number]
                      return (
                        <div key={String(p.id)} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                          <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: pr?.color === 'red' ? '#ef4444' : pr?.color === 'orange' ? '#f59e0b' : '#94a3b8' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{String(p.project_nm ?? '')}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {st && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background: st.dot }} />
                                  {st.label}
                                </span>
                              )}
                              <span className="text-xs text-slate-300">{String(p.department ?? '')}</span>
                            </div>
                          </div>
                          <div className="w-20 flex-shrink-0">
                            <Progress percent={Number(p.progress ?? 0)} size="small" showInfo={false} strokeColor="#2563eb" trailColor="#f1f5f9" />
                            <div className="text-right text-xs text-slate-400 mt-0.5">{Number(p.progress ?? 0)}%</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ),
              },
              {
                key: 'duties',
                label: t('statistics.arTasks', { count: memberDuties.length }),
                children: memberDuties.length === 0 ? (
                  <Empty description={t('statistics.noArTasks')} className="py-10" />
                ) : (
                  <div className="flex flex-col gap-2 mt-1">
                    {memberDuties.map((d) => {
                      const st = DUTY_STATUS_MAP[d.status as number]
                      const pr = PRIORITY_MAP[d.priority as number]
                      const endDate = String(d.expected_end_date ?? '')
                      const daysLeft = endDate ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000) : null
                      return (
                        <div key={String(d.id)} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                          <ClipboardDocumentListIcon className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{String(d.duty_nm ?? '')}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {pr && <Tag color={pr.color} style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{pr.label}</Tag>}
                              {st && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background: st.dot }} />
                                  {st.label}
                                </span>
                              )}
                            </div>
                          </div>
                          {daysLeft !== null && (
                            <span className={`text-xs flex-shrink-0 ${daysLeft < 0 ? 'text-red-500 font-semibold' : daysLeft <= 3 ? 'text-orange-500 font-medium' : 'text-slate-400'}`}>
                              {daysLeft < 0 ? t('common.daysOverdue', { days: Math.abs(daysLeft) }) : t('common.daysLeft', { days: daysLeft })}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const StatisticsPage: React.FC = () => {
  const { t } = useTranslation()
  // Role: supervisors see all tabs; regular employees only see personal + member overview
  const isManager = useAppSelector((s) => s.auth.isSupervisor)
  const myWorkNo  = useAppSelector((s) => s.auth.workNo) ?? ''
  const [searchParams] = useSearchParams()
  const initialTab    = searchParams.get('tab')    ?? 'analysis'
  const initialPeriod = (searchParams.get('period') ?? 'week') as PeriodKey
  const initialMember = searchParams.get('member') ?? undefined

  const [stats,      setStats]      = useState<MemberWorkStat[]>([])
  const [teamSummary, setTeamSummary] = useState<{ total_hours: number; completed_tasks: number; in_progress_tasks: number; overdue_tasks: number } | null>(null)
  const [isLoading,  setIsLoading]  = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)
  const [analysisRange, setAnalysisRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(4, 'week').startOf('week'), dayjs().endOf('week')])
  const [trendMode, setTrendMode] = useState<'week' | 'day'>('week')

  type AnalysisPreset = { labelKey: string; range: () => [Dayjs, Dayjs] }
  const ANALYSIS_PRESETS: AnalysisPreset[] = [
    { labelKey: 'statistics.lastWeek',    range: () => [dayjs().subtract(1, 'week').startOf('week'), dayjs().subtract(1, 'week').endOf('week')] },
    { labelKey: 'statistics.thisWeek',    range: () => [dayjs().startOf('week'), dayjs().endOf('week')] },
    { labelKey: 'statistics.thisMonth',   range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
    { labelKey: 'statistics.thisQuarter', range: () => { const m = dayjs().month(); const q = Math.floor(m / 3); return [dayjs().month(q * 3).startOf('month'), dayjs().month(q * 3 + 2).endOf('month')] } },
    { labelKey: 'statistics.thisYear',    range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
  ]

  // Personal detail cache: workNo -> data
  type PersonalStat = {
    project_dist:    { name: string; hours: number }[]
    category_dist:   { name: string; hours: number }[]
    weekly_overtime: { week: string; normal: number; overtime: number }[]
  }
  const [personalCache, setPersonalCache] = useState<Record<string, PersonalStat>>({})
  const [personalLoading, setPersonalLoading] = useState<Record<string, boolean>>({})

  const loadPersonalStats = async (workNo: string) => {
    if (personalLoading[workNo]) return
    setPersonalLoading((prev) => ({ ...prev, [workNo]: true }))
    try {
      const params: { work_no: string; start_date?: string; end_date?: string } = {
        work_no: workNo,
        start_date: analysisRange[0].format('YYYY-MM-DD'),
        end_date: analysisRange[1].format('YYYY-MM-DD'),
      }
      const res = await projectApi.personalStats(params)
      setPersonalCache((prev) => ({ ...prev, [workNo]: res.content }))
    } catch { /* global */ }
    finally { setPersonalLoading((prev) => ({ ...prev, [workNo]: false })) }
  }

  const loadStats = async (range: [Dayjs, Dayjs]) => {
    setIsLoading(true)
    try {
      const params: { start_date?: string; end_date?: string } = {
        start_date: range[0].format('YYYY-MM-DD'),
        end_date: range[1].format('YYYY-MM-DD'),
      }
      const res = await projectApi.memberStats(params)
      const content = res.content as { members?: MemberWorkStat[]; summary?: typeof teamSummary } | MemberWorkStat[]
      if (content && !Array.isArray(content) && content.members) {
        setStats(content.members)
        setTeamSummary(content.summary ?? null)
      } else if (Array.isArray(content)) {
        setStats(content as MemberWorkStat[])
      }
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadStats(analysisRange); setPersonalCache({}); setSelected(null) }, [analysisRange]) // eslint-disable-line react-hooks/exhaustive-deps
  // 非管理员：进入页面即加载自己的个人工时详情
  useEffect(() => { if (!isManager && myWorkNo) loadPersonalStats(myWorkNo) }, [isManager, myWorkNo, analysisRange]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    if (teamSummary) {
      return {
        hours:   teamSummary.total_hours,
        done:    teamSummary.completed_tasks,
        overdue: teamSummary.overdue_tasks,
        inProg:  teamSummary.in_progress_tasks,
      }
    }
    // fallback: sum per member (may double-count shared tasks)
    return {
      hours:    stats.reduce((s, m) => s + m.total_hours, 0),
      done:     stats.reduce((s, m) => s + m.completed_tasks, 0),
      overdue:  stats.reduce((s, m) => s + m.overdue_tasks, 0),
      inProg:   stats.reduce((s, m) => s + m.in_progress_tasks, 0),
    }
  }, [stats, teamSummary])

  const lineData = useMemo(() => {
    if (stats.length === 0) return []
    if (trendMode === 'day') {
      // Daily mode: collect all dates
      const dateSet = new Set<string>()
      stats.forEach((m) => { m.daily_hours?.forEach((d) => dateSet.add(d.date)) })
      const dates = [...dateSet].sort()
      return dates.map((date) => {
        const row: Record<string, unknown> = { week: date.slice(5) }  // MM-DD
        stats.forEach((m) => { row[m.name] = m.daily_hours?.find((d) => d.date === date)?.hours ?? 0 })
        return row
      })
    }
    // Weekly mode
    const weekSet = new Set<string>()
    stats.forEach((m) => { m.weekly_hours?.forEach((w) => weekSet.add(w.week)) })
    const weeks = [...weekSet].sort()
    return weeks.map((week) => {
      const row: Record<string, unknown> = { week }
      stats.forEach((m) => { row[m.name] = m.weekly_hours?.find((w) => w.week === week)?.hours ?? 0 })
      return row
    })
  }, [stats, trendMode])

  const overdueTasksLabel = t('statistics.chartOverdueTasks')
  const overdueDaysLabel = t('statistics.chartOverdueDays')
  const completedLabel = t('statistics.chartCompleted')
  const inProgressChartLabel = t('statistics.chartInProgress')
  const overdueChartLabel = t('statistics.chartOverdue')

  const overdueData = useMemo(
    () => stats.map((m) => ({
      name: m.name,
      [overdueTasksLabel]: m.overdue_tasks,
      [overdueDaysLabel]: m.overdue_days ?? 0,
    })).sort((a, b) => (b[overdueDaysLabel] as number) - (a[overdueDaysLabel] as number)),
    [stats, overdueTasksLabel, overdueDaysLabel],
  )

  const taskData = useMemo(
    () => stats.map((m) => ({ name: m.name, [completedLabel]: m.completed_tasks, [inProgressChartLabel]: m.in_progress_tasks, [overdueChartLabel]: m.overdue_tasks })),
    [stats, completedLabel, inProgressChartLabel, overdueChartLabel],
  )

  const rawMemberColumns: ColumnsType<MemberWorkStat> = [
    {
      title: t('statistics.memberColumn'), dataIndex: 'name', width: 120,
      render: (v: string, r) => (
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelected(r.work_no === selected ? null : r.work_no)}>
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>{v[0]}</Avatar>
          <span className={`font-medium text-sm ${r.work_no === selected ? 'text-blue-600' : 'text-slate-700'}`}>{v}</span>
        </div>
      ),
    },
    {
      title: t('statistics.accumulatedHoursColumn'), dataIndex: 'total_hours', width: 100,
      sorter: (a, b) => a.total_hours - b.total_hours,
      render: (v: number) => <span className="font-semibold text-blue-600">{v}<span className="text-slate-400 font-normal text-xs ml-0.5">h</span></span>,
    },
    {
      title: t('statistics.completedTasksColumn'), dataIndex: 'completed_tasks', width: 90,
      sorter: (a, b) => a.completed_tasks - b.completed_tasks,
      render: (v: number) => <span className="font-semibold text-green-600">{v}</span>,
    },
    {
      title: t('statistics.inProgressColumn'), dataIndex: 'in_progress_tasks', width: 90,
      render: (v: number) => <span className="font-semibold text-blue-500">{v}</span>,
    },
    {
      title: t('statistics.overdueTasksColumn'), dataIndex: 'overdue_tasks', width: 90,
      sorter: (a, b) => a.overdue_tasks - b.overdue_tasks,
      render: (v: number) => v > 0
        ? <span className="font-semibold text-red-500 flex items-center gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5" />{v}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      title: t('statistics.overdueRateColumn'), key: 'overdue_rate', width: 100,
      render: (_: unknown, r) => {
        const total = r.completed_tasks + r.overdue_tasks + r.in_progress_tasks
        const rate  = total > 0 ? Math.round((r.overdue_tasks / total) * 100) : 0
        return <Tag color={rate === 0 ? 'success' : rate <= 20 ? 'warning' : 'error'} style={{ fontSize: 11 }}>{rate}%</Tag>
      },
    },
  ]

  const { mergeColumns: memberColumns } = useResizableColumns(rawMemberColumns)

  // ── Individual member work-hours detail (used in both manager drill-down and engineer self-view) ──
  const renderPersonalDetail = (workNo: string, _memberName: string) => {
    const detail = personalCache[workNo]
    const projectData    = detail?.project_dist    ?? []
    const categoryData   = detail?.category_dist   ?? []
    const overtimeData   = detail?.weekly_overtime  ?? []
    const totalProjHours = projectData.reduce((s: number, d: { hours: number }) => s + d.hours, 0)
    return (
      <div className="space-y-4">
        {/* 3 pie charts */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">{t('statistics.projectHoursDist')}</span>} bodyStyle={{ paddingTop: 4 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={projectData} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {projectData.map((_: unknown, i: number) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: number, name: string) => [`${v}h`, name]} contentStyle={{ borderRadius: 8, fontSize: 11, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {projectData.map((d: { name: string; hours: number }, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="text-slate-400 font-medium">{d.hours}h</span>
                    <span className="text-slate-300 w-8 text-right">{totalProjHours > 0 ? Math.round((d.hours / totalProjHours) * 100) : 0}%</span>
                  </div>
                ))}
                {projectData.length === 0 && <span className="text-xs text-slate-300">{t('common.noData')}</span>}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">{t('statistics.categoryDist')}</span>} bodyStyle={{ paddingTop: 4 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categoryData} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {categoryData.map((_: unknown, i: number) => <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: number, name: string) => [`${v}h`, name]} contentStyle={{ borderRadius: 8, fontSize: 11, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {categoryData.map((d: { name: string; hours: number }, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="text-slate-400 font-medium">{d.hours}h</span>
                  </div>
                ))}
                {categoryData.length === 0 && <span className="text-xs text-slate-300">{t('common.noData')}</span>}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full"
              style={{ display: 'flex', flexDirection: 'column' }}
              title={<span className="text-sm font-semibold text-slate-700">{t('statistics.normalVsOvertime')}</span>}
              bodyStyle={{ paddingTop: 8, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={overtimeData} maxBarSize={48} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                    <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                      formatter={(v: number, name: string) => [`${v}h`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="normal" name={t('statistics.normalHours')} stackId="a" fill="#93c5fd" />
                    <Bar dataKey="overtime" name={t('statistics.overtimeHours')} stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        </Row>
      </div>
    )
  }

  // ─── Tab 1: 工時分析 ───────────────────────────────────────────────────────
  const analysisTab = (
    <>
      {/* Time range filter (shared by both views) */}
      <div className="flex flex-wrap items-center gap-3 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <CalendarDaysIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{t('statistics.reportPeriod')}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ANALYSIS_PRESETS.map((p) => {
            const [ps, pe] = p.range()
            const active = analysisRange[0].isSame(ps, 'day') && analysisRange[1].isSame(pe, 'day')
            return (
              <button
                key={p.labelKey}
                onClick={() => setAnalysisRange(p.range())}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border-0 outline-none cursor-pointer ${
                  active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t(p.labelKey)}
              </button>
            )
          })}
        </div>
        <RangePicker
          size="small"
          style={{ borderRadius: 8 }}
          value={analysisRange}
          onChange={(dates) => { if (dates) setAnalysisRange([dates[0]!, dates[1]!]) }}
        />
      </div>

      {!isManager && (
        <div className="mb-2">
          <div className="flex items-center gap-2 px-1 mb-4">
            <UserIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">{t('statistics.myWorkHoursAnalysis')}</span>
          </div>
          {renderPersonalDetail(myWorkNo, '')}
        </div>
      )}
      {isManager && <>

      {/* Summary cards */}
      <Row gutter={[16, 16]} className="mb-6">
        {[
          { title: t('statistics.accumulatedHoursColumn'), value: totals.hours,   unit: 'h', icon: <ClockIcon className="w-5 h-5 text-blue-600" />,               color: '#2563eb', bg: '#eff6ff' },
          { title: t('statistics.completedTasksColumn'),   value: totals.done,    unit: '',  icon: <CheckCircleIcon className="w-5 h-5 text-green-600" />,         color: '#16a34a', bg: '#f0fdf4' },
          { title: t('statistics.inProgressColumn'),       value: totals.inProg,  unit: '',  icon: <ChartBarIcon className="w-5 h-5 text-violet-600" />,           color: '#7c3aed', bg: '#f5f3ff' },
          { title: t('statistics.overdueTasksColumn'),     value: totals.overdue, unit: '',  icon: <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />,   color: '#dc2626', bg: '#fef2f2' },
        ].map((card) => (
          <Col xs={24} sm={12} xl={6} key={card.title}>
            {isLoading ? <Card bordered={false} className="shadow-sm"><Skeleton active paragraph={{ rows: 1 }} /></Card> : <MiniStatCard {...card} />}
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="mb-5">
        <Col xs={24} xl={15}>
          <Card
            bordered={false} className="shadow-sm"
            title={
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">{t('statistics.workHoursTrend')}</span>
                <Segmented
                  size="small"
                  value={trendMode}
                  onChange={(v) => setTrendMode(v as 'week' | 'day')}
                  options={[
                    { label: t('common.byWeek'), value: 'week' },
                    { label: t('common.byDay'), value: 'day' },
                  ]}
                />
              </div>
            }
            bodyStyle={{ paddingTop: 8 }}
          >
            {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={lineData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
                  <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v, n) => [`${v}h`, n]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {stats.map((m, i) => (
                    <Line key={m.work_no} type="monotone" dataKey={m.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card
            bordered={false} className="shadow-sm h-full"
            title={<span className="text-sm font-semibold text-slate-700">{t('statistics.overdueAnalysis')}</span>}
            bodyStyle={{ paddingTop: 8 }}
          >
            {isLoading ? <Skeleton active paragraph={{ rows: 5 }} /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={overdueData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={55} />
                  <RTooltip
                    contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v} ${name === overdueTasksLabel ? t('statistics.unitItems') : t('statistics.unitDays')}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey={overdueTasksLabel} fill="#f87171" radius={[0, 4, 4, 0]} barSize={10} />
                  <Bar dataKey={overdueDaysLabel} fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        bordered={false} className="shadow-sm mb-5"
        title={<span className="text-sm font-semibold text-slate-700">{t('statistics.taskCompletionStatus')}</span>}
        bodyStyle={{ paddingTop: 8 }}
      >
        {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={taskData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey={completedLabel} fill="#86efac" radius={[4,4,0,0]} />
              <Bar dataKey={inProgressChartLabel} fill="#93c5fd" radius={[4,4,0,0]} />
              <Bar dataKey={overdueChartLabel} fill="#fca5a5" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card
        bordered={false} className="shadow-sm"
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <UserGroupIcon className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">{t('statistics.memberWorkloadSummary')}</span>
            <span className="text-xs text-slate-400 font-normal">{t('statistics.clickMemberForDetail')}</span>
            <div className="ml-auto"><ExportButton stats={stats} /></div>
          </div>
        }
        bodyStyle={{ padding: 0 }}
      >
        <Table
          rowKey="work_no" columns={memberColumns} components={tableComponents} dataSource={stats} loading={isLoading}
          pagination={false} size="middle"
          expandable={{
            expandedRowKeys: selected ? [selected] : [],
            showExpandColumn: false,
            expandedRowRender: (record) => (
              <div className="px-4 py-4 bg-slate-50/60 border-t border-slate-100">
                {renderPersonalDetail(record.work_no, record.name)}
              </div>
            ),
          }}
          onRow={(r) => ({ onClick: () => { const next = r.work_no === selected ? null : r.work_no; setSelected(next); if (next) loadPersonalStats(next) }, style: { cursor: 'pointer' } })}
        />
      </Card>
      </>}
    </>
  )

  /* ── Build tab items based on role ──────────────────────────────────── */
  const managerTabs = [
    {
      key: 'analysis',
      label: (
        <span className="flex items-center gap-1.5">
          <ChartBarIcon className="w-4 h-4" />{t('statistics.workHoursAnalysisTab')}
        </span>
      ),
      children: analysisTab,
    },
    {
      key: 'report',
      label: (
        <span className="flex items-center gap-1.5">
          <DocumentTextIcon className="w-4 h-4" />{t('statistics.progressReportTab')}
        </span>
      ),
      children: <ProgressReportTab initialPeriod={initialPeriod} initialMember={initialMember} />,
    },
  ]

  const memberTab = {
    key: 'members',
    label: (
      <span className="flex items-center gap-1.5">
        <UserGroupIcon className="w-4 h-4" />{t('statistics.memberOverviewTab')}
      </span>
    ),
    children: <MemberOverviewTab />,
  }

  const tabItems = isManager ? [...managerTabs, memberTab] : [managerTabs[0], memberTab]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isManager ? t('statistics.workloadStatsTitle') : t('statistics.memberOverviewPageTitle')}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {isManager
              ? t('statistics.managerSubtitle')
              : t('statistics.memberSubtitle')}
          </p>
        </div>
      </div>

      <Tabs
        type="card"
        defaultActiveKey={initialTab}
        items={tabItems}
      />
    </div>
  )
}

export default StatisticsPage
