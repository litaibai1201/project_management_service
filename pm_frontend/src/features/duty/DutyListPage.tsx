import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Progress, Modal, Form, Tag, Avatar, Segmented, Collapse, AutoComplete, Spin, Empty, Tabs, Switch,
} from 'antd'
import RichTextEditor from '@/components/common/RichTextEditor'
import type { ColumnsType } from 'antd/es/table'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { PlusIcon, MagnifyingGlassIcon, TrashIcon, EyeIcon, FolderIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDutyListThunk, deleteDutyThunk, setDutyQuery, createDutyThunk } from './dutySlice'
import { TemporaryDuty, ProjectFunction } from '@/types/api.types'
import { DUTY_STATUS_MAP, PRIORITY_MAP, FUNCTION_STATUS_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { projectApi } from '@/api/project.api'
import { userApi } from '@/api/user.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import FunctionDetailDrawer from '@/features/project/FunctionDetailDrawer'
import DutyDetailDrawer from './DutyDetailDrawer'
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

type MyFunction = ProjectFunction & { project_nm: string; project_status: number; project_pm: string; requirement_nm?: string }

const DutyListPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { list, isLoading, isSaving, query } = useAppSelector((s) => s.duty)
  const workNo        = useAppSelector((s) => s.auth.workNo) ?? ''
  const isManagerView = useAppSelector((s) => s.auth.isManagerView)
  const toName = useWorkNoToName()

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'project' | 'duty'>('project')

  // ── 專案任務 state ────────────────────────────────────────────────────────
  const [myFunctions,    setMyFunctions]    = useState<MyFunction[]>([])
  const [myFuncLoading,  setMyFuncLoading]  = useState(false)
  const [myFuncPage,     setMyFuncPage]     = useState(1)
  const [myFuncPageSize, setMyFuncPageSize] = useState(20)
  const [myFuncTotal,    setMyFuncTotal]    = useState(0)
  const myFuncScope: 'supervisor' | 'all' = isManagerView ? 'supervisor' : 'all'
  const [myFuncView,        setMyFuncView]        = useState<'flat' | 'grouped'>('flat')
  const [myFuncPersonal,    setMyFuncPersonal]    = useState<'all' | 'mine'>('all')
  const [myFuncStatus,      setMyFuncStatus]      = useState<number | undefined>()
  const [myFuncProject,     setMyFuncProject]     = useState<string | undefined>()
  const [myFuncGroup,       setMyFuncGroup]       = useState<string | undefined>()
  const [myFuncResponsible, setMyFuncResponsible] = useState<string | undefined>()
  const [selectedFid,    setSelectedFid]    = useState<string | null>(null)
  const selectedFunc = useMemo(() => myFunctions.find((f) => f.id === selectedFid) ?? null, [myFunctions, selectedFid])

  // ── 專案任務篩選選項（從已載入資料動態生成）────────────────────────────────
  const funcProjectOptions = useMemo(
    () => Array.from(new Map(myFunctions.map((f) => [f.project_id, f.project_nm])).entries())
      .map(([id, nm]) => ({ value: id, label: nm })),
    [myFunctions],
  )
  const funcGroupOptions = useMemo(
    () => Array.from(new Set(myFunctions.map((f) => f.group1).filter(Boolean)))
      .map((g) => ({ value: g, label: g })),
    [myFunctions],
  )
  const funcResponsibleOptions = useMemo(
    () => Array.from(new Set(myFunctions.flatMap((f) => f.responsible ?? []).filter(Boolean)))
      .map((wn) => ({ value: wn, label: toName(wn) })),
    [myFunctions, toName],
  )

  // ── 顯示控制 ─────────────────────────────────────────────────────────────
  const [hideCompleted, setHideCompleted] = useState(true)

  // ── 專案任務篩選結果 ───────────────────────────────────────────────────────
  const filteredMyFunctions = useMemo(() => {
    let result = myFunctions
    if (myFuncPersonal === 'mine') result = result.filter((f) =>
      (f.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    )
    if (hideCompleted)       result = result.filter((f) => f.status !== 4)
    if (myFuncProject)       result = result.filter((f) => f.project_id === myFuncProject)
    if (myFuncGroup)         result = result.filter((f) => f.group1 === myFuncGroup)
    if (myFuncResponsible)   result = result.filter((f) => (f.responsible ?? []).includes(myFuncResponsible))
    return result
  }, [myFunctions, myFuncPersonal, hideCompleted, myFuncProject, myFuncGroup, myFuncResponsible, workNo])

  // ── 專案任務分組視圖 ───────────────────────────────────────────────────────
  const groupedMyFunctions = useMemo(() => {
    const map = new Map<string, MyFunction[]>()
    filteredMyFunctions.forEach((f) => {
      const key = f.group1 || '未分組'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(f)
    })
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      avgProgress: Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
      overdueCount: items.filter((f) => f.expected_end_date && dayjs(f.expected_end_date).isBefore(dayjs(), 'day') && f.status !== 4).length,
    }))
  }, [filteredMyFunctions])

  const loadMyFunctions = useCallback(async (
    page = myFuncPage, size = myFuncPageSize, status = myFuncStatus, scope = myFuncScope,
  ) => {
    setMyFuncLoading(true)
    try {
      const res = await projectApi.myFunctions({ page, size, status, scope })
      const c = res.content as { total_count: number; data_list: MyFunction[] }
      setMyFunctions(c.data_list ?? [])
      setMyFuncTotal(c.total_count ?? 0)
      setMyFuncPage(page)
    } catch { /* global */ }
    finally { setMyFuncLoading(false) }
  }, [myFuncPage, myFuncPageSize, myFuncStatus, myFuncScope])

  useEffect(() => { if (activeTab === 'project') loadMyFunctions(1, myFuncPageSize, myFuncStatus, myFuncScope) }, [activeTab, isManagerView])

  // ── AR state ────────────────────────────────────────────────────────
  const dutyView = isManagerView ? 'all' : 'mine'
  const [groupMode, setGroupMode]     = useState<'flat' | 'grouped'>('grouped')
  const [filterGroup, setFilterGroup] = useState<string | null>(null)
  const [showHeld, setShowHeld]       = useState(false)
  const [dutyPersonal, setDutyPersonal] = useState<'all' | 'mine'>('all')
  const [selectedDutyId, setSelectedDutyId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [modalUserOptions,  setModalUserOptions]  = useState<{ value: string; label: string }[]>([])
  const [modalSystemOptions, setModalSystemOptions] = useState<{ value: string; label: string }[]>([])
  const [dutyExpandOpen,  setDutyExpandOpen]  = useState(false)
  const [dutyExpandDraft, setDutyExpandDraft] = useState('')

  const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  // ── 從 URL 參數初始化成員篩選 / 跳轉打開指定任務 ──────────────────────────
  useEffect(() => {
    const responsible = searchParams.get('responsible')
    if (responsible) {
      setMyFuncResponsible(responsible)
      dispatch(setDutyQuery({ responsible }))
      // Pre-load user options so the select shows the name
      userApi.list({ page: 1, size: 2000 }).then((res) => {
        const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
        setModalUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
      }).catch(() => {})
    }
    // 通知跳轉：切換到 duty tab 並打開指定任務抽屜
    const tab = searchParams.get('tab')
    if (tab === 'duty') setActiveTab('duty')
    const dutyId = searchParams.get('dutyId')
    if (dutyId) setSelectedDutyId(dutyId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [form] = Form.useForm()

  const openCreateModal = useCallback(async () => {
    setShowCreate(true)
    // 懒加载用户和专案列表
    if (modalUserOptions.length === 0) {
      userApi.list({ page: 1, size: 2000 }).then((res) => {
        const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
        setModalUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
      }).catch(() => {})
    }
    if (modalSystemOptions.length === 0) {
      systemApi.list({ page: 1, size: 200 }).then((res) => {
        const c = res.content as { data_list: SystemItem[] }
        setModalSystemOptions((c.data_list ?? []).map((s) => ({ value: s.id, label: s.sys_nm })))
      }).catch(() => {})
    }
  }, [modalUserOptions.length, modalSystemOptions.length])

  const myList = useMemo(
    () => list.filter((d) =>
      d.creator?.toLowerCase() === workNo.toLowerCase() ||
      (d.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    ),
    [list, workNo],
  )

  // Apply view filter + personal filter + group filter
  const displayedList = useMemo(() => {
    let result = dutyView === 'mine' ? myList : list
    if (dutyPersonal === 'mine') result = result.filter((d) =>
      (d.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    )
    if (!showHeld) result = result.filter((d) => d.status !== 8)
    if (filterGroup) result = result.filter((d) => (d.group ?? '未分組') === filterGroup)
    return result
  }, [dutyView, dutyPersonal, myList, list, filterGroup, showHeld, workNo])

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
    const source = hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList
    const map = new Map<string, TemporaryDuty[]>()
    source.forEach((d) => {
      const g = d.group || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(d)
    })
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      count: items.length,
      avgProgress: Math.round(items.reduce((s, d) => s + (d.progress ?? 0), 0) / items.length),
      overdueCount: items.filter((d) => d.expected_end_date && new Date(d.expected_end_date) < new Date() && d.status !== 3 && d.status !== 8).length,
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
          system_id:           values.system_id as string | undefined,
          priority:            values.priority as number,
          responsible:         values.responsible as string[] | undefined,
          expected_start_date: values.expected_start_date as string | undefined,
          expected_end_date:   values.expected_end_date as string | undefined,
        },
      })).unwrap()
      showToast.success('AR建立成功')
      setShowCreate(false); form.resetFields()
      dispatch(fetchDutyListThunk(query))
    } catch (err: unknown) { showToast.error((err as string) || '建立失敗') }
  }

  // ── 專案任務 columns ──────────────────────────────────────────────────────
  const rawFuncColumns: ColumnsType<MyFunction> = [
    {
      title: '任務名稱', dataIndex: 'function_nm', ellipsis: true,
      render: (name: string, r) => {
        const p = PRIORITY_MAP[r.priority]
        return (
          <div className="flex items-center gap-2">
            <div style={{ width: 3, height: 20, borderRadius: 2, flexShrink: 0, background: p?.color ?? '#94a3b8' }} />
            <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => setSelectedFid(r.id)}>
              {name}
            </Button>
          </div>
        )
      },
    },
    {
      title: '所屬專案', dataIndex: 'project_nm', width: 150, ellipsis: true,
      render: (v: string, r) => (
        <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => navigate(`/projects/${r.project_id}`)}>
          {v}
        </Button>
      ),
    },
    {
      title: '所屬需求', dataIndex: 'requirement_nm', width: 150, ellipsis: true,
      render: (v: string) => v
        ? <Tag color="purple" style={{ fontSize: 10 }}>{v}</Tag>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: '任務分組', key: 'group', width: 140, ellipsis: true,
      render: (_: unknown, r: MyFunction) => (
        <span className="text-slate-600 text-xs">
          {r.group1}{r.group2 ? ` / ${r.group2}` : ''}
        </span>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 100,
      render: (v: number) => { const s = FUNCTION_STATUS_MAP[v]; return s ? <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag> : v },
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 120,
      render: (v: string[]) => (v ?? []).map((wn) => (
        <Tag key={wn} color="purple" style={{ fontSize: 10, marginBottom: 2 }}>{toName(wn)}</Tag>
      )),
    },
    {
      title: '進度', dataIndex: 'progress', width: 130,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={v >= 80 ? '#16a34a' : '#2563eb'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 120,
      render: (v: string, r) => {
        if (!v || !dayjs(v).isValid()) return <span className="text-slate-300 text-xs">—</span>
        if (r.status === 4) return <span className="days-ok">{v}</span>
        const days = dayjs(v).diff(dayjs(), 'day')
        if (days < 0) return <span className="days-overdue">超期 {Math.abs(days)}天</span>
        if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
        if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
        return <span className="days-ok">{v}</span>
      },
    },
    {
      title: '操作', key: 'action', width: 70, fixed: 'right',
      render: (_: unknown, r) => (
        <Tooltip title="查看詳情">
          <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(r.id)} />
        </Tooltip>
      ),
    },
  ]

  const rawColumns: ColumnsType<TemporaryDuty> = [
    {
      title: '任務名稱', dataIndex: 'duty_nm', ellipsis: true,
      render: (name: string, record) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[record.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500 }}
            onClick={() => setSelectedDutyId(record.id)}>
            {name}
          </Button>
        </div>
      ),
    },
    {
      title: '關聯系統', dataIndex: 'system_nm', width: 130, ellipsis: true,
      render: (v: string) => v
        ? <Tag color="geekblue" style={{ fontSize: 10 }}>{v}</Tag>
        : <span className="text-slate-300 text-xs">—</span>,
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
      title: '建立人', dataIndex: 'creator', width: 90,
      render: (v: string) => <span className="text-sm text-slate-600">{toName(v) || '—'}</span>,
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 120,
      render: (v: string[]) => v?.length ? (
        <div className="flex items-center gap-1.5">
          <Avatar size={18} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{toName(v[0])?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-600 truncate">{v.map((wn) => toName(wn)).join(', ')}</span>
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
      render: (v: string, r: TemporaryDuty) => r.status === 8
        ? <span className="text-slate-300 text-xs">{v || '—'}</span>
        : <DaysLeftBadge date={v} />,
    },
    {
      title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="查看">
            <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text"
              onClick={() => setSelectedDutyId(record.id)} />
          </Tooltip>
          <Popconfirm title="確認刪除此任務？" onConfirm={() => handleDelete(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const { mergeColumns: funcColumns } = useResizableColumns(rawFuncColumns)
  const { mergeColumns: columns } = useResizableColumns(rawColumns)
  // In grouped mode, hide the group column since it's shown as the panel header
  const groupedColumns = columns.filter((c) => (c as { dataIndex?: string }).dataIndex !== 'group')

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">任務</h1>
          <p className="text-slate-400 text-sm mt-0.5">管理你的專案任務與AR</p>
        </div>
        {activeTab === 'duty' && (
          <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={openCreateModal} style={{ background: '#2563eb', fontWeight: 500 }}>
            新建任務
          </Button>
        )}
      </div>

      <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k as 'project' | 'duty')} items={[
        {
          key: 'project',
          label: `專案任務 (${myFuncTotal})`,
          children: (
            <div>
              {/* 專案任務篩選 */}
              <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                <Segmented
                  value={myFuncPersonal}
                  onChange={(v) => setMyFuncPersonal(v as 'all' | 'mine')}
                  options={[
                    { label: '全部', value: 'all' },
                    { label: '我的', value: 'mine' },
                  ]}
                />
                <div className="w-px h-5 bg-slate-200" />
                <Segmented
                  size="small"
                  value={myFuncView}
                  onChange={(v) => setMyFuncView(v as 'flat' | 'grouped')}
                  options={[
                    { label: '平面', value: 'flat' },
                    { label: '分組', value: 'grouped' },
                  ]}
                />
                <div className="w-px h-5 bg-slate-200" />
                <Select
                  placeholder="狀態" allowClear style={{ width: 120 }}
                  value={myFuncStatus}
                  onChange={(v) => { setMyFuncStatus(v); loadMyFunctions(1, myFuncPageSize, v, myFuncScope) }}
                  options={Object.entries(FUNCTION_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
                />
                <Select
                  placeholder="專案" allowClear style={{ width: 160 }}
                  value={myFuncProject}
                  onChange={(v) => setMyFuncProject(v)}
                  options={funcProjectOptions}
                  showSearch
                  filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                />
                <Select
                  placeholder="任務分組" allowClear style={{ width: 130 }}
                  value={myFuncGroup}
                  onChange={(v) => setMyFuncGroup(v)}
                  options={funcGroupOptions}
                />
                <Select
                  placeholder="負責人" allowClear style={{ width: 120 }}
                  value={myFuncResponsible}
                  onChange={(v) => setMyFuncResponsible(v)}
                  options={funcResponsibleOptions}
                />
                <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
                  <Switch size="small" checked={!hideCompleted} onChange={(v) => setHideCompleted(!v)} />
                  顯示已完結
                </div>
              </div>

              {myFuncView === 'flat' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
                  <Table
                    rowKey="id"
                    columns={funcColumns}
                    components={tableComponents}
                    dataSource={filteredMyFunctions}
                    loading={myFuncLoading}
                    size="middle"
                    scroll={{ x: 980 }}
                    pagination={{
                      pageSize: myFuncPageSize,
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (t) => `共 ${t} 筆`,
                      onShowSizeChange: (_, size) => setMyFuncPageSize(size),
                    }}
                  />
                </div>
              ) : (
                <div>
                  {myFuncLoading ? (
                    <div className="flex justify-center py-12"><Spin size="large" /></div>
                  ) : groupedMyFunctions.length === 0 ? (
                    <Empty description="暫無任務" className="py-12" />
                  ) : (
                    <Collapse
                      defaultActiveKey={groupedMyFunctions.map((g) => g.name)}
                      className="bg-transparent border-0"
                      expandIconPosition="start"
                    >
                      {groupedMyFunctions.map((g) => (
                        <Collapse.Panel
                          key={g.name}
                          header={
                            <div className="flex items-center gap-3">
                              <FolderIcon className="w-4 h-4 text-blue-500" />
                              <span className="font-semibold text-slate-700">{g.name}</span>
                              <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{g.items.length} 項</Tag>
                              <Progress percent={g.avgProgress} size="small" showInfo={false} style={{ width: 80 }} strokeColor="#2563eb" trailColor="#e2e8f0" />
                              <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                              {g.overdueCount > 0 && (
                                <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>超時 {g.overdueCount}</Tag>
                              )}
                            </div>
                          }
                        >
                          <Table rowKey="id" columns={funcColumns.filter((c) => (c as { key?: string }).key !== 'group')}
                            components={tableComponents} dataSource={g.items} pagination={false} size="small" scroll={{ x: 860 }} />
                        </Collapse.Panel>
                      ))}
                    </Collapse>
                  )}
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'duty',
          label: `AR (${(hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList).length})`,
          children: (
            <div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Segmented
          value={dutyPersonal}
          onChange={(v) => setDutyPersonal(v as 'all' | 'mine')}
          options={[
            { label: '全部', value: 'all' },
            { label: '我的', value: 'mine' },
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
        {/* Responsible filter */}
        <Select
          placeholder="負責人"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 140 }}
          value={query.responsible ?? undefined}
          onChange={(v) => dispatch(setDutyQuery({ responsible: v ?? undefined, page: 1 }))}
          options={modalUserOptions}
          onDropdownVisibleChange={(open) => {
            if (open && modalUserOptions.length === 0) {
              userApi.list({ page: 1, size: 2000 }).then((res) => {
                const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
                setModalUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
              }).catch(() => {})
            }
          }}
        />
        <div className="ml-auto flex items-center gap-4 text-sm text-slate-500">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch size="small" checked={showHeld} onChange={setShowHeld} />
            顯示搁置
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch size="small" checked={!hideCompleted} onChange={(v) => setHideCompleted(!v)} />
            顯示已完結
          </label>
        </div>
      </div>

      {/* Table / Grouped display */}
      {groupMode === 'flat' ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
          <Table
            rowKey="id" columns={columns} components={tableComponents} dataSource={hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList} loading={isLoading}
            pagination={{
              current: query.page, pageSize: query.size ?? 10,
              total: (hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList).length,
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
                  <Table rowKey="id" columns={groupedColumns} components={tableComponents} dataSource={g.items}
                    pagination={false} size="small" scroll={{ x: 820 }} />
                </Collapse.Panel>
              ))}
            </Collapse>
          )}
        </div>
      )}

      {/* Create Modal */}
      <Modal title="新建 AR" open={showCreate}
        onCancel={() => { setShowCreate(false); form.resetFields() }}
        footer={null} width="min(720px, 88vw)" destroyOnClose>
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
          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple"
              placeholder="選擇負責人"
              options={modalUserOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>
          <Form.Item name="system_id" label="關聯系統">
            <Select
              placeholder="選擇關聯系統（選填）"
              options={modalSystemOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>

          {/* 任務描述 — 小輸入框 + 展開富文本編輯 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
            {({ getFieldValue }) => {
              const v: string = getFieldValue('describe') ?? ''
              const displayValue = isHtml(v) ? stripHtml(v) : v
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700">任務描述</span>
                    <button
                      type="button"
                      onClick={() => {
                        const html = isHtml(v) ? v : v.trim() ? `<p>${v.replace(/\n/g, '</p><p>')}</p>` : ''
                        setDutyExpandDraft(html)
                        setDutyExpandOpen(true)
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
                    >
                      <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                      展開富文本編輯
                    </button>
                  </div>
                  <Input.TextArea
                    value={displayValue}
                    onChange={(e) => form.setFieldValue('describe', e.target.value)}
                    rows={3}
                    placeholder="請描述任務內容，或點擊右上角展開富文本編輯器..."
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
                  )}
                </div>
              )
            }}
          </Form.Item>

          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>建立</Button>
          </div>
        </Form>
      </Modal>

      {/* 任務描述展開編輯 Modal */}
      <Modal
        open={dutyExpandOpen}
        title="任務描述"
        onCancel={() => setDutyExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDutyExpandOpen(false)}>取消</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              form.setFieldValue('describe', dutyExpandDraft)
              setDutyExpandOpen(false)
            }}>完成</Button>
          </div>
        }
        destroyOnClose
      >
        <RichTextEditor
          value={dutyExpandDraft}
          onChange={setDutyExpandDraft}
          placeholder="請描述任務內容（支援標題、列表、粗體等格式）"
          minHeight={480}
        />
      </Modal>
    </div>
          ),
        },
      ]}
    />
    <DutyDetailDrawer
      open={!!selectedDutyId}
      dutyId={selectedDutyId}
      onClose={() => setSelectedDutyId(null)}
    />
    <FunctionDetailDrawer
      open={!!selectedFid && !!selectedFunc}
      projectId={selectedFunc?.project_id ?? ''}
      functionId={selectedFid ?? ''}
      isProjectPm={workNo.toLowerCase() === (selectedFunc?.project_pm ?? '').toLowerCase() && [3, 10].includes(selectedFunc?.project_status ?? 0)}
      projectStatus={selectedFunc?.project_status ?? 0}
      projectPm={selectedFunc?.project_pm ?? ''}
      onClose={() => setSelectedFid(null)}
    />
  </div>
)
}

export default DutyListPage
