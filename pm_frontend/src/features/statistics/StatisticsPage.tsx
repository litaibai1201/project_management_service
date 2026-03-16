/**
 * StatisticsPage — 工作量統計 + 成員管理（合併頁面）
 * Tab 1 工時分析：工時趨勢折線圖 · 任務完成柱狀圖 · 超時分析橫條圖 · 個人餅圖
 * Tab 2 進度報告：日/週/月/季/年快捷切換 + 每位工程師進度彙整報告卡
 * Tab 3 個人工時分析：專案/BU/分類餅圖 + 加班統計
 * Tab 4 成員總覽：部門分組卡片 + 成員詳情抽屜（工時/專案/任務）
 */
import React, { useEffect, useState, useMemo } from 'react'
import {
  Card, Row, Col, Table, Tag, Avatar, DatePicker,
  Skeleton, Button, Dropdown, Tabs, Collapse, Timeline, Badge, Tooltip,
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
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import { projectApi } from '@/api/project.api'
import { groupApi } from '@/api/group.api'
import { MemberWorkStat } from '@/types/api.types'
import { PROJECT_STATUS_MAP, DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import dayjs, { Dayjs } from 'dayjs'

const IS_DEV = import.meta.env.DEV

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

// ─── Mock project-hours distribution per member ───────────────────────────────
const PIE_PALETTE = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#db2777']
const MOCK_PROJECT_HOURS: Record<string, { name: string; hours: number }[]> = {
  DEV001: [
    { name: 'ERP系統改版',  hours: 86 },
    { name: '行動端APP',    hours: 42 },
    { name: '報表優化',     hours: 35 },
    { name: '其他',         hours: 23 },
  ],
  DEV002: [
    { name: 'ERP系統改版',  hours: 78 },
    { name: '客服平台',     hours: 52 },
    { name: '其他',         hours: 22 },
  ],
  DEV003: [
    { name: 'ERP系統改版',  hours: 62 },
    { name: '行動端APP',    hours: 40 },
    { name: '其他',         hours: 32 },
  ],
  DEV004: [
    { name: '行動端APP',    hours: 72 },
    { name: '報表優化',     hours: 30 },
    { name: '其他',         hours: 16 },
  ],
  DEV005: [
    { name: '客服平台',     hours: 58 },
    { name: '行動端APP',    hours: 24 },
    { name: '其他',         hours: 16 },
  ],
}

// ─── Progress Report Mock Data ─────────────────────────────────────────────────

interface CompletedTask  { id: string; name: string; project: string; type: 'function'|'duty'; completed_at: string; hours: number }
interface InProgressTask { id: string; name: string; project: string; progress: number; days_left: number; status: 'normal'|'urgent'|'overdue' }
interface ProgressFileInfo { name: string; url: string; size?: number }
interface ProgressUpdate { id: string; task_nm: string; project?: string; content: string; hours: number; date: string; progress_pct: number; files?: ProgressFileInfo[]; images?: ProgressFileInfo[] }
interface OverdueTask    { id: string; name: string; project: string; days_overdue: number }

interface ReportMember {
  work_no:        string
  name:           string
  period_hours:   number
  updates_count:  number
  completed:      CompletedTask[]
  in_progress:    InProgressTask[]
  updates:        ProgressUpdate[]
  overdue:        OverdueTask[]
}

// Generates mock report data (content is fixed; in real use it would be filtered by period)
const MOCK_REPORTS: ReportMember[] = [
  {
    work_no: 'DEV001', name: '王小明', period_hours: 31, updates_count: 3,
    completed: [
      { id: 'f001', name: '採購模塊重構',      project: 'ERP核心系統改版', type: 'function', completed_at: '2026-03-08', hours: 48 },
      { id: 'd001', name: '修復線上登入超時問題', project: '—',            type: 'duty',     completed_at: '2026-03-09', hours: 6  },
    ],
    in_progress: [
      { id: 'f002', name: '倉庫模塊開發',       project: 'ERP核心系統改版', progress: 65, days_left: -1, status: 'overdue' },
      { id: 'd004', name: '部署測試環境 Jenkins',project: '—',             progress: 80, days_left:  1, status: 'urgent'  },
    ],
    updates: [
      { id: 'u1', task_nm: '倉庫模塊開發',      project: 'ERP核心系統改版', content: '倉庫入庫、出庫流程已開發完成，庫存盤點功能 50% 完成，本週重點推進庫存報表模塊。', hours: 24, date: '2026-03-10', progress_pct: 65,
        images: [
          { name: '倉庫流程截圖.png', url: 'https://placehold.co/800x600/2563eb/fff?text=倉庫流程', size: 245000 },
          { name: '入庫介面.png', url: 'https://placehold.co/800x600/16a34a/fff?text=入庫介面', size: 198000 },
        ],
        files: [{ name: '倉庫模塊設計文檔.pdf', url: '#', size: 1250000 }],
      },
      { id: 'u2', task_nm: '部署測試環境 Jenkins',                          content: 'Jenkins 流水線已配置完成，前端和後端自動構建已驗證通過，正在配置自動化測試觸發器。', hours: 8,  date: '2026-03-10', progress_pct: 80,
        files: [{ name: 'Jenkins配置說明.docx', url: '#', size: 89000 }],
      },
      { id: 'u3', task_nm: '修復線上登入超時問題',                           content: '已定位到問題根因：線程池配置不合理導致請求積壓，已在預發環境修復，待部署生產。', hours: 4,  date: '2026-03-09', progress_pct: 60,
        images: [{ name: '錯誤日誌截圖.png', url: 'https://placehold.co/800x400/dc2626/fff?text=ErrorLog', size: 156000 }],
      },
    ],
    overdue: [
      { id: 'f002', name: '倉庫模塊開發', project: 'ERP核心系統改版', days_overdue: 1 },
    ],
  },
  {
    work_no: 'DEV002', name: '李大華', period_hours: 24, updates_count: 2,
    completed: [],
    in_progress: [
      { id: 'f002b', name: '倉庫模塊開發',     project: 'ERP核心系統改版', progress: 65, days_left: -1, status: 'overdue' },
      { id: 'd003',  name: '優化採購單列表查詢', project: '—',             progress: 35, days_left:  4, status: 'normal'  },
    ],
    updates: [
      { id: 'u4', task_nm: '倉庫模塊開發',      project: 'ERP核心系統改版', content: '完成了倉庫基礎數據（倉庫、貨位、商品）管理功能，入庫流程開發中。', hours: 20, date: '2026-03-08', progress_pct: 40 },
      { id: 'u5', task_nm: '優化採購單列表查詢',                            content: '分析了慢查詢日誌，確認缺少複合索引，正在設計優化方案。',            hours: 3,  date: '2026-03-08', progress_pct: 35 },
    ],
    overdue: [
      { id: 'f002b', name: '倉庫模塊開發', project: 'ERP核心系統改版', days_overdue: 1 },
    ],
  },
  {
    work_no: 'DEV003', name: '張美玲', period_hours: 22, updates_count: 1,
    completed: [
      { id: 'f004', name: '前端 UI 重設計', project: 'ERP核心系統改版', type: 'function', completed_at: '2026-03-07', hours: 28 },
    ],
    in_progress: [
      { id: 'f005', name: '移動端適配', project: 'ERP核心系統改版', progress: 0, days_left: 30, status: 'normal' },
    ],
    updates: [
      { id: 'u6', task_nm: '前端 UI 重設計', project: 'ERP核心系統改版', content: '所有頁面重設計完成，已通過 UI 走查，準備提交完結審核。', hours: 22, date: '2026-03-07', progress_pct: 80 },
    ],
    overdue: [],
  },
  {
    work_no: 'DEV004', name: '陳建國', period_hours: 20, updates_count: 1,
    completed: [],
    in_progress: [
      { id: 'f007', name: 'iOS 客戶端開發', project: '行動端 APP 2.0', progress: 35, days_left: 2, status: 'urgent' },
    ],
    updates: [
      { id: 'u7', task_nm: 'iOS 客戶端開發', project: '行動端 APP 2.0', content: '完成了首頁、列表頁、詳情頁三個核心頁面，正在開發推送通知功能。', hours: 20, date: '2026-03-09', progress_pct: 35 },
    ],
    overdue: [],
  },
  {
    work_no: 'DEV005', name: '林小芸', period_hours: 20, updates_count: 1,
    completed: [],
    in_progress: [
      { id: 'f008', name: 'Android 客戶端', project: '行動端 APP 2.0', progress: 22, days_left: 2, status: 'urgent' },
      { id: 'd005', name: '編寫單元測試',    project: '—',              progress: 50, days_left: 9, status: 'normal' },
    ],
    updates: [
      { id: 'u8', task_nm: 'Android 客戶端', project: '行動端 APP 2.0', content: '完成了應用骨架和導航框架，首頁開發中，預計下週完成核心頁面。', hours: 20, date: '2026-03-09', progress_pct: 22 },
    ],
    overdue: [],
  },
]

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
      m.weekly_hours.forEach((w) => {
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
    ['─── 進度更新明細 ───'],
    ['姓名', '任務名稱', '所屬專案', '進度(%)', '工時(h)', '更新日期', '更新內容'],
    ...reports.flatMap((r) =>
      r.updates.map((u) => [r.name, u.task_nm, u.project ?? '—', String(u.progress_pct), String(u.hours), u.date, u.content])
    ),
  ]
  exportCSV(`進度報告_${periodLabel}_${dayjs().format('YYYY-MM-DD')}.csv`, rows)
}

// ─── Report Member Card ────────────────────────────────────────────────────────
const MemberReportCard: React.FC<{ report: ReportMember }> = ({ report }) => {
  const avatarBg = report.overdue.length > 0 ? '#fef2f2' : '#eff6ff'
  const avatarColor = report.overdue.length > 0 ? '#dc2626' : '#2563eb'

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
    <Collapse
      defaultActiveKey={[]}
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
          {/* ─── Progress Updates ─────────────────────────────── */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-3.5 rounded bg-blue-500" />
              <span className="text-xs font-semibold text-slate-600">進度更新記錄</span>
              <Badge count={report.updates.length} color="#2563eb" />
            </div>
            {report.updates.length === 0 ? (
              <p className="text-xs text-slate-300 pl-3">本期無進度更新記錄</p>
            ) : (
              <Timeline
                className="ml-2"
                items={report.updates.map((u) => ({
                  dot: (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                      style={{ background: '#2563eb', marginTop: 2 }}
                    >
                      {u.progress_pct}%
                    </div>
                  ),
                  children: (
                    <div className="pb-1">
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-1">
                        <span className="text-xs font-semibold text-slate-700">{u.task_nm}</span>
                        {u.project && (
                          <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }} color="blue">
                            {u.project}
                          </Tag>
                        )}
                        <span className="text-xs text-slate-300">{u.date}</span>
                        <span className="text-xs text-slate-400 ml-auto">耗時 <strong className="text-blue-600">{u.hours}h</strong></span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        {u.content}
                      </p>
                      <AttachmentPreview files={u.files} images={u.images} />
                    </div>
                  ),
                }))}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ─── Completed Tasks ─────────────────────────────── */}
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
                        <div className="text-xs font-medium text-slate-700 truncate">{t.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] text-slate-400">{t.project}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-slate-400">{t.completed_at}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <span className="text-[10px] text-green-600 font-medium">{t.hours}h</span>
                        </div>
                      </div>
                      <Tag
                        color={t.type === 'function' ? 'blue' : 'purple'}
                        style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px', flexShrink: 0 }}
                      >
                        {t.type === 'function' ? '功能' : '任務'}
                      </Tag>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── In-Progress Tasks ───────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-3.5 rounded bg-amber-500" />
                <span className="text-xs font-semibold text-slate-600">進行中任務</span>
                <Badge count={report.in_progress.length} color="#d97706" />
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
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-medium text-slate-700 flex-1 truncate">{t.name}</span>
                          {t.status === 'overdue' && (
                            <span className="text-[10px] text-red-500 font-semibold flex-shrink-0">
                              超期 {Math.abs(t.days_left)} 天
                            </span>
                          )}
                          {t.status === 'urgent' && (
                            <span className="text-[10px] text-orange-500 font-semibold flex-shrink-0">
                              剩 {t.days_left} 天
                            </span>
                          )}
                          {t.status === 'normal' && (
                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                              剩 {t.days_left} 天
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-white rounded-full h-1.5 overflow-hidden border border-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${t.progress}%`,
                                background: t.status === 'overdue' ? '#f87171' : t.status === 'urgent' ? '#fb923c' : '#60a5fa',
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 flex-shrink-0 w-7 text-right">{t.progress}%</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1">{t.project}</div>
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
  )
}

// ─── Progress Report Tab ───────────────────────────────────────────────────────
const ProgressReportTab: React.FC = () => {
  const [period,      setPeriod]      = useState<PeriodKey>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)

  const currentPreset = PERIOD_PRESETS.find((p) => p.key === period)
  const range  = period === 'custom' && customRange ? customRange : (currentPreset?.range() ?? [dayjs().startOf('week'), dayjs().endOf('week')])
  const dateLabel = `${range[0].format('YYYY/MM/DD')} — ${range[1].format('YYYY/MM/DD')}`
  const periodLabel = period === 'custom' ? dateLabel : (currentPreset?.label ?? '') + ' ' + dateLabel

  // In real use, filter MOCK_REPORTS by the selected period.
  // For mock purposes we show all data with the period label.
  const reports = MOCK_REPORTS

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
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
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
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
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
        reports.map((r) => <MemberReportCard key={r.work_no} report={r} />)
      )}
    </div>
  )
}

// ─── Personal Work Analysis Tab ──────────────────────────────────────────────
const MOCK_PERSONAL_PROJECT_DIST = [
  { name: 'ERP核心系統改版', hours: 86, color: '#2563eb' },
  { name: '行動端APP 2.0', hours: 42, color: '#7c3aed' },
  { name: '報表系統優化', hours: 35, color: '#16a34a' },
  { name: '其他', hours: 23, color: '#d97706' },
]
const MOCK_BU_DIST = [
  { name: '製造部', hours: 68, color: '#2563eb' },
  { name: '品保部', hours: 35, color: '#16a34a' },
  { name: '業務部', hours: 28, color: '#d97706' },
  { name: '資訊部', hours: 22, color: '#7c3aed' },
  { name: '其他', hours: 15, color: '#94a3b8' },
]
const MOCK_CATEGORY_DIST = [
  { name: '專案工作', hours: 120, color: '#2563eb' },
  { name: 'CR/AR', hours: 18, color: '#16a34a' },
  { name: '教育訓練', hours: 8, color: '#d97706' },
  { name: '會議', hours: 12, color: '#dc2626' },
  { name: '臨時任務', hours: 22, color: '#7c3aed' },
  { name: '其他', hours: 6, color: '#94a3b8' },
]
const MOCK_OVERTIME_WEEKLY = [
  { week: 'W06', normal: 38, overtime: 4 },
  { week: 'W07', normal: 40, overtime: 2 },
  { week: 'W08', normal: 36, overtime: 6 },
  { week: 'W09', normal: 39, overtime: 3 },
  { week: 'W10', normal: 37, overtime: 5 },
]
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
                            <RTooltip formatter={(v: number) => [`${v}h`, '工時']} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
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
  // Role: managers see all tabs; regular employees only see "成員總覽"
  const isManager = IS_DEV ? true : false  // TODO: replace with real role check

  const [stats,      setStats]      = useState<MemberWorkStat[]>([])
  const [isLoading,  setIsLoading]  = useState(false)
  const [selected,   setSelected]   = useState<string | null>(null)

  const loadStats = async () => {
    setIsLoading(true)
    try {
      const res = await projectApi.memberStats()
      setStats(res.content as MemberWorkStat[])
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadStats() }, [])

  const totals = useMemo(() => ({
    hours:    stats.reduce((s, m) => s + m.total_hours, 0),
    done:     stats.reduce((s, m) => s + m.completed_tasks, 0),
    overdue:  stats.reduce((s, m) => s + m.overdue_tasks, 0),
    inProg:   stats.reduce((s, m) => s + m.in_progress_tasks, 0),
  }), [stats])

  const lineData = useMemo(() => {
    if (stats.length === 0) return []
    const weeks = stats[0]?.weekly_hours?.map((w) => w.week) ?? []
    return weeks.map((week) => {
      const row: Record<string, unknown> = { week }
      stats.forEach((m) => { row[m.name] = m.weekly_hours.find((w) => w.week === week)?.hours ?? 0 })
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
    const projectData = MOCK_PROJECT_HOURS[workNo] ?? MOCK_PERSONAL_PROJECT_DIST
    const totalProjHours = projectData.reduce((s: number, d: { hours: number }) => s + d.hours, 0)
    const totalOvertime = MOCK_OVERTIME_WEEKLY.reduce((s, d) => s + d.overtime, 0)
    const totalNormal   = MOCK_OVERTIME_WEEKLY.reduce((s, d) => s + d.normal, 0)
    const totalHrs      = totalNormal + totalOvertime
    return (
      <div className="space-y-4">
        {/* 4 personal stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '總工時',   value: totalHrs,     unit: 'h',  color: '#2563eb', bg: '#eff6ff', icon: <ClockIcon className="w-4 h-4 text-blue-500" /> },
            { label: '正常工時', value: totalNormal,  unit: 'h',  color: '#16a34a', bg: '#f0fdf4', icon: <SunIcon className="w-4 h-4 text-green-500" /> },
            { label: '加班工時', value: totalOvertime, unit: 'h', color: '#d97706', bg: '#fff7ed', icon: <MoonIcon className="w-4 h-4 text-orange-500" /> },
            { label: '加班佔比', value: Math.round((totalOvertime / totalHrs) * 100), unit: '%', color: '#dc2626', bg: '#fef2f2', icon: <ExclamationTriangleIcon className="w-4 h-4 text-red-500" /> },
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
                  <RTooltip formatter={(v: number) => [`${v}h`, '工時']} contentStyle={{ borderRadius: 8, fontSize: 11, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {projectData.map((d: { name: string; hours: number }, i: number) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="text-slate-400 font-medium">{d.hours}h</span>
                    <span className="text-slate-300 w-8 text-right">{Math.round((d.hours / totalProjHours) * 100)}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">BU / 單位工時分佈</span>} bodyStyle={{ paddingTop: 4 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={MOCK_BU_DIST} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {MOCK_BU_DIST.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <RTooltip formatter={(v: number) => [`${v}h`, '工時']} contentStyle={{ borderRadius: 8, fontSize: 11, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {MOCK_BU_DIST.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="text-slate-400 font-medium">{d.hours}h</span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card bordered={false} className="shadow-sm h-full" title={<span className="text-sm font-semibold text-slate-700">工作分類分佈</span>} bodyStyle={{ paddingTop: 4 }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={MOCK_CATEGORY_DIST} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {MOCK_CATEGORY_DIST.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <RTooltip formatter={(v: number) => [`${v}h`, '工時']} contentStyle={{ borderRadius: 8, fontSize: 11, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-1">
                {MOCK_CATEGORY_DIST.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-slate-600 truncate flex-1">{d.name}</span>
                    <span className="text-slate-400 font-medium">{d.hours}h</span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Row>

        {/* Normal vs Overtime stacked bar */}
        <Card bordered={false} className="shadow-sm"
          title={<span className="text-sm font-semibold text-slate-700">正常 vs 加班工時（近5週）{memberName ? `— ${memberName}` : ''}</span>}
          bodyStyle={{ paddingTop: 8 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MOCK_OVERTIME_WEEKLY} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="h" />
              <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                formatter={(v: number, name: string) => [`${v}h`, name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="normal" name="正常工時" stackId="a" fill="#93c5fd" />
              <Bar dataKey="overtime" name="加班工時" stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]} />
              <ReferenceLine y={40} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: '標準 40h', position: 'right', fontSize: 10, fill: '#94a3b8' }} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
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
          {renderPersonalDetail('DEV001', '')}
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
          onRow={(r) => ({ onClick: () => setSelected(r.work_no === selected ? null : r.work_no), style: { cursor: 'pointer' } })}
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
      children: <ProgressReportTab />,
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
    <div className="p-6 max-w-[1400px] mx-auto">
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
        {/* Global time filter — only relevant for manager analysis tabs */}
        {isManager && (
          <RangePicker
            size="small"
            defaultValue={[dayjs().subtract(5, 'week'), dayjs()]}
            style={{ borderRadius: 8 }}
          />
        )}
      </div>

      <Tabs
        type="card"
        defaultActiveKey={isManager ? 'analysis' : 'members'}
        items={tabItems}
      />
    </div>
  )
}

export default StatisticsPage
