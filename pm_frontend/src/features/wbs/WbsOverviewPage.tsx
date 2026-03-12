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
 */
import React, { useState, useMemo } from 'react'
import {
  Tag, Tooltip, Progress, Collapse, Empty, Segmented,
} from 'antd'
import {
  FolderIcon, ChevronRightIcon, ClockIcon,
  ExclamationTriangleIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, CalendarDaysIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'

const { Panel } = Collapse

// ─── Types ─────────────────────────────────────────────────────────────────

type WeekTag = 'last_week' | 'this_week' | 'next_week'
type TaskStatus = 'completed' | 'in_progress' | 'not_started' | 'overdue'

interface WbsTask {
  id: string
  name: string
  assignee: string        // 負責人
  progress: number        // 0-100
  status: TaskStatus
  expected_end: string    // YYYY-MM-DD
  actual_end?: string     // if completed
  days_overdue?: number   // if overdue
  latest_update?: string  // 最新進度說明
  week_tag: WeekTag[]     // which week(s) this task spans
}

interface WbsFunction {
  id: string
  name: string
  progress: number        // overall function progress
  tasks: WbsTask[]
}

interface WbsProject {
  id: string
  name: string
  department: string
  pm: string
  progress: number
  priority: number
  expected_end: string
  functions: WbsFunction[]
}

// ─── Week markers ───────────────────────────────────────────────────────────

const WEEK_TAG_CONFIG: Record<WeekTag, { label: string; color: string; bg: string }> = {
  last_week:  { label: '上週', color: '#64748b', bg: '#f1f5f9' },
  this_week:  { label: '本週', color: '#2563eb', bg: '#eff6ff' },
  next_week:  { label: '下週', color: '#7c3aed', bg: '#f5f3ff' },
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: React.ReactNode }> = {
  completed:   { label: '已完成', color: '#16a34a', icon: <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> },
  in_progress: { label: '進行中', color: '#2563eb', icon: <ArrowTrendingUpIcon className="w-3.5 h-3.5 text-blue-500" /> },
  not_started: { label: '未開始', color: '#94a3b8', icon: <ClockIcon className="w-3.5 h-3.5 text-slate-400" /> },
  overdue:     { label: '超時',   color: '#dc2626', icon: <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" /> },
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_WBS_DATA: WbsProject[] = [
  {
    id: 'p1', name: 'ERP核心系統改版', department: '資訊部', pm: '王經理',
    progress: 58, priority: 3, expected_end: '2026-06-30',
    functions: [
      {
        id: 'f001', name: '採購模塊重構', progress: 100,
        tasks: [
          { id: 't001', name: '採購單 CRUD API', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-05', actual_end: '2026-03-04', week_tag: ['last_week'] },
          { id: 't002', name: '採購審核流程', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-08', actual_end: '2026-03-08', week_tag: ['last_week'] },
          { id: 't003', name: '採購報表匯出', assignee: '李大華', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'] },
        ],
      },
      {
        id: 'f002', name: '倉庫模塊開發', progress: 65,
        tasks: [
          { id: 't004', name: '入庫流程開發', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-10', actual_end: '2026-03-09', week_tag: ['last_week'] },
          { id: 't005', name: '出庫流程開發', assignee: '王小明', progress: 80, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], latest_update: '出庫單據生成已完成，庫存扣減邏輯開發中，預計明日完成' },
          { id: 't006', name: '庫存盤點功能', assignee: '李大華', progress: 40, status: 'overdue', expected_end: '2026-03-10', days_overdue: 2, week_tag: ['this_week', 'last_week'], latest_update: '盤點計劃模塊已完成，差異處理邏輯開發中，因需求變更延遲2天' },
          { id: 't007', name: '庫存報表模塊', assignee: '王小明', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'] },
        ],
      },
      {
        id: 'f003', name: '應收應付模塊', progress: 20,
        tasks: [
          { id: 't008', name: '應收帳款管理', assignee: '張美玲', progress: 35, status: 'in_progress', expected_end: '2026-03-21', week_tag: ['this_week', 'next_week'], latest_update: '帳款基礎數據模型設計完成，開始開發列表頁' },
          { id: 't009', name: '應付帳款管理', assignee: '張美玲', progress: 0, status: 'not_started', expected_end: '2026-03-28', week_tag: ['next_week'] },
          { id: 't010', name: '對帳功能', assignee: '李大華', progress: 10, status: 'in_progress', expected_end: '2026-04-04', week_tag: ['next_week'], latest_update: '調研對帳方案中' },
        ],
      },
      {
        id: 'f004', name: '前端 UI 重設計', progress: 95,
        tasks: [
          { id: 't011', name: '設計稿繪製', assignee: '張美玲', progress: 100, status: 'completed', expected_end: '2026-03-01', actual_end: '2026-02-28', week_tag: [] },
          { id: 't012', name: '頁面組件開發', assignee: '張美玲', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'] },
          { id: 't013', name: 'UI 走查修復', assignee: '張美玲', progress: 80, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], latest_update: '85% 走查問題已修復，剩餘 3 個微調中' },
        ],
      },
    ],
  },
  {
    id: 'p2', name: '行動端 APP 2.0', department: '資訊部', pm: '王經理',
    progress: 30, priority: 3, expected_end: '2026-08-31',
    functions: [
      {
        id: 'f007', name: 'iOS 客戶端開發', progress: 35,
        tasks: [
          { id: 't014', name: '首頁 + 導航框架', assignee: '陳建國', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-06', week_tag: ['last_week'] },
          { id: 't015', name: '列表頁 + 詳情頁', assignee: '陳建國', progress: 60, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], latest_update: '列表頁已完成，詳情頁開發中' },
          { id: 't016', name: '推送通知功能', assignee: '陳建國', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'] },
          { id: 't017', name: 'App Store 上架準備', assignee: '陳建國', progress: 0, status: 'not_started', expected_end: '2026-04-15', week_tag: [] },
        ],
      },
      {
        id: 'f008', name: 'Android 客戶端', progress: 22,
        tasks: [
          { id: 't018', name: '應用骨架 + 導航', assignee: '林小芸', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'] },
          { id: 't019', name: '首頁開發', assignee: '林小芸', progress: 30, status: 'overdue', expected_end: '2026-03-10', days_overdue: 2, week_tag: ['this_week', 'last_week'], latest_update: '首頁佈局完成，數據綁定和刷新邏輯開發中，因 API 變更延遲' },
          { id: 't020', name: '列表頁 + 詳情頁', assignee: '林小芸', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'] },
        ],
      },
    ],
  },
  {
    id: 'p3', name: '報表系統優化', department: '資訊部', pm: '李主管',
    progress: 45, priority: 2, expected_end: '2026-05-31',
    functions: [
      {
        id: 'f009', name: '報表引擎重寫', progress: 45,
        tasks: [
          { id: 't021', name: '查詢引擎架構設計', assignee: '李大華', progress: 100, status: 'completed', expected_end: '2026-03-05', actual_end: '2026-03-05', week_tag: ['last_week'] },
          { id: 't022', name: '動態欄位渲染器', assignee: '李大華', progress: 50, status: 'in_progress', expected_end: '2026-03-17', week_tag: ['this_week', 'next_week'], latest_update: '支援 10 種欄位類型，正在開發圖表型欄位' },
          { id: 't023', name: '報表匯出模塊', assignee: '王小明', progress: 0, status: 'not_started', expected_end: '2026-03-28', week_tag: ['next_week'] },
        ],
      },
    ],
  },
]

// ─── Week filter type ────────────────────────────────────────────────────────

type WeekFilter = 'all' | WeekTag

// ─── Task Row Component ─────────────────────────────────────────────────────

const TaskRow: React.FC<{ task: WbsTask }> = ({ task }) => {
  const sc = STATUS_CONFIG[task.status]
  const isOverdue = task.status === 'overdue'
  const isCompleted = task.status === 'completed'

  return (
    <div className={`flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
      {/* Status icon */}
      <div className="mt-0.5 flex-shrink-0">{sc.icon}</div>

      {/* Task name + assignee */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-medium ${isCompleted ? 'text-green-600 line-through decoration-green-300' : isOverdue ? 'text-red-700' : 'text-slate-700'}`}>
            {task.name}
          </span>
          <span className="text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{task.assignee}</span>
          {/* Week tags */}
          {task.week_tag.map((wt) => (
            <span key={wt} className="text-[9px] font-medium rounded px-1.5 py-0.5" style={{ color: WEEK_TAG_CONFIG[wt].color, background: WEEK_TAG_CONFIG[wt].bg }}>
              {WEEK_TAG_CONFIG[wt].label}
            </span>
          ))}
          {isOverdue && (
            <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              超時 {task.days_overdue} 天
            </Tag>
          )}
        </div>
        {/* Latest update for overdue / in_progress */}
        {task.latest_update && (task.status === 'overdue' || task.status === 'in_progress') && (
          <p className={`text-[10px] mt-1 leading-relaxed ${isOverdue ? 'text-red-500' : 'text-slate-400'}`}>
            最新進度：{task.latest_update}
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 flex-shrink-0 w-[120px]">
        {isCompleted ? (
          <span className="text-xs font-semibold text-green-600">完成</span>
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
          <Tooltip title={`預計 ${task.expected_end}，實際 ${task.actual_end}`}>
            <span className="text-[10px] text-green-600">{task.actual_end}</span>
          </Tooltip>
        ) : (
          <Tooltip title="預計完成時間">
            <span className={`text-[10px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              {task.expected_end}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

// ─── Function Module Component ──────────────────────────────────────────────

const FunctionModule: React.FC<{ func: WbsFunction }> = ({ func }) => {
  const overdueCount = func.tasks.filter((t) => t.status === 'overdue').length
  const completedCount = func.tasks.filter((t) => t.status === 'completed').length
  const thisWeekCount = func.tasks.filter((t) => t.week_tag.includes('this_week')).length

  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden mb-2 last:mb-0">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80">
        <ChevronRightIcon className="w-3 h-3 text-slate-400" />
        <span className="text-xs font-semibold text-slate-600">{func.name}</span>
        <Progress
          percent={func.progress}
          size="small"
          strokeColor={func.progress >= 100 ? '#16a34a' : func.progress >= 60 ? '#2563eb' : '#d97706'}
          trailColor="#e2e8f0"
          style={{ width: 60, marginBottom: 0 }}
          format={() => ''}
        />
        <span className="text-[10px] font-semibold text-slate-500">{func.progress}%</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400">{completedCount}/{func.tasks.length} 完成</span>
          {thisWeekCount > 0 && (
            <Tag color="blue" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              本週 {thisWeekCount} 項
            </Tag>
          )}
          {overdueCount > 0 && (
            <Tag color="error" style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}>
              超時 {overdueCount}
            </Tag>
          )}
        </div>
      </div>
      <div>
        {func.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
      </div>
    </div>
  )
}

// ─── Project Card Component ─────────────────────────────────────────────────

const ProjectCard: React.FC<{ project: WbsProject }> = ({ project }) => {
  const totalTasks = project.functions.reduce((s, f) => s + f.tasks.length, 0)
  const completedTasks = project.functions.reduce((s, f) => s + f.tasks.filter((t) => t.status === 'completed').length, 0)
  const overdueTasks = project.functions.reduce((s, f) => s + f.tasks.filter((t) => t.status === 'overdue').length, 0)
  const thisWeekTasks = project.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('this_week')).length, 0)
  const nextWeekTasks = project.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('next_week')).length, 0)

  const priorityColor = project.priority >= 4 ? '#dc2626' : project.priority >= 3 ? '#d97706' : project.priority >= 2 ? '#2563eb' : '#94a3b8'
  const priorityLabel = project.priority >= 4 ? '緊急' : project.priority >= 3 ? '高' : project.priority >= 2 ? '中' : '低'

  return (
    <Collapse
      defaultActiveKey={overdueTasks > 0 ? ['main'] : []}
      className="mb-4 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm"
      expandIconPosition="end"
    >
      <Panel
        key="main"
        header={
          <div className="flex items-center gap-3 flex-wrap">
            <FolderIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
            <span className="font-semibold text-slate-700 text-sm">{project.name}</span>
            <Tag style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px', color: priorityColor, borderColor: priorityColor + '44', background: priorityColor + '0D' }}>
              {priorityLabel}
            </Tag>
            <span className="text-[10px] text-slate-400">PM: {project.pm}</span>
            {overdueTasks > 0 && (
              <div className="flex items-center gap-1">
                <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] text-red-500 font-semibold">{overdueTasks} 項超時</span>
              </div>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="專案整體完成度">
              <div className="flex items-center gap-1.5">
                <Progress
                  type="circle"
                  percent={project.progress}
                  size={32}
                  strokeColor={project.progress >= 80 ? '#16a34a' : project.progress >= 40 ? '#2563eb' : '#d97706'}
                  format={(p) => <span className="text-[9px] font-bold">{p}%</span>}
                />
              </div>
            </Tooltip>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">{completedTasks}/{totalTasks} 完成</div>
              <div className="text-[10px] text-slate-400">截止 {project.expected_end}</div>
            </div>
          </div>
        }
      >
        {/* Week summary banner */}
        <div className="flex gap-3 mb-3 px-1">
          <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[10px] text-slate-400 mb-0.5">上週完成</div>
            <div className="text-sm font-bold text-slate-600">
              {project.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('last_week') && t.status === 'completed').length, 0)} 項
            </div>
          </div>
          <div className="flex-1 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <div className="text-[10px] text-blue-500 mb-0.5">本週進行中</div>
            <div className="text-sm font-bold text-blue-600">{thisWeekTasks} 項</div>
          </div>
          <div className="flex-1 rounded-lg bg-violet-50 border border-violet-100 px-3 py-2">
            <div className="text-[10px] text-violet-500 mb-0.5">下週待辦</div>
            <div className="text-sm font-bold text-violet-600">{nextWeekTasks} 項</div>
          </div>
          {overdueTasks > 0 && (
            <div className="flex-1 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
              <div className="text-[10px] text-red-500 mb-0.5">超時任務</div>
              <div className="text-sm font-bold text-red-600">{overdueTasks} 項</div>
            </div>
          )}
        </div>

        {/* Function modules */}
        {project.functions.map((f) => <FunctionModule key={f.id} func={f} />)}
      </Panel>
    </Collapse>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const WbsOverviewPage: React.FC = () => {
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  // Summary stats
  const summary = useMemo(() => {
    const allTasks = MOCK_WBS_DATA.flatMap((p) => p.functions.flatMap((f) => f.tasks))
    return {
      totalProjects: MOCK_WBS_DATA.length,
      totalTasks: allTasks.length,
      completed: allTasks.filter((t) => t.status === 'completed').length,
      inProgress: allTasks.filter((t) => t.status === 'in_progress').length,
      overdue: allTasks.filter((t) => t.status === 'overdue').length,
      notStarted: allTasks.filter((t) => t.status === 'not_started').length,
      thisWeek: allTasks.filter((t) => t.week_tag.includes('this_week')).length,
      nextWeek: allTasks.filter((t) => t.week_tag.includes('next_week')).length,
    }
  }, [])

  // Apply filters to projects (filter at task level, show project if any task matches)
  const filteredProjects = useMemo(() => {
    return MOCK_WBS_DATA.map((project) => {
      const filteredFunctions = project.functions.map((func) => {
        const filteredTasks = func.tasks.filter((task) => {
          const weekMatch = weekFilter === 'all' || task.week_tag.includes(weekFilter)
          const statusMatch = statusFilter === 'all' || task.status === statusFilter
          return weekMatch && statusMatch
        })
        return { ...func, tasks: filteredTasks }
      }).filter((f) => f.tasks.length > 0)

      return { ...project, functions: filteredFunctions }
    }).filter((p) => p.functions.length > 0)
  }, [weekFilter, statusFilter])

  const weekLabel = useMemo(() => {
    const ws = dayjs().startOf('week').add(1, 'day')
    return `${ws.format('MM/DD')} — ${ws.add(6, 'day').format('MM/DD')}`
  }, [])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">專案進度總覽</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            WBS 結構 · 部門所有專案進度追蹤 · 本週 {weekLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500 bg-slate-100 rounded-lg px-2 py-1">{dayjs().format('YYYY/MM/DD dddd')}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label: '專案數',    value: summary.totalProjects, unit: '個', color: '#2563eb', bg: '#eff6ff' },
          { label: '總任務',    value: summary.totalTasks,    unit: '項', color: '#64748b', bg: '#f8fafc' },
          { label: '已完成',    value: summary.completed,     unit: '項', color: '#16a34a', bg: '#f0fdf4' },
          { label: '進行中',    value: summary.inProgress,    unit: '項', color: '#2563eb', bg: '#eff6ff' },
          { label: '超時',      value: summary.overdue,       unit: '項', color: '#dc2626', bg: '#fef2f2' },
          { label: '未開始',    value: summary.notStarted,    unit: '項', color: '#94a3b8', bg: '#f8fafc' },
          { label: '本週進行',  value: summary.thisWeek,      unit: '項', color: '#2563eb', bg: '#eff6ff' },
          { label: '下週待辦',  value: summary.nextWeek,      unit: '項', color: '#7c3aed', bg: '#f5f3ff' },
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
          <span className="text-xs font-semibold text-slate-500">週篩選</span>
          <Segmented
            value={weekFilter}
            onChange={(v) => setWeekFilter(v as WeekFilter)}
            options={[
              { label: '全部', value: 'all' },
              { label: '上週', value: 'last_week' },
              { label: '本週', value: 'this_week' },
              { label: '下週', value: 'next_week' },
            ]}
            size="small"
          />
        </div>
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <ChartBarIcon className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500">狀態</span>
          <Segmented
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as TaskStatus | 'all')}
            options={[
              { label: '全部', value: 'all' },
              { label: '進行中', value: 'in_progress' },
              { label: '超時', value: 'overdue' },
              { label: '已完成', value: 'completed' },
              { label: '未開始', value: 'not_started' },
            ]}
            size="small"
          />
        </div>
        <div className="ml-auto text-xs text-slate-400">
          顯示 {filteredProjects.reduce((s, p) => s + p.functions.reduce((s2, f) => s2 + f.tasks.length, 0), 0)} 項任務
        </div>
      </div>

      {/* Project cards */}
      {filteredProjects.length === 0 ? (
        <Empty description="沒有符合篩選條件的任務" className="my-16" />
      ) : (
        filteredProjects.map((p) => <ProjectCard key={p.id} project={p} />)
      )}
    </div>
  )
}

export default WbsOverviewPage
