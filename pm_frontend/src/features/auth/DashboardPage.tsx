import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Progress, Tag, Avatar, Badge, Tooltip, Switch, Button, Empty } from 'antd'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
  Cell, LabelList,
} from 'recharts'
import {
  FolderIcon, ClipboardDocumentListIcon, ClockIcon,
  FireIcon, ExclamationTriangleIcon, BellAlertIcon,
  ChevronDownIcon, ChevronRightIcon, UsersIcon, ChartBarIcon,
  PencilSquareIcon, SunIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchIndexThunk, setManagerView } from './authSlice'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { projectApi } from '@/api/project.api'
import { authApi } from '@/api/auth.api'
import { dailyLogApi, type BackendDailyLogSummary } from '@/api/daily_log.api'
import type { ProjectListItem, UserStatistical, TeamStatistical } from '@/types/api.types'

// ─── Types for dashboard data ─────────────────────────────────────────────────
type MonthLogEntry = { hours: number; ot: number; status: 'confirmed' | 'submitted' | 'draft' }
interface MemberWorkStat {
  work_no: string; name: string; total_hours: number
  completed_tasks: number; in_progress_tasks: number; overdue_tasks: number
}

const getHeatColor = (hours: number) => {
  if (hours === 0) return '#f1f5f9'
  if (hours < 4)  return '#bfdbfe'
  if (hours < 6)  return '#93c5fd'
  if (hours < 8)  return '#60a5fa'
  return '#2563eb'
}

const STATUS_LABEL: Record<number, string> = { 1:'草稿',2:'立案審核',3:'規劃中',4:'規劃審核',5:'執行中',6:'完結審核',7:'已完結' }
const STATUS_COLOR: Record<number, string> = { 1:'default',2:'processing',3:'blue',4:'orange',5:'green',6:'orange',7:'success' }
const PRIORITY_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

// ─── Alert data types ─────────────────────────────────────────────────────────
interface AlertTask {
  id: string; name: string; type: 'function' | 'duty'; project_nm?: string
  responsible: string; expected_end_date: string; days_diff: number
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const DaysLeftBadge: React.FC<{ days: number }> = ({ days }) => {
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)}天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">剩 {days} 天</span>
}

// ─── Alert Bar ────────────────────────────────────────────────────────────────

const AlertBar: React.FC<{ pendingReview: number; alertTasks: AlertTask[] }> = ({ pendingReview, alertTasks }) => {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()

  const overdue  = alertTasks.filter((t) => t.days_diff < 0).sort((a, b) => a.days_diff - b.days_diff)
  const urgent   = alertTasks.filter((t) => t.days_diff >= 0 && t.days_diff <= 3)
  const upcoming = alertTasks.filter((t) => t.days_diff > 3 && t.days_diff <= 7)

  if (overdue.length === 0 && urgent.length === 0 && upcoming.length === 0 && pendingReview === 0) return null

  const handleTaskClick = (task: AlertTask) => {
    if (task.type === 'duty') navigate(`/duties/${task.id}`)
    // function tasks navigate to the project (project_id embedded in first char: f002 → p001, f007 → p002)
    else if (task.id.startsWith('f00') && task.id[3] <= '6') navigate('/projects/p001')
    else navigate('/projects/p002')
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
        {task.type === 'function' ? '功能' : '任務'}
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
          待關注事項
        </span>
        {/* Summary badges */}
        <div className="flex items-center gap-2">
          {overdue.length > 0 && (
            <Tooltip title="已超期任務">
              <Badge count={overdue.length} color="#dc2626" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {urgent.length > 0 && (
            <Tooltip title="緊急臨期（3天內）">
              <Badge count={urgent.length} color="#d97706" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {upcoming.length > 0 && (
            <Tooltip title="即將到期（7天內）">
              <Badge count={upcoming.length} color="#f59e0b" style={{ fontSize: 10 }} />
            </Tooltip>
          )}
          {pendingReview > 0 && (
            <Tooltip title="待我審批">
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
                <span className="text-xs font-semibold text-red-600">已超期 ({overdue.length})</span>
              </div>
              {overdue.map((t) => <AlertRow key={t.id} task={t} />)}
            </div>
          )}

          {/* Urgent (≤3 days) */}
          {urgent.length > 0 && (
            <div className="bg-white rounded-lg p-3 border border-orange-100">
              <div className="flex items-center gap-1.5 mb-2">
                <FireIcon className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-semibold text-orange-600">緊急臨期 ({urgent.length})</span>
              </div>
              {urgent.map((t) => <AlertRow key={t.id} task={t} />)}
            </div>
          )}

          {/* Upcoming (4–7 days) + pending review */}
          <div className="bg-white rounded-lg p-3 border border-amber-100">
            <div className="flex items-center gap-1.5 mb-2">
              <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-amber-600">即將到期 ({upcoming.length})</span>
            </div>
            {upcoming.map((t) => <AlertRow key={t.id} task={t} />)}
            {pendingReview > 0 && (
              <div
                className="flex items-center gap-2 py-1.5 mt-1 border-t border-slate-50 cursor-pointer hover:bg-white/60 rounded-md px-1 -mx-1 transition-colors"
                onClick={() => navigate('/review')}
              >
                <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }} color="blue">審批</Tag>
                <span className="text-slate-700 text-xs flex-1">待我處理的審批</span>
                <Badge count={pendingReview} color="#2563eb" style={{ fontSize: 10 }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manager Section ──────────────────────────────────────────────────────────

const ManagerSection: React.FC<{ memberStats: MemberWorkStat[] }> = ({ memberStats }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)

  const chartData = memberStats.map((m) => ({
    name:    m.name,
    work_no: m.work_no,
    超時任務: m.overdue_tasks,
    臨期任務: 0,  // loaded from API when available
    進行中:   m.in_progress_tasks,
  })).sort((a, b) => (b.超時任務 + b.臨期任務) - (a.超時任務 + a.臨期任務))

  const totalOverdue  = chartData.reduce((s, d) => s + d.超時任務, 0)
  const totalUrgent   = chartData.reduce((s, d) => s + d.臨期任務, 0)
  const atRiskMembers = chartData.filter((d) => d.超時任務 > 0 || d.臨期任務 > 0).length

  return (
    <Card
      bordered={false}
      className="shadow-sm mb-5 border border-indigo-100 bg-indigo-50/30"
      bodyStyle={{ padding: 0 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-5 py-3.5 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <UsersIcon className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <span className="text-sm font-semibold text-indigo-700 flex-1">下屬任務概覽</span>
        <div className="flex items-center gap-3 mr-2">
          <Tooltip title="有超時/臨期任務的成員數">
            <div className="flex items-center gap-1">
              <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-red-600 font-medium">{atRiskMembers} 人需關注</span>
            </div>
          </Tooltip>
        </div>
        {open
          ? <ChevronDownIcon className="w-4 h-4 text-slate-400" />
          : <ChevronRightIcon className="w-4 h-4 text-slate-400" />
        }
      </div>

      {open && (
        <div className="px-5 pb-5">
          {/* Mini stat row — 下屬人數 + 今日日報狀態 */}
          {(() => {
            const submitted = memberStats.filter((m) => (m as MemberWorkStat & { log_submitted?: boolean }).log_submitted).length
            const total = memberStats.length
            const notSubmitted = total - submitted
            return (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: '下屬人數',   value: total,         icon: <UsersIcon className="w-4 h-4 text-indigo-500" />,          color: '#6366f1', bg: '#eef2ff' },
                  { label: '已提交日報', value: submitted,     icon: <PencilSquareIcon className="w-4 h-4 text-green-500" />,     color: '#16a34a', bg: '#f0fdf4' },
                  { label: '未提交日報', value: notSubmitted,  icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />, color: notSubmitted > 0 ? '#dc2626' : '#94a3b8', bg: notSubmitted > 0 ? '#fef2f2' : '#f8fafc' },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg p-3 flex items-center gap-3" style={{ background: s.bg }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/60">{s.icon}</div>
                    <div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                      <div className="text-xl font-bold" style={{ color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

          <Row gutter={[16, 16]}>
            {/* Horizontal bar chart */}
            <Col xs={24} lg={14}>
              <div className="bg-white rounded-xl p-4 border border-slate-100">
                <div className="flex items-center gap-2 mb-3">
                  <ChartBarIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-semibold text-slate-600">各成員超時 / 臨期任務分佈</span>
                  <div className="flex items-center gap-3 ml-auto">
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#f87171]" /><span className="text-xs text-slate-400">超時</span></div>
                    <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm bg-[#fbbf24]" /><span className="text-xs text-slate-400">臨期</span></div>
                  </div>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36 + 8, 60)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 36, top: 0, bottom: 0 }} barCategoryGap="30%">
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={52} />
                    <RTooltip
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                      formatter={(v, name) => [`${v} 項`, name]}
                    />
                    <Bar dataKey="超時任務" stackId="a" fill="#f87171" radius={[0,0,0,0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={chartData[i].超時任務 > 0 ? '#f87171' : '#e2e8f0'} />
                      ))}
                    </Bar>
                    <Bar dataKey="臨期任務" stackId="a" fill="#fbbf24" radius={[4,4,4,4]}>
                      <LabelList
                        formatter={(_v: number, _k: unknown, idx: number) => {
                          const d = chartData[idx] ?? chartData[0]
                          const total = (d?.超時任務 ?? 0) + (d?.臨期任務 ?? 0)
                          return total > 0 ? total : ''
                        }}
                        position="right" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </Col>

            {/* Person cards */}
            <Col xs={24} lg={10}>
              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-50 flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">成員明細</span>
                  <span className="text-xs text-slate-400 ml-auto cursor-pointer hover:text-blue-500" onClick={() => navigate('/group')}>查看詳情 →</span>
                </div>
                <div className="divide-y divide-slate-50" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {chartData.map((m) => {
                    const isAtRisk = m.超時任務 > 0 || m.臨期任務 > 0
                    return (
                      <div
                        key={m.work_no}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => navigate('/group')}
                      >
                        <Avatar
                          size={28}
                          style={{
                            background: isAtRisk ? '#fef2f2' : '#eff6ff',
                            color: isAtRisk ? '#dc2626' : '#2563eb',
                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}
                        >
                          {m.name[0]}
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-700 truncate">{m.name}</div>
                          <div className="text-xs text-slate-400">進行中 {m.進行中} 項</div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {m.超時任務 > 0 && (
                            <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                              超時 {m.超時任務}
                            </Tag>
                          )}
                          {m.臨期任務 > 0 && (
                            <Tag color="warning" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                              臨期 {m.臨期任務}
                            </Tag>
                          )}
                          {!isAtRisk && (
                            <Tag color="success" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                              正常
                            </Tag>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Col>
          </Row>
        </div>
      )}
    </Card>
  )
}

// ─── Daily Log Status Card ─────────────────────────────────────────────────
const DailyLogCard: React.FC<{ canDismiss?: boolean; todayLog: BackendDailyLogSummary | null }> = ({ canDismiss = false, todayLog }) => {
  const navigate = useNavigate()
  const todayHours = todayLog ? Number(todayLog.total_hours) : 0
  const standardHours = 8.0
  const status: 'draft' | 'submitted' | 'not_started' = todayLog
    ? (todayLog.status === 2 ? 'submitted' : 'draft')
    : 'not_started'
  const pct = Math.min(100, Math.round((todayHours / standardHours) * 100))
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <Card bordered={false} className="shadow-sm mb-5 border border-blue-100 bg-blue-50/30" bodyStyle={{ padding: '16px 20px' }}>
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
          <PencilSquareIcon className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-700">今日日報</span>
            <Tag
              color={status === 'submitted' ? 'success' : status === 'draft' ? 'processing' : 'error'}
              style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}
            >
              {status === 'submitted' ? '✅ 已提交' : status === 'draft' ? '📝 草稿' : '⚠️ 未填寫'}
            </Tag>
            {!canDismiss && status !== 'submitted' && (
              <Tag color="red" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>必填</Tag>
            )}
            {canDismiss && (
              <Tag color="gold" style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>選填</Tag>
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
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Button type="primary" size="small" style={{ background: '#2563eb', borderRadius: 8 }}
            onClick={() => navigate('/daily-log')}>
            {status === 'not_started' ? '立即填寫' : '繼續填寫'} →
          </Button>
          {canDismiss && (
            <button onClick={() => setDismissed(true)} className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors">
              關閉日報提醒
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Team Daily Log Status (Manager) ──────────────────────────────────────────
interface TeamMemberLog { name: string; work_no: string; hours: number; status: string }
const TeamDailyLogCard: React.FC = () => {
  const [teamMembers, setTeamMembers] = useState<TeamMemberLog[]>([])

  useEffect(() => {
    const today = dayjs().format('YYYY-MM-DD')
    // TODO: call team daily log summary API when available, e.g.:
    // groupApi.teamDailyLogs({ date: today }).then(...)
    // For now, load today's logs (manager sees all with work_no filter support)
    dailyLogApi.list({ page: 1, size: 50, start_date: today, end_date: today })
      .then((res) => {
        const list = (res as { content?: { list?: BackendDailyLogSummary[] } }).content?.list ?? []
        setTeamMembers(list.map((l) => ({
          name: l.user_name ?? l.work_no,
          work_no: l.work_no,
          hours: Number(l.total_hours),
          status: l.status === 2 ? 'submitted' : 'draft',
        })))
      })
      .catch(() => {})
  }, [])

  const submitted = teamMembers.filter((m) => m.status !== 'not_started').length
  const total = teamMembers.length

  return (
    <Card bordered={false} className="shadow-sm mb-5 border border-emerald-100 bg-emerald-50/30" bodyStyle={{ padding: '16px 20px' }}>
      <div className="flex items-center gap-3 mb-3">
        <PencilSquareIcon className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-semibold text-emerald-700">團隊日報狀態</span>
        <Tag color={submitted === total ? 'success' : 'warning'} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
          {submitted}/{total} 人已提交
        </Tag>
        {submitted < total && (
          <span className="text-xs text-red-500 font-medium">⚠️ {total - submitted} 人未提交</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {teamMembers.map((m) => {
          const isSubmitted = m.status !== 'not_started'
          return (
            <div key={m.work_no} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${isSubmitted ? 'bg-white border-slate-100' : 'bg-red-50 border-red-100'}`}>
              <Avatar size={22} style={{ background: isSubmitted ? '#2563eb' : '#dc2626', fontSize: 9, fontWeight: 700 }}>
                {m.name[0]}
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-slate-700 truncate">{m.name}</div>
                {isSubmitted ? (
                  <div className="text-[10px] text-green-600 font-medium">{m.hours}h · {m.status === 'confirmed' ? '已確認' : '已提交'}</div>
                ) : (
                  <div className="text-[10px] text-red-500 font-medium">未提交</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Monthly Attendance Calendar Card ─────────────────────────────────────────
const MonthlyAttendanceCard: React.FC = () => {
  const navigate = useNavigate()
  const today = dayjs()
  const firstDay = today.startOf('month')
  const daysInMonth = today.daysInMonth()
  const startPad = (firstDay.day() + 6) % 7   // Mon-first offset
  const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日']

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
          <span className="font-semibold text-slate-700 text-sm">本月出勤日曆</span>
          <span className="text-xs text-slate-400 font-normal">{today.format('YYYY 年 M 月')}</span>
        </div>
      }
      extra={
        <span className="text-xs text-blue-500 cursor-pointer hover:underline" onClick={() => navigate('/daily-log')}>
          填寫日報 →
        </span>
      }
    >
      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: '已填報天數', value: workedDays, unit: '天', color: '#2563eb' },
          { label: '累計工時',   value: totalHours.toFixed(1), unit: 'h',  color: '#16a34a' },
          { label: '累計加班',   value: totalOT.toFixed(1),   unit: 'h',  color: '#d97706' },
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
                    ? <><div>{hours}h{log.ot > 0 ? ` (+${log.ot}h加班)` : ''}</div></>
                    : isFuture ? <div>未到</div>
                    : isWeekend ? <div>假日</div>
                    : <div className="text-red-300">未填寫</div>
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
                {noLog && <span className="text-[6px] text-red-400 font-bold">缺</span>}
              </div>
            </Tooltip>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 justify-center">
        <span className="text-[10px] text-slate-400">少</span>
        {[0, 4, 6, 8, 10].map((h, i) => <div key={i} className="w-3 h-3 rounded-sm" style={{ background: getHeatColor(h) }} />)}
        <span className="text-[10px] text-slate-400">多</span>
        <span className="text-[10px] text-slate-300 mx-1">|</span>
        <div className="w-3 h-3 rounded-sm ring-1 ring-red-200 bg-slate-100" />
        <span className="text-[10px] text-red-400">缺報</span>
      </div>
    </Card>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const DashboardPage: React.FC = () => {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const { indexData, name, isSupervisor, isManagerView } = useAppSelector((s) => s.auth)
  const isManager = isManagerView
  const setIsManager = (v: boolean) => dispatch(setManagerView(v))
  const [memberStats,  setMemberStats]  = useState<MemberWorkStat[]>([])
  const [myProjects,   setMyProjects]   = useState<ProjectListItem[]>([])
  const [todayLog,     setTodayLog]     = useState<BackendDailyLogSummary | null>(null)
  const [alertTasks,   setAlertTasks]   = useState<AlertTask[]>([])
  const [userStat,     setUserStat]     = useState<UserStatistical | null>(null)
  const [teamStat,     setTeamStat]     = useState<TeamStatistical | null>(null)

  useEffect(() => { dispatch(fetchIndexThunk()) }, [dispatch])

  useEffect(() => {
    // Load member stats (manager view)
    projectApi.memberStats()
      .then((res) => { if (Array.isArray(res.content)) setMemberStats(res.content as MemberWorkStat[]) })
      .catch(() => {})

    // Load personal project & task statistics
    authApi.getStatistical()
      .then((res) => { if (res.content) setUserStat(res.content) })
      .catch(() => {})

    // Load team statistics (supervisor view)
    authApi.getTeamStatistical()
      .then((res) => { if (res.content) setTeamStat(res.content) })
      .catch(() => {})

    // Load my active projects
    projectApi.list({ page: 1, size: 10, status: 5 })
      .then((res) => {
        const list = (res as { content?: { data_list?: ProjectListItem[] } }).content?.data_list ?? []
        setMyProjects(list)
      })
      .catch(() => {})

    // Load today's daily log (for DailyLogCard)
    const today = dayjs().format('YYYY-MM-DD')
    dailyLogApi.list({ page: 1, size: 1, start_date: today, end_date: today })
      .then((res) => {
        const list = (res as { content?: { list?: BackendDailyLogSummary[] } }).content?.list ?? []
        setTodayLog(list[0] ?? null)
      })
      .catch(() => {})

    // TODO: Load alert tasks from API when endpoint available
    // projectApi.alertTasks().then(res => setAlertTasks(res.content ?? [])).catch(() => {})
    setAlertTasks([])
  }, [])

  // ── 統計數據預計算 ─────────────────────────────────────────────────────────
  const pendingReview  = (indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)
  const taskInProg     = (indexData?.total_task_num?.doing_task   ?? 0) + (indexData?.total_task_num?.doing_duty    ?? 0)
  const taskUnstart    = (indexData?.total_task_num?.unstart_task ?? 0) + (indexData?.total_task_num?.unstart_duty  ?? 0)
  const taskDone       = userStat?.completed ?? 0
  const taskTotal      = (userStat?.total_projects ?? 0) + (userStat?.total_duties ?? 0)

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">歡迎回來，{name ?? '用戶'} 👋</h1>
          <p className="text-slate-400 text-sm mt-0.5">{dayjs().format('YYYY 年 M 月 D 日')} · 今天也加油！</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Manager view toggle — only shown to supervisors */}
          {isSupervisor && (
            <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
              <UsersIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500">主管視角</span>
              <Switch size="small" checked={isManager} onChange={setIsManager} />
            </div>
          )}
          {((indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)) > 0 && (
            <div className="hidden md:flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2">
              <FireIcon className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-orange-600 font-medium">有 {(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)} 個審核待處理</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 統計面板 ── */}
      {isManager && (
        <Row gutter={[16, 16]} className="mb-5">
          {/* 團隊專案 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm h-full" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <FolderIcon className="w-4 h-4 text-indigo-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">團隊專案</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-3">
                  <div className="text-2xl font-bold text-slate-700">{teamStat?.team_project.total ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">總專案數</div>
                </div>
                <div className="flex-1 text-center px-3">
                  <div className="text-2xl font-bold text-blue-600">{teamStat?.team_project.in_progress ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">進行中</div>
                </div>
                <div className="flex-1 text-center pl-3">
                  <div className="text-2xl font-bold text-green-600">{teamStat?.team_project.completed ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已完結</div>
                </div>
              </div>
            </Card>
          </Col>

          {/* 團隊任務 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm h-full" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <ClipboardDocumentListIcon className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">團隊任務</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-2">
                  <div className="text-xl font-bold text-blue-600">{teamStat?.team_task.in_progress ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">進行中</div>
                </div>
                <div className="flex-1 text-center px-2">
                  <div className={`text-xl font-bold ${(teamStat?.team_task.overdue ?? 0) > 0 ? 'text-red-500' : 'text-slate-400'}`}>{teamStat?.team_task.overdue ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已超時</div>
                </div>
                <div className="flex-1 text-center px-2">
                  <div className={`text-xl font-bold ${(teamStat?.team_task.urgent ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>{teamStat?.team_task.urgent ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">臨期</div>
                </div>
                <div className="flex-1 text-center pl-2">
                  <div className="text-xl font-bold text-slate-500">{teamStat?.team_task.not_started ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">未開始</div>
                </div>
              </div>
            </Card>
          </Col>

          {/* 待處理 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm h-full" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                  <ClockIcon className="w-4 h-4 text-orange-500" />
                </div>
                <span className="text-sm font-semibold text-slate-600">待處理</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-3">
                  <div className={`text-2xl font-bold ${(teamStat?.pending.review ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                    {teamStat?.pending.review ?? 0}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">待審核</div>
                </div>
                <div className="flex-1 text-center pl-3">
                  <div className={`text-2xl font-bold ${(teamStat?.pending.progress_update ?? 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                    {teamStat?.pending.progress_update ?? 0}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">進度更新</div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 個人統計（工程師固定；主管關閉視角後顯示） ── */}
      {!isManager && (
        <Row gutter={[16, 16]} className="mb-5">
          {/* 專案統計 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FolderIcon className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">專案統計</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-3">
                  <div className="text-2xl font-bold text-slate-700">{userStat?.project_total ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">總專案數</div>
                </div>
                <div className="flex-1 text-center px-3">
                  <div className="text-2xl font-bold text-blue-600">{userStat?.project_in_progress ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">進行中</div>
                </div>
                <div className="flex-1 text-center pl-3">
                  <div className="text-2xl font-bold text-green-600">{userStat?.project_completed ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已完結</div>
                </div>
              </div>
            </Card>
          </Col>
          {/* 任務統計 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                  <ClipboardDocumentListIcon className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-sm font-semibold text-slate-600">任務統計</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-2">
                  <div className="text-2xl font-bold text-slate-700">{taskTotal}</div>
                  <div className="text-xs text-slate-400 mt-0.5">總計</div>
                </div>
                <div className="flex-1 text-center px-2">
                  <div className="text-2xl font-bold text-blue-600">{taskInProg}</div>
                  <div className="text-xs text-slate-400 mt-0.5">進行中</div>
                </div>
                <div className="flex-1 text-center px-2">
                  <div className="text-2xl font-bold text-slate-400">{taskUnstart}</div>
                  <div className="text-xs text-slate-400 mt-0.5">未開始</div>
                </div>
                <div className="flex-1 text-center pl-2">
                  <div className="text-2xl font-bold text-green-600">{taskDone}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已完成</div>
                </div>
              </div>
            </Card>
          </Col>
          {/* 待處理 */}
          <Col xs={24} md={8}>
            <Card className="shadow-sm" styles={{ body: { padding: '16px 20px' } }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                  <ClockIcon className="w-4 h-4 text-orange-500" />
                </div>
                <span className="text-sm font-semibold text-slate-600">待處理</span>
              </div>
              <div className="flex divide-x divide-slate-100">
                <div className="flex-1 text-center pr-3">
                  <div className={`text-2xl font-bold ${(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0) > 0 ? 'text-orange-500' : 'text-slate-400'}`}>
                    {(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">待審核</div>
                </div>
                <div className="flex-1 text-center pl-3">
                  <div className={`text-2xl font-bold ${(indexData?.total_progress_record_num ?? 0) > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                    {indexData?.total_progress_record_num ?? 0}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">未讀進度</div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* Daily Log Status — hidden in supervisor view; supervisor in personal mode sees it with dismiss option */}
      {!isManager && <DailyLogCard canDismiss={isSupervisor} todayLog={todayLog} />}

      {/* Alert Bar */}
      <AlertBar pendingReview={(indexData?.total_awaiting_review_num?.project ?? 0) + (indexData?.total_awaiting_review_num?.duty ?? 0)} alertTasks={alertTasks} />

      {/* Manager Section */}
      {isManager && <ManagerSection memberStats={memberStats} />}

      <Row gutter={[16, 16]}>
        {/* Left */}
        <Col xs={24} lg={15}>
          {/* Activity bar chart */}
          <Card
            bordered={false} className="shadow-sm mb-4"
            title={<span className="font-semibold text-slate-700 text-sm">本週活動概覽</span>}
            extra={<span className="text-xs text-slate-400">{dayjs().startOf('week').format('MM/DD')} – {dayjs().endOf('week').format('MM/DD')}</span>}
            bodyStyle={{ paddingTop: 8 }}
          >
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={[]} barCategoryGap="35%">
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="project" name="專案更新" fill="#bfdbfe" radius={[4,4,0,0]} />
                <Bar dataKey="duty"    name="任務更新" fill="#2563eb" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#bfdbfe]" /><span className="text-xs text-slate-400">專案更新</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#2563eb]" /><span className="text-xs text-slate-400">任務更新</span></div>
            </div>
          </Card>

          {!isManager && (
            <Card
              bordered={false} className="shadow-sm"
              title={<span className="font-semibold text-slate-700 text-sm">我的專案</span>}
              extra={<a href="/projects" className="text-xs text-blue-500 hover:underline">查看全部 →</a>}
              bodyStyle={{ padding: '0 24px 16px' }}
            >
              {myProjects.length === 0
                ? <Empty description="暫無進行中的專案" className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                : myProjects.map((p) => {
                  const daysLeft = p.expected_end_date
                    ? dayjs(p.expected_end_date).diff(dayjs(), 'day')
                    : 999
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 -mx-4 px-4 rounded-lg cursor-pointer transition-colors"
                      onClick={() => navigate(`/projects/${p.id}`)}
                    >
                      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[(p.priority ?? 1) - 1] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-slate-700 text-sm truncate">{p.project_nm}</span>
                          <Tag color={STATUS_COLOR[p.status]} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>
                            {STATUS_LABEL[p.status]}
                          </Tag>
                        </div>
                        <Progress
                          percent={p.progress ?? 0} size="small" showInfo={false}
                          strokeColor={(p.progress ?? 0) >= 80 ? '#16a34a' : (p.progress ?? 0) >= 40 ? '#2563eb' : '#94a3b8'}
                          trailColor="#f1f5f9"
                        />
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400 hidden sm:block">{p.progress ?? 0}%</span>
                        <DaysLeftBadge days={daysLeft} />
                      </div>
                    </div>
                  )
                })
              }
            </Card>
          )}
        </Col>

        {/* Right: attendance calendar (personal only) + activity feed */}
        <Col xs={24} lg={9}>
          {!isManager && <MonthlyAttendanceCard />}
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="font-semibold text-slate-700 text-sm">近期動態</span>}
            bodyStyle={{ padding: '0 16px 12px' }}
          >
            <Empty description="動態功能開發中" className="py-6" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default DashboardPage
