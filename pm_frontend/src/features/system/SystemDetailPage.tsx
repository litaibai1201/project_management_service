import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Tag, Spin, Empty, Table, Space, Tooltip, Popconfirm,
  Modal, Form, Input, Select, AutoComplete, Avatar, Descriptions,
  Typography, Progress, Card, Tabs, Divider, Segmented, Collapse,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, PencilSquareIcon, TrashIcon,
  PaperClipIcon, ArrowsPointingOutIcon, UserCircleIcon, FolderIcon, EyeIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import type { InputRef } from 'antd'
import { systemApi, type SystemItem } from '@/api/system.api'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { PRIORITY_MAP, DUTY_STATUS_MAP } from '@/utils/status'
import type { UserProfile } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import { tokenStorage } from '@/api/httpClient'
import RichTextEditor from '@/components/common/RichTextEditor'
import RichTextContent from '@/components/common/RichTextContent'
import type { TemporaryDuty } from '@/types/api.types'
import DutyDetailDrawer from '@/features/duty/DutyDetailDrawer'
import dayjs from 'dayjs'

const { Link } = Typography

const REQ_STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '草稿',   color: 'default'    },
  1: { label: '審核中', color: 'processing' },
  2: { label: '進行中', color: 'blue'       },
  3: { label: '已拒絕', color: 'error'      },
  4: { label: '已完結', color: 'success'    },
  8: { label: '搁置',   color: 'warning'    },
  9: { label: '已刪除', color: 'error'      },
}

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

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
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''

  // 行選擇（批量）
  const [selectedReqIds, setSelectedReqIds] = useState<string[]>([])

  // 提交審核 Modal（單筆 + 批量共用）
  const [reviewTargetReq,     setReviewTargetReq]     = useState<StandaloneReq | null>(null)
  const [showReview,          setShowReview]           = useState(false)
  const [reviewSaving,        setReviewSaving]         = useState(false)
  const [reviewers,           setReviewers]            = useState<UserProfile[]>([])
  const [reviewersLoading,    setReviewersLoading]     = useState(false)
  const [reviewSearch,        setReviewSearch]         = useState('')
  const [reviewSearchResults, setReviewSearchResults]  = useState<UserProfile[]>([])
  const [reviewSearchLoading, setReviewSearchLoading]  = useState(false)
  // true = 批量模式
  const [batchReviewMode,     setBatchReviewMode]      = useState(false)

  // 建立 AR 任務 Modal (僅 status=2 進行中)
  const [dutyTargetReq,    setDutyTargetReq]    = useState<StandaloneReq | null>(null)
  const [showCreateDuty,   setShowCreateDuty]   = useState(false)
  const [createDutySaving, setCreateDutySaving] = useState(false)
  const [dutyForm]                              = Form.useForm()
  const [dutyExpandOpen,   setDutyExpandOpen]   = useState(false)
  const [dutyExpandDraft,  setDutyExpandDraft]  = useState('')
  const [selectedDutyId,   setSelectedDutyId]   = useState<string | null>(null)

  // 需求任務批量審核
  const [selectedReqDutyIds,       setSelectedReqDutyIds]       = useState<string[]>([])
  const [showBatchDutyReview,      setShowBatchDutyReview]      = useState(false)
  const [batchDutyReviewers,       setBatchDutyReviewers]       = useState<UserProfile[]>([])
  const [batchDutyReviewersLoading,setBatchDutyReviewersLoading]= useState(false)
  const [batchDutyReviewSearch,    setBatchDutyReviewSearch]    = useState('')
  const [batchDutyReviewSearchRes, setBatchDutyReviewSearchRes] = useState<UserProfile[]>([])
  const [batchDutyReviewSearchLoading, setBatchDutyReviewSearchLoading] = useState(false)
  const [batchDutyReviewSaving,    setBatchDutyReviewSaving]    = useState(false)

  // 需求任務 / AR任務 tab 視圖狀態
  const [reqDutyView,      setReqDutyView]      = useState<'all' | 'mine'>('all')
  const [reqDutyGroupMode, setReqDutyGroupMode] = useState<'flat' | 'grouped'>('flat')
  const [arDutyView,       setArDutyView]       = useState<'all' | 'mine'>('all')
  const [arDutyGroupMode,  setArDutyGroupMode]  = useState<'flat' | 'grouped'>('flat')
  // 需求任務分組展開狀態（受控，避免 loadDuties 後自動折疊）
  const [expandedReqKeys, setExpandedReqKeys]  = useState<string[]>([])
  // AR任務分組展開狀態（受控）
  const [arOpenGroups,    setArOpenGroups]     = useState<string[]>([])

  // ── 快速設定任務負責人 ─────────────────────────────────────────────────────
  const [quickDutyResp,      setQuickDutyResp]      = useState<{ did: string; persons: UserProfile[] } | null>(null)
  const [quickDutySaving,    setQuickDutySaving]    = useState(false)
  const [dutyRespKw,         setDutyRespKw]         = useState('')
  const [dutyRespResult,     setDutyRespResult]     = useState<UserProfile | null | false>(null)
  const [dutyRespSearching,  setDutyRespSearching]  = useState(false)
  const [dutyRespPreloading, setDutyRespPreloading] = useState(false)
  const dutyRespRef = useRef<InputRef>(null)

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
        expected_benefit:  values.expected_benefit as string | undefined,
        benefit_amount:    values.benefit_amount as number | undefined,
        benefit_unit:      values.benefit_unit as string | undefined,
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
      expected_benefit:  r.expected_benefit,
      benefit_amount:    r.benefit_amount,
      benefit_unit:      r.benefit_unit ?? '元/年',
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
        expected_benefit:  values.expected_benefit as string | undefined,
        benefit_amount:    values.benefit_amount as number | undefined,
        benefit_unit:      values.benefit_unit as string | undefined,
      })
      showToast.success('已更新')
      setShowEditReq(false)
      editForm.resetFields()
      handleReqUpdated()
    } catch (err: unknown) { showToast.error((err as string) || '操作失敗') }
    finally { setEditSaving(false) }
  }

  const handleDutyRespSearch = async (kw: string) => {
    const trimmed = kw.trim().toLowerCase()
    if (trimmed.length < 4) { setDutyRespResult(null); return }
    setDutyRespSearching(true)
    setDutyRespResult(null)
    try {
      const res = await userApi.getQuiet(trimmed)
      setDutyRespResult(res.content ?? false)
    } catch {
      setDutyRespResult(false)
    } finally {
      setDutyRespSearching(false)
      dutyRespRef.current?.focus()
    }
  }

  useEffect(() => {
    if (dutyRespKw.trim().length < 4) { setDutyRespResult(null); return }
    const t = setTimeout(() => handleDutyRespSearch(dutyRespKw), 600)
    return () => clearTimeout(t)
  }, [dutyRespKw])

  const handleQuickSetDutyResp = async () => {
    if (!quickDutyResp) return
    setQuickDutySaving(true)
    try {
      await dutyApi.allocate(quickDutyResp.did, { responsible: quickDutyResp.persons.map((p) => p.work_no) })
      showToast.success('負責人已更新')
      setQuickDutyResp(null)
      loadDuties()
    } catch { /* global */ }
    finally { setQuickDutySaving(false) }
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

  // ── 審核人鏈輔助 ──────────────────────────────────────────────────────────────
  const openReviewModal = async (req: StandaloneReq | null, batch: boolean) => {
    setReviewTargetReq(req)
    setBatchReviewMode(batch)
    setReviewers([])
    setReviewSearch('')
    setReviewSearchResults([])
    setShowReview(true)
    setReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      setReviewers(list)
    } catch { /* ignore */ }
    finally { setReviewersLoading(false) }
  }

  const addReviewer = (user: UserProfile) => {
    if (reviewers.some((r) => r.work_no === user.work_no)) return
    setReviewers((prev) => [...prev, user])
    setReviewSearch('')
    setReviewSearchResults([])
  }

  const removeReviewer = (wn: string) => setReviewers((prev) => prev.filter((r) => r.work_no !== wn))

  const moveReviewer = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= reviewers.length) return
    setReviewers((prev) => { const a = [...prev]; [a[index], a[next]] = [a[next], a[index]]; return a })
  }

  const handleSearchReviewer = async (keyword: string) => {
    setReviewSearch(keyword)
    if (!keyword.trim()) { setReviewSearchResults([]); return }
    setReviewSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setReviewSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setReviewSearchLoading(false) }
  }

  // 提交審核（單筆）
  const handleSubmitReview = async () => {
    if (!reviewTargetReq || reviewers.length === 0) return
    setReviewSaving(true)
    try {
      await standaloneReqApi.submitReview(reviewTargetReq.id, reviewers.map((r) => r.work_no))
      showToast.success('已提交審核')
      setShowReview(false)
      setReviewTargetReq(null)
      loadReqs(reqPage)
    } catch (err: unknown) { showToast.error((err as string) || '操作失敗') }
    finally { setReviewSaving(false) }
  }

  // 批量提交審核
  const handleBatchSubmitReview = async () => {
    if (selectedReqIds.length === 0 || reviewers.length === 0) return
    setReviewSaving(true)
    try {
      const res = await standaloneReqApi.batchSubmitReview(selectedReqIds, reviewers.map((r) => r.work_no))
      const c = res.content as { count: number }
      showToast.success(`已批量提交 ${c.count} 筆需求審核`)
      setShowReview(false)
      setSelectedReqIds([])
      loadReqs(reqPage)
    } catch (err: unknown) { showToast.error((err as string) || '操作失敗') }
    finally { setReviewSaving(false) }
  }

  // 建立 AR 任務
  const handleCreateDutyFromReq = async (values: Record<string, unknown>) => {
    if (!dutyTargetReq) return
    setCreateDutySaving(true)
    try {
      await dutyApi.create({
        duty_nm:             values.duty_nm as string,
        system_id:           dutyTargetReq.system_id,
        standalone_req_id:   dutyTargetReq.id,
        group:               values.group as string | undefined,
        describe:            values.describe as string | undefined,
        priority:            (values.priority as number) ?? 2,
        responsible:         values.responsible as string[] | undefined,
        expected_start_date: values.expected_start_date as string | undefined,
        expected_end_date:   values.expected_end_date as string | undefined,
      })
      showToast.success('任務已建立，請在任務列表勾選後提交審核')
      setShowCreateDuty(false)
      setDutyTargetReq(null)
      dutyForm.resetFields()
      loadDuties()
    } catch (err: unknown) { showToast.error((err as string) || '建立失敗') }
    finally { setCreateDutySaving(false) }
  }

  const openBatchDutyReviewModal = async () => {
    setBatchDutyReviewers([])
    setBatchDutyReviewSearch('')
    setBatchDutyReviewSearchRes([])
    setShowBatchDutyReview(true)
    setBatchDutyReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      setBatchDutyReviewers((Array.isArray(res.content) ? res.content : []) as UserProfile[])
    } catch { /* ignore */ }
    finally { setBatchDutyReviewersLoading(false) }
  }

  const handleBatchDutyReviewSearch = async (keyword: string) => {
    setBatchDutyReviewSearch(keyword)
    if (!keyword.trim()) { setBatchDutyReviewSearchRes([]); return }
    setBatchDutyReviewSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      setBatchDutyReviewSearchRes(((res.content as { data_list?: UserProfile[] }).data_list) ?? [])
    } catch { /* ignore */ }
    finally { setBatchDutyReviewSearchLoading(false) }
  }

  const handleSubmitBatchDutyReview = async () => {
    if (selectedReqDutyIds.length === 0 || batchDutyReviewers.length === 0) return
    setBatchDutyReviewSaving(true)
    try {
      const res = await dutyApi.batchSubmitReqTaskReview(selectedReqDutyIds, batchDutyReviewers.map((r) => r.work_no))
      const c = res.content as { count: number }
      showToast.success(`已提交 ${c.count} 個任務的審核申請`)
      setShowBatchDutyReview(false)
      setSelectedReqDutyIds([])
      loadDuties()
    } catch (err: unknown) { showToast.error((err as string) || '提交失敗') }
    finally { setBatchDutyReviewSaving(false) }
  }

  // ── Duty 分類計算 ─────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const existingDutyGroups = useMemo(
    () => Array.from(new Set(duties.map((d) => d.group).filter(Boolean))).map((g) => ({ value: g as string, label: g as string })),
    [duties],
  )
const reqDuties   = useMemo(() => duties.filter((d) => !!d.standalone_req_id), [duties])
const arDuties    = useMemo(() => duties.filter((d) => !d.standalone_req_id),  [duties])
const myReqDuties = useMemo(() => reqDuties.filter((d) => (d.responsible ?? []).includes(workNo)), [reqDuties, workNo])
const myArDuties  = useMemo(() => arDuties.filter((d)  => (d.responsible ?? []).includes(workNo)), [arDuties,  workNo])
const displayedReqDuties = useMemo(() => reqDutyView === 'mine' ? myReqDuties : reqDuties, [reqDutyView, myReqDuties, reqDuties])
const displayedArDuties  = useMemo(() => arDutyView  === 'mine' ? myArDuties  : arDuties,  [arDutyView,  myArDuties,  arDuties])
const groupedArDuties = useMemo(() => {
    const map = new Map<string, TemporaryDuty[]>()
    displayedArDuties.forEach((d) => {
      const g = d.group || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(d)
    })
    return [...map.entries()].map(([name, items]) => ({ name, items }))
  }, [displayedArDuties])
const groupedByReq = useMemo(() => {
    // 以 reqList 為主，確保每個需求都顯示（即使還沒有任務），按建立時間降序
    return [...reqList].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')).map((req) => {
      const items = displayedReqDuties.filter((d) => d.standalone_req_id === req.id)
      const groupMap = new Map<string, TemporaryDuty[]>()
      items.forEach((d) => {
        const g = d.group || '未分組'
        if (!groupMap.has(g)) groupMap.set(g, [])
        groupMap.get(g)!.push(d)
      })
      const subGroups = [...groupMap.entries()].map(([gName, gItems]) => ({ name: gName, items: gItems }))
      const avgProgress  = items.length ? Math.round(items.reduce((s, d) => s + (d.progress ?? 0), 0) / items.length) : 0
      const overdueCount = items.filter((d) => {
        if (d.status === 3) {
          // 已完結：實際完成日期晚於預計完成日期才算超時
          const endDate = d.end_time ? d.end_time.slice(0, 10) : null
          return endDate && d.expected_end_date && endDate > d.expected_end_date
        }
        // 未完結：預計完成日期早於今天
        return d.expected_end_date && d.expected_end_date < new Date().toISOString().slice(0, 10)
      }).length
      return { key: req.id, reqNm: req.req_nm, expectedEndDate: req.expected_end_date, responsible: req.responsible ?? [], subGroups, count: items.length, avgProgress, overdueCount }
    })
  }, [displayedReqDuties, reqList])

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
      title: '進度', dataIndex: 'progress', width: 110,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
            strokeColor={v >= 100 ? '#16a34a' : '#2563eb'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
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
      title: '建立時間', dataIndex: 'created_at', width: 110,
      defaultSortOrder: 'descend' as const,
      sorter: (a: StandaloneReq, b: StandaloneReq) => (a.created_at ?? '').localeCompare(b.created_at ?? ''),
      render: (v: string) => <span className="text-xs text-slate-400">{v ? v.slice(0, 10) : '—'}</span>,
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right',
      render: (_: unknown, r: StandaloneReq) => {
        // 只有草稿(0)才可編輯/刪除/上傳；進行中(2)可建立任務；其他狀態僅唯讀
        if (r.status === 0) {
          return (
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
              <Button size="small" type="primary" style={{ background: '#7c3aed', fontSize: 11 }}
                onClick={(e) => { e.stopPropagation(); openReviewModal(r, false) }}>
                提交審核
              </Button>
            </Space>
          )
        }
        return null
      },
    },
  ]

  const dutyColumns: ColumnsType<TemporaryDuty> = [
    {
      title: '任務名稱', dataIndex: 'duty_nm', ellipsis: true, width: 220,
      render: (v: string, r: TemporaryDuty) => {
        const req = reqList.find((rq) => rq.id === r.standalone_req_id)
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[r.priority] ?? '#e2e8f0' }} />
            <div style={{ minWidth: 0 }}>
              <Button type="link" style={{ padding: 0, fontWeight: 500, height: 'auto' }}
                onClick={() => setSelectedDutyId(r.id)}>{v}</Button>
              {req && (
                <div style={{ fontSize: 10, color: '#6366f1', marginTop: 1, lineHeight: 1.2 }}>需求: {req.req_nm}</div>
              )}
            </div>
          </div>
        )
      },
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = DUTY_STATUS_MAP[v] ?? { label: String(v), dot: '#94a3b8' }
        return (
          <div className="flex items-center gap-1.5">
            <span className="status-dot" style={{ background: s.dot }} />
            <span className="text-sm">{s.label}</span>
          </div>
        )
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: number) => {
        const p = PRIORITY_MAP[v]
        return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : <span className="text-slate-400">—</span>
      },
    },
    {
      title: '進度', dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" strokeColor="#2563eb" trailColor="#f1f5f9" showInfo={false}
            style={{ marginBottom: 0, flex: 1 }} />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: '負責人', dataIndex: 'responsible', width: 160,
      render: (v: string[], record: TemporaryDuty) => {
        const req = reqList.find((rq) => rq.id === record.standalone_req_id)
        const canEdit = req ? (req.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase()) : false
        const list = v ?? []
        const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626']
        const openPicker = async () => {
          setDutyRespKw(''); setDutyRespResult(null)
          setQuickDutyResp({ did: record.id, persons: [] })
          if (list.length > 0) {
            setDutyRespPreloading(true)
            const profiles = await Promise.all(list.map(async (wn) => {
              try { return (await userApi.get(wn)).content as UserProfile }
              catch { return { work_no: wn, name: wn, department: '' } as UserProfile }
            }))
            setQuickDutyResp({ did: record.id, persons: profiles })
            setDutyRespPreloading(false)
          }
        }
        if (list.length > 0) {
          const shown = list.slice(0, 3)
          const extra = list.length - shown.length
          return (
            <div className="flex items-center gap-1.5 group">
              <div className="flex items-center">
                {shown.map((wn, i) => (
                  <Tooltip key={wn} title={`${toName(wn)} (${wn})`}>
                    <Avatar size={22} style={{ background: COLORS[i % COLORS.length], fontSize: 10, fontWeight: 700, border: '2px solid white', marginLeft: i > 0 ? -6 : 0, zIndex: shown.length - i }}>
                      {toName(wn)?.[0]?.toUpperCase() ?? wn[0]}
                    </Avatar>
                  </Tooltip>
                ))}
                {extra > 0 && (
                  <Avatar size={22} style={{ background: '#94a3b8', fontSize: 10, border: '2px solid white', marginLeft: -6 }}>+{extra}</Avatar>
                )}
              </div>
              <span className="text-xs text-slate-600">{toName(list[0]) || list[0]}{list.length > 1 ? ` 等${list.length}人` : ''}</span>
              {canEdit && (
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 border-0 outline-none bg-transparent p-0 cursor-pointer" onClick={openPicker} title="修改負責人">
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        }
        if (!canEdit) return <span className="text-slate-300 text-xs">—</span>
        return (
          <button
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 px-2 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-blue-300 transition-colors"
            onClick={openPicker}
          >
            <PlusIcon className="w-3 h-3" />指定負責人
          </button>
        )
      },
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 100,
      render: (v: string) => <span className="text-xs text-slate-500">{v || '—'}</span>,
    },
    {
      title: '實際完成', dataIndex: 'end_time', width: 110,
      render: (v: string, record: TemporaryDuty) => {
        if (!v) return <span className="text-slate-300 text-xs">—</span>
        const date = v.slice(0, 10)
        const exp = record.expected_end_date
        const isLate = exp && date > exp
        return (
          <span className={isLate ? 'text-red-500 text-xs font-medium' : 'text-green-600 text-xs font-medium'}>
            {date}{isLate ? ' ⚠' : ' ✓'}
          </span>
        )
      },
    },
    {
      title: '操作', key: 'action', width: 60, fixed: 'right',
      render: (_: unknown, r: TemporaryDuty) => (
        <Tooltip title="查看詳情">
          <Button type="text" size="small" icon={<EyeIcon className="w-4 h-4 text-slate-400" />}
            onClick={() => setSelectedDutyId(r.id)} />
        </Tooltip>
      ),
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
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">需求列表</span>
                    {selectedReqIds.length > 0 && (
                      <Button size="small" type="primary" ghost
                        onClick={() => openReviewModal(null, true)}>
                        批量提交審核（{selectedReqIds.length}）
                      </Button>
                    )}
                  </div>
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
                  rowSelection={{
                    selectedRowKeys: selectedReqIds,
                    onChange: (keys) => setSelectedReqIds(keys as string[]),
                    getCheckboxProps: (r: StandaloneReq) => ({ disabled: r.status !== 0 }),
                  }}
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
                        {(req.benefit_amount != null || req.expected_benefit) && (
                          <div className="col-span-2">
                            <span className="text-xs text-slate-400 mr-2">預估效益</span>
                            <span className="text-slate-700">
                              {req.benefit_amount != null
                                ? <>{req.benefit_amount} {req.benefit_unit ?? '元/年'}{req.expected_benefit ? <span className="text-slate-400 ml-2 text-xs">（{req.expected_benefit}）</span> : null}</>
                                : req.expected_benefit}
                            </span>
                          </div>
                        )}
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
            key: 'req_duties',
            label: `需求任務 (${reqDuties.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Segmented size="small" value={reqDutyView} onChange={(v) => setReqDutyView(v as 'all' | 'mine')}
                    options={[
                      { label: `全部 (${reqDuties.length})`,   value: 'all'  },
                      { label: `我的 (${myReqDuties.length})`, value: 'mine' },
                    ]}
                  />
                  <div className="w-px h-5 bg-slate-200" />
                  <Segmented size="small" value={reqDutyGroupMode} onChange={(v) => setReqDutyGroupMode(v as 'flat' | 'grouped')}
                    options={[
                      { label: '分組', value: 'grouped' },
                      { label: '平面', value: 'flat'    },
                    ]}
                  />
                  {selectedReqDutyIds.length > 0 && (
                    <Button size="small" type="primary" ghost
                      onClick={openBatchDutyReviewModal}>
                      提交需求任務審核（{selectedReqDutyIds.length}）
                    </Button>
                  )}
                </div>
                <div className="px-2 py-2">
                  {dutiesLoading ? (
                    <div className="flex justify-center py-8"><Spin /></div>
                  ) : groupedByReq.length === 0 ? (
                    <Empty description="暫無需求任務" className="py-8" />
                  ) : reqDutyGroupMode === 'flat' ? (
                    <Table<TemporaryDuty> rowKey="id" columns={dutyColumns}
                      dataSource={displayedReqDuties}
                      pagination={false} size="small" scroll={{ x: 800 }}
                      rowSelection={{
                        selectedRowKeys: selectedReqDutyIds,
                        onChange: (keys) => setSelectedReqDutyIds(keys as string[]),
                        getCheckboxProps: (r) => ({ disabled: r.status !== 0 }),
                      }} />
                  ) : (
                    <Collapse activeKey={expandedReqKeys} onChange={(keys) => setExpandedReqKeys(keys as string[])}
                      className="bg-transparent border-0" expandIconPosition="start">
                      {groupedByReq.map((g) => (
                        <Collapse.Panel key={g.key}
                          header={
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-slate-700">{g.reqNm}</span>
                              <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{g.count} 項</Tag>
                              {g.expectedEndDate && (
                                <span className="text-xs text-slate-400">期望完成 {g.expectedEndDate}</span>
                              )}
                              <Progress percent={g.avgProgress} size="small" showInfo={false}
                                style={{ width: 80 }} strokeColor="#7c3aed" trailColor="#e2e8f0" />
                              <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                              {g.overdueCount > 0 && (
                                <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>超時 {g.overdueCount}</Tag>
                              )}
                            </div>
                          }
                          extra={g.responsible.includes(workNo) ? (
                            <Button size="small" type="primary" icon={<PlusIcon className="w-3 h-3" />}
                              style={{ background: '#2563eb', fontSize: 11 }}
                              onClick={(e) => {
                                e.stopPropagation()
                                const req = reqList.find((r) => r.id === g.key)
                                if (!req) return
                                setDutyTargetReq(req)
                                dutyForm.resetFields()
                                loadUsers()
                                setShowCreateDuty(true)
                              }}>
                              新增任務
                            </Button>
                          ) : undefined}
                        >
                          {reqDutyGroupMode === 'flat' || (g.subGroups.length === 1 && g.subGroups[0].name === '未分組') ? (
                            (() => {
                              const tableIds = g.subGroups.flatMap((sg) => sg.items.map((d) => d.id))
                              return (
                                <Table<TemporaryDuty> rowKey="id" columns={dutyColumns}
                                  dataSource={g.subGroups.flatMap((sg) => sg.items)}
                                  pagination={false} size="small" scroll={{ x: 800 }}
                                  rowSelection={{
                                    selectedRowKeys: selectedReqDutyIds,
                                    onChange: (keys) => setSelectedReqDutyIds((prev) => [
                                      ...prev.filter((id) => !tableIds.includes(id)),
                                      ...(keys as string[]),
                                    ]),
                                    getCheckboxProps: (r) => ({ disabled: r.status !== 0 }),
                                  }} />
                              )
                            })()
                          ) : (
                            <Collapse defaultActiveKey={g.subGroups.map((sg) => sg.name)}
                              className="bg-transparent border-0" expandIconPosition="start" size="small">
                              {g.subGroups.map((sg) => (
                                <Collapse.Panel key={sg.name}
                                  header={
                                    <div className="flex items-center gap-2">
                                      <FolderIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                      <span className="font-medium text-slate-600 text-xs">{sg.name}</span>
                                      <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{sg.items.length} 項</Tag>
                                    </div>
                                  }
                                >
                                  {(() => {
                                    const sgIds = sg.items.map((d) => d.id)
                                    return (
                                      <Table<TemporaryDuty> rowKey="id" columns={dutyColumns}
                                        dataSource={sg.items} pagination={false} size="small" scroll={{ x: 800 }}
                                        rowSelection={{
                                          selectedRowKeys: selectedReqDutyIds,
                                          onChange: (keys) => setSelectedReqDutyIds((prev) => [
                                            ...prev.filter((id) => !sgIds.includes(id)),
                                            ...(keys as string[]),
                                          ]),
                                          getCheckboxProps: (r) => ({ disabled: r.status !== 0 }),
                                        }} />
                                    )
                                  })()}
                                </Collapse.Panel>
                              ))}
                            </Collapse>
                          )}
                        </Collapse.Panel>
                      ))}
                    </Collapse>
                  )}
                </div>
              </Card>
            ),
          },
          {
            key: 'ar_duties',
            label: `AR任務 (${arDuties.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                  <Segmented size="small" value={arDutyView} onChange={(v) => setArDutyView(v as 'all' | 'mine')}
                    options={[
                      { label: `全部 (${arDuties.length})`,   value: 'all'  },
                      { label: `我的 (${myArDuties.length})`, value: 'mine' },
                    ]}
                  />
                  <div className="w-px h-5 bg-slate-200" />
                  <Segmented size="small" value={arDutyGroupMode} onChange={(v) => setArDutyGroupMode(v as 'flat' | 'grouped')}
                    options={[
                      { label: '分組', value: 'grouped' },
                      { label: '平面', value: 'flat'    },
                    ]}
                  />
                </div>
                {arDutyGroupMode === 'flat' ? (
                  <Table<TemporaryDuty>
                    rowKey="id"
                    loading={dutiesLoading}
                    dataSource={displayedArDuties}
                    columns={dutyColumns}
                    size="small"
                    pagination={false}
                    locale={{ emptyText: <Empty description="暫無AR任務" className="py-8" /> }}
                    scroll={{ x: 800 }}
                  />
                ) : (
                  <div className="px-2 py-2">
                    {dutiesLoading ? (
                      <div className="flex justify-center py-8"><Spin /></div>
                    ) : groupedArDuties.length === 0 ? (
                      <Empty description="暫無AR任務" className="py-8" />
                    ) : (
                      <Collapse activeKey={arOpenGroups}
                        onChange={(keys) => setArOpenGroups(Array.isArray(keys) ? keys : [keys])}
                        className="bg-transparent border-0" expandIconPosition="start" size="small">
                        {groupedArDuties.map((g) => (
                          <Collapse.Panel key={g.name}
                            header={
                              <div className="flex items-center gap-2">
                                <FolderIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <span className="font-medium text-slate-600 text-xs">{g.name}</span>
                                <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{g.items.length} 項</Tag>
                              </div>
                            }
                          >
                            <Table<TemporaryDuty> rowKey="id" columns={dutyColumns}
                              dataSource={g.items} pagination={false} size="small" scroll={{ x: 800 }} />
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    )}
                  </div>
                )}
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
            <Form.Item name="expected_end_date" label="期望完成時間">
              <Input type="date" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="benefit_amount" label="預估效益數量">
              <Input type="number" min={0} placeholder="如：10" />
            </Form.Item>
            <Form.Item name="benefit_unit" label="效益單位">
              <Select options={[{ value: '元/年', label: '元/年' }, { value: '人/年', label: '人/年' }, { value: '工時/年', label: '工時/年' }]} />
            </Form.Item>
          </div>
          <Form.Item name="expected_benefit" label="效益說明">
            <Input.TextArea placeholder="選填" autoSize={{ minRows: 2, maxRows: 6 }} style={{ resize: 'vertical' }} />
          </Form.Item>
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

      {/* 提交審核 Modal（單筆 + 批量共用） */}
      <Modal
        title={batchReviewMode
          ? `批量提交需求審核（共 ${selectedReqIds.length} 筆）`
          : `提交審核 — ${reviewTargetReq?.req_nm ?? ''}`}
        open={showReview}
        onCancel={() => { setShowReview(false); setReviewTargetReq(null); setBatchReviewMode(false) }}
        footer={null} width={520} destroyOnClose
      >
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">
            {batchReviewMode
              ? `以下 ${selectedReqIds.length} 筆草稿需求將使用相同的審核人依序提交，可調整順序。`
              : '審核人將依序審核，可調整順序。'}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">審核流程</div>
            {reviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : reviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                尚未添加審核人，請搜尋並加入
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {reviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0} onClick={() => moveReviewer(i, -1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === reviewers.length - 1} onClick={() => moveReviewer(i, 1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === reviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />} onClick={() => removeReviewer(r.work_no)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">加簽審核人</div>
            <div className="relative">
              <Input placeholder="輸入姓名或工號搜尋" value={reviewSearch}
                onChange={(e) => handleSearchReviewer(e.target.value)}
                prefix={reviewSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {reviewSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {reviewSearchResults.map((u) => {
                    const already = reviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => !already && addReviewer(u)}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">已添加</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowReview(false); setReviewTargetReq(null); setBatchReviewMode(false) }}>取消</Button>
            <Button type="primary" loading={reviewSaving} disabled={reviewers.length === 0}
              style={{ background: '#7c3aed' }}
              onClick={batchReviewMode ? handleBatchSubmitReview : handleSubmitReview}>
              提交審核
            </Button>
          </div>
        </div>
      </Modal>

      {/* 建立 AR 任務 Modal */}
      <Modal
        title="新建任務"
        open={showCreateDuty}
        onCancel={() => { setShowCreateDuty(false); setDutyTargetReq(null); dutyForm.resetFields() }}
        footer={null}
        width="min(720px, 88vw)"
        destroyOnClose
      >
        <Form form={dutyForm} layout="vertical" onFinish={handleCreateDutyFromReq} className="mt-4">
          <Form.Item name="duty_nm" label="任務名稱" rules={[{ required: true, message: '請輸入任務名稱' }]}>
            <Input placeholder="請輸入任務名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{ value: 1, label: '低' }, { value: 2, label: '中' }, { value: 3, label: '高' }, { value: 4, label: '緊急' }]} />
            </Form.Item>
            <Form.Item name="group" label="任務分組">
              <AutoComplete options={existingDutyGroups} placeholder="選擇或輸入分組"
                filterOption={(input, opt) => (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
            </Form.Item>
            <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
            <Form.Item name="expected_end_date" label="預計完成"><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="responsible" label="負責人">
            <Select mode="multiple" placeholder="選擇負責人" options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>
          {dutyTargetReq && (
            <Form.Item label="關聯需求">
              <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                {dutyTargetReq.req_nm}
              </div>
            </Form.Item>
          )}
          {/* 任務描述 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
            {({ getFieldValue }) => {
              const v: string = getFieldValue('describe') ?? ''
              const displayValue = isHtml(v) ? stripHtml(v) : v
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700">任務描述</span>
                    <button type="button"
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
                  <Input.TextArea value={displayValue}
                    onChange={(e) => dutyForm.setFieldValue('describe', e.target.value)}
                    rows={3} placeholder="請描述任務內容，或點擊右上角展開富文本編輯器..."
                    style={{ resize: 'vertical', minHeight: 80 }} />
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
                  )}
                </div>
              )
            }}
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreateDuty(false); setDutyTargetReq(null); dutyForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createDutySaving} style={{ background: '#2563eb' }}>建立</Button>
          </div>
        </Form>
      </Modal>

      {/* 需求任務批量審核 Modal */}
      <Modal
        title={`提交需求任務審核（共 ${selectedReqDutyIds.length} 個草稿任務）`}
        open={showBatchDutyReview}
        onCancel={() => setShowBatchDutyReview(false)}
        footer={null} width={520} destroyOnClose
      >
        <div className="mt-4 space-y-4">
          <div className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
            以下 {selectedReqDutyIds.length} 個草稿任務將在審核通過後正式啟動（狀態改為「進行中」）。
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">審核流程</div>
            {batchDutyReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : batchDutyReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                尚未添加審核人，請搜尋並加入
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {batchDutyReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0}
                        onClick={() => setBatchDutyReviewers((prev) => { const a = [...prev]; [a[i], a[i-1]] = [a[i-1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === batchDutyReviewers.length - 1}
                        onClick={() => setBatchDutyReviewers((prev) => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === batchDutyReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                        onClick={() => setBatchDutyReviewers((prev) => prev.filter((u) => u.work_no !== r.work_no))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">加簽審核人</div>
            <div className="relative">
              <Input placeholder="輸入姓名或工號搜尋" value={batchDutyReviewSearch}
                onChange={(e) => handleBatchDutyReviewSearch(e.target.value)}
                prefix={batchDutyReviewSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {batchDutyReviewSearchRes.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {batchDutyReviewSearchRes.map((u) => {
                    const already = batchDutyReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => {
                          if (already) return
                          setBatchDutyReviewers((prev) => [...prev, u])
                          setBatchDutyReviewSearch('')
                          setBatchDutyReviewSearchRes([])
                        }}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">已添加</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowBatchDutyReview(false)}>取消</Button>
            <Button type="primary" loading={batchDutyReviewSaving} disabled={batchDutyReviewers.length === 0}
              style={{ background: '#7c3aed' }}
              onClick={handleSubmitBatchDutyReview}>
              提交審核
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duty describe rich text expand */}
      <Modal open={dutyExpandOpen} title="任務描述"
        onCancel={() => setDutyExpandOpen(false)}
        width="80vw" style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDutyExpandOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => { dutyForm.setFieldValue('describe', dutyExpandDraft); setDutyExpandOpen(false) }} style={{ background: '#2563eb' }}>完成</Button>
          </div>
        }
        destroyOnClose
      >
        <RichTextEditor value={dutyExpandDraft} onChange={setDutyExpandDraft} placeholder="請輸入任務描述..." minHeight={480} />
      </Modal>
      {/* 快速設定任務負責人 Modal */}
      <Modal
        title="設定任務負責人"
        open={!!quickDutyResp}
        onCancel={() => setQuickDutyResp(null)}
        onOk={handleQuickSetDutyResp}
        okText="確認儲存"
        confirmLoading={quickDutySaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={440}
        destroyOnHidden
      >
        <div className="py-3 space-y-4">
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">透過工號搜尋人員</div>
            <Input
              ref={dutyRespRef}
              value={dutyRespKw}
              onChange={(e) => setDutyRespKw(e.target.value)}
              placeholder="輸入工號，自動搜索（如：EMP001）"
              suffix={dutyRespSearching ? <Spin size="small" /> : null}
              autoFocus
            />
            {dutyRespResult === false && (
              <div className="mt-2 text-xs text-red-500 flex items-center gap-1">
                <XMarkIcon className="w-3.5 h-3.5" />查無此工號，請確認後重試
              </div>
            )}
            {dutyRespResult && typeof dutyRespResult === 'object' && (
              <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                    {(dutyRespResult as UserProfile).name?.[0]?.toUpperCase()}
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{(dutyRespResult as UserProfile).name}</div>
                    <div className="text-xs text-slate-400">{(dutyRespResult as UserProfile).work_no} · {(dutyRespResult as UserProfile).department}</div>
                  </div>
                </div>
                <Button
                  size="small" type="primary" style={{ background: '#2563eb' }}
                  disabled={quickDutyResp?.persons.some((p) => p.work_no === (dutyRespResult as UserProfile).work_no)}
                  onClick={() => {
                    const person = dutyRespResult as UserProfile
                    if (!quickDutyResp?.persons.some((p) => p.work_no === person.work_no)) {
                      setQuickDutyResp((prev) => prev ? { ...prev, persons: [...prev.persons, person] } : null)
                    }
                    setDutyRespKw(''); setDutyRespResult(null)
                  }}
                >
                  {quickDutyResp?.persons.some((p) => p.work_no === (dutyRespResult as UserProfile).work_no) ? '已加入' : '加入'}
                </Button>
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              已選負責人
              {quickDutyResp && quickDutyResp.persons.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">（共 {quickDutyResp.persons.length} 人，儲存後生效）</span>
              )}
            </div>
            {dutyRespPreloading ? (
              <div className="flex items-center justify-center py-5 text-slate-400 text-xs gap-2"><Spin size="small" />載入中…</div>
            ) : !quickDutyResp || quickDutyResp.persons.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg py-5 text-center text-slate-400 text-xs">尚未加入任何負責人</div>
            ) : (
              <div className="space-y-1.5">
                {quickDutyResp.persons.map((p, i) => (
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
                      onClick={() => setQuickDutyResp((prev) => prev ? { ...prev, persons: prev.persons.filter((x) => x.work_no !== p.work_no) } : null)}
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
      />
    </div>
  )
}

export default SystemDetailPage
