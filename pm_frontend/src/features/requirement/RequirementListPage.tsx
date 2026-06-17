import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Modal, Form, Tag, Avatar, Card, Tabs, Progress, Spin, Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { InputRef } from 'antd'
import { PlusIcon, PencilSquareIcon, TrashIcon, ArrowsPointingOutIcon, TableCellsIcon, UserPlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import { dutyApi } from '@/api/duty.api'
import { requirementApi, projectApi, type ProjectReqItem } from '@/api/project.api'
import type { ProjectFunction, TemporaryDuty, UserProfile } from '@/types/api.types'
import RichTextEditor from '@/components/common/RichTextEditor'
import WbsTable from '@/components/common/WbsTable'
import DutyWbsTable from '@/components/common/DutyWbsTable'
import { userApi } from '@/api/user.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import DateInput from '@/components/common/DateInput'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  const { t } = useTranslation()
  if (!date) return <span className="text-slate-300 text-xs">—</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">{t('common.daysOverdue', { days: Math.abs(days) })}</span>
  if (days <= 3) return <span className="days-overdue">{t('common.daysLeft', { days })}</span>
  if (days <= 7) return <span className="days-warning">{t('common.daysLeft', { days })}</span>
  return <span className="days-ok">{date}</span>
}

// ─── Main Component ───────────────────────────────────────────────────────────

const RequirementListPage: React.FC = () => {
  const { t } = useTranslation()
  const toName   = useWorkNoToName()
  const [activeTab, setActiveTab] = useState<'project' | 'system'>('system')

  // ── 專案需求 state ────────────────────────────────────────────────────────
  const [projList,     setProjList]     = useState<ProjectReqItem[]>([])
  const [projLoading,  setProjLoading]  = useState(false)
  const [projTotal,    setProjTotal]    = useState(0)
  const [projPage,     setProjPage]     = useState(1)
  const [projPageSize, setProjPageSize] = useState(20)
  const [projKeyword,  setProjKeyword]  = useState('')
  const [projStatus]   = useState<number | undefined>()
  const [projPriority, setProjPriority] = useState<number | undefined>()

  // ── 系統需求 state ────────────────────────────────────────────────────────
  const [reqList,     setReqList]     = useState<StandaloneReq[]>([])
  const [reqLoading,  setReqLoading]  = useState(false)
  const [reqTotal,    setReqTotal]    = useState(0)
  const [reqPage,     setReqPage]     = useState(1)
  const [reqPageSize, setReqPageSize] = useState(20)
  const [reqKeyword,  setReqKeyword]  = useState('')
  const [reqStatus]   = useState<number | undefined>()
  const [reqPriority, setReqPriority] = useState<number | undefined>()

  // ── 專案需求 WBS Modal ────────────────────────────────────────────────────
  const [wbsReq,       setWbsReq]       = useState<ProjectReqItem | null>(null)
  const [wbsFunctions, setWbsFunctions] = useState<ProjectFunction[]>([])
  const [wbsLoading,   setWbsLoading]   = useState(false)

  const openWbs = async (req: ProjectReqItem) => {
    setWbsReq(req)
    setWbsFunctions([])
    setWbsLoading(true)
    try {
      const res = await projectApi.functionList(req.project_id, { page: 1, size: 500, requirement_id: req.id })
      setWbsFunctions((res.content as any).data_list ?? [])
    } catch { /* global */ } finally { setWbsLoading(false) }
  }

  // ── 系統需求 WBS Modal ────────────────────────────────────────────────────
  const [sysWbsReq,    setSysWbsReq]    = useState<StandaloneReq | null>(null)
  const [sysWbsDuties, setSysWbsDuties] = useState<TemporaryDuty[]>([])
  const [sysWbsLoading, setSysWbsLoading] = useState(false)

  const openSysWbs = async (req: StandaloneReq) => {
    setSysWbsReq(req)
    setSysWbsDuties([])
    setSysWbsLoading(true)
    try {
      const res = await dutyApi.list({ page: 1, size: 500, standalone_req_id: req.id })
      setSysWbsDuties((res.content as any).data_list ?? [])
    } catch { /* global */ } finally { setSysWbsLoading(false) }
  }

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

  // ── 設定責任人 Modal ────────────────────────────────────────────────────
  const [respEditReqId,    setRespEditReqId]    = useState<string | null>(null)
  const [respPersons,      setRespPersons]      = useState<UserProfile[]>([])
  const [respSaving,       setRespSaving]       = useState(false)
  const [respSearchKw,     setRespSearchKw]     = useState('')
  const [respSearching,    setRespSearching]    = useState(false)
  const [respSearchResult, setRespSearchResult] = useState<UserProfile | false | null>(null)
  const [respPreloading,   setRespPreloading]   = useState(false)
  const respSearchRef = useRef<InputRef>(null)

  const openRespModal = async (r: StandaloneReq) => {
    setRespEditReqId(r.id)
    setRespSearchKw('')
    setRespSearchResult(null)
    setRespPreloading(true)
    setRespPersons([])
    const wnos = r.responsible ?? []
    if (wnos.length > 0) {
      try {
        const profiles = await Promise.all(wnos.map(async (wn) => {
          try { return (await userApi.get(wn)).content as UserProfile }
          catch { return { work_no: wn, name: toName(wn) || wn, department: '' } as UserProfile }
        }))
        setRespPersons(profiles)
      } catch { /* ignore */ }
    }
    setRespPreloading(false)
  }

  useEffect(() => {
    if (respSearchKw.trim().length < 4) { setRespSearchResult(null); return }
    const timer = setTimeout(async () => {
      setRespSearching(true)
      setRespSearchResult(null)
      try {
        const res = await userApi.getQuiet(respSearchKw.trim().toLowerCase())
        setRespSearchResult(res.content ?? false)
      } catch { setRespSearchResult(false) }
      finally { setRespSearching(false); respSearchRef.current?.focus() }
    }, 600)
    return () => clearTimeout(timer)
  }, [respSearchKw])

  const handleSaveResponsible = async () => {
    if (!respEditReqId) return
    setRespSaving(true)
    try {
      await standaloneReqApi.update(respEditReqId, { responsible: respPersons.map((p) => p.work_no) })
      showToast.success(t('common.saveSuccess'))
      setRespEditReqId(null)
      loadSysReqs(reqPage)
    } catch { showToast.error(t('common.saveFailed')) }
    finally { setRespSaving(false) }
  }

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
        showToast.success(t('requirement.updated'))
      } else {
        await standaloneReqApi.create(payload)
        showToast.success(t('requirement.createSuccess'))
      }
      setShowForm(false)
      form.resetFields()
      loadSysReqs(editTarget ? reqPage : 1)
    } catch (err: unknown) { showToast.error((err instanceof Error ? err.message : String(err)) || t('common.error')) }
    finally { setReqSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await standaloneReqApi.delete(id)
      showToast.success(t('common.deleteSuccess'))
      loadSysReqs(reqPage)
    } catch { showToast.error(t('common.deleteFailed')) }
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
      title: t('requirement.name'), dataIndex: 'req_nm', width: 200, ellipsis: true,
      render: (v: string, r: ProjectReqItem) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }}
          onClick={() => window.open(`/projects/${r.project_id}?req=${r.id}`, '_blank')}>
          {v}
        </Button>
      ),
    },
    {
      title: t('project.projectName'), dataIndex: 'project_nm', width: 150, ellipsis: true,
      render: (v: string, r: ProjectReqItem) => v
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => window.open(`/projects/${r.project_id}`, '_blank')}>{v}</Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 80,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : <span>{v}</span>
      },
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={(v ?? 0) >= 100 ? '#16a34a' : '#2563eb'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 120,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: t('common.createdAt'), dataIndex: 'created_at', width: 105,
      render: (v: string) => <span className="text-slate-400 text-xs">{v ? v.slice(0, 10) : '—'}</span>,
    },
    {
      title: 'WBS', key: 'wbs', width: 60, align: 'center' as const,
      render: (_: unknown, r: ProjectReqItem) => (
        <Tooltip title={t('requirement.viewWbs')}>
          <Button size="small" type="text" icon={<TableCellsIcon className="w-4 h-4" />}
            onClick={() => openWbs(r)} />
        </Tooltip>
      ),
    },
  ]

  const sysColumns: ColumnsType<StandaloneReq> = [
    {
      title: t('requirement.name'), dataIndex: 'req_nm', ellipsis: true,
      render: (v: string, r: StandaloneReq) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }}
          onClick={() => window.open(`/systems/${r.system_id}?req=${r.id}`, '_blank')}>
          {v}
        </Button>
      ),
    },
    {
      title: t('system.sysName'), dataIndex: 'system_nm', width: 140, ellipsis: true,
      render: (v: string, r: StandaloneReq) => v
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => r.system_id && window.open(`/systems/${r.system_id}`, '_blank')}>{v}</Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 72,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : <span>{v}</span>
      },
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={(v ?? 0) >= 100 ? '#16a34a' : '#2563eb'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('function.assignee'), dataIndex: 'responsible', width: 160,
      render: (v: string[], r: StandaloneReq) => (
        <div className="flex items-center gap-1.5">
          {(v ?? []).length > 0 ? (
            <>
              <Avatar.Group max={{ count: 3 }} size="small">
                {v.map((wn) => (
                  <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
                    <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>
                      {toName(wn)?.[0] ?? wn[0]}
                    </Avatar>
                  </Tooltip>
                ))}
              </Avatar.Group>
              <Tooltip title={t('system.setResponsible')}>
                <Button type="text" size="small" icon={<UserPlusIcon className="w-3.5 h-3.5" />}
                  onClick={(e) => { e.stopPropagation(); openRespModal(r) }} />
              </Tooltip>
            </>
          ) : (
            <Button
              type="dashed" size="small"
              icon={<PlusIcon className="w-3.5 h-3.5" />}
              onClick={(e) => { e.stopPropagation(); openRespModal(r) }}
              style={{ fontSize: 12, color: '#64748b' }}
            >
              {t('system.setResponsible')}
            </Button>
          )}
        </div>
      ),
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 110,
      render: (v: string) => <DaysLeftBadge date={v} />,
    },
    {
      title: t('common.creator'), dataIndex: 'creator_nm', width: 90,
      render: (v: string, r: StandaloneReq) => (
        <span className="text-slate-500 text-sm">{v || toName(r.creator) || r.creator}</span>
      ),
    },
    {
      title: t('common.createdAt'), dataIndex: 'created_at', width: 110,
      render: (v: string) => <span className="text-slate-400 text-xs">{v ? v.slice(0, 10) : '—'}</span>,
    },
    {
      title: 'WBS', key: 'wbs', width: 60, align: 'center' as const,
      render: (_: unknown, r: StandaloneReq) => (
        <Tooltip title={t('requirement.viewWbs')}>
          <Button size="small" type="text" icon={<TableCellsIcon className="w-4 h-4" />}
            onClick={() => openSysWbs(r)} />
        </Tooltip>
      ),
    },
    {
      title: t('common.operation'), key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, r: StandaloneReq) => {
        if (r.status !== 0) return null
        return (
          <Space size={0}>
            <Tooltip title={t('common.edit')}>
              <Button type="text" size="small" icon={<PencilSquareIcon className="w-4 h-4" />}
                onClick={() => openEdit(r)} />
            </Tooltip>
            <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDelete(r.id)} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }}>
              <Tooltip title={t('common.delete')}>
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
        <h1 className="text-2xl font-bold text-slate-800">{t('requirement.title')}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{t('requirement.subtitle')}</p>
      </div>

      {/* 專案需求 WBS Modal */}
      <Modal
        open={!!wbsReq}
        onCancel={() => setWbsReq(null)}
        footer={null}
        width={900}
        title={
          <span className="text-slate-800 font-semibold">
            {t('requirement.wbsSchedule')}
            {wbsReq && <span className="text-slate-400 font-normal ml-2 text-sm">— {wbsReq.req_nm}</span>}
          </span>
        }
        destroyOnHidden
      >
        {wbsLoading ? (
          <div className="flex justify-center py-12"><Spin /></div>
        ) : wbsFunctions.length === 0 ? (
          <Empty description={t('requirement.noLinkedTasks')} className="py-10" />
        ) : (
          <WbsTable functions={wbsFunctions} toName={toName} defaultExpanded
            requirements={wbsReq ? [wbsReq as any] : []} />
        )}
      </Modal>

      {/* 系統需求 WBS Modal */}
      <Modal
        open={!!sysWbsReq}
        onCancel={() => setSysWbsReq(null)}
        footer={null}
        width={900}
        title={
          <span className="text-slate-800 font-semibold">
            {t('requirement.wbsSchedule')}
            {sysWbsReq && <span className="text-slate-400 font-normal ml-2 text-sm">— {sysWbsReq.req_nm}</span>}
          </span>
        }
        destroyOnHidden
      >
        {sysWbsLoading ? (
          <div className="flex justify-center py-12"><Spin /></div>
        ) : sysWbsDuties.length === 0 ? (
          <Empty description={t('requirement.noLinkedTasks')} className="py-10" />
        ) : (
          <DutyWbsTable
            duties={sysWbsDuties}
            toName={toName}
            reqNameMap={sysWbsReq ? { [sysWbsReq.id]: sysWbsReq.req_nm } : {}}
            defaultExpanded
          />
        )}
      </Modal>

      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'project' | 'system')}
        items={[
          {
            key: 'system',
            label: `${t('requirement.system')} (${reqTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Input.Search
                    placeholder={t('requirement.searchPlaceholder')}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(v) => { setReqKeyword(v); loadSysReqs(1, reqPageSize, v, reqStatus, reqPriority) }}
                  />
                  <Select
                    placeholder={t('common.priority')} allowClear style={{ width: 110 }}
                    value={reqPriority}
                    onChange={(v) => { setReqPriority(v); loadSysReqs(1, reqPageSize, reqKeyword, reqStatus, v) }}
                    options={[{ value: 1, label: t('requirement.priorityLow') }, { value: 2, label: t('requirement.priorityMedium') }, { value: 3, label: t('requirement.priorityHigh') }, { value: 4, label: t('requirement.priorityUrgent') }]}
                  />
                  <div className="ml-auto">
                    <Button
                      type="primary"
                      icon={<PlusIcon className="w-4 h-4" />}
                      onClick={openCreate}
                      style={{ background: '#2563eb', fontWeight: 500 }}
                    >
                      {t('requirement.create')}
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
                    showSizeChanger: true, showTotal: (total) => t('common.total', { count: total }),
                    onChange: (page, size) => { setReqPageSize(size); loadSysReqs(page, size) },
                  }}
                  scroll={{ x: 860 }}
                  locale={{ emptyText: <div className="py-8 text-center text-slate-400">{t('requirement.noSysReqs')}</div> }}
                />
              </Card>
            ),
          },
          {
            key: 'project',
            label: `${t('requirement.project')} (${projTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Input.Search
                    placeholder={t('requirement.searchPlaceholder')}
                    allowClear
                    style={{ width: 220 }}
                    onSearch={(v) => { setProjKeyword(v); loadProjReqs(1, projPageSize, v, projStatus, projPriority) }}
                  />
                  <Select
                    placeholder={t('common.priority')} allowClear style={{ width: 110 }}
                    value={projPriority}
                    onChange={(v) => { setProjPriority(v); loadProjReqs(1, projPageSize, projKeyword, projStatus, v) }}
                    options={[{ value: 1, label: t('requirement.priorityLow') }, { value: 2, label: t('requirement.priorityMedium') }, { value: 3, label: t('requirement.priorityHigh') }, { value: 4, label: t('requirement.priorityUrgent') }]}
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
                    showSizeChanger: true, showTotal: (total) => t('common.total', { count: total }),
                    onChange: (page, size) => { setProjPageSize(size); loadProjReqs(page, size) },
                  }}
                  scroll={{ x: 800 }}
                  locale={{ emptyText: <div className="py-8 text-center text-slate-400">{t('requirement.noProjReqs')}</div> }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* 系統需求 建立 / 編輯 Modal */}
      <Modal
        title={editTarget ? `${t('requirement.editReq')} — ${editTarget.req_nm}` : t('requirement.createSysReq')}
        open={showForm}
        onCancel={() => { setShowForm(false); form.resetFields() }}
        footer={null}
        width="min(600px, 88vw)"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave} className="mt-4">
          <Form.Item name="req_nm" label={t('requirement.name')} rules={[{ required: true, message: t('requirement.nameRequired') }]}>
            <Input placeholder={t('requirement.namePlaceholder')} />
          </Form.Item>
          <Form.Item name="system_id" label={t('requirement.linkedSystem')} rules={[{ required: true, message: t('requirement.systemRequired') }]}>
            <Select
              placeholder={t('requirement.systemPlaceholder')}
              options={systemOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onOpenChange={(open) => { if (open) loadSystems() }}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]} initialValue={2}>
              <Select options={[{ value: 1, label: t('requirement.priorityLow') }, { value: 2, label: t('requirement.priorityMedium') }, { value: 3, label: t('requirement.priorityHigh') }, { value: 4, label: t('requirement.priorityUrgent') }]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label={t('requirement.expectedCompletionDate')}>
              <DateInput/>
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="benefit_amount" label={t('requirement.benefitAmount')}>
              <Input type="number" min={0} placeholder={t('requirement.benefitAmountPlaceholder')} />
            </Form.Item>
            <Form.Item name="benefit_unit" label={t('requirement.benefitUnit')} initialValue="元/年">
              <Select options={[{ value: '元/年', label: t('requirement.unitYuanPerYear') }, { value: '人/年', label: t('requirement.unitPersonPerYear') }, { value: '工時/年', label: t('requirement.unitHoursPerYear') }]} />
            </Form.Item>
          </div>
          <Form.Item name="expected_benefit" label={t('requirement.benefitDescription')}>
            <Input.TextArea placeholder={t('common.optional')} autoSize={{ minRows: 2, maxRows: 6 }} style={{ resize: 'vertical' }} />
          </Form.Item>
          <Form.Item name="responsible" label={t('requirement.responsible')}>
            <Select
              mode="multiple" placeholder={t('requirement.responsiblePlaceholder')}
              options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onOpenChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          <Form.Item label={t('requirement.description')}>
            <div className="flex items-center justify-between mb-1.5">
              <span />
              <button
                type="button"
                onClick={handleOpenExpand}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
              >
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                {t('requirement.expandRichText')}
              </button>
            </div>
            <Form.Item
              name="describe"
              noStyle
              getValueProps={(v) => ({ value: v && isHtml(v) ? stripHtml(v) : (v ?? '') })}
            >
              <Input.TextArea
                rows={3}
                placeholder={t('requirement.describePlaceholder')}
                style={{ resize: 'vertical', minHeight: 72 }}
              />
            </Form.Item>
            {describeValue && isHtml(describeValue as string) && (
              <p className="text-xs text-blue-500 mt-1">{t('requirement.richTextApplied')}</p>
            )}
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowForm(false); form.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={reqSaving} style={{ background: '#2563eb' }}>
              {editTarget ? t('common.save') : t('requirement.createBtn')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* 描述展開編輯 Modal */}
      <Modal
        open={expandOpen}
        title={t('requirement.description')}
        onCancel={() => setExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={() => { form.setFieldValue('describe', expandDraft); setExpandOpen(false) }}
              style={{ background: '#2563eb' }}>{t('requirement.done')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={expandDraft}
          onChange={setExpandDraft}
          placeholder={t('requirement.describePlaceholder')}
          minHeight={480}
        />
      </Modal>

      {/* 設定責任人 Modal */}
      <Modal
        title={t('system.setResponsible')}
        open={!!respEditReqId}
        onCancel={() => setRespEditReqId(null)}
        onOk={handleSaveResponsible}
        okText={t('system.confirmSave')}
        confirmLoading={respSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={440}
        destroyOnHidden
      >
        <div className="py-3 space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">{t('system.searchByWorkNo')}</div>
            <Input
              ref={respSearchRef}
              value={respSearchKw}
              onChange={(e) => setRespSearchKw(e.target.value)}
              placeholder={t('system.workNoSearchPlaceholder')}
              suffix={respSearching ? <Spin size="small" /> : null}
              autoFocus
            />
            {respSearchResult === false && (
              <div className="mt-2 text-xs text-red-500 flex items-center gap-1">
                <XMarkIcon className="w-3.5 h-3.5" />{t('system.workNoNotFound')}
              </div>
            )}
            {respSearchResult && typeof respSearchResult === 'object' && (
              <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                    {(respSearchResult as UserProfile).name?.[0]?.toUpperCase()}
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{(respSearchResult as UserProfile).name}</div>
                    <div className="text-xs text-slate-400">{(respSearchResult as UserProfile).work_no} · {(respSearchResult as UserProfile).department}</div>
                  </div>
                </div>
                <Button
                  size="small" type="primary" style={{ background: '#2563eb' }}
                  disabled={respPersons.some((p) => p.work_no === (respSearchResult as UserProfile).work_no)}
                  onClick={() => {
                    const person = respSearchResult as UserProfile
                    if (!respPersons.some((p) => p.work_no === person.work_no)) {
                      setRespPersons((prev) => [...prev, person])
                    }
                    setRespSearchKw(''); setRespSearchResult(null)
                  }}
                >
                  {respPersons.some((p) => p.work_no === (respSearchResult as UserProfile).work_no) ? t('system.alreadyAdded') : t('system.addPerson')}
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              {t('system.selectedResponsible')}
              {respPersons.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">{t('system.personsCountSaveHint', { count: respPersons.length })}</span>
              )}
            </div>
            {respPreloading ? (
              <div className="flex items-center justify-center py-5 text-slate-400 text-xs gap-2"><Spin size="small" />{t('common.loading')}</div>
            ) : respPersons.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg py-5 text-center text-slate-400 text-xs">{t('system.noPersonYet')}</div>
            ) : (
              <div className="space-y-1.5">
                {respPersons.map((p, i) => (
                  <div key={p.work_no} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2">
                    <div className="w-5 h-5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                    <Avatar size={24} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                      {p.name?.[0]?.toUpperCase()}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-700">{p.name}</span>
                      <span className="text-xs text-slate-400 ml-1.5">{p.work_no} · {p.department}</span>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-600 transition-colors flex-shrink-0 border-0 outline-none bg-transparent p-0 cursor-pointer"
                      onClick={() => setRespPersons((prev) => prev.filter((x) => x.work_no !== p.work_no))}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default RequirementListPage
