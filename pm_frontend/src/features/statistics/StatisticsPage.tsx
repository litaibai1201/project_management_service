/**
 * StatisticsPage — 工作量統計 + 成員管理（合併頁面）
 * Tab 1 工時分析：工時趨勢折線圖 · 任務完成柱狀圖 · 超時分析橫條圖 · 個人餅圖
 * Tab 2 進度報告：日/週/月/季/年快捷切換 + 每位工程師進度彙整報告卡
 * Tab 3 個人工時分析：專案/BU/分類餅圖 + 加班統計
 * Tab 4 成員總覽：部門分組卡片 + 成員詳情抽屜（工時/專案/任務）
 */
import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppSelector } from '@/hooks/redux'
import {
  Card, Row, Col, Table, Tag, Avatar, DatePicker,
  Skeleton, Button, Dropdown, Tabs, Collapse, Badge, Tooltip,
  Empty, Drawer, Input, Progress,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, ResponsiveContainer, Cell,
  PieChart, Pie, ReferenceLine,
} from 'recharts'
import {
  ChartBarIcon, ClockIcon, CheckCircleIcon,
  ExclamationTriangleIcon, UserGroupIcon, ArrowDownTrayIcon,
  DocumentTextIcon, CalendarDaysIcon, BoltIcon, SunIcon, MoonIcon,
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

interface CompletedTask  { id: string; name: string; project: string; type: 'function'|'duty'; completed_at: string; hours: number; expected_start_date?: string; expected_end_date?: string }
interface InProgressTask { id: string; name: string; project: string; progress: number; days_left: number; status: 'normal'|'urgent'|'overdue'; expected_start_date?: string; expected_end_date?: string; hours?: number }
interface OverdueTask    { id: string; name: string; project: string; days_overdue: number }

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
interface PeriodPreset { key: PeriodKey; label: string; range: () => [Dayjs, Dayjs] }
const PERIOD_PRESETS: PeriodPreset[] = [
  { key: 'day',     label: '本日',  range: () => [dayjs().startOf('day'),    dayjs().endOf('day')]    },
  { key: 'week',    label: '本週',  range: () => [dayjs().startOf('week'),   dayjs().endOf('week')]   },
  { key: 'month',   label: '本月',  range: () => [dayjs().startOf('month'),  dayjs().endOf('month')]  },
  { key: 'quarter', label: '本季',  range: () => {
    const m = dayjs().month(); const q = Math.floor(m / 3)
    return [dayjs().month(q * 3).startOf('month'), dayjs().month(q * 3 + 2).endOf('month')]
  }},
  { key: 'year',    label: '本年',  range: () => [dayjs().startOf('year'),   dayjs().endOf('year')]   },
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
  const handleExportCSV = () => {
    const headers = ['姓名','工號','累計工時(h)','完成任務數','超時任務數','進行中任務數']
    const rows = stats.map((m) => [m.name, m.work_no, String(m.total_hours), String(m.completed_tasks), String(m.overdue_tasks), String(m.in_progress_tasks)])
    exportCSV(`工作量統計_${dayjs().format('YYYY-MM-DD')}.csv`, [headers, ...rows])
  }

  const handleExportDetailCSV = () => {
    const rows: string[][] = [['姓名','工號','週次','工時(h)']]
    stats.forEach((m) => {
      m.weekly_hours?.forEach((w) => {
        rows.push([m.name, m.work_no, w.week, String(w.hours)])
      })
    })
    exportCSV(`工時週明細_${dayjs().format('YYYY-MM-DD')}.csv`, rows)
  }

  const menuItems: MenuProps['items'] = [
    { key: 'summary', label: '導出彙整表（CSV）',   icon: <ArrowDownTrayIcon className="w-4 h-4" />, onClick: handleExportCSV       },
    { key: 'detail',  label: '導出週工時明細（CSV）', icon: <ArrowDownTrayIcon className="w-4 h-4" />, onClick: handleExportDetailCSV },
  ]

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight" trigger={['click']}>
      <Button size="small" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />} className="text-slate-600">
        導出
      </Button>
    </Dropdown>
  )
}

// ─── Progress Report Export ────────────────────────────────────────────────────
function exportReportCSV(reports: ReportMember[], periodLabel: string) {
  const rows: string[][] = [
    ['報告週期', periodLabel, '', '', '', ''],
    ['姓名', '工號', '本期工時(h)', '進度更新次數', '完成任務數', '進行中任務數', '超時任務數'],
    ...reports.map((r) => [
      r.name, r.work_no, String(r.period_hours), String(r.updates_count),
      String(r.completed.length), String(r.in_progress.length), String(r.overdue.length),
    ]),
    [],
    ['─── 日報明細 ───'],
    ['姓名', '日期', '任務名稱', '工時(h)', '工作內容'],
    ...reports.flatMap((r) =>
      (r.daily_logs ?? []).flatMap((lg) => {
        const items = [...(lg.task_items ?? []), ...(lg.free_items ?? [])]
        return items.map((item) => {
          const ti = item as Record<string, unknown>
          return [r.name, String(lg.log_date), String(ti.task_nm ?? ti.category ?? ''), String(ti.work_hours ?? 0), String(ti.description ?? '')]
        })
      })
    ),
  ]
  exportCSV(`進度報告_${periodLabel}_${dayjs().format('YYYY-MM-DD')}.csv`, rows)
}

// ─── Report Member Card ────────────────────────────────────────────────────────
const MemberReportCard: React.FC<{ report: ReportMember; initialExpanded?: boolean }> = ({ report, initialExpanded = false }) => {
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
      <Tooltip title="本期工時">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <ClockIcon className="w-3.5 h-3.5" />
          <span className="font-semibold text-blue-600">{report.period_hours}h</span>
        </div>
      </Tooltip>
      <Tooltip title="進度更新次數">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <DocumentTextIcon className="w-3.5 h-3.5" />
          <span className="font-semibold text-slate-600">{report.updates_count} 次更新</span>
        </div>
      </Tooltip>
      {report.overdue.length > 0 && (
        <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}>
          超時 {report.overdue.length}
        </Tag>
      )}
      <Tag
        color={report.completed.length > 0 ? 'success' : 'default'}
        style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '18px' }}
      >
        完成 {report.completed.length} 項
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
                <span className="text-xs text-red-500 font-medium">有超時任務需關注</span>
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

          {/* ─── Task panels (3 columns) ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
            {/* ── Completed ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3.5 rounded bg-green-500" />
                <span className="text-xs font-semibold text-slate-600">本期完成任務</span>
                <Badge count={report.completed.length} color="#16a34a" />
              </div>
              {report.completed.length === 0 ? (
                <p className="text-xs text-slate-300 pl-3">本期暫無完成任務</p>
              ) : (
                <div className="space-y-2">
                  {report.completed.map((t) => (
                    <div key={t.id} className="flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2 border border-green-100">
                      <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700">{t.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">{t.project}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">完成於 {t.completed_at}</span>
                          {t.hours > 0 && <>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="text-[10px] text-green-600 font-medium">{t.hours}h</span>
                          </>}
                        </div>
                        {(t.expected_start_date || t.expected_end_date) && (
                          <div className="text-[10px] text-slate-300 mt-0.5">
                            預計 {t.expected_start_date || '—'} ~ {t.expected_end_date || '—'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── In-Progress ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3.5 rounded bg-blue-500" />
                <span className="text-xs font-semibold text-slate-600">進行中任務</span>
                <Badge count={report.in_progress.length} color="#2563eb" />
              </div>
              {report.in_progress.length === 0 ? (
                <p className="text-xs text-slate-300 pl-3">暫無進行中任務</p>
              ) : (
                <div className="space-y-2">
                  {report.in_progress.map((t) => {
                    const borderColor = t.status === 'overdue' ? '#fecaca' : t.status === 'urgent' ? '#fed7aa' : '#e2e8f0'
                    const bgColor     = t.status === 'overdue' ? '#fef2f2' : t.status === 'urgent' ? '#fff7ed' : '#f8fafc'
                    return (
                      <div key={t.id} className="rounded-lg px-3 py-2 border" style={{ background: bgColor, borderColor }}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-700 flex-1 truncate">{t.name}</span>
                          {t.status === 'overdue' && <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">超期 {Math.abs(t.days_left)} 天</span>}
                          {t.status === 'urgent' && <span className="text-[10px] text-orange-500 font-semibold flex-shrink-0">剩 {t.days_left} 天</span>}
                          {t.status === 'normal' && <span className="text-[10px] text-slate-400 flex-shrink-0">剩 {t.days_left} 天</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white rounded-full h-1.5 overflow-hidden border border-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${t.progress}%`, background: t.status === 'overdue' ? '#f87171' : t.status === 'urgent' ? '#fb923c' : '#60a5fa' }} />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0 w-7 text-right">{t.progress}%</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[10px] text-slate-400">{t.project}</span>
                          {(t.expected_start_date || t.expected_end_date) && (
                            <span className="text-[10px] text-slate-300">
                              {t.expected_start_date || '—'} ~ {t.expected_end_date || '—'}
                            </span>
                          )}
                          {(t.hours ?? 0) > 0 && <span className="text-[10px] text-blue-600 font-medium">{t.hours}h</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Not Started (within period) ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3.5 rounded bg-slate-400" />
                <span className="text-xs font-semibold text-slate-600">本期待開始</span>
                <Badge count={(report.not_started ?? []).length} color="#94a3b8" />
              </div>
              {(report.not_started ?? []).length === 0 ? (
                <p className="text-xs text-slate-300 pl-3">本期無待開始任務</p>
              ) : (
                <div className="space-y-2">
                  {(report.not_started ?? []).map((t) => {
                    const isOverdue = t.status === 'overdue'
                    return (
                      <div key={t.id} className={`rounded-lg px-3 py-2 border ${isOverdue ? 'bg-red-50/50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-slate-700 flex-1 truncate">{t.name}</span>
                          {isOverdue && <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">已逾期</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400">{t.project}</span>
                          <span className="text-[10px] text-slate-300">
                            預計 {t.expected_start_date || '—'} ~ {t.expected_end_date || '—'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
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
  const [period,      setPeriod]      = useState<PeriodKey>(initialPeriod)
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [reports,     setReports]     = useState<ReportMember[]>([])

  const currentPreset = PERIOD_PRESETS.find((p) => p.key === period)
  const range  = period === 'custom' && customRange ? customRange : (currentPreset?.range() ?? [dayjs().startOf('week'), dayjs().endOf('week')])
  const dateLabel = `${range[0].format('YYYY/MM/DD')} — ${range[1].format('YYYY/MM/DD')}`
  const periodLabel = period === 'custom' ? dateLabel : (currentPreset?.label ?? '') + ' ' + dateLabel

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

  return (
    <div>
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3 mb-5 bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <CalendarDaysIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">報告週期</span>

        {/* Quick preset buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setCustomRange(null) }}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border-0 outline-none cursor-pointer ${
                period === p.key && period !== 'custom'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all border-0 outline-none cursor-pointer ${
              period === 'custom'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            自定義
          </button>
        </div>

        {/* Custom range picker */}
        {period === 'custom' && (
          <RangePicker
            size="small"
            style={{ borderRadius: 8 }}
            value={customRange}
            onChange={(dates) => dates && setCustomRange([dates[0]!, dates[1]!])}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400 border border-slate-100 rounded-lg px-2 py-1 bg-slate-50">{dateLabel}</span>
          <Button
            size="small"
            icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />}
            onClick={() => exportReportCSV(reports, periodLabel)}
            className="text-slate-600"
          >
            導出報告
          </Button>
        </div>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
        {[
          { label: '本期總工時',  value: totalHours,   unit: 'h', color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" />                    },
          { label: '進度更新次數', value: totalUpdates, unit: '次', color: '#7c3aed', bg: '#f5f3ff', icon: <DocumentTextIcon className="w-4 h-4 text-violet-500" />           },
          { label: '完成任務',    value: totalDone,    unit: '項', color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />              },
          { label: '超時任務',    value: totalOverdue, unit: '項', color: '#dc2626', bg: '#fef2f2', icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />        },
          { label: '需關注成員',  value: atRiskCount,  unit: '人', color: '#d97706', bg: '#fff7ed', icon: <BoltIcon className="w-4 h-4 text-orange-500" />                   },
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
        <span className="text-sm font-semibold text-slate-600">工程師進度彙整</span>
        <span className="text-xs text-slate-400">· 點擊展開查看詳細進度記錄</span>
      </div>

      {reports.length === 0 ? (
        <Empty description="本期暫無進度數據" className="my-12" />
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
          placeholder="搜索姓名、工號、部門..."
          allowClear
          style={{ width: 280 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => setKeyword(v)}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <span className="text-xs text-slate-400 self-center">
          {keyword ? `找到 ${filtered.length} 位` : `${members.length} 位成員`}
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
        <Empty description="未找到匹配成員" className="py-20" />
      ) : (
        Object.entries(deptMap).map(([dept, list]) => (
          <div key={dept} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full" style={{ background: DEPT_COLORS[dept] ?? '#94a3b8' }} />
              <span className="font-semibold text-slate-600 text-sm">{dept}</span>
              <span className="text-xs text-slate-400">（{list.length} 人）</span>
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
          ) : '成員概況'
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
                label: '本月概況',
                children: overview ? (
                  <div className="flex flex-col gap-4">
                    <Row gutter={[10, 10]}>
                      <Col span={12}>
                        <MiniMemberStat label="累計工時" value={overview.total_hours} unit="h"
                          icon={<ClockIcon className="w-4 h-4" />} color="#2563eb" bg="bg-blue-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label="已完成任務" value={overview.completed_tasks} unit="項"
                          icon={<CheckCircleIcon className="w-4 h-4" />} color="#16a34a" bg="bg-green-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label="進行中" value={overview.in_progress_tasks} unit="項"
                          icon={<BriefcaseIcon className="w-4 h-4" />} color="#7c3aed" bg="bg-purple-50" />
                      </Col>
                      <Col span={12}>
                        <MiniMemberStat label="超期任務" value={overview.overdue_tasks} unit="項"
                          icon={<ExclamationTriangleIcon className="w-4 h-4" />}
                          color={overview.overdue_tasks > 0 ? '#dc2626' : '#94a3b8'}
                          bg={overview.overdue_tasks > 0 ? 'bg-red-50' : 'bg-slate-50'} />
                      </Col>
                    </Row>
                    {overview.weekly_hours?.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <div className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">週工時趨勢</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={overview.weekly_hours} barCategoryGap="40%">
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <RTooltip formatter={(v: number, name: string) => [`${v}h`, name]} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                            <Bar dataKey="hours" name="工時" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ) : (
                  <Empty description="暫無數據" className="py-10" />
                ),
              },
              {
                key: 'projects',
                label: `參與專案 (${memberProjects.length})`,
                children: memberProjects.length === 0 ? (
                  <Empty description="暫無參與專案" className="py-10" />
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
                label: `臨時任務 (${memberDuties.length})`,
                children: memberDuties.length === 0 ? (
                  <Empty description="暫無臨時任務" className="py-10" />
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
                              {daysLeft < 0 ? `超期 ${Math.abs(daysLeft)}天` : `剩 ${daysLeft}天`}
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

  // Personal detail cache: workNo -> data
  type PersonalStat = {
    project_dist:    { name: string; hours: number }[]
    category_dist:   { name: string; hours: number }[]
    weekly_overtime: { week: string; normal: number; overtime: number }[]
  }
  const [personalCache, setPersonalCache] = useState<Record<string, PersonalStat>>({})
  const [personalLoading, setPersonalLoading] = useState<Record<string, boolean>>({})

  const loadPersonalStats = async (workNo: string) => {
    if (personalCache[workNo] || personalLoading[workNo]) return
    setPersonalLoading((prev) => ({ ...prev, [workNo]: true }))
    try {
      const res = await projectApi.personalStats({ work_no: workNo })
      setPersonalCache((prev) => ({ ...prev, [workNo]: res.content }))
    } catch { /* global */ }
    finally { setPersonalLoading((prev) => ({ ...prev, [workNo]: false })) }
  }

  const loadStats = async () => {
    setIsLoading(true)
    try {
      const res = await projectApi.memberStats()
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

  useEffect(() => { loadStats() }, [])
  // 非管理员：进入页面即加载自己的个人工时详情
  useEffect(() => { if (!isManager && myWorkNo) loadPersonalStats(myWorkNo) }, [isManager, myWorkNo])

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
    // Collect all unique week keys from ALL members (not just the first)
    const weekSet = new Set<string>()
    stats.forEach((m) => { m.weekly_hours?.forEach((w) => weekSet.add(w.week)) })
    const weeks = [...weekSet].sort()
    return weeks.map((week) => {
      const row: Record<string, unknown> = { week }
      stats.forEach((m) => { row[m.name] = m.weekly_hours?.find((w) => w.week === week)?.hours ?? 0 })
      return row
    })
  }, [stats])

  const overdueData = useMemo(
    () => stats.map((m) => ({
      name: m.name,
      超時任務數: m.overdue_tasks,
      累計超期天數: m.overdue_days ?? 0,
    })).sort((a, b) => b.累計超期天數 - a.累計超期天數),
    [stats],
  )

  const taskData = useMemo(
    () => stats.map((m) => ({ name: m.name, 完成: m.completed_tasks, 進行中: m.in_progress_tasks, 超時: m.overdue_tasks })),
    [stats],
  )

  const memberColumns: ColumnsType<MemberWorkStat> = [
    {
      title: '成員', dataIndex: 'name', width: 120,
      render: (v: string, r) => (
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setSelected(r.work_no === selected ? null : r.work_no)}>
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>{v[0]}</Avatar>
          <span className={`font-medium text-sm ${r.work_no === selected ? 'text-blue-600' : 'text-slate-700'}`}>{v}</span>
        </div>
      ),
    },
    {
      title: '累計工時', dataIndex: 'total_hours', width: 100,
      sorter: (a, b) => a.total_hours - b.total_hours,
      render: (v: number) => <span className="font-semibold text-blue-600">{v}<span className="text-slate-400 font-normal text-xs ml-0.5">h</span></span>,
    },
    {
      title: '完成任務', dataIndex: 'completed_tasks', width: 90,
      sorter: (a, b) => a.completed_tasks - b.completed_tasks,
      render: (v: number) => <span className="font-semibold text-green-600">{v}</span>,
    },
    {
      title: '進行中', dataIndex: 'in_progress_tasks', width: 90,
      render: (v: number) => <span className="font-semibold text-blue-500">{v}</span>,
    },
    {
      title: '超時任務', dataIndex: 'overdue_tasks', width: 90,
      sorter: (a, b) => a.overdue_tasks - b.overdue_tasks,
      render: (v: number) => v > 0
        ? <span className="font-semibold text-red-500 flex items-center gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5" />{v}</span>
        : <span className="text-slate-300">—</span>,
    },
    {
      title: '超時率', key: 'overdue_rate', width: 100,
      render: (_: unknown, r) => {
        const total = r.completed_tasks + r.overdue_tasks + r.in_progress_tasks
        const rate  = total > 0 ? Math.round((r.overdue_tasks / total) * 100) : 0
        return <Tag color={rate === 0 ? 'success' : rate <= 20 ? 'warning' : 'error'} style={{ fontSize: 11 }}>{rate}%</Tag>
      },
    },
  ]

  // ── Individual member work-hours detail (used in both manager drill-down and engineer self-view) ──
  const renderPersonalDetail = (workNo: string, memberName: string) => {
    const detail = personalCache[workNo]
    const projectData    = detail?.project_dist    ?? []
    const categoryData   = detail?.category_dist   ?? []
    const overtimeData   = detail?.weekly_overtime  ?? []
    const totalProjHours = projectData.reduce((s: number, d: { hours: number }) => s + d.hours, 0)
    const totalOvertime  = overtimeData.reduce((s, d) => s + d.overtime, 0)
    const totalNormal    = overtimeData.reduce((s, d) => s + d.normal, 0)
    const totalHrs       = totalNormal + totalOvertime
    return (
      <div className="space-y-4">
        {/* 4 personal stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '總工時',   value: totalHrs,     unit: 'h',  color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
            { label: '正常工時', value: totalNormal,  unit: 'h',  color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
            { label: '加班工時', value: totalOvertime, unit: 'h', color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
            { label: '加班佔比', value: totalHrs > 0 ? Math.round((totalOvertime / totalHrs) * 100) : 0, unit: '%', color: '#dc2626', bg: '#fef2f2', icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-500" /> },
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

        {/* 3 pie charts */}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">專案工時分佈</span>} bodyStyle={{ paddingTop: 4 }}>
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
                {projectData.length === 0 && <span className="text-xs text-slate-300">暫無數據</span>}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">工作分類分佈</span>} bodyStyle={{ paddingTop: 4 }}>
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
                {categoryData.length === 0 && <span className="text-xs text-slate-300">暫無數據</span>}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full"
              style={{ display: 'flex', flexDirection: 'column' }}
              title={<span className="text-sm font-semibold text-slate-700">正常 vs 加班工時（近5週）</span>}
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
                    <Bar dataKey="normal" name="正常工時" stackId="a" fill="#93c5fd" />
                    <Bar dataKey="overtime" name="加班工時" stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]} />
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
      {!isManager && (
        <div className="mb-2">
          <div className="flex items-center gap-2 px-1 mb-4">
            <UserIcon className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">我的工時分析</span>
            <span className="text-xs text-slate-400 font-normal">近 5 週數據</span>
          </div>
          {renderPersonalDetail(myWorkNo, '')}
        </div>
      )}
      {isManager && <>
      {/* Summary cards */}
      <Row gutter={[16, 16]} className="mb-6">
        {[
          { title: '累計工時', value: totals.hours, unit: 'h',  icon: <ClockIcon className="w-5 h-5 text-blue-600" />,               color: '#2563eb', bg: '#eff6ff' },
          { title: '完成任務', value: totals.done,  unit: '項', icon: <CheckCircleIcon className="w-5 h-5 text-green-600" />,         color: '#16a34a', bg: '#f0fdf4' },
          { title: '進行中',  value: totals.inProg, unit: '項', icon: <ChartBarIcon className="w-5 h-5 text-violet-600" />,           color: '#7c3aed', bg: '#f5f3ff' },
          { title: '超時任務', value: totals.overdue, unit: '項', icon: <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />, color: '#dc2626', bg: '#fef2f2' },
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
            title={<span className="text-sm font-semibold text-slate-700">工時趨勢（近5週）</span>}
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
            title={<span className="text-sm font-semibold text-slate-700">超時任務分析（任務數 + 超期天數）</span>}
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
                    formatter={(v: number, name: string) => [`${v} ${name === '超時任務數' ? '項' : '天'}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="超時任務數" fill="#f87171" radius={[0, 4, 4, 0]} barSize={10} />
                  <Bar dataKey="累計超期天數" fill="#fbbf24" radius={[0, 4, 4, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        bordered={false} className="shadow-sm mb-5"
        title={<span className="text-sm font-semibold text-slate-700">任務完成狀況（各成員）</span>}
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
              <Bar dataKey="完成" fill="#86efac" radius={[4,4,0,0]} />
              <Bar dataKey="進行中" fill="#93c5fd" radius={[4,4,0,0]} />
              <Bar dataKey="超時" fill="#fca5a5" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card
        bordered={false} className="shadow-sm"
        title={
          <div className="flex items-center gap-2 flex-wrap">
            <UserGroupIcon className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">成員工作量彙整</span>
            <span className="text-xs text-slate-400 font-normal">點擊成員行可查看詳細分析</span>
            <div className="ml-auto"><ExportButton stats={stats} /></div>
          </div>
        }
        bodyStyle={{ padding: 0 }}
      >
        <Table
          rowKey="work_no" columns={memberColumns} dataSource={stats} loading={isLoading}
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
          <ChartBarIcon className="w-4 h-4" />工時分析
        </span>
      ),
      children: analysisTab,
    },
    {
      key: 'report',
      label: (
        <span className="flex items-center gap-1.5">
          <DocumentTextIcon className="w-4 h-4" />進度報告
        </span>
      ),
      children: <ProgressReportTab initialPeriod={initialPeriod} initialMember={initialMember} />,
    },
  ]

  const memberTab = {
    key: 'members',
    label: (
      <span className="flex items-center gap-1.5">
        <UserGroupIcon className="w-4 h-4" />成員總覽
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
            {isManager ? '工作量統計與成員管理' : '成員總覽'}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {isManager
              ? '團隊工作量彙整分析 · 成員概況 · 主管視角'
              : '搜索查看同事資訊與工作概況'}
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
