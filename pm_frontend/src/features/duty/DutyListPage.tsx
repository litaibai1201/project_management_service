import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm,
  Progress, Modal, Form, Tag, Avatar, Segmented, Collapse, AutoComplete, Spin, Empty, Tabs, Switch, Card,
} from 'antd'
import RichTextEditor from '@/components/common/RichTextEditor'
import type { ColumnsType } from 'antd/es/table'
import type { InputRef } from 'antd'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { PlusIcon, TrashIcon, EyeIcon, FolderIcon, ArrowsPointingOutIcon, PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDutyListThunk, deleteDutyThunk, setDutyQuery, createDutyThunk, silentUpdateList } from './dutySlice'
import { TemporaryDuty, ProjectFunction, UserProfile } from '@/types/api.types'
import { DUTY_STATUS_MAP, PRIORITY_MAP, FUNCTION_STATUS_MAP, PROJECT_STATUS_MAP, formatGroupName, STAGE_GROUP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import FunctionDetailDrawer from '@/features/project/FunctionDetailDrawer'
import DutyDetailDrawer from './DutyDetailDrawer'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import DateInput from '@/components/common/DateInput'

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  const { t } = useTranslation()
  if (!date) return <span className="text-slate-300 text-xs">—</span>
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">{t('common.daysOverdue', { days: Math.abs(days) })}</span>
  if (days <= 3) return <span className="days-overdue">{t('common.daysLeft', { days })}</span>
  if (days <= 7) return <span className="days-warning">{t('common.daysLeft', { days })}</span>
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
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const [searchParams] = useSearchParams()
  const { list, isLoading, isSaving, query } = useAppSelector((s) => s.duty)
  const workNo        = useAppSelector((s) => s.auth.workNo) ?? ''
  const isManagerView = useAppSelector((s) => s.auth.isManagerView)
  const toName = useWorkNoToName()

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'project' | 'system' | 'duty'>('duty')

  // ── 專案任務 state ────────────────────────────────────────────────────────
  const [myFunctions,    setMyFunctions]    = useState<MyFunction[]>([])
  const [myFuncLoading,  setMyFuncLoading]  = useState(false)
  const [myFuncPage,     setMyFuncPage]     = useState(1)
  const [myFuncPageSize, setMyFuncPageSize] = useState(200)
  const [, setMyFuncTotal] = useState(0)
  const myFuncScope: 'supervisor' | 'all' = isManagerView ? 'supervisor' : 'all'
  const [myFuncView,        setMyFuncView]        = useState<'flat' | 'grouped'>('flat')
  const [myFuncPersonal,    setMyFuncPersonal]    = useState<'all' | 'mine'>('all')
  const [myFuncStatus,      setMyFuncStatus]      = useState<number | undefined>()
  const [myFuncResponsible, setMyFuncResponsible] = useState<string | undefined>()
  const [selectedFid,    setSelectedFid]    = useState<string | null>(null)
  const selectedFunc = useMemo(() => myFunctions.find((f) => f.id === selectedFid) ?? null, [myFunctions, selectedFid])

  // ── 專案任務篩選選項（從已載入資料動態生成）────────────────────────────────
  const funcResponsibleOptions = useMemo(
    () => Array.from(new Set(myFunctions.flatMap((f) => f.responsible ?? []).filter(Boolean)))
      .map((wn) => ({ value: wn, label: toName(wn) })),
    [myFunctions, toName],
  )

  // ── 顯示控制 ─────────────────────────────────────────────────────────────
  const [hideCompleted,    setHideCompleted]    = useState(true)
  const [funcShowHeld,     setFuncShowHeld]     = useState(false)

  // ── 專案任務篩選結果 ───────────────────────────────────────────────────────
  const filteredMyFunctions = useMemo(() => {
    let result = myFunctions
    if (myFuncPersonal === 'mine') result = result.filter((f) =>
      (f.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    )
    if (hideCompleted)       result = result.filter((f) => f.status !== 4)
    if (!funcShowHeld)       result = result.filter((f) => f.status !== 8)
    if (myFuncResponsible)   result = result.filter((f) => (f.responsible ?? []).some((wn) => wn.toLowerCase() === myFuncResponsible.toLowerCase()))
    return result
  }, [myFunctions, myFuncPersonal, hideCompleted, funcShowHeld, myFuncResponsible, workNo])

  // ── 專案任務合併儲存格表格（支持折疊）───────────────────────────────────────
  const [funcCollapsed, setFuncCollapsed] = useState<Set<string>>(new Set())
  const toggleFuncCollapse = (key: string) => setFuncCollapsed((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  type MergedFuncRow = MyFunction & {
    _projSpan: number; _reqSpan: number; _grpSpan: number
    _reqNm: string; _grpNm: string; _projKey: string; _reqKey: string; _grpKey: string
    _isSummary?: 'proj' | 'req' | 'grp'  // which level is collapsed on this row
    _summaryProgress?: number; _summaryEndDate?: string; _summaryPm?: string; _summaryStatus?: number; _summaryCount?: number
  }
  const mergedFuncRows = useMemo((): MergedFuncRow[] => {
    const sorted = [...filteredMyFunctions].sort((a, b) => {
      // 先按 project_id 分组（确保同一专案不被拆开），再按名称排序
      if (a.project_id !== b.project_id) return (a.project_nm ?? '').localeCompare(b.project_nm ?? '')
      const r = (a.requirement_nm ?? '').localeCompare(b.requirement_nm ?? '')
      if (r !== 0) return r
      const g = (a.group1 ?? '').localeCompare(b.group1 ?? '')
      if (g !== 0) return g
      return (a.function_nm ?? '').localeCompare(b.function_nm ?? '')
    })
    // 确保同一 project_id 的所有行都有 project_nm（取第一个非空值）
    const projNmMap = new Map<string, string>()
    sorted.forEach((f) => { if (f.project_nm && !projNmMap.has(f.project_id)) projNmMap.set(f.project_id, f.project_nm) })
    const all = sorted.map((f) => ({
      ...f,
      project_nm: f.project_nm || projNmMap.get(f.project_id) || '',
      _projSpan: 0, _reqSpan: 0, _grpSpan: 0,
      _reqNm: f.requirement_nm || '', _grpNm: formatGroupName(f.group1) || f.group1 || '',
      _projKey: `p::${f.project_id}`, _reqKey: `r::${f.project_id}::${f.requirement_nm || ''}`, _grpKey: `g::${f.project_id}::${f.requirement_nm || ''}::${f.group1 || ''}`,
    } as MergedFuncRow))

    // Helper: compute summary for a set of rows
    const summarize = (rows: MergedFuncRow[]) => ({
      _summaryProgress: rows.length ? Math.round(rows.reduce((s, r) => s + (r.progress ?? 0), 0) / rows.length) : 0,
      _summaryEndDate: rows.filter((r) => r.expected_end_date).map((r) => r.expected_end_date!).sort().pop() || '',
      _summaryCount: rows.length,
    })

    // Build visible rows with summary data for collapsed groups
    const visible: MergedFuncRow[] = []
    const seen = { proj: new Set<string>(), req: new Set<string>(), grp: new Set<string>() }
    for (const r of all) {
      const projCollapsed = funcCollapsed.has(r._projKey)
      const reqCollapsed = funcCollapsed.has(r._reqKey)
      const grpCollapsed = funcCollapsed.has(r._grpKey)

      if (projCollapsed && seen.proj.has(r._projKey)) continue
      if (reqCollapsed && !projCollapsed && seen.req.has(r._reqKey)) continue
      if (grpCollapsed && !projCollapsed && !reqCollapsed && seen.grp.has(r._grpKey)) continue

      const row = { ...r }
      if (projCollapsed && !seen.proj.has(r._projKey)) {
        const projRows = all.filter((x) => x._projKey === r._projKey)
        row._isSummary = 'proj'
        Object.assign(row, summarize(projRows))
        row._summaryPm = r.project_pm
        row._summaryStatus = r.project_status
      } else if (reqCollapsed && !seen.req.has(r._reqKey)) {
        const reqRows = all.filter((x) => x._reqKey === r._reqKey)
        row._isSummary = 'req'
        Object.assign(row, summarize(reqRows))
      } else if (grpCollapsed && !seen.grp.has(r._grpKey)) {
        const grpRows = all.filter((x) => x._grpKey === r._grpKey)
        row._isSummary = 'grp'
        Object.assign(row, summarize(grpRows))
      }
      visible.push(row)
      seen.proj.add(r._projKey); seen.req.add(r._reqKey); seen.grp.add(r._grpKey)
    }
    // Recalculate spans
    for (let i = 0; i < visible.length;) {
      let pEnd = i + 1
      while (pEnd < visible.length && visible[pEnd].project_id === visible[i].project_id) pEnd++
      visible[i]._projSpan = pEnd - i
      for (let j = i; j < pEnd;) {
        let rEnd = j + 1
        while (rEnd < pEnd && visible[rEnd]._reqKey === visible[j]._reqKey) rEnd++
        visible[j]._reqSpan = rEnd - j
        for (let k = j; k < rEnd;) {
          let gEnd = k + 1
          while (gEnd < rEnd && visible[gEnd]._grpKey === visible[k]._grpKey) gEnd++
          visible[k]._grpSpan = gEnd - k
          k = gEnd
        }
        j = rEnd
      }
      i = pEnd
    }
    return visible
  }, [filteredMyFunctions, funcCollapsed])

  const loadMyFunctions = useCallback(async (
    page = myFuncPage, size = myFuncPageSize, status = myFuncStatus, scope = myFuncScope, silent = false,
  ) => {
    if (!silent) setMyFuncLoading(true)
    try {
      const res = await projectApi.myFunctions({ page, size, status, scope })
      const c = res.content as { total_count: number; data_list: MyFunction[] }
      setMyFunctions(c.data_list ?? [])
      setMyFuncTotal(c.total_count ?? 0)
      setMyFuncPage(page)
    } catch { /* global */ }
    finally { if (!silent) setMyFuncLoading(false) }
  }, [myFuncPage, myFuncPageSize, myFuncStatus, myFuncScope])

  useEffect(() => { loadMyFunctions(1, myFuncPageSize, myFuncStatus, myFuncScope) }, [isManagerView]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 系統任務 state ────────────────────────────────────────────────────────
  const [sysTaskView,        setSysTaskView]        = useState<'all' | 'mine'>('all')
  const [sysTaskGroupMode,   setSysTaskGroupMode]   = useState<'flat' | 'grouped'>('flat')
  const [sysTaskStatus,      setSysTaskStatus]      = useState<number | undefined>()
  const [sysTaskResponsible, setSysTaskResponsible] = useState<string | undefined>()
  const [sysHideCompleted,   setSysHideCompleted]   = useState(true)
  const [sysShowHeld,        setSysShowHeld]        = useState(false)
  const [reqNameMap,         setReqNameMap]         = useState<Record<string, string>>({})
  const [reqRespMap,         setReqRespMap]         = useState<Record<string, string[]>>({})

  // ── AR 快速設定負責人 ─────────────────────────────────────────────────
  const [arQuickResp,      setArQuickResp]      = useState<{ did: string; persons: UserProfile[] } | null>(null)
  const [arQuickSaving,    setArQuickSaving]    = useState(false)
  const [arRespKw,         setArRespKw]         = useState('')
  const [arRespResults,    setArRespResults]    = useState<UserProfile[]>([])
  const [arRespSearching,  setArRespSearching]  = useState(false)
  const [arRespPreloading, setArRespPreloading] = useState(false)
  const arRespRef = useRef<InputRef>(null)

  // ── AR state ────────────────────────────────────────────────────────
  const arScope = isManagerView ? 'supervisor' : 'mine'
  const [groupMode, setGroupMode]       = useState<'flat' | 'grouped'>('flat')
  const [dutyOpenGroups, setDutyOpenGroups] = useState<string[]>([])
  const [filterGroup, setFilterGroup]   = useState<string | null>(null)
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
    if (tab === 'duty' || tab === 'system') setActiveTab(tab)
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

  // ── 系統任務計算 ──────────────────────────────────────────────────────────
  const sysTaskList = useMemo(() => list.filter((d) => !!d.standalone_req_id), [list])
  const displayedSysTasks = useMemo(() => {
    let result = sysTaskView === 'mine'
      ? sysTaskList.filter((d) => (d.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase()))
      : sysTaskList
    if (sysHideCompleted)      result = result.filter((d) => d.status !== 3)
    if (!sysShowHeld)          result = result.filter((d) => d.status !== 8)
    if (sysTaskStatus != null) result = result.filter((d) => d.status === sysTaskStatus)
    if (sysTaskResponsible)    result = result.filter((d) => (d.responsible ?? []).some((wn) => wn.toLowerCase() === sysTaskResponsible.toLowerCase()))
    return result
  }, [sysTaskList, sysTaskView, workNo, sysHideCompleted, sysShowHeld, sysTaskStatus, sysTaskResponsible])
  // ── 系統任務合併儲存格表格 ─────────────────────────────────────────────────
  // ── 系統任務合併儲存格表格（支持折疊）───────────────────────────────────────
  const [dutyCollapsed, setDutyCollapsed] = useState<Set<string>>(new Set())
  const toggleDutyCollapse = (key: string) => setDutyCollapsed((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  type MergedDutyRow = TemporaryDuty & {
    _sysSpan: number; _reqSpan: number; _grpSpan: number
    _sysNm: string; _reqNm: string; _grpNm: string; _sysKey: string; _reqKey: string; _grpKey: string
    _isSummary?: 'sys' | 'req' | 'grp'; _summaryProgress?: number; _summaryEndDate?: string; _summaryCount?: number
  }
  const mergedDutyRows = useMemo((): MergedDutyRow[] => {
    const sorted = [...displayedSysTasks].sort((a, b) => {
      const s = (a.system_nm ?? '').localeCompare(b.system_nm ?? '')
      if (s !== 0) return s
      const r = (reqNameMap[a.standalone_req_id ?? ''] ?? '').localeCompare(reqNameMap[b.standalone_req_id ?? ''] ?? '')
      if (r !== 0) return r
      const g = (a.group ?? '').localeCompare(b.group ?? '')
      if (g !== 0) return g
      return (a.duty_nm ?? '').localeCompare(b.duty_nm ?? '')
    })
    const all = sorted.map((d) => ({
      ...d, _sysSpan: 0, _reqSpan: 0, _grpSpan: 0,
      _sysNm: d.system_nm ?? '', _reqNm: reqNameMap[d.standalone_req_id ?? ''] ?? '', _grpNm: formatGroupName(d.group) || d.group || '',
      _sysKey: `s::${d.system_id ?? d.system_nm}`, _reqKey: `r::${d.system_id}::${d.standalone_req_id || ''}`, _grpKey: `g::${d.system_id}::${d.standalone_req_id || ''}::${d.group || ''}`,
    } as MergedDutyRow))
    const summarize = (rows: MergedDutyRow[]) => ({
      _summaryProgress: rows.length ? Math.round(rows.reduce((s, r) => s + (r.progress ?? 0), 0) / rows.length) : 0,
      _summaryEndDate: rows.filter((r) => r.expected_end_date).map((r) => r.expected_end_date!).sort().pop() || '',
      _summaryCount: rows.length,
    })
    const visible: MergedDutyRow[] = []
    const seen = { sys: new Set<string>(), req: new Set<string>(), grp: new Set<string>() }
    for (const r of all) {
      const sysC = dutyCollapsed.has(r._sysKey)
      const reqC = dutyCollapsed.has(r._reqKey)
      const grpC = dutyCollapsed.has(r._grpKey)
      if (sysC && seen.sys.has(r._sysKey)) continue
      if (reqC && !sysC && seen.req.has(r._reqKey)) continue
      if (grpC && !sysC && !reqC && seen.grp.has(r._grpKey)) continue
      const row = { ...r }
      if (sysC && !seen.sys.has(r._sysKey)) { row._isSummary = 'sys'; Object.assign(row, summarize(all.filter((x) => x._sysKey === r._sysKey))) }
      else if (reqC && !seen.req.has(r._reqKey)) { row._isSummary = 'req'; Object.assign(row, summarize(all.filter((x) => x._reqKey === r._reqKey))) }
      else if (grpC && !seen.grp.has(r._grpKey)) { row._isSummary = 'grp'; Object.assign(row, summarize(all.filter((x) => x._grpKey === r._grpKey))) }
      visible.push(row)
      seen.sys.add(r._sysKey); seen.req.add(r._reqKey); seen.grp.add(r._grpKey)
    }
    for (let i = 0; i < visible.length;) {
      let sEnd = i + 1
      while (sEnd < visible.length && visible[sEnd]._sysKey === visible[i]._sysKey) sEnd++
      visible[i]._sysSpan = sEnd - i
      for (let j = i; j < sEnd;) {
        let rEnd = j + 1
        while (rEnd < sEnd && visible[rEnd]._reqKey === visible[j]._reqKey) rEnd++
        visible[j]._reqSpan = rEnd - j
        for (let k = j; k < rEnd;) {
          let gEnd = k + 1
          while (gEnd < rEnd && visible[gEnd]._grpKey === visible[k]._grpKey) gEnd++
          visible[k]._grpSpan = gEnd - k
          k = gEnd
        }
        j = rEnd
      }
      i = sEnd
    }
    return visible
  }, [displayedSysTasks, dutyCollapsed, reqNameMap])
  // filter options derived from full sysTaskList
  const sysResponsibleOptions = useMemo(
    () => Array.from(new Set(sysTaskList.flatMap((d) => d.responsible ?? []).filter(Boolean)))
      .map((wn) => ({ value: wn, label: toName(wn) })),
    [sysTaskList, toName],
  )
  // Load req names when system tab is active
  useEffect(() => {
    if (activeTab !== 'system') return
    standaloneReqApi.list({ page: 1, size: 500 }).then((res) => {
      const c = res.content as { data_list: StandaloneReq[] }
      const nm: Record<string, string> = {}
      const rp: Record<string, string[]> = {}
      ;(c.data_list ?? []).forEach((r) => { nm[r.id] = r.req_nm; rp[r.id] = r.responsible ?? [] })
      setReqNameMap(nm)
      setReqRespMap(rp)
    }).catch(() => {})
  }, [activeTab])

  // Apply personal filter + group filter (AR only: no standalone_req_id)
  // scope is already applied by backend; dutyPersonal='mine' further filters to responsible-only
  const displayedList = useMemo(() => {
    let result = list.filter((d) => !d.standalone_req_id && d.group !== STAGE_GROUP)
    if (dutyPersonal === 'mine') result = result.filter((d) =>
      (d.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    )
    if (!showHeld) result = result.filter((d) => d.status !== 8)
    if (filterGroup) result = result.filter((d) => (d.group ?? t('common.ungrouped')) === filterGroup)
    return result
  }, [dutyPersonal, list, filterGroup, showHeld, workNo])

  // Unique groups from the full list
  const existingGroups = useMemo(
    () => Array.from(new Set(list.filter((d) => !d.standalone_req_id && d.group !== STAGE_GROUP).map((d) => d.group).filter(Boolean) as string[])),
    [list],
  )
  const groupFilterOptions = useMemo(
    () => existingGroups.map((g) => ({ label: formatGroupName(g) || g, value: g })),
    [existingGroups, t],
  )
  const groupAutoOptions = useMemo(
    () => existingGroups.map((g) => ({ value: g, label: formatGroupName(g) || g })),
    [existingGroups, t],
  )

  // Grouped data
  const groupedDuties = useMemo(() => {
    const source = hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList
    const map = new Map<string, TemporaryDuty[]>()
    source.forEach((d) => {
      const g = formatGroupName(d.group) || t('common.ungrouped')
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

  // 同步 scope（主管/非主管）→ 觸發重新拉取
  useEffect(() => {
    dispatch(setDutyQuery({ scope: arScope, page: 1 }))
  }, [dispatch, arScope])

  useEffect(() => { dispatch(fetchDutyListThunk(query)) }, [dispatch, query])

  const silentRefreshAll = useCallback(async () => {
    try {
      const res = await dutyApi.list(query)
      dispatch(silentUpdateList(res.content))
    } catch { /* ignore */ }
    loadMyFunctions(myFuncPage, myFuncPageSize, myFuncStatus, myFuncScope, true)
  }, [dispatch, query, loadMyFunctions, myFuncPage, myFuncPageSize, myFuncStatus, myFuncScope])

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteDutyThunk(id)).unwrap()
      showToast.success(t('common.deleteSuccess'))
    } catch { showToast.error(t('common.deleteFailed')) }
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
      showToast.success(t('duty.createSuccess'))
      setShowCreate(false); form.resetFields()
      dispatch(fetchDutyListThunk(query))
    } catch (err: unknown) { showToast.error((err instanceof Error ? err.message : String(err)) || t('duty.createFailed')) }
  }

  // ── AR 快速負責人搜尋（支持工號/姓名模糊搜索）─────────────────────────────
  const handleArRespSearch = useCallback(async (kw: string) => {
    const trimmed = kw.trim()
    if (trimmed.length < 1) { setArRespResults([]); return }
    setArRespSearching(true); setArRespResults([])
    try {
      const res = await userApi.list({ keyword: trimmed, size: 10 })
      const list = ((res.content as { data_list?: UserProfile[] }).data_list) ?? []
      setArRespResults(list)
    } catch { setArRespResults([]) }
    finally { setArRespSearching(false) }
  }, [])

  useEffect(() => {
    if (arRespKw.trim().length < 1) { setArRespResults([]); return }
    const t = setTimeout(() => handleArRespSearch(arRespKw), 400)
    return () => clearTimeout(t)
  }, [arRespKw, handleArRespSearch])

  const handleQuickSetArResp = async () => {
    if (!arQuickResp) return
    setArQuickSaving(true)
    try {
      await dutyApi.allocate(arQuickResp.did, { responsible: arQuickResp.persons.map((p) => p.work_no) })
      showToast.success(t('duty.updateAssigneeSuccess'))
      setArQuickResp(null)
      dispatch(fetchDutyListThunk(query))
    } catch { /* global */ }
    finally { setArQuickSaving(false) }
  }

  // ── 專案任務 columns ──────────────────────────────────────────────────────
  const rawFuncColumns: ColumnsType<MyFunction> = [
    {
      title: t('duty.taskName'), dataIndex: 'function_nm', ellipsis: true,
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
      title: t('project.projectName'), dataIndex: 'project_nm', width: 120, ellipsis: true,
      render: (v: string, r) => (
        <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => window.open(`/projects/${r.project_id}`, '_blank')}>
          {v}
        </Button>
      ),
    },
    {
      title: t('requirement.name'), dataIndex: 'requirement_nm', width: 120, ellipsis: true,
      render: (v: string, r) => v
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => window.open(`/projects/${r.project_id}?tab=requirements&req_id=${r.requirement_id || ''}`, '_blank')}>
            {v}
          </Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('function.group'), key: 'group', width: 110, ellipsis: true,
      render: (_: unknown, r: MyFunction) => (
        <span className="text-slate-600 text-xs">
          {formatGroupName(r.group1) || r.group1}{r.group2 ? ` / ${r.group2}` : ''}
        </span>
      ),
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 80,
      render: (v: number) => { const s = FUNCTION_STATUS_MAP[v]; return s ? <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag> : v },
    },
    {
      title: t('function.assignee'), dataIndex: 'responsible', width: 100,
      render: (v: string[]) => (v ?? []).map((wn) => (
        <Tag key={wn} color="purple" style={{ fontSize: 10, marginBottom: 2 }}>{toName(wn)}</Tag>
      )),
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 110,
      render: (v: number, r: MyFunction) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={r.status === 4 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('common.expectedStartDate'), dataIndex: 'expected_start_date', width: 130,
      render: (v: string, r: MyFunction) => {
        if (!v) {
          const isPm = r.project_pm?.toLowerCase() === workNo.toLowerCase()
          if (isPm && r.status !== 0 && r.status !== 4 && r.status !== 9) {
            return <DateInput value="" placeholder={t('projectDetail.clickToSetDate')} onChange={async (d) => {
              if (!d) return
              try { await projectApi.updateFunction(r.project_id, r.id, { expected_start_date: d }); showToast.success(t('common.saveSuccess')); loadMyFunctions(1, myFuncPageSize, myFuncStatus, myFuncScope) } catch { /* */ }
            }} />
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
        return <span className="text-xs">{v}</span>
      },
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 130,
      render: (v: string, r: MyFunction) => {
        if (!v || !dayjs(v).isValid()) {
          const isPm = r.project_pm?.toLowerCase() === workNo.toLowerCase()
          if (isPm && r.status !== 0 && r.status !== 4 && r.status !== 9) {
            return <DateInput value="" placeholder={t('projectDetail.clickToSetDate')} onChange={async (d) => {
              if (!d) return
              try { await projectApi.updateFunction(r.project_id, r.id, { expected_end_date: d }); showToast.success(t('common.saveSuccess')); loadMyFunctions(1, myFuncPageSize, myFuncStatus, myFuncScope) } catch { /* */ }
            }} />
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
        if (r.status === 4) return <span className="days-ok">{v}</span>
        const days = dayjs(v).diff(dayjs(), 'day')
        if (days < 0) return <span className="days-overdue">{t('common.daysOverdue', { days: Math.abs(days) })}</span>
        if (days <= 3) return <span className="days-overdue">{t('common.daysLeft', { days })}</span>
        if (days <= 7) return <span className="days-warning">{t('common.daysLeft', { days })}</span>
        return <span className="days-ok">{v}</span>
      },
    },
    {
      title: t('common.operation'), key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, r) => {
        const isPm = r.project_pm?.toLowerCase() === workNo.toLowerCase()
        const isResp = (r.responsible ?? []).some((w) => w.toLowerCase() === workNo.toLowerCase())
        const isDraft = r.status === 0
        return (
          <Space size={0}>
            <Tooltip title={t('duty.viewDetail')}>
              <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(r.id)} />
            </Tooltip>
            {isDraft && (isPm || isResp) && (
              <Popconfirm title={t('duty.deleteConfirm')} onConfirm={async () => {
                try {
                  await projectApi.deleteFunction(r.project_id, r.id)
                  showToast.success(t('common.deleteSuccess'))
                  loadMyFunctions(1, myFuncPageSize, myFuncStatus, myFuncScope)
                } catch { showToast.error(t('common.deleteFailed')) }
              }} okText={t('common.confirm')} cancelText={t('common.cancel')}>
                <Tooltip title={t('common.delete')}><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  const rawColumns: ColumnsType<TemporaryDuty> = [
    {
      title: t('duty.taskName'), dataIndex: 'duty_nm', ellipsis: true,
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
      title: t('system.sysName'), dataIndex: 'system_nm', width: 130, ellipsis: true,
      render: (v: string, r) => v
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => r.system_id && window.open(`/systems/${r.system_id}`, '_blank')}>{v}</Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('common.grouped'), dataIndex: 'group', width: 100,
      render: (v: string) => v ? (
        <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0 }} color="processing">{formatGroupName(v) || v}</Tag>
      ) : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 110,
      render: (v: number) => <StatusDot status={v} />,
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 80,
      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
    },
    {
      title: t('common.createdAt'), dataIndex: 'creator', width: 90,
      render: (v: string) => <span className="text-sm text-slate-600">{toName(v) || '—'}</span>,
    },
    {
      title: t('function.assignee'), dataIndex: 'responsible', width: 150,
      render: (v: string[], record: TemporaryDuty) => {
        const isCreator = record.creator?.toLowerCase() === workNo.toLowerCase()
        const isResp = (v ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
        const canEdit = isCreator || isResp
        const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626']
        const openPicker = async () => {
          setArRespKw(''); setArRespResults([])
          setArQuickResp({ did: record.id, persons: [] })
          if ((v ?? []).length > 0) {
            setArRespPreloading(true)
            const profiles = await Promise.all((v ?? []).map(async (wn) => {
              try { return (await userApi.get(wn)).content as UserProfile }
              catch { return { work_no: wn, name: wn, department: '' } as UserProfile }
            }))
            setArQuickResp({ did: record.id, persons: profiles })
            setArRespPreloading(false)
          }
        }
        if ((v ?? []).length > 0) {
          const shown = (v ?? []).slice(0, 3)
          return (
            <div className="flex items-center gap-1.5 group">
              <div className="flex items-center">
                {shown.map((wn, i) => (
                  <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
                    <Avatar size={20} style={{ background: COLORS[i % COLORS.length], fontSize: 9, fontWeight: 700, border: '2px solid white', marginLeft: i > 0 ? -6 : 0, zIndex: shown.length - i }}>
                      {toName(wn)?.[0]?.toUpperCase() ?? wn[0]}
                    </Avatar>
                  </Tooltip>
                ))}
              </div>
              <span className="text-sm text-slate-600 truncate">{toName(v[0]) || v[0]}{v.length > 1 ? ` ${t('common.andMore', { count: v.length - 1 })}` : ''}</span>
              {canEdit && (
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 border-0 outline-none bg-transparent p-0 cursor-pointer flex-shrink-0" onClick={openPicker} title={t('duty.editAssignee')}>
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        }
        if (!canEdit) return <span className="text-slate-300 text-xs">{t('common.notAssigned')}</span>
        return (
          <button
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 px-2 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-blue-300 transition-colors"
            onClick={openPicker}
          >
            <PlusIcon className="w-3 h-3" />{t('duty.assignAssignee')}
          </button>
        )
      },
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 140,
      render: (v: number, r: TemporaryDuty) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={r.status === 3 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 120,
      render: (v: string, r: TemporaryDuty) => r.status === 8
        ? <span className="text-slate-300 text-xs">{v || '—'}</span>
        : <DaysLeftBadge date={v} />,
    },
    {
      title: t('common.operation'), key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record) => {
        const isCreator = record.creator?.toLowerCase() === workNo.toLowerCase()
        const isResp = (record.responsible ?? []).some((w: string) => w.toLowerCase() === workNo.toLowerCase())
        const isDraft = record.status === 0
        return (
          <Space size={0}>
            <Tooltip title={t('common.view')}>
              <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text"
                onClick={() => setSelectedDutyId(record.id)} />
            </Tooltip>
            {isDraft && (isCreator || isResp) && (
              <Popconfirm title={t('duty.deleteConfirm')} onConfirm={() => handleDelete(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
                <Tooltip title={t('common.delete')}><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  const { mergeColumns: funcColumns } = useResizableColumns(rawFuncColumns)
  const { mergeColumns: columns } = useResizableColumns(rawColumns)
  // In grouped mode, hide the group column since it's shown as the panel header
  const groupedColumns = columns.filter((c) => (c as { dataIndex?: string }).dataIndex !== 'group')

  // ── 系統任務 columns ──────────────────────────────────────────────────────
  const rawSysColumns: ColumnsType<TemporaryDuty> = [
    {
      title: t('duty.taskName'), dataIndex: 'duty_nm', ellipsis: true,
      render: (name: string, r) => {
        const p = PRIORITY_MAP[r.priority]
        return (
          <div className="flex items-center gap-2">
            <div style={{ width: 3, height: 20, borderRadius: 2, flexShrink: 0, background: p?.color ?? '#94a3b8' }} />
            <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => setSelectedDutyId(r.id)}>
              {name}
            </Button>
          </div>
        )
      },
    },
    {
      title: t('system.sysName'), dataIndex: 'system_nm', width: 120, ellipsis: true,
      render: (v: string, r) => v
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => window.open(`/systems/${r.system_id}`, '_blank')}>{v}</Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('requirement.name'), dataIndex: 'standalone_req_id', width: 120, ellipsis: true,
      render: (v: string, r) => v && reqNameMap[v]
        ? <Button type="link" style={{ padding: 0, fontSize: 12 }} onClick={() => r.system_id && window.open(`/systems/${r.system_id}?req=${v}`, '_blank')}>
            {reqNameMap[v]}
          </Button>
        : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      title: t('function.group'), dataIndex: 'group', width: 110, ellipsis: true,
      render: (v: string) => <span className="text-slate-600 text-xs">{formatGroupName(v) || v || '—'}</span>,
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 80,
      render: (v: number) => { const s = DUTY_STATUS_MAP[v]; return s ? <Tag color={s.color} style={{ fontSize: 11 }}>{s.label}</Tag> : v },
    },
    {
      title: t('function.assignee'), dataIndex: 'responsible', width: 100,
      render: (v: string[]) => (v ?? []).map((wn) => (
        <Tag key={wn} color="purple" style={{ fontSize: 10, marginBottom: 2 }}>{toName(wn)}</Tag>
      )),
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 110,
      render: (v: number, r: TemporaryDuty) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={r.status === 3 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('common.expectedStartDate'), dataIndex: 'expected_start_date', width: 130,
      render: (v: string, r: TemporaryDuty) => {
        if (!v) {
          const isReqResp = (reqRespMap[r.standalone_req_id ?? ''] ?? []).some((wn: string) => wn.toLowerCase() === workNo.toLowerCase())
          if (isReqResp && r.status !== 0 && r.status !== 3 && r.status !== 9) {
            return <DateInput value="" placeholder={t('projectDetail.clickToSetDate')} onChange={async (d) => {
              if (!d) return
              try { await dutyApi.setDates(r.id, { expected_start_date: d }); showToast.success(t('common.saveSuccess')); dispatch(fetchDutyListThunk(query)) } catch { /* */ }
            }} />
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
        return <span className="text-xs">{v}</span>
      },
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 130,
      render: (v: string, r: TemporaryDuty) => {
        if (!v || !dayjs(v).isValid()) {
          const isReqResp = (reqRespMap[r.standalone_req_id ?? ''] ?? []).some((wn: string) => wn.toLowerCase() === workNo.toLowerCase())
          if (isReqResp && r.status !== 0 && r.status !== 3 && r.status !== 9) {
            return <DateInput value="" placeholder={t('projectDetail.clickToSetDate')} onChange={async (d) => {
              if (!d) return
              try { await dutyApi.setDates(r.id, { expected_end_date: d }); showToast.success(t('common.saveSuccess')); dispatch(fetchDutyListThunk(query)) } catch { /* */ }
            }} />
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
        if (r.status === 3) return <span className="days-ok">{v}</span>
        const days = dayjs(v).diff(dayjs(), 'day')
        if (days < 0) return <span className="days-overdue">{t('common.daysOverdue', { days: Math.abs(days) })}</span>
        if (days <= 3) return <span className="days-overdue">{t('common.daysLeft', { days })}</span>
        if (days <= 7) return <span className="days-warning">{t('common.daysLeft', { days })}</span>
        return <span className="days-ok">{v}</span>
      },
    },
    {
      title: t('common.operation'), key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, record) => {
        const isCreator = record.creator?.toLowerCase() === workNo.toLowerCase()
        const isResp = (record.responsible ?? []).some((w: string) => w.toLowerCase() === workNo.toLowerCase())
        const isDraft = record.status === 0
        return (
          <Space size={0}>
            <Tooltip title={t('duty.viewDetail')}>
              <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedDutyId(record.id)} />
            </Tooltip>
            {isDraft && (isCreator || isResp) && (
              <Popconfirm title={t('duty.deleteConfirm')} onConfirm={() => handleDelete(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
                <Tooltip title={t('common.delete')}><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]
  const { mergeColumns: sysColumns } = useResizableColumns(rawSysColumns)


  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('duty.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('duty.arTask')}</p>
        </div>
        {activeTab === 'duty' && (
          <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={openCreateModal} style={{ background: '#2563eb', fontWeight: 500 }}>
            {t('duty.create')}
          </Button>
        )}
      </div>

      <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k as 'project' | 'system' | 'duty')} items={([
        {
          key: 'project',
          label: `${t('duty.projectTask')} (${filteredMyFunctions.length})`,
          children: (
            <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                <Segmented
                  value={myFuncPersonal}
                  onChange={(v) => setMyFuncPersonal(v as 'all' | 'mine')}
                  options={[
                    { label: t('common.all'), value: 'all' },
                    { label: t('common.mine'), value: 'mine' },
                  ]}
                />
                <div className="w-px h-5 bg-slate-200" />
                <Segmented size="small" value={myFuncView} onChange={(v) => setMyFuncView(v as 'flat' | 'grouped')}
                  options={[{ label: t('common.flat'), value: 'flat' }, { label: t('common.grouped'), value: 'grouped' }]} />
                <div className="w-px h-5 bg-slate-200" />
                <Select placeholder={t('common.status')} allowClear style={{ width: 120 }} value={myFuncStatus}
                  onChange={(v) => { setMyFuncStatus(v); loadMyFunctions(1, myFuncPageSize, v, myFuncScope) }}
                  options={Object.entries(FUNCTION_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))} />
                <Select placeholder={t('function.assignee')} allowClear style={{ width: 120 }} value={myFuncResponsible}
                  onChange={(v) => setMyFuncResponsible(v)} options={funcResponsibleOptions} />
                <div className="ml-auto flex items-center gap-4 text-sm text-slate-500">
                  <label className="flex items-center gap-2 cursor-pointer"><Switch size="small" checked={funcShowHeld} onChange={setFuncShowHeld} />{t('duty.showHeld')}</label>
                  <label className="flex items-center gap-2 cursor-pointer"><Switch size="small" checked={!hideCompleted} onChange={(v) => setHideCompleted(!v)} />{t('duty.showCompleted')}</label>
                </div>
              </div>
              {myFuncView === 'flat' ? (
                <Table rowKey="id" columns={funcColumns} components={tableComponents} dataSource={filteredMyFunctions}
                  loading={myFuncLoading} size="small" scroll={{ x: 980 }}
                  pagination={{ pageSize: myFuncPageSize, showSizeChanger: true, pageSizeOptions: ['10','20','50','100'],
                    showTotal: (total) => t('common.total', { count: total }), onShowSizeChange: (_, size) => setMyFuncPageSize(size) }} />
              ) : (
                <Table<MergedFuncRow>
                  rowKey="id"
                  loading={myFuncLoading}
                  dataSource={mergedFuncRows}
                  size="small"
                  scroll={{ x: 1100 }}
                  pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20','50','100'], showTotal: (total) => t('common.total', { count: total }) }}
                  columns={[
                    {
                      title: t('project.projectName'), dataIndex: 'project_nm', width: 140, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._projSpan }),
                      render: (v: string, r) => (
                        <div className="flex items-center gap-1">
                          <span className={`cursor-pointer text-[10px] select-none ${funcCollapsed.has(r._projKey) ? 'text-slate-400' : 'text-slate-300'}`}
                            onClick={(e) => { e.stopPropagation(); toggleFuncCollapse(r._projKey) }}>
                            {funcCollapsed.has(r._projKey) ? '[+]' : '[-]'}
                          </span>
                          <span className="font-semibold text-blue-600 hover:underline cursor-pointer text-xs" onClick={() => window.open(`/projects/${r.project_id}`, '_blank')}>{v}</span>
                        </div>
                      ),
                    },
                    {
                      title: t('requirement.name'), dataIndex: '_reqNm', width: 120, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._reqSpan }),
                      render: (v: string, r) => {
                        if (r._isSummary === 'proj') return <span className="text-slate-300 text-xs">—</span>
                        return v ? (
                          <div className="flex items-center gap-1">
                            <span className={`cursor-pointer text-[10px] select-none ${funcCollapsed.has(r._reqKey) ? 'text-slate-400' : 'text-slate-300'}`}
                              onClick={(e) => { e.stopPropagation(); toggleFuncCollapse(r._reqKey) }}>
                              {funcCollapsed.has(r._reqKey) ? '[+]' : '[-]'}
                            </span>
                            <span className="text-xs text-purple-600">{v}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>
                      },
                    },
                    {
                      title: t('function.group'), dataIndex: '_grpNm', width: 110, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._grpSpan }),
                      render: (v: string, r) => {
                        if (r._isSummary === 'proj' || r._isSummary === 'req') return <span className="text-slate-300 text-xs">—</span>
                        return v ? (
                          <div className="flex items-center gap-1">
                            <span className={`cursor-pointer text-[10px] select-none ${funcCollapsed.has(r._grpKey) ? 'text-slate-400' : 'text-slate-300'}`}
                              onClick={(e) => { e.stopPropagation(); toggleFuncCollapse(r._grpKey) }}>
                              {funcCollapsed.has(r._grpKey) ? '[+]' : '[-]'}
                            </span>
                            <span className="text-xs text-slate-600">{v}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>
                      },
                    },
                    ...(funcColumns.filter((c) => {
                      const d = (c as {dataIndex?:string}).dataIndex
                      const k = (c as {key?:string}).key
                      return d !== 'project_nm' && d !== 'requirement_nm' && k !== 'group'
                    }).map((col) => {
                      const di = (col as {dataIndex?:string}).dataIndex
                      const origRender = (col as {render?:Function}).render
                      return {
                        ...col,
                        render: (v: unknown, r: MergedFuncRow, idx: number) => {
                          if (!r._isSummary) return origRender ? origRender(v, r, idx) : v
                          // Summary row overrides
                          if (di === 'function_nm') return <span className="text-xs text-slate-400 italic">{t('common.itemCount', { count: r._summaryCount ?? 0 })}</span>
                          if (di === 'status') return r._isSummary === 'proj' ? <Tag color={PROJECT_STATUS_MAP[r._summaryStatus ?? 0]?.color ?? 'default'} style={{ fontSize: 11 }}>{PROJECT_STATUS_MAP[r._summaryStatus ?? 0]?.label ?? '—'}</Tag> : <span className="text-slate-300 text-xs">—</span>
                          if (di === 'responsible') return r._isSummary === 'proj' && r._summaryPm ? <Tag color="blue" style={{ fontSize: 10 }}>{toName(r._summaryPm)}</Tag> : <span className="text-slate-300 text-xs">—</span>
                          if (di === 'progress') return <div className="flex items-center gap-2"><Progress percent={r._summaryProgress ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor="#16a34a" trailColor="#f1f5f9" /><span className="text-xs text-slate-400">{r._summaryProgress ?? 0}%</span></div>
                          if (di === 'expected_start_date') return <span className="text-slate-300 text-xs">—</span>
                          if (di === 'expected_end_date') return r._summaryEndDate ? <span className="text-xs">{r._summaryEndDate}</span> : <span className="text-slate-300 text-xs">—</span>
                          return <span className="text-slate-300 text-xs">—</span>
                        },
                      }
                    }) as ColumnsType<MergedFuncRow>),
                  ]}
                />
              )}
            </Card>
          ),
        },
        {
          key: 'system',
          label: `${t('duty.systemTask')} (${displayedSysTasks.length})`,
          children: (
            <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                <Segmented
                  value={sysTaskView}
                  onChange={(v) => setSysTaskView(v as 'all' | 'mine')}
                  options={[
                    { label: t('common.all'), value: 'all' },
                    { label: t('common.mine'), value: 'mine' },
                  ]}
                />
                <div className="w-px h-5 bg-slate-200" />
                <Segmented size="small" value={sysTaskGroupMode} onChange={(v) => setSysTaskGroupMode(v as 'flat' | 'grouped')}
                  options={[{ label: t('common.flat'), value: 'flat' }, { label: t('common.grouped'), value: 'grouped' }]} />
                <div className="w-px h-5 bg-slate-200" />
                <Select
                  placeholder={t('common.status')} allowClear style={{ width: 120 }}
                  value={sysTaskStatus}
                  onChange={(v) => setSysTaskStatus(v)}
                  options={Object.entries(DUTY_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
                />
                <Select placeholder={t('function.assignee')} allowClear style={{ width: 120 }} value={sysTaskResponsible}
                  onChange={(v) => setSysTaskResponsible(v)} options={sysResponsibleOptions} showSearch
                  filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())} />
                <div className="ml-auto flex items-center gap-4 text-sm text-slate-500">
                  <label className="flex items-center gap-2 cursor-pointer"><Switch size="small" checked={sysShowHeld} onChange={setSysShowHeld} />{t('duty.showHeld')}</label>
                  <label className="flex items-center gap-2 cursor-pointer"><Switch size="small" checked={!sysHideCompleted} onChange={(v) => setSysHideCompleted(!v)} />{t('duty.showCompleted')}</label>
                </div>
              </div>
              {sysTaskGroupMode === 'flat' ? (
                <Table rowKey="id" columns={sysColumns} components={tableComponents} dataSource={displayedSysTasks}
                  loading={isLoading} size="small" scroll={{ x: 980 }}
                  pagination={{ showSizeChanger: true, pageSizeOptions: ['10','20','50','100'], showTotal: (total) => t('common.total', { count: total }) }} />
              ) : (
                <Table<MergedDutyRow>
                  rowKey="id"
                  loading={isLoading}
                  dataSource={mergedDutyRows}
                  size="small"
                  scroll={{ x: 1100 }}
                  pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: ['20','50','100'], showTotal: (total) => t('common.total', { count: total }) }}
                  columns={[
                    {
                      title: t('system.sysName'), dataIndex: '_sysNm', width: 140, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._sysSpan }),
                      render: (v: string, r) => v ? (
                        <div className="flex items-center gap-1">
                          <span className={`cursor-pointer text-[10px] select-none ${dutyCollapsed.has(r._sysKey) ? 'text-slate-400' : 'text-slate-300'}`}
                            onClick={(e) => { e.stopPropagation(); toggleDutyCollapse(r._sysKey) }}>
                            {dutyCollapsed.has(r._sysKey) ? '[+]' : '[-]'}
                          </span>
                          <span className="font-semibold text-blue-600 hover:underline cursor-pointer text-xs" onClick={() => window.open(`/systems/${r.system_id}`, '_blank')}>{v}</span>
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>,
                    },
                    {
                      title: t('requirement.name'), dataIndex: '_reqNm', width: 120, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._reqSpan }),
                      render: (v: string, r) => {
                        if (r._isSummary === 'sys') return <span className="text-slate-300 text-xs">—</span>
                        return v ? (
                          <div className="flex items-center gap-1">
                            <span className={`cursor-pointer text-[10px] select-none ${dutyCollapsed.has(r._reqKey) ? 'text-slate-400' : 'text-slate-300'}`}
                              onClick={(e) => { e.stopPropagation(); toggleDutyCollapse(r._reqKey) }}>
                              {dutyCollapsed.has(r._reqKey) ? '[+]' : '[-]'}
                            </span>
                            <span className="text-xs text-purple-600">{v}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>
                      },
                    },
                    {
                      title: t('function.group'), dataIndex: '_grpNm', width: 110, ellipsis: true,
                      onCell: (r) => ({ rowSpan: r._grpSpan }),
                      render: (v: string, r) => {
                        if (r._isSummary === 'sys' || r._isSummary === 'req') return <span className="text-slate-300 text-xs">—</span>
                        return v ? (
                          <div className="flex items-center gap-1">
                            <span className={`cursor-pointer text-[10px] select-none ${dutyCollapsed.has(r._grpKey) ? 'text-slate-400' : 'text-slate-300'}`}
                              onClick={(e) => { e.stopPropagation(); toggleDutyCollapse(r._grpKey) }}>
                              {dutyCollapsed.has(r._grpKey) ? '[+]' : '[-]'}
                            </span>
                            <span className="text-xs text-slate-600">{v}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>
                      },
                    },
                    ...(sysColumns.filter((c) => {
                      const d = (c as {dataIndex?:string}).dataIndex
                      return d !== 'system_nm' && d !== 'standalone_req_id' && d !== 'group'
                    }).map((col) => {
                      const di = (col as {dataIndex?:string}).dataIndex
                      const origRender = (col as {render?:Function}).render
                      return {
                        ...col,
                        render: (v: unknown, r: MergedDutyRow, idx: number) => {
                          if (!r._isSummary) return origRender ? origRender(v, r, idx) : v
                          if (di === 'duty_nm') return <span className="text-xs text-slate-400 italic">{t('common.itemCount', { count: r._summaryCount ?? 0 })}</span>
                          if (di === 'status') return <span className="text-slate-300 text-xs">—</span>
                          if (di === 'responsible') return <span className="text-slate-300 text-xs">—</span>
                          if (di === 'progress') return <div className="flex items-center gap-2"><Progress percent={r._summaryProgress ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor="#16a34a" trailColor="#f1f5f9" /><span className="text-xs text-slate-400">{r._summaryProgress ?? 0}%</span></div>
                          if (di === 'expected_start_date') return <span className="text-slate-300 text-xs">—</span>
                          if (di === 'expected_end_date') return r._summaryEndDate ? <span className="text-xs">{r._summaryEndDate}</span> : <span className="text-slate-300 text-xs">—</span>
                          return <span className="text-slate-300 text-xs">—</span>
                        },
                      }
                    }) as ColumnsType<MergedDutyRow>),
                  ]}
                />
              )}
            </Card>
          ),
        },
        {
          key: 'duty',
          label: `AR (${(hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList).length})`,
          children: (
            <>
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Segmented
                    value={dutyPersonal}
                    onChange={(v) => setDutyPersonal(v as 'all' | 'mine')}
                    options={[
                      { label: t('common.all'), value: 'all' },
                      { label: t('common.mine'), value: 'mine' },
                    ]}
                  />
                  <div className="w-px h-5 bg-slate-200" />
                  <Segmented
                    size="small"
                    value={groupMode}
                    onChange={(v) => setGroupMode(v as 'flat' | 'grouped')}
                    options={[
                      { label: t('common.flat'), value: 'flat'    },
                      { label: t('common.grouped'), value: 'grouped' },
                    ]}
                  />
                  <div className="w-px h-5 bg-slate-200" />
                  <Select placeholder={t('common.status')} allowClear style={{ width: 120 }}
                    onChange={(v) => dispatch(setDutyQuery({ status: v, page: 1 }))}
                    options={Object.entries(DUTY_STATUS_MAP).map(([k, v]) => ({ value: Number(k), label: v.label }))}
                  />
                  <Select placeholder={t('common.priority')} allowClear style={{ width: 100 }}
                    onChange={(v) => dispatch(setDutyQuery({ priority: v, page: 1 }))}
                    options={Object.entries(PRIORITY_MAP).map(([k]) => ({ value: Number(k), label: PRIORITY_MAP[Number(k)]?.label ?? k }))}
                  />
                  <Select
                    placeholder={t('common.grouped')} allowClear style={{ width: 110 }}
                    value={filterGroup}
                    onChange={(v) => setFilterGroup(v ?? null)}
                    options={groupFilterOptions}
                  />
                  <Select
                    placeholder={t('function.assignee')} allowClear showSearch optionFilterProp="label" style={{ width: 130 }}
                    value={query.responsible ?? undefined}
                    onChange={(v) => dispatch(setDutyQuery({ responsible: v ?? undefined, page: 1 }))}
                    options={modalUserOptions}
                    onOpenChange={(open) => {
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
                      {t('duty.showHeld')}
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Switch size="small" checked={!hideCompleted} onChange={(v) => setHideCompleted(!v)} />
                      {t('duty.showCompleted')}
                    </label>
                  </div>
                </div>
                {groupMode === 'flat' ? (
                  <Table
                    rowKey="id" columns={columns} components={tableComponents}
                    dataSource={hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList}
                    loading={isLoading}
                    pagination={{
                      current: query.page, pageSize: query.size ?? 10,
                      total: (hideCompleted ? displayedList.filter((d) => d.status !== 3) : displayedList).length,
                      showSizeChanger: true, showTotal: (total) => t('common.total', { count: total }),
                      onChange: (page, size) => dispatch(setDutyQuery({ page, size })),
                    }}
                    scroll={{ x: 920 }} size="small"
                  />
                ) : (
                  <div className="p-4">
                    {isLoading ? (
                      <div className="flex justify-center py-12"><Spin size="large" /></div>
                    ) : groupedDuties.length === 0 ? (
                      <Empty description={t('duty.noTasks')} className="py-12" />
                    ) : (
                      <Collapse
                        activeKey={dutyOpenGroups}
                        onChange={(keys) => setDutyOpenGroups(Array.isArray(keys) ? keys : [keys])}
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
                                  {t('common.itemCount', { count: g.count })}
                                </Tag>
                                <Progress
                                  percent={g.avgProgress} size="small" showInfo={false}
                                  style={{ width: 80 }} strokeColor="#16a34a" trailColor="#e2e8f0"
                                />
                                <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                                {g.overdueCount > 0 && (
                                  <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                                    {t('common.overdueCount', { count: g.overdueCount })}
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
              </Card>

      {/* Create Modal */}
      <Modal title={t('duty.newAr')} open={showCreate}
        onCancel={() => { setShowCreate(false); form.resetFields() }}
        footer={null} width="min(720px, 88vw)" destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleCreate} className="mt-4">
          <Form.Item name="duty_nm" label={t('duty.taskName')} rules={[{ required: true }]}>
            <Input placeholder={t('duty.taskNamePlaceholder')} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]} initialValue={2}>
              <Select options={Object.entries(PRIORITY_MAP).map(([k]) => ({ value: Number(k), label: PRIORITY_MAP[Number(k)]?.label ?? k }))} />
            </Form.Item>
            <Form.Item name="group" label={t('duty.taskGroup')}>
              <AutoComplete
                options={groupAutoOptions}
                placeholder={t('duty.groupPlaceholder')}
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="expected_start_date" label={t('duty.expectedStart')}><DateInput/></Form.Item>
            <Form.Item name="expected_end_date" label={t('duty.expectedComplete')}><DateInput/></Form.Item>
          </div>
          <Form.Item name="responsible" label={t('function.assignee')}>
            <Select
              mode="multiple"
              placeholder={t('duty.assigneePlaceholder')}
              options={modalUserOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>
          <Form.Item name="system_id" label={t('duty.linkedSystem')}>
            <Select
              placeholder={t('duty.linkedSystemPlaceholder')}
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
                    <span className="text-sm text-slate-700">{t('duty.taskDescription')}</span>
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
                      {t('duty.expandRichText')}
                    </button>
                  </div>
                  <Input.TextArea
                    value={displayValue}
                    onChange={(e) => form.setFieldValue('describe', e.target.value)}
                    rows={3}
                    placeholder={t('duty.descriptionPlaceholder')}
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">{t('duty.richTextFormatApplied')}</p>
                  )}
                </div>
              )
            }}
          </Form.Item>

          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); form.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>{t('common.add')}</Button>
          </div>
        </Form>
      </Modal>

      {/* 任務描述展開編輯 Modal */}
      <Modal
        open={dutyExpandOpen}
        title={t('duty.taskDescription')}
        onCancel={() => setDutyExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDutyExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              form.setFieldValue('describe', dutyExpandDraft)
              setDutyExpandOpen(false)
            }}>{t('common.confirm')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={dutyExpandDraft}
          onChange={setDutyExpandDraft}
          placeholder={t('duty.richTextPlaceholder')}
          minHeight={480}
        />
      </Modal>
    </>
          ),
        },
      ] as { key: string; label: string; children: React.ReactNode }[]).sort((a, b) => {
        const order = { duty: 0, project: 1, system: 2 }
        return (order[a.key as keyof typeof order] ?? 9) - (order[b.key as keyof typeof order] ?? 9)
      })}
    />
    {/* AR 快速設定負責人 Modal */}
    <Modal
      title={t('duty.setAssigneeTitle')}
      open={!!arQuickResp}
      onCancel={() => setArQuickResp(null)}
      onOk={handleQuickSetArResp}
      okText={t('duty.saveAssignee')}
      confirmLoading={arQuickSaving}
      okButtonProps={{ style: { background: '#2563eb' } }}
      width={440}
      destroyOnHidden
    >
      <div className="py-3 space-y-4">
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">{t('duty.searchPerson')}</div>
          <div className="relative">
            <Input
              ref={arRespRef}
              value={arRespKw}
              onChange={(e) => setArRespKw(e.target.value)}
              placeholder={t('duty.searchPersonPlaceholder')}
              prefix={arRespSearching ? <Spin size="small" /> : undefined}
              allowClear
              autoFocus
            />
            {arRespResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {arRespResults.map((u) => {
                  const already = arQuickResp?.persons.some((p) => p.work_no === u.work_no)
                  return (
                    <div key={u.work_no}
                      className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                      onClick={() => {
                        if (already) return
                        setArQuickResp((prev) => prev ? { ...prev, persons: [...prev.persons, u] } : null)
                        setArRespKw(''); setArRespResults([])
                      }}>
                      <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>{u.name?.[0]}</Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800">{u.name}</div>
                        <div className="text-xs text-slate-400">{u.work_no} · {u.department}{u.position ? ` · ${u.position}` : ''}</div>
                      </div>
                      {already && <span className="text-xs text-slate-400">{t('duty.alreadyAdded')}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">
            {t('duty.selectedAssignees')}
            {arQuickResp && arQuickResp.persons.length > 0 && (
              <span className="ml-1.5 text-xs font-normal text-slate-400">{t('duty.selectedAssigneesNote', { count: arQuickResp.persons.length })}</span>
            )}
          </div>
          {arRespPreloading ? (
            <div className="flex items-center justify-center py-5 text-slate-400 text-xs gap-2"><Spin size="small" />{t('common.loading')}</div>
          ) : !arQuickResp || arQuickResp.persons.length === 0 ? (
            <div className="border border-dashed border-slate-200 rounded-lg py-5 text-center text-slate-400 text-xs">{t('duty.noAssigneeAdded')}</div>
          ) : (
            <div className="space-y-1.5">
              {arQuickResp.persons.map((p, i) => (
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
                    onClick={() => setArQuickResp((prev) => prev ? { ...prev, persons: prev.persons.filter((x) => x.work_no !== p.work_no) } : null)}
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

    <DutyDetailDrawer
      open={!!selectedDutyId}
      dutyId={selectedDutyId}
      onClose={() => setSelectedDutyId(null)}
      onRefresh={silentRefreshAll}
    />
    <FunctionDetailDrawer
      open={!!selectedFid && !!selectedFunc}
      projectId={selectedFunc?.project_id ?? ''}
      functionId={selectedFid ?? ''}
      isProjectPm={workNo.toLowerCase() === (selectedFunc?.project_pm ?? '').toLowerCase() && [3, 10].includes(selectedFunc?.project_status ?? 0)}
      projectStatus={selectedFunc?.project_status ?? 0}
      projectPm={selectedFunc?.project_pm ?? ''}
      onClose={() => setSelectedFid(null)}
      onRefresh={silentRefreshAll}
    />
  </div>
)
}

export default DutyListPage
