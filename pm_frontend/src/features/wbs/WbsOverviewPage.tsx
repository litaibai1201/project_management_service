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
import React, { useState, useMemo, useCallback } from 'react'
import {
  Tag, Tooltip, Progress, Collapse, Empty, Segmented, Input, Button, Timeline, Popover,
} from 'antd'
import {
  FolderIcon, ChevronDownIcon, ChevronRightIcon, ClockIcon,
  ExclamationTriangleIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, CalendarDaysIcon,
  ChartBarIcon, MagnifyingGlassIcon, ArrowDownTrayIcon,
  EyeIcon, ChatBubbleOvalLeftEllipsisIcon, PlusIcon, CheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'

dayjs.extend(isoWeek)

const IS_DEV = import.meta.env.DEV
const { Panel } = Collapse

// ─── Types ─────────────────────────────────────────────────────────────────

type WeekTag = 'last_week' | 'this_week' | 'next_week'
type TaskStatus = 'completed' | 'in_progress' | 'not_started' | 'overdue'
type NoteType = '決策' | '行動項' | '風險' | '待確認'
type NoteStatus = 'pending' | 'resolved'

interface TaskProgressEntry {
  date: string
  content: string
  progress: number   // 0-100 at that point
  author: string
}

interface WbsTask {
  id: string
  name: string
  assignee: string
  progress: number
  status: TaskStatus
  expected_end: string
  actual_end?: string
  days_overdue?: number
  latest_update?: string
  week_tag: WeekTag[]
  project_id?: string        // for navigation
  function_id?: string       // for navigation
  progress_history?: TaskProgressEntry[]
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
  progress: number
  priority: number
  expected_end: string
  functions: WbsFunction[]
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

const NOTE_TYPE_CONFIG: Record<NoteType, { antColor: string; bg: string; color: string }> = {
  '決策':   { antColor: 'blue',   bg: '#eff6ff', color: '#2563eb' },
  '行動項': { antColor: 'green',  bg: '#f0fdf4', color: '#16a34a' },
  '風險':   { antColor: 'red',    bg: '#fef2f2', color: '#dc2626' },
  '待確認': { antColor: 'orange', bg: '#fff7ed', color: '#d97706' },
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
          { id: 't001', name: '採購單 CRUD API', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-05', actual_end: '2026-03-04', week_tag: ['last_week'], project_id: 'p1', function_id: 'f001',
            progress_history: [
              { date: '2026-03-02', content: '完成基礎 CRUD 接口開發', progress: 60, author: '王小明' },
              { date: '2026-03-03', content: '完成單元測試和接口文檔', progress: 90, author: '王小明' },
              { date: '2026-03-04', content: '代碼審查通過，已合併至主分支', progress: 100, author: '王小明' },
            ],
          },
          { id: 't002', name: '採購審核流程', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-08', actual_end: '2026-03-08', week_tag: ['last_week'], project_id: 'p1', function_id: 'f001',
            progress_history: [
              { date: '2026-03-05', content: '完成審核流程狀態機設計', progress: 30, author: '王小明' },
              { date: '2026-03-07', content: '完成多級審核邏輯開發和測試', progress: 80, author: '王小明' },
              { date: '2026-03-08', content: '完成集成測試，正式上線', progress: 100, author: '王小明' },
            ],
          },
          { id: 't003', name: '採購報表匯出', assignee: '李大華', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'], project_id: 'p1', function_id: 'f001',
            progress_history: [
              { date: '2026-03-06', content: '完成 Excel 匯出模板和數據查詢', progress: 70, author: '李大華' },
              { date: '2026-03-07', content: '完成 PDF 匯出功能，測試通過', progress: 100, author: '李大華' },
            ],
          },
        ],
      },
      {
        id: 'f002', name: '倉庫模塊開發', progress: 65,
        tasks: [
          { id: 't004', name: '入庫流程開發', assignee: '王小明', progress: 100, status: 'completed', expected_end: '2026-03-10', actual_end: '2026-03-09', week_tag: ['last_week'], project_id: 'p1', function_id: 'f002',
            progress_history: [
              { date: '2026-03-06', content: '完成入庫單據 UI 和基礎邏輯', progress: 50, author: '王小明' },
              { date: '2026-03-09', content: '完成庫存更新和通知邏輯，測試通過', progress: 100, author: '王小明' },
            ],
          },
          { id: 't005', name: '出庫流程開發', assignee: '王小明', progress: 80, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], project_id: 'p1', function_id: 'f002',
            latest_update: '出庫單據生成已完成，庫存扣減邏輯開發中，預計明日完成',
            progress_history: [
              { date: '2026-03-10', content: '開始出庫流程開發，完成頁面框架', progress: 20, author: '王小明' },
              { date: '2026-03-11', content: '出庫單據生成模塊開發完成', progress: 50, author: '王小明' },
              { date: '2026-03-12', content: '庫存扣減邏輯開發中，已完成基礎邏輯', progress: 80, author: '王小明' },
            ],
          },
          { id: 't006', name: '庫存盤點功能', assignee: '李大華', progress: 40, status: 'overdue', expected_end: '2026-03-10', days_overdue: 2, week_tag: ['this_week', 'last_week'], project_id: 'p1', function_id: 'f002',
            latest_update: '盤點計劃模塊已完成，差異處理邏輯開發中，因需求變更延遲2天',
            progress_history: [
              { date: '2026-03-07', content: '盤點計劃模塊設計完成', progress: 15, author: '李大華' },
              { date: '2026-03-09', content: '盤點計劃模塊開發完成，開始差異處理', progress: 30, author: '李大華' },
              { date: '2026-03-11', content: '因需求變更需調整差異處理邏輯，延遲2天', progress: 40, author: '李大華' },
            ],
          },
          { id: 't007', name: '庫存報表模塊', assignee: '王小明', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'], project_id: 'p1', function_id: 'f002' },
        ],
      },
      {
        id: 'f003', name: '應收應付模塊', progress: 20,
        tasks: [
          { id: 't008', name: '應收帳款管理', assignee: '張美玲', progress: 35, status: 'in_progress', expected_end: '2026-03-21', week_tag: ['this_week', 'next_week'], project_id: 'p1', function_id: 'f003',
            latest_update: '帳款基礎數據模型設計完成，開始開發列表頁',
            progress_history: [
              { date: '2026-03-10', content: '開始帳款模型設計', progress: 10, author: '張美玲' },
              { date: '2026-03-12', content: '數據模型設計完成，開始列表頁開發', progress: 35, author: '張美玲' },
            ],
          },
          { id: 't009', name: '應付帳款管理', assignee: '張美玲', progress: 0, status: 'not_started', expected_end: '2026-03-28', week_tag: ['next_week'], project_id: 'p1', function_id: 'f003' },
          { id: 't010', name: '對帳功能', assignee: '李大華', progress: 10, status: 'in_progress', expected_end: '2026-04-04', week_tag: ['next_week'], project_id: 'p1', function_id: 'f003',
            latest_update: '調研對帳方案中',
            progress_history: [
              { date: '2026-03-11', content: '開始調研對帳方案，參考業界做法', progress: 10, author: '李大華' },
            ],
          },
        ],
      },
      {
        id: 'f004', name: '前端 UI 重設計', progress: 95,
        tasks: [
          { id: 't011', name: '設計稿繪製', assignee: '張美玲', progress: 100, status: 'completed', expected_end: '2026-03-01', actual_end: '2026-02-28', week_tag: [], project_id: 'p1', function_id: 'f004' },
          { id: 't012', name: '頁面組件開發', assignee: '張美玲', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'], project_id: 'p1', function_id: 'f004' },
          { id: 't013', name: 'UI 走查修復', assignee: '張美玲', progress: 80, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], project_id: 'p1', function_id: 'f004',
            latest_update: '85% 走查問題已修復，剩餘 3 個微調中',
            progress_history: [
              { date: '2026-03-10', content: '開始 UI 走查，共發現 20 個問題', progress: 30, author: '張美玲' },
              { date: '2026-03-12', content: '已修復 17 個問題，剩餘 3 個微調中', progress: 80, author: '張美玲' },
            ],
          },
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
          { id: 't014', name: '首頁 + 導航框架', assignee: '陳建國', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-06', week_tag: ['last_week'], project_id: 'p2', function_id: 'f007' },
          { id: 't015', name: '列表頁 + 詳情頁', assignee: '陳建國', progress: 60, status: 'in_progress', expected_end: '2026-03-14', week_tag: ['this_week'], project_id: 'p2', function_id: 'f007',
            latest_update: '列表頁已完成，詳情頁開發中',
            progress_history: [
              { date: '2026-03-09', content: '列表頁基礎框架完成', progress: 30, author: '陳建國' },
              { date: '2026-03-11', content: '列表頁完成，開始詳情頁開發', progress: 60, author: '陳建國' },
            ],
          },
          { id: 't016', name: '推送通知功能', assignee: '陳建國', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'], project_id: 'p2', function_id: 'f007' },
          { id: 't017', name: 'App Store 上架準備', assignee: '陳建國', progress: 0, status: 'not_started', expected_end: '2026-04-15', week_tag: [], project_id: 'p2', function_id: 'f007' },
        ],
      },
      {
        id: 'f008', name: 'Android 客戶端', progress: 22,
        tasks: [
          { id: 't018', name: '應用骨架 + 導航', assignee: '林小芸', progress: 100, status: 'completed', expected_end: '2026-03-07', actual_end: '2026-03-07', week_tag: ['last_week'], project_id: 'p2', function_id: 'f008' },
          { id: 't019', name: '首頁開發', assignee: '林小芸', progress: 30, status: 'overdue', expected_end: '2026-03-10', days_overdue: 2, week_tag: ['this_week', 'last_week'], project_id: 'p2', function_id: 'f008',
            latest_update: '首頁佈局完成，數據綁定和刷新邏輯開發中，因 API 變更延遲',
            progress_history: [
              { date: '2026-03-08', content: '首頁佈局開發完成', progress: 20, author: '林小芸' },
              { date: '2026-03-10', content: '遇到 API 變更問題，需要等待後端修復', progress: 25, author: '林小芸' },
              { date: '2026-03-12', content: '數據綁定邏輯開發中，因 API 變更延遲', progress: 30, author: '林小芸' },
            ],
          },
          { id: 't020', name: '列表頁 + 詳情頁', assignee: '林小芸', progress: 0, status: 'not_started', expected_end: '2026-03-21', week_tag: ['next_week'], project_id: 'p2', function_id: 'f008' },
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
          { id: 't021', name: '查詢引擎架構設計', assignee: '李大華', progress: 100, status: 'completed', expected_end: '2026-03-05', actual_end: '2026-03-05', week_tag: ['last_week'], project_id: 'p3', function_id: 'f009' },
          { id: 't022', name: '動態欄位渲染器', assignee: '李大華', progress: 50, status: 'in_progress', expected_end: '2026-03-17', week_tag: ['this_week', 'next_week'], project_id: 'p3', function_id: 'f009',
            latest_update: '支援 10 種欄位類型，正在開發圖表型欄位',
            progress_history: [
              { date: '2026-03-06', content: '開始欄位渲染器開發，完成文字和數字型', progress: 20, author: '李大華' },
              { date: '2026-03-10', content: '已支援 10 種欄位類型', progress: 40, author: '李大華' },
              { date: '2026-03-12', content: '正在開發圖表型欄位渲染', progress: 50, author: '李大華' },
            ],
          },
          { id: 't023', name: '報表匯出模塊', assignee: '王小明', progress: 0, status: 'not_started', expected_end: '2026-03-28', week_tag: ['next_week'], project_id: 'p3', function_id: 'f009' },
        ],
      },
    ],
  },
]

// ─── CSV export utility ─────────────────────────────────────────────────────

function exportWbsCSV(projects: WbsProject[]) {
  const bom = '\uFEFF'
  const headers = ['專案名稱', '功能模塊', '任務名稱', '負責人', '狀態', '完成度(%)', '預計完成', '實際完成', '超時天數', '週標記', '最新進度']
  const rows = projects.flatMap((p) =>
    p.functions.flatMap((f) =>
      f.tasks.map((t) => [
        p.name, f.name, t.name, t.assignee, STATUS_CONFIG[t.status].label,
        String(t.progress), t.expected_end, t.actual_end ?? '',
        String(t.days_overdue ?? ''), t.week_tag.map((wt) => WEEK_TAG_CONFIG[wt].label).join('+'),
        t.latest_update ?? '',
      ])
    )
  )
  const csv = bom + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `WBS專案進度_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ─── Week filter type ────────────────────────────────────────────────────────

type WeekFilter = 'all' | 'show_all' | WeekTag

// ─── Task Progress Detail Panel ─────────────────────────────────────────────

const TaskProgressDetail: React.FC<{ task: WbsTask }> = ({ task }) => {
  const history = task.progress_history ?? []

  return (
    <div className="bg-slate-50/80 border-t border-slate-100 px-6 py-3">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xs font-semibold text-slate-600">進度追蹤記錄</span>
        <span className="text-[10px] text-slate-400">共 {history.length} 條記錄</span>
      </div>
      {history.length === 0 ? (
        <p className="text-[10px] text-slate-400">暫無進度記錄</p>
      ) : (
        <Timeline
          className="ml-1 mt-2"
          items={history.map((entry, idx) => ({
            dot: idx === 0 ? (
              <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-[7px] text-white font-bold">{entry.progress}%</span>
              </div>
            ) : undefined,
            color: entry.progress >= 100 ? 'green' : entry.progress >= 50 ? 'blue' : 'gray',
            children: (
              <div className="pb-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-slate-400">{entry.date}</span>
                  <span className="text-[10px] text-slate-300">·</span>
                  <span className="text-[10px] text-slate-400">{entry.author}</span>
                  <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 3px' }}
                    color={entry.progress >= 100 ? 'success' : entry.progress >= 50 ? 'processing' : 'default'}
                  >
                    {entry.progress}%
                  </Tag>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">{entry.content}</p>
              </div>
            ),
          }))}
        />
      )}
    </div>
  )
}

// ─── Note Add Popover ────────────────────────────────────────────────────────

const NoteAddPopover: React.FC<{
  taskName?: string
  onAdd: (type: NoteType, content: string) => void
  children: React.ReactNode
}> = ({ taskName, onAdd, children }) => {
  const [open, setOpen] = useState(false)
  const [noteType, setNoteType] = useState<NoteType>('行動項')
  const [noteContent, setNoteContent] = useState('')

  const handleAdd = () => {
    if (!noteContent.trim()) return
    onAdd(noteType, noteContent.trim())
    setNoteContent('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAdd()
    }
  }

  const handleOpenChange = (v: boolean) => {
    setOpen(v)
    if (!v) setNoteContent('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      trigger="click"
      placement="bottomRight"
      title={
        <div className="flex items-center gap-2">
          <ChatBubbleOvalLeftEllipsisIcon className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold text-slate-700">
            {taskName ? `會議備注 · ${taskName}` : '新增專案備注'}
          </span>
        </div>
      }
      content={
        <div className="w-64">
          <div className="flex gap-1 mb-2 flex-wrap">
            {(['決策', '行動項', '風險', '待確認'] as NoteType[]).map((t) => (
              <Tag
                key={t}
                color={noteType === t ? NOTE_TYPE_CONFIG[t].antColor : 'default'}
                style={{ fontSize: 10, lineHeight: '18px', margin: 0, padding: '0 6px', cursor: 'pointer' }}
                onClick={() => setNoteType(t)}
              >
                {t}
              </Tag>
            ))}
          </div>
          <Input.TextArea
            rows={3}
            placeholder={`記錄${noteType === '決策' ? '決策結果與依據' : noteType === '行動項' ? '待辦事項與負責人' : noteType === '風險' ? '風險點與應對方案' : '待確認的問題'}... (⌘Enter 快速提交)`}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            onKeyDown={handleKeyDown}
            size="small"
            autoFocus
          />
          <div className="flex justify-end mt-2 gap-1.5">
            <Button size="small" onClick={() => { setOpen(false); setNoteContent('') }}>取消</Button>
            <Button size="small" type="primary" onClick={handleAdd} disabled={!noteContent.trim()}>
              記錄
            </Button>
          </div>
          <p className="text-[9px] text-slate-300 mt-1 text-right">⌘Enter 快速提交</p>
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
          <span className="text-xs font-semibold text-blue-700">會議備注</span>
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
              {showResolved ? '隱藏已處理' : `+${resolvedNotes.length} 已處理`}
            </button>
          )}
        </div>
        <NoteAddPopover onAdd={onAddProjectNote}>
          <button
            className="border-0 bg-transparent cursor-pointer flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded px-2 py-1 transition-colors"
          >
            <PlusIcon className="w-3 h-3" />
            新增備注
          </button>
        </NoteAddPopover>
      </div>

      {/* Notes list */}
      {displayedNotes.length === 0 ? (
        <div className="px-4 py-4 text-center">
          <ChatBubbleOvalLeftEllipsisIcon className="w-6 h-6 text-slate-200 mx-auto mb-1" />
          <p className="text-[11px] text-slate-400">
            {notes.length === 0
              ? '懸停任務名稱旁的 💬 圖標，或點擊「新增備注」記錄會議要點'
              : '所有備注均已處理完成'}
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
                {note.type}
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
                      專案層級
                    </span>
                  )}
                  <span className="text-[9px] text-slate-300">
                    {note.author} · {dayjs(note.createdAt).format('HH:mm')}
                  </span>
                  {note.status === 'resolved' && (
                    <span className="text-[9px] text-green-500">✓ 已處理</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Tooltip title={note.status === 'pending' ? '標記為已處理' : '撤銷處理'}>
                  <button
                    className={`border-0 bg-transparent cursor-pointer p-1 rounded transition-colors ${note.status === 'resolved' ? 'text-green-500 hover:bg-green-50' : 'text-slate-300 hover:text-green-500 hover:bg-green-50'}`}
                    onClick={() => onResolve(note.id)}
                  >
                    <CheckIcon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
                <Tooltip title="刪除備注">
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
  onWeekTagClick?: (wt: WeekTag) => void
  expanded?: boolean
  onToggleExpand?: () => void
  noteCount?: number
  onAddNote?: (type: NoteType, content: string) => void
}> = ({ task, onWeekTagClick, expanded = false, onToggleExpand, noteCount = 0, onAddNote }) => {
  const sc = STATUS_CONFIG[task.status]
  const isOverdue = task.status === 'overdue'
  const isCompleted = task.status === 'completed'
  const hasHistory = (task.progress_history?.length ?? 0) > 0

  return (
    <>
      <div className={`group flex items-start gap-3 px-4 py-2.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
        {/* Status icon */}
        <div className="mt-0.5 flex-shrink-0">{sc.icon}</div>

        {/* Task name + assignee */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-medium ${hasHistory ? 'cursor-pointer hover:underline decoration-dotted underline-offset-2' : ''} ${isCompleted ? 'text-green-600 line-through decoration-green-300' : isOverdue ? 'text-red-700' : 'text-slate-700'} ${hasHistory && !isCompleted ? 'hover:text-blue-600' : ''}`}
              onClick={(e) => { if (hasHistory) { e.stopPropagation(); onToggleExpand?.() } }}
            >
              {task.name}
              {hasHistory && (
                <EyeIcon className={`w-3 h-3 inline-block ml-1 -mt-0.5 ${expanded ? 'text-blue-500' : 'text-slate-300'}`} />
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

        {/* Meeting note button */}
        {onAddNote && (
          <div className="flex-shrink-0 w-[24px] flex items-center justify-center">
            <NoteAddPopover taskName={task.name} onAdd={onAddNote}>
              <button
                className={`border-0 bg-transparent cursor-pointer relative p-0.5 rounded transition-all ${noteCount > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} hover:bg-blue-50`}
                onClick={(e) => e.stopPropagation()}
                title="新增會議備注"
              >
                <ChatBubbleOvalLeftEllipsisIcon className={`w-3.5 h-3.5 transition-colors ${noteCount > 0 ? 'text-blue-500' : 'text-slate-400 hover:text-blue-500'}`} />
                {noteCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 text-[8px] font-bold bg-blue-500 text-white rounded-full flex items-center justify-center leading-none">
                    {noteCount > 9 ? '9+' : noteCount}
                  </span>
                )}
              </button>
            </NoteAddPopover>
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
  defaultOpen?: boolean
  onWeekTagClick?: (wt: WeekTag) => void
  expandedTaskId: string | null
  onToggleTaskExpand: (taskId: string) => void
  noteCountByTaskId: Record<string, number>
  onAddNote: (taskId: string, taskName: string, type: NoteType, content: string) => void
}> = ({ func, defaultOpen = true, onWeekTagClick, expandedTaskId, onToggleTaskExpand, noteCountByTaskId, onAddNote }) => {
  const [expanded, setExpanded] = useState(defaultOpen)
  const overdueCount = func.tasks.filter((t) => t.status === 'overdue').length
  const completedCount = func.tasks.filter((t) => t.status === 'completed').length
  const thisWeekCount = func.tasks.filter((t) => t.week_tag.includes('this_week')).length

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
      {expanded && (
        <div>
          {func.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onWeekTagClick={onWeekTagClick}
              expanded={expandedTaskId === t.id}
              onToggleExpand={() => onToggleTaskExpand(t.id)}
              noteCount={noteCountByTaskId[t.id] ?? 0}
              onAddNote={(type, content) => onAddNote(t.id, t.name, type, content)}
            />
          ))}
        </div>
      )}
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
}> = ({ project, originalProject, onWeekTagClick, expandedTaskId, onToggleTaskExpand, notes, onAddNote, onResolveNote, onDeleteNote }) => {
  const navigate = useNavigate()

  // Use ORIGINAL project data for summary stats to avoid filter distortion
  const totalTasks = originalProject.functions.reduce((s, f) => s + f.tasks.length, 0)
  const completedTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.status === 'completed').length, 0)
  const overdueTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.status === 'overdue').length, 0)
  const thisWeekTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('this_week')).length, 0)
  const nextWeekTasks = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('next_week')).length, 0)
  const lastWeekCompleted = originalProject.functions.reduce((s, f) => s + f.tasks.filter((t) => t.week_tag.includes('last_week') && t.status === 'completed').length, 0)

  const filteredTaskCount = project.functions.reduce((s, f) => s + f.tasks.length, 0)
  const isFiltered = filteredTaskCount !== totalTasks

  const priorityColor = originalProject.priority >= 4 ? '#dc2626' : originalProject.priority >= 3 ? '#d97706' : originalProject.priority >= 2 ? '#2563eb' : '#94a3b8'
  const priorityLabel = originalProject.priority >= 4 ? '緊急' : originalProject.priority >= 3 ? '高' : originalProject.priority >= 2 ? '中' : '低'

  const pendingNoteCount = notes.filter((n) => n.status === 'pending').length

  // Build note count by taskId for highlighting task rows
  const noteCountByTaskId = useMemo(() => {
    const map: Record<string, number> = {}
    notes.forEach((n) => {
      if (n.taskId) {
        map[n.taskId] = (map[n.taskId] ?? 0) + 1
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
      defaultActiveKey={overdueTasks > 0 || isFiltered ? ['main'] : []}
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
              onClick={(e) => { e.stopPropagation(); navigate(`/projects/${originalProject.id}`) }}
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
                <span className="text-[10px] text-red-500 font-semibold">{overdueTasks} 項超時</span>
              </div>
            )}
            {pendingNoteCount > 0 && (
              <div className="flex items-center gap-1">
                <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] text-blue-500 font-semibold">{pendingNoteCount} 條備注</span>
              </div>
            )}
            {isFiltered && (
              <Tag style={{ fontSize: 9, margin: 0, lineHeight: '14px', padding: '0 4px' }} color="processing">
                篩選中：顯示 {filteredTaskCount}/{totalTasks} 項
              </Tag>
            )}
          </div>
        }
        extra={
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <Tooltip title="專案整體完成度">
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
              <div className="text-[10px] text-slate-400">{completedTasks}/{totalTasks} 完成</div>
              <div className="text-[10px] text-slate-400">截止 {originalProject.expected_end}</div>
            </div>
          </div>
        }
      >
        {/* Week summary banner */}
        <div className="flex gap-3 mb-3 px-1">
          <div className="flex-1 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
            <div className="text-[10px] text-slate-400 mb-0.5">上週完成</div>
            <div className="text-sm font-bold text-slate-600">{lastWeekCompleted} 項</div>
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

        {/* Function modules (filtered) */}
        {project.functions.map((f) => (
          <FunctionModule
            key={f.id}
            func={f}
            defaultOpen={f.tasks.some((t) => t.status === 'overdue') || f.tasks.length <= 6}
            onWeekTagClick={onWeekTagClick}
            expandedTaskId={expandedTaskId}
            onToggleTaskExpand={onToggleTaskExpand}
            noteCountByTaskId={noteCountByTaskId}
            onAddNote={(taskId, taskName, type, content) => onAddNote(taskId, taskName, type, content)}
          />
        ))}

        {/* Meeting Notes Section */}
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
              會議備注
            </span>
            {pendingNoteCount > 0 && (
              <span className="text-[10px] font-bold bg-blue-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                {pendingNoteCount}
              </span>
            )}
            {notes.length === 0 && (
              <span className="text-[10px] text-slate-300">（點擊展開記錄）</span>
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
  const isManager = IS_DEV ? true : false

  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [meetingNotes, setMeetingNotes] = useState<Record<string, MeetingNote[]>>({})

  const handleToggleTaskExpand = (taskId: string) => {
    setExpandedTaskId((prev) => prev === taskId ? null : taskId)
  }

  const handleAddNote = useCallback((
    projectId: string,
    taskId: string | null,
    taskName: string | null,
    type: NoteType,
    content: string
  ) => {
    const note: MeetingNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      projectId,
      type,
      content,
      taskId: taskId ?? undefined,
      taskName: taskName ?? undefined,
      author: '王經理',
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    setMeetingNotes((prev) => ({
      ...prev,
      [projectId]: [note, ...(prev[projectId] ?? [])],
    }))
  }, [])

  const handleResolveNote = useCallback((projectId: string, noteId: string) => {
    setMeetingNotes((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((n) =>
        n.id === noteId ? { ...n, status: n.status === 'pending' ? 'resolved' : 'pending' } : n
      ),
    }))
  }, [])

  const handleDeleteNote = useCallback((projectId: string, noteId: string) => {
    setMeetingNotes((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter((n) => n.id !== noteId),
    }))
  }, [])

  // Summary stats (always from full data)
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

  // Total pending notes across all projects (for header indicator)
  const totalPendingNotes = useMemo(() => {
    return Object.values(meetingNotes).reduce((sum, notes) => sum + notes.filter((n) => n.status === 'pending').length, 0)
  }, [meetingNotes])

  // Apply filters to projects
  const filteredProjects = useMemo(() => {
    const kw = searchKeyword.toLowerCase()
    return MOCK_WBS_DATA.map((project) => {
      const filteredFunctions = project.functions.map((func) => {
        const filteredTasks = func.tasks.filter((task) => {
          const weekMatch =
            weekFilter === 'show_all' ? true :
            weekFilter === 'all' ? (task.week_tag.length > 0 || task.status === 'in_progress' || task.status === 'overdue') :
            task.week_tag.includes(weekFilter)
          const statusMatch = statusFilter === 'all' || task.status === statusFilter
          const searchMatch = !kw || task.name.toLowerCase().includes(kw) || task.assignee.toLowerCase().includes(kw)
          return weekMatch && statusMatch && searchMatch
        })
        return { ...func, tasks: filteredTasks }
      }).filter((f) => f.tasks.length > 0)

      return { ...project, functions: filteredFunctions }
    }).filter((p) => p.functions.length > 0)
  }, [weekFilter, statusFilter, searchKeyword])

  const originalProjectMap = useMemo(() => {
    const map: Record<string, WbsProject> = {}
    MOCK_WBS_DATA.forEach((p) => { map[p.id] = p })
    return map
  }, [])

  const filteredTaskCount = filteredProjects.reduce((s, p) => s + p.functions.reduce((s2, f) => s2 + f.tasks.length, 0), 0)

  const weekLabel = useMemo(() => {
    const ws = dayjs().isoWeekday(1)
    return `${ws.format('MM/DD')} — ${ws.add(6, 'day').format('MM/DD')}`
  }, [])

  const handleWeekTagClick = (wt: WeekTag) => {
    setWeekFilter((prev) => prev === wt ? 'all' : wt)
  }

  if (!isManager) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <Empty description="此頁面僅限主管級以上用戶查看" className="py-20" />
      </div>
    )
  }

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
          {totalPendingNotes > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
              <ChatBubbleOvalLeftEllipsisIcon className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-600">
                {totalPendingNotes} 條待處理備注
              </span>
            </div>
          )}
          <button
            onClick={() => exportWbsCSV(MOCK_WBS_DATA)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            導出 CSV
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
              { label: '近3週', value: 'all' },
              { label: '上週', value: 'last_week' },
              { label: '本週', value: 'this_week' },
              { label: '下週', value: 'next_week' },
              { label: '全部顯示', value: 'show_all' },
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
        <div className="w-px h-5 bg-slate-200" />
        <div className="flex items-center gap-2">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />
          <Input
            placeholder="搜索任務/負責人..."
            allowClear
            size="small"
            style={{ width: 160, borderRadius: 8 }}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
        <div className="ml-auto text-xs text-slate-400">
          顯示 {filteredTaskCount}/{summary.totalTasks} 項任務
          {weekFilter === 'show_all' && <Tag color="orange" style={{ fontSize: 9, margin: '0 0 0 6px', lineHeight: '14px', padding: '0 3px' }}>含歷史</Tag>}
        </div>
      </div>

      {/* Project cards */}
      {filteredProjects.length === 0 ? (
        <Empty description="沒有符合篩選條件的任務" className="my-16" />
      ) : (
        filteredProjects.map((p) => (
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
          />
        ))
      )}
    </div>
  )
}

export default WbsOverviewPage
