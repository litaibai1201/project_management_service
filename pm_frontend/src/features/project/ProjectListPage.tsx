import React, { useEffect, useState } from 'react'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Progress, Tag, Avatar, Card, Badge, Modal, Spin, Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusIcon, MagnifyingGlassIcon, TrashIcon, EyeIcon,
  Squares2X2Icon, ListBulletIcon, TableCellsIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import {
  fetchProjectListThunk, deleteProjectThunk, setQuery, fetchProjectGroupsThunk,
} from './projectSlice'
import { ProjectListItem, ProjectFunction } from '@/types/api.types'
import { PROJECT_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import CreateProjectModal from './CreateProjectModal'
import WbsTable from '@/components/common/WbsTable'
import { projectApi, requirementApi } from '@/api/project.api'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { useTranslation } from 'react-i18next'


const { Search } = Input

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ date?: string; status?: number }> = ({ date, status }) => {
  const { t } = useTranslation()
  if (!date || !dayjs(date).isValid()) return <span className="text-slate-300 text-xs">—</span>
  if (status === 7) return <span className="days-ok">{date}</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">{t('project.overdueDays', { days: Math.abs(days) })}</span>
  if (days <= 3) return <span className="days-overdue">{t('project.daysLeft', { days })}</span>
  if (days <= 7) return <span className="days-warning">{t('project.daysLeft', { days })}</span>
  return <span className="days-ok">{date}</span>
}

const StatusDot: React.FC<{ status: number }> = ({ status }) => {
  const s = PROJECT_STATUS_MAP[status]
  const colorMap: Record<string, string> = {
    default: '#94a3b8', processing: '#2563eb', blue: '#3b82f6', purple: '#8b5cf6',
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

const KANBAN_STATUSES = [
  { status: 1,  color: '#94a3b8' },
  { status: 2,  color: '#2563eb' },
  { status: 3,  color: '#8b5cf6' },
  { status: 4,  color: '#f59e0b' },
  { status: 10, color: '#7c3aed' },
  { status: 11, color: '#2563eb' },
  { status: 5,  color: '#16a34a' },
  { status: 6,  color: '#d97706' },
  { status: 7,  color: '#2563eb' },
]

const KanbanView: React.FC<{
  list: ProjectListItem[]
  onView: (id: string) => void
  onDelete: (id: string) => void
}> = ({ list, onView, onDelete }) => {
  const { t } = useTranslation()
  const toName = useWorkNoToName()
  return (
  <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
    {KANBAN_STATUSES.map((col) => {
      const cards = list.filter((p) => p.status === col.status)
      return (
        <div key={col.status} className="kanban-col flex-shrink-0">
          {/* Column header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
            <span className="font-semibold text-slate-600 text-sm">{PROJECT_STATUS_MAP[col.status]?.label ?? col.status}</span>
            <Badge count={cards.length} style={{ backgroundColor: '#e2e8f0', color: '#64748b', boxShadow: 'none', fontSize: 11 }} />
          </div>

          {/* Cards */}
          <div className="flex flex-col gap-2">
            {cards.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl h-20 flex items-center justify-center">
                <span className="text-xs text-slate-300">{t('project.noItems')}</span>
              </div>
            ) : (
              cards.map((p) => (
                <Card
                  key={p.id}
                  size="small"
                  variant="borderless"
                  className={`kanban-card shadow-sm priority-border-${p.priority}`}
                  styles={{ body: { padding: '12px 14px' } }}
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
                        {toName(p.project_pm)?.[0]?.toUpperCase()}
                      </Avatar>
                      <span className="text-xs text-slate-400 truncate" style={{ maxWidth: 60 }}>{toName(p.project_pm)}</span>
                    </div>
                    <DaysLeftBadge date={p.expected_end_date} status={p.status} />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <Tag style={{ fontSize: 10, padding: '0 5px', margin: 0, lineHeight: '16px' }}
                      color={PRIORITY_MAP[p.priority]?.color}>
                      {PRIORITY_MAP[p.priority]?.label}
                    </Tag>
                    <Popconfirm title={t('project.deleteConfirm')} onConfirm={(e) => { e?.stopPropagation(); onDelete(p.id) }} okText={t('common.confirm')} cancelText={t('common.cancel')}>
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
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProjectListPage: React.FC = () => {
  const { t } = useTranslation()
  const dispatch  = useAppDispatch()
  const { list, totalCount, isLoading, query, groups } = useAppSelector((s) => s.project)
  const { isManagerView } = useAppSelector((s) => s.auth)
  const toName = useWorkNoToName()
  const [showCreate, setShowCreate] = useState(false)
  const [viewMode,   setViewMode]   = useState<'table' | 'kanban'>('table')
  const [wbsProject,      setWbsProject]      = useState<ProjectListItem | null>(null)
  const [wbsFunctions,    setWbsFunctions]    = useState<ProjectFunction[]>([])
  const [wbsRequirements, setWbsRequirements] = useState<any[]>([])
  const [wbsLoading,      setWbsLoading]      = useState(false)

  const openProjectWbs = async (project: ProjectListItem) => {
    setWbsProject(project)
    setWbsFunctions([])
    setWbsRequirements([])
    setWbsLoading(true)
    try {
      const [funcRes, reqRes] = await Promise.all([
        projectApi.functionList(project.id, { page: 1, size: 500 }),
        requirementApi.list(project.id),
      ])
      setWbsFunctions((funcRes.content as any).data_list ?? [])
      setWbsRequirements((reqRes.content as any) ?? [])
    } catch { } finally { setWbsLoading(false) }
  }

  useEffect(() => { dispatch(fetchProjectGroupsThunk()) }, [dispatch])
  useEffect(() => { dispatch(fetchProjectListThunk(query)) }, [dispatch, query, isManagerView])

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteProjectThunk(id)).unwrap()
      showToast.success(t('common.deleteSuccess'))
    } catch { showToast.error(t('common.deleteFailed')) }
  }

  const rawColumns: ColumnsType<ProjectListItem> = [
    {
      title: t('project.projectName'), dataIndex: 'project_nm', ellipsis: true, width: 220,
      render: (name: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 28, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[record.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500 }}
            onClick={() => window.open(`/projects/${record.id}`, '_blank')}>
            {name}
          </Button>
        </div>
      ),
    },
    {
      title: t('user.department'), dataIndex: 'department', width: 110,
      render: (v: string) => <span className="text-slate-500 text-sm">{v}</span>,
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 120,
      render: (v: number) => <StatusDot status={v} />,
      filters: Object.entries(PROJECT_STATUS_MAP).map(([k, v]) => ({ text: v.label, value: Number(k) })),
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 80,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v
      },
    },
    {
      title: 'PM', dataIndex: 'project_pm', width: 100,
      render: (v: string) => (
        <div className="flex items-center gap-1.5">
          <Avatar size={20} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{toName(v)?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600">{toName(v)}</span>
        </div>
      ),
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 130,
      render: (v: number, row: ProjectListItem) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor={row.status === 7 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400 w-7 text-right">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 120,
      render: (v: string, row: ProjectListItem) => <DaysLeftBadge date={v} status={row.status} />,
      sorter: true,
    },
    {
      title: 'WBS', key: 'wbs', width: 60,
      render: (_: unknown, record) => (
        <Tooltip title={t('project.wbsView')}>
          <Button
            type="text" size="small"
            icon={<TableCellsIcon className="w-4 h-4" />}
            onClick={(e) => { e.stopPropagation(); openProjectWbs(record) }}
          />
        </Tooltip>
      ),
    },
    {
      title: t('common.operation'), key: 'action', fixed: 'right', width: 80,
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title={t('common.detail')}>
            <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text"
              onClick={() => window.open(`/projects/${record.id}`, '_blank')} />
          </Tooltip>
          <Popconfirm title={t('project.deleteConfirm')} onConfirm={() => handleDelete(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Tooltip title={t('common.delete')}><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]
  const { mergeColumns } = useResizableColumns(rawColumns)
  const columns = mergeColumns

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('project.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('common.total', { count: totalCount })}</p>
        </div>
        <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
          onClick={() => setShowCreate(true)} style={{ background: '#2563eb', fontWeight: 500 }}>
          {t('project.create')}
        </Button>
      </div>

      {/* Filter + View toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Search
          placeholder={`${t('common.search')}...`}
          allowClear style={{ width: 220 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => dispatch(setQuery({ keyword: v, page: 1 }))}
        />
        <Select placeholder={t('project.statusFilter')} allowClear style={{ width: 130 }}
          onChange={(v) => dispatch(setQuery({ status: v, page: 1 }))}
          options={Object.entries(PROJECT_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
        />
        <Select placeholder={t('project.groupFilter')} allowClear style={{ width: 150 }}
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
            onView={(id) => window.open(`/projects/${id}`, '_blank')}
            onDelete={handleDelete}
          />
        ) : (
          <Table
            rowKey="id" columns={columns} dataSource={list} loading={isLoading}
            components={tableComponents}
            pagination={{
              current: query.page, pageSize: query.size ?? 10, total: totalCount,
              showSizeChanger: true, showTotal: (total) => t('common.total', { count: total }),
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

      <Modal
        open={!!wbsProject}
        onCancel={() => setWbsProject(null)}
        footer={null}
        title={wbsProject?.project_nm ?? 'WBS'}
        width={860}
        destroyOnHidden
      >
        {wbsLoading ? (
          <div className="flex items-center justify-center py-12"><Spin /></div>
        ) : wbsFunctions.length === 0 ? (
          <Empty description={t('project.noTasks')} />
        ) : (
          <WbsTable functions={wbsFunctions} toName={toName} requirements={wbsRequirements} defaultExpanded />
        )}
      </Modal>
    </div>
  )
}

export default ProjectListPage
