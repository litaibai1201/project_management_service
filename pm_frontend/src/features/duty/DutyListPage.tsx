import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Progress, Modal, Form, Tag, Avatar, Segmented, Collapse, AutoComplete, Spin, Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon, MagnifyingGlassIcon, TrashIcon, EyeIcon, FolderIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDutyListThunk, deleteDutyThunk, setDutyQuery, createDutyThunk } from './dutySlice'
import { TemporaryDuty } from '@/types/api.types'
import { DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

const { Search } = Input
const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return <span className="text-slate-300 text-xs">—</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)}天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">{date}</span>
}

const StatusDot: React.FC<{ status: number }> = ({ status }) => {
  const s = DUTY_STATUS_MAP[status]
  const colorMap: Record<string, string> = {
    default: '#94a3b8', processing: '#2563eb', orange: '#d97706', success: '#16a34a', warning: '#f59e0b', error: '#dc2626',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="status-dot" style={{ background: colorMap[s?.color ?? 'default'] }} />
      <span className="text-slate-600 text-sm">{s?.label ?? status}</span>
    </div>
  )
}

const DutyListPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { list, totalCount, isLoading, isSaving, query } = useAppSelector((s) => s.duty)
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const [dutyView, setDutyView]     = useState<'all' | 'mine'>('all')
  const [groupMode, setGroupMode]   = useState<'flat' | 'grouped'>('grouped')
  const [filterGroup, setFilterGroup] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form] = Form.useForm()

  const myList = useMemo(
    () => list.filter((d) => (d.responsible ?? '').split(';').some((r) => r.trim() === workNo)),
    [list, workNo],
  )

  // Apply view filter + group filter
  const displayedList = useMemo(() => {
    let result = dutyView === 'mine' ? myList : list
    if (filterGroup) result = result.filter((d) => (d.group ?? '未分組') === filterGroup)
    return result
  }, [dutyView, myList, list, filterGroup])

  // Unique groups from the full list
  const existingGroups = useMemo(
    () => Array.from(new Set(list.map((d) => d.group).filter(Boolean) as string[])),
    [list],
  )
  const groupFilterOptions = useMemo(
    () => existingGroups.map((g) => ({ label: g, value: g })),
    [existingGroups],
  )
  const groupAutoOptions = useMemo(
    () => existingGroups.map((g) => ({ value: g, label: g })),
    [existingGroups],
  )

  // Grouped data
  const groupedDuties = useMemo(() => {
    const map = new Map<string, TemporaryDuty[]>()
    displayedList.forEach((d) => {
      const g = d.group || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(d)
    })
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      count: items.length,
      avgProgress: Math.round(items.reduce((s, d) => s + (d.progress ?? 0), 0) / items.length),
      overdueCount: items.filter((d) => d.expected_end_date && new Date(d.expected_end_date) < new Date() && d.status !== 3).length,
    }))
  }, [displayedList])

  useEffect(() => { dispatch(fetchDutyListThunk(query)) }, [dispatch, query])

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteDutyThunk(id)).unwrap()
      showToast.success('刪除成功')
    } catch { showToast.error('刪除失敗') }
  }

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await dispatch(createDutyThunk({
        payload: {
          duty_nm:             values.duty_nm as string,
          describe:            values.describe as string | undefined,
          group:               values.group as string | undefined,
          priority:            values.priority as number,
          expected_start_date: values.expected_start_date as string | undefined,
          expected_end_date:   values.expected_end_date as string | undefined,
        },
      })).unwrap()
      showToast.success('臨時任務建立成功')
      setShowCreate(false); form.resetFields()
      dispatch(fetchDutyListThunk(query))
    } catch (err: unknown) { showToast.error((err as string) || '建立失敗') }
  }

  const columns: ColumnsType<TemporaryDuty> = [
    {
      title: '任務名稱', dataIndex: 'duty_nm', ellipsis: true,
      render: (name: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[record.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500 }}
            onClick={() => navigate(`/duties/${record.id}`)}>
            {name}
          </Button>
        </div>
      ),
    },
    {
      title: '分組', dataIndex: 'group', width: 100,
      render: (v: string) => v ? (
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0 }} color="processing">{v}</Tag>
      ) : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => <StatusDot status={v} />,
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 120,
      render: (v: string) => v ? (
        <div className="flex items-center gap-1.5">
          <Avatar size={18} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{v?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600 truncate">{v.split(';').join(', ')}</span>
        </div>
      ) : <span className="text-slate-300 text-xs">未分配</span>,
    },
    {
      title: '進度', dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={v >= 80 ? '#16a34a' : v >= 40 ? '#2563eb' : '#94a3b8'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 120,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="查看">
            <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text"
              onClick={() => navigate(`/duties/${record.id}`)} />
          </Tooltip>
          <Popconfirm title="確認刪除此任務？" onConfirm={() => handleDelete(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // In grouped mode, hide the group column since it's shown as the panel header
  const groupedColumns = columns.filter((c) => (c as { dataIndex?: string }).dataIndex !== 'group')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">臨時任務</h1>
          <p className="text-slate-400 text-sm mt-0.5">共 {totalCount} 個任務</p>
        </div>
        <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => setShowCreate(true)} style={{ background: '#2563eb', fontWeight: 500 }}>
          新建任務
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        {/* 全部/我的 切換 */}
        <Segmented
          value={dutyView}
          onChange={(v) => setDutyView(v as 'all' | 'mine')}
          options={[
            { label: `全部 (${list.length})`, value: 'all'  },
            { label: `我的 (${myList.length})`, value: 'mine' },
          ]}
        />
        <div className="w-px h-5 bg-slate-200" />
        <Segmented
          size="small"
          value={groupMode}
          onChange={(v) => setGroupMode(v as 'flat' | 'grouped')}
          options={[
            { label: '分組', value: 'grouped' },
            { label: '平面', value: 'flat'    },
          ]}
        />
        <div className="w-px h-5 bg-slate-200" />
        <Search placeholder="搜索任務名稱..." allowClear style={{ width: 220 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => dispatch(setDutyQuery({ keyword: v, page: 1 }))}
        />
        <Select placeholder="狀態" allowClear style={{ width: 130 }}
          onChange={(v) => dispatch(setDutyQuery({ status: v, page: 1 }))}
          options={Object.entries(DUTY_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
        />
        <Select placeholder="優先級" allowClear style={{ width: 110 }}
          onChange={(v) => dispatch(setDutyQuery({ priority: v, page: 1 }))}
          options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]}
        />
        {/* Group filter */}
        {groupFilterOptions.length > 0 && (
          <Select
            placeholder="分組"
            allowClear
            style={{ width: 120 }}
            value={filterGroup}
            onChange={(v) => setFilterGroup(v ?? null)}
            options={groupFilterOptions}
          />
        )}
      </div>

      {/* Table / Grouped display */}
      {groupMode === 'flat' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
          <Table
            rowKey="id" columns={columns} dataSource={displayedList} loading={isLoading}
            pagination={{
              current: query.page, pageSize: query.size ?? 10,
              total: dutyView === 'mine' ? myList.length : totalCount,
              showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
              onChange: (page, size) => dispatch(setDutyQuery({ page, size })),
            }}
            scroll={{ x: 920 }} size="middle"
          />
        </div>
      ) : (
        <div>
          {isLoading ? (
            <div className="flex justify-center py-12"><Spin size="large" /></div>
          ) : groupedDuties.length === 0 ? (
            <Empty description="暫無任務" className="py-12" />
          ) : (
            <Collapse
              defaultActiveKey={groupedDuties.map((g) => g.name)}
              className="bg-transparent border-0"
              expandIconPosition="start"
            >
              {groupedDuties.map((g) => (
                <Collapse.Panel
                  key={g.name}
                  header={
                    <div className="flex items-center gap-3">
                      <FolderIcon className="w-4 h-4 text-blue-500" />
                      <span className="font-semibold text-slate-700">{g.name}</span>
                      <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                        {g.count} 項
                      </Tag>
                      <Progress
                        percent={g.avgProgress} size="small" showInfo={false}
                        style={{ width: 80 }} strokeColor="#2563eb" trailColor="#e2e8f0"
                      />
                      <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                      {g.overdueCount > 0 && (
                        <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                          超時 {g.overdueCount}
                        </Tag>
                      )}
                    </div>
                  }
                >
                  <Table rowKey="id" columns={groupedColumns} dataSource={g.items}
                    pagination={false} size="small" scroll={{ x: 820 }} />
                </Collapse.Panel>
              ))}
            </Collapse>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal title="新建臨時任務" open={showCreate}
        onCancel={() => { setShowCreate(false); form.resetFields() }}
        footer={null} width={520} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="duty_nm" label="任務名稱" rules={[{ required: true }]}>
            <Input placeholder="請輸入任務名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
            </Form.Item>
            <Form.Item name="group" label="任務分組">
              <AutoComplete
                options={groupAutoOptions}
                placeholder="選擇或輸入分組"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
            <Form.Item name="expected_end_date" label="預計完成"><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="describe" label="任務描述">
            <Input.TextArea rows={3} placeholder="請描述任務內容" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>建立</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default DutyListPage
