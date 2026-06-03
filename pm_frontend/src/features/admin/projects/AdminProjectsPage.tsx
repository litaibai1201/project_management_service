import React, { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Modal, Form, Input, Select, Tooltip, Tag, Avatar,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { EditOutlined } from '@ant-design/icons'
import { projectApi } from '@/api/project.api'
import { userApi } from '@/api/user.api'
import { PROJECT_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useTranslation } from 'react-i18next'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import type { ProjectListItem, ProjectGroup } from '@/types/api.types'

interface UserOption { value: string; label: string }

const AdminProjectsPage: React.FC = () => {
  const { t } = useTranslation()
  const toName = useWorkNoToName()
  const [list, setList] = useState<ProjectListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [groupFilter, setGroupFilter] = useState<string | undefined>()

  // Edit modal
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editForm] = Form.useForm()
  const [userOptions, setUserOptions] = useState<UserOption[]>([])

  const loadList = useCallback(async (p = page, s = pageSize) => {
    setLoading(true)
    try {
      const res = await projectApi.list({ page: p, size: s, keyword, group_id: groupFilter })
      const c = res.content as any
      setList(c.data_list ?? c.project_list ?? [])
      setTotal(c.total_count ?? 0)
      setPage(p)
    } catch { /* interceptor */ }
    finally { setLoading(false) }
  }, [keyword, groupFilter, page, pageSize])

  useEffect(() => { loadList(1) }, [keyword, groupFilter]) // eslint-disable-line
  useEffect(() => {
    projectApi.groups().then((res) => {
      setGroups(Array.isArray(res.content) ? res.content : [])
    }).catch(() => {})
    userApi.list({ size: 200 }).then((res) => {
      const users = ((res as any).content?.data_list ?? []) as { work_no: string; name: string }[]
      setUserOptions(users.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [])

  const handleEdit = (record: ProjectListItem) => {
    setEditTarget(record)
    editForm.setFieldsValue({
      project_nm: record.project_nm,
      department: record.department,
      product_pm: record.product_pm || undefined,
      project_pm: record.project_pm || undefined,
      priority: record.priority,
    })
  }

  const handleSave = async () => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      const values = await editForm.validateFields()
      await projectApi.update(editTarget.id, values)
      showToast.success(t('adminProject.updateSuccess'))
      setEditTarget(null)
      loadList(page)
    } catch { /* validation or API error */ }
    finally { setEditSaving(false) }
  }

  const columns: ColumnsType<ProjectListItem> = [
    {
      title: t('project.projectName'), dataIndex: 'project_nm', ellipsis: true,
      render: (v: string) => <span className="font-medium text-slate-700">{v}</span>,
    },
    {
      title: t('user.department'), dataIndex: 'department', width: 120,
      render: (v: string) => <span className="text-slate-500 text-sm">{v || '—'}</span>,
    },
    {
      title: t('adminProject.productPm'), dataIndex: 'product_pm', width: 120,
      render: (v: string) => v ? (
        <div className="flex items-center gap-1.5">
          <Avatar size={20} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{toName(v)?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600">{toName(v)}</span>
        </div>
      ) : <span className="text-slate-300">—</span>,
    },
    {
      title: t('adminProject.projectPm'), dataIndex: 'project_pm', width: 120,
      render: (v: string) => v ? (
        <div className="flex items-center gap-1.5">
          <Avatar size={20} style={{ background: '#2563eb', fontSize: 10, fontWeight: 600 }}>{toName(v)?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600">{toName(v)}</span>
        </div>
      ) : <span className="text-slate-300">—</span>,
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = PROJECT_STATUS_MAP[v]
        return s ? <Tag color={s.color}>{s.label}</Tag> : v
      },
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 80,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color}>{p.label}</Tag> : v
      },
    },
    {
      title: t('common.operation'), key: 'action', width: 70, fixed: 'right',
      render: (_: unknown, record) => (
        <Tooltip title={t('common.edit')}>
          <Button icon={<EditOutlined />} size="small" type="text" onClick={() => handleEdit(record)} />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t('adminProject.title')}</h2>
          <p className="text-slate-400 text-sm mt-1">{t('adminProject.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <Input.Search
          placeholder={t('adminProject.searchPlaceholder')}
          allowClear style={{ width: 240 }}
          onSearch={(v) => setKeyword(v)}
        />
        <Select
          placeholder={t('adminProject.groupFilter')} allowClear style={{ width: 160 }}
          value={groupFilter}
          onChange={(v) => setGroupFilter(v)}
          options={groups.map((g) => ({ value: g.id, label: g.group_nm }))}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
        <Table<ProjectListItem>
          rowKey="id"
          loading={loading}
          dataSource={list}
          columns={columns}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true,
            showTotal: (tot) => t('common.total', { count: tot }),
            onChange: (p, s) => { setPageSize(s); loadList(p, s) },
          }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </div>

      {/* Edit Modal */}
      <Modal
        open={!!editTarget}
        title={`${t('adminProject.editTitle')} — ${editTarget?.project_nm ?? ''}`}
        onCancel={() => setEditTarget(null)}
        onOk={handleSave}
        confirmLoading={editSaving}
        okText={t('common.save')}
        width={520}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" className="mt-4">
          <Form.Item name="project_nm" label={t('project.projectName')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="department" label={t('user.department')}>
              <Input />
            </Form.Item>
            <Form.Item name="priority" label={t('common.priority')}>
              <Select options={[
                { value: 1, label: PRIORITY_MAP[1]?.label },
                { value: 2, label: PRIORITY_MAP[2]?.label },
                { value: 3, label: PRIORITY_MAP[3]?.label },
                { value: 4, label: PRIORITY_MAP[4]?.label },
              ]} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="product_pm" label={t('adminProject.productPm')}>
              <Select
                showSearch allowClear
                placeholder={t('adminProject.selectPm')}
                optionFilterProp="label"
                options={userOptions}
              />
            </Form.Item>
            <Form.Item name="project_pm" label={t('adminProject.projectPm')}>
              <Select
                showSearch allowClear
                placeholder={t('adminProject.selectPm')}
                optionFilterProp="label"
                options={userOptions}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminProjectsPage
