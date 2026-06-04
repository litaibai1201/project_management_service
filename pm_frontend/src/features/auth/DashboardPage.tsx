import React, { useEffect, useState } from 'react'
import { Card, Progress, Tag, Avatar, Badge, Tooltip, Switch, Button, Empty, Table, message } from 'antd'
// @ts-ignore - @types/react-grid-layout lags behind v2 API
import { GridLayout, useContainerWidth } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
  Cell, LabelList, PieChart, Pie, Legend,
} from 'recharts'
import {
  FolderIcon, ClipboardDocumentListIcon, ClockIcon,
  FireIcon, ExclamationTriangleIcon, BellAlertIcon,
  ChevronDownIcon, ChevronRightIcon, UsersIcon, ChartBarIcon,
  PencilSquareIcon, SunIcon, CalendarDaysIcon, BellIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchIndexThunk, setManagerView } from './authSlice'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
dayjs.extend(isoWeek)
import { projectApi } from '@/api/project.api'
import { authApi, type AlertTask, type WeeklyActivityItem, type NewsItem } from '@/api/auth.api'
import { dailyLogApi, type BackendDailyLogSummary } from '@/api/daily_log.api'
import { standaloneReqApi } from '@/api/standalone_req.api'
import { dutyApi } from '@/api/duty.api'
import { notificationApi } from '@/api/notification.api'
import type { ProjectListItem, UserStatistical, TeamStatistical, TeamBenefitGroup, ApplyRecord, ProjectFunction } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, benefitUnitLabel } from '@/utils/status'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { useDashboardConfig } from '@/hooks/useDashboardConfig'
import {
  AddCardModal, WidgetMenu,
} from '@/components/common/DashboardCustomizeDrawer'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { useTranslation } from 'react-i18next'


// ─── Types for dashboard data ─────────────────────────────────────────────────
type MonthLogEntry = { hours: number; ot: number; status: 'confirmed' | 'submitted' | 'draft' }
interface ReqStats { total: number; in_progress: number; completed: number; pending: number }
interface ArTaskStats { total: number; in_progress: number; completed: number; overdue: number; suspended: number }
interface MemberWorkStat {
  work_no: string; name: string; total_hours: number
  completed_tasks: number; in_progress_tasks: number; overdue_tasks: number
  urgent_tasks: number; log_submitted: boolean
}

const getHeatColor = (hours: number) => {
  if (hours === 0) return '#f1f5f9'
  if (hours < 4)  return '#bfdbfe'
  if (hours < 6)  return '#93c5fd'
  if (hours < 8)  return '#60a5fa'
  return '#2563eb'
}

const PRIORITY_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

// ─── Sub-components ────────────────────────────────────────────────────────────

const DaysLeftBadge: React.FC<{ days: number }> = ({ days }) => {
  const { t } = useTranslation()
  if (days < 0)  return <span className="days-overdue">{t('common.daysOverdue', { days: Math.abs(days) })}</span>
  if (days <= 3) return <span className="days-overdue">{t('common.daysLeft', { days })}</span>
  if (days <= 7) return <span className="days-warning">{t('common.daysLeft', { days })}</span>
  return <span className="days-ok">{t('common.daysLeft', { days })}</span>
}

// ─── Alert Bar ────────────────────────────────────────────────────────────────

const AlertBar: React.FC<{ pendingReview: number; alertTasks: AlertTask[] }> = ({ pendingReview, alertTasks }) => {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()
  const { t } = useTranslation()

  const overdue  = alertTasks.filter((t) => t.days_diff < 0).sort((a, b) => a.days_diff - b.days_diff)
  const urgent   = alertTasks.filter((t) => t.days_diff >= 0 && t.days_diff <= 3)
  const upcoming = alertTasks.filter((t) => t.days_diff > 3 && t.days_diff <= 7)

  if (overdue.length === 0 && urgent.length === 0 && upcoming.length === 0 && pendingReview === 0) return null

  const handleTaskClick = (task: AlertTask) => {
    if (task.type === 'duty') navigate(`/duties/${task.id}`)
    else if (task.project_id) navigate(`/projects/${task.project_id}?fid=${task.id}`)
  }

  const AlertRow: React.FC<{ task: AlertTask }> = ({ task }) => (
    <div
      className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0 cursor-pointer hover:bg-white/60 rounded-md px-1 -mx-1 transition-colors"
      onClick={() => handleTaskClick(task)}
    >
      <Tag
        style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
        color={task.type === 'function' ? 'blue' : 'purple'}
      >
        {task.type === 'function' ? t('dashboard.functionTask') : t('dashboard.arTask')}
      </Tag>
      <span className="text-slate-700 text-xs flex-1 truncate">
        {task.project_nm ? <span className="text-slate-400">{task.project_nm} · </span> : null}
        {task.name}
      </span>
      <DaysLeftBadge days={task.days_diff} />
    </div>
  )

  return (
    <div className="mb-5 rounded-xl border border-red-100 bg-red-50/60 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <BellAlertIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-red-600 flex-1">
          {t('dashboard.pendingAttention')}
        </span>
        {/* Summary badges */}
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <Tooltip title={t('dashboard.overdueTooltip')}>
              <Badge count={overdue.length} color="#dc2626" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {urgent.length > 0 && (
            <Tooltip title={t('dashboard.urgentTooltip')}>
              <Badge count={urgent.length} color="#d97706" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {upcoming.length > 0 && (
            <Tooltip title={t('dashboard.upcomingTooltip')}>
              <Badge count={upcoming.length} color="#f59e0b" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {pendingReview > 0 && (
            <Tooltip title={t('dashboard.pendingApprovalTooltip')}>
              <Badge count={pendingReview} color="#2563eb" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
        </div>
        {open
          ? <ChevronDownIcon className="w-4 h-4 text-slate-400 ml-1" />
          : <ChevronRightIcon className="w-4 h-4 text-slate-400 ml-1" />
        }
      </div>

      {/* Body */}
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Overdue */}
          {overdue.length > 0 && (
            <div className="bg-white rounded-lg p-3 border border-red-100">
              <div className="flex items-center gap-1.5 mb-2">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-semibold text-red-600">{t('dashboard.overdueSection', { count: overdue.length })}</span>
              </div>
              {overdue.map((task) => <AlertRow key={task.id} task={task} />)}
            </div>
          )}

          {/* Urgent (≤3 days) */}
          {urgent.length > 0 && (
            <div className="bg-white rounded-lg p-3 border border-orange-100">
              <div className="flex items-center gap-1.5 mb-2">
                <FireIcon className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-600">{t('dashboard.urgentSection', { count: urgent.length })}</span>
              </div>
              {urgent.map((task) => <AlertRow key={task.id} task={task} />)}
            </div>
          )}

          {/* Upcoming (4–7 days) + pending review */}
          {(upcoming.length > 0 || pendingReview > 0) && (
            <div className="bg-white rounded-lg p-3 border border-amber-100">
              <div className="flex items-center gap-1.5 mb-2">
                <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-amber-600">{t('dashboard.upcomingSection', { count: upcoming.length })}</span>
              </div>
              {upcoming.map((task) => <AlertRow key={task.id} task={task} />)}
              {pendingReview > 0 && (
                <div
                  className="flex items-center gap-2 py-1.5 mt-1 border-t border-slate-50 cursor-pointer hover:bg-white/60 rounded-md px-1 -mx-1 transition-colors"
                  onClick={() => navigate('/review')}
                >
                  <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color="blue">{t('dashboard.approvalTag')}</Tag>
                  <span className="text-slate-700 text-xs flex-1">{t('dashboard.pendingApprovalItem')}</span>
                  <Badge count={pendingReview} color="#2563eb" style={{ fontSize: 10 }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Daily Log Status Card ─────────────────────────────────────────────────
const DailyLogCard: React.FC<{ canDismiss?: boolean; todayLog: BackendDailyLogSummary | null; onDismiss?: () => void }> = ({ canDismiss = false, todayLog, onDismiss }) => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const todayHours = todayLog ? Number(todayLog.total_hours) : 0
  const standardHours = 8.0
  const status: 'draft' | 'submitted' | 'not_started' = todayLog
    ? (todayLog.status === 2 ? 'submitted' : 'draft')
    : 'not_started'
  const pct = Math.min(100, Math.round((todayHours / standardHours) * 100))

  return (
    <Card className="h-full"
      styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <PencilSquareIcon className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-700">{t('dashboard.todayReportCard')}</span>
            <Tag
              color={status === 'submitted' ? 'success' : status === 'draft' ? 'processing' : 'error'}
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
            >
              {status === 'submitted' ? t('dashboard.submittedTag') : status === 'draft' ? t('dashboard.draftTag') : t('dashboard.notFilledTag')}
            </Tag>
            {!canDismiss && status !== 'submitted' && (
              <Tag color="red" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>{t('dashboard.requiredTag')}</Tag>
            )}
            {canDismiss && (
              <Tag color="gold" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>{t('dashboard.optionalTag')}</Tag>
            )}
            {todayLog && <span className="text-xs text-slate-400 ml-auto">{todayHours}h</span>}
          </div>
          <div className="flex items-center gap-3">
            <Progress
              percent={pct}
              size="small"
              strokeColor={pct >= 100 ? '#16a34a' : pct >= 75 ? '#2563eb' : '#dc2626'}
              trailColor="#e2e8f0"
              style={{ flex: 1, marginBottom: 0 }}
              format={() => ''}
            />
            <div className="flex items-center gap-2 text-xs flex-shrink-0">
              <span className="flex items-center gap-0.5 text-blue-600 font-semibold"><SunIcon className="w-3 h-3" />{todayHours}h</span>
              <span className="text-slate-300">/</span>
              <span className="text-slate-400">{standardHours}h</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3 flex-shrink-0 mr-6">
          <Button type="primary" size="small" style={{ background: '#2563eb', borderRadius: 8 }}
            onClick={() => navigate('/daily-log')}>
            {status === 'not_started' ? t('dashboard.fillNow') : t('dashboard.continueFill')} →
          </Button>
          {canDismiss && (
            <button onClick={() => onDismiss?.()} className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors border-0 outline-none bg-transparent cursor-pointer p-0">
              {t('dashboard.dismissReminder')}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}


// ─── Monthly Attendance Calendar Card ─────────────────────────────────────────
const MonthlyAttendanceCard: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const today = dayjs()
  const firstDay = today.startOf('month')
  const daysInMonth = today.daysInMonth()
  const startPad = (firstDay.day() + 6) % 7   // Mon-first offset
  const DOW_LABELS = t('dashboard.dowLabels').split(',')

  const [monthData, setMonthData] = useState<Record<string, MonthLogEntry>>({})

  useEffect(() => {
    const start = today.startOf('month').format('YYYY-MM-DD')
    const end   = today.endOf('month').format('YYYY-MM-DD')
    dailyLogApi.list({ page: 1, size: 31, start_date: start, end_date: end })
      .then((res) => {
        const list = (res as { content?: { list?: BackendDailyLogSummary[] } }).content?.list ?? []
        const map: Record<string, MonthLogEntry> = {}
        list.forEach((l) => {
          const h = Number(l.total_hours)
          map[l.log_date] = {
            hours: h,
            ot: h > 8 ? h - 8 : 0,
            status: l.status === 2 ? 'submitted' : 'draft',
          }
        })
        setMonthData(map)
      })
      .catch(() => {})
  }, [])

  const workedDays  = Object.keys(monthData).length
  const totalHours  = Object.values(monthData).reduce((s, v) => s + v.hours, 0)
  const totalOT     = Object.values(monthData).reduce((s, v) => s + v.ot, 0)

  return (
    <Card
      bordered={false}
      className="shadow-sm mb-5"
      title={
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 text-sm">{t('dashboard.monthlyCalendar')}</span>
          <span className="text-xs text-slate-400 font-normal">{today.format(t('common.dateFormatYearMonth'))}</span>
        </div>
      }
      extra={
        <span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate('/daily-log')}>
          {t('dashboard.fillLogLink')}
        </span>
      }
    >
      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: t('dashboard.reportedDays'), value: workedDays, unit: t('dashboard.daysUnit'), color: '#2563eb' },
          { label: t('dashboard.totalHoursLabel'), value: totalHours.toFixed(1), unit: 'h', color: '#16a34a' },
          { label: t('dashboard.totalOvertimeLabel'), value: totalOT.toFixed(1), unit: 'h', color: '#d97706' },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-[10px] text-slate-400 mb-0.5">{s.label}</div>
            <div className="text-lg font-bold" style={{ color: s.color, lineHeight: 1.2 }}>
              {s.value}<span className="text-xs font-normal text-slate-400 ml-0.5">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_LABELS.map((l) => (
          <div key={l} className="text-center text-[10px] text-slate-400 font-medium py-0.5">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = firstDay.add(i, 'day')
          const dateStr = d.format('YYYY-MM-DD')
          const log = monthData[dateStr]
          const hours = log?.hours ?? 0
          const isToday = d.isSame(today, 'day')
          const isFuture = d.isAfter(today, 'day')
          const isWeekend = d.day() === 0 || d.day() === 6
          const noLog = !log && !isFuture && !isWeekend && d.isBefore(today, 'day')
          return (
            <Tooltip
              key={i}
              title={
                <div>
                  <div className="font-semibold">{d.format('MM/DD')}</div>
                  {log
                    ? <><div>{hours}h{log.ot > 0 ? ` ${t('dashboard.overtimeTooltip', { hours: log.ot })}` : ''}</div></>
                    : isFuture ? <div>{t('dashboard.futureDate')}</div>
                    : isWeekend ? <div>{t('dashboard.holiday')}</div>
                    : <div className="text-red-300">{t('dashboard.notFilledDate')}</div>
                  }
                </div>
              }
            >
              <div
                className={`aspect-square rounded-md flex flex-col items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${isToday ? 'ring-2 ring-blue-500' : ''} ${noLog ? 'ring-1 ring-red-200' : ''}`}
                style={{ background: isFuture || isWeekend ? '#f8fafc' : getHeatColor(hours), minHeight: 32 }}
                onClick={() => navigate('/daily-log')}
              >
                <span className={`text-[10px] font-semibold ${hours > 6 ? 'text-white' : isToday ? 'text-blue-600' : isWeekend ? 'text-slate-300' : 'text-slate-500'}`}>
                  {i + 1}
                </span>
                {hours > 0 && (
                  <span className={`text-[7px] leading-tight ${hours > 6 ? 'text-white/80' : 'text-slate-400'}`}>{hours}h</span>
                )}
                {noLog && <span className="text-[6px] text-red-400 font-bold">{t('dashboard.missingMark')}</span>}
              </div>
            </Tooltip>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-center">
        <span className="text-[10px] text-slate-400">{t('dashboard.fewerHours')}</span>
        {[0, 4, 6, 8, 10].map((h, i) => <div key={i} className="w-3 h-3 rounded-sm" style={{ background: getHeatColor(h) }} />)}
        <span className="text-[10px] text-slate-400">{t('dashboard.moreHours')}</span>
        <span className="text-[10px] text-slate-300 mx-1">|</span>
        <div className="w-3 h-3 rounded-sm ring-1 ring-red-200 bg-slate-100" />
        <span className="text-[10px] text-red-400">{t('dashboard.reportMissing')}</span>
      </div>
    </Card>
  )
}

// ─── TeamLogCard ───────────────────────────────────────────────────────────────

type LogRow = {
  work_no: string; name: string; period_hours: number; updates_count: number
  completed: unknown[]; overdue: unknown[]; daily_logs: Array<{ log_date: string; status: number }>
}

// ── BenefitCard sub-component ─────────────────────────────────────────────────

const _fmtBenefitNum = (n: number) => {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)} 億`
  if (n >= 10_000) return `${(n / 10_000).toFixed(2)} 萬`
  return n.toFixed(2)
}

interface BenefitCardProps {
  benefit: TeamBenefitGroup[]
}

const BenefitCard: React.FC<BenefitCardProps> = ({ benefit }) => {
  const { t } = useTranslation()
  return (
  <Card className="h-full"
    title={
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
          <span className="text-[10px] text-blue-600 font-bold">¥</span>
        </div>
        <span className="text-sm font-semibold text-slate-600">{t('dashboard.annualBenefit')}</span>
      </div>
    }
    styles={{ body: { padding: 0, height: 'calc(100% - 57px)', display: 'flex', flexDirection: 'column' } }}>
    {benefit.length === 0
      ? <Empty description={t('dashboard.noBenefitData')} image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-4 px-4" />
      : benefit.map((group, idx) => (
        <div key={benefitUnitLabel(group.unit)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderTop: idx > 0 ? '1px solid #f1f5f9' : 'none', padding: '8px 16px' }}>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mb-1">
            {benefitUnitLabel(group.unit)}
          </span>
          <div className="tabular-nums font-black text-blue-600 text-center leading-none" style={{ fontSize: 'clamp(16px, 3.5vh, 36px)' }}>
            {_fmtBenefitNum(group.expected)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{t('dashboard.expectedAnnualBenefit')}</div>
        </div>
      ))
    }
  </Card>
  )
}

// ── BenefitDetailCard sub-component ───────────────────────────────────────────

interface BenefitDetailCardProps {
  benefit: TeamBenefitGroup[]
  navigate: (path: string) => void
}

const BenefitDetailCard: React.FC<BenefitDetailCardProps> = ({ benefit, navigate }) => {
  const { t } = useTranslation()
  const projStatusLabel = (s: number) => {
    const m: Record<number, [string, string]> = {
      5: [t('dashboard.inProgress'), '#2563eb'], 7: [t('dashboard.completedCount'), '#16a34a'], 8: [t('dashboard.suspendedLabel'), '#94a3b8'],
    }
    const [label, color] = m[s] ?? [t('common.noData'), '#94a3b8']
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
        style={{ background: `${color}18`, color }}>{label}</span>
    )
  }

  const SECTIONS: { type: 'project' | 'addon_req' | 'standalone_req'; label: string; color: string; amtKey: keyof typeof benefit[0] }[] = [
    { type: 'project',      label: t('dashboard.benefitProject'),    color: '#2563eb', amtKey: 'proj_expected'       },
    { type: 'addon_req',    label: t('dashboard.benefitAddonReq'), color: '#ea580c', amtKey: 'addon_expected'      },
    { type: 'standalone_req', label: t('dashboard.benefitStandaloneReq'), color: '#7c3aed', amtKey: 'standalone_expected' },
  ]

  return (
    <Card className="h-full"
      title={
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-blue-100 flex items-center justify-center">
            <span className="text-[10px] text-blue-600 font-bold">¥</span>
          </div>
          <span className="text-sm font-semibold text-slate-600">{t('dashboard.annualBenefitDetail')}</span>
        </div>
      }
      styles={{ body: { padding: '12px 16px', overflow: 'auto', height: 'calc(100% - 57px)' } }}>
      {benefit.length === 0
        ? <Empty description={t('dashboard.noBenefitData')} image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-4" />
        : benefit.map((group, idx) => (
          <div key={benefitUnitLabel(group.unit)}>
            {idx > 0 && <div className="border-t border-slate-100 my-3" />}
            {/* 单位组标题 */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {benefitUnitLabel(group.unit)}
              </span>
              <span className="ml-auto text-xs font-semibold text-blue-600 tabular-nums">
                {t('dashboard.totalBenefit', { amount: _fmtBenefitNum(group.expected), unit: benefitUnitLabel(group.unit) })}
              </span>
            </div>
            {/* 按类型分组显示 */}
            {SECTIONS.map(({ type, label, color, amtKey }) => {
              const items = group.projects.filter((p) => p.type === type)
              if (items.length === 0) return null
              return (
                <div key={type} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${color}18`, color }}>{label}</span>
                    <span className="text-[10px] text-slate-400 tabular-nums ml-auto">
                      {_fmtBenefitNum(group[amtKey] as number)} {benefitUnitLabel(group.unit)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {items.map((item) => (
                      <div key={item.id}
                        className={`rounded-lg px-3 py-2 transition-colors flex items-center gap-2 ${type !== 'standalone_req' ? 'hover:bg-slate-100 cursor-pointer' : ''} bg-slate-50`}
                        onClick={() => {
                          if (type === 'project') navigate(`/projects/${item.id}`)
                          else if (type === 'addon_req' && item.proj_id) navigate(`/projects/${item.proj_id}`)
                        }}>
                        <span className="text-xs font-medium text-slate-700 truncate flex-1">{item.name}</span>
                        {type === 'project' && projStatusLabel(item.status)}
                        <span className="font-semibold tabular-nums text-xs flex-shrink-0" style={{ color }}>
                          {_fmtBenefitNum(item.expected)}
                          <span className="text-[10px] font-normal text-slate-400 ml-0.5">{benefitUnitLabel(group.unit)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      }
    </Card>
  )
}

// ── TeamLogCard sub-component ─────────────────────────────────────────────────

interface TeamLogCardProps {
  logReportData: LogRow[]
  logLoading: boolean
  logPeriod: 'day' | 'week' | 'month' | 'quarter'
  setLogPeriod: (p: 'day' | 'week' | 'month' | 'quarter') => void
  notifyingSet: Set<string>
  setNotifyingSet: React.Dispatch<React.SetStateAction<Set<string>>>
  notifyingAll: boolean
  setNotifyingAll: (v: boolean) => void
  navigate: ReturnType<typeof useNavigate>
}

const TeamLogCard: React.FC<TeamLogCardProps> = ({
  logReportData, logLoading, logPeriod, setLogPeriod,
  notifyingSet, setNotifyingSet, notifyingAll, setNotifyingAll, navigate,
}) => {
  const { t } = useTranslation()
  const todayStr = dayjs().format('YYYY-MM-DD')
  const LOG_PERIODS = [
    { key: 'day'     as const, label: t('dashboard.thisDay') },
    { key: 'week'    as const, label: t('dashboard.thisWeek') },
    { key: 'month'   as const, label: t('dashboard.thisMonth') },
    { key: 'quarter' as const, label: t('dashboard.thisQuarter') },
  ]
  const unsubmittedMembers = logReportData.filter((r) => {
    const todayLog = r.daily_logs?.find((l) => l.log_date === todayStr)
    return todayLog?.status !== 2
  })
  const handleNotifyAll = async () => {
    if (unsubmittedMembers.length === 0) return
    setNotifyingAll(true)
    try {
      await notificationApi.remindDailyLog(unsubmittedMembers.map((r) => r.work_no))
      message.success(t('dashboard.notifyAllSuccess', { count: unsubmittedMembers.length }))
    } catch {
      message.error(t('dashboard.notifyAllFailed'))
    } finally {
      setNotifyingAll(false)
    }
  }
  const rawColumns = [
    {
      title: t('dashboard.memberColumn'), dataIndex: 'name', key: 'name',
      render: (name: string, record: LogRow) => (
        <div className="flex items-center gap-2">
          <Avatar size={24} style={{ background: '#eff6ff', color: '#2563eb', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{name[0]}</Avatar>
          <div>
            <div className="text-xs font-medium text-slate-700">{name}</div>
            <div className="text-[10px] text-slate-400">{record.work_no}</div>
          </div>
        </div>
      ),
    },
    {
      title: t('dashboard.workHoursColumn'), dataIndex: 'period_hours', key: 'period_hours',
      sorter: (a: LogRow, b: LogRow) => a.period_hours - b.period_hours,
      render: (h: number) => <span className="text-xs font-semibold text-blue-600">{Number(h).toFixed(1)}h</span>,
    },
    {
      title: t('dashboard.updateCountColumn'), dataIndex: 'updates_count', key: 'updates_count',
      sorter: (a: LogRow, b: LogRow) => a.updates_count - b.updates_count,
      render: (v: number) => <span className="text-xs text-slate-600">{v}</span>,
    },
    {
      title: t('dashboard.completedColumn'), key: 'completed',
      sorter: (a: LogRow, b: LogRow) => (a.completed?.length ?? 0) - (b.completed?.length ?? 0),
      render: (_: unknown, r: LogRow) => <span className="text-xs text-green-600">{r.completed?.length ?? 0}</span>,
    },
    {
      title: t('dashboard.overdueColumn'), key: 'overdue',
      sorter: (a: LogRow, b: LogRow) => (a.overdue?.length ?? 0) - (b.overdue?.length ?? 0),
      render: (_: unknown, r: LogRow) => {
        const count = r.overdue?.length ?? 0
        return count > 0
          ? <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{count}</Tag>
          : <span className="text-xs text-slate-300">-</span>
      },
    },
    {
      title: t('dashboard.todayReportColumn'), key: 'daily_log',
      render: (_: unknown, r: LogRow) => {
        const todayLog = r.daily_logs?.find((l) => l.log_date === todayStr)
        const submitted = todayLog?.status === 2
        const isNotifying = notifyingSet.has(r.work_no)
        const handleNotify = async (e: React.MouseEvent) => {
          e.stopPropagation()
          setNotifyingSet((prev) => new Set(prev).add(r.work_no))
          try {
            await notificationApi.remindDailyLog([r.work_no])
            message.success(t('dashboard.notifySuccess', { name: r.name }))
          } catch {
            message.error(t('dashboard.notifyFailed'))
          } finally {
            setNotifyingSet((prev) => { const s = new Set(prev); s.delete(r.work_no); return s })
          }
        }
        return (
          <div className="flex items-center gap-1.5">
            <Tooltip title={submitted ? t('dashboard.submittedStatus') : t('dashboard.notSubmittedStatus')}>
              <span className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${submitted ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                {submitted ? '✓' : '✗'}
              </span>
            </Tooltip>
            {!submitted && (
              <Tooltip title={t('dashboard.notifyTip')}>
                <button
                  onClick={handleNotify}
                  disabled={isNotifying}
                  className="w-5 h-5 rounded inline-flex items-center justify-center border-0 outline-none cursor-pointer transition-colors bg-orange-50 hover:bg-orange-100 text-orange-500 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <BellIcon className="w-3 h-3" />
                </button>
              </Tooltip>
            )}
          </div>
        )
      },
    },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)
  return (
    <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-600">{t('dashboard.memberWorkHours')}</span>
          <div className="flex items-center gap-1">
            {LOG_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setLogPeriod(p.key)}
                className={`px-2 py-0.5 rounded text-[11px] cursor-pointer border-0 outline-none transition-colors ${
                  logPeriod === p.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      }
      extra={
        <div className="flex items-center gap-2">
          {unsubmittedMembers.length > 0 && (
            <Tooltip title={t('dashboard.notifyAllTooltip', { count: unsubmittedMembers.length })}>
              <button
                onClick={handleNotifyAll}
                disabled={notifyingAll}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border border-orange-200 text-orange-500 bg-orange-50 hover:bg-orange-100 cursor-pointer outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <BellIcon className="w-3 h-3" />
                {t('dashboard.notifyAll', { count: unsubmittedMembers.length })}
              </button>
            </Tooltip>
          )}
          <span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate(`/statistics?tab=report&period=${logPeriod}`)}>{t('dashboard.viewDetail')}</span>
        </div>
      }
      styles={{ body: { flex: 1, padding: '0 16px 8px', minHeight: 0, overflowY: 'auto' } }}>
      <Table
        dataSource={logReportData}
        columns={columns}
        components={tableComponents}
        rowKey="work_no"
        size="small"
        loading={logLoading}
        pagination={false}
        locale={{ emptyText: <Empty description={t('dashboard.noTableData')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        onRow={(r) => ({
          onClick: () => navigate(`/statistics?tab=report&period=${logPeriod}&member=${r.work_no}`),
          style: { cursor: 'pointer' },
        })}
      />
    </Card>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const { t } = useTranslation()
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const { indexData, name, workNo, isSupervisor, isManagerView } = useAppSelector((s) => s.auth)
  const isManager = isManagerView
  const setIsManager = (v: boolean) => dispatch(setManagerView(v))

  // ── Grid 寬度測量 ─────────────────────────────────────────────────────────
  const { containerRef: gridRef, width: gridWidth } = useContainerWidth()

  // ── Widget 配置 ────────────────────────────────────────────────────────────
  const viewType = isManager ? 'manager' : 'personal'
  const {
    allWidgets, visibleWidgets, gridLayout,
    isEditing, setIsEditing,
    onLayoutChange, showWidget, hideWidget, resetLayout,
  } = useDashboardConfig(viewType)
  const [addCardOpen,  setAddCardOpen]  = useState(false)
  const [refreshKey,   setRefreshKey]   = useState(0)
  const toName = useWorkNoToName()
  const [memberStats,      setMemberStats]      = useState<MemberWorkStat[]>([])
  const [myProjects,       setMyProjects]       = useState<ProjectListItem[]>([])
  const [teamProjects,     setTeamProjects]     = useState<ProjectListItem[]>([])
  const [myFuncTasks,      setMyFuncTasks]      = useState<(ProjectFunction & { project_nm: string })[]>([])
  const [pendingReviews,   setPendingReviews]   = useState<ApplyRecord[]>([])
  const [allPendingReviews, setAllPendingReviews] = useState<ApplyRecord[]>([])
  const [todayLog,         setTodayLog]         = useState<BackendDailyLogSummary | null>(null)
  const [alertTasks,       setAlertTasks]       = useState<AlertTask[]>([])
  const [userStat,         setUserStat]         = useState<UserStatistical | null>(null)
  const [teamStat,         setTeamStat]         = useState<TeamStatistical | null>(null)
  const [weeklyActivity,   setWeeklyActivity]   = useState<WeeklyActivityItem[]>([])
  const [latestNews,       setLatestNews]       = useState<NewsItem[]>([])
  const [logPeriod,        setLogPeriod]        = useState<'day' | 'week' | 'month' | 'quarter'>('day')
  const [notifyingSet,     setNotifyingSet]     = useState<Set<string>>(new Set())
  const [notifyingAll,     setNotifyingAll]     = useState(false)
  const [logReportData,    setLogReportData]    = useState<Array<{
    work_no: string; name: string; period_hours: number; updates_count: number
    completed: unknown[]; overdue: unknown[]; daily_logs: Array<{ log_date: string; status: number }>
  }>>([])
  const [logLoading,       setLogLoading]       = useState(false)
  const [reqStats,         setReqStats]         = useState<ReqStats | null>(null)
  const [arTaskStats,      setArTaskStats]       = useState<ArTaskStats | null>(null)

  useEffect(() => { dispatch(fetchIndexThunk()) }, [dispatch])

  useEffect(() => {
    const visible = new Set(allWidgets.filter((w) => w.is_visible).map((w) => w.widget_id))

    if (visible.has('member_task_chart') || visible.has('member_detail') ||
        visible.has('team_size') || visible.has('daily_report_status')) {
      projectApi.memberStats()
        .then((res) => {
          const c = res.content as { members?: MemberWorkStat[] } | MemberWorkStat[]
          if (Array.isArray(c)) setMemberStats(c as MemberWorkStat[])
          else if (c && Array.isArray(c.members)) setMemberStats(c.members)
        })
        .catch(() => {})
    }

    if (visible.has('project_stats') || visible.has('task_stats') || visible.has('pending_review')) {
      authApi.getStatistical()
        .then((res) => { if (res.content) setUserStat(res.content) })
        .catch(() => {})
    }

    if (visible.has('team_project') || visible.has('team_task') || visible.has('team_pending') || visible.has('team_benefit') || visible.has('team_benefit_detail') || visible.has('team_task_pie') || visible.has('team_progress_bar')) {
      authApi.getTeamStatistical()
        .then((res) => { if (res.content) setTeamStat(res.content) })
        .catch(() => {})
    }

    if (visible.has('my_projects')) {
      projectApi.list({ page: 1, size: 20, work_no: workNo ?? undefined })
        .then((res) => {
          const list = (res as { content?: { project_list?: ProjectListItem[] } }).content?.project_list ?? []
          setMyProjects(list)
        })
        .catch(() => {})
    }

    if (visible.has('my_tasks')) {
      projectApi.myFunctions({ page: 1, size: 200, scope: 'mine' })
        .then((res) => {
          const c = res.content as { data_list?: (ProjectFunction & { project_nm: string })[] }
          const all = c.data_list ?? []
          setMyFuncTasks(all.filter((f) => f.status !== 4))
        })
        .catch(() => {})
    }

    if (visible.has('my_pending_review')) {
      projectApi.allReviews()
        .then((res) => {
          const list = (Array.isArray(res.content) ? res.content : []) as ApplyRecord[]
          setPendingReviews(list.filter((r) => r.status === 1 && r.is_my_turn))
        })
        .catch(() => {})
    }

    if (visible.has('team_project_status') || visible.has('team_project_progress')) {
      projectApi.list({ page: 1, size: 100, work_no: workNo ?? undefined, manager_view: true })
        .then((res) => {
          const list = (res as { content?: { project_list?: ProjectListItem[] } }).content?.project_list ?? []
          setTeamProjects(list)
        })
        .catch(() => {})
    }

    if (visible.has('team_review_types')) {
      projectApi.allReviews()
        .then((res) => {
          const list = (Array.isArray(res.content) ? res.content : []) as ApplyRecord[]
          setAllPendingReviews(list.filter((r) => r.status === 1))
        })
        .catch(() => {})
    }

    if (visible.has('daily_log')) {
      const today = dayjs().format('YYYY-MM-DD')
      dailyLogApi.list({ page: 1, size: 1, start_date: today, end_date: today })
        .then((res) => {
          const list = (res as { content?: { list?: BackendDailyLogSummary[] } }).content?.list ?? []
          setTodayLog(list[0] ?? null)
        })
        .catch(() => {})
    }

    if (visible.has('activity_chart')) {
      authApi.getWeeklyActivity()
        .then((res) => { if (Array.isArray(res.content)) setWeeklyActivity(res.content) })
        .catch(() => {})
    }

    if (visible.has('latest_news')) {
      authApi.getLatestNews({ page: 1, size: 10 })
        .then((res) => {
          const list = (res as { content?: { data_list?: NewsItem[] } }).content?.data_list ?? []
          setLatestNews(list)
        })
        .catch(() => {})
    }

    if (visible.has('team_requirement')) {
      standaloneReqApi.list({ page: 1, size: 2000 })
        .then((res) => {
          const list = (res.content as any).data_list ?? []
          const active = list.filter((r: any) => r.status !== 9)
          setReqStats({
            total:       active.length,
            in_progress: active.filter((r: any) => r.status === 2).length,
            completed:   active.filter((r: any) => r.status === 4).length,
            pending:     active.filter((r: any) => r.status === 1 || r.status === 5).length,
          })
        })
        .catch(() => {})
    }

    if (visible.has('team_ar_task')) {
      const today = new Date().toISOString().slice(0, 10)
      dutyApi.list({ page: 1, size: 2000 })
        .then((res) => {
          const list = (res.content as any).data_list ?? []
          const active = list.filter((d: any) => d.status !== 9)
          setArTaskStats({
            total:       active.length,
            in_progress: active.filter((d: any) => d.status === 1).length,
            completed:   active.filter((d: any) => d.status === 3).length,
            overdue:     active.filter((d: any) => d.status !== 3 && d.expected_end_date && d.expected_end_date < today).length,
            suspended:   active.filter((d: any) => d.status === 8).length,
          })
        })
        .catch(() => {})
    }

    authApi.getAlertTasks()
      .then((res) => { if (Array.isArray(res.content)) setAlertTasks(res.content) })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewType, allWidgets.length, refreshKey])

  // ── team_log_today 進度報告資料 ────────────────────────────────────────────
  useEffect(() => {
    const visible = allWidgets.some((w) => w.is_visible && w.widget_id === 'team_log_today')
    if (!visible || !isManager) return
    const today = dayjs()
    let start: string, end: string
    if (logPeriod === 'day') {
      start = end = today.format('YYYY-MM-DD')
    } else if (logPeriod === 'week') {
      start = today.startOf('isoWeek').format('YYYY-MM-DD')
      end   = today.endOf('isoWeek').format('YYYY-MM-DD')
    } else if (logPeriod === 'month') {
      start = today.startOf('month').format('YYYY-MM-DD')
      end   = today.endOf('month').format('YYYY-MM-DD')
    } else {
      const q = Math.floor(today.month() / 3)
      start = today.month(q * 3).startOf('month').format('YYYY-MM-DD')
      end   = today.month(q * 3 + 2).endOf('month').format('YYYY-MM-DD')
    }
    setLogLoading(true)
    ;(projectApi as unknown as { progressReport: (p: { start_date: string; end_date: string }) => Promise<{ content: unknown }> })
      .progressReport({ start_date: start, end_date: end })
      .then((res) => { if (Array.isArray(res.content)) setLogReportData(res.content) })
      .catch(() => {})
      .finally(() => setLogLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logPeriod, isManager, allWidgets.length, refreshKey])

  // ── 統計數據預計算 ─────────────────────────────────────────────────────────
  const taskInProg     = (indexData?.total_task_num?.doing_task   ?? 0) + (indexData?.total_task_num?.doing_duty    ?? 0)
  const taskUnstart    = (indexData?.total_task_num?.unstart_task ?? 0) + (indexData?.total_task_num?.unstart_duty  ?? 0)
  const taskDone       = userStat?.completed ?? 0
  const taskTotal      = (userStat?.total_projects ?? 0) + (userStat?.total_duties ?? 0)

  const managerChartData = memberStats.map((m) => ({
    name:    m.name,
    work_no: m.work_no,
    超時任務: m.overdue_tasks,
    臨期任務: m.urgent_tasks ?? 0,
    進行中:   m.in_progress_tasks,
  })).sort((a, b) => (b['超時任務'] + b['臨期任務']) - (a['超時任務'] + a['臨期任務']))

  return (
    <div className="p-6">
      {/* Greeting */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('dashboard.welcome')}，{name ?? t('user.name')} 👋</h1>
          <p className="text-slate-400 text-sm mt-0.5">{dayjs().format(t('common.dateFormatFull'))} · {t('dashboard.todayMotivation')}</p>
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <button
                onClick={() => setAddCardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-colors outline-none cursor-pointer"
              >
                <span className="text-base leading-none">+</span> {t('dashboard.addCard')}
              </button>
              <button
                onClick={async () => { await resetLayout() }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-orange-200 text-orange-600 hover:bg-orange-50 transition-colors outline-none cursor-pointer"
              >
                {t('dashboard.resetLayout')}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 transition-colors outline-none border-0 cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-1.5 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition-colors outline-none border-0 cursor-pointer"
              >
                {t('common.save')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors outline-none border-0 cursor-pointer"
            >
              <span className="text-base leading-none">⊞</span> {t('dashboard.manageCards')}
            </button>
          )}
          {/* Manager view toggle — only shown to supervisors */}
          {isSupervisor && (
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <UsersIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500">{t('dashboard.managerView')}</span>
              <Switch size="small" checked={isManager} onChange={setIsManager} />
            </div>
          )}
          {((indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)) > 0 && (
            <div className="hidden md:flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2">
              <FireIcon className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-600 font-medium">{t('dashboard.pendingReviewAlert', { count: (indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0) })}</span>
            </div>
          )}
        </div>
      </div>

      {/* Alert Bar — always shown when there are pending reviews */}
      <AlertBar pendingReview={(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)} alertTasks={alertTasks} />

      <AddCardModal
        open={addCardOpen}
        onClose={() => setAddCardOpen(false)}
        viewType={viewType}
        allWidgets={allWidgets}
        onShow={showWidget}
        onHide={hideWidget}
      />

      {/* ── Widget 渲染（react-grid-layout） ── */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <div ref={gridRef as any}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <GridLayout
        width={gridWidth ?? 800}
        layout={gridLayout as any}
        gridConfig={{ cols: 120, rowHeight: 4, margin: [1, 1] as [number, number] }}
        dragConfig={{ enabled: isEditing }}
        resizeConfig={{ enabled: isEditing }}
        onLayoutChange={onLayoutChange as any}
      >
      {visibleWidgets.map((w) => {
        const node = (() => {
          switch (w.widget_id) {

            // ── Manager widgets ─────────────────────────────────────────────
            case 'team_project': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center"><FolderIcon className="w-4 h-4 text-indigo-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.teamProjectCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-3"><div className="text-2xl font-bold text-slate-700">{teamStat?.team_project.total ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalCount')}</div></div>
                  <div className="flex-1 text-center px-3"><div className="text-2xl font-bold text-blue-600">{teamStat?.team_project.in_progress ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div></div>
                  <div className="flex-1 text-center pl-3"><div className="text-2xl font-bold text-green-600">{teamStat?.team_project.completed ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.completedCount')}</div></div>
                </div>
              </Card>
            )

            case 'team_task': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><ClipboardDocumentListIcon className="w-4 h-4 text-blue-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.teamTaskCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-2"><div className="text-xl font-bold text-slate-700">{teamStat?.team_task.total ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalCount')}</div></div>
                  <div className="flex-1 text-center px-2"><div className="text-xl font-bold text-blue-600">{teamStat?.team_task.in_progress ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div></div>
                  <div className="flex-1 text-center px-2"><div className={`text-xl font-bold ${(teamStat?.team_task.overdue ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{teamStat?.team_task.overdue ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.overdueTimeLabel')}</div></div>
                  <div className="flex-1 text-center px-2"><div className={`text-xl font-bold ${(teamStat?.team_task.urgent ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{teamStat?.team_task.urgent ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.urgentTimeLabel')}</div></div>
                  <div className="flex-1 text-center pl-2"><div className="text-xl font-bold text-slate-500">{teamStat?.team_task.not_started ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.notStarted')}</div></div>
                </div>
              </Card>
            )

            case 'team_pending': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center"><ClockIcon className="w-4 h-4 text-orange-500" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.pendingCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-3"><div className={`text-2xl font-bold ${(teamStat?.pending.review ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{teamStat?.pending.review ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.pendingReviewLabel')}</div></div>
                  <div className="flex-1 text-center pl-3"><div className={`text-2xl font-bold ${(teamStat?.pending.progress_update ?? 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>{teamStat?.pending.progress_update ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.progressUpdateLabel')}</div></div>
                </div>
              </Card>
            )

            case 'team_size': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center"><UsersIcon className="w-4 h-4 text-indigo-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.subordinatesCard')}</span>
                </div>
                <div className="text-3xl font-bold text-slate-700 text-center">{memberStats.length}</div>
              </Card>
            )

            case 'team_requirement': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><ClipboardDocumentListIcon className="w-4 h-4 text-purple-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.reqOverviewCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-2">
                    <div className="text-2xl font-bold text-slate-700">{reqStats?.total ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalCount')}</div>
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className="text-2xl font-bold text-blue-600">{reqStats?.in_progress ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div>
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className="text-2xl font-bold text-green-600">{reqStats?.completed ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.completedCount')}</div>
                  </div>
                  <div className="flex-1 text-center pl-2">
                    <div className={`text-2xl font-bold ${(reqStats?.pending ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{reqStats?.pending ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.reviewingCount')}</div>
                  </div>
                </div>
              </Card>
            )

            case 'team_ar_task': return !isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center"><BellIcon className="w-4 h-4 text-amber-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.arTaskCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-2">
                    <div className="text-xl font-bold text-slate-700">{arTaskStats?.total ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalCount')}</div>
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className="text-xl font-bold text-blue-600">{arTaskStats?.in_progress ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div>
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className="text-xl font-bold text-green-600">{arTaskStats?.completed ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.completedCount')}</div>
                  </div>
                  <div className="flex-1 text-center px-2">
                    <div className={`text-xl font-bold ${(arTaskStats?.overdue ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{arTaskStats?.overdue ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.overdueColumn')}</div>
                  </div>
                  <div className="flex-1 text-center pl-2">
                    <div className={`text-xl font-bold ${(arTaskStats?.suspended ?? 0) > 0 ? 'text-orange-400' : 'text-slate-400'}`}>{arTaskStats?.suspended ?? 0}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.suspendedLabel')}</div>
                  </div>
                </div>
              </Card>
            )

            case 'daily_report_status': return !isManager ? null : (() => {
              const submitted = memberStats.filter((m) => m.log_submitted).length
              const total = memberStats.length
              const isLow = submitted < total
              return (
                <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center"><PencilSquareIcon className="w-4 h-4 text-green-600" /></div>
                    <span className="text-sm font-semibold text-slate-600">{t('dashboard.todayReportSubmitCard')}</span>
                  </div>
                  <div className="text-2xl font-bold text-center">
                    <span className={isLow ? 'text-orange-500' : 'text-green-600'}>{submitted}</span>
                    <span className="text-slate-300 mx-1">/</span>
                    <span className="text-slate-600">{total}</span>
                  </div>
                </Card>
              )
            })()

            case 'member_task_chart': return !isManager ? null : (
              <Card
                className="h-full"
                style={{ display: 'flex', flexDirection: 'column' }}
                title={
                  <div className="flex items-center gap-2">
                    <ChartBarIcon className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-600">{t('dashboard.memberTaskChartTitle')}</span>
                    <div className="flex items-center gap-3 ml-auto">
                      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#f87171]" /><span className="text-xs text-slate-400">{t('dashboard.overdueTaskLabel')}</span></div>
                      <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24]" /><span className="text-xs text-slate-400">{t('dashboard.urgentTaskLabel')}</span></div>
                    </div>
                  </div>
                }
                styles={{ body: { flex: 1, overflow: 'auto', padding: '12px 16px', minHeight: 0 } }}
              >
                <ResponsiveContainer width="100%" height={Math.max(managerChartData.length * 36 + 8, 60)}>
                  <BarChart data={managerChartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }} barCategoryGap="30%">
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={52} />
                    <RTooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                      cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                      formatter={(v, name) => [`${v} 項`, name]}
                    />
                    <Bar dataKey="超時任務" name={t('dashboard.overdueTaskLabel')} stackId="a" fill="#f87171" radius={[0,0,0,0]}>
                      {managerChartData.map((_, i) => (
                        <Cell key={i} fill={managerChartData[i]['超時任務'] > 0 ? '#f87171' : '#e2e8f0'} />
                      ))}
                    </Bar>
                    <Bar dataKey="臨期任務" name={t('dashboard.urgentTaskLabel')} stackId="a" fill="#fbbf24" radius={[4,4,4,4]}>
                      <LabelList
                        position="right"
                        style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                        content={({ x, y, width, height, index }: any) => {
                          if (index == null || x == null || y == null || width == null || height == null) return null
                          const d = managerChartData[index]
                          if (!d) return null
                          const total = (d['超時任務'] ?? 0) + (d['臨期任務'] ?? 0)
                          if (total <= 0) return null
                          return <text x={x + width + 6} y={y + height / 2 + 4} fill="#64748b" fontSize={11} fontWeight={600}>{total}</text>
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            )

            case 'member_detail': return !isManager ? null : (
              <Card
                className="h-full"
                style={{ display: 'flex', flexDirection: 'column' }}
                title={<span className="text-sm font-semibold text-slate-600">{t('dashboard.memberDetailTitle')}</span>}
                extra={<span className="text-xs text-slate-400 cursor-pointer hover:text-blue-500" onClick={() => navigate('/duties')}>{t('dashboard.viewDetail')}</span>}
                styles={{ body: { flex: 1, overflow: 'auto', padding: 0, minHeight: 0 } }}
              >
                <div className="divide-y divide-slate-50">
                  {managerChartData.map((m) => {
                    const isAtRisk = m['超時任務'] > 0 || m['臨期任務'] > 0
                    return (
                      <div
                        key={m.work_no}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/duties?responsible=${m.work_no}`)}
                      >
                        <Avatar
                          size={28}
                          style={{ background: isAtRisk ? '#fef2f2' : '#eff6ff', color: isAtRisk ? '#dc2626' : '#2563eb', fontSize: 11, fontWeight: 700, flexShrink: 0 }}
                        >
                          {m.name[0]}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">{m.name}</div>
                          <div className="text-xs text-slate-400">{t('dashboard.inProgressItem', { count: m['進行中'] })}</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {m['超時任務'] > 0 && <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dashboard.overdueItem', { count: m['超時任務'] })}</Tag>}
                          {m['臨期任務'] > 0 && <Tag color="warning" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dashboard.urgentItem', { count: m['臨期任務'] })}</Tag>}
                          {!isAtRisk && <Tag color="success" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('dashboard.normalStatus')}</Tag>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )

            // ── New Manager chart widgets ───────────────────────────────────

            case 'team_task_pie': return !isManager ? null : (() => {
              const taskData = teamStat?.team_task
              const data = [
                { name: t('dashboard.inProgress'),    value: taskData?.in_progress ?? 0, color: '#2563eb' },
                { name: t('dashboard.notStarted'),    value: taskData?.not_started ?? 0, color: '#94a3b8' },
                { name: t('dashboard.completedLabel'), value: taskData?.completed   ?? 0, color: '#16a34a' },
                { name: t('dashboard.overdueTimeLabel'), value: taskData?.overdue   ?? 0, color: '#dc2626' },
                { name: t('dashboard.urgentTimeLabel'), value: taskData?.urgent     ?? 0, color: '#f59e0b' },
                { name: t('dashboard.draftLabel'),    value: (taskData as any)?.draft ?? 0, color: '#d1d5db' },
              ].filter((d) => d.value > 0)
              return (
                <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}
                  title={<span className="text-sm font-semibold text-slate-600">{t('dashboard.taskDistributionTitle')}</span>}
                  styles={{ body: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 12px', minHeight: 0 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="70%" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v, name) => [`${v} 項`, name]} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )
            })()

            case 'team_project_status': return !isManager ? null : (() => {
              const STATUS_LABEL_SHORT: Record<number, string> = {
                1: t('status.project.1'), 2: t('status.project.2'), 3: t('status.project.3'),
                4: t('status.project.4'), 5: t('status.project.5'), 6: t('status.project.6'), 7: t('status.project.7'),
              }
              const STATUS_COLORS: Record<number, string> = { 1: '#94a3b8', 2: '#93c5fd', 3: '#60a5fa', 4: '#f59e0b', 5: '#2563eb', 6: '#fb923c', 7: '#22c55e' }
              const counts: Record<string, { count: number; color: string }> = {}
              teamProjects.forEach((p) => {
                const label = STATUS_LABEL_SHORT[p.status] ?? t('common.noData')
                if (!counts[label]) counts[label] = { count: 0, color: STATUS_COLORS[p.status] ?? '#94a3b8' }
                counts[label].count += 1
              })
              const data = Object.entries(counts).map(([name, { count, color }]) => ({ name, value: count, color }))
              return (
                <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}
                  title={<span className="text-sm font-semibold text-slate-600">{t('dashboard.projectStatusDistTitle')}</span>}
                  extra={<span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate('/projects')}>{t('dashboard.viewAll')}</span>}
                  styles={{ body: { flex: 1, padding: '8px 16px', minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v, name) => [`${v} 個`, name]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                      <Bar dataKey="value" name={t('dashboard.projectStatusDistTitle')} radius={[4,4,0,0]} isAnimationActive={false}>
                        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                        <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )
            })()

            case 'team_project_progress': return !isManager ? null : (() => {
              const sorted = [...teamProjects]
                .filter((p) => p.status !== 7 && p.status !== 9)
                .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
                .slice(0, 10)
              return (
                <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}
                  title={<span className="text-sm font-semibold text-slate-600">{t('dashboard.projectRankingTitle')}</span>}
                  extra={<span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate('/projects')}>{t('dashboard.viewAll')}</span>}
                  styles={{ body: { flex: 1, padding: '8px 16px', minHeight: 0, overflowY: 'auto' } }}>
                  <div className="space-y-2 pt-1">
                    {sorted.length === 0
                      ? <Empty description={t('dashboard.noInProgressProjects')} image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-4" />
                      : sorted.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-md px-1 py-0.5 transition-colors" onClick={() => navigate(`/projects/${p.id}`)}>
                          <span className="text-xs text-slate-600 truncate flex-1" title={p.project_nm}>{p.project_nm}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0 w-32">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${p.progress ?? 0}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500 w-8 text-right">{p.progress ?? 0}%</span>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </Card>
              )
            })()

            case 'team_log_today': return !isManager ? null : (
              <TeamLogCard
                logReportData={logReportData}
                logLoading={logLoading}
                logPeriod={logPeriod}
                setLogPeriod={setLogPeriod}
                notifyingSet={notifyingSet}
                setNotifyingSet={setNotifyingSet}
                notifyingAll={notifyingAll}
                setNotifyingAll={setNotifyingAll}
                navigate={navigate}
              />
            )

            case 'team_review_types': return !isManager ? null : (() => {
              const counts: Record<string, number> = {}
              allPendingReviews.forEach((r) => {
                const key = r.apply_type || t('common.noData')
                counts[key] = (counts[key] ?? 0) + 1
              })
              const COLORS = ['#2563eb','#7c3aed','#0891b2','#059669','#d97706','#dc2626','#94a3b8']
              const data = Object.entries(counts).map(([name, value], i) => ({
                name,
                fullName: name,
                value,
                color: COLORS[i % COLORS.length],
              }))
              return (
                <Card className="h-full" style={{ display: 'flex', flexDirection: 'column' }}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-600">{t('dashboard.reviewTypesDistTitle')}</span>
                      {allPendingReviews.length > 0 && (
                        <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">{allPendingReviews.length}</span>
                      )}
                    </div>
                  }
                  extra={<span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate('/review')}>{t('dashboard.goApprove')}</span>}
                  styles={{ body: { flex: 1, padding: '8px 16px', minHeight: 0, display: 'flex', flexDirection: 'column' } }}>
                  {data.length === 0
                    ? <Empty description={t('dashboard.noPendingApprovals')} image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-4" />
                    : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 0 }} barCategoryGap="30%">
                          <XAxis type="number" hide allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={52} />
                          <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} formatter={(v, _n, props) => [`${v} 項`, props.payload?.fullName ?? _n]} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                          <Bar dataKey="value" name={t('dashboard.pendingReviewLabel')} radius={[0,4,4,0]}>
                            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                            <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </Card>
              )
            })()

            case 'team_benefit': return !isManager ? null : (
              <BenefitCard benefit={teamStat?.team_benefit ?? []} />
            )

            case 'team_benefit_detail': return !isManager ? null : (
              <BenefitDetailCard benefit={teamStat?.team_benefit ?? []} navigate={navigate} />
            )

            // ── Personal widgets ────────────────────────────────────────────
            case 'project_stats': return isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center"><FolderIcon className="w-4 h-4 text-blue-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.projectStatsTitle')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-3"><div className="text-2xl font-bold text-slate-700">{userStat?.project_total ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalProjectsLabel')}</div></div>
                  <div className="flex-1 text-center px-3"><div className="text-2xl font-bold text-blue-600">{userStat?.project_in_progress ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div></div>
                  <div className="flex-1 text-center pl-3"><div className="text-2xl font-bold text-green-600">{userStat?.project_completed ?? 0}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.completedCount')}</div></div>
                </div>
              </Card>
            )

            case 'task_stats': return isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center"><ClipboardDocumentListIcon className="w-4 h-4 text-purple-600" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.taskStatsTitle')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-2"><div className="text-2xl font-bold text-slate-700">{taskTotal}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.totalCount')}</div></div>
                  <div className="flex-1 text-center px-2"><div className="text-2xl font-bold text-blue-600">{taskInProg}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.inProgress')}</div></div>
                  <div className="flex-1 text-center px-2"><div className="text-2xl font-bold text-slate-400">{taskUnstart}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.notStarted')}</div></div>
                  <div className="flex-1 text-center pl-2"><div className="text-2xl font-bold text-green-600">{taskDone}</div><div className="text-xs text-slate-400 mt-0.5">{t('dashboard.completedLabel')}</div></div>
                </div>
              </Card>
            )

            case 'pending_review': return isManager ? null : (
              <Card className="h-full" styles={{ body: { padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', overflow: 'hidden' } }}>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center"><ClockIcon className="w-4 h-4 text-orange-500" /></div>
                  <span className="text-sm font-semibold text-slate-600">{t('dashboard.pendingCard')}</span>
                </div>
                <div className="flex divide-x divide-slate-100">
                  <div className="flex-1 text-center pr-3">
                    <div className={`text-2xl font-bold ${(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                      {(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.pendingReviewLabel')}</div>
                  </div>
                  <div className="flex-1 text-center pl-3">
                    <div className={`text-2xl font-bold ${(indexData?.total_progress_record_num ?? 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                      {indexData?.total_progress_record_num ?? 0}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">{t('dashboard.unreadProgressLabel')}</div>
                  </div>
                </div>
              </Card>
            )

            case 'daily_log': return isManager ? null : (
              <DailyLogCard canDismiss={isSupervisor} todayLog={todayLog} onDismiss={() => hideWidget('daily_log')} />
            )

            case 'activity_chart': return isManager ? null : (() => {
              const hasActivity = weeklyActivity.some((d) => d.project > 0 || d.duty > 0)
              return (
                <Card
                  className="h-full"
                  title={<span className="font-semibold text-slate-700 text-sm">{t('dashboard.weeklyActivityTitle')}</span>}
                  extra={<span className="text-xs text-slate-400">{dayjs().startOf('isoWeek').format('MM/DD')} – {dayjs().endOf('isoWeek').format('MM/DD')}</span>}
                  styles={{ body: { paddingTop: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' } }}
                >
                  {weeklyActivity.length === 0 || !hasActivity ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Empty description={t('dashboard.noWeeklyActivity')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="70%">
                        <BarChart data={weeklyActivity} barCategoryGap="35%">
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="project" name={t('dashboard.functionProgress')} fill="#bfdbfe" radius={[4,4,0,0]} />
                          <Bar dataKey="duty"    name={t('dashboard.arProgress')} fill="#2563eb" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-1">
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#bfdbfe]" /><span className="text-xs text-slate-400">{t('dashboard.functionProgress')}</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#2563eb]" /><span className="text-xs text-slate-400">{t('dashboard.arProgress')}</span></div>
                      </div>
                    </>
                  )}
                </Card>
              )
            })()

            case 'my_projects': return isManager ? null : (
              <Card
                className="h-full"
                styles={{ body: { padding: 0, overflow: 'auto', height: '100%' } }}
                title={
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{t('dashboard.myProjectTitle')}</div>
                    <div className="text-xs text-slate-400 font-normal mt-0.5">{t('dashboard.myProjectCount', { count: myProjects.length })}</div>
                  </div>
                }
              >
                {myProjects.length === 0
                  ? <Empty description={t('dashboard.noProjects')} className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : myProjects.map((p) => {
                    const pmName = toName(p.project_pm)
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${PRIORITY_COLORS[(p.priority ?? 1) - 1]}20` }}>
                          <FolderIcon className="w-4 h-4" style={{ color: PRIORITY_COLORS[(p.priority ?? 1) - 1] }} />
                        </div>
                        <span className="flex-1 text-sm text-slate-700 truncate">{p.project_nm}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Avatar size={22} style={{ background: '#2563eb', fontSize: 10, fontWeight: 700 }}>
                            {pmName?.[0]?.toUpperCase() || 'P'}
                          </Avatar>
                          <span className="text-xs text-slate-500 hidden sm:block">{pmName || p.project_pm}</span>
                        </div>
                        <span className="text-xs text-slate-300 w-20 text-right flex-shrink-0">
                          {p.expected_end_date ? dayjs(p.expected_end_date).format('MM/DD') : '-'}
                        </span>
                      </div>
                    )
                  })
                }
              </Card>
            )

            case 'my_tasks': return isManager ? null : (
              <Card
                className="h-full"
                styles={{ body: { padding: 0, overflow: 'auto', height: '100%' } }}
                title={
                  <div>
                    <div className="text-sm font-semibold text-slate-700">{t('dashboard.myTaskTitle')}</div>
                    <div className="text-xs text-slate-400 font-normal mt-0.5">{t('dashboard.myTaskSubtitle', { count: myFuncTasks.length })}</div>
                  </div>
                }
              >
                {myFuncTasks.length === 0
                  ? <Empty description={t('dashboard.noTasks')} className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : myFuncTasks.map((f) => {
                    const st = FUNCTION_STATUS_MAP[f.status]
                    return (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/projects/${f.project_id}?fid=${f.id}`)}
                      >
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st?.dot ?? '#94a3b8' }} />
                        <span className="flex-1 text-sm text-slate-700 truncate">{f.function_nm}</span>
                        {st && <Tag color={st.color} style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>{st.label}</Tag>}
                        <span className="text-xs text-slate-300 w-14 text-right flex-shrink-0">
                          {f.expected_end_date ? dayjs(f.expected_end_date).format('MM/DD') : '-'}
                        </span>
                        <span className="text-xs text-slate-400 w-20 text-right flex-shrink-0 truncate">
                          {f.project_nm || '-'}
                        </span>
                      </div>
                    )
                  })
                }
              </Card>
            )

            case 'my_pending_review': return isManager ? null : (
              <Card
                className="h-full"
                styles={{ body: { padding: 0, overflow: 'auto', height: '100%' } }}
                title={
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{t('dashboard.myPendingReviewTitle')}</span>
                    {pendingReviews.length > 0 && (
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingReviews.length}</span>
                    )}
                  </div>
                }
              >
                {pendingReviews.length === 0
                  ? <Empty description={t('dashboard.noPendingItems')} className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : pendingReviews.map((r) => {
                    const title = r.project_nm || r.duty_nm || r.function_nm || r.id
                    const typeLabel = r.apply_type || t('dashboard.applicationLabel')
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate('/review')}
                      >
                        <Tag color="orange" style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0, flexShrink: 0 }}>{typeLabel}</Tag>
                        <span className="flex-1 text-sm text-slate-700 truncate">{title}</span>
                        <span className="text-xs text-slate-300 flex-shrink-0">{dayjs(r.created_at).format('MM/DD')}</span>
                      </div>
                    )
                  })
                }
              </Card>
            )

            case 'monthly_attendance': return isManager ? null : <MonthlyAttendanceCard />

            case 'latest_news': return isManager ? null : (
              <Card
                className="h-full"
                title={<span className="font-semibold text-slate-700 text-sm">{t('dashboard.latestNewsTitle')}</span>}
                style={{ display: 'flex', flexDirection: 'column' }}
                styles={{ body: { padding: '0 16px 12px', overflowY: 'auto', flex: 1, minHeight: 0 } }}
              >
                {latestNews.length === 0
                  ? <Empty description={t('dashboard.noLatestNews')} className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  : latestNews.map((item) => {
                    const TYPE_COLOR: Record<string, string> = { progress: 'blue', duty_progress: 'purple', review: 'orange' }
                    const TYPE_LABEL: Record<string, string> = {
                      progress: t('dashboard.progressTag'),
                      duty_progress: t('dashboard.dutyProgressTag'),
                      review: t('dashboard.reviewTag'),
                    }
                    return (
                      <div key={item.id} className="flex items-start gap-2 py-2.5 border-b border-slate-50 last:border-0">
                        <Tag color={TYPE_COLOR[item.type] ?? 'default'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0, flexShrink: 0, marginTop: 1 }}>
                          {TYPE_LABEL[item.type] ?? item.type}
                        </Tag>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-slate-600">{item.action}</span>
                          {item.subject && <span className="text-xs text-slate-400 ml-1 truncate">· {item.subject}</span>}
                          {item.status && <Tag color={item.status === '已通過' ? 'success' : item.status === '已拒絕' ? 'error' : 'default'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: '0 0 0 4px' }}>{item.status}</Tag>}
                          <div className="text-[10px] text-slate-300 mt-0.5">{item.created_at?.slice(0, 16)}</div>
                        </div>
                      </div>
                    )
                  })
                }
              </Card>
            )

            default: return null
          }
        })()

        if (!node) return null
        return (
          <div key={w.widget_id} className="relative">
            <div className="absolute overflow-hidden rounded-lg [&_.ant-card-head]:pr-9" style={{ inset: '0 4px 8px 4px' }}>
            <WidgetMenu widgetId={w.widget_id} removable={w.removable} onHide={hideWidget} onRefresh={() => setRefreshKey((k) => k + 1)} />
            <div style={{ height: '100%' }} className="[&>*]:!h-full [&>*]:!mb-0">
              {node}
            </div>
            </div>
          </div>
        )
      })}
      </GridLayout>
      </div>
    </div>
  )
}

export default DashboardPage
