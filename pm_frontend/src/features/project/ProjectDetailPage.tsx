import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Tabs, Descriptions, Button, Tag, Progress, Spin, Empty, Table,
  Space, Tooltip, Popconfirm, Modal, Form, Input, Select, Steps, Avatar,
  Timeline, Card,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon,
  CodeBracketIcon, UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchProjectThunk, clearCurrent } from './projectSlice'
import { projectApi } from '@/api/project.api'
import { ProjectFunction } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import FunctionDetailDrawer from './FunctionDetailDrawer'

// ─── Status Steps ─────────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { title: '草稿',     statuses: [1] },
  { title: '立案審核', statuses: [2] },
  { title: '規劃中',   statuses: [3] },
  { title: '規劃審核', statuses: [4] },
  { title: '執行中',   statuses: [5] },
  { title: '完結審核', statuses: [6] },
  { title: '已完結',   statuses: [7] },
]

const getStepIndex = (status: number) => {
  const idx = STATUS_STEPS.findIndex((s) => s.statuses.includes(status))
  return idx >= 0 ? idx : 0
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { current, isLoading } = useAppSelector((s) => s.project)

  const [functions,       setFunctions]       = useState<ProjectFunction[]>([])
  const [funcLoading,     setFuncLoading]      = useState(false)
  const [dynamics,        setDynamics]         = useState<Record<string, unknown>[]>([])
  const [selectedFid,     setSelectedFid]      = useState<string | null>(null)
  const [showAddFunc,     setShowAddFunc]      = useState(false)
  const [addFuncLoading,  setAddFuncLoading]   = useState(false)
  const [funcForm]                             = Form.useForm()

  useEffect(() => {
    if (id) {
      dispatch(fetchProjectThunk(id))
      loadFunctions(id)
      loadDynamics(id)
    }
    return () => { dispatch(clearCurrent()) }
  }, [id, dispatch])

  const loadFunctions = async (pid: string) => {
    setFuncLoading(true)
    try {
      const res = await projectApi.functionList(pid, { page: 1, size: 100 })
      const c = res.content as { project_list?: ProjectFunction[]; data_list?: ProjectFunction[] }
      setFunctions((c.project_list ?? c.data_list ?? []) as ProjectFunction[])
    } catch { /* global */ }
    finally { setFuncLoading(false) }
  }

  const loadDynamics = async (pid: string) => {
    try {
      const res = await projectApi.memberDynamics(pid, { page: 1, size: 20 })
      const c = res.content as { data_list?: Record<string, unknown>[] }
      setDynamics((c.data_list ?? []) as Record<string, unknown>[])
    } catch { /* global */ }
  }

  const handleAddFunction = async (values: Record<string, unknown>) => {
    if (!id) return
    setAddFuncLoading(true)
    try {
      await projectApi.addFunction(id, {
        function_nm: values.function_nm as string,
        describe:    values.describe as string | undefined,
        priority:    values.priority as number,
        group1:      values.group1 as string,
        expected_start_date: values.expected_start_date as string | undefined,
        expected_end_date:   values.expected_end_date as string | undefined,
      })
      showToast.success('功能新增成功')
      setShowAddFunc(false); funcForm.resetFields(); loadFunctions(id)
    } catch { /* global */ }
    finally { setAddFuncLoading(false) }
  }

  const handleDeleteFunction = async (fid: string) => {
    if (!id) return
    try {
      await projectApi.deleteFunction(id, fid)
      showToast.success('功能刪除成功'); loadFunctions(id)
    } catch { /* global */ }
  }

  const funcColumns: ColumnsType<ProjectFunction> = [
    {
      title: '功能名稱', dataIndex: 'function_nm',
      render: (name: string, r) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => setSelectedFid(r.id)}>{name}</Button>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = FUNCTION_STATUS_MAP[v]
        return s ? <div className="flex items-center gap-1.5"><span className="status-dot" style={{ background: ['#94a3b8','#2563eb','#d97706','#16a34a','','#f59e0b','','','#94a3b8','#dc2626'][v] ?? '#94a3b8' }} /><span className="text-sm">{s.label}</span></div> : v
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
    },
    {
      title: '進度', dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor="#2563eb" trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    { title: '預計完成', dataIndex: 'expected_end_date', width: 110 },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="查看"><Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(record.id)} /></Tooltip>
          <Popconfirm title="確認刪除？" onConfirm={() => handleDeleteFunction(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
  if (!current)  return <Empty description="專案不存在" className="mt-20" />

  const stepIndex = getStepIndex(current.status)

  return (
    <div className="p-6">
      {/* Back + Title */}
      <div className="flex items-start gap-3 mb-5">
        <Button icon={<ArrowLeftIcon className="w-4 h-4" />} onClick={() => navigate(-1)} type="text" className="mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{current.project_nm}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Tag color="blue" style={{ fontSize: 12 }}>{current.department}</Tag>
            {current.product_pm && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <UserCircleIcon className="w-3.5 h-3.5" /> 産品：{current.product_pm}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <UserCircleIcon className="w-3.5 h-3.5" /> 專案：{current.project_pm}
            </div>
            {current.code_url && (
              <a href={current.code_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <CodeBracketIcon className="w-3.5 h-3.5" /> 代碼庫
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Status progress steps */}
      <Card bordered={false} className="shadow-sm mb-5" bodyStyle={{ padding: '20px 28px' }}>
        <Steps
          current={stepIndex}
          size="small"
          items={STATUS_STEPS.map((s, i) => ({
            title: <span style={{ fontSize: 12 }}>{s.title}</span>,
            status: i < stepIndex ? 'finish' : i === stepIndex ? 'process' : 'wait',
          }))}
        />
        {current.progress != null && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-slate-400 w-14">整體進度</span>
            <Progress percent={current.progress} size="small" strokeColor="#2563eb" trailColor="#f1f5f9" style={{ flex: 1 }} />
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Tabs
        type="card"
        items={[
          {
            key: 'info',
            label: '基本資訊',
            children: (
              <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: 24 }}>
                <Descriptions bordered column={2} size="small"
                  labelStyle={{ background: '#f8fafc', color: '#64748b', fontWeight: 500, fontSize: 12 }}
                  contentStyle={{ fontSize: 13 }}
                >
                  <Descriptions.Item label="優先級">
                    {(() => { const p = PRIORITY_MAP[current.priority]; return p ? <Tag color={p.color}>{p.label}</Tag> : current.priority })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="建立人">{current.creator}</Descriptions.Item>
                  <Descriptions.Item label="産品PM">{current.product_pm}</Descriptions.Item>
                  <Descriptions.Item label="專案PM">{current.project_pm}</Descriptions.Item>
                  <Descriptions.Item label="預計完成">{current.expected_end_date ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="建立時間">{current.created_at}</Descriptions.Item>
                  <Descriptions.Item label="描述" span={2}>{current.describe ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'functions',
            label: `功能任務 (${functions.length})`,
            children: (
              <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: 0 }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <span className="font-medium text-slate-700 text-sm">功能列表</span>
                  <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                    onClick={() => setShowAddFunc(true)} size="small" style={{ background: '#2563eb' }}>
                    新增功能
                  </Button>
                </div>
                <Table rowKey="id" columns={funcColumns} dataSource={functions}
                  loading={funcLoading} pagination={{ pageSize: 10 }} size="middle" scroll={{ x: 800 }} />
              </Card>
            ),
          },
          {
            key: 'dynamics',
            label: '成員動態',
            children: (
              <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: '16px 24px' }}>
                {dynamics.length === 0 ? (
                  <Empty description="暫無動態記錄" />
                ) : (
                  <Timeline
                    items={dynamics.map((d) => ({
                      dot: (
                        <Avatar size={24} style={{ background: '#2563eb', fontSize: 11, fontWeight: 600 }}>
                          {String(d.operator ?? '?')[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div>
                          <span className="font-medium text-slate-700 text-sm">{String(d.operator ?? '')}</span>
                          <span className="text-slate-400 text-sm"> · {String(d.action ?? '')}</span>
                          <div className="text-xs text-slate-300 mt-0.5">{String(d.created_at ?? '')}</div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* Add Function Modal */}
      <Modal title="新增功能任務" open={showAddFunc}
        onCancel={() => { setShowAddFunc(false); funcForm.resetFields() }}
        footer={null} width={520} destroyOnClose>
        <Form form={funcForm} layout="vertical" onFinish={handleAddFunction} className="mt-4">
          <Form.Item name="function_nm" label="功能名稱" rules={[{ required: true }]}>
            <Input placeholder="請輸入功能名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
            </Form.Item>
            <Form.Item name="group1" label="任務分組" rules={[{ required: true }]}>
              <Input placeholder="分組名稱" />
            </Form.Item>
            <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
            <Form.Item name="expected_end_date"   label="預計結束"><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="describe" label="功能描述">
            <Input.TextArea rows={3} placeholder="請描述功能需求" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowAddFunc(false); funcForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={addFuncLoading} style={{ background: '#2563eb' }}>新增</Button>
          </div>
        </Form>
      </Modal>

      {/* Function Detail Drawer */}
      {selectedFid && id && (
        <FunctionDetailDrawer projectId={id} functionId={selectedFid}
          open={!!selectedFid} onClose={() => setSelectedFid(null)}
          onRefresh={() => loadFunctions(id)} />
      )}
    </div>
  )
}

export default ProjectDetailPage
