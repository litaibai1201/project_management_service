/**
 * MilestoneTab — 里程碑管理 Tab
 * 顯示項目里程碑列表，支持 新增 / 編輯 / 刪除
 */
import React, { useEffect, useState } from 'react'
import {
  Button, Table, Tag, Modal, Form, Input, Select, Tooltip,
  Popconfirm, Space, Progress, Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusIcon, PencilIcon, TrashIcon, CheckCircleIcon,
  ClockIcon, ExclamationCircleIcon,
} from '@heroicons/react/24/outline'
import { projectApi } from '@/api/project.api'
import { Milestone, ProjectFunction } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

// ─── Status helpers ───────────────────────────────────────────────────────────
const MS_STATUS_CONFIG = {
  pending:  { label: '進行中', color: 'processing', icon: <ClockIcon className="w-3.5 h-3.5 text-blue-500" />      },
  achieved: { label: '已達成', color: 'success',    icon: <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> },
  overdue:  { label: '已逾期', color: 'error',      icon: <ExclamationCircleIcon className="w-3.5 h-3.5 text-red-500" /> },
} as const

type MsStatus = keyof typeof MS_STATUS_CONFIG

const DaysDisplay: React.FC<{ date: string; status: MsStatus }> = ({ date, status }) => {
  if (status === 'achieved') return <span className="text-green-600 text-xs font-medium">{date}</span>
  const diff = dayjs(date).diff(dayjs(), 'day')
  if (diff < 0) return <span className="days-overdue">{date} · 逾期 {Math.abs(diff)} 天</span>
  if (diff === 0) return <span className="days-overdue">{date} · 今天截止</span>
  if (diff <= 7)  return <span className="days-warning">{date} · 剩 {diff} 天</span>
  return <span className="days-ok">{date}</span>
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  projectId: string
  functions: ProjectFunction[]  // for linking milestones to functions
  canManage?: boolean           // project_pm / product_pm / supervisor only
}

const MilestoneTab: React.FC<Props> = ({ projectId, functions, canManage = false }) => {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [isLoading,  setIsLoading]  = useState(false)
  const [isSaving,   setIsSaving]   = useState(false)
  const [editTarget, setEditTarget] = useState<Milestone | null>(null)
  const [showModal,  setShowModal]  = useState(false)
  const [form] = Form.useForm()

  const loadMilestones = async () => {
    setIsLoading(true)
    try {
      const res = await projectApi.getMilestones(projectId)
      setMilestones(Array.isArray(res.content) ? (res.content as Milestone[]) : [])
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadMilestones() }, [projectId])

  const openCreate = () => { setEditTarget(null); form.resetFields(); setShowModal(true) }
  const openEdit   = (m: Milestone) => {
    setEditTarget(m)
    form.setFieldsValue({
      name: m.name, target_date: m.target_date,
      note: m.note, linked_functions: m.linked_functions ?? [],
    })
    setShowModal(true)
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const payload = {
        name:             values.name as string,
        target_date:      values.target_date as string,
        note:             values.note as string | undefined,
        linked_functions: values.linked_functions as string[] | undefined,
      }
      if (editTarget) {
        await projectApi.updateMilestone(projectId, editTarget.id, payload)
        showToast.success('里程碑更新成功')
      } else {
        await projectApi.createMilestone(projectId, payload)
        showToast.success('里程碑建立成功')
      }
      setShowModal(false); form.resetFields(); setEditTarget(null)
      loadMilestones()
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await projectApi.deleteMilestone(projectId, id)
      showToast.success('刪除成功'); loadMilestones()
    } catch { /* global */ }
  }

  // Summary stats
  const achieved = milestones.filter((m) => m.status === 'achieved').length
  const overdue  = milestones.filter((m) => m.status === 'overdue').length
  const pending  = milestones.filter((m) => m.status === 'pending').length

  const columns: ColumnsType<Milestone> = [
    {
      title: '里程碑名稱', dataIndex: 'name',
      render: (name: string, r) => (
        <div className="flex items-center gap-2">
          <span
            className="text-base"
            style={{
              color: r.status === 'achieved' ? '#16a34a' : r.status === 'overdue' ? '#dc2626' : '#2563eb',
            }}
          >◆</span>
          <span className="font-medium text-slate-700 text-sm">{name}</span>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 100,
      render: (v: MsStatus) => {
        const cfg = MS_STATUS_CONFIG[v]
        return (
          <div className="flex items-center gap-1">
            {cfg.icon}
            <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{cfg.label}</Tag>
          </div>
        )
      },
    },
    {
      title: '目標日期', dataIndex: 'target_date', width: 120,
      render: (v: string, r) => <DaysDisplay date={v} status={r.status} />,
    },
    {
      title: '達成時間', dataIndex: 'achieved_at', width: 165,
      render: (v?: string) => v
        ? <span className="text-green-600 text-xs">{v}</span>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: '關聯任務', dataIndex: 'linked_functions', width: 130,
      render: (ids?: string[]) => {
        if (!ids || ids.length === 0) return <span className="text-slate-300 text-xs">未關聯</span>
        const linked = functions.filter((f) => ids.includes(f.id))
        const done   = linked.filter((f) => f.status === 4).length
        return (
          <Tooltip title={linked.map((f) => f.function_nm).join('、')}>
            <div className="flex items-center gap-2">
              <Progress
                percent={linked.length ? Math.round((done / linked.length) * 100) : 0}
                size="small" showInfo={false} style={{ width: 60 }}
                strokeColor="#2563eb" trailColor="#f1f5f9"
              />
              <span className="text-xs text-slate-400">{done}/{linked.length}</span>
            </div>
          </Tooltip>
        )
      },
    },
    { title: '備注', dataIndex: 'note', ellipsis: true, render: (v?: string) => v ?? <span className="text-slate-300 text-xs">—</span> },
    ...(canManage ? [{
      title: '操作', key: 'action', width: 90, fixed: 'right' as const,
      render: (_: unknown, record: Milestone) => (
        <Space size={0}>
          <Tooltip title="編輯">
            <Button icon={<PencilIcon className="w-3.5 h-3.5" />} size="small" type="text" onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="確認刪除？" onConfirm={() => handleDelete(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除">
              <Button icon={<TrashIcon className="w-3.5 h-3.5" />} size="small" type="text" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ]

  return (
    <div>
      {/* Summary row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Badge status="success" />
            <span className="text-xs text-slate-500">已達成 <span className="font-semibold text-green-600">{achieved}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge status="processing" />
            <span className="text-xs text-slate-500">進行中 <span className="font-semibold text-blue-600">{pending}</span></span>
          </div>
          {overdue > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge status="error" />
              <span className="text-xs text-slate-500">已逾期 <span className="font-semibold text-red-500">{overdue}</span></span>
            </div>
          )}
        </div>
        {canManage && (
          <Button
            type="primary" icon={<PlusIcon className="w-4 h-4" />}
            size="small" style={{ background: '#2563eb' }} onClick={openCreate}
          >
            新增里程碑
          </Button>
        )}
      </div>

      {/* Table */}
      <Table
        rowKey="id" columns={columns} dataSource={milestones} loading={isLoading}
        pagination={false} size="middle" scroll={{ x: 800 }}
        rowClassName={(r) => r.status === 'overdue' ? 'bg-red-50/40' : r.status === 'achieved' ? 'bg-green-50/30' : ''}
      />

      {/* Add / Edit Modal */}
      <Modal
        title={editTarget ? '編輯里程碑' : '新增里程碑'}
        open={showModal}
        onCancel={() => { setShowModal(false); form.resetFields(); setEditTarget(null) }}
        footer={null} width={520} destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <Form.Item name="name" label="里程碑名稱" rules={[{ required: true }]}>
            <Input placeholder="例：MVP 上線、UAT 驗收完成" />
          </Form.Item>
          <Form.Item name="target_date" label="目標日期" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="linked_functions" label="關聯功能任務">
            <Select
              mode="multiple"
              placeholder="選擇需關聯的功能任務（全部完結時里程碑自動達成）"
              optionFilterProp="label"
              options={functions.map((f) => ({
                value: f.id,
                label: `${f.function_nm} (${f.group1})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label="備注">
            <Input.TextArea rows={2} placeholder="交付物說明、驗收標準等" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowModal(false); form.resetFields(); setEditTarget(null) }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>
              {editTarget ? '保存更新' : '建立里程碑'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default MilestoneTab
