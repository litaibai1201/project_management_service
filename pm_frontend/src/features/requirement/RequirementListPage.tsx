import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Modal, Form, Tag, Avatar, Card, Tabs,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon, PencilSquareIcon, TrashIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import { requirementApi, type ProjectReqItem } from '@/api/project.api'
import RichTextEditor from '@/components/common/RichTextEditor'
import { userApi } from '@/api/user.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import dayjs from 'dayjs'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return <span className="text-slate-300 text-xs">—</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)}天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">{date}</span>
}

const PROJ_REQ_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '草稿',   color: 'default'    },
  1: { label: '審核中', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
  8: { label: '搁置',   color: 'warning'    },
}

const SYS_REQ_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '草稿',   color: 'default'    },
  1: { label: '審核中', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
  8: { label: '搁置',   color: 'warning'    },
}

// ─── Main Component ───────────────────────────────────────────────────────────

const RequirementListPage: React.FC = () => {
  const toName   = useWorkNoToName()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'project' | 'system'>('project')

  // ── 專案需求 state ────────────────────────────────────────────────────────
  const [projList,     setProjList]     = useState<ProjectReqItem[]>([])
  const [projLoading,  setProjLoading]  = useState(false)
  const [projTotal,    setProjTotal]    = useState(0)
  const [projPage,     setProjPage]     = useState(1)
  const [projPageSize, setProjPageSize] = useState(20)
  const [projKeyword,  setProjKeyword]  = useState('')
  const [projStatus,   setProjStatus]   = useState<number | undefined>()
  const [projPriority, setProjPriority] = useState<number | undefined>()

  // ── 系統需求 state ────────────────────────────────────────────────────────
  const [reqList,     setReqList]     = useState<StandaloneReq[]>([])
  const [reqLoading,  setReqLoading]  = useState(false)
  const [reqTotal,    setReqTotal]    = useState(0)
  const [reqPage,     setReqPage]     = useState(1)
  const [reqPageSize, setReqPageSize] = useState(20)
  const [reqKeyword,  setReqKeyword]  = useState('')
  const [reqStatus,   setReqStatus]   = useState<number | undefined>()
  const [reqPriority, setReqPriority] = useState<number | undefined>()

  // ── 系統需求 表單 ─────────────────────────────────────────────────────────
  const [showForm,      setShowForm]      = useState(false)
  const [editTarget,    setEditTarget]    = useState<StandaloneReq | null>(null)
  const [reqSaving,     setReqSaving]     = useState(false)
  const [userOptions,   setUserOptions]   = useState<{ value: string; label: string }[]>([])
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([])
  const [expandOpen,    setExpandOpen]    = useState(false)
  const [expandDraft,   setExpandDraft]   = useState('')
  const [form] = Form.useForm()
  const describeValue = Form.useWatch('describe', form)

  // ── 載入資料 ─────────────────────────────────────────────────────────────

  const loadProjReqs = useCallback(async (
    page     = 1,
    size     = projPageSize,
    keyword  = projKeyword,
    status   = projStatus,
    priority = projPriority,
  ) => {
    setProjLoading(true)
    try {
      const res = await requirementApi.listAll({ page, size, keyword, status, priority })
      const c = res.content
      setProjList(c.data_list ?? [])
      setProjTotal(c.total_count ?? 0)
      setProjPage(page)
    } catch { /* global */ } finally { setProjLoading(false) }
  }, [projPageSize, projKeyword, projStatus, projPriority])

  const loadSysReqs = useCallback(async (
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
    } catch { /* global */ } finally { setReqLoading(false) }
  }, [reqPageSize, reqKeyword, reqStatus, reqPriority])

  useEffect(() => { loadProjReqs(); loadSysReqs() }, [])

  // ── 系統需求 表單操作 ──────────────────────────────────────────────────────

  const loadUsers = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [userOptions.length])

  const loadSystems = useCallback(() => {
    if (systemOptions.length > 0) return
    systemApi.list({ page: 1, size: 1000 }).then((res) => {
      const data = (res.content as { data_list?: SystemItem[] }).data_list ?? []
      setSystemOptions(data.map((s) => ({ value: s.id, label: s.sys_nm })))
    }).catch(() => {})
  }, [systemOptions.length])

  const openCreate = () => {
    setEditTarget(null)
    form.resetFields()
    loadUsers(); loadSystems()
    setShowForm(true)
  }

  const openEdit = (r: StandaloneReq) => {
    setEditTarget(r)
    form.setFieldsValue({
      req_nm:            r.req_nm,
      system_id:         r.system_id,
      describe:          r.describe,
      priority:          r.priority,
      responsible:       r.responsible,
      expected_end_date: r.expected_end_date,
      expected_benefit:  r.expected_benefit,
      benefit_amount:    r.benefit_amount,
      benefit_unit:      r.benefit_unit ?? '元/年',
    })
    loadUsers(); loadSystems()
    setShowForm(true)
  }

  const handleSave = async (values: Record<string, unknown>) => {
    setReqSaving(true)
    try {
      const payload = {
        req_nm:            values.req_nm as string,
        system_id:         values.system_id as string,
        describe:          values.describe as string | undefined,
        priority:          values.priority as number,
        responsible:       values.responsible as string[] | undefined,
        expected_end_date: values.expected_end_date as string | undefined,
        expected_benefit:  values.expected_benefit as string | undefined,
        benefit_amount:    values.benefit_amount as number | null | undefined,
        benefit_unit:      values.benefit_unit as string | undefined,
      }
      if (editTarget) {
        await standaloneReqApi.update(editTarget.id, payload)
        showToast.success('已更新')
      } else {
        await standaloneReqApi.create(payload)
        showToast.success('需求建立成功')
      }
      setShowForm(false)
      form.resetFields()
      loadSysReqs(editTarget ? reqPage : 1)
    } catch (err: unknown) { showToast.error((err as string) || '操作失敗') }
    finally { setReqSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await standaloneReqApi.delete(id)
      showToast.success('已刪除')
      loadSysReqs(reqPage)
    } catch { showToast.error('刪除失敗') }
  }

  const handleOpenExpand = () => {
    const current = (describeValue as string) ?? ''
    const html = isHtml(current)
      ? current
      : current.trim() ? `<p>${current.replace(/\n/g, '</p><p>')}</p>` : ''
    setExpandDraft(html)
    setExpandOpen(true)
  }

  // ── 欄位定義 ─────────────────────────────────────────────────────────────

  const projColumns: ColumnsType<ProjectReqItem> = [
    {
      title: '需求名稱', dataIndex: 'req_nm', ellipsis: true,
      render: (v: string, r: ProjectReqItem) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }}
          onClick={() => navigate(`/projects/${r.project_id}?req=${r.id}`)}>
          {v}
        </Button>
      ),
    },
    {
      title: '所屬專案', dataIndex: 'project_nm', width: 180, ellipsis: true,
      render: (v: string) => v
        ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (v: number) => {
        const c = PROJ_REQ_STATUS_MAP[v] ?? { label: String(v), color: 'default' }
        return <Tag color={c.color} style={{ fontSize: 11 }}>{c.label}</Tag>
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 72,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : <span>{v}</span>
      },
    },
    {
      title: '期望完成', dataIndex: 'expected_end_date', width: 110,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: '建立人', dataIndex: 'creator_nm', width: 90,
      render: (v: string, r: ProjectReqItem) => (
        <span className="text-slate-500 text-sm">{v || toName(r.creator) || r.creator}</span>
      ),
    },
    {
      title: '建立時間', dataIndex: 'created_at', width: 110,
      render: (v: string) => <span className="text-slate-400 text-xs">{v ? v.slice(0, 10) : '—'}</span>,
    },
  ]

  const sysColumns: ColumnsType<StandaloneReq> = [
    {
      title: '需求名稱', dataIndex: 'req_nm', ellipsis: true,
      render: (v: string, r: StandaloneReq) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }}
          onClick={() => navigate(`/systems/${r.system_id}?req=${r.id}`)}>
          {v}
        </Button>
      ),
    },
    {
      title: '關聯系統', dataIndex: 'system_nm', width: 140, ellipsis: true,
      render: (v: string) => v
        ? <Tag color="purple" style={{ fontSize: 11 }}>{v}</Tag>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (v: number) => {
        const c = SYS_REQ_STATUS_MAP[v] ?? { label: String(v), color: 'default' }
        return <Tag color={c.color} style={{ fontSize: 11 }}>{c.label}</Tag>
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 72,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : <span>{v}</span>
      },
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 130,
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
      title: '期望完成', dataIndex: 'expected_end_date', width: 110,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: '建立人', dataIndex: 'creator_nm', width: 90,
      render: (v: string, r: StandaloneReq) => (
        <span className="text-slate-500 text-sm">{v || toName(r.creator) || r.creator}</span>
      ),
    },
    {
      title: '建立時間', dataIndex: 'created_at', width: 110,
      render: (v: string) => <span className="text-slate-400 text-xs">{v ? v.slice(0, 10) : '—'}</span>,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, r: StandaloneReq) => {
        if (r.status !== 0) return null
        return (
          <Space size={0}>
            <Tooltip title="編輯">
              <Button type="text" size="small" icon={<PencilSquareIcon className="w-4 h-4" />}
                onClick={() => openEdit(r)} />
            </Tooltip>
            <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(r.id)} okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}>
              <Tooltip title="刪除">
                <Button type="text" size="small" danger icon={<TrashIcon className="w-4 h-4" />} />
              </Tooltip>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  // ── 渲染 ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">需求列表</h1>
        <p className="text-slate-400 text-sm mt-0.5">管理專案需求與系統需求</p>
      </div>

      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'project' | 'system')}
        items={[
          {
            key: 'project',
            label: `專案需求 (${projTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Input.Search
                    placeholder="搜索需求名稱..."
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(v) => { setProjKeyword(v); loadProjReqs(1, projPageSize, v, projStatus, projPriority) }}
                  />
                  <Select
                    placeholder="狀態" allowClear style={{ width: 110 }}
                    value={projStatus}
                    onChange={(v) => { setProjStatus(v); loadProjReqs(1, projPageSize, projKeyword, v, projPriority) }}
                    options={Object.entries(PROJ_REQ_STATUS_MAP).map(([k, s]) => ({ value: Number(k), label: s.label }))}
                  />
                  <Select
                    placeholder="優先級" allowClear style={{ width: 110 }}
                    value={projPriority}
                    onChange={(v) => { setProjPriority(v); loadProjReqs(1, projPageSize, projKeyword, projStatus, v) }}
                    options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]}
                  />
                </div>
                <Table<ProjectReqItem>
                  rowKey="id"
                  loading={projLoading}
                  dataSource={projList}
                  columns={projColumns}
                  size="small"
                  pagination={{
                    current: projPage, pageSize: projPageSize, total: projTotal,
                    showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
                    onChange: (page, size) => { setProjPageSize(size); loadProjReqs(page, size) },
                  }}
                  scroll={{ x: 800 }}
                  locale={{ emptyText: <div className="py-8 text-center text-slate-400">暫無專案需求</div> }}
                />
              </Card>
            ),
          },
          {
            key: 'system',
            label: `系統需求 (${reqTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Input.Search
                    placeholder="搜索需求名稱..."
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(v) => { setReqKeyword(v); loadSysReqs(1, reqPageSize, v, reqStatus, reqPriority) }}
                  />
                  <Select
                    placeholder="狀態" allowClear style={{ width: 110 }}
                    value={reqStatus}
                    onChange={(v) => { setReqStatus(v); loadSysReqs(1, reqPageSize, reqKeyword, v, reqPriority) }}
                    options={Object.entries(SYS_REQ_STATUS_MAP).map(([k, s]) => ({ value: Number(k), label: s.label }))}
                  />
                  <Select
                    placeholder="優先級" allowClear style={{ width: 110 }}
                    value={reqPriority}
                    onChange={(v) => { setReqPriority(v); loadSysReqs(1, reqPageSize, reqKeyword, reqStatus, v) }}
                    options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]}
                  />
                  <div className="ml-auto">
                    <Button
                      type="primary"
                      icon={<PlusIcon className="w-4 h-4" />}
                      onClick={openCreate}
                      style={{ background: '#2563eb', fontWeight: 500 }}
                    >
                      新建需求
                    </Button>
                  </div>
                </div>
                <Table<StandaloneReq>
                  rowKey="id"
                  loading={reqLoading}
                  dataSource={reqList}
                  columns={sysColumns}
                  size="small"
                  pagination={{
                    current: reqPage, pageSize: reqPageSize, total: reqTotal,
                    showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
                    onChange: (page, size) => { setReqPageSize(size); loadSysReqs(page, size) },
                  }}
                  scroll={{ x: 860 }}
                  locale={{ emptyText: <div className="py-8 text-center text-slate-400">暫無系統需求</div> }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* 系統需求 建立 / 編輯 Modal */}
      <Modal
        title={editTarget ? `編輯需求 — ${editTarget.req_nm}` : '新建系統需求'}
        open={showForm}
        onCancel={() => { setShowForm(false); form.resetFields() }}
        footer={null}
        width="min(600px, 88vw)"
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSave} className="mt-4">
          <Form.Item name="req_nm" label="需求名稱" rules={[{ required: true, message: '請輸入需求名稱' }]}>
            <Input placeholder="請輸入需求名稱" />
          </Form.Item>
          <Form.Item name="system_id" label="關聯系統" rules={[{ required: true, message: '請選擇關聯系統' }]}>
            <Select
              placeholder="選擇系統（必填）"
              options={systemOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadSystems() }}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label="期望完成時間">
              <Input type="date" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="benefit_amount" label="預估效益數量">
              <Input type="number" min={0} placeholder="如：10" />
            </Form.Item>
            <Form.Item name="benefit_unit" label="效益單位" initialValue="元/年">
              <Select options={[{ value: '元/年', label: '元/年' }, { value: '人/年', label: '人/年' }, { value: '工時/年', label: '工時/年' }]} />
            </Form.Item>
          </div>
          <Form.Item name="expected_benefit" label="效益說明">
            <Input.TextArea placeholder="選填" autoSize={{ minRows: 2, maxRows: 6 }} style={{ resize: 'vertical' }} />
          </Form.Item>
          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple" placeholder="選擇負責人"
              options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          <Form.Item label="需求描述">
            <div className="flex items-center justify-between mb-1.5">
              <span />
              <button
                type="button"
                onClick={handleOpenExpand}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
              >
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                展開富文本編輯
              </button>
            </div>
            <Form.Item
              name="describe"
              noStyle
              getValueProps={(v) => ({ value: v && isHtml(v) ? stripHtml(v) : (v ?? '') })}
            >
              <Input.TextArea
                rows={3}
                placeholder="請描述需求內容，或點擊右上角展開富文本編輯器..."
                style={{ resize: 'vertical', minHeight: 72 }}
              />
            </Form.Item>
            {describeValue && isHtml(describeValue as string) && (
              <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
            )}
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowForm(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={reqSaving} style={{ background: '#2563eb' }}>
              {editTarget ? '保存' : '建立'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 描述展開編輯 Modal */}
      <Modal
        open={expandOpen}
        title="需求描述"
        onCancel={() => setExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExpandOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => { form.setFieldValue('describe', expandDraft); setExpandOpen(false) }}
              style={{ background: '#2563eb' }}>完成</Button>
          </div>
        }
        destroyOnClose
      >
        <RichTextEditor
          value={expandDraft}
          onChange={setExpandDraft}
          placeholder="請輸入需求描述..."
          minHeight={480}
        />
      </Modal>
    </div>
  )
}

export default RequirementListPage
