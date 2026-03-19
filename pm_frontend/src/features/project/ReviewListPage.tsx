import React, { useEffect, useState, useMemo } from 'react'
import {
  Tabs, Table, Button, Tag, Modal, Form, Input, Select, Space,
  Avatar, Badge, Tooltip, Drawer, Descriptions, Divider, Steps,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckIcon, XMarkIcon, ArrowUturnLeftIcon, UserPlusIcon, EyeIcon,
  ClockIcon, CheckCircleIcon, ExclamationTriangleIcon,
  DocumentTextIcon, InformationCircleIcon,
} from '@heroicons/react/24/outline'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { ApplyRecord, ApprovalNode } from '@/types/api.types'
import { showToast } from '@/utils/toast'

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: '待審核', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
  4: { label: '已退回', color: 'warning'    },
}

const APPLY_TYPE_COLOR: Record<string, string> = {
  initiate:         'blue',
  plan:             'geekblue',
  function_complete: 'cyan',
  project_complete:  'green',
  duty_complete:     'purple',
}

const APPLY_TYPE_TABS = [
  { key: 'pending',          label: '全部待審'  },
  { key: 'initiate',         label: '立案申請'  },
  { key: 'plan',             label: '規劃審核'  },
  { key: 'function_complete', label: '功能完結' },
  { key: 'project_complete',  label: '專案完結' },
  { key: 'duty_complete',     label: '臨時任務' },
  { key: 'done',             label: '已審核'    },
]


// (user options for 加簽 loaded from API in ReviewListPage)

// ─── Apply type → Overall workflow steps mapping ───────────────────────────────
const WORKFLOW_STEPS: Record<string, string[]> = {
  initiate:          ['提交申請', '直屬主管審核', '部門主管審核', '立案完成'],
  plan:              ['提交方案', '架構師主管審核', '部門主管審核', '規劃確認'],
  function_complete: ['提交完結', '架構師確認', '功能已完結'],
  project_complete:  ['提交申請', '直屬主管審核', '部門主管審核', '專案完結'],
  duty_complete:     ['提交申請', '直屬主管審核', '任務完結'],
}

// ─── Three-phase Approval Chain ────────────────────────────────────────────────
const ApprovalChain: React.FC<{ nodes: ApprovalNode[]; currentUserWorkNo?: string }> = ({
  nodes,
  currentUserWorkNo = 'MGR001',   // simulate current logged-in user
}) => {
  const sorted = [...nodes].sort((a, b) => a.order - b.order)

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

// ─── Detail Drawer ────────────────────────────────────────────────────────────

const ReviewDetailDrawer: React.FC<{
  record: ApplyRecord | null
  open: boolean
  onClose: () => void
  onAction: (action: 'approve' | 'reject' | 'return', record: ApplyRecord) => void
  onCountersign: (record: ApplyRecord) => void
}> = ({ record, open, onClose, onAction, onCountersign }) => {
  if (!record) return null

  const isPending = record.status === 1
  const targetName = record.project_nm ?? record.duty_nm ?? record.function_nm ?? '—'
  const nodes = [...(record.approval_nodes ?? [])].sort((a, b) => a.order - b.order)
  const totalNodes   = nodes.length
  const approvedCnt  = nodes.filter((n) => n.status === 1).length
  const workflowSteps = WORKFLOW_STEPS[record.apply_type_code] ?? ['提交申請', '審核中', '完成']

  // Overall progress step for the Steps component
  const overallStep = record.status === 1
    ? Math.min(approvedCnt + 1, workflowSteps.length - 1)
    : workflowSteps.length - 1

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <Tag color={APPLY_TYPE_COLOR[record.apply_type_code]} style={{ margin: 0 }}>
            {record.apply_type}
          </Tag>
          <span className="text-slate-700 font-semibold truncate">{targetName}</span>
        </div>
      }
      open={open}
      onClose={onClose}
      width={560}
      footer={
        isPending ? (
          <div className="flex gap-2 justify-end">
            <Tooltip title="加簽（在當前節點後追加審批人）">
              <Button icon={<UserPlusIcon className="w-4 h-4" />} onClick={() => onCountersign(record)}>
                加簽
              </Button>
            </Tooltip>
            <Button icon={<ArrowUturnLeftIcon className="w-4 h-4" />} onClick={() => onAction('return', record)}>
              退回
            </Button>
            <Button danger icon={<XMarkIcon className="w-4 h-4" />} onClick={() => onAction('reject', record)}>
              拒絕
            </Button>
            <Button
              type="primary"
              icon={<CheckIcon className="w-4 h-4" />}
              onClick={() => onAction('approve', record)}
              style={{ background: '#16a34a' }}
            >
              通過
            </Button>
          </div>
        ) : null
      }
    >
      {/* ① 申請摘要 */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-xs text-slate-400 mb-0.5">申請標的</div>
            <div className="font-semibold text-slate-800">{targetName}</div>
            {record.function_nm && record.project_nm && (
              <div className="text-xs text-slate-400 mt-0.5">功能任務 · {record.project_nm}</div>
            )}
          </div>
          <Tag color={REVIEW_STATUS[record.status]?.color} style={{ flexShrink: 0 }}>
            {REVIEW_STATUS[record.status]?.label}
          </Tag>
        </div>
        <Descriptions column={2} size="small"
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          contentStyle={{ fontSize: 12, fontWeight: 500 }}
        >
          <Descriptions.Item label="申請人">
            <div className="flex items-center gap-1">
              <Avatar size={16} style={{ background: '#7c3aed', fontSize: 9, fontWeight: 600 }}>
                {(record.submitter_name ?? record.submitter)?.[0]?.toUpperCase()}
              </Avatar>
              {record.submitter_name ?? record.submitter}
            </div>
          </Descriptions.Item>
          <Descriptions.Item label="提交時間">{record.created_at}</Descriptions.Item>
          {totalNodes > 0 && (
            <Descriptions.Item label="審批進度" span={2}>
              <span className="text-blue-600 font-semibold">{approvedCnt}</span>
              <span className="text-slate-400"> / {totalNodes} 節點已完成</span>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ② 整體流程進度條 */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
          <DocumentTextIcon className="w-3.5 h-3.5" />整體審批階段
        </div>
        <Steps
          size="small"
          current={overallStep}
          status={record.status === 3 ? 'error' : record.status === 4 ? 'error' : 'process'}
          items={workflowSteps.map((s) => ({ title: <span className="text-xs">{s}</span> }))}
        />
      </div>

      {/* ③ 申請說明 */}
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

      <Divider style={{ margin: '0 0 16px' }} />

      {/* ④ 審批流程（三段式） */}
      <div>
        <div className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
          <ExclamationTriangleIcon className="w-3.5 h-3.5" />
          審批流程詳情
          <span className="text-slate-300 font-normal">· 包含歷史記錄與後續流程</span>
        </div>

        {nodes.length === 0 ? (
          <div className="text-xs text-slate-300 text-center py-6">暫無審批節點資訊</div>
        ) : (
          <ApprovalChain nodes={nodes} />
        )}
      </div>
    </Drawer>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReviewListPage: React.FC = () => {
  const [allRecords,    setAllRecords]    = useState<ApplyRecord[]>([])
  const [isLoading,     setIsLoading]     = useState(false)
  const [isSaving,      setIsSaving]      = useState(false)
  const [activeTab,     setActiveTab]     = useState('pending')
  const [detailRecord,  setDetailRecord]  = useState<ApplyRecord | null>(null)
  const [actionTarget,  setActionTarget]  = useState<{ record: ApplyRecord; action: 'approve' | 'reject' | 'return' } | null>(null)
  const [countersignTarget, setCountersignTarget] = useState<ApplyRecord | null>(null)
  const [actionForm]    = Form.useForm()
  const [csForm]        = Form.useForm()
  const [userOptions,   setUserOptions]   = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    userApi.list({ size: 200 })
      .then((res) => {
        const users = (res as { content?: { users?: { work_no: string; name: string }[] } }).content?.users ?? []
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
    if (activeTab === 'pending') return allRecords.filter((r) => r.status === 1)
    if (activeTab === 'done')    return allRecords.filter((r) => r.status !== 1)
    return allRecords.filter((r) => r.apply_type_code === activeTab && r.status === 1)
  }, [allRecords, activeTab])

  // Tab badge counts
  const pendingCount  = allRecords.filter((r) => r.status === 1).length
  const doneCount     = allRecords.filter((r) => r.status !== 1).length

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleActionConfirm = async (values: Record<string, unknown>) => {
    if (!actionTarget) return
    setIsSaving(true)
    try {
      const { record, action } = actionTarget
      const statusMap = { approve: 2, reject: 3, return: 4 }
      const payload = {
        status: statusMap[action],
        reject_reason: values.reason as string | undefined,
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

  const handleCountersign = async (values: Record<string, unknown>) => {
    if (!countersignTarget) return
    setIsSaving(true)
    try {
      const isDuty = countersignTarget.apply_type_code === 'duty_complete'
      const payload = {
        approver_work_no: values.work_no as string,
        approver_name: userOptions.find((u) => u.value === values.work_no)?.label ?? values.work_no as string,
      }
      if (isDuty) {
        await dutyApi.countersignReview(countersignTarget.id, payload)
      } else {
        await projectApi.countersignReview(countersignTarget.id, payload)
      }
      showToast.success('加簽成功')
      setCountersignTarget(null)
      csForm.resetFields()
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
        const sub  = r.function_nm && r.project_nm ? r.function_nm : null
        return (
          <div>
            <div className="text-slate-700 text-sm font-medium truncate">{name}</div>
            {sub && <div className="text-slate-400 text-xs truncate">{sub}</div>}
          </div>
        )
      },
    },
    {
      title: '申請人', dataIndex: 'submitter_name', width: 90,
      render: (v: string, r) => (
        <div className="flex items-center gap-1.5">
          <Avatar size={20} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>
            {(v ?? r.submitter)?.[0]?.toUpperCase()}
          </Avatar>
          <span className="text-sm text-slate-600">{v ?? r.submitter}</span>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 88,
      render: (v: number) => {
        const s = REVIEW_STATUS[v]
        return s ? <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag> : v
      },
    },
    {
      title: '審批進度', key: 'nodes', width: 130,
      render: (_: unknown, r) => {
        const nodes = r.approval_nodes ?? []
        const total    = nodes.length
        const approved = nodes.filter((n) => n.status === 1).length
        const current  = nodes.find((n) => n.status === 0)
        return total > 0 ? (
          <div>
            <div className="text-xs text-slate-500 mb-1">
              {approved}/{total} 節點通過
            </div>
            {current && (
              <div className="text-xs text-slate-400 flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                待 {current.approver} 審核
              </div>
            )}
          </div>
        ) : <span className="text-slate-300 text-xs">—</span>
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
          {record.status === 1 && (
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
              : allRecords.filter((r) => r.apply_type_code === tab.key && r.status === 1).length

            return {
              key: tab.key,
              label: count > 0
                ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{tab.label}</span></Badge>
                : tab.label,
              children: (
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={displayedRecords}
                  loading={isLoading}
                  pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 條` }}
                  size="middle"
                  scroll={{ x: 900 }}
                />
              ),
            }
          })}
        />
      </div>

      {/* Detail Drawer */}
      <ReviewDetailDrawer
        record={detailRecord}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        onAction={(action, record) => {
          setDetailRecord(null)
          setActionTarget({ record, action })
        }}
        onCountersign={(record) => {
          setDetailRecord(null)
          setCountersignTarget(record)
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
        destroyOnClose
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

      {/* Countersign Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <UserPlusIcon className="w-5 h-5 text-blue-500" />
            <span>加簽</span>
          </div>
        }
        open={!!countersignTarget}
        onCancel={() => { setCountersignTarget(null); csForm.resetFields() }}
        footer={null}
        width={380}
        destroyOnClose
      >
        <div className="mt-1 mb-4 text-sm text-slate-500">
          追加審批人員，加簽後的節點將插入當前審批節點之後
        </div>
        <Form form={csForm} layout="vertical" onFinish={handleCountersign}>
          <Form.Item name="work_no" label="選擇加簽人員" rules={[{ required: true, message: '請選擇人員' }]}>
            <Select
              placeholder="請選擇審批人員"
              options={userOptions}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setCountersignTarget(null); csForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>
              確認加簽
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default ReviewListPage
