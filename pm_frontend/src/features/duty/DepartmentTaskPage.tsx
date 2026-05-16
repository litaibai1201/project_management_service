import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Button, Avatar, Tooltip, Modal, Form, Input, Select, DatePicker,
  Spin, Tabs, Progress,
} from 'antd'
import {
  PlusIcon, FunnelIcon, AdjustmentsHorizontalIcon, Squares2X2Icon,
} from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { TemporaryDuty, CreateDutyPayload } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import DutyDetailDrawer from './DutyDetailDrawer'

dayjs.extend(isSameOrBefore)

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_GROUPS = ['部門管理', '長期工作', '臨時工作', '想法實驗室']

const STATUS_TAG: Record<number, { color: string; bg: string; label: string }> = {
  0: { color: '#64748b', bg: '#f1f5f9', label: '草稿' },
  1: { color: '#2563eb', bg: '#eff6ff', label: '進行中' },
  2: { color: '#d97706', bg: '#fffbeb', label: '完結審核' },
  3: { color: '#16a34a', bg: '#f0fdf4', label: '已完結' },
  8: { color: '#9333ea', bg: '#faf5ff', label: '擱置' },
  9: { color: '#dc2626', bg: '#fef2f2', label: '已刪除' },
}

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']
const PRIORITY_LABELS = ['', '低', '中', '高', '緊急']

// ─── Sub-components ───────────────────────────────────────────────────────────

const TaskCard: React.FC<{
  task: TemporaryDuty
  onOpen: (id: string) => void
  toName: (no: string) => string
}> = ({ task, onOpen, toName }) => {
  const st = STATUS_TAG[task.status] ?? STATUS_TAG[0]
  const isOverdue = task.expected_end_date && task.status !== 3 && task.status !== 8 && task.status !== 9
    ? dayjs(task.expected_end_date).isBefore(dayjs(), 'day')
    : false

  return (
    <div
      className="bg-white rounded-xl p-3.5 shadow-sm border border-slate-100 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
      onClick={() => onOpen(task.id)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-slate-800 leading-snug line-clamp-2 flex-1">
          {task.duty_nm}
        </span>
        <span
          className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium"
          style={{ color: st.color, background: st.bg }}
        >
          {st.label}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        {task.priority > 1 && (
          <span className="text-xs px-1.5 py-px rounded" style={{ color: PRIORITY_COLORS[task.priority], background: `${PRIORITY_COLORS[task.priority]}18` }}>
            {PRIORITY_LABELS[task.priority]}
          </span>
        )}
        {task.expected_end_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
            {isOverdue ? '超期 · ' : ''}{task.expected_end_date}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {task.status === 1 && (
        <div className="mt-2">
          <Progress percent={task.progress} size="small" strokeColor="#2563eb" showInfo={false} />
        </div>
      )}

      {/* Assignees */}
      {(task.responsible?.length ?? 0) > 0 && (
        <div className="flex items-center mt-2 gap-1">
          <Avatar.Group max={{ count: 3, style: { fontSize: 10 } }} size={20}>
            {(task.responsible ?? []).map((wno) => (
              <Tooltip key={wno} title={toName(wno)}>
                <Avatar size={20} style={{ background: '#2563eb', fontSize: 10, fontWeight: 700 }}>
                  {toName(wno)?.[0]?.toUpperCase() ?? wno[0]}
                </Avatar>
              </Tooltip>
            ))}
          </Avatar.Group>
        </div>
      )}
    </div>
  )
}

const KanbanColumn: React.FC<{
  group: string
  tasks: TemporaryDuty[]
  onOpen: (id: string) => void
  onAddTask: (group: string) => void
  toName: (no: string) => string
}> = ({ group, tasks, onOpen, onAddTask, toName }) => {
  const active   = tasks.filter((t) => t.status === 1).length
  const done     = tasks.filter((t) => t.status === 3).length

  return (
    <div className="flex flex-col w-72 flex-shrink-0 bg-slate-50 rounded-2xl" style={{ minHeight: 400 }}>
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700 text-sm">{group}</span>
          <span className="text-xs text-slate-400 bg-slate-200 rounded-full px-1.5 py-px">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400">
          {active > 0 && <span className="text-blue-500">{active} 進行</span>}
          {done > 0 && <span className="text-green-500 ml-1">{done} 完成</span>}
        </div>
      </div>

      {/* Task list */}
      <div className="flex flex-col gap-2 p-3 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-300">
            <Squares2X2Icon className="w-8 h-8 mb-2" />
            <span className="text-xs">暫無任務</span>
          </div>
        ) : (
          tasks.map((t) => (
            <TaskCard key={t.id} task={t} onOpen={onOpen} toName={toName} />
          ))
        )}
      </div>

      {/* Add task button */}
      <button
        onClick={() => onAddTask(group)}
        className="flex items-center gap-1.5 mx-3 mb-3 px-3 py-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors text-sm border border-dashed border-slate-200 hover:border-blue-300"
      >
        <PlusIcon className="w-4 h-4" />
        <span>添加新任務</span>
      </button>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DepartmentTaskPage: React.FC = () => {
  const workNo      = useAppSelector((s) => s.auth.workNo) ?? ''
  const isSupervisor = useAppSelector((s) => s.auth.isSupervisor)
  const toName      = useWorkNoToName()

  const [tasks,    setTasks]    = useState<TemporaryDuty[]>([])
  const [loading,  setLoading]  = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Create task modal
  const [createOpen,  setCreateOpen]  = useState(false)
  const [createGroup, setCreateGroup] = useState<string>('')
  const [createForm]                   = Form.useForm()
  const [creating,    setCreating]    = useState(false)

  // Member options for responsible field
  const [memberOptions, setMemberOptions] = useState<{ value: string; label: string }[]>([])

  // Load all duties (supervisor sees all)
  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dutyApi.list({ page: 1, size: 200 })
      if (res.code === '0') {
        const items = res.content.data_list ?? []
        // Filter out deleted tasks
        setTasks(items.filter((t) => t.status !== 9))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadMembers = useCallback(async () => {
    try {
      const res = await userApi.list({ page: 1, size: 2000 })
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setMemberOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadTasks() }, [loadTasks])
  useEffect(() => { loadMembers() }, [loadMembers])

  // Derive all groups from tasks + defaults
  const allGroups = useMemo(() => {
    const fromTasks = Array.from(new Set(tasks.map((t) => t.group).filter(Boolean) as string[]))
    const merged = [...DEFAULT_GROUPS]
    fromTasks.forEach((g) => { if (!merged.includes(g)) merged.push(g) })
    return merged
  }, [tasks])

  // Filter tasks based on active tab
  const filteredTasks = useMemo(() => {
    const now = dayjs()
    const endOfWeek = now.endOf('week')
    switch (activeTab) {
      case 'mine':
        return tasks.filter((t) => (t.responsible ?? []).includes(workNo))
      case 'active':
        return tasks.filter((t) => t.status === 1)
      case 'due_this_week':
        return tasks.filter((t) => {
          if (!t.expected_end_date) return false
          const d = dayjs(t.expected_end_date)
          return d.isSameOrBefore(endOfWeek) && d.isSameOrBefore(now.add(7, 'day'))
        })
      default:
        return tasks
    }
  }, [tasks, activeTab, workNo])

  // Group tasks by group field
  const tasksByGroup = useMemo(() => {
    const map: Record<string, TemporaryDuty[]> = {}
    allGroups.forEach((g) => { map[g] = [] })
    filteredTasks.forEach((t) => {
      const g = t.group ?? DEFAULT_GROUPS[2] // default to 临时工作
      if (!map[g]) map[g] = []
      map[g].push(t)
    })
    return map
  }, [filteredTasks, allGroups])

  // Summary stats
  const stats = useMemo(() => ({
    total:   tasks.length,
    active:  tasks.filter((t) => t.status === 1).length,
    overdue: tasks.filter((t) =>
      t.expected_end_date && t.status !== 3 && t.status !== 8
        ? dayjs(t.expected_end_date).isBefore(dayjs(), 'day')
        : false
    ).length,
    done: tasks.filter((t) => t.status === 3).length,
  }), [tasks])

  const handleAddTask = (group: string) => {
    setCreateGroup(group)
    createForm.resetFields()
    createForm.setFieldsValue({ group, priority: 2 })
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    const values = await createForm.validateFields()
    setCreating(true)
    try {
      const payload: CreateDutyPayload = {
        duty_nm:             values.duty_nm,
        describe:            values.describe,
        group:               values.group,
        priority:            values.priority ?? 2,
        responsible:         values.responsible ?? [],
        expected_start_date: values.dates?.[0]?.format('YYYY-MM-DD'),
        expected_end_date:   values.dates?.[1]?.format('YYYY-MM-DD'),
      }
      const res = await dutyApi.create(payload)
      if (res.code === '0') {
        showToast('success', '任務已創建')
        setCreateOpen(false)
        loadTasks()
      } else {
        showToast('error', res.msg ?? '創建失敗')
      }
    } finally {
      setCreating(false)
    }
  }

  const tabItems = [
    { key: 'all',          label: '全部任務' },
    { key: 'mine',         label: '我負責的' },
    { key: 'active',       label: '進行中' },
    { key: 'due_this_week', label: '本週到期' },
  ]

  return (
    <div className="flex flex-col h-full" style={{ background: '#f1f5f9', minHeight: 'calc(100vh - 56px)' }}>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-6 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-800">部門任務管理</h1>
            <p className="text-sm text-slate-400 mt-0.5">看板視圖 · 主管視角</p>
          </div>

          {/* Summary stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="text-center">
              <div className="font-bold text-slate-700 text-lg">{stats.total}</div>
              <div className="text-slate-400 text-xs">全部</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-blue-600 text-lg">{stats.active}</div>
              <div className="text-slate-400 text-xs">進行中</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-red-500 text-lg">{stats.overdue}</div>
              <div className="text-slate-400 text-xs">超期</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-green-600 text-lg">{stats.done}</div>
              <div className="text-slate-400 text-xs">已完結</div>
            </div>

            <Button
              type="primary"
              icon={<PlusIcon className="w-4 h-4" />}
              onClick={() => handleAddTask(DEFAULT_GROUPS[2])}
              style={{ borderRadius: 8 }}
            >
              新建任務
            </Button>
          </div>
        </div>

        {/* Tabs + filter bar */}
        <div className="flex items-center justify-between">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            size="small"
            style={{ marginBottom: 0 }}
          />
          <div className="flex items-center gap-2 pb-3">
            <Button size="small" icon={<FunnelIcon className="w-3.5 h-3.5" />} style={{ borderRadius: 6 }}>
              篩選
            </Button>
            <Button size="small" icon={<AdjustmentsHorizontalIcon className="w-3.5 h-3.5" />} style={{ borderRadius: 6 }}>
              排序
            </Button>
            <Button size="small" icon={<Squares2X2Icon className="w-3.5 h-3.5" />} style={{ borderRadius: 6 }}>
              分組
            </Button>
          </div>
        </div>
      </div>

      {/* ── Kanban board ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spin size="large" />
          </div>
        ) : (
          <div className="flex gap-4 p-5 h-full" style={{ width: 'max-content', minWidth: '100%' }}>
            {allGroups.map((group) => (
              <KanbanColumn
                key={group}
                group={group}
                tasks={tasksByGroup[group] ?? []}
                onOpen={setSelectedId}
                onAddTask={handleAddTask}
                toName={toName}
              />
            ))}

            {/* Add new group placeholder */}
            <div className="flex-shrink-0 w-64 flex flex-col items-center justify-start pt-10">
              <button className="flex flex-col items-center gap-2 text-slate-300 hover:text-slate-400 transition-colors px-6 py-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-300 w-full">
                <PlusIcon className="w-6 h-6" />
                <span className="text-sm">新增分類</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Duty detail drawer ───────────────────────────────────────────────── */}
      <DutyDetailDrawer
        open={selectedId !== null}
        dutyId={selectedId}
        onClose={() => { setSelectedId(null); loadTasks() }}
      />

      {/* ── Create task modal ────────────────────────────────────────────────── */}
      <Modal
        open={createOpen}
        title="新建任務"
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        okText="創建"
        cancelText="取消"
        confirmLoading={creating}
        width={520}
        styles={{ body: { paddingTop: 16 } }}
      >
        <Form form={createForm} layout="vertical" size="middle">
          <Form.Item name="duty_nm" label="任務名稱" rules={[{ required: true, message: '請輸入任務名稱' }]}>
            <Input placeholder="輸入任務名稱" />
          </Form.Item>

          <Form.Item name="describe" label="任務描述">
            <Input.TextArea rows={2} placeholder="（選填）任務說明" />
          </Form.Item>

          <div className="flex gap-3">
            <Form.Item name="group" label="分類" className="flex-1" rules={[{ required: true, message: '請選擇分類' }]}>
              <Select
                options={allGroups.map((g) => ({ value: g, label: g }))}
                placeholder="選擇分類"
                showSearch
              />
            </Form.Item>

            <Form.Item name="priority" label="優先級" className="flex-1">
              <Select
                options={[
                  { value: 1, label: '低' },
                  { value: 2, label: '中' },
                  { value: 3, label: '高' },
                  { value: 4, label: '緊急' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple"
              options={memberOptions}
              placeholder="選擇負責人"
              optionFilterProp="label"
              showSearch
            />
          </Form.Item>

          <Form.Item name="dates" label="起止日期">
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              placeholder={['開始日期', '截止日期']}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DepartmentTaskPage
