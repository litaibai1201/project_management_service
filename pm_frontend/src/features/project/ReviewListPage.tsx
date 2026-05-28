import React, { useEffect, useState, useMemo } from 'react'
import {
  Tabs, Table, Button, Tag, Modal, Form, Input, Select, Space,
  Avatar, Badge, Tooltip, Drawer, Spin, Empty, DatePicker,
} from 'antd'
import type { Dayjs } from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckIcon, XMarkIcon, ArrowUturnLeftIcon, UserPlusIcon, EyeIcon,
  CheckCircleIcon, InformationCircleIcon, PaperClipIcon,
  ArrowDownTrayIcon, PlusIcon, MagnifyingGlassIcon, FunnelIcon,
} from '@heroicons/react/24/outline'
import { useLocation } from 'react-router-dom'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { projectApi, requirementApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { ApplyRecord, Project, ProjectFile, ProjectFunction, ProgressRecord, FileInfo, ReviewPayload, Requirement } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import FilePreviewModal from './FilePreviewModal'
import { tokenStorage } from '@/api/httpClient'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import RichTextContent from '@/components/common/RichTextContent'

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: '待審核', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
  4: { label: '已退回', color: 'warning'    },
}

const STAMP_COLORS: Record<number, string> = {
  1: '#2563eb',
  2: '#16a34a',
  3: '#dc2626',
  4: '#d97706',
}

const APPLY_TYPE_COLOR: Record<string, string> = {
  initiate:            'blue',
  plan:                'geekblue',
  schedule:            'purple',
  function_complete:   'cyan',
  function_completion: 'cyan',   // alias — 兼容旧记录
  project_complete:    'green',
  duty_complete:       'volcano',
  duty_completion:     'volcano',  // 兼容旧记录
  requirement_change:  'orange',
  requirement_review:       'purple',
  requirement_batch_review: 'purple',
  requirement_shelve:       'gold',
  task_addition_review:     'cyan',
}

// 每種申請類型的詳細說明：告訴審核人這是什麼、通過後會發生什麼
const APPLY_TYPE_META: Record<string, {
  what: string      // 這個申請是做什麼的
  approve: string   // 通過後的結果
  reject: string    // 拒絕後的結果
  icon: string      // emoji 標識
}> = {
  initiate: {
    what:    '申請人希望將此專案正式立案，進入規劃開發流程',
    approve: '通過後，專案將進入「規劃中」階段，可開始制定方案',
    reject:  '拒絕後，專案退回草稿，申請人需修改後重新提交',
    icon:    '🚀',
  },
  plan: {
    what:    '申請人提交了專案規劃方案，希望通過審核後進入排程安排',
    approve: '通過後，專案將進入「排程安排」階段，由專案PM分配任務與時程',
    reject:  '拒絕後，專案退回規劃中，申請人需調整方案後重新提交',
    icon:    '📋',
  },
  schedule: {
    what:    '專案PM已完成任務拆解與人員時程安排，申請審核後正式開始執行',
    approve: '通過後，專案將進入「執行中」階段，開發團隊可開始正式開發',
    reject:  '拒絕後，專案退回排程安排，專案PM需調整排程後重新提交',
    icon:    '🗓️',
  },
  function_complete: {
    what:    '負責人認為此功能已完成，申請功能完結審核，請核對下方任務詳情及進度記錄後進行審批',
    approve: '通過後，功能將標記為「已完結」，後續無法再更新進度',
    reject:  '拒絕後，功能退回「進行中」狀態，負責人需繼續完善後重新提交',
    icon:    '✅',
  },
  project_complete: {
    what:    '專案PM認為所有任務已完成，申請整個專案完結',
    approve: '通過後，專案將進入「已完結」狀態，歸檔記錄',
    reject:  '拒絕後，專案退回執行中，需繼續完善後再申請',
    icon:    '🎯',
  },
  duty_complete: {
    what:    '負責人認為此AR已完成，申請完結確認',
    approve: '通過後，AR將標記為「已完結」',
    reject:  '拒絕後，任務退回執行中，負責人需繼續完善',
    icon:    '📌',
  },
  requirement_change: {
    what:    '申請人希望在執行階段補充或修改需求文件/設計文件',
    approve: '通過後，申請人可以上傳需求文件和規劃設計文件',
    reject:  '拒絕後，需求變更申請關閉，文件鎖定狀態不變',
    icon:    '📝',
  },
  requirement_review: {
    what:    '產品PM提交了新需求，申請審核通過後方可建立關聯任務',
    approve: '通過後，需求狀態變為「已通過」，可建立關聯此需求的功能任務',
    reject:  '拒絕後，需求退回草稿狀態，產品PM可修改後重新提交',
    icon:    '📋',
  },
  requirement_batch_review: {
    what:    '產品PM批量提交了多條需求，申請一次審核通過所有需求',
    approve: '通過後，所有需求狀態變為「已通過」，可建立關聯任務',
    reject:  '拒絕後，所有需求退回草稿狀態，產品PM可修改後重新提交',
    icon:    '📋',
  },
  task_addition_review: {
    what:    '專案PM在執行階段新增了功能任務，申請審核後方可正式啟動任務',
    approve: '通過後，所有草稿任務狀態變為「待開始」，負責人可開始執行',
    reject:  '拒絕後，任務保持草稿狀態，專案PM可修改後重新提交',
    icon:    '🆕',
  },
  requirement_shelve: {
    what:    '申請人希望將此需求搁置，暫不納入排程規劃',
    approve: '通過後，需求狀態變為「搁置」，不再參與後續排程',
    reject:  '拒絕後，需求保持原有狀態不變',
    icon:    '🗂️',
  },
}

// 一個頁籤 key 可能對應多個 apply_type_code（如需求審核 = 單條 + 批量）
const TAB_CODES: Record<string, string[]> = {
  requirement_review: ['requirement_review', 'requirement_batch_review'],
}
const tabMatchesCodes = (tabKey: string, code: string) =>
  TAB_CODES[tabKey] ? TAB_CODES[tabKey].includes(code) : code === tabKey

// 待我審核（只看待處理）
const REVIEWER_TABS = [
  { key: 'all',                label: '全部待審'    },
  { key: 'initiate',           label: '立案申請'    },
  { key: 'plan',               label: '規劃審核'    },
  { key: 'schedule',           label: '排程審核'    },
  { key: 'function_complete',  label: '功能完結審核' },
  { key: 'project_complete',   label: '專案完結'    },
  { key: 'duty_complete',      label: 'AR'    },
  { key: 'requirement_review', label: '需求審核'    },
  { key: 'task_addition_review', label: '新增任務審核' },
]

// 我的審核（已審核過的記錄，按類型分）
const REVIEWED_TABS = [
  { key: 'all',                label: '全部'        },
  { key: 'initiate',           label: '立案申請'    },
  { key: 'plan',               label: '規劃審核'    },
  { key: 'schedule',           label: '排程審核'    },
  { key: 'function_complete',  label: '功能完結審核' },
  { key: 'project_complete',   label: '專案完結'    },
  { key: 'duty_complete',      label: 'AR'    },
  { key: 'requirement_review', label: '需求審核'    },
  { key: 'task_addition_review', label: '新增任務審核' },
]

// 我的提交
const SUBMITTER_TABS = [
  { key: 'all',                label: '全部'        },
  { key: 'initiate',           label: '立案申請'    },
  { key: 'plan',               label: '規劃審核'    },
  { key: 'schedule',           label: '排程審核'    },
  { key: 'function_complete',  label: '功能完結審核' },
  { key: 'project_complete',   label: '專案完結'    },
  { key: 'duty_complete',      label: 'AR'    },
  { key: 'requirement_review', label: '需求審核'    },
  { key: 'task_addition_review', label: '新增任務審核' },
]

// ─── 每種審批類型需要展示的附件分類 ──────────────────────────────────────────────
const STAGE_FILES: Record<string, string[]> = {
  initiate:           ['requirement'],
  plan:               ['requirement', 'design'],
  function_complete:  ['progress'],
  project_complete:   ['requirement', 'design', 'progress', 'other'],
  requirement_change: ['requirement', 'design'],
  duty_complete:      [],
}

const FILE_CATEGORY_LABEL: Record<string, string> = {
  requirement: '需求文件',
  design:      '規劃設計',
  progress:    '進度報告',
  other:       '其他',
}

// ─── ReviewerChain ────────────────────────────────────────────────────────────

const CHAIN_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

type ChainPerson = { work_no: string; name: string }

const ReviewerChain: React.FC<{
  value: ChainPerson[]
  onChange: (v: ChainPerson[]) => void
  userOptions: { value: string; label: string }[]
  maxCount?: number
}> = ({ value, onChange, userOptions, maxCount = 5 }) => {
  const [adding, setAdding] = useState(false)

  const addPerson = (workNo: string) => {
    const name = userOptions.find((u) => u.value === workNo)?.label ?? workNo
    if (!value.some((v) => v.work_no === workNo)) {
      onChange([...value, { work_no: workNo, name }])
    }
    setAdding(false)
  }

  const removePerson = (workNo: string) => onChange(value.filter((v) => v.work_no !== workNo))

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {value.map((person, i) => (
        <div key={person.work_no} className="flex items-center gap-1">
          <Tooltip title={`第 ${i + 1} 位：${person.name}（點擊移除）`} placement="top">
            <div className="relative group cursor-pointer select-none" onClick={() => removePerson(person.work_no)}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm transition-transform group-hover:scale-95"
                style={{ background: CHAIN_COLORS[i % CHAIN_COLORS.length] }}
              >
                {person.name.charAt(0)}
              </div>
              {/* 序号 */}
              <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 leading-none">
                {i + 1}
              </div>
              {/* 移除遮罩 */}
              <div className="absolute inset-0 rounded-full bg-red-500 bg-opacity-0 group-hover:bg-opacity-75 flex items-center justify-center transition-all">
                <XMarkIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </Tooltip>
          {/* 虚线连接器 */}
          <div className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            <div className="w-3 border-t border-dashed border-slate-300" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 opacity-50" />
          </div>
        </div>
      ))}

      {value.length < maxCount && (
        adding ? (
          <Select
            autoFocus
            size="small"
            style={{ width: 130 }}
            placeholder="選擇人員"
            showSearch
            optionFilterProp="label"
            options={userOptions.filter((u) => !value.some((v) => v.work_no === u.value))}
            onChange={addPerson}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-9 h-9 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        )
      )}
    </div>
  )
}

// ─── WBS Table ────────────────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: '低',   color: '#22c55e' },
  2: { label: '中',   color: '#f59e0b' },
  3: { label: '高',   color: '#ef4444' },
  4: { label: '緊急', color: '#7c3aed' },
}
const FUNC_STATUS_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: '待開始',  color: '#94a3b8' },
  2: { label: '進行中',  color: '#2563eb' },
  3: { label: '完結審核', color: '#f59e0b' },
  4: { label: '已完結',  color: '#16a34a' },
  8: { label: '擱置',    color: '#6b7280' },
}

const WbsTable: React.FC<{
  functions: ProjectFunction[]
  toName: (workNo: string) => string
  requirements?: Requirement[]
}> = ({ functions, toName, requirements = [] }) => {
  const COLS = '24px 2fr 1fr 1fr 1fr 1fr 1fr'

  const reqNameMap = useMemo(() => {
    const m: Record<string, string> = {}
    requirements.forEach((r) => { m[r.id] = r.req_nm })
    return m
  }, [requirements])

  // Build 3-level structure: requirement → group1 → tasks
  const structure = useMemo(() => {
    const hasReq = functions.some((f) => !!f.requirement_id)

    const byReq = new Map<string, ProjectFunction[]>()
    functions.forEach((f) => {
      const key = f.requirement_id || '__none__'
      if (!byReq.has(key)) byReq.set(key, [])
      byReq.get(key)!.push(f)
    })

    const buildSubGroups = (tasks: ProjectFunction[]) => {
      const map = new Map<string, ProjectFunction[]>()
      tasks.forEach((t) => {
        const g = t.group1 || '__nogroup__'
        if (!map.has(g)) map.set(g, [])
        map.get(g)!.push(t)
      })
      return [...map.entries()].map(([g, items]) => ({ name: g === '__nogroup__' ? '未分組' : g, key: g, items }))
    }

    return [...byReq.entries()]
      .sort(([a], [b]) => (a === '__none__' ? 1 : b === '__none__' ? -1 : 0))
      .map(([reqKey, tasks]) => ({
        reqKey,
        reqNm: reqKey === '__none__' ? null : (reqNameMap[reqKey] || reqKey),
        hasReqLevel: hasReq && reqKey !== '__none__',
        subGroups: buildSubGroups(tasks),
        allTasks: tasks,
      }))
  }, [functions, reqNameMap])

  // Collapsed state: keys are `req:${reqKey}` or `grp:${reqKey}::${gKey}`
  const allHeaderKeys = useMemo(() => {
    const keys: string[] = []
    structure.forEach((r) => {
      if (r.hasReqLevel) keys.push(`req:${r.reqKey}`)
      const showGroups = r.subGroups.length > 1 || (r.subGroups.length === 1 && r.subGroups[0].key !== '__nogroup__')
      if (showGroups) r.subGroups.forEach((g) => keys.push(`grp:${r.reqKey}::${g.key}`))
    })
    return keys
  }, [structure])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(allHeaderKeys))

  const allCollapsed = allHeaderKeys.length > 0 && allHeaderKeys.every((k) => collapsed.has(k))
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(allHeaderKeys))
  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })

  const groupRange = (tasks: ProjectFunction[]) => {
    const starts = tasks.map((t) => t.expected_start_date).filter(Boolean) as string[]
    const ends   = tasks.map((t) => t.expected_end_date).filter(Boolean) as string[]
    return { start: starts.length ? starts.sort()[0] : null, end: ends.length ? ends.sort().at(-1)! : null }
  }
  const groupResponsible = (tasks: ProjectFunction[]) => {
    const seen = new Set<string>()
    tasks.forEach((t) => (t.responsible ?? []).forEach((r) => seen.add(r)))
    return [...seen]
  }

  const renderTaskRows = (tasks: ProjectFunction[], indent = false) =>
    tasks.map((task, ti) => (
      <div key={task.id}
        className={`grid border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${ti % 2 === 1 ? 'bg-slate-50/40' : ''}`}
        style={{ gridTemplateColumns: COLS }}>
        <div />
        <div className={`${indent ? 'pl-5' : 'px-2'} pr-2 py-2 text-slate-700 flex items-center gap-1.5`}>
          <span className="truncate">{task.function_nm}</span>
        </div>
        <div className="px-2 py-2 text-slate-600 truncate">
          {task.responsible && task.responsible.length > 0
            ? task.responsible.map((r) => toName(r) || r).join('、')
            : <span className="text-slate-300">—</span>}
        </div>
        <div className="px-2 py-2">
          {PRIORITY_LABEL[task.priority]
            ? <span className="font-medium" style={{ color: PRIORITY_LABEL[task.priority].color }}>{PRIORITY_LABEL[task.priority].label}</span>
            : '—'}
        </div>
        <div className="px-2 py-2 text-slate-500 tabular-nums">{task.expected_start_date || '—'}</div>
        <div className="px-2 py-2 text-slate-500 tabular-nums">{task.expected_end_date || '—'}</div>
        <div className="px-2 py-2">
          {FUNC_STATUS_LABEL[task.status]
            ? <span style={{ color: FUNC_STATUS_LABEL[task.status].color }}>{FUNC_STATUS_LABEL[task.status].label}</span>
            : '—'}
        </div>
      </div>
    ))

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
      {/* Column header */}
      <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
        style={{ gridTemplateColumns: COLS }}>
        <div className="flex items-center justify-center py-2">
          {allHeaderKeys.length > 0 && (
            <button onClick={toggleAll}
              className="w-4 h-4 rounded border border-slate-300 hover:border-violet-400 hover:text-violet-600 text-slate-400 bg-white hover:bg-violet-50 transition-colors cursor-pointer flex items-center justify-center text-[10px] font-bold leading-none"
              title={allCollapsed ? '展開全部' : '折疊全部'}>
              {allCollapsed ? '+' : '−'}
            </button>
          )}
        </div>
        <div className="px-2 py-2">任務名稱</div>
        <div className="px-2 py-2">負責人</div>
        <div className="px-2 py-2">優先級</div>
        <div className="px-2 py-2">預計開始</div>
        <div className="px-2 py-2">預計完成</div>
        <div className="px-2 py-2">狀態</div>
      </div>

      {structure.map((reqGroup) => {
        const reqColKey  = `req:${reqGroup.reqKey}`
        const reqOpen    = !collapsed.has(reqColKey)
        const singleUnnamedGroup = reqGroup.subGroups.length === 1 && reqGroup.subGroups[0].key === '__nogroup__'
        const showGroups = !singleUnnamedGroup

        return (
          <div key={reqGroup.reqKey}>
            {/* ── Requirement header (purple) — only when tasks have requirements ── */}
            {reqGroup.hasReqLevel && (
              <div
                className="grid items-center border-b border-slate-200 bg-purple-50 hover:bg-purple-100 cursor-pointer select-none transition-colors"
                style={{ gridTemplateColumns: COLS }}
                onClick={() => toggle(reqColKey)}
              >
                <div className="flex items-center justify-center py-2">
                  <span className="w-4 h-4 rounded border border-purple-300 text-purple-500 bg-white flex items-center justify-center text-[10px] font-bold leading-none flex-shrink-0">
                    {reqOpen ? '−' : '+'}
                  </span>
                </div>
                <div className="px-2 py-2 font-semibold text-purple-700 flex items-center gap-1.5 col-span-6">
                  <span className="truncate">{reqGroup.reqNm}</span>
                  <span className="font-normal text-purple-400 text-[11px] flex-shrink-0">（{reqGroup.allTasks.length} 項）</span>
                </div>
              </div>
            )}

            {/* ── Content under requirement (or top-level if no requirement) ── */}
            {(!reqGroup.hasReqLevel || reqOpen) && (
              showGroups ? (
                /* ── Group headers (violet) ── */
                reqGroup.subGroups.map((sg, gi) => {
                  const grpColKey = `grp:${reqGroup.reqKey}::${sg.key}`
                  const grpOpen   = !collapsed.has(grpColKey)
                  const { start, end } = groupRange(sg.items)
                  const responsible    = groupResponsible(sg.items)
                  return (
                    <div key={sg.key}>
                      <div
                        className="grid items-center border-b border-slate-200 bg-violet-50 hover:bg-violet-100 cursor-pointer select-none transition-colors"
                        style={{ gridTemplateColumns: COLS }}
                        onClick={() => toggle(grpColKey)}
                      >
                        <div className="flex items-center justify-center py-2">
                          <span className="w-4 h-4 rounded border border-violet-300 text-violet-500 bg-white flex items-center justify-center text-[10px] font-bold leading-none flex-shrink-0">
                            {grpOpen ? '−' : '+'}
                          </span>
                        </div>
                        <div className={`${reqGroup.hasReqLevel ? 'pl-4' : 'px-2'} pr-2 py-2 font-semibold text-violet-700 flex items-center gap-1.5`}>
                          <span className="w-4 h-4 rounded-sm bg-violet-200 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{gi + 1}</span>
                          <span className="truncate">{sg.name}</span>
                          <span className="font-normal text-violet-400 text-[11px] flex-shrink-0">（{sg.items.length} 項）</span>
                        </div>
                        {!grpOpen ? (
                          <>
                            <div className="px-2 py-2 text-violet-500 truncate">
                              {responsible.length > 0 ? responsible.map((r) => toName(r) || r).join('、') : <span className="text-violet-300">—</span>}
                            </div>
                            <div className="px-2 py-2" />
                            <div className="px-2 py-2 text-violet-500 tabular-nums">{start ?? '—'}</div>
                            <div className="px-2 py-2 text-violet-500 tabular-nums">{end ?? '—'}</div>
                            <div className="px-2 py-2" />
                          </>
                        ) : <div className="col-span-5" />}
                      </div>
                      {grpOpen && renderTaskRows(sg.items, reqGroup.hasReqLevel)}
                    </div>
                  )
                })
              ) : (
                /* ── No group: tasks directly ── */
                renderTaskRows(reqGroup.allTasks, reqGroup.hasReqLevel)
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

const ReviewDetailDrawer: React.FC<{
  record: ApplyRecord | null
  open: boolean
  onClose: () => void
  userOptions: { value: string; label: string }[]
  onAction: (action: 'approve' | 'reject' | 'return', record: ApplyRecord, countersigns?: ChainPerson[]) => void
}> = ({ record, open, onClose, userOptions, onAction }) => {
  const PAGE_SIZE = 5
  const toName = useWorkNoToName()

  const [project,              setProject]              = useState<Project | null>(null)
  const [files,                setFiles]                = useState<ProjectFile[]>([])
  const [functions,            setFunctions]            = useState<ProjectFunction[]>([])
  const [requirements,         setRequirements]         = useState<Requirement[]>([])
  const [funcDetail,           setFuncDetail]           = useState<ProjectFunction | null>(null)
  const [progressRecords,      setProgressRecords]      = useState<ProgressRecord[]>([])
  const [progressPage,         setProgressPage]         = useState(1)
  const [progressHasMore,      setProgressHasMore]      = useState(false)
  const [progressLoading,      setProgressLoading]      = useState(false)
  const [projectLoading,       setProjectLoading]       = useState(false)
  const [projectInfoCollapsed, setProjectInfoCollapsed] = useState(false)
  const [previewFile,          setPreviewFile]          = useState<ProjectFile | null>(null)
  const [previewDirect,        setPreviewDirect]        = useState<FileInfo | null>(null)
  const [countersignPeople,    setCountersignPeople]    = useState<ChainPerson[]>([])
  const [reqListCollapsed,     setReqListCollapsed]     = useState(false)
  const [expandedReqs,         setExpandedReqs]         = useState<Set<string>>(new Set())

  useEffect(() => {
    setCountersignPeople([])
    // 功能完結審核：預設折疊專案資訊
    setProjectInfoCollapsed(record?.apply_type_code === 'function_complete')
    setProgressRecords([])
    setProgressPage(1)
    setProgressHasMore(false)
    setReqListCollapsed(false)
    setExpandedReqs(new Set())
  }, [record?.id])

  const addToken = (items: FileInfo[] | undefined): FileInfo[] => {
    if (!items?.length) return []
    const token = tokenStorage.get()
    return items.map((f) => ({ ...f, url: token ? `${f.url}?token=${token}` : f.url }))
  }

  const loadProgress = async (pid: string, fid: string, page: number, append = false) => {
    setProgressLoading(true)
    try {
      const res = await projectApi.getProgress(pid, fid, { page, size: PAGE_SIZE })
      const c = res.content as { data_list?: ProgressRecord[]; total_count?: number; total_page?: number }
      const list = (c.data_list ?? []) as ProgressRecord[]
      const withToken = list.map((r) => ({ ...r, files: addToken(r.files) }))
      setProgressRecords((prev) => append ? [...prev, ...withToken] : withToken)
      setProgressPage(page)
      setProgressHasMore((c.total_page ?? 1) > page)
    } catch { /* global */ }
    finally { setProgressLoading(false) }
  }

  useEffect(() => {
    if (!record?.project_id) {
      setProject(null); setFiles([]); setFunctions([])
      setRequirements([]); setFuncDetail(null); setProgressRecords([])
      return
    }
    setProjectLoading(true)
    const reqs: Promise<unknown>[] = [
      projectApi.get(record.project_id),
      projectApi.listFiles(record.project_id),
    ]
    if (record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') {
      reqs.push(projectApi.functionList(record.project_id, { page: 1, size: 200 }))
      reqs.push(requirementApi.list(record.project_id))
    }
    if (record.apply_type_code === 'function_complete' && record.function_id) {
      reqs.push(projectApi.getFunction(record.project_id, record.function_id))
    }
    if (record.apply_type_code === 'initiate') {
      reqs.push(requirementApi.list(record.project_id))
    }
    if (['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code)) {
      reqs.push(requirementApi.list(record.project_id))
    }
    if (record.apply_type_code === 'task_addition_review') {
      reqs.push(projectApi.functionList(record.project_id, { page: 1, size: 200 }))
      reqs.push(requirementApi.list(record.project_id))
    }
    Promise.all(reqs).then((results) => {
      const [pRes, fRes, extra1] = results as [
        Awaited<ReturnType<typeof projectApi.get>>,
        { content: unknown },
        unknown?,
      ]
      setProject(pRes.content as Project)
      setFiles(Array.isArray((fRes as { content: unknown }).content) ? ((fRes as { content: ProjectFile[] }).content) : [])

      if ((record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') && extra1) {
        const c = (extra1 as { content: { data_list?: ProjectFunction[] } }).content
        setFunctions(c.data_list ?? [])
        const extra2 = results[3]
        if (extra2) {
          setRequirements(Array.isArray((extra2 as { content: unknown }).content) ? (extra2 as { content: Requirement[] }).content : [])
        }
      }
      if (record.apply_type_code === 'function_complete' && extra1) {
        setFuncDetail((extra1 as { content: ProjectFunction }).content)
      }
      if (record.apply_type_code === 'initiate' && extra1) {
        setRequirements(Array.isArray((extra1 as { content: unknown }).content) ? (extra1 as { content: Requirement[] }).content : [])
      }
      if (['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code) && extra1) {
        setRequirements(Array.isArray((extra1 as { content: unknown }).content) ? (extra1 as { content: Requirement[] }).content : [])
      }
      if (record.apply_type_code === 'task_addition_review' && extra1) {
        const c = (extra1 as { content: { data_list?: ProjectFunction[] } }).content
        setFunctions(c.data_list ?? [])
        const extra2 = results[3]
        if (extra2) {
          setRequirements(Array.isArray((extra2 as { content: unknown }).content) ? (extra2 as { content: Requirement[] }).content : [])
        }
      }
    }).catch(() => {}).finally(() => setProjectLoading(false))

    // Load first page of progress records separately
    if (record.apply_type_code === 'function_complete' && record.function_id) {
      loadProgress(record.project_id, record.function_id, 1, false)
    }
  }, [record?.project_id, record?.apply_type_code, record?.function_id])

  if (!record) return null

  const targetName = record.apply_type_code === 'function_complete'
    ? (record.function_nm || record.project_nm || '—')
    : record.apply_type_code === 'duty_complete'
    ? (record.duty_nm || '—')
    : (record.project_nm || record.duty_nm || record.function_nm || '—')
  const nodes         = [...(record.approval_nodes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // 本次審批需要展示的附件分類
  const relevantCategories = STAGE_FILES[record.apply_type_code] ?? []
  const relevantFiles = files.filter((f) => relevantCategories.includes(f.file_category) && f.source !== 'requirement_attachment')

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <Tag color={APPLY_TYPE_COLOR[record.apply_type_code]} style={{ margin: 0 }}>
            {record.apply_type}
          </Tag>
          <span className="text-slate-700 font-semibold truncate">{targetName}</span>
          <Tag color={REVIEW_STATUS[record.status]?.color} style={{ margin: 0 }}>
            {REVIEW_STATUS[record.status]?.label}
          </Tag>
        </div>
      }
      open={open}
      onClose={onClose}
      width={record?.apply_type_code === 'schedule' || record?.apply_type_code === 'project_complete' ? 900 : record?.apply_type_code === 'function_complete' ? 780 : 720}
      footer={
        record.is_my_turn ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-1 mt-1 flex-shrink-0">
                <UserPlusIcon className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 whitespace-nowrap">加簽（選填）</span>
              </div>
              <ReviewerChain
                value={countersignPeople}
                onChange={setCountersignPeople}
                userOptions={userOptions}
              />
            </div>
            {countersignPeople.length > 0 && (
              <div className="text-xs text-slate-400 pl-1">
                通過後，流程將依序轉至加簽人員審批，再繼續後續流程
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button icon={<ArrowUturnLeftIcon className="w-4 h-4" />} onClick={() => onAction('return', record)}>退回</Button>
              <Button danger icon={<XMarkIcon className="w-4 h-4" />} onClick={() => onAction('reject', record)}>拒絕</Button>
              <Button type="primary" icon={<CheckIcon className="w-4 h-4" />}
                onClick={() => onAction('approve', record, countersignPeople.length ? countersignPeople : undefined)}
                style={{ background: '#16a34a' }}>通過</Button>
            </div>
          </div>
        ) : null
      }
    >
      {/* ─── ① 頂部摘要欄 ─── */}
      <div className="flex items-center gap-5 pb-5 mb-5 border-b border-slate-100">
        {/* 狀態印章 */}
        <div className="relative w-[68px] h-[68px] flex-shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full"
            style={{ border: `3px dashed ${STAMP_COLORS[record.status] ?? '#94a3b8'}`, transform: 'rotate(-12deg)' }} />
          <span className="text-sm font-bold text-center leading-tight"
            style={{ color: STAMP_COLORS[record.status] ?? '#94a3b8' }}>
            {REVIEW_STATUS[record.status]?.label}
          </span>
        </div>

        {/* 申請人 */}
        <div className="flex flex-col items-center gap-1">
          <Avatar size={36} style={{ background: '#7c3aed', fontSize: 14, fontWeight: 600 }}>
            {(record.submitter_name || toName(record.submitter))?.[0]?.toUpperCase()}
          </Avatar>
          <div className="text-xs font-medium text-slate-700">{record.submitter_name || toName(record.submitter)}</div>
          <div className="text-[11px] text-slate-400">申請人</div>
        </div>

        {/* 當前審批人 */}
        {nodes.find((n) => n.status === 0) && (
          <>
            <div className="text-slate-300 text-lg">→</div>
            <div className="flex flex-col items-center gap-1">
              {(() => {
                const node = nodes.find((n) => n.status === 0)!
                const wn = node.approver_work_no || node.approver
                const name = toName(wn) || wn
                return (
                  <>
                    <Avatar size={36} style={{ background: '#2563eb', fontSize: 14, fontWeight: 600 }}>
                      {name?.[0]?.toUpperCase()}
                    </Avatar>
                    <div className="text-xs font-medium text-slate-700">{name}</div>
                    <div className="text-[11px] text-slate-400">當前審批人</div>
                  </>
                )
              })()}
            </div>
          </>
        )}

        {/* 右側申請信息 */}
        <div className="ml-auto text-right flex flex-col gap-1.5">
          <Tag color={APPLY_TYPE_COLOR[record.apply_type_code]} style={{ margin: 0 }}>{record.apply_type}</Tag>
          {record.function_nm && record.project_nm && (
            <div className="text-xs text-slate-400">功能任務 · {record.project_nm}</div>
          )}
          <div className="text-xs text-slate-400">提交：{record.created_at}</div>
          {nodes.length > 0 && (
            <div className="text-xs text-slate-500">
              審批進度：<span className="text-blue-600 font-semibold">{nodes.filter((n) => n.status === 1).length}/{nodes.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── ② 申請動態說明 ─── */}
      {APPLY_TYPE_META[record.apply_type_code] && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-5 text-sm text-slate-600 flex items-start gap-2">
          <InformationCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <span>{APPLY_TYPE_META[record.apply_type_code].what}</span>
        </div>
      )}

      {/* ─── ③ 申請說明（如有） ─── */}
      {record.description && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2">申請說明</div>
          <div className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-relaxed">
            {record.description}
          </div>
        </div>
      )}

      {/* ─── ④ 申請資訊 Grid Table ─── */}
      {record.project_id && (
        <div className="mb-5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
            onClick={() => setProjectInfoCollapsed((v) => !v)}
          >
            <span
              className="text-[10px] text-slate-400 font-normal"
            >
              {projectInfoCollapsed ? '展開' : '收起'}
            </span>
            申請資訊
          </button>
          {!projectInfoCollapsed && (
            projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : project ? (
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">専案名稱</td>
                    <td className="px-3 py-2.5 border border-slate-200 font-medium text-slate-800" colSpan={3}>{project.project_nm}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">所屬部門</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700 w-[29%]">{project.department || '—'}</td>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">産品PM</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{toName(project.product_pm) || '—'}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">專案PM</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{toName(project.project_pm) || '—'}</td>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">預計完結</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{project.expected_end_date || '—'}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">專案描述</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>
                      <RichTextContent html={project.describe} />
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">預期效益</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>
                      {project.benefit_amount != null
                        ? <>{project.benefit_amount} {project.benefit_unit ?? '元/年'}{project.expected_benefit ? <span className="text-slate-400 ml-2 text-xs">（{project.expected_benefit}）</span> : null}</>
                        : project.expected_benefit || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4 border border-slate-200 rounded-lg">無法載入專案資料</div>
            )
          )}
        </div>
      )}

      {/* ─── ④-b 功能詳情（功能完結審核專用） ─── */}
      {record.apply_type_code === 'function_complete' && (
        <div className="mb-5">
          {projectLoading ? (
            <div className="flex justify-center py-4"><Spin size="small" /></div>
          ) : funcDetail ? (
            <>
              {/* Compact meta strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                <span className="font-semibold text-slate-800">{funcDetail.function_nm}</span>
                <span className="text-slate-400 text-xs">|</span>
                <span className="text-slate-500 text-xs">負責人：
                  {(funcDetail.responsible ?? []).length > 0
                    ? funcDetail.responsible!.map((r) => (
                        <Tag key={r} color="purple" style={{ fontSize: 11, margin: '0 2px' }}>{r}</Tag>
                      ))
                    : '—'}
                </span>
                {PRIORITY_LABEL[funcDetail.priority] && (
                  <span className="text-xs" style={{ color: PRIORITY_LABEL[funcDetail.priority].color }}>
                    優先：{PRIORITY_LABEL[funcDetail.priority].label}
                  </span>
                )}
                {funcDetail.expected_start_date && (
                  <span className="text-slate-400 text-xs">{funcDetail.expected_start_date} → {funcDetail.expected_end_date ?? '—'}</span>
                )}
                {/* Overall progress inline */}
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${funcDetail.progress ?? 0}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-blue-600 tabular-nums">{funcDetail.progress ?? 0}%</span>
                </div>
              </div>
              {funcDetail.describe && (
                <p className="text-xs text-slate-500 mb-3 px-1">{funcDetail.describe}</p>
              )}

              {/* Progress records with load-more */}
              <div className="text-xs font-medium text-slate-500 mb-1.5 px-1">
                進度更新記錄（已載入 {progressRecords.length} 筆）
              </div>
              {progressLoading && progressRecords.length === 0 ? (
                <div className="flex justify-center py-4"><Spin size="small" /></div>
              ) : progressRecords.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">暫無進度記錄</div>
              ) : (
                <div className="space-y-1.5">
                  {progressRecords.map((rec) => (
                    <div key={rec.progress_id} className="flex gap-2.5 bg-white border border-slate-100 rounded-lg px-2.5 py-2 hover:border-slate-200 transition-colors">
                      <Avatar size={22} style={{ background: '#2563eb', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                        {toName(rec.submitter)?.[0]?.toUpperCase()}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700">{toName(rec.submitter)}</span>
                          <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{rec.progress}%</Tag>
                          {Number(rec.time_consum) > 0 && (
                            <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{rec.time_consum}h</Tag>
                          )}
                          <span className="ml-auto text-[11px] text-slate-400 tabular-nums flex-shrink-0">{rec.created_at}</span>
                        </div>
                        {rec.progress_record && (
                          <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{rec.progress_record}</p>
                        )}
                        {(rec.files ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(rec.files ?? []).map((f, fi) => (
                              <button
                                key={fi}
                                type="button"
                                onClick={() => setPreviewDirect(f)}
                                className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer"
                              >
                                <PaperClipIcon className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{f.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Load-more / all-loaded footer */}
                  <div className="text-center pt-1">
                    {progressHasMore ? (
                      <button
                        type="button"
                        disabled={progressLoading}
                        onClick={() => record?.project_id && record?.function_id &&
                          loadProgress(record.project_id, record.function_id, progressPage + 1, true)}
                        className="text-xs text-blue-500 hover:text-blue-700 disabled:text-slate-300 transition-colors cursor-pointer border-0 bg-transparent outline-none focus:outline-none p-0"
                      >
                        {progressLoading ? '載入中…' : '繼續載入更多'}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">已全部載入</span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-400 text-center py-4 border border-slate-200 rounded-lg">無法載入功能資料</div>
          )}
        </div>
      )}

      {/* ─── ④-c WBS 任務表（排程審核 / 專案完結審核） ─── */}
      {(record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            {record.apply_type_code === 'project_complete' ? '✅ 任務完成情況（WBS）' : '🗓️ 任務排程（WBS）'}
            <span className="font-normal text-xs text-slate-400">共 {functions.length} 項任務</span>
          </div>
          {projectLoading ? (
            <div className="flex justify-center py-6"><Spin size="small" /></div>
          ) : functions.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">暫無任務資料</div>
          ) : (
            <WbsTable functions={functions} toName={toName} requirements={requirements} />
          )}
        </div>
      )}

      {/* ─── ④-d 需求列表（立案審核專用） ─── */}
      {record.apply_type_code === 'initiate' && (
        <div className="mb-5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
            onClick={() => setReqListCollapsed((v) => !v)}
          >
            <span className="text-[10px] text-slate-400 font-normal">
              {reqListCollapsed ? '展開' : '收起'}
            </span>
            📋 需求列表
            <span className="font-normal text-xs text-slate-400">共 {requirements.length} 項</span>
          </button>
          {!reqListCollapsed && (
            projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : requirements.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">暫無需求資料</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                {/* Header */}
                <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
                  style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                  <div />
                  <div className="px-3 py-2">需求名稱</div>
                  <div className="px-3 py-2">優先級</div>
                  <div className="px-3 py-2">預計效益</div>
                  <div className="px-3 py-2">期望完成</div>
                  <div className="px-3 py-2">需求描述</div>
                </div>
                {requirements.map((req, i) => {
                  const isExpanded = expandedReqs.has(req.id)
                  const hasFiles = (req.files ?? []).length > 0
                  const descLong = (req.describe ?? '').length > 30
                  const canExpand = hasFiles || descLong
                  const token = tokenStorage.get()
                  return (
                    <div key={req.id} className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      {/* Main row */}
                      <div className="grid items-center" style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                        <div className="flex items-center justify-center py-2.5">
                          {canExpand && (
                            <button
                              type="button"
                              onClick={() => setExpandedReqs((prev) => {
                                const next = new Set(prev)
                                next.has(req.id) ? next.delete(req.id) : next.add(req.id)
                                return next
                              })}
                              className="w-4 h-4 rounded border border-slate-300 hover:border-blue-400 hover:text-blue-500 text-slate-400 bg-white hover:bg-blue-50 transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
                              title={isExpanded ? '收起' : '展開詳情'}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          )}
                        </div>
                        <div className="px-3 py-2.5 text-slate-800 font-medium truncate flex items-center gap-1">
                          {req.req_nm}
                          {hasFiles && (
                            <span className="text-[10px] text-slate-400 font-normal flex-shrink-0">
                              （{(req.files ?? []).length} 個附件）
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2.5">
                          {PRIORITY_LABEL[req.priority]
                            ? <span className="font-medium" style={{ color: PRIORITY_LABEL[req.priority].color }}>{PRIORITY_LABEL[req.priority].label}</span>
                            : '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-600">
                          {req.benefit_amount != null
                            ? <>{req.benefit_amount} {req.benefit_unit ?? '元/年'}</>
                            : req.expected_benefit || '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-500 tabular-nums">
                          {req.expected_end_date || '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-500">
                          {req.describe
                            ? (req.describe.length > 30 ? req.describe.slice(0, 30) + '…' : req.describe)
                            : '—'}
                        </div>
                      </div>
                      {/* Expanded: full description + attachments */}
                      {isExpanded && canExpand && (
                        <div className="px-3 pb-2.5 border-t border-slate-100 bg-blue-50/30">
                          {descLong && (
                            <div className="pt-2 pb-1.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{req.describe}</div>
                          )}
                          {hasFiles && (
                            <>
                              <div className={`${descLong ? 'pt-1.5 border-t border-slate-100' : 'pt-2'} pb-0.5 text-[11px] text-slate-400 font-medium`}>需求附件</div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(req.files ?? []).map((f, fi) => {
                              const previewUrl = f.file_id
                                ? requirementApi.getFilePreviewUrl(record.project_id!, req.id, f.file_id)
                                : f.url
                              const tokenUrl = token ? `${previewUrl}?token=${token}` : previewUrl
                              return (
                                <button
                                  key={fi}
                                  type="button"
                                  onClick={() => setPreviewDirect({ name: f.name, url: tokenUrl })}
                                  className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                                >
                                  <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[180px]">{f.name}</span>
                                </button>
                              )
                            })}
                          </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* ─── ④-e 需求詳情（需求審核 / 需求搁置專用） ─── */}
      {['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code) && (() => {
        const batchIds = record.requirement_ids ?? []
        const displayReqs = batchIds.length > 0
          ? requirements.filter((r) => batchIds.includes(r.id))
          : requirements.filter((r) => r.id === record.requirement_id)
        return (
          <div className="mb-5">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
              onClick={() => setReqListCollapsed((v) => !v)}
            >
              <span className="text-[10px] text-slate-400 font-normal">{reqListCollapsed ? '展開' : '收起'}</span>
              📋 需求詳情
              <span className="font-normal text-xs text-slate-400">共 {displayReqs.length} 項</span>
            </button>
            {!reqListCollapsed && (
              projectLoading ? (
                <div className="flex justify-center py-6"><Spin size="small" /></div>
              ) : displayReqs.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">暫無需求資料</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
                    style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                    <div />
                    <div className="px-3 py-2">需求名稱</div>
                    <div className="px-3 py-2">優先級</div>
                    <div className="px-3 py-2">預計效益</div>
                    <div className="px-3 py-2">期望完成</div>
                    <div className="px-3 py-2">需求描述</div>
                  </div>
                  {displayReqs.map((req, i) => {
                    const isExpanded = expandedReqs.has(req.id)
                    const hasFiles = (req.files ?? []).length > 0
                    const descLong = (req.describe ?? '').length > 30
                    const canExpand = hasFiles || descLong
                    const token = tokenStorage.get()
                    return (
                      <div key={req.id} className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                        <div className="grid items-center" style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                          <div className="flex items-center justify-center py-2.5">
                            {canExpand && (
                              <button type="button"
                                onClick={() => setExpandedReqs((prev) => { const next = new Set(prev); next.has(req.id) ? next.delete(req.id) : next.add(req.id); return next })}
                                className="w-4 h-4 rounded border border-slate-300 hover:border-blue-400 hover:text-blue-500 text-slate-400 bg-white hover:bg-blue-50 transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
                                title={isExpanded ? '收起' : '展開詳情'}
                              >{isExpanded ? '−' : '+'}</button>
                            )}
                          </div>
                          <div className="px-3 py-2.5 text-slate-800 font-medium truncate flex items-center gap-1">
                            {req.req_nm}
                            {hasFiles && <span className="text-[10px] text-slate-400 font-normal flex-shrink-0">（{(req.files ?? []).length} 個附件）</span>}
                          </div>
                          <div className="px-3 py-2.5">
                            {PRIORITY_LABEL[req.priority]
                              ? <span className="font-medium" style={{ color: PRIORITY_LABEL[req.priority].color }}>{PRIORITY_LABEL[req.priority].label}</span>
                              : '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-600">
                            {req.benefit_amount != null ? <>{req.benefit_amount} {req.benefit_unit ?? '元/年'}</> : req.expected_benefit || '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-500 tabular-nums">
                            {req.expected_end_date || '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-500">
                            {req.describe ? (req.describe.length > 30 ? req.describe.slice(0, 30) + '…' : req.describe) : '—'}
                          </div>
                        </div>
                        {isExpanded && canExpand && (
                          <div className="px-3 pb-2.5 border-t border-slate-100 bg-blue-50/30">
                            {descLong && <div className="pt-2 pb-1.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{req.describe}</div>}
                            {hasFiles && (
                              <>
                                <div className={`${descLong ? 'pt-1.5 border-t border-slate-100' : 'pt-2'} pb-0.5 text-[11px] text-slate-400 font-medium`}>需求附件</div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {(req.files ?? []).map((f, fi) => {
                                    const previewUrl = f.file_id ? requirementApi.getFilePreviewUrl(record.project_id!, req.id, f.file_id) : f.url
                                    const tokenUrl = token ? `${previewUrl}?token=${token}` : previewUrl
                                    return (
                                      <button key={fi} type="button"
                                        onClick={() => setPreviewDirect({ name: f.name, url: tokenUrl })}
                                        className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer">
                                        <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[180px]">{f.name}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )
      })()}

      {/* ─── ④-f 新增任務詳情（task_addition_review 專用） ─── */}
      {record.apply_type_code === 'task_addition_review' && (() => {
        const funcIds = record.function_ids ?? []
        const displayFuncs = funcIds.length > 0
          ? functions.filter((f) => funcIds.includes(f.id))
          : []
        return (
          <div className="mb-5">
            <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              🆕 新增任務詳情
              <span className="font-normal text-xs text-slate-400">共 {displayFuncs.length} 項</span>
            </div>
            {projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : displayFuncs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">暫無任務資料</div>
            ) : (
              <WbsTable functions={displayFuncs} toName={toName} requirements={requirements} />
            )}
          </div>
        )
      })()}

      {/* ─── ⑤ 相關附件 ─── */}
      {relevantCategories.length > 0 && project && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <PaperClipIcon className="w-4 h-4 text-slate-400" />
            相關附件
            <span className="font-normal text-xs text-slate-400">（{relevantCategories.map((c) => FILE_CATEGORY_LABEL[c]).join('、')}）</span>
          </div>
          {relevantFiles.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">暫無相關附件</div>
          ) : (
            <div className="space-y-1.5">
              {relevantFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <span className="text-base">{
                    f.file_ext === 'pdf' ? '📄' :
                    ['doc','docx'].includes(f.file_ext) ? '📝' :
                    ['xls','xlsx'].includes(f.file_ext) ? '📊' :
                    ['ppt','pptx'].includes(f.file_ext) ? '📋' :
                    ['png','jpg','jpeg','gif'].includes(f.file_ext) ? '🖼️' : '📎'
                  }</span>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPreviewFile(f)}>
                    <div className="text-sm text-blue-600 hover:text-blue-700 truncate font-medium">{f.file_nm}</div>
                    <div className="text-xs text-slate-400">{FILE_CATEGORY_LABEL[f.file_category]} · {f.uploader} · {f.created_at}</div>
                  </div>
                  <Tooltip title="預覽">
                    <Button size="small" type="text" icon={<EyeIcon className="w-3.5 h-3.5" />} onClick={() => setPreviewFile(f)} />
                  </Tooltip>
                  <Tooltip title="下載">
                    <a href={projectApi.getFileDownloadUrl(record.project_id!, f.id)} target="_blank" rel="noreferrer">
                      <Button size="small" type="text" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />} />
                    </a>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ⑥ 審批流程 ─── */}
      <div>
        <div className="text-sm font-semibold text-slate-700 mb-4">審批流程</div>
        {nodes.length === 0 ? (
          <div className="text-xs text-slate-300 text-center py-6 border border-dashed border-slate-200 rounded-lg">暫無審批節點資訊</div>
        ) : (
          <>
            {/* 水平頭像鏈 */}
            <div className="flex items-end overflow-x-auto pb-1 mb-4">
              {/* 申請人節點 */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                <div className="relative">
                  <Avatar size={38} style={{ background: '#7c3aed', fontSize: 15, fontWeight: 600 }}>
                    {(record.submitter_name || toName(record.submitter))?.[0]?.toUpperCase()}
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                    <CheckIcon className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <div className="text-[11px] font-medium text-slate-700 text-center leading-tight mt-1">
                  {record.submitter_name || toName(record.submitter)}
                </div>
                <div className="text-[10px] text-blue-500">提交申請</div>
              </div>

              {/* 審批節點 */}
              {nodes.map((node, i) => {
                const dotColors: Record<number, string> = { 1: '#16a34a', 2: '#dc2626', 3: '#d97706', 0: '#94a3b8' }
                const actionLabels: Record<number, string> = { 1: '同意審批', 2: '拒絕', 3: '退回', 0: '待審核' }
                const dotColor = dotColors[node.status] ?? '#94a3b8'
                return (
                  <React.Fragment key={node.node_id || i}>
                    {/* 連接線 */}
                    <div className="flex items-center mx-1 mb-8" style={{ minWidth: 28 }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <div className="flex-1 border-t-2 border-dashed border-slate-200" style={{ minWidth: 16 }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200 opacity-60" />
                    </div>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                      <div className="relative">
                        <Avatar size={38} style={{
                          background: node.is_countersign ? '#8b5cf6' : '#2563eb',
                          fontSize: 15, fontWeight: 600,
                          opacity: node.status === 0 ? 0.55 : 1,
                        }}>
                          {(toName(node.approver_work_no || node.approver) || node.approver)?.[0]?.toUpperCase()}
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
                          style={{ background: dotColor }}>
                          {node.status === 1 ? <CheckIcon className="w-2.5 h-2.5 text-white" />
                            : node.status === 2 ? <XMarkIcon className="w-2.5 h-2.5 text-white" />
                            : node.status === 3 ? <ArrowUturnLeftIcon className="w-2.5 h-2.5 text-white" />
                            : <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="text-[11px] font-medium text-slate-700 text-center leading-tight mt-1">{toName(node.approver_work_no || node.approver) || node.approver}</div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px]" style={{ color: dotColor }}>{actionLabels[node.status] ?? '—'}</span>
                        {node.is_countersign && (
                          <Tag style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }} color="purple">加簽</Tag>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}

              {/* 終止節點（已全部通過） */}
              {record.status === 2 && (
                <>
                  <div className="flex items-center mx-1 mb-8" style={{ minWidth: 28 }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-300" />
                    <div className="flex-1 border-t-2 border-dashed border-green-300" style={{ minWidth: 16 }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-200" />
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                    <div className="w-[38px] h-[38px] rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-[11px] font-medium text-green-700 mt-1">審批通過</div>
                    <div className="text-[10px] text-slate-400">已完結</div>
                  </div>
                </>
              )}
            </div>

            {/* 審批歷程表格 */}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">審批人</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">操作</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">時間</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">意見</th>
                </tr>
              </thead>
              <tbody>
                {/* 提交申請行 */}
                <tr>
                  <td className="px-3 py-2.5 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Avatar size={22} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>
                        {(record.submitter_name || toName(record.submitter))?.[0]?.toUpperCase()}
                      </Avatar>
                      <span className="text-xs text-slate-700">{record.submitter_name || toName(record.submitter)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-blue-500">提交申請</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">{record.created_at}</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-300">—</td>
                </tr>
                {/* 各審批節點 */}
                {nodes.map((node) => {
                  const rowColors: Record<number, string> = { 1: '#16a34a', 2: '#dc2626', 3: '#d97706' }
                  const rowLabels: Record<number, string> = { 1: '同意審批', 2: '拒絕', 3: '退回', 0: '待審核' }
                  return (
                    <tr key={node.node_id} className={node.status === 0 ? 'bg-blue-50/30' : ''}>
                      <td className="px-3 py-2.5 border border-slate-200">
                        <div className="flex items-center gap-2">
                          <Avatar size={22} style={{
                            background: node.is_countersign ? '#8b5cf6' : '#2563eb',
                            fontSize: 10, fontWeight: 600,
                          }}>
                            {(toName(node.approver_work_no || node.approver) || node.approver)?.[0]?.toUpperCase()}
                          </Avatar>
                          <span className="text-xs text-slate-700">{toName(node.approver_work_no || node.approver) || node.approver}</span>
                          {node.is_countersign && (
                            <Tag style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }} color="purple">加簽</Tag>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs"
                        style={{ color: rowColors[node.status] ?? '#94a3b8' }}>
                        {rowLabels[node.status] ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">
                        {node.approved_at || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">
                        {node.comment || <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 附件預覽 — 專案檔案 */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          projectId={record.project_id ?? ''}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {/* 附件預覽 — 進度附件（直接 URL） */}
      {previewDirect && (
        <FilePreviewModal
          directUrl={previewDirect.url}
          filename={previewDirect.name}
          onClose={() => setPreviewDirect(null)}
        />
      )}
    </Drawer>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReviewListPage: React.FC = () => {
  const toName = useWorkNoToName()
  const location = useLocation()
  const isSubmitterMode = location.pathname === '/review/submitted'
  const isReviewedMode  = location.pathname === '/review/reviewed'

  const [allRecords,   setAllRecords]   = useState<ApplyRecord[]>([])
  const [myRecords,    setMyRecords]    = useState<ApplyRecord[]>([])
  const [isLoading,    setIsLoading]    = useState(false)
  const [isSaving,     setIsSaving]     = useState(false)
  const [reviewerTab,  setReviewerTab]  = useState('all')
  const [reviewedTab,  setReviewedTab]  = useState('all')
  const [submitterTab, setSubmitterTab] = useState('all')
  const [keyword,      setKeyword]      = useState('')
  const [dateRange,    setDateRange]    = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [detailRecord, setDetailRecord] = useState<ApplyRecord | null>(null)
  const [actionTarget, setActionTarget] = useState<{
    record: ApplyRecord
    action: 'approve' | 'reject' | 'return'
    countersigns?: ChainPerson[]
  } | null>(null)
  const [actionForm]   = Form.useForm()
  const [userOptions,  setUserOptions]  = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    userApi.list({ size: 200 })
      .then((res) => {
        const content = (res as { content?: { data_list?: { work_no: string; name: string }[] } }).content
        const users = content?.data_list ?? []
        setUserOptions(users.map((u) => ({ value: u.work_no, label: u.name })))
      })
      .catch(() => {})
  }, [])

  // 兼容旧版本 apply_type_code 命名，统一归一
  const normalizeRecord = (r: ApplyRecord): ApplyRecord => {
    if (r.apply_type_code === 'function_completion') {
      return { ...r, apply_type_code: 'function_complete', apply_type: '功能完結審核' }
    }
    if (r.apply_type_code === 'function_complete' && r.apply_type !== '功能完結審核') {
      return { ...r, apply_type: '功能完結審核' }
    }
    if (r.apply_type_code === 'duty_completion') {
      return { ...r, apply_type_code: 'duty_complete', apply_type: 'AR完結審核' }
    }
    return r
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [proj, duty, mySubmitted] = await Promise.all([
        projectApi.reviewList({ page: 1, size: 100 }),
        dutyApi.reviewList({ page: 1, size: 100 }),
        projectApi.mySubmittedReviews({ page: 1, size: 200 }),
      ])
      const projContent = proj.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const dutyContent = duty.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const myContent   = mySubmitted.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const projList = (projContent.project_list ?? projContent.data_list ?? []) as ApplyRecord[]
      const dutyList = (dutyContent.project_list ?? dutyContent.data_list ?? []) as ApplyRecord[]
      const myList   = (myContent.project_list ?? myContent.data_list ?? []) as ApplyRecord[]
      const merged = [...projList, ...dutyList]
        .map(normalizeRecord)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setAllRecords(merged)
      setMyRecords(myList.map(normalizeRecord).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch { /* global handler */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const pendingAll = useMemo(() => allRecords.filter((r) => r.is_my_turn),  [allRecords])
  const doneAll    = useMemo(() => allRecords.filter((r) => !r.is_my_turn), [allRecords])

  // 通用篩選：關鍵字 + 時間範圍
  const applyFilters = (list: ApplyRecord[]): ApplyRecord[] => {
    let result = list
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      result = result.filter((r) =>
        (r.project_nm ?? '').toLowerCase().includes(kw) ||
        (r.duty_nm    ?? '').toLowerCase().includes(kw) ||
        (r.function_nm ?? '').toLowerCase().includes(kw) ||
        (r.submitter_name ?? '').toLowerCase().includes(kw) ||
        (r.apply_type ?? '').toLowerCase().includes(kw) ||
        (r.description ?? '').toLowerCase().includes(kw),
      )
    }
    if (dateRange?.[0] && dateRange?.[1]) {
      const [start, end] = dateRange
      result = result.filter((r) => {
        const d = r.created_at ? new Date(r.created_at).getTime() : 0
        return d >= start.startOf('day').valueOf() && d <= end.endOf('day').valueOf()
      })
    }
    return result
  }

  // 待我審核 - 依子標籤過濾（只有待處理）
  const reviewerRecords = useMemo(() => {
    const base = reviewerTab === 'all' ? pendingAll : pendingAll.filter((r) => tabMatchesCodes(reviewerTab, r.apply_type_code))
    return applyFilters(base)
  }, [pendingAll, reviewerTab, keyword, dateRange])

  // 我的審核 - 依子標籤過濾（已審核）
  const reviewedRecords = useMemo(() => {
    const base = reviewedTab === 'all' ? doneAll : doneAll.filter((r) => tabMatchesCodes(reviewedTab, r.apply_type_code))
    return applyFilters(base)
  }, [doneAll, reviewedTab, keyword, dateRange])

  // 我的提交 - 依子標籤過濾
  const submitterRecords = useMemo(() => {
    const base = submitterTab === 'all' ? myRecords : myRecords.filter((r) => tabMatchesCodes(submitterTab, r.apply_type_code))
    return applyFilters(base)
  }, [myRecords, submitterTab, keyword, dateRange])

  // Badge counts
  const pendingCount = pendingAll.length
  const doneCount    = doneAll.length

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleActionConfirm = async (values: Record<string, unknown>) => {
    if (!actionTarget) return
    setIsSaving(true)
    try {
      const { record, action, countersigns } = actionTarget
      const statusMap = { approve: 2, reject: 3, return: 4 }
      const payload: ReviewPayload = {
        status: statusMap[action],
        reject_reason: values.reason as string | undefined,
        ...(action === 'approve' && countersigns?.length ? { countersigns } : {}),
      }

      const isDuty = record.apply_type_code === 'duty_complete'
      if (isDuty) {
        await dutyApi.approveReview(record.id, payload)
      } else {
        await projectApi.approveReview(record.id, payload)
      }

      showToast.success(action === 'approve' ? '審核通過' : action === 'reject' ? '已拒絕' : '已退回')
      setActionTarget(null)
      setDetailRecord(null)
      actionForm.resetFields()
      loadData()
    } catch { /* global handler */ }
    finally { setIsSaving(false) }
  }

  // ─── Table Columns ─────────────────────────────────────────────────────────

  const rawColumns: ColumnsType<ApplyRecord> = [
    {
      title: '申請類型', dataIndex: 'apply_type_code', width: 110,
      render: (_: string, r) => (
        <Tag color={APPLY_TYPE_COLOR[r.apply_type_code]} style={{ fontSize: 11 }}>{r.apply_type}</Tag>
      ),
    },
    {
      title: '相關項目', key: 'target', ellipsis: true,
      render: (_: unknown, r) => {
        const isFuncComplete = r.apply_type_code === 'function_complete'
        const isDutyComplete = r.apply_type_code === 'duty_complete'
        // 用 || 跳過空字串（後端返回 "" 而非 null）
        const primaryName = isFuncComplete
          ? (r.function_nm || r.project_nm || '—')
          : isDutyComplete
          ? (r.duty_nm || '—')
          : (r.project_nm || r.duty_nm || r.function_nm || '—')
        // 功能完結審核：次標題顯示所屬專案
        const secondaryName = isFuncComplete && r.project_nm ? r.project_nm : null
        return (
          <div
            className="cursor-pointer group"
            onClick={() => setDetailRecord(r)}
          >
            <div className="text-slate-700 text-sm font-medium group-hover:text-blue-600 transition-colors">{primaryName}</div>
            {secondaryName && (
              <div className="text-slate-400 text-xs mt-0.5">專案：{secondaryName}</div>
            )}
          </div>
        )
      },
    },
    {
      title: '申請人', dataIndex: 'submitter_name', width: 90,
      render: (v: string, r) => {
        const display = v || toName(r.submitter) || '—'
        return (
          <div className="flex items-center gap-1.5">
            <Avatar size={20} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>
              {display[0]?.toUpperCase()}
            </Avatar>
            <span className="text-sm text-slate-600">{display}</span>
          </div>
        )
      },
    },
    {
      title: '狀態', dataIndex: 'status', width: 88,
      render: (v: number) => {
        const s = REVIEW_STATUS[v]
        return s ? <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag> : v
      },
    },
    {
      title: '審批人', key: 'nodes', width: 160,
      render: (_: unknown, r) => {
        const nodes = [...(r.approval_nodes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        if (nodes.length === 0) return <span className="text-slate-300 text-xs">—</span>
        // status: 0=待審 1=通過 2=拒絕 3=退回
        const dotStyle: Record<number, { bg: string; title: string }> = {
          0: { bg: '#94a3b8', title: '待審核' },
          1: { bg: '#16a34a', title: '已通過' },
          2: { bg: '#dc2626', title: '已拒絕' },
          3: { bg: '#d97706', title: '已退回' },
        }
        return (
          <div className="flex items-center gap-1 flex-wrap">
            {nodes.map((n, i) => {
              const cfg = dotStyle[n.status] ?? dotStyle[0]
              return (
                <React.Fragment key={n.node_id}>
                  <Tooltip title={`${n.approver}（${cfg.title}）`}>
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold cursor-default flex-shrink-0"
                      style={{ background: cfg.bg, outline: n.status === 0 ? '2px solid #cbd5e1' : 'none', outlineOffset: 1 }}
                    >
                      {n.approver?.[0]}
                    </div>
                  </Tooltip>
                  {i < nodes.length - 1 && (
                    <div className="w-3 h-px bg-slate-200 flex-shrink-0" />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        )
      },
    },
    { title: '提交時間', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={4}>
          <Tooltip title="查看詳情">
            <Button
              icon={<EyeIcon className="w-3.5 h-3.5" />} size="small" type="text"
              onClick={() => setDetailRecord(record)}
            />
          </Tooltip>
          {record.is_my_turn && (
            <>
              <Tooltip title="通過">
                <Button
                  icon={<CheckIcon className="w-3.5 h-3.5" />} size="small" type="text"
                  className="text-green-600 hover:text-green-700"
                  onClick={() => setActionTarget({ record, action: 'approve' })}
                />
              </Tooltip>
              <Tooltip title="拒絕">
                <Button
                  icon={<XMarkIcon className="w-3.5 h-3.5" />} size="small" type="text" danger
                  onClick={() => setActionTarget({ record, action: 'reject' })}
                />
              </Tooltip>
              <Tooltip title="退回">
                <Button
                  icon={<ArrowUturnLeftIcon className="w-3.5 h-3.5" />} size="small" type="text"
                  className="text-amber-500 hover:text-amber-600"
                  onClick={() => setActionTarget({ record, action: 'return' })}
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ]

  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  // ─── Render ────────────────────────────────────────────────────────────────

  const actionLabels = { approve: '通過', reject: '拒絕', return: '退回' }
  const actionColors = { approve: '#16a34a', reject: '#dc2626', return: '#d97706' }
  const needReason   = actionTarget?.action !== 'approve'

  const tabContent = (records: ApplyRecord[]) => {
    if (isLoading) return <div className="flex justify-center py-16"><Spin size="large" /></div>
    if (records.length === 0) return <Empty description="暫無記錄" className="py-16" />
    return (
      <Table
        rowKey="id"
        columns={columns}
        components={tableComponents}
        dataSource={records}
        loading={false}
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 條` }}
        size="small"
        scroll={{ x: 900 }}
      />
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">
          {isSubmitterMode ? '我的提交' : isReviewedMode ? '我的審核' : '待我審核'}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {isSubmitterMode
            ? <>共 <span className="text-blue-500 font-semibold">{myRecords.length}</span> 筆提交記錄</>
            : isReviewedMode
            ? <>已審核 <span className="text-blue-500 font-semibold">{doneCount}</span> 筆</>
            : <>待審核 <span className="text-orange-500 font-semibold">{pendingCount}</span> 項</>
          }
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        {/* ── 篩選工具列 ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
          <FunnelIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <Input
            prefix={<MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400" />}
            placeholder="搜尋專案名稱、申請人、申請說明…"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 280 }}
            size="small"
          />
          <DatePicker.RangePicker
            size="small"
            placeholder={['提交開始日期', '提交結束日期']}
            value={dateRange ?? undefined}
            onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
            style={{ width: 240 }}
          />
          {(keyword || dateRange) && (
            <Button
              size="small"
              type="text"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => { setKeyword(''); setDateRange(null) }}
            >
              清除篩選
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {isSubmitterMode
              ? `顯示 ${submitterRecords.length} / ${myRecords.length} 筆`
              : isReviewedMode
              ? `顯示 ${reviewedRecords.length} / ${doneCount} 筆`
              : `顯示 ${reviewerRecords.length} / ${pendingCount} 筆`
            }
          </span>
        </div>

        {/* ── 待我審核面板 ── */}
        {!isSubmitterMode && !isReviewedMode && (
          <Tabs
            activeKey={reviewerTab}
            onChange={setReviewerTab}
            style={{ padding: '0 16px' }}
            items={REVIEWER_TABS.map((tab) => {
              const count = tab.key === 'all'
                ? pendingCount
                : pendingAll.filter((r) => tabMatchesCodes(tab.key, r.apply_type_code)).length
              return {
                key: tab.key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{tab.label}</span></Badge>
                  : tab.label,
                children: tabContent(reviewerRecords),
              }
            })}
          />
        )}

        {/* ── 我的審核面板 ── */}
        {isReviewedMode && (
          <Tabs
            activeKey={reviewedTab}
            onChange={setReviewedTab}
            style={{ padding: '0 16px' }}
            items={REVIEWED_TABS.map((tab) => {
              const count = tab.key === 'all'
                ? doneCount
                : doneAll.filter((r) => tabMatchesCodes(tab.key, r.apply_type_code)).length
              return {
                key: tab.key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{tab.label}</span></Badge>
                  : tab.label,
                children: tabContent(reviewedRecords),
              }
            })}
          />
        )}

        {/* ── 我的提交面板 ── */}
        {isSubmitterMode && (
          <Tabs
            activeKey={submitterTab}
            onChange={setSubmitterTab}
            style={{ padding: '0 16px' }}
            items={SUBMITTER_TABS.map((tab) => {
              const count = tab.key === 'all'
                ? myRecords.length
                : myRecords.filter((r) => tabMatchesCodes(tab.key, r.apply_type_code)).length
              return {
                key: tab.key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{tab.label}</span></Badge>
                  : tab.label,
                children: tabContent(submitterRecords),
              }
            })}
          />
        )}
      </div>

      {/* Detail Drawer */}
      <ReviewDetailDrawer
        record={detailRecord}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        userOptions={userOptions}
        onAction={(action, record, countersigns) => {
          setDetailRecord(null)
          setActionTarget({ record, action, countersigns })
        }}
      />

      {/* Action Confirm Modal (通過 / 拒絕 / 退回) */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {actionTarget?.action === 'approve' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
            {actionTarget?.action === 'reject'  && <XMarkIcon className="w-5 h-5 text-red-500" />}
            {actionTarget?.action === 'return'  && <ArrowUturnLeftIcon className="w-5 h-5 text-amber-500" />}
            <span>確認{actionTarget ? actionLabels[actionTarget.action] : ''}</span>
          </div>
        }
        open={!!actionTarget}
        onCancel={() => { setActionTarget(null); actionForm.resetFields() }}
        footer={null}
        width={420}
        destroyOnHidden
      >
        <div className="mt-1 mb-4 text-sm text-slate-500">
          對「{actionTarget?.record.project_nm ?? actionTarget?.record.duty_nm ?? actionTarget?.record.function_nm}」
          提交{actionTarget ? actionLabels[actionTarget.action] : ''}審核意見
        </div>
        <Form form={actionForm} layout="vertical" onFinish={handleActionConfirm}>
          {needReason && (
            <Form.Item
              name="reason"
              label={`${actionTarget ? actionLabels[actionTarget.action] : ''}原因`}
              rules={[{ required: true, message: '請填寫原因' }]}
            >
              <Input.TextArea rows={3} placeholder={`請填寫${actionTarget ? actionLabels[actionTarget.action] : ''}原因`} />
            </Form.Item>
          )}
          {actionTarget?.action === 'approve' && !!actionTarget.countersigns?.length && (
            <div className="mb-3 flex items-start gap-2 text-sm text-slate-500 bg-blue-50 rounded px-3 py-2">
              <UserPlusIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                通過後，流程將依序轉至加簽人員：
                <span className="font-semibold text-blue-700 ml-1">
                  {actionTarget.countersigns.map((cs, i) => (
                    <span key={cs.work_no}>{i > 0 ? ' → ' : ''}{cs.name}</span>
                  ))}
                </span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-2">
            <Button onClick={() => { setActionTarget(null); actionForm.resetFields() }}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSaving}
              style={{ background: actionTarget ? actionColors[actionTarget.action] : '#2563eb' }}
            >
              確認{actionTarget ? actionLabels[actionTarget.action] : ''}
            </Button>
          </div>
        </Form>
      </Modal>

    </div>
  )
}

export default ReviewListPage
