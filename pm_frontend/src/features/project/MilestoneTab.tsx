/**
 * MilestoneTab — 里程碑管理 Tab
 * 顯示項目里程碑列表，支持 新增 / 編輯 / 刪除
 */
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Milestone, ProjectFunction, Requirement } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import DateInput from '@/components/common/DateInput'

// ─── Status helpers ───────────────────────────────────────────────────────────
const MS_STATUS_ICONS = {
  pending:  { color: 'processing', icon: <ClockIcon className="w-3.5 h-3.5 text-blue-500" /> },
  achieved: { color: 'success',    icon: <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" /> },
  overdue:  { color: 'error',      icon: <ExclamationCircleIcon className="w-3.5 h-3.5 text-red-500" /> },
} as const

type MsStatus = keyof typeof MS_STATUS_ICONS

const DaysDisplay: React.FC<{ date: string; status: MsStatus }> = ({ date, status }) => {
  const { t } = useTranslation()
  if (status === 'achieved') return <span className="text-green-600 text-xs font-medium">{date}</span>
  const diff = dayjs(date).diff(dayjs(), 'day')
  if (diff < 0) return <span className="days-overdue">{date} · {t('milestone.overdueDays', { days: Math.abs(diff) })}</span>
  if (diff === 0) return <span className="days-overdue">{date} · {t('milestone.dueToday')}</span>
  if (diff <= 7)  return <span className="days-warning">{date} · {t('milestone.daysLeft', { days: diff })}</span>
  return <span className="days-ok">{date}</span>
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  projectId: string
  functions: ProjectFunction[]  // for linking milestones to functions
  requirements?: Requirement[]  // for linking milestones to requirements
  canManage?: boolean           // project_pm / product_pm / supervisor only
}

const MilestoneTab: React.FC<Props> = ({ projectId, functions, requirements = [], canManage = false }) => {
  const { t } = useTranslation()
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
        showToast.success(t('milestone.updateSuccess'))
      } else {
        await projectApi.createMilestone(projectId, payload)
        showToast.success(t('milestone.createSuccess'))
      }
      setShowModal(false); form.resetFields(); setEditTarget(null)
      loadMilestones()
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await projectApi.deleteMilestone(projectId, id)
      showToast.success(t('common.deleteSuccess')); loadMilestones()
    } catch { /* global */ }
  }

  // Summary stats
  const achieved = milestones.filter((m) => m.status === 'achieved').length
  const overdue  = milestones.filter((m) => m.status === 'overdue').length
  const pending  = milestones.filter((m) => m.status === 'pending').length

  const MS_STATUS_LABELS: Record<MsStatus, string> = {
    pending: t('milestone.statusPending'),
    achieved: t('milestone.statusAchieved'),
    overdue: t('milestone.statusOverdue'),
  }

  const rawColumns: ColumnsType<Milestone> = [
    {
      title: t('milestone.colName'), dataIndex: 'name',
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
      title: t('common.status'), dataIndex: 'status', width: 100,
      render: (v: MsStatus) => {
        const cfg = MS_STATUS_ICONS[v]
        return (
          <div className="flex items-center gap-1">
            {cfg.icon}
            <Tag color={cfg.color} style={{ fontSize: 11, margin: 0 }}>{MS_STATUS_LABELS[v]}</Tag>
          </div>
        )
      },
    },
    {
      title: t('milestone.colTargetDate'), dataIndex: 'target_date', width: 120,
      render: (v: string, r) => <DaysDisplay date={v} status={r.status} />,
    },
    {
      title: t('milestone.colAchievedAt'), dataIndex: 'achieved_at', width: 165,
      render: (v?: string) => v
        ? <span className="text-green-600 text-xs">{v}</span>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('milestone.colLinkedTasks'), dataIndex: 'linked_functions', width: 130,
      render: (ids?: string[]) => {
        if (!ids || ids.length === 0) return <span className="text-slate-300 text-xs">{t('milestone.notLinked')}</span>
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
    { title: t('common.remark'), dataIndex: 'note', ellipsis: true, render: (v?: string) => v ?? <span className="text-slate-300 text-xs">—</span> },
    ...(canManage ? [{
      title: t('common.action'), key: 'action', width: 90, fixed: 'right' as const,
      render: (_: unknown, record: Milestone) => (
        <Space size={0}>
          <Tooltip title={t('common.edit')}>
            <Button icon={<PencilIcon className="w-3.5 h-3.5" />} size="small" type="text" onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDelete(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Tooltip title={t('common.delete')}>
              <Button icon={<TrashIcon className="w-3.5 h-3.5" />} size="small" type="text" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <div>
      {/* Summary row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Badge status="success" />
            <span className="text-xs text-slate-500">{t('milestone.statusAchieved')} <span className="font-semibold text-green-600">{achieved}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge status="processing" />
            <span className="text-xs text-slate-500">{t('milestone.statusPending')} <span className="font-semibold text-blue-600">{pending}</span></span>
          </div>
          {overdue > 0 && (
            <div className="flex items-center gap-1.5">
              <Badge status="error" />
              <span className="text-xs text-slate-500">{t('milestone.statusOverdue')} <span className="font-semibold text-red-500">{overdue}</span></span>
            </div>
          )}
        </div>
        {canManage && (
          <Button
            type="primary" icon={<PlusIcon className="w-4 h-4" />}
            size="small" style={{ background: '#2563eb' }} onClick={openCreate}
          >
            {t('milestone.addMilestone')}
          </Button>
        )}
      </div>

      {/* Table */}
      <Table
        rowKey="id" columns={columns} components={tableComponents} dataSource={milestones} loading={isLoading}
        pagination={false} size="middle" scroll={{ x: 800 }}
        rowClassName={(r) => r.status === 'overdue' ? 'bg-red-50/40' : r.status === 'achieved' ? 'bg-green-50/30' : ''}
      />

      {/* Add / Edit Modal */}
      <Modal
        title={editTarget ? t('milestone.editMilestone') : t('milestone.addMilestone')}
        open={showModal}
        onCancel={() => { setShowModal(false); form.resetFields(); setEditTarget(null) }}
        footer={null} width={520} destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          <Form.Item name="name" label={t('milestone.colName')} rules={[{ required: true }]}>
            <Input placeholder={t('milestone.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="target_date" label={t('milestone.colTargetDate')} rules={[{ required: true }]}>
            <DateInput/>
          </Form.Item>
          {requirements.length > 0 && (
            <Form.Item name="linked_requirements" label={t('milestone.linkedRequirements')}>
              <Select
                mode="multiple"
                placeholder={t('milestone.linkedRequirementsPlaceholder')}
                optionFilterProp="label"
                options={requirements.filter((r) => r.status !== 9).map((r) => ({ value: r.id, label: r.req_nm }))}
                onChange={(reqIds: string[]) => {
                  // Auto-select all functions under selected requirements
                  const currentFuncs: string[] = form.getFieldValue('linked_functions') ?? []
                  const reqFuncIds = functions.filter((f) => f.requirement_id && reqIds.includes(f.requirement_id)).map((f) => f.id)
                  const merged = Array.from(new Set([...currentFuncs, ...reqFuncIds]))
                  form.setFieldsValue({ linked_functions: merged })
                }}
              />
            </Form.Item>
          )}
          <Form.Item name="linked_functions" label={t('milestone.linkedFunctions')}>
            <Select
              mode="multiple"
              placeholder={t('milestone.linkedFunctionsPlaceholder')}
              optionFilterProp="label"
              options={functions.map((f) => ({
                value: f.id,
                label: `${f.function_nm} (${f.group1 === '__stage__' ? t('common.stageTask') : (f.group1 || '')})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="note" label={t('common.remark')}>
            <Input.TextArea rows={2} placeholder={t('milestone.notePlaceholder')} />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowModal(false); form.resetFields(); setEditTarget(null) }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>
              {editTarget ? t('milestone.saveUpdate') : t('milestone.createMilestone')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default MilestoneTab
