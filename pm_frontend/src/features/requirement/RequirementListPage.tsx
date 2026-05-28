import React, { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Modal, Form, Tag, Avatar,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon } from '@heroicons/react/24/outline'
import { TrashIcon } from '@heroicons/react/24/outline'
import { standaloneReqApi, StandaloneReq } from '@/api/standalone_req.api'
import { userApi } from '@/api/user.api'
import { PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import dayjs from 'dayjs'

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return <span className="text-slate-300 text-xs">—</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)}天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">{date}</span>
}

const REQ_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待處理', color: '#94a3b8' },
  1: { label: '進行中', color: '#2563eb' },
  2: { label: '已完成', color: '#16a34a' },
}

const RequirementListPage: React.FC = () => {
  const toName = useWorkNoToName()

  const [reqList,     setReqList]     = useState<StandaloneReq[]>([])
  const [reqLoading,  setReqLoading]  = useState(false)
  const [reqTotal,    setReqTotal]    = useState(0)
  const [reqPage,     setReqPage]     = useState(1)
  const [reqPageSize, setReqPageSize] = useState(20)
  const [reqKeyword,  setReqKeyword]  = useState('')
  const [reqStatus,   setReqStatus]   = useState<number | undefined>()
  const [reqPriority, setReqPriority] = useState<number | undefined>()

  const [showCreate,   setShowCreate]   = useState(false)
  const [reqSaving,    setReqSaving]    = useState(false)
  const [userOptions,  setUserOptions]  = useState<{ value: string; label: string }[]>([])
  const [form] = Form.useForm()

  const loadReqs = useCallback(async (
    page     = 1,
    size     = reqPageSize,
    keyword  = reqKeyword,
    status   = reqStatus,
    priority = reqPriority,
  ) => {
    setReqLoading(true)
    try {
      const res = await standaloneReqApi.list({ page, size, keyword, status, priority })
      const c = res.content as { data_list: StandaloneReq[]; total_count: number }
      setReqList(c.data_list ?? [])
      setReqTotal(c.total_count ?? 0)
      setReqPage(page)
    } catch { /* global handler */ } finally { setReqLoading(false) }
  }, [reqPageSize, reqKeyword, reqStatus, reqPriority])

  useEffect(() => { loadReqs() }, [])

  const handleCreate = async (values: Record<string, unknown>) => {
    setReqSaving(true)
    try {
      await standaloneReqApi.create({
        req_nm:            values.req_nm as string,
        describe:          values.describe as string | undefined,
        priority:          values.priority as number,
        responsible:       values.responsible as string[] | undefined,
        expected_end_date: values.expected_end_date as string | undefined,
      })
      showToast.success('需求建立成功')
      setShowCreate(false)
      form.resetFields()
      loadReqs(1)
    } catch (err: unknown) { showToast.error((err as string) || '建立失敗') }
    finally { setReqSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await standaloneReqApi.delete(id)
      showToast.success('已刪除')
      loadReqs(reqPage)
    } catch { showToast.error('刪除失敗') }
  }

  const loadUsers = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [userOptions.length])

  const columns: ColumnsType<StandaloneReq> = [
    {
      title: '需求名稱', dataIndex: 'req_nm', ellipsis: true,
      render: (v: string) => <span className="font-medium text-slate-800">{v}</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 100,
      render: (v: number) => {
        const c = REQ_STATUS_MAP[v] ?? { label: String(v), color: '#94a3b8' }
        return (
          <div className="flex items-center gap-1.5">
            <span className="status-dot" style={{ background: c.color }} />
            <span className="text-slate-600 text-sm">{c.label}</span>
          </div>
        )
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 90,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        const color = PRIORITY_COLORS[v]
        return (
          <Tag style={{ color, borderColor: color, background: color ? `${color}18` : undefined }}>
            {p?.label ?? v}
          </Tag>
        )
      },
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 160,
      render: (v: string[]) => (
        <Avatar.Group max={{ count: 3 }} size="small">
          {(v ?? []).map((wn) => (
            <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
              <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>
                {toName(wn)?.[0] ?? wn[0]}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      ),
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 130,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: '建立人', dataIndex: 'creator_nm', width: 100,
      render: (v: string, r: StandaloneReq) => <span className="text-slate-500 text-sm">{v || r.creator}</span>,
    },
    {
      title: '建立時間', dataIndex: 'created_at', width: 160,
      render: (v: string) => <span className="text-slate-400 text-xs">{v}</span>,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, r: StandaloneReq) => (
        <Space>
          <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(r.id)} okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}>
            <button type="button" className="text-red-400 hover:text-red-600">
              <TrashIcon className="w-4 h-4" />
            </button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">需求列表</h1>
          <p className="text-slate-400 text-sm mt-0.5">管理獨立需求，不需關聯專案</p>
        </div>
        <Button
          type="primary"
          icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => { setShowCreate(true); loadUsers() }}
          style={{ background: '#2563eb', fontWeight: 500 }}
        >
          新建需求
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Input.Search
          placeholder="搜索需求名稱..."
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => { setReqKeyword(v); loadReqs(1, reqPageSize, v, reqStatus, reqPriority) }}
        />
        <Select
          placeholder="狀態" allowClear style={{ width: 120 }}
          value={reqStatus}
          onChange={(v) => { setReqStatus(v); loadReqs(1, reqPageSize, reqKeyword, v, reqPriority) }}
          options={Object.entries(REQ_STATUS_MAP).map(([k, s]) => ({ value: Number(k), label: s.label }))}
        />
        <Select
          placeholder="優先級" allowClear style={{ width: 110 }}
          value={reqPriority}
          onChange={(v) => { setReqPriority(v); loadReqs(1, reqPageSize, reqKeyword, reqStatus, v) }}
          options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
        <Table<StandaloneReq>
          rowKey="id"
          loading={reqLoading}
          dataSource={reqList}
          columns={columns}
          pagination={{
            current: reqPage, pageSize: reqPageSize, total: reqTotal,
            showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
            onChange: (page, size) => { setReqPageSize(size); loadReqs(page, size) },
          }}
          size="middle"
          scroll={{ x: 860 }}
        />
      </div>

      {/* Create Modal */}
      <Modal
        title="新建需求"
        open={showCreate}
        onCancel={() => { setShowCreate(false); form.resetFields() }}
        footer={null}
        width="min(600px, 88vw)"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="req_nm" label="需求名稱" rules={[{ required: true, message: '請輸入需求名稱' }]}>
            <Input placeholder="請輸入需求名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成日期">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple"
              placeholder="選擇負責人"
              options={userOptions}
              showSearch
              allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          <Form.Item name="describe" label="需求描述">
            <Input.TextArea rows={4} placeholder="請描述需求內容..." />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={reqSaving} style={{ background: '#2563eb' }}>建立</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default RequirementListPage
