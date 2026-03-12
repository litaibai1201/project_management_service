/**
 * DailyLogPage — 個人工作日誌
 * 三個視圖模式：日視圖（填寫/查看）、週視圖（表格匯總）、月視圖（日曆熱力圖）
 */
import React, { useState, useMemo } from 'react'
import {
  Card, Button, Tag, Progress, Modal, Form, Select, Input, InputNumber,
  Switch, Upload, Segmented, Tooltip, Empty, Badge, Popconfirm,
  AutoComplete, Alert,
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
import dayjs, { Dayjs } from 'dayjs'

const IS_DEV = import.meta.env.DEV

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

// ─── Mock Projects / Duties for select ──────────────────────────────────────
const MOCK_PROJECTS_OPTS = [
  { id: 'p1', name: 'ERP核心系統改版' },
  { id: 'p2', name: '行動端APP 2.0' },
  { id: 'p3', name: '報表系統優化' },
  { id: 'p4', name: '客服平台升級' },
]
const MOCK_FUNCTIONS_MAP: Record<string, { id: string; name: string }[]> = {
  p1: [
    { id: 'f001', name: '採購模塊重構' }, { id: 'f002', name: '倉庫模塊開發' },
    { id: 'f003', name: '應收應付模塊' }, { id: 'f004', name: '前端 UI 重設計' },
  ],
  p2: [
    { id: 'f007', name: 'iOS 客戶端開發' }, { id: 'f008', name: 'Android 客戶端' },
  ],
  p3: [{ id: 'f009', name: '報表引擎重寫' }],
  p4: [{ id: 'f010', name: '客服 Chat 模塊' }],
}
const MOCK_DUTIES_OPTS = [
  { id: 'd001', name: '修復線上登入超時問題' },
  { id: 'd003', name: '優化採購單列表查詢' },
  { id: 'd004', name: '部署測試環境 Jenkins' },
  { id: 'd005', name: '編寫單元測試' },
]
const BU_OPTIONS = ['製造部', '品保部', '資訊部', '業務部', '人資部', '財務部', '研發部', '客服中心']

// ─── Mock Daily Logs ────────────────────────────────────────────────────────
function generateMockLogs(): Record<string, DailyLog> {
  const logs: Record<string, DailyLog> = {}
  const today = dayjs().format('YYYY-MM-DD')
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
  const twoDaysAgo = dayjs().subtract(2, 'day').format('YYYY-MM-DD')

  logs[today] = {
    log_id: 'log-today', work_no: 'DEV001', log_date: today,
    total_hours: 5.5, overtime_hours: 0, status: 'draft',
    entries: [
      { entry_id: 'e1', work_category: 'project', project_id: 'p1', project_nm: 'ERP核心系統改版', function_id: 'f002', function_nm: '倉庫模塊開發', bu_unit: '製造部', description: '倉庫入庫流程開發，完成入庫單據生成邏輯及審核流程', hours: 3, is_overtime: false },
      { entry_id: 'e2', work_category: 'project', project_id: 'p1', project_nm: 'ERP核心系統改版', function_id: 'f002', function_nm: '倉庫模塊開發', bu_unit: '製造部', description: '參加倉庫模塊 Code Review，修復 3 個審查問題', hours: 1.5, is_overtime: false },
      { entry_id: 'e3', work_category: 'meeting', description: '每日站會 + 週進度回報', hours: 0.5, is_overtime: false },
      { entry_id: 'e4', work_category: 'training', description: '參加 React 18 新特性技術分享會', hours: 0.5, is_overtime: false },
    ],
  }

  logs[yesterday] = {
    log_id: 'log-yesterday', work_no: 'DEV001', log_date: yesterday,
    total_hours: 9.5, overtime_hours: 1.5, status: 'submitted', submitted_at: `${yesterday} 18:30:00`,
    entries: [
      { entry_id: 'e5', work_category: 'project', project_id: 'p1', project_nm: 'ERP核心系統改版', function_id: 'f001', function_nm: '採購模塊重構', bu_unit: '製造部', description: '完成採購模塊後端接口重構，統一錯誤處理及分頁查詢', hours: 4, is_overtime: false },
      { entry_id: 'e6', work_category: 'cr_ar', project_id: 'p1', project_nm: 'ERP核心系統改版', bu_unit: '品保部', description: '處理 CR-2026-0311：採購單列表查詢慢查詢優化，添加複合索引', hours: 2, is_overtime: false },
      { entry_id: 'e7', work_category: 'meeting', description: '參加跨部門專案週會，匯報 ERP 改版進度', hours: 1, is_overtime: false },
      { entry_id: 'e8', work_category: 'duty', duty_id: 'd001', duty_nm: '修復線上登入超時問題', description: '排查線程池配置問題，提交修復 PR 並完成自測', hours: 1.5, is_overtime: true, overtime_hours: 1.5 },
      { entry_id: 'e9', work_category: 'other', description: '整理本週技術文檔，更新 Wiki 頁面', hours: 1, is_overtime: false },
    ],
  }

  logs[twoDaysAgo] = {
    log_id: 'log-2days', work_no: 'DEV001', log_date: twoDaysAgo,
    total_hours: 8.0, overtime_hours: 0, status: 'confirmed', submitted_at: `${twoDaysAgo} 17:45:00`, confirmed_by: '主管A',
    entries: [
      { entry_id: 'e10', work_category: 'project', project_id: 'p1', project_nm: 'ERP核心系統改版', function_id: 'f002', function_nm: '倉庫模塊開發', bu_unit: '製造部', description: '倉庫出庫流程開發，完成出庫單據與庫存扣減邏輯', hours: 5, is_overtime: false },
      { entry_id: 'e11', work_category: 'project', project_id: 'p2', project_nm: '行動端APP 2.0', function_id: 'f007', function_nm: 'iOS 客戶端開發', bu_unit: '業務部', description: '協助 iOS 端 API 對接問題排查', hours: 1.5, is_overtime: false },
      { entry_id: 'e12', work_category: 'training', description: 'OJT：新人 Git Flow 流程教學', hours: 1, is_overtime: false },
      { entry_id: 'e13', work_category: 'meeting', description: '每日站會', hours: 0.5, is_overtime: false },
    ],
  }
  return logs
}

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

// ─── Entry Card ─────────────────────────────────────────────────────────────
const EntryCard: React.FC<{
  entry: DailyLogEntry; index: number; onEdit: () => void; onDelete: () => void; readOnly?: boolean
}> = ({ entry, onEdit, onDelete, readOnly }) => {
  const cat = CATEGORY_MAP[entry.work_category]
  return (
    <div className="flex gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: cat?.color + '18', color: cat?.color }}>
          {cat?.icon}
        </div>
        {/* connector line */}
        <div className="w-px flex-1 bg-slate-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Tag color={cat?.color} style={{ fontSize: 11, padding: '0 6px', margin: 0, lineHeight: '18px' }}>
            {cat?.label}
          </Tag>
          {entry.project_nm && (
            <span className="text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
              {entry.project_nm}
            </span>
          )}
          {(entry.function_nm || entry.duty_nm) && (
            <span className="text-xs text-slate-500">
              → {entry.function_nm || entry.duty_nm}
            </span>
          )}
          {entry.bu_unit && (
            <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">
              {entry.bu_unit}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs font-semibold" style={{ color: entry.is_overtime ? '#d97706' : '#2563eb' }}>
            <ClockIcon className="w-3.5 h-3.5" />
            {entry.hours}h
            {entry.is_overtime && (
              <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>
                加班
              </Tag>
            )}
          </span>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed bg-white rounded-lg px-3 py-2 border border-slate-100 shadow-sm">
          {entry.description}
        </p>

        {/* Actions */}
        {!readOnly && (
          <div className="flex gap-1.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button size="small" type="text" icon={<PencilSquareIcon className="w-3.5 h-3.5" />}
              className="text-slate-400 hover:!text-blue-500" onClick={onEdit}>
              編輯
            </Button>
            <Popconfirm title="確定刪除此條目？" onConfirm={onDelete} okText="刪除" cancelText="取消" placement="topRight">
              <Button size="small" type="text" icon={<TrashIcon className="w-3.5 h-3.5" />}
                className="text-slate-400 hover:!text-red-500" danger>
                刪除
              </Button>
            </Popconfirm>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Week View ──────────────────────────────────────────────────────────────
const WeekView: React.FC<{ weekStart: Dayjs; logs: Record<string, DailyLog> }> = ({ weekStart, logs }) => {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'))
  const dayLabels = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']

  // Build category-rows
  const categoryRows = WORK_CATEGORIES.map((cat) => {
    const cells = days.map((d) => {
      const log = logs[d.format('YYYY-MM-DD')]
      if (!log) return 0
      return log.entries.filter((e) => e.work_category === cat.value).reduce((s, e) => s + e.hours, 0)
    })
    return { ...cat, cells, total: cells.reduce((s, v) => s + v, 0) }
  })

  const normalHours = days.map((d) => {
    const log = logs[d.format('YYYY-MM-DD')]
    return log ? log.total_hours - log.overtime_hours : 0
  })
  const overtimeHours = days.map((d) => {
    const log = logs[d.format('YYYY-MM-DD')]
    return log ? log.overtime_hours : 0
  })
  const totalPerDay = days.map((d) => {
    const log = logs[d.format('YYYY-MM-DD')]
    return log ? log.total_hours : 0
  })
  const statusPerDay = days.map((d) => {
    const log = logs[d.format('YYYY-MM-DD')]
    return log?.status
  })

  const weekTotalNormal = normalHours.reduce((s, v) => s + v, 0)
  const weekTotalOT = overtimeHours.reduce((s, v) => s + v, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-3 py-2.5 text-slate-500 font-semibold w-28 border-b border-slate-200">分類</th>
            {days.map((d, i) => {
              const isToday = d.isSame(dayjs(), 'day')
              const isWeekend = i >= 5
              return (
                <th key={i} className={`text-center px-2 py-2.5 border-b border-slate-200 ${isToday ? 'bg-blue-50' : ''}`}>
                  <div className={`text-[10px] font-medium ${isWeekend ? 'text-orange-400' : 'text-slate-400'}`}>{dayLabels[i]}</div>
                  <div className={`text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-slate-600'}`}>{d.format('MM/DD')}</div>
                  {statusPerDay[i] && (
                    <Tag
                      color={statusPerDay[i] === 'confirmed' ? 'success' : statusPerDay[i] === 'submitted' ? 'processing' : 'default'}
                      style={{ fontSize: 9, padding: '0 3px', margin: '2px 0 0', lineHeight: '14px' }}
                    >
                      {statusPerDay[i] === 'confirmed' ? '已確認' : statusPerDay[i] === 'submitted' ? '已提交' : '草稿'}
                    </Tag>
                  )}
                </th>
              )
            })}
            <th className="text-center px-2 py-2.5 text-slate-500 font-semibold border-b border-slate-200 w-16">合計</th>
          </tr>
        </thead>
        <tbody>
          {categoryRows.map((row) => (
            <tr key={row.value} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: row.color }} />
                  <span className="text-slate-600 font-medium">{row.label}</span>
                </div>
              </td>
              {row.cells.map((v, i) => (
                <td key={i} className={`text-center px-2 py-2 border-b border-slate-100 ${days[i].isSame(dayjs(), 'day') ? 'bg-blue-50/50' : ''}`}>
                  {v > 0 ? <span className="font-semibold" style={{ color: row.color }}>{v}h</span> : <span className="text-slate-200">—</span>}
                </td>
              ))}
              <td className="text-center px-2 py-2 border-b border-slate-100 font-semibold text-slate-600">
                {row.total > 0 ? `${row.total}h` : '—'}
              </td>
            </tr>
          ))}

          {/* Separator */}
          <tr><td colSpan={9} className="h-1 bg-slate-100" /></tr>

          {/* Normal hours */}
          <tr className="bg-blue-50/30">
            <td className="px-3 py-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <SunIcon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-600 font-semibold">正常工時</span>
              </div>
            </td>
            {normalHours.map((v, i) => (
              <td key={i} className={`text-center px-2 py-2 border-b border-slate-100 font-semibold text-blue-600 ${days[i].isSame(dayjs(), 'day') ? 'bg-blue-50' : ''}`}>
                {v > 0 ? `${v}h` : '—'}
              </td>
            ))}
            <td className="text-center px-2 py-2 border-b border-slate-100 font-bold text-blue-600">{weekTotalNormal}h</td>
          </tr>

          {/* Overtime */}
          <tr className="bg-orange-50/30">
            <td className="px-3 py-2 border-b border-slate-100">
              <div className="flex items-center gap-1.5">
                <MoonIcon className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-slate-600 font-semibold">加班工時</span>
              </div>
            </td>
            {overtimeHours.map((v, i) => (
              <td key={i} className={`text-center px-2 py-2 border-b border-slate-100 font-semibold text-orange-500 ${days[i].isSame(dayjs(), 'day') ? 'bg-blue-50' : ''}`}>
                {v > 0 ? `${v}h` : '—'}
              </td>
            ))}
            <td className="text-center px-2 py-2 border-b border-slate-100 font-bold text-orange-500">{weekTotalOT}h</td>
          </tr>

          {/* Total */}
          <tr className="bg-slate-50 font-bold">
            <td className="px-3 py-2.5 text-slate-700">總計</td>
            {totalPerDay.map((v, i) => {
              const sufficient = v >= STANDARD_DAILY_HOURS
              return (
                <td key={i} className={`text-center px-2 py-2.5 ${days[i].isSame(dayjs(), 'day') ? 'bg-blue-50' : ''}`}>
                  <span className={sufficient ? 'text-green-600' : v > 0 ? 'text-red-500' : 'text-slate-300'}>
                    {v > 0 ? `${v}h` : '—'}
                  </span>
                </td>
              )
            })}
            <td className="text-center px-2 py-2.5 text-slate-800">{(weekTotalNormal + weekTotalOT).toFixed(1)}h</td>
          </tr>
        </tbody>
      </table>

      {/* Week summary */}
      <div className="flex items-center gap-4 mt-4 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
        <span className="text-xs text-slate-400 font-medium">本週合計</span>
        <span className="text-sm font-bold text-blue-600">正常 {weekTotalNormal}h</span>
        <span className="text-slate-300">+</span>
        <span className="text-sm font-bold text-orange-500">加班 {weekTotalOT}h</span>
        <span className="text-slate-300">=</span>
        <span className="text-sm font-bold text-slate-800">總計 {(weekTotalNormal + weekTotalOT).toFixed(1)}h</span>
      </div>
    </div>
  )
}

// ─── Month Heatmap ──────────────────────────────────────────────────────────
const MonthHeatmap: React.FC<{ month: Dayjs; logs: Record<string, DailyLog>; onDayClick: (d: Dayjs) => void }> = ({ month, logs, onDayClick }) => {
  const firstDay = month.startOf('month')
  const daysInMonth = month.daysInMonth()
  const startPad = (firstDay.day() + 6) % 7 // Monday = 0
  const dayLabels = ['一', '二', '三', '四', '五', '六', '日']

  const getColor = (hours: number) => {
    if (hours === 0) return '#f1f5f9'
    if (hours < 4) return '#bfdbfe'
    if (hours < 6) return '#93c5fd'
    if (hours < 8) return '#60a5fa'
    return '#2563eb'
  }

  return (
    <div>
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-[10px] text-slate-400 font-medium py-1">{l}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = firstDay.add(i, 'day')
          const dateStr = d.format('YYYY-MM-DD')
          const log = logs[dateStr]
          const hours = log?.total_hours ?? 0
          const isToday = d.isSame(dayjs(), 'day')
          const isFuture = d.isAfter(dayjs(), 'day')
          const isWorkday = d.day() !== 0 && d.day() !== 6
          const noLog = !log && !isFuture && isWorkday && d.isBefore(dayjs(), 'day')

          return (
            <Tooltip
              key={i}
              title={
                <div>
                  <div className="font-semibold">{d.format('YYYY-MM-DD')}</div>
                  {log ? (
                    <>
                      <div>工時: {hours}h {log.overtime_hours > 0 && `(加班 ${log.overtime_hours}h)`}</div>
                      <div>狀態: {log.status === 'confirmed' ? '已確認' : log.status === 'submitted' ? '已提交' : '草稿'}</div>
                      <div>{log.entries.length} 條記錄</div>
                    </>
                  ) : isFuture ? <div>未到</div> : <div className="text-red-300">未填寫</div>}
                </div>
              }
            >
              <div
                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all hover:ring-2 hover:ring-blue-300 ${isToday ? 'ring-2 ring-blue-500' : ''} ${noLog ? 'ring-1 ring-red-300' : ''}`}
                style={{ background: isFuture ? '#f8fafc' : getColor(hours), minHeight: 44 }}
                onClick={() => onDayClick(d)}
              >
                <span className={`text-xs font-semibold ${hours > 6 ? 'text-white' : isToday ? 'text-blue-600' : 'text-slate-500'}`}>
                  {i + 1}
                </span>
                {hours > 0 && (
                  <span className={`text-[9px] font-medium ${hours > 6 ? 'text-white/80' : 'text-slate-400'}`}>
                    {hours}h
                  </span>
                )}
                {noLog && (
                  <span className="text-[8px] text-red-400 font-bold">缺</span>
                )}
              </div>
            </Tooltip>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-4 justify-center">
        <span className="text-[10px] text-slate-400">少</span>
        {[0, 4, 6, 8, 10].map((h, i) => (
          <div key={i} className="w-4 h-4 rounded-sm" style={{ background: getColor(h) }} />
        ))}
        <span className="text-[10px] text-slate-400">多</span>
        <span className="text-[10px] text-slate-400 ml-4">|</span>
        <div className="w-4 h-4 rounded-sm ring-1 ring-red-300 bg-slate-100" />
        <span className="text-[10px] text-red-400">缺報</span>
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────
type ViewMode = 'day' | 'week' | 'month'

const DailyLogPage: React.FC = () => {
  const workNo = useAppSelector((s) => s.auth.workNo)
  // Mock: role-based daily log requirement
  // In production this comes from user profile / API
  const isManager = IS_DEV ? true : false  // mock as manager for dev
  const [dailyLogOptOut, setDailyLogOptOut] = useState(false) // manager opt-out setting

  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs())
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<DailyLogEntry | null>(null)
  const [logs, setLogs] = useState<Record<string, DailyLog>>(() => IS_DEV ? generateMockLogs() : {})
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  const dateStr = currentDate.format('YYYY-MM-DD')
  const currentLog = logs[dateStr]

  const totalHours = currentLog?.total_hours ?? 0
  const overtimeHours = currentLog?.overtime_hours ?? 0
  const normalHours = totalHours - overtimeHours
  const sufficiencyPct = Math.min(100, Math.round((normalHours / STANDARD_DAILY_HOURS) * 100))
  const isReadOnly = currentLog?.status === 'confirmed'

  // Navigation
  const navigate = (delta: number) => {
    if (viewMode === 'day') setCurrentDate((d) => d.add(delta, 'day'))
    else if (viewMode === 'week') setCurrentDate((d) => d.add(delta * 7, 'day'))
    else setCurrentDate((d) => d.add(delta, 'month'))
  }

  const goToday = () => setCurrentDate(dayjs())

  // Date label
  const dateLabel = useMemo(() => {
    if (viewMode === 'day') return currentDate.format('YYYY 年 MM 月 DD 日 dddd')
    if (viewMode === 'week') {
      const ws = currentDate.startOf('week').add(1, 'day')
      const we = ws.add(6, 'day')
      return `${ws.format('MM/DD')} — ${we.format('MM/DD')} (${ws.format('YYYY')})`
    }
    return currentDate.format('YYYY 年 MM 月')
  }, [currentDate, viewMode])

  // Open add/edit modal
  const openEntryModal = (entry?: DailyLogEntry) => {
    if (entry) {
      setEditingEntry(entry)
      setSelectedProject(entry.project_id ?? null)
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
      entry_id: editingEntry?.entry_id ?? `e-${Date.now()}`,
      work_category: cat,
      project_id: projId,
      project_nm: MOCK_PROJECTS_OPTS.find((p) => p.id === projId)?.name,
      function_id: funcId,
      function_nm: MOCK_FUNCTIONS_MAP[projId ?? '']?.find((f) => f.id === funcId)?.name,
      duty_id: dutyId,
      duty_nm: MOCK_DUTIES_OPTS.find((d) => d.id === dutyId)?.name,
      bu_unit: values.bu_unit as string | undefined,
      description: values.description as string,
      hours: values.hours as number,
      is_overtime: (values.is_overtime as boolean) ?? false,
      overtime_hours: (values.is_overtime as boolean) ? (values.hours as number) : 0,
    }

    setLogs((prev) => {
      const log = prev[dateStr] ?? {
        log_id: `log-${dateStr}`, work_no: workNo, log_date: dateStr,
        entries: [], total_hours: 0, overtime_hours: 0, status: 'draft' as const,
      }
      const entries = editingEntry
        ? log.entries.map((e) => e.entry_id === editingEntry.entry_id ? newEntry : e)
        : [...log.entries, newEntry]
      const total = entries.reduce((s, e) => s + e.hours, 0)
      const ot = entries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
      return { ...prev, [dateStr]: { ...log, entries, total_hours: total, overtime_hours: ot } }
    })
    setModalOpen(false)
    form.resetFields()
  }

  // Delete entry
  const handleDeleteEntry = (entryId: string) => {
    setLogs((prev) => {
      const log = prev[dateStr]
      if (!log) return prev
      const entries = log.entries.filter((e) => e.entry_id !== entryId)
      const total = entries.reduce((s, e) => s + e.hours, 0)
      const ot = entries.filter((e) => e.is_overtime).reduce((s, e) => s + (e.overtime_hours ?? e.hours), 0)
      return { ...prev, [dateStr]: { ...log, entries, total_hours: total, overtime_hours: ot } }
    })
  }

  // Submit
  const handleSubmit = () => {
    setLogs((prev) => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], status: 'submitted', submitted_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
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

  const weekStart = currentDate.startOf('week').add(1, 'day') // Monday

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">工作日誌</h1>
          <p className="text-slate-400 text-sm mt-0.5">每日記錄工作內容 · 自動統計工時</p>
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
              { label: '週', value: 'week' },
              { label: '月', value: 'month' },
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
                {currentLog?.entries.length ?? 0} 條記錄
              </div>
            </Card>
          </div>

          {/* Entries */}
          <Card
            bordered={false}
            className="shadow-sm mb-5"
            title={
              <div className="flex items-center gap-2">
                <PencilSquareIcon className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">日誌條目</span>
                <Badge count={currentLog?.entries.length ?? 0} color="#2563eb" />
              </div>
            }
            extra={
              !isReadOnly && (
                <Button type="primary" size="small" icon={<PlusIcon className="w-4 h-4" />}
                  style={{ background: '#2563eb' }} onClick={() => openEntryModal()}>
                  新增條目
                </Button>
              )
            }
          >
            {(!currentLog || currentLog.entries.length === 0) ? (
              <Empty description="今日尚無工作記錄" className="py-8">
                {!isReadOnly && (
                  <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                    style={{ background: '#2563eb' }} onClick={() => openEntryModal()}>
                    新增第一條記錄
                  </Button>
                )}
              </Empty>
            ) : (
              <div>
                {currentLog.entries.map((entry, i) => (
                  <EntryCard
                    key={entry.entry_id}
                    entry={entry}
                    index={i}
                    readOnly={isReadOnly}
                    onEdit={() => openEntryModal(entry)}
                    onDelete={() => handleDeleteEntry(entry.entry_id)}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Action buttons */}
          {currentLog && currentLog.status === 'draft' && currentLog.entries.length > 0 && (
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

      {/* ─── Week View ─────────────────────────────────────────────── */}
      {viewMode === 'week' && (
        <Card bordered={false} className="shadow-sm" title={<span className="text-sm font-semibold text-slate-700">本週工時匯總</span>}>
          <WeekView weekStart={weekStart} logs={logs} />
        </Card>
      )}

      {/* ─── Month View ────────────────────────────────────────────── */}
      {viewMode === 'month' && (
        <Card bordered={false} className="shadow-sm" title={<span className="text-sm font-semibold text-slate-700">月度工時日曆</span>}>
          <MonthHeatmap
            month={currentDate}
            logs={logs}
            onDayClick={(d) => { setCurrentDate(d); setViewMode('day') }}
          />
        </Card>
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
                          {MOCK_PROJECTS_OPTS.map((p) => (
                            <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                      <Form.Item name="function_id" label="關聯任務">
                        <Select placeholder="選擇功能任務" allowClear disabled={!selectedProject}>
                          {(MOCK_FUNCTIONS_MAP[selectedProject ?? ''] ?? []).map((f) => (
                            <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </div>
                  )}
                  {showDuty && (
                    <Form.Item name="duty_id" label="關聯臨時任務" rules={[{ required: true, message: '請選擇任務' }]}>
                      <Select placeholder="選擇臨時任務" allowClear>
                        {MOCK_DUTIES_OPTS.map((d) => (
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

          <Form.Item label="附件">
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
  )
}

export default DailyLogPage
