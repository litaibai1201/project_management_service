import React, { useEffect, useState, useMemo } from 'react'
import {
  Tabs, Table, Button, Tag, Modal, Form, Input, Select, Space,
  Avatar, Badge, Tooltip, Drawer, Descriptions, Divider, Steps, Spin, Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckIcon, XMarkIcon, ArrowUturnLeftIcon, UserPlusIcon, EyeIcon,
  ClockIcon, CheckCircleIcon, ExclamationTriangleIcon,
  DocumentTextIcon, InformationCircleIcon, PaperClipIcon,
  ArrowDownTrayIcon, BuildingOfficeIcon, UserIcon, PlusIcon,
} from '@heroicons/react/24/outline'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { ApplyRecord, ApprovalNode, Project, ProjectFile, ReviewPayload } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import FilePreviewModal from './FilePreviewModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: '待審核', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
  4: { label: '已退回', color: 'warning'    },
}

const APPLY_TYPE_COLOR: Record<string, string> = {
  initiate:           'blue',
  plan:               'geekblue',
  function_complete:  'cyan',
  project_complete:   'green',
  duty_complete:      'purple',
  requirement_change: 'orange',
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
    what:    '申請人提交了專案規劃方案，希望通過審核後進入執行',
    approve: '通過後，專案將進入「執行中」階段，可以開始開發',
    reject:  '拒絕後，專案退回規劃中，申請人需調整方案後重新提交',
    icon:    '📋',
  },
  function_complete: {
    what:    '負責人認為此功能任務已完成，申請完結審核',
    approve: '通過後，功能任務將標記為「已完結」',
    reject:  '拒絕後，功能任務退回執行中，負責人需繼續完善',
    icon:    '✅',
  },
  project_complete: {
    what:    '專案PM認為所有任務已完成，申請整個專案完結',
    approve: '通過後，專案將進入「已完結」狀態，歸檔記錄',
    reject:  '拒絕後，專案退回執行中，需繼續完善後再申請',
    icon:    '🎯',
  },
  duty_complete: {
    what:    '負責人認為此臨時任務已完成，申請完結確認',
    approve: '通過後，臨時任務將標記為「已完結」',
    reject:  '拒絕後，任務退回執行中，負責人需繼續完善',
    icon:    '📌',
  },
  requirement_change: {
    what:    '申請人希望在執行階段補充或修改需求文件/設計文件',
    approve: '通過後，申請人可以上傳需求文件和規劃設計文件',
    reject:  '拒絕後，需求變更申請關閉，文件鎖定狀態不變',
    icon:    '📝',
  },
}

const APPLY_TYPE_TABS = [
  { key: 'pending',           label: '全部待審'  },
  { key: 'initiate',          label: '立案申請'  },
  { key: 'plan',              label: '規劃審核'  },
  { key: 'function_complete', label: '功能完結'  },
  { key: 'project_complete',  label: '專案完結'  },
  { key: 'duty_complete',     label: '臨時任務'  },
  { key: 'done',              label: '已審核'    },
]

// ─── Apply type → Overall workflow steps mapping ───────────────────────────────
const WORKFLOW_STEPS: Record<string, string[]> = {
  initiate:           ['提交申請', '審核中', '立案完成'],
  plan:               ['提交方案', '審核中', '規劃確認'],
  function_complete:  ['提交完結', '審核中', '功能完結'],
  project_complete:   ['提交申請', '審核中', '專案完結'],
  duty_complete:      ['提交申請', '審核中', '任務完結'],
  requirement_change: ['提交申請', '審核中', '變更通過'],
}


// ─── Three-phase Approval Chain ────────────────────────────────────────────────
const ApprovalChain: React.FC<{ nodes: ApprovalNode[]; currentUserWorkNo?: string }> = ({
  nodes,
  currentUserWorkNo = 'MGR001',   // simulate current logged-in user
}) => {
  const sorted = [...nodes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // Find the current active node (first pending)
  const firstPendingOrder = sorted.find((n) => n.status === 0)?.order ?? Infinity

  const pastNodes    = sorted.filter((n) => n.status !== 0)
  const currentNode  = sorted.find((n) => n.status === 0 && n.order === firstPendingOrder) ?? null
  const futureNodes  = sorted.filter((n) => n.status === 0 && n.order > firstPendingOrder)

  const isMyTurn = currentNode?.approver_work_no === currentUserWorkNo

  const outcomeConfig: Record<number, { label: string; color: string; bg: string; border: string }> = {
    1: { label: '已通過', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    2: { label: '已拒絕', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    3: { label: '已退回', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  }

  const PastNode: React.FC<{ node: ApprovalNode; isLast: boolean }> = ({ node, isLast }) => {
    const cfg = outcomeConfig[node.status] ?? outcomeConfig[1]
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center flex-shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center border-2 text-white text-xs font-bold"
            style={{ borderColor: cfg.color, background: cfg.color }}
          >
            {node.status === 1 ? '✓' : node.status === 2 ? '✕' : '↩'}
          </div>
          {(!isLast || currentNode || futureNodes.length > 0) && (
            <div className="w-0.5 flex-1 bg-slate-200 my-1.5" style={{ minHeight: 16 }} />
          )}
        </div>
        <div className="flex-1 pb-3">
          <div className="rounded-xl p-3 border" style={{ background: cfg.bg, borderColor: cfg.border }}>
            <div className="flex items-center gap-2 mb-1">
              <Avatar size={20} style={{ background: cfg.color, fontSize: 9, fontWeight: 700 }}>
                {node.approver?.[0]}
              </Avatar>
              <span className="font-semibold text-sm" style={{ color: cfg.color }}>{node.approver}</span>
              {node.is_countersign && (
                <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>加簽</Tag>
              )}
              <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px', color: cfg.color, borderColor: cfg.border, background: 'white' }}>
                {cfg.label}
              </Tag>
              <span className="text-xs text-slate-400 ml-auto">{node.approved_at}</span>
            </div>
            {node.comment ? (
              <div className="text-xs text-slate-600 mt-1.5 leading-relaxed pl-1 border-l-2" style={{ borderColor: cfg.color }}>
                「{node.comment}」
              </div>
            ) : (
              <div className="text-xs text-slate-300 mt-1 italic">未留審批意見</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Past completed nodes */}
      {pastNodes.length > 0 && (
        <div className="mb-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <CheckCircleIcon className="w-3 h-3" />已完成審批
          </div>
          {pastNodes.map((n, i) => (
            <PastNode key={n.node_id} node={n} isLast={i === pastNodes.length - 1} />
          ))}
        </div>
      )}

      {/* Current awaiting node */}
      {currentNode && (
        <div className="flex gap-3">
          <div className="flex flex-col items-center flex-shrink-0">
            {/* Animated pulse ring */}
            <div className="relative w-8 h-8 flex items-center justify-center flex-shrink-0">
              <div className="absolute inset-0 rounded-full bg-blue-400 opacity-20 animate-ping" />
              <div className="w-8 h-8 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center">
                <ClockIcon className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            {futureNodes.length > 0 && (
              <div className="w-0.5 flex-1 bg-slate-200 my-1.5" style={{ minHeight: 16 }} />
            )}
          </div>
          <div className="flex-1 pb-3">
            <div className="rounded-xl p-3 border-2 border-blue-300 bg-blue-50 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Avatar size={20} style={{ background: '#2563eb', fontSize: 9, fontWeight: 700 }}>
                  {currentNode.approver?.[0]}
                </Avatar>
                <span className="font-semibold text-sm text-blue-700">{currentNode.approver}</span>
                {currentNode.is_countersign && (
                  <Tag color="orange" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>加簽</Tag>
                )}
                <Tag color="processing" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>
                  等待審核
                </Tag>
                {isMyTurn && (
                  <div className="ml-auto flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span>👈</span> 待您審核
                  </div>
                )}
              </div>
              <div className="text-xs text-blue-500 mt-1">
                {isMyTurn
                  ? '此步驟需要您來做出審批決定，請在下方選擇通過、拒絕或退回。'
                  : `此步驟正在等待 ${currentNode.approver} 審核，您的決定將影響後續流程。`
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Future nodes */}
      {futureNodes.length > 0 && (
        <div className="mt-1">
          <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <InformationCircleIcon className="w-3 h-3" />後續審批流程
          </div>
          {futureNodes.map((node, i) => (
            <div key={node.node_id} className="flex gap-3">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-slate-300 bg-white flex items-center justify-center">
                  <span className="text-xs font-bold text-slate-300">{node.order}</span>
                </div>
                {i < futureNodes.length - 1 && (
                  <div className="w-0.5 flex-1 bg-slate-100 my-1.5" style={{ minHeight: 16, borderRight: '2px dashed #e2e8f0' }} />
                )}
              </div>
              <div className="flex-1 pb-3">
                <div className="rounded-xl p-3 border border-dashed border-slate-200 bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Avatar size={20} style={{ background: '#e2e8f0', color: '#94a3b8', fontSize: 9, fontWeight: 700 }}>
                      {node.approver?.[0]}
                    </Avatar>
                    <span className="text-sm text-slate-400 font-medium">{node.approver}</span>
                    {node.is_countersign && (
                      <Tag color="default" style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px' }}>加簽</Tag>
                    )}
                    <Tag style={{ fontSize: 9, padding: '0 3px', margin: 0, lineHeight: '14px', color: '#94a3b8', borderColor: '#e2e8f0' }}>
                      待輪到
                    </Tag>
                  </div>
                  <div className="text-xs text-slate-300 mt-1">前序審批完成後，將由此人繼續審核</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All done */}
      {!currentNode && futureNodes.length === 0 && pastNodes.length > 0 && (
        <div className="flex items-center gap-2 mt-1 py-2 px-3 bg-green-50 rounded-xl border border-green-100">
          <CheckCircleIcon className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-700">審批流程已全部完成</span>
        </div>
      )}
    </div>
  )
}

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

// ─── Detail Drawer ────────────────────────────────────────────────────────────

const ReviewDetailDrawer: React.FC<{
  record: ApplyRecord | null
  open: boolean
  onClose: () => void
  userOptions: { value: string; label: string }[]
  onAction: (action: 'approve' | 'reject' | 'return', record: ApplyRecord, countersigns?: ChainPerson[]) => void
}> = ({ record, open, onClose, userOptions, onAction }) => {
  const [project,            setProject]            = useState<Project | null>(null)
  const [files,              setFiles]              = useState<ProjectFile[]>([])
  const [projectLoading,     setProjectLoading]     = useState(false)
  const [previewFile,        setPreviewFile]        = useState<ProjectFile | null>(null)
  const [countersignPeople,  setCountersignPeople]  = useState<ChainPerson[]>([])

  useEffect(() => { setCountersignPeople([]) }, [record?.id])

  useEffect(() => {
    if (!record?.project_id) { setProject(null); setFiles([]); return }
    setProjectLoading(true)
    Promise.all([
      projectApi.get(record.project_id),
      projectApi.listFiles(record.project_id),
    ]).then(([pRes, fRes]) => {
      setProject(pRes.content as Project)
      setFiles(Array.isArray(fRes.content) ? (fRes.content as ProjectFile[]) : [])
    }).catch(() => {}).finally(() => setProjectLoading(false))
  }, [record?.project_id])

  if (!record) return null

  const targetName    = record.project_nm || record.duty_nm || record.function_nm || '—'
  const nodes         = [...(record.approval_nodes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const approvedCnt   = nodes.filter((n) => n.status === 1).length
  const workflowSteps = WORKFLOW_STEPS[record.apply_type_code] ?? ['提交申請', '審核中', '完成']
  const overallStep   = record.status === 1
    ? Math.min(approvedCnt + 1, workflowSteps.length - 1)
    : workflowSteps.length - 1

  // 本次審批需要展示的附件分類
  const relevantCategories = STAGE_FILES[record.apply_type_code] ?? []
  const relevantFiles = files.filter((f) => relevantCategories.includes(f.file_category))

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
      width={600}
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
      {/* ① 審批摘要 */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 text-base truncate">{targetName}</div>
            {record.function_nm && record.project_nm && (
              <div className="text-xs text-slate-400 mt-0.5">功能任務 · {record.project_nm}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <Avatar size={16} style={{ background: '#7c3aed', fontSize: 8, fontWeight: 600 }}>
              {(record.submitter_name || record.submitter)?.[0]?.toUpperCase()}
            </Avatar>
            <span>申請人：<span className="font-medium text-slate-700">{record.submitter_name || record.submitter}</span></span>
          </div>
          <span>提交：{record.created_at}</span>
          {nodes.length > 0 && (
            <span>審批進度：<span className="text-blue-600 font-semibold">{approvedCnt}/{nodes.length}</span></span>
          )}
        </div>
      </div>

      {/* ② 審批階段進度 */}
      <div className="mb-5">
        <Steps size="small" current={overallStep}
          status={record.status === 3 || record.status === 4 ? 'error' : 'process'}
          items={workflowSteps.map((s) => ({ title: <span className="text-xs">{s}</span> }))}
        />
      </div>

      {/* ③ 申請說明（如有） */}
      {record.description && (
        <div className="mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <InformationCircleIcon className="w-3.5 h-3.5" />申請說明
          </div>
          <div className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-xl p-3 leading-relaxed">
            {record.description}
          </div>
        </div>
      )}

      {/* ④ 專案資料（核心：讓主管看到要審批什麼） */}
      {record.project_id && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <DocumentTextIcon className="w-3.5 h-3.5" />
            專案資料
            {APPLY_TYPE_META[record.apply_type_code] && (
              <span className="font-normal text-slate-400">· {APPLY_TYPE_META[record.apply_type_code].what}</span>
            )}
          </div>

          {projectLoading ? (
            <div className="flex justify-center py-6"><Spin size="small" /></div>
          ) : project ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {/* 基本信息 */}
              <div className="p-4 bg-white">
                <Descriptions column={2} size="small"
                  labelStyle={{ color: '#94a3b8', fontSize: 11, whiteSpace: 'nowrap' }}
                  contentStyle={{ fontSize: 12, fontWeight: 500 }}
                >
                  <Descriptions.Item label={<span className="flex items-center gap-1"><BuildingOfficeIcon className="w-3 h-3" />所屬部門</span>}>
                    {project.department || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={<span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />産品PM</span>}>
                    {project.product_pm || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={<span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />專案PM</span>}>
                    {project.project_pm || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="預計完成">
                    {project.expected_end_date || '—'}
                  </Descriptions.Item>
                </Descriptions>

                {/* 專案描述 */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400 mb-1">專案描述</div>
                  <div className="text-sm text-slate-700 leading-relaxed">{project.describe || '—'}</div>
                </div>

                {/* 預期效益（立案審核時特別重要） */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-400 mb-1">預期效益</div>
                  <div className="text-sm text-slate-700 leading-relaxed">{project.expected_benefit || '—'}</div>
                </div>
              </div>

              {/* 相關附件 */}
              {relevantCategories.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-2">
                    <PaperClipIcon className="w-3.5 h-3.5" />
                    相關附件
                    <span className="font-normal text-slate-400">
                      （{relevantCategories.map((c) => FILE_CATEGORY_LABEL[c]).join('、')}）
                    </span>
                  </div>
                  {relevantFiles.length === 0 ? (
                    <div className="text-xs text-slate-400 py-2">暫無相關附件</div>
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
                            <div className="text-xs text-slate-400 flex items-center gap-1.5">
                              <Tag style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
                                {FILE_CATEGORY_LABEL[f.file_category]}
                              </Tag>
                              <span>{f.uploader}</span>
                              <span>·</span>
                              <span>{f.created_at}</span>
                            </div>
                          </div>
                          <Tooltip title="預覽">
                            <Button size="small" type="text"
                              icon={<EyeIcon className="w-3.5 h-3.5" />}
                              onClick={() => setPreviewFile(f)} />
                          </Tooltip>
                          <Tooltip title="下載">
                            <a href={projectApi.getFileDownloadUrl(record.project_id!, f.id)}
                              target="_blank" rel="noreferrer">
                              <Button size="small" type="text" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />} />
                            </a>
                          </Tooltip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400 text-center py-4">無法載入專案資料</div>
          )}
        </div>
      )}

      <Divider style={{ margin: '0 0 16px' }} />

      {/* ⑤ 審批流程詳情 */}
      <div>
        <div className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
          <ExclamationTriangleIcon className="w-3.5 h-3.5" />審批流程
        </div>
        {nodes.length === 0 ? (
          <div className="text-xs text-slate-300 text-center py-6">暫無審批節點資訊</div>
        ) : (
          <ApprovalChain nodes={nodes} />
        )}
      </div>

      {/* 附件預覽 */}
      <FilePreviewModal
        file={previewFile}
        projectId={record.project_id ?? ''}
        onClose={() => setPreviewFile(null)}
      />
    </Drawer>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReviewListPage: React.FC = () => {
  const [allRecords,   setAllRecords]   = useState<ApplyRecord[]>([])
  const [isLoading,    setIsLoading]    = useState(false)
  const [isSaving,     setIsSaving]     = useState(false)
  const [activeTab,    setActiveTab]    = useState('pending')
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

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [proj, duty] = await Promise.all([
        projectApi.reviewList({ page: 1, size: 100 }),
        dutyApi.reviewList({ page: 1, size: 100 }),
      ])
      const projContent = proj.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const dutyContent = duty.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const projList = (projContent.project_list ?? projContent.data_list ?? []) as ApplyRecord[]
      const dutyList = (dutyContent.project_list ?? dutyContent.data_list ?? []) as ApplyRecord[]
      const merged = [...projList, ...dutyList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      setAllRecords(merged)
    } catch { /* global handler */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  // Filter records by tab
  const displayedRecords = useMemo(() => {
    if (activeTab === 'pending') return allRecords.filter((r) => r.is_my_turn)
    if (activeTab === 'done')    return allRecords.filter((r) => !r.is_my_turn)
    return allRecords.filter((r) => r.apply_type_code === activeTab && r.is_my_turn)
  }, [allRecords, activeTab])

  // Tab badge counts
  const pendingCount  = allRecords.filter((r) => r.is_my_turn).length
  const doneCount     = allRecords.filter((r) => !r.is_my_turn).length

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

  const columns: ColumnsType<ApplyRecord> = [
    {
      title: '申請類型', dataIndex: 'apply_type_code', width: 110,
      render: (_: string, r) => (
        <Tag color={APPLY_TYPE_COLOR[r.apply_type_code]} style={{ fontSize: 11 }}>{r.apply_type}</Tag>
      ),
    },
    {
      title: '相關項目', key: 'target', ellipsis: true,
      render: (_: unknown, r) => {
        const name = r.project_nm ?? r.duty_nm ?? r.function_nm ?? '—'
        const meta = APPLY_TYPE_META[r.apply_type_code]
        return (
          <div
            className="cursor-pointer group"
            onClick={() => setDetailRecord(r)}
          >
            <div className="text-slate-700 text-sm font-medium group-hover:text-blue-600 transition-colors">{name}</div>
            {meta && <div className="text-slate-400 text-xs mt-0.5">{meta.what}</div>}
          </div>
        )
      },
    },
    {
      title: '申請人', dataIndex: 'submitter_name', width: 90,
      render: (v: string, r) => {
        const display = v || r.submitter || '—'
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
        <h1 className="text-2xl font-bold text-slate-800">審批中心</h1>
        <p className="text-slate-400 text-sm mt-1">
          待審核 <span className="text-orange-500 font-semibold">{pendingCount}</span> 項 · 已審核 {doneCount} 項
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ padding: '0 16px' }}
          items={APPLY_TYPE_TABS.map((tab) => {
            const count = tab.key === 'pending'
              ? pendingCount
              : tab.key === 'done'
              ? doneCount
              : allRecords.filter((r) => r.apply_type_code === tab.key && r.is_my_turn).length

            return {
              key:   tab.key,
              label: count > 0
                ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{tab.label}</span></Badge>
                : tab.label,
              children: tabContent(displayedRecords),
            }
          })}
        />
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
