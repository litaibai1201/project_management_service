import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Progress, Tag, Avatar, Card, Badge,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusIcon, MagnifyingGlassIcon, TrashIcon, EyeIcon,
  Squares2X2Icon, ListBulletIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import {
  fetchProjectListThunk, deleteProjectThunk, setQuery, fetchProjectGroupsThunk,
} from './projectSlice'
import { ProjectListItem } from '@/types/api.types'
import { PROJECT_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import CreateProjectModal from './CreateProjectModal'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

const { Search } = Input

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const s = PROJECT_STATUS_MAP[status]
  const colorMap: Record<string, string> = {
    default: '#94a3b8', processing: '#2563eb', blue: '#3b82f6',
    green: '#16a34a', orange: '#d97706', success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="status-dot" style={{ background: colorMap[s?.color ?? 'default'] }} />
      <span className="text-slate-600 text-sm">{s?.label ?? status}</span>
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

const KANBAN_COLS = [
  { status: 1, title: '草稿',     color: '#94a3b8' },
  { status: 2, title: '立案審核', color: '#2563eb' },
  { status: 3, title: '規劃中',   color: '#8b5cf6' },
  { status: 4, title: '規劃審核', color: '#f59e0b' },
  { status: 5, title: '執行中',   color: '#16a34a' },
  { status: 6, title: '完結審核', color: '#d97706' },
  { status: 7, title: '已完結',   color: '#64748b' },
]

const KanbanView: React.FC<{
  list: ProjectListItem[]
  onView: (id: string) => void
  onDelete: (id: string) => void
}> = ({ list, onView, onDelete }) => (
  <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
    {KANBAN_COLS.map((col) => {
      const cards = list.filter((p) => p.status === col.status)
      return (
        <div key={col.status} className="kanban-col flex-shrink-0">
          {/* Column header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
            <span className="font-semibold text-slate-600 text-sm">{col.title}</span>
            <Badge count={cards.length} style={{ backgroundColor: '#e2e8f0', color: '#64748b', boxShadow: 'none', fontSize: 11 }} />
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2">
            {cards.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl h-20 flex items-center justify-center">
                <span className="text-xs text-slate-300">暫無項目</span>
              </div>
            ) : (
              cards.map((p) => (
                <Card
                  key={p.id}
                  size="small"
                  bordered={false}
                  className={`kanban-card shadow-sm priority-border-${p.priority}`}
                  bodyStyle={{ padding: '12px 14px' }}
                  onClick={() => onView(p.id)}
                >
                  <div className="font-medium text-slate-700 text-sm leading-snug truncate-2 mb-2">
                    {p.project_nm}
                  </div>
                  <Progress
                    percent={p.progress ?? 0} size="small" showInfo={false}
                    strokeColor={col.color} trailColor="#f1f5f9"
                    style={{ marginBottom: 8 }}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Avatar size={18} style={{ background: '#2563eb', fontSize: 10, fontWeight: 600 }}>
                        {p.project_pm?.[0]?.toUpperCase()}
                      </Avatar>
                      <span className="text-xs text-slate-400 truncate" style={{ maxWidth: 60 }}>{p.project_pm}</span>
                    </div>
                    <DaysLeftBadge date={p.expected_end_date} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Tag style={{ fontSize: 10, padding: '0 5px', margin: 0, lineHeight: '16px' }}
                      color={PRIORITY_MAP[p.priority]?.color}>
                      {PRIORITY_MAP[p.priority]?.label}
                    </Tag>
                    <Popconfirm title="確認刪除？" onConfirm={(e) => { e?.stopPropagation(); onDelete(p.id) }} okText="確認" cancelText="取消">
                      <Button
                        type="text" size="small" danger
                        icon={<TrashIcon className="w-3 h-3" />}
                        onClick={(e) => e.stopPropagation()}
                        style={{ padding: '0 4px', height: 20 }}
                      />
                    </Popconfirm>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )
    })}
  </div>
)

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProjectListPage: React.FC = () => {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()
  const { list, totalCount, isLoading, query, groups } = useAppSelector((s) => s.project)
  const { isManagerView } = useAppSelector((s) => s.auth)
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode,   setViewMode]   = useState<'table' | 'kanban'>('table')

  useEffect(() => { dispatch(fetchProjectGroupsThunk()) }, [dispatch])
  useEffect(() => { dispatch(fetchProjectListThunk(query)) }, [dispatch, query, isManagerView])

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteProjectThunk(id)).unwrap()
      showToast.success('刪除成功')
    } catch { showToast.error('刪除失敗') }
  }

  const columns: ColumnsType<ProjectListItem> = [
    {
      title: '專案名稱', dataIndex: 'project_nm', ellipsis: true,
      render: (name: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[record.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500 }}
            onClick={() => navigate(`/projects/${record.id}`)}>
            {name}
          </Button>
        </div>
      ),
    },
    { title: '部門', dataIndex: 'department', width: 110, render: (v: string) => <span className="text-slate-500 text-sm">{v}</span> },
    {
      title: '狀態', dataIndex: 'status', width: 120,
      render: (v: number) => <StatusDot status={v} />,
      filters: Object.entries(PROJECT_STATUS_MAP).map(([k, v]) => ({ text: v.label, value: Number(k) })),
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v
      },
    },
    {
      title: 'PM', dataIndex: 'project_pm', width: 100,
      render: (v: string) => (
        <div className="flex items-center gap-1.5">
          <Avatar size={20} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{v?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600">{v}</span>
        </div>
      ),
    },
    {
      title: '進度', dataIndex: 'progress', width: 130,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor="#2563eb" trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400 w-7 text-right">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 120,
      render: (v: string) => <DaysLeftBadge date={v} />,
      sorter: true,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="查看詳情">
            <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text"
              onClick={() => navigate(`/projects/${record.id}`)} />
          </Tooltip>
          <Popconfirm title="確認刪除此專案？" onConfirm={() => handleDelete(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
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
          <h1 className="text-2xl font-bold text-slate-800">專案管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">共 {totalCount} 個專案</p>
        </div>
        <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => setShowCreate(true)} style={{ background: '#2563eb', fontWeight: 500 }}>
          新建專案
        </Button>
      </div>

      {/* Filter + View toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Search
          placeholder="搜索專案名稱..."
          allowClear style={{ width: 220 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => dispatch(setQuery({ keyword: v, page: 1 }))}
        />
        <Select placeholder="狀態" allowClear style={{ width: 130 }}
          onChange={(v) => dispatch(setQuery({ status: v, page: 1 }))}
          options={Object.entries(PROJECT_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
        />
        <Select placeholder="分組" allowClear style={{ width: 150 }}
          onChange={(v) => dispatch(setQuery({ group_id: v, page: 1 }))}
          options={(groups ?? []).map((g) => ({ value: g.id, label: g.group_nm }))}
        />
        <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
          <Button
            type={viewMode === 'table' ? 'primary' : 'text'} size="small"
            icon={<ListBulletIcon className="w-4 h-4" />}
            onClick={() => setViewMode('table')}
            style={{ borderRadius: 6, ...(viewMode === 'table' ? { background: '#2563eb' } : {}) }}
          />
          <Button
            type={viewMode === 'kanban' ? 'primary' : 'text'} size="small"
            icon={<Squares2X2Icon className="w-4 h-4" />}
            onClick={() => setViewMode('kanban')}
            style={{ borderRadius: 6, ...(viewMode === 'kanban' ? { background: '#2563eb' } : {}) }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
        {viewMode === 'kanban' ? (
          <KanbanView
            list={list}
            onView={(id) => navigate(`/projects/${id}`)}
            onDelete={handleDelete}
          />
        ) : (
          <Table
            rowKey="id" columns={columns} dataSource={list} loading={isLoading}
            pagination={{
              current: query.page, pageSize: query.size ?? 10, total: totalCount,
              showSizeChanger: true, showTotal: (t) => `共 ${t} 條`,
              onChange: (page, size) => dispatch(setQuery({ page, size })),
            }}
            scroll={{ x: 980 }}
            size="middle"
          />
        )}
      </div>

      {showCreate && (
        <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); dispatch(fetchProjectListThunk(query)) }}
        />
      )}
    </div>
  )
}

export default ProjectListPage
