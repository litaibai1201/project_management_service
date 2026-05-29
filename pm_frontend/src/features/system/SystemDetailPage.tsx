import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Tag, Spin, Empty, Table, Space, Tooltip, Popconfirm,
  Modal, Form, Input, Select, Avatar, Descriptions,
  Typography, Progress, Card, Tabs,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, PencilSquareIcon, TrashIcon,
  PaperClipIcon, ArrowsPointingOutIcon, UserCircleIcon,
} from '@heroicons/react/24/outline'
import { systemApi, type SystemItem } from '@/api/system.api'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { PRIORITY_MAP, DUTY_STATUS_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { tokenStorage } from '@/api/httpClient'
import RichTextEditor from '@/components/common/RichTextEditor'
import RichTextContent from '@/components/common/RichTextContent'
import type { TemporaryDuty } from '@/types/api.types'
import dayjs from 'dayjs'

const { Link } = Typography

const REQ_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待處理', color: 'default'    },
  1: { label: '進行中', color: 'processing' },
  2: { label: '已完成', color: 'success'    },
  9: { label: '已刪除', color: 'error'      },
}

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

// ─── Main Page ────────────────────────────────────────────────────────────────

const SystemDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toName     = useWorkNoToName()
  const withToken  = (url: string) => { const t = tokenStorage.get(); return t ? `${url}?token=${t}` : url }

  const [system,      setSystem]      = useState<SystemItem | null>(null)
  const [sysLoading,  setSysLoading]  = useState(false)
  const [activeTab,   setActiveTab]   = useState(() => searchParams.get('req') ? 'requirements' : 'info')

  const [reqList,     setReqList]     = useState<StandaloneReq[]>([])
  const [reqLoading,  setReqLoading]  = useState(false)
  const [reqTotal,    setReqTotal]    = useState(0)
  const [reqPage,     setReqPage]     = useState(1)
  const [reqPageSize, setReqPageSize] = useState(50)

  const [duties,        setDuties]        = useState<TemporaryDuty[]>([])
  const [dutiesLoading, setDutiesLoading] = useState(false)

  // Expandable rows
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([])

  // Create requirement
  const [showCreate,   setShowCreate]   = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [createForm]                    = Form.useForm()
  const [expandOpen,   setExpandOpen]   = useState(false)
  const [expandDraft,  setExpandDraft]  = useState('')
  const describeValue = Form.useWatch('describe', createForm)

  // Edit requirement (page-level modal)
  const [editTarget,     setEditTarget]     = useState<StandaloneReq | null>(null)
  const [showEditReq,    setShowEditReq]    = useState(false)
  const [editSaving,     setEditSaving]     = useState(false)
  const [editForm]                          = Form.useForm()
  const [editExpandOpen, setEditExpandOpen] = useState(false)
  const [editExpandDraft,setEditExpandDraft]= useState('')
  const editDescribeValue = Form.useWatch('describe', editForm)
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([])

  // File upload (page-level)
  const [uploadTargetReqId, setUploadTargetReqId] = useState<string | null>(null)
  const [uploading,         setUploading]          = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([])

  const loadSystem = useCallback(async () => {
    if (!id) return
    setSysLoading(true)
    try {
      const res = await systemApi.get(id)
      setSystem(res.content as SystemItem)
    } catch { /* global */ } finally { setSysLoading(false) }
  }, [id])

  const loadReqs = useCallback(async (page = 1, size = reqPageSize) => {
    if (!id) return
    setReqLoading(true)
    try {
      const res = await standaloneReqApi.list({ page, size, system_id: id })
      const c = res.content as { data_list: StandaloneReq[]; total_count: number }
      setReqList(c.data_list ?? [])
      setReqTotal(c.total_count ?? 0)
      setReqPage(page)
    } catch { /* global */ } finally { setReqLoading(false) }
  }, [id, reqPageSize])

  const loadDuties = useCallback(async () => {
    if (!id) return
    setDutiesLoading(true)
    try {
      const res = await dutyApi.list({ page: 1, size: 100, system_id: id })
      const c = res.content as { data_list?: TemporaryDuty[] }
      setDuties(c.data_list ?? [])
    } catch { /* global */ } finally { setDutiesLoading(false) }
  }, [id])

  useEffect(() => {
    loadSystem()
    loadReqs()
    loadDuties()
  }, [id])

  // Auto-expand row if ?req=xxx in URL
  useEffect(() => {
    const reqId = searchParams.get('req')
    if (reqId && reqList.length > 0 && reqList.some((r) => r.id === reqId)) {
      setExpandedRowKeys((prev) => prev.includes(reqId) ? prev : [reqId])
    }
  }, [reqList, searchParams])

  const loadUsers = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [userOptions.length])

  const handleCreate = async (values: Record<string, unknown>) => {
    if (!id) return
    setCreateSaving(true)
    try {
      await standaloneReqApi.create({
        req_nm:            values.req_nm as string,
        system_id:         id,
        describe:          values.describe as string | undefined,
        priority:          values.priority as number,
        responsible:       values.responsible as string[] | undefined,
        expected_end_date: values.expected_end_date as string | undefined,
      })
      showToast.success('需求建立成功')
      setShowCreate(false)
      createForm.resetFields()
      loadReqs(1)
    } catch (err: unknown) { showToast.error((err as string) || '建立失敗') }
    finally { setCreateSaving(false) }
  }

  const handleDelete = async (reqId: string) => {
    try {
      await standaloneReqApi.delete(reqId)
      showToast.success('已刪除')
      loadReqs(reqPage)
    } catch { showToast.error('刪除失敗') }
  }

  const handleReqUpdated = useCallback(async () => {
    await loadReqs(reqPage)
  }, [reqPage, loadReqs])

  const loadSystemOptions = useCallback(() => {
    if (systemOptions.length > 0) return
    systemApi.list({ page: 1, size: 1000 }).then((res) => {
      const data = (res.content as { data_list?: SystemItem[] }).data_list ?? []
      setSystemOptions(data.map((s) => ({ value: s.id, label: s.sys_nm })))
    }).catch(() => {})
  }, [systemOptions.length])

  const openEditReq = (r: StandaloneReq) => {
    setEditTarget(r)
    editForm.setFieldsValue({
      req_nm:            r.req_nm,
      system_id:         r.system_id,
      describe:          r.describe,
      priority:          r.priority,
      status:            r.status,
      responsible:       r.responsible,
      expected_end_date: r.expected_end_date,
    })
    loadUsers(); loadSystemOptions()
    setShowEditReq(true)
  }

  const handleEditReq = async (values: Record<string, unknown>) => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      await standaloneReqApi.update(editTarget.id, {
        req_nm:            values.req_nm as string,
        system_id:         values.system_id as string,
        describe:          values.describe as string | undefined,
        priority:          values.priority as number,
        status:            values.status as number,
        responsible:       values.responsible as string[] | undefined,
        expected_end_date: values.expected_end_date as string | undefined,
      })
      showToast.success('已更新')
      setShowEditReq(false)
      editForm.resetFields()
      handleReqUpdated()
    } catch (err: unknown) { showToast.error((err as string) || '操作失敗') }
    finally { setEditSaving(false) }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !uploadTargetReqId) return
    e.target.value = ''
    setUploading(true)
    try {
      await standaloneReqApi.uploadFile(uploadTargetReqId, file)
      showToast.success('上傳成功')
      loadReqs(reqPage)
    } catch { showToast.error('上傳失敗') }
    finally { setUploading(false); setUploadTargetReqId(null) }
  }

  if (sysLoading && !system) {
    return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
  }

  const reqColumns: ColumnsType<StandaloneReq> = [
    {
      title: '需求名稱', dataIndex: 'req_nm', ellipsis: true,
      render: (v: string) => <span className="font-medium text-slate-800">{v}</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (v: number) => {
        const c = REQ_STATUS_MAP[v] ?? { label: String(v), color: 'default' }
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
      title: '期望完成', dataIndex: 'expected_end_date', width: 100,
      render: (v: string) => <span className="text-xs text-slate-500">{v || '—'}</span>,
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 130,
      render: (v: string[]) => (
        <Avatar.Group max={{ count: 3 }} size="small">
          {(v ?? []).map((wn) => (
            <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
              <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>{toName(wn)?.[0] ?? wn[0]}</Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      ),
    },
    {
      title: '建立人', key: 'creator', width: 80,
      render: (_: unknown, r: StandaloneReq) => (
        <span className="text-xs text-slate-500">{r.creator_nm || toName(r.creator) || r.creator || '—'}</span>
      ),
    },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_: unknown, r: StandaloneReq) => (
        <Space size={4}>
          <Tooltip title="上傳附件">
            <Button size="small" loading={uploading && uploadTargetReqId === r.id}
              icon={<PaperClipIcon className="w-3.5 h-3.5" />}
              onClick={(e) => { e.stopPropagation(); setUploadTargetReqId(r.id); fileInputRef.current?.click() }} />
          </Tooltip>
          <Tooltip title="編輯">
            <Button size="small" icon={<PencilSquareIcon className="w-3.5 h-3.5" />}
              onClick={(e) => { e.stopPropagation(); openEditReq(r) }} />
          </Tooltip>
          <Popconfirm title="確定刪除？" onConfirm={() => handleDelete(r.id)} okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}>
            <Button type="text" size="small" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
              onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const dutyColumns: ColumnsType<TemporaryDuty> = [
    {
      title: '任務名稱', dataIndex: 'duty_nm', ellipsis: true,
      render: (v: string, r: TemporaryDuty) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => navigate(`/duties/${r.id}`)}>{v}</Button>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      render: (v: number) => {
        const s = DUTY_STATUS_MAP[v] ?? { label: String(v), color: 'default' }
        return <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag>
      },
    },
    {
      title: '進度', dataIndex: 'progress', width: 120,
      render: (v: number) => <Progress percent={v} size="small" strokeColor="#2563eb" style={{ marginBottom: 0 }} />,
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 130,
      render: (v: string[]) => (
        <Avatar.Group max={{ count: 3 }} size="small">
          {(v ?? []).map((wn) => (
            <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
              <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>{toName(wn)?.[0] ?? wn[0]}</Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      ),
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 110,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
  ]

  return (
    <div className="p-6">
      {/* Back + Title */}
      <div className="flex items-start gap-3 mb-5">
        <Button icon={<ArrowLeftIcon className="w-4 h-4" />} onClick={() => navigate('/systems')} type="text" className="mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{system?.sys_nm ?? '—'}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {system?.sys_group && <Tag color="blue" style={{ fontSize: 12 }}>{system.sys_group}</Tag>}
            {(system?.maintainer_names ?? []).map((u) => (
              <div key={u.work_no} className="flex items-center gap-1 text-xs text-slate-500">
                <UserCircleIcon className="w-3.5 h-3.5" /> {u.name}
              </div>
            ))}
            {system?.go_live_date && (
              <span className="text-xs text-slate-400">上線：{system.go_live_date}</span>
            )}
          </div>
        </div>
      </div>

      {/* Info summary card (replaces Steps) */}
      {system && (system.description || system.urls.length > 0) && (
        <Card variant="borderless" className="shadow-sm mb-5" styles={{ body: { padding: '16px 24px' } }}>
          <div className="flex flex-wrap gap-6 text-sm">
            {system.description && (
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-400 mr-2">系統描述</span>
                <span className="text-slate-600">{system.description}</span>
              </div>
            )}
            {system.urls.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-400">訪問網址</span>
                {system.urls.map((u, i) => (
                  <div key={i} className="flex items-center gap-1">
                    {u.name && <Tag color="processing" style={{ fontSize: 10, padding: '0 4px' }}>{u.name}</Tag>}
                    <Link href={u.url} target="_blank" style={{ fontSize: 12 }}>{u.url}</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'info',
            label: '基本資訊',
            children: (
              <div className="space-y-4">
                <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 24 } }}>
                  <Descriptions
                    bordered column={2} size="small"
                    labelStyle={{ background: '#f8fafc', color: '#64748b', fontWeight: 500, fontSize: 12 }}
                    contentStyle={{ fontSize: 13 }}
                  >
                    <Descriptions.Item label="系統名稱" span={2}>{system?.sys_nm || '—'}</Descriptions.Item>
                    <Descriptions.Item label="所屬分組">
                      {system?.sys_group ? <Tag color="blue">{system.sys_group}</Tag> : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="上線時間">{system?.go_live_date || '—'}</Descriptions.Item>
                    <Descriptions.Item label="維護人員" span={2}>
                      <div className="flex flex-wrap gap-2">
                        {(system?.maintainer_names ?? []).length === 0
                          ? <span className="text-slate-400">—</span>
                          : (system?.maintainer_names ?? []).map((u) => (
                            <div key={u.work_no} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded px-2 py-0.5">
                              <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>{u.name?.[0]}</Avatar>
                              <span className="text-sm">{u.name}</span>
                              <span className="text-xs text-slate-400">({u.work_no})</span>
                            </div>
                          ))
                        }
                      </div>
                    </Descriptions.Item>
                    {(system?.urls ?? []).length > 0 && (
                      <Descriptions.Item label="訪問網址" span={2}>
                        <div className="space-y-1.5">
                          {system!.urls.map((u, i) => (
                            <div key={i} className="flex items-center gap-2">
                              {u.name && <Tag color="processing" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px' }}>{u.name}</Tag>}
                              <Link href={u.url} target="_blank" style={{ fontSize: 13 }}>{u.url}</Link>
                            </div>
                          ))}
                        </div>
                      </Descriptions.Item>
                    )}
                    {system?.description && (
                      <Descriptions.Item label="系統描述" span={2}>
                        <span style={{ whiteSpace: 'pre-wrap', color: '#475569' }}>{system.description}</span>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                </Card>

                {(system?.deploy_info ?? []).length > 0 && (
                  <Card
                    variant="borderless" className="shadow-sm"
                    title={<span className="text-sm font-medium text-slate-600">部署資訊</span>}
                    styles={{ body: { padding: '12px 24px 20px' } }}
                  >
                    <div className="space-y-3">
                      {system!.deploy_info.map((row, i) => (
                        <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
                          {/* header */}
                          <div className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-200">
                            部署環境 #{i + 1}
                            {row.remark && <span className="ml-3 text-slate-400 font-normal">{row.remark}</span>}
                          </div>
                          <div className="grid grid-cols-2 divide-x divide-slate-200">
                            {/* Frontend */}
                            <div className="p-3">
                              <div className="text-xs font-semibold text-blue-600 mb-2">前端</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                <div className="text-slate-400">主機 IP</div>
                                <div className="text-slate-700 font-mono">{row.fe_host || '—'}</div>
                                <div className="text-slate-400">端口</div>
                                <div className="text-slate-700 font-mono">{row.fe_port || '—'}</div>
                                <div className="text-slate-400">部署路徑</div>
                                <div className="text-slate-700 font-mono break-all">{row.fe_path || '—'}</div>
                                <div className="text-slate-400">應用名</div>
                                <div className="text-slate-700">{row.fe_app_nm || '—'}</div>
                              </div>
                            </div>
                            {/* Backend */}
                            <div className="p-3">
                              <div className="text-xs font-semibold text-emerald-600 mb-2">後端</div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                <div className="text-slate-400">主機 IP</div>
                                <div className="text-slate-700 font-mono">{row.be_host || '—'}</div>
                                <div className="text-slate-400">端口</div>
                                <div className="text-slate-700 font-mono">{row.be_port || '—'}</div>
                                <div className="text-slate-400">部署路徑</div>
                                <div className="text-slate-700 font-mono break-all">{row.be_path || '—'}</div>
                                <div className="text-slate-400">應用名</div>
                                <div className="text-slate-700">{row.be_app_nm || '—'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            ),
          },
          {
            key: 'requirements',
            label: `需求 (${reqTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-600">需求列表</span>
                  <Button
                    type="primary" size="small"
                    icon={<PlusIcon className="w-4 h-4" />}
                    onClick={() => { setShowCreate(true); loadUsers() }}
                    style={{ background: '#2563eb' }}
                  >
                    新增需求
                  </Button>
                </div>
                <Table<StandaloneReq>
                  rowKey="id"
                  loading={reqLoading}
                  dataSource={reqList}
                  columns={reqColumns}
                  size="small"
                  expandable={{
                    expandedRowKeys,
                    onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
                    expandRowByClick: true,
                    expandedRowRender: (req: StandaloneReq) => (
                      <div className="bg-slate-50 px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div className="col-span-2">
                          <span className="text-xs text-slate-400 mr-2">需求描述</span>
                          {req.describe
                            ? isHtml(req.describe)
                              ? <RichTextContent content={req.describe} />
                              : <span className="text-slate-700">{req.describe}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 mr-2">期望完成</span>
                          <span className="text-slate-700">{req.expected_end_date || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 mr-2">負責人</span>
                          <span className="text-slate-700">
                            {(req.responsible ?? []).map((wn) => toName(wn) || wn).join('、') || '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 mr-2">建立人</span>
                          <span className="text-slate-700">{toName(req.creator) || req.creator || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 mr-2">建立時間</span>
                          <span className="text-slate-700">{req.created_at ? req.created_at.slice(0, 10) : '—'}</span>
                        </div>
                        {(req.files?.length ?? 0) > 0 && (
                          <div className="col-span-2">
                            <span className="text-xs text-slate-400 mr-2">附件</span>
                            <div className="mt-1">
                              <AttachmentPreview
                                files={req.files!.map((f) => ({ name: f.name, url: withToken(f.url), size: f.size }))}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ),
                  }}
                  pagination={{
                    current: reqPage, pageSize: reqPageSize, total: reqTotal,
                    showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
                    onChange: (page, size) => { setReqPageSize(size); loadReqs(page, size) },
                  }}
                  locale={{ emptyText: <Empty description="暫無需求" className="py-8" /> }}
                  scroll={{ x: 680 }}
                />
              </Card>
            ),
          },
          {
            key: 'duties',
            label: `AR任務 (${duties.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-600">本系統所有AR任務</span>
                </div>
                <Table<TemporaryDuty>
                  rowKey="id"
                  loading={dutiesLoading}
                  dataSource={duties}
                  columns={dutyColumns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: <Empty description="暫無AR任務" className="py-8" /> }}
                  scroll={{ x: 620 }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* Hidden file input for attachment upload */}
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />

      {/* Edit Requirement Modal */}
      <Modal
        title={editTarget ? `編輯需求 — ${editTarget.req_nm}` : '編輯需求'}
        open={showEditReq}
        onCancel={() => { setShowEditReq(false); editForm.resetFields() }}
        footer={null} width="min(600px, 88vw)" destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditReq} className="mt-4">
          <Form.Item name="req_nm" label="需求名稱" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="system_id" label="關聯系統" rules={[{ required: true }]}>
            <Select options={systemOptions} showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadSystemOptions() }}
            />
          </Form.Item>
          <div className="grid grid-cols-3 gap-x-4">
            <Form.Item name="status" label="狀態">
              <Select options={Object.entries(REQ_STATUS_MAP).map(([k, s]) => ({ value: Number(k), label: s.label }))} />
            </Form.Item>
            <Form.Item name="priority" label="優先級">
              <Select options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="responsible" label="負責人">
            <Select mode="multiple" placeholder="選擇負責人" options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          <Form.Item label="需求描述">
            <div className="flex justify-end mb-1.5">
              <button type="button"
                onClick={() => {
                  const cur = (editDescribeValue as string) ?? ''
                  const html = isHtml(cur) ? cur : cur.trim() ? `<p>${cur.replace(/\n/g, '</p><p>')}</p>` : ''
                  setEditExpandDraft(html); setEditExpandOpen(true)
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
              >
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />展開富文本編輯
              </button>
            </div>
            <Form.Item name="describe" noStyle getValueProps={(v) => ({ value: v && isHtml(v) ? stripHtml(v) : (v ?? '') })}>
              <Input.TextArea rows={3} placeholder="請輸入需求描述..." style={{ resize: 'vertical', minHeight: 72 }} />
            </Form.Item>
            {editDescribeValue && isHtml(editDescribeValue as string) && (
              <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
            )}
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowEditReq(false); editForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={editSaving} style={{ background: '#2563eb' }}>保存</Button>
          </div>
        </Form>
      </Modal>
      <Modal open={editExpandOpen} title="需求描述" onCancel={() => setEditExpandOpen(false)}
        width="80vw" style={{ top: 40, maxWidth: 1100 }} styles={{ body: { padding: '16px 24px 24px' } }}
        footer={<div className="flex justify-end gap-2">
          <Button onClick={() => setEditExpandOpen(false)}>取消</Button>
          <Button type="primary" onClick={() => { editForm.setFieldValue('describe', editExpandDraft); setEditExpandOpen(false) }} style={{ background: '#2563eb' }}>完成</Button>
        </div>} destroyOnClose
      >
        <RichTextEditor value={editExpandDraft} onChange={setEditExpandDraft} placeholder="請輸入需求描述..." minHeight={480} />
      </Modal>

      {/* Create Requirement Modal */}
      <Modal
        title="新增需求"
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields() }}
        footer={null}
        width="min(600px, 88vw)"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="req_nm" label="需求名稱" rules={[{ required: true, message: '請輸入需求名稱' }]}>
            <Input placeholder="請輸入需求名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" initialValue={2}>
              <Select options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成日期">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple" placeholder="選擇負責人"
              options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          <Form.Item label="需求描述">
            <div className="flex justify-end mb-1.5">
              <button type="button"
                onClick={() => {
                  const current = (describeValue as string) ?? ''
                  const html = isHtml(current) ? current : current.trim() ? `<p>${current.replace(/\n/g, '</p><p>')}</p>` : ''
                  setExpandDraft(html)
                  setExpandOpen(true)
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
              >
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                展開富文本編輯
              </button>
            </div>
            <Form.Item name="describe" noStyle getValueProps={(v) => ({ value: v && isHtml(v) ? stripHtml(v) : (v ?? '') })}>
              <Input.TextArea rows={3} placeholder="請描述需求內容..." style={{ resize: 'vertical', minHeight: 72 }} />
            </Form.Item>
            {describeValue && isHtml(describeValue as string) && (
              <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
            )}
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); createForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createSaving} style={{ background: '#2563eb' }}>建立</Button>
          </div>
        </Form>
      </Modal>

      {/* Rich Text Expand for create */}
      <Modal open={expandOpen} title="需求描述" onCancel={() => setExpandOpen(false)}
        width="80vw" style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={<div className="flex justify-end gap-2">
          <Button onClick={() => setExpandOpen(false)}>取消</Button>
          <Button type="primary" onClick={() => { createForm.setFieldValue('describe', expandDraft); setExpandOpen(false) }} style={{ background: '#2563eb' }}>完成</Button>
        </div>}
        destroyOnClose
      >
        <RichTextEditor value={expandDraft} onChange={setExpandDraft} placeholder="請輸入需求描述..." minHeight={480} />
      </Modal>
    </div>
  )
}

export default SystemDetailPage
