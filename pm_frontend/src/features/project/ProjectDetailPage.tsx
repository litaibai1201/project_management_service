import React, { useEffect, useState, useMemo, useRef } from 'react'
import dayjs from 'dayjs'
import FilePreviewModal from './FilePreviewModal'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Tabs, Descriptions, Button, Tag, Progress, Spin, Empty, Table,
  Space, Tooltip, Popconfirm, Modal, Form, Input, Select, Steps, Avatar,
  Timeline, Card, Segmented, Collapse, AutoComplete, DatePicker, InputNumber, Divider, Upload,
} from 'antd'
import type { InputRef } from 'antd'
import { PencilSquareIcon as EditIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon, XMarkIcon,
  CodeBracketIcon, UserCircleIcon, FolderIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { fetchProjectThunk, clearCurrent, fetchProjectGroupsThunk } from './projectSlice'
import { projectApi } from '@/api/project.api'
import { userApi } from '@/api/user.api'
import { ProjectFunction, Milestone, ProjectFile, UserProfile } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import FunctionDetailDrawer from './FunctionDetailDrawer'
import GanttChart from './GanttChart'
import MilestoneTab from './MilestoneTab'
import DutyDetailDrawer from '@/features/duty/DutyDetailDrawer'
import { dutyApi } from '@/api/duty.api'
import { TemporaryDuty } from '@/types/api.types'
import { DUTY_STATUS_MAP } from '@/utils/status'

// ─── Office Preview Sub-components ────────────────────────────────────────────


const PRIORITY_OPTIONS = [
  { value: 1, label: '低' }, { value: 2, label: '中' },
  { value: 3, label: '高' }, { value: 4, label: '緊急' },
]

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

// ─── Status Steps ─────────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { title: '草稿',     statuses: [1]  },
  { title: '立案審核', statuses: [2]  },
  { title: '規劃中',   statuses: [3]  },
  { title: '規劃審核', statuses: [4]  },
  { title: '排程安排', statuses: [10] },
  { title: '排程審核', statuses: [11] },
  { title: '執行中',   statuses: [5]  },
  { title: '完結審核', statuses: [6]  },
  { title: '已完結',   statuses: [7]  },
]

const getStepIndex = (status: number) => {
  const idx = STATUS_STEPS.findIndex((s) => s.statuses.includes(status))
  return idx >= 0 ? idx : 0
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { current, isLoading, groups } = useAppSelector((s) => s.project)
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const { isAdmin, isSupervisor } = useAppSelector((s) => s.auth)
  const toName = useWorkNoToName()
  const isPm = (current?.project_pm?.toLowerCase() ?? '') === workNo.toLowerCase() && !!workNo
  // 完結審核中，除系統管理員外任何人不得操作
  const isProjectLocked = current?.status === 6 && !isAdmin
  const canManageGroups = isAdmin || isSupervisor

  const [functions,          setFunctions]          = useState<ProjectFunction[]>([])
  const [funcView,           setFuncView]           = useState<'all' | 'mine'>('all')
  const [funcGroupMode,      setFuncGroupMode]      = useState<'flat' | 'grouped'>('grouped')
  const [funcLoading,        setFuncLoading]        = useState(false)
  const [funcPage,           setFuncPage]           = useState(1)
  const [funcPageSize,       setFuncPageSize]       = useState(100)
  const [funcTotal,          setFuncTotal]          = useState(0)
  const [projectDuties,      setProjectDuties]      = useState<TemporaryDuty[]>([])
  const [dutyLoading,        setDutyLoading]        = useState(false)
  const [selectedDutyId,     setSelectedDutyId]     = useState<string | null>(null)
  const [dynamics,           setDynamics]           = useState<Record<string, unknown>[]>([])
  const [dynamicsPage,       setDynamicsPage]       = useState(1)
  const [dynamicsHasMore,    setDynamicsHasMore]    = useState(false)
  const [dynamicsLoadingMore,setDynamicsLoadingMore]= useState(false)
  const [milestones,      setMilestones]       = useState<Milestone[]>([])
  const [files,           setFiles]            = useState<ProjectFile[]>([])
  const [filesLoading,    setFilesLoading]     = useState(false)
  const [uploading,       setUploading]        = useState(false)
  const [fileCategoryFilter, setFileCategoryFilter] = useState<string>('all')
  const [uploadModal,     setUploadModal]      = useState<{ open: boolean; file: File | null; category: string }>({ open: false, file: null, category: 'other' })
  const [changeReqModal,  setChangeReqModal]   = useState(false)
  const [changeReqSaving, setChangeReqSaving]  = useState(false)
  const [changeReqForm]                        = Form.useForm()
  const [previewFile,     setPreviewFile]      = useState<ProjectFile | null>(null)
  const [selectedFid,     setSelectedFid]      = useState<string | null>(null)
  const [showAddFunc,     setShowAddFunc]      = useState(false)
  const [addFuncLoading,  setAddFuncLoading]   = useState(false)
  const [funcForm]                             = Form.useForm()

  // ── 编辑专案 ──────────────────────────────────────────────────────────────
  const [showEdit,        setShowEdit]        = useState(false)
  const [editSaving,      setEditSaving]      = useState(false)
  const [editForm]                            = Form.useForm()
  const [newGroupName,    setNewGroupName]    = useState('')
  const [creatingGroup,   setCreatingGroup]   = useState(false)

  // ── 新增功能負責人 picker ──────────────────────────────────────────────────
  const [addFuncPersons,     setAddFuncPersons]     = useState<UserProfile[]>([])
  const [addFuncSearchKw,    setAddFuncSearchKw]    = useState('')
  const [addFuncSearchRes,   setAddFuncSearchRes]   = useState<UserProfile | null | false>(null)
  const [addFuncSearching,   setAddFuncSearching]   = useState(false)
  const addFuncSearchRef = useRef<InputRef>(null)

  // ── 快速設定任務負責人 ─────────────────────────────────────────────────────
  const [quickResponsible,   setQuickResponsible]   = useState<{ fid: string; persons: UserProfile[] } | null>(null)
  const [quickSaving,        setQuickSaving]         = useState(false)
  const [respSearchKw,       setRespSearchKw]        = useState('')
  const [respSearchResult,   setRespSearchResult]    = useState<UserProfile | null | false>(null)
  const [respSearching,      setRespSearching]       = useState(false)
  const [respPreloading,     setRespPreloading]      = useState(false)
  const respSearchRef = useRef<InputRef>(null)

  // ── 任務編輯 Modal ─────────────────────────────────────────────────────────
  const [editFunctionId, setEditFunctionId] = useState<string | null>(null)
  const [funcEditData,   setFuncEditData]   = useState<ProjectFunction | null>(null)
  const [funcEditSaving, setFuncEditSaving] = useState(false)
  const [funcEditForm]                      = Form.useForm()

  // ── 设定专案PM ─────────────────────────────────────────────────────────────
  const [showSetPm,       setShowSetPm]       = useState(false)
  const [setPmValue,      setSetPmValue]      = useState('')
  const [setPmSaving,     setSetPmSaving]     = useState(false)

  // ── 提交审核 ──────────────────────────────────────────────────────────────
  const [showSubmit,        setShowSubmit]        = useState(false)
  const [submitSaving,      setSubmitSaving]      = useState(false)
  const [submitReviewers,   setSubmitReviewers]   = useState<UserProfile[]>([])
  const [supervisorsLoading, setSupervisorsLoading] = useState(false)
  const [reviewerSearch,    setReviewerSearch]    = useState('')
  const [searchResults,     setSearchResults]     = useState<UserProfile[]>([])
  const [searchLoading,     setSearchLoading]     = useState(false)
  const [isCompletionSubmit, setIsCompletionSubmit] = useState(false)  // distinguish completion from other reviews

  useEffect(() => {
    if (id) {
      dispatch(fetchProjectThunk(id))
      loadFunctions(id)
      loadDynamics(id)
      loadMilestones(id)
      loadFiles(id)
    }
    return () => { dispatch(clearCurrent()) }
  }, [id, dispatch])

  const loadFunctions = async (pid: string, page = 1, size = 100) => {
    setFuncLoading(true)
    try {
      const res = await projectApi.functionList(pid, { page, size })
      const c = res.content as { project_list?: ProjectFunction[]; data_list?: ProjectFunction[]; total_count?: number }
      const list = (c.project_list ?? c.data_list ?? []) as ProjectFunction[]
      setFunctions(list)
      setFuncTotal(c.total_count ?? list.length)
      setFuncPage(page)
      // 若 URL 带有 ?fid=xxx，自动打开对应任务详情
      const fid = searchParams.get('fid')
      if (fid && list.some((f) => f.id === fid)) {
        setSelectedFid(fid)
      }
    } catch { /* global */ }
    finally { setFuncLoading(false) }
  }

  const loadDynamics = async (pid: string) => {
    try {
      const res = await projectApi.memberDynamics(pid, { page: 1, size: 20 })
      const c = res.content as { data_list?: Record<string, unknown>[]; total_count?: number }
      const list = (c.data_list ?? []) as Record<string, unknown>[]
      setDynamics(list)
      setDynamicsPage(1)
      setDynamicsHasMore((c.total_count ?? list.length) > list.length)
    } catch { /* global */ }
  }

  const loadMoreDynamics = async () => {
    if (!id || dynamicsLoadingMore) return
    setDynamicsLoadingMore(true)
    try {
      const nextPage = dynamicsPage + 1
      const res = await projectApi.memberDynamics(id, { page: nextPage, size: 20 })
      const c = res.content as { data_list?: Record<string, unknown>[]; total_count?: number }
      const list = (c.data_list ?? []) as Record<string, unknown>[]
      setDynamics((prev) => [...prev, ...list])
      setDynamicsPage(nextPage)
      const total = c.total_count ?? 0
      setDynamicsHasMore(dynamics.length + list.length < total)
    } catch { /* global */ }
    finally { setDynamicsLoadingMore(false) }
  }

  const loadMilestones = async (pid: string) => {
    try {
      const res = await projectApi.getMilestones(pid)
      setMilestones(Array.isArray(res.content) ? (res.content as Milestone[]) : [])
    } catch { /* global */ }
  }

  const loadFiles = async (pid: string) => {
    setFilesLoading(true)
    try {
      const res = await projectApi.listFiles(pid)
      setFiles(Array.isArray(res.content) ? (res.content as ProjectFile[]) : [])
    } catch { /* global */ }
    finally { setFilesLoading(false) }
  }

  const handleUploadFile = async (file: File, category: string) => {
    if (!id) return false
    setUploading(true)
    try {
      await projectApi.uploadFile(id, file, category)
      showToast.success('上傳成功')
      loadFiles(id)
    } catch { showToast.error('上傳失敗') }
    finally { setUploading(false) }
    return false
  }

  // 根据当前专案阶段推荐默认分类
  const defaultCategoryByStatus = (status: number) => {
    if (status === 1) return 'requirement'
    if (status === 3) return 'design'
    if (status >= 5)  return 'progress'
    return 'other'
  }

  const FILE_CATEGORIES = [
    { value: 'requirement', label: '需求文件', color: '#2563eb' },
    { value: 'design',      label: '規劃設計', color: '#7c3aed' },
    { value: 'progress',    label: '進度報告', color: '#059669' },
    { value: 'other',       label: '其他',     color: '#64748b' },
  ]

  // 各状态下锁定的分类（上传/删除均不可用，上传在有变更审批后可解锁）
  const UPLOAD_LOCKED: Record<number, Set<string>> = {
    2:  new Set(['requirement']),
    3:  new Set(['requirement']),
    4:  new Set(['requirement', 'design']),
    10: new Set(['requirement', 'design']),
    11: new Set(['requirement', 'design']),
    5:  new Set(['requirement', 'design']),
    6:  new Set(['requirement', 'design']),
    7:  new Set(['requirement', 'design']),
    8:  new Set(['requirement', 'design']),
  }
  const DELETE_LOCKED = UPLOAD_LOCKED  // 删除比上传更严，变更审批也不解锁删除

  const canUploadCategory = (cat: string) => {
    if (isProjectLocked) return false
    const locked = UPLOAD_LOCKED[current?.status ?? 0] ?? new Set()
    if (!locked.has(cat)) return true
    return !!current?.has_approved_change_request  // 有已通过的变更审批可上传
  }

  const canDeleteCategory = (cat: string) => {
    if (isProjectLocked) return false
    const locked = DELETE_LOCKED[current?.status ?? 0] ?? new Set()
    return !locked.has(cat)  // 原始文件永远不能删除
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!id) return
    try {
      await projectApi.deleteFile(id, fileId)
      showToast.success('已刪除')
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch { showToast.error('刪除失敗') }
  }

  const handleSubmitChangeRequest = async (values: { reviewer: string[]; description: string }) => {
    if (!id) return
    setChangeReqSaving(true)
    try {
      await projectApi.submitChangeRequest(id, values.reviewer, values.description)
      showToast.success('需求變更申請已提交')
      setChangeReqModal(false)
      changeReqForm.resetFields()
      dispatch(fetchProjectThunk(id))  // 刷新专案状态
    } catch { showToast.error('提交失敗') }
    finally { setChangeReqSaving(false) }
  }

  const PREVIEWABLE = new Set([
    'png','jpg','jpeg','gif','webp','pdf','txt','md','yaml','yml','csv',
    'html','htm','docx','xlsx','xls','pptx','ppt','doc',
  ])

  const handleAddFunction = async (values: Record<string, unknown>) => {
    if (!id) return
    setAddFuncLoading(true)
    try {
      await projectApi.addFunction(id, {
        function_nm:  values.function_nm as string,
        describe:     values.describe as string | undefined,
        responsible:  addFuncPersons.length > 0 ? addFuncPersons.map((p) => p.work_no) : undefined,
        priority:     values.priority as number,
        group1:       values.group1 as string,
        expected_start_date: values.expected_start_date as string | undefined,
        expected_end_date:   values.expected_end_date as string | undefined,
      })
      showToast.success('功能新增成功')
      setShowAddFunc(false)
      funcForm.resetFields()
      setAddFuncPersons([]); setAddFuncSearchKw(''); setAddFuncSearchRes(null)
      loadFunctions(id)
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

  const handleEditOpen = () => {
    if (!current) return
    dispatch(fetchProjectGroupsThunk())
    editForm.setFieldsValue({
      project_nm:        current.project_nm,
      department:        current.department,
      project_pm:        current.project_pm,
      product_pm:        current.product_pm,
      priority:          current.priority,
      group_id:          current.group_id,
      expected_end_date: current.expected_end_date,
      code_url:          current.code_url,
      expected_benefit:  current.expected_benefit,
      describe:          current.describe,
    })
    setNewGroupName('')
    setShowEdit(true)
  }

  const handleCreateGroup = async () => {
    const nm = newGroupName.trim()
    if (!nm) return
    setCreatingGroup(true)
    try {
      await projectApi.createGroup(nm)
      await dispatch(fetchProjectGroupsThunk())
      setNewGroupName('')
      showToast.success(`分組「${nm}」已建立`)
    } catch {
      showToast.error('建立分組失敗')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleEditSave = async (values: Record<string, unknown>) => {
    if (!id) return
    setEditSaving(true)
    try {
      await projectApi.update(id, values as Parameters<typeof projectApi.update>[1])
      showToast.success('專案已更新')
      setShowEdit(false)
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setEditSaving(false) }
  }

  const handleAddFuncSearch = async (kw: string) => {
    const trimmed = kw.trim().toLowerCase()
    if (trimmed.length < 4) { setAddFuncSearchRes(null); return }
    setAddFuncSearching(true)
    setAddFuncSearchRes(null)
    try {
      const res = await userApi.getQuiet(trimmed)
      setAddFuncSearchRes(res.content ?? false)
    } catch {
      setAddFuncSearchRes(false)
    } finally {
      setAddFuncSearching(false)
    }
  }

  useEffect(() => {
    if (addFuncSearchKw.trim().length < 4) { setAddFuncSearchRes(null); return }
    const t = setTimeout(() => handleAddFuncSearch(addFuncSearchKw), 600)
    return () => clearTimeout(t)
  }, [addFuncSearchKw])

  const handleRespSearch = async (kw: string) => {
    const trimmed = kw.trim().toLowerCase()
    if (trimmed.length < 4) { setRespSearchResult(null); return }
    setRespSearching(true)
    setRespSearchResult(null)
    try {
      const res = await userApi.getQuiet(trimmed)
      setRespSearchResult(res.content ?? false)
    } catch {
      setRespSearchResult(false)
    } finally {
      setRespSearching(false)
      respSearchRef.current?.focus()
    }
  }

  useEffect(() => {
    if (respSearchKw.trim().length < 4) { setRespSearchResult(null); return }
    const t = setTimeout(() => handleRespSearch(respSearchKw), 600)
    return () => clearTimeout(t)
  }, [respSearchKw])

  const handleQuickSetResponsible = async () => {
    if (!id || !quickResponsible) return
    setQuickSaving(true)
    try {
      await projectApi.updateFunction(id, quickResponsible.fid, {
        responsible: quickResponsible.persons.map((p) => p.work_no),
      })
      showToast.success('負責人已更新')
      setQuickResponsible(null)
      loadFunctions(id)
    } catch { /* global */ }
    finally { setQuickSaving(false) }
  }

  const handleOpenFuncEdit = async (fid: string) => {
    setEditFunctionId(fid)
    setFuncEditData(null)
    try {
      const res = await projectApi.getFunction(id!, fid)
      const data = res.content as ProjectFunction
      setFuncEditData(data)
      funcEditForm.setFieldsValue({
        function_nm:         data.function_nm,
        describe:            data.describe,
        priority:            data.priority,
        group1:              data.group1,
        expected_start_date: data.expected_start_date,
        expected_end_date:   data.expected_end_date,
      })
    } catch { setEditFunctionId(null) }
  }

  const handleFuncEditSave = async (values: Record<string, unknown>) => {
    if (!id || !editFunctionId) return
    setFuncEditSaving(true)
    try {
      await projectApi.updateFunction(id, editFunctionId, values as Parameters<typeof projectApi.updateFunction>[2])
      showToast.success('任務已更新')
      setEditFunctionId(null)
      loadFunctions(id)
    } catch { /* global */ }
    finally { setFuncEditSaving(false) }
  }

  const handleSetProjectPm = async () => {
    if (!id || !setPmValue.trim()) return
    setSetPmSaving(true)
    try {
      await projectApi.setProjectPm(id, setPmValue.trim())
      showToast.success('專案PM已設定')
      setShowSetPm(false)
      setSetPmValue('')
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setSetPmSaving(false) }
  }

  const handleOpenSubmitModal = async () => {
    setIsCompletionSubmit(false)
    setSubmitReviewers([])
    setReviewerSearch('')
    setSearchResults([])
    setShowSubmit(true)
    setSupervisorsLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      // 若非主管，預設帶入直屬主管作為審核人
      if (!isSupervisor && list.length > 0) {
        setSubmitReviewers(list)
      }
    } catch { /* ignore */ }
    finally { setSupervisorsLoading(false) }
  }

  const handleOpenCompletionModal = async () => {
    setIsCompletionSubmit(true)
    setSubmitReviewers([])
    setReviewerSearch('')
    setSearchResults([])
    setShowSubmit(true)
    setSupervisorsLoading(true)
    try {
      const reviewers: UserProfile[] = []
      const seenWnos = new Set<string>()
      // 1. Pre-load product PM as first reviewer
      const productPmWn = current?.product_pm
      if (productPmWn) {
        const res = await userApi.get(productPmWn)
        const profile = res.content as UserProfile
        if (profile?.work_no && !seenWnos.has(profile.work_no)) {
          reviewers.push(profile)
          seenWnos.add(profile.work_no)
        }
      }
      // 2. Also load supervisors of the project PM as additional reviewers
      const supRes = await userApi.getSupervisors(workNo)
      const supList = (Array.isArray(supRes.content) ? supRes.content : []) as UserProfile[]
      for (const sup of supList) {
        if (sup.work_no && !seenWnos.has(sup.work_no)) {
          reviewers.push(sup)
          seenWnos.add(sup.work_no)
        }
      }
      if (reviewers.length > 0) setSubmitReviewers(reviewers)
    } catch { /* ignore */ }
    finally { setSupervisorsLoading(false) }
  }

  const handleSearchReviewer = async (keyword: string) => {
    setReviewerSearch(keyword)
    if (!keyword.trim()) { setSearchResults([]); return }
    setSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setSearchLoading(false) }
  }

  const addReviewer = (user: UserProfile) => {
    if (submitReviewers.some((r) => r.work_no === user.work_no)) return
    setSubmitReviewers((prev) => [...prev, user])
    setReviewerSearch('')
    setSearchResults([])
  }

  const removeReviewer = (wn: string) => {
    setSubmitReviewers((prev) => prev.filter((r) => r.work_no !== wn))
  }

  const moveReviewer = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= submitReviewers.length) return
    setSubmitReviewers((prev) => {
      const arr = [...prev]
      ;[arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
  }

  const handleSubmitReview = async () => {
    if (!id || !current || submitReviewers.length === 0) return
    setSubmitSaving(true)
    try {
      const statusMap: Record<number, number> = { 1: 2, 3: 4, 10: 11, 5: 6 }
      const targetStatus = statusMap[current.status] ?? 2
      await projectApi.submitForReview(id, submitReviewers.map((r) => r.work_no), targetStatus)
      showToast.success(isCompletionSubmit ? '完結申請已提交' : '已提交審核')
      setShowSubmit(false)
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setSubmitSaving(false) }
  }

  const myFunctions = useMemo(
    () => functions.filter((f) =>
      (Array.isArray(f.responsible) ? f.responsible : []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    ),
    [functions, workNo],
  )
  const displayedFunctions = funcView === 'mine' ? myFunctions : functions

  const myDuties = useMemo(
    () => projectDuties.filter((d) =>
      d.creator?.toLowerCase() === workNo.toLowerCase() ||
      (d.responsible ?? []).some((wn) => wn.toLowerCase() === workNo.toLowerCase())
    ),
    [projectDuties, workNo],
  )
  const displayedDuties = funcView === 'mine' ? myDuties : projectDuties

  // Group-related computed data
  const existingGroups = useMemo(
    () => Array.from(new Set(functions.map((f) => f.group1).filter(Boolean))),
    [functions],
  )
  const groupAutoOptions = useMemo(
    () => existingGroups.map((g) => ({ value: g, label: g })),
    [existingGroups],
  )
  const groupedFunctions = useMemo(() => {
    const map = new Map<string, ProjectFunction[]>()
    displayedFunctions.forEach((f) => {
      const g = f.group1 || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    })
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      count: items.length,
      avgProgress: Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
      overdueCount: items.filter((f) => f.expected_end_date && new Date(f.expected_end_date) < new Date() && f.status !== 4).length,
    }))
  }, [displayedFunctions])

  const funcColumnsGrouped: ColumnsType<ProjectFunction> = [
    {
      title: '功能名稱', dataIndex: 'function_nm', width: 200, ellipsis: true,
      render: (name: string, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[r.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} onClick={() => setSelectedFid(r.id)}>{name}</Button>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = FUNCTION_STATUS_MAP[v]
        return s ? <div className="flex items-center gap-1.5"><span className="status-dot" style={{ background: s.dot }} /><span className="text-sm">{s.label}</span></div> : v
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
    {
      title: '負責人', dataIndex: 'responsible', width: 150,
      render: (v: string[], record) => {
        const ispm = isPm && [3, 5, 10].includes(current?.status ?? 0) && record.status !== 4 && record.status !== 3 && !isProjectLocked
        const openPicker = async () => {
          setRespSearchKw(''); setRespSearchResult(null)
          setQuickResponsible({ fid: record.id, persons: [] })
          const existing = v && v.length > 0 ? v : []
          if (existing.length > 0) {
            setRespPreloading(true)
            const profiles = await Promise.all(existing.map(async (wn) => {
              try { return (await userApi.get(wn)).content as UserProfile }
              catch { return { work_no: wn, name: wn, department: '' } as UserProfile }
            }))
            setQuickResponsible({ fid: record.id, persons: profiles })
            setRespPreloading(false)
          }
        }
        const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626']
        if (v && v.length > 0) {
          const shown = v.slice(0, 3)
          const extra = v.length - shown.length
          return (
            <div className="flex items-center gap-1.5 group">
              <div className="flex items-center" style={{ gap: -4 }}>
                {shown.map((wn, i) => (
                  <Tooltip key={wn} title={toName(wn)}>
                    <Avatar size={22} style={{ background: COLORS[i % COLORS.length], fontSize: 10, fontWeight: 700, border: '2px solid white', marginLeft: i > 0 ? -6 : 0, zIndex: shown.length - i }}>
                      {toName(wn)[0]?.toUpperCase()}
                    </Avatar>
                  </Tooltip>
                ))}
                {extra > 0 && (
                  <Avatar size={22} style={{ background: '#94a3b8', fontSize: 10, border: '2px solid white', marginLeft: -6 }}>+{extra}</Avatar>
                )}
              </div>
              <span className="text-xs text-slate-600">{toName(v[0])}{v.length > 1 ? ` 等${v.length}人` : ''}</span>
              {ispm && (
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 border-0 outline-none bg-transparent p-0 cursor-pointer" onClick={openPicker} title="修改負責人">
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        }
        if (!ispm) return <span className="text-slate-300 text-xs">未指定</span>
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
      title: '預計完成', dataIndex: 'expected_end_date', width: 110,
      render: (v: string, record) => {
        if (!v) return <span className="text-slate-300 text-xs">—</span>
        const isLate = record.end_time && record.end_time > v
        const isEarly = record.end_time && record.end_time <= v
        return (
          <span className={isLate ? 'text-red-500 text-xs' : isEarly ? 'text-green-600 text-xs' : 'text-xs'}>
            {v}
          </span>
        )
      },
    },
    {
      title: '實際完成', dataIndex: 'end_time', width: 110,
      render: (v: string, record) => {
        if (!v) return <span className="text-slate-300 text-xs">—</span>
        const exp = record.expected_end_date
        const isLate = exp && v > exp
        return (
          <span className={isLate ? 'text-red-500 text-xs font-medium' : 'text-green-600 text-xs font-medium'}>
            {v}{isLate ? ' ⚠' : ' ✓'}
          </span>
        )
      },
    },
    {
      title: '操作', key: 'action', width: isPm ? 110 : 80, fixed: 'right',
      render: (_: unknown, record) => {
        const canModifyTask = [3, 10].includes(current?.status ?? 0)
        return (
          <Space size={0}>
            <Tooltip title="查看"><Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(record.id)} /></Tooltip>
            {isPm && canModifyTask && (
              <Tooltip title="編輯"><Button icon={<EditIcon className="w-4 h-4" />} size="small" type="text" onClick={() => handleOpenFuncEdit(record.id)} /></Tooltip>
            )}
            {canModifyTask && (
              <Popconfirm title="確認刪除？" onConfirm={() => handleDeleteFunction(record.id)} okText="確認" cancelText="取消">
                <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  const funcColumnsFlat: ColumnsType<ProjectFunction> = [
    funcColumnsGrouped[0], // 功能名稱
    { title: '分組', dataIndex: 'group1', width: 100, render: (v: string) => <Tag style={{ fontSize: 10 }}>{v || '未分組'}</Tag> },
    ...funcColumnsGrouped.slice(1), // 狀態, 優先級, 進度, 負責人, 預計完成, 實際完成, 操作
  ]

  const dutyTableColumns: ColumnsType<TemporaryDuty> = [
    {
      title: '任務名稱', dataIndex: 'duty_nm', width: 200, ellipsis: true,
      render: (v: string, r) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}
          onClick={() => setSelectedDutyId(r.id)}>{v}</Button>
      ),
    },
    {
      title: '分組', dataIndex: 'group', width: 100,
      render: (v: string) => <Tag style={{ fontSize: 10 }}>{v || '未分組'}</Tag>,
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = DUTY_STATUS_MAP[v]
        const colorMap: Record<string, string> = { default: '#94a3b8', processing: '#2563eb', orange: '#d97706', success: '#16a34a', warning: '#f59e0b', error: '#dc2626' }
        return s ? <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: colorMap[s.color] ?? '#94a3b8' }} /><span className="text-sm">{s.label}</span></div> : v
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
    {
      title: '負責人', dataIndex: 'responsible', width: 150,
      render: (v: string[]) => {
        const list = v ?? []
        if (list.length === 0) return <span className="text-slate-300 text-xs">未指定</span>
        const COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626']
        const shown = list.slice(0, 3)
        const extra = list.length - shown.length
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center">
              {shown.map((wn, i) => (
                <Tooltip key={wn} title={toName(wn)}>
                  <Avatar size={22} style={{ background: COLORS[i % COLORS.length], fontSize: 10, fontWeight: 700, border: '2px solid white', marginLeft: i > 0 ? -6 : 0, zIndex: shown.length - i }}>
                    {toName(wn)[0]?.toUpperCase()}
                  </Avatar>
                </Tooltip>
              ))}
              {extra > 0 && <Avatar size={22} style={{ background: '#94a3b8', fontSize: 10, border: '2px solid white', marginLeft: -6 }}>+{extra}</Avatar>}
            </div>
            <span className="text-xs text-slate-600">{toName(list[0])}{list.length > 1 ? ` 等${list.length}人` : ''}</span>
          </div>
        )
      },
    },
    {
      title: '預計完成', dataIndex: 'expected_end_date', width: 110,
      render: (v: string, r) => {
        if (!v) return <span className="text-slate-300 text-xs">—</span>
        if (r.status === 3) return <span className="text-green-600 text-xs">{v}</span>
        if (r.status === 8) return <span className="text-slate-400 text-xs">{v}</span>
        const isLate = r.end_time && r.end_time > v
        const isEarly = r.end_time && r.end_time <= v
        return <span className={isLate ? 'text-red-500 text-xs' : isEarly ? 'text-green-600 text-xs' : 'text-xs'}>{v}</span>
      },
    },
    {
      title: '實際完成', dataIndex: 'end_time', width: 110,
      render: (v: string, r) => {
        if (!v) return <span className="text-slate-300 text-xs">—</span>
        const isLate = r.expected_end_date && v > r.expected_end_date
        return <span className={isLate ? 'text-red-500 text-xs font-medium' : 'text-green-600 text-xs font-medium'}>{v}{isLate ? ' ⚠' : ' ✓'}</span>
      },
    },
    {
      title: '建立人', dataIndex: 'creator', width: 90,
      render: (v: string) => <span className="text-sm text-slate-500">{toName(v)}</span>,
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
                <UserCircleIcon className="w-3.5 h-3.5" /> 産品：{toName(current.product_pm)}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <UserCircleIcon className="w-3.5 h-3.5" /> 專案：{toName(current.project_pm)}
            </div>
            {current.code_url && (
              <a href={current.code_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <CodeBracketIcon className="w-3.5 h-3.5" /> 代碼庫
              </a>
            )}
          </div>
        </div>
        {/* 操作按鈕 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 草稿且有權限才可編輯（産品PM或其直屬上級） */}
          {current.status === 1 && current.can_edit && (
            <Button icon={<EditIcon className="w-4 h-4" />} onClick={handleEditOpen}>
              編輯
            </Button>
          )}
          {/* 提交立案審核：僅草稿階段且當前用戶是産品PM */}
          {current.status === 1 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={handleOpenSubmitModal}>
              提交立案審核
            </Button>
          )}
          {/* 設定專案PM：規劃中且尚未設定PM，由創建人/産品PM操作 */}
          {current.status === 3 && current.can_set_project_pm && (
            <Button onClick={() => { setSetPmValue(''); setShowSetPm(true) }}>
              設定專案PM
            </Button>
          )}
          {/* 提交規劃審核：規劃中且當前用戶是專案PM */}
          {current.status === 3 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={handleOpenSubmitModal}>
              提交規劃審核
            </Button>
          )}
          {/* 提交排程審核：排程安排階段且當前用戶是專案PM */}
          {current.status === 10 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#7c3aed' }} onClick={handleOpenSubmitModal}>
              提交排程審核
            </Button>
          )}
          {/* 提交完結申請：執行中 + 進度100% + 專案PM */}
          {current.status === 5 && isPm && current.progress === 100 && (
            <Button type="primary" style={{ background: '#059669' }} onClick={handleOpenCompletionModal}>
              提交完結申請
            </Button>
          )}
        </div>
      </div>

      {/* Status progress steps */}
      <Card variant="borderless" className="shadow-sm mb-5" styles={{ body: { padding: '20px 28px' } }}>
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

      {/* 排程安排提示 Banner */}
      {current.status === 10 && (
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">📋</span>
          <div>
            <div className="font-semibold text-violet-800 text-sm mb-1">排程安排階段</div>
            <div className="text-xs text-violet-600 leading-relaxed">
              規劃審核已通過，請在「功能任務」分頁中建立任務、分配開發人員並設定開發時程。
              安排完成後，由專案PM點擊「提交排程審核」，通過審批後專案將正式進入執行中。
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        type="card"
        onChange={(key) => {
          if (key === 'functions' && id && projectDuties.length === 0 && !dutyLoading) {
            setDutyLoading(true)
            dutyApi.listByProject(id)
              .then((res) => setProjectDuties(Array.isArray(res.content) ? res.content : []))
              .catch(() => {})
              .finally(() => setDutyLoading(false))
          }
        }}
        items={[
          {
            key: 'info',
            label: '基本資訊',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 24 } }}>
                <Descriptions bordered column={2} size="small"
                  labelStyle={{ background: '#f8fafc', color: '#64748b', fontWeight: 500, fontSize: 12 }}
                  contentStyle={{ fontSize: 13 }}
                >
                  <Descriptions.Item label="優先級">
                    {(() => { const p = PRIORITY_MAP[current.priority]; return p ? <Tag color={p.color}>{p.label}</Tag> : current.priority })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="建立人">{toName(current.creator)}</Descriptions.Item>
                  <Descriptions.Item label="産品PM">{toName(current.product_pm)}</Descriptions.Item>
                  <Descriptions.Item label="專案PM">{toName(current.project_pm)}</Descriptions.Item>
                  <Descriptions.Item label="預計完成">{current.expected_end_date ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="建立時間">{current.created_at}</Descriptions.Item>
                  <Descriptions.Item label="描述" span={2}>{current.describe || '—'}</Descriptions.Item>
                  <Descriptions.Item label="預期效益" span={2}>{current.expected_benefit || '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'functions',
            label: `功能任務 (${functions.length + projectDuties.filter((d) => d.status !== 3).length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Segmented
                      size="small"
                      value={funcView}
                      onChange={(v) => setFuncView(v as 'all' | 'mine')}
                      options={[
                        { label: `全部 (${functions.length + projectDuties.filter((d) => d.status !== 3).length})`, value: 'all'  },
                        { label: `我的 (${myFunctions.length + myDuties.length})`, value: 'mine' },
                      ]}
                    />
                    <div className="w-px h-5 bg-slate-200" />
                    <Segmented
                      size="small"
                      value={funcGroupMode}
                      onChange={(v) => setFuncGroupMode(v as 'flat' | 'grouped')}
                      options={[
                        { label: '分組', value: 'grouped' },
                        { label: '平面', value: 'flat'    },
                      ]}
                    />
                  </div>
                  {isPm && [3, 10].includes(current?.status ?? 0) && !isProjectLocked && (
                    <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                      onClick={() => setShowAddFunc(true)} size="small" style={{ background: '#2563eb' }}>
                      新增功能
                    </Button>
                  )}
                </div>

                {funcGroupMode === 'flat' ? (
                  <>
                    <Table rowKey="id" columns={funcColumnsFlat} dataSource={displayedFunctions}
                      loading={funcLoading} size="middle" scroll={{ x: 900 }}
                      pagination={{
                        current: funcPage,
                        pageSize: funcPageSize,
                        total: funcTotal,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total) => `共 ${total} 筆`,
                        onChange: (page, size) => {
                          setFuncPageSize(size)
                          if (id) loadFunctions(id, page, size)
                        },
                      }}
                    />
                    {displayedDuties.length > 0 && (
                      <div className="border-t border-orange-100">
                        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50/60">
                          <FolderIcon className="w-4 h-4 text-orange-500" />
                          <span className="text-sm font-semibold text-slate-700">臨時任務</span>
                          <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                            {displayedDuties.filter((d) => d.status !== 3).length} 項
                          </Tag>
                        </div>
                        <Table
                          rowKey="id"
                          size="middle"
                          dataSource={displayedDuties}
                          pagination={false}
                          scroll={{ x: 1000 }}
                          showHeader={true}
                          columns={dutyTableColumns}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-2 py-2">
                    {funcLoading ? (
                      <div className="flex justify-center py-8"><Spin /></div>
                    ) : groupedFunctions.length === 0 && displayedDuties.length === 0 ? (
                      <Empty description="暫無功能任務" className="py-8" />
                    ) : (
                      <Collapse
                        defaultActiveKey={groupedFunctions.map((g) => g.name)}
                        className="bg-transparent border-0"
                        expandIconPosition="start"
                      >
                        {groupedFunctions.map((g) => (
                          <Collapse.Panel
                            key={g.name}
                            header={
                              <div className="flex items-center gap-3">
                                <FolderIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-semibold text-slate-700">{g.name}</span>
                                <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{g.count} 項</Tag>
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
                            <Table rowKey="id" columns={funcColumnsGrouped} dataSource={g.items}
                              pagination={false} size="small" scroll={{ x: 800 }} />
                          </Collapse.Panel>
                        ))}
                        {displayedDuties.length > 0 && (
                          <Collapse.Panel
                            key="__duties__"
                            header={
                              <div className="flex items-center gap-3">
                                <FolderIcon className="w-4 h-4 text-orange-500" />
                                <span className="font-semibold text-slate-700">臨時任務</span>
                                <Tag color="orange" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                                  {displayedDuties.filter((d) => d.status !== 3).length} 項
                                </Tag>
                                {displayedDuties.some((d) => d.status !== 8 && d.status !== 3 && d.expected_end_date && dayjs(d.expected_end_date).isBefore(dayjs(), 'day')) && (
                                  <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>超時</Tag>
                                )}
                              </div>
                            }
                          >
                            <Table rowKey="id" size="small" dataSource={displayedDuties}
                              pagination={false} scroll={{ x: 1000 }} columns={dutyTableColumns} />
                          </Collapse.Panel>
                        )}
                      </Collapse>
                    )}
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'dynamics',
            label: '成員動態',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: '16px 24px' } }}>
                {dynamics.length === 0 ? (
                  <Empty description="暫無動態記錄" />
                ) : (
                  <>
                    <Timeline
                      items={dynamics.map((d) => {
                        const name = String(d.operator_name ?? d.operator ?? '')
                        const fnm  = String(d.function_nm ?? '')
                        const note = String(d.progress_record ?? '')
                        return {
                          dot: (
                            <Avatar size={24} style={{ background: '#2563eb', fontSize: 11, fontWeight: 600 }}>
                              {name[0]?.toUpperCase() ?? '?'}
                            </Avatar>
                          ),
                          children: (
                            <div>
                              <span className="font-medium text-slate-700 text-sm">{name}</span>
                              {fnm && <span className="text-slate-500 text-sm"> · {fnm}</span>}
                              <span className="text-slate-400 text-sm"> {String(d.action ?? '')}</span>
                              {note && <div className="text-xs text-slate-500 mt-0.5">{note}</div>}
                              <div className="text-xs text-slate-300 mt-0.5">{String(d.created_at ?? '')}</div>
                            </div>
                          ),
                        }
                      })}
                    />
                    {dynamicsHasMore && (
                      <div className="flex justify-center mt-2">
                        <Button size="small" loading={dynamicsLoadingMore} onClick={loadMoreDynamics}>
                          載入更多
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            ),
          },
          {
            key: 'gantt',
            label: '甘特圖',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <GanttChart functions={functions} milestones={milestones} />
              </Card>
            ),
          },
          {
            key: 'milestones',
            label: `里程碑 (${milestones.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 20 } }}>
                {id && <MilestoneTab
                  projectId={id}
                  functions={functions}
                  canManage={!isProjectLocked && (isPm || (current?.product_pm?.toLowerCase() === workNo.toLowerCase() && !!workNo) || isSupervisor || isAdmin)}
                />}
              </Card>
            ),
          },
          {
            key: 'files',
            label: `附件 (${files.length})`,
            children: (
              <Card
                variant="borderless"
                className="shadow-sm"
                styles={{ body: { padding: '16px 24px' } }}
                title={<span className="text-sm font-medium text-slate-600">附件列表</span>}
                extra={
                  <Space size={8}>
                    {/* 需求变更申请按钮：执行阶段且 PM 且当前没有待审/通过的申请 */}
                    {current.can_submit_change_request && !isProjectLocked && (
                      <Button size="small" onClick={() => setChangeReqModal(true)}>
                        申請需求變更
                      </Button>
                    )}
                    {/* 变更申请状态提示 */}
                    {current.change_request_status === 1 && (
                      <Tag color="processing">需求變更審核中</Tag>
                    )}
                    {current.has_approved_change_request && (
                      <Tag color="success">變更已批准</Tag>
                    )}
                    {current.can_manage_files && (
                      <Upload
                        showUploadList={false}
                        beforeUpload={(file) => {
                          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
                          const LEGACY = { doc: '.docx', ppt: '.pptx', xls: '.xlsx' } as Record<string, string>
                          if (LEGACY[ext]) {
                            showToast.error(`不支持 .${ext} 格式，請另存為 ${LEGACY[ext]} 後再上傳`)
                            return false
                          }
                          setUploadModal({
                            open: true,
                            file,
                            category: defaultCategoryByStatus(current.status),
                          })
                          return false
                        }}
                        accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.yaml,.yml,.csv,.html,.htm"
                        disabled={uploading}
                      >
                        <Button
                          type="primary"
                          icon={<PlusIcon className="w-4 h-4" />}
                          loading={uploading}
                          size="small"
                        >
                          上傳附件
                        </Button>
                      </Upload>
                    )}
                  </Space>
                }
              >
                {/* 分類篩選 */}
                <div className="flex gap-2 mb-3 flex-wrap items-center">
                  {[{ value: 'all', label: `全部 (${files.length})`, locked: false },
                    ...FILE_CATEGORIES.map(c => ({
                      value: c.value,
                      label: `${c.label} (${files.filter(f => f.file_category === c.value).length})`,
                      locked: !canUploadCategory(c.value),
                    }))
                  ].map(tab => (
                    <button
                      key={tab.value}
                      onClick={() => setFileCategoryFilter(tab.value)}
                      className="px-3 py-1 rounded text-xs border transition-colors flex items-center gap-1"
                      style={{
                        background: fileCategoryFilter === tab.value ? '#2563eb' : '#f8fafc',
                        color: fileCategoryFilter === tab.value ? '#fff' : '#64748b',
                        borderColor: fileCategoryFilter === tab.value ? '#2563eb' : '#e2e8f0',
                        fontWeight: fileCategoryFilter === tab.value ? 600 : 400,
                      }}
                    >
                      {tab.locked && <span title="已鎖定，不可新增">🔒</span>}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 附件列表 */}
                {filesLoading ? (
                  <Spin />
                ) : files.length === 0 ? (
                  <Empty description="暫無附件" />
                ) : (
                  <Table
                    rowKey="id"
                    dataSource={files.filter(f => fileCategoryFilter === 'all' || f.file_category === fileCategoryFilter)}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: '文件名',
                        dataIndex: 'file_nm',
                        render: (name: string, record) => {
                          const ext = record.file_ext.toLowerCase()
                          const canPreview = PREVIEWABLE.has(ext)
                          return (
                            <div className="flex items-center gap-2">
                              {canPreview ? (
                                <Button type="link" style={{ padding: 0 }}
                                  onClick={() => setPreviewFile(record)}>
                                  {name}
                                </Button>
                              ) : (
                                <span className="text-slate-700 text-sm">{name}</span>
                              )}
                            </div>
                          )
                        },
                      },
                      {
                        title: '分類',
                        dataIndex: 'file_category',
                        width: 90,
                        render: (v: string) => {
                          const cat = FILE_CATEGORIES.find(c => c.value === v)
                          return <Tag color={cat?.color} style={{ fontSize: 11 }}>{cat?.label ?? '其他'}</Tag>
                        },
                      },
                      {
                        title: '類型',
                        dataIndex: 'file_ext',
                        width: 65,
                        render: (v: string) => <Tag style={{ fontSize: 11 }}>{v.toUpperCase()}</Tag>,
                      },
                      {
                        title: '大小',
                        dataIndex: 'file_size',
                        width: 85,
                        render: (v: number) => {
                          if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
                          if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`
                          return `${v} B`
                        },
                      },
                      { title: '上傳人', dataIndex: 'uploader', width: 90 },
                      { title: '上傳時間', dataIndex: 'created_at', width: 140 },
                      {
                        title: '操作',
                        width: 90,
                        render: (_: unknown, record) => (
                          <Space size={0}>
                            <Tooltip title="下載">
                              <a href={projectApi.getFileDownloadUrl(id!, record.id)}
                                target="_blank" rel="noreferrer">
                                <Button type="text" size="small"
                                  icon={<EyeIcon className="w-4 h-4" />} />
                              </a>
                            </Tooltip>
                            {current.can_manage_files && canDeleteCategory(record.file_category) && (
                              <Popconfirm
                                title="確認刪除此附件？"
                                onConfirm={() => handleDeleteFile(record.id)}
                                okText="確認" cancelText="取消"
                              >
                                <Tooltip title="刪除">
                                  <Button type="text" size="small" danger
                                    icon={<TrashIcon className="w-4 h-4" />} />
                                </Tooltip>
                              </Popconfirm>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* 附件預覽 Modal */}
      {/* Upload Modal */}
      <Modal
        title="上傳附件"
        open={uploadModal.open}
        onCancel={() => setUploadModal({ open: false, file: null, category: 'other' })}
        onOk={async () => {
          if (uploadModal.file) {
            await handleUploadFile(uploadModal.file, uploadModal.category)
          }
          setUploadModal({ open: false, file: null, category: 'other' })
        }}
        okText="確認上傳"
        cancelText="取消"
        confirmLoading={uploading}
        width={420}
        destroyOnHidden
      >
        <div className="mt-4 mb-2 flex flex-col gap-4">
          <div>
            <div className="text-sm text-slate-500 mb-1">文件</div>
            <div className="text-slate-800 text-sm font-medium truncate">{uploadModal.file?.name}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-2">文件分類</div>
            <div className="flex flex-wrap gap-2">
              {FILE_CATEGORIES.map(c => {
                const locked = !canUploadCategory(c.value)
                return (
                  <Tooltip
                    key={c.value}
                    title={locked ? '當前狀態已鎖定，需通過需求變更審批後方可上傳' : ''}
                  >
                    <button
                      disabled={locked}
                      onClick={() => !locked && setUploadModal(m => ({ ...m, category: c.value }))}
                      className="px-4 py-1.5 rounded-full text-sm border transition-colors"
                      style={{
                        background: locked ? '#f1f5f9' : uploadModal.category === c.value ? c.color : '#f8fafc',
                        color: locked ? '#cbd5e1' : uploadModal.category === c.value ? '#fff' : '#64748b',
                        borderColor: locked ? '#e2e8f0' : uploadModal.category === c.value ? c.color : '#e2e8f0',
                        fontWeight: uploadModal.category === c.value ? 600 : 400,
                        cursor: locked ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {locked ? '🔒 ' : ''}{c.label}
                    </button>
                  </Tooltip>
                )
              })}
            </div>
            <div className="text-xs text-slate-400 mt-2">
              {uploadModal.category === 'requirement' && '適用：草稿階段整理的需求説明、用戶故事等文件'}
              {uploadModal.category === 'design' && '適用：系統架構、技術方案、UI 設計等規劃文件'}
              {uploadModal.category === 'progress' && '適用：執行過程中的進度匯報、週報等文件'}
              {uploadModal.category === 'other' && '其他類型文件'}
            </div>
          </div>
        </div>
      </Modal>

      {/* 需求變更申請 Modal */}
      <Modal
        title="申請需求變更"
        open={changeReqModal}
        onCancel={() => { setChangeReqModal(false); changeReqForm.resetFields() }}
        onOk={() => changeReqForm.submit()}
        okText="提交申請"
        cancelText="取消"
        confirmLoading={changeReqSaving}
        width={480}
        destroyOnHidden
      >
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          審批通過後，可在本專案補充需求文件與規劃設計文件，但不可刪除原始文件。
        </div>
        <Form form={changeReqForm} layout="vertical" onFinish={handleSubmitChangeRequest}>
          <Form.Item name="reviewer" label="審核人" rules={[{ required: true, message: '請填寫審核人工號' }]}>
            <Select mode="tags" placeholder="輸入審核人工號，按 Enter 確認" />
          </Form.Item>
          <Form.Item name="description" label="變更原因" rules={[{ required: true, message: '請說明變更原因' }]}>
            <Input.TextArea rows={4} placeholder="說明本次需求變更的原因及需要補充的文件..." />
          </Form.Item>
        </Form>
      </Modal>

      <FilePreviewModal
        file={previewFile}
        projectId={id ?? ''}
        onClose={() => setPreviewFile(null)}
      />

      {/* Add Function Modal */}
      <Modal title="新增功能任務" open={showAddFunc}
        onCancel={() => { setShowAddFunc(false); funcForm.resetFields(); setAddFuncPersons([]); setAddFuncSearchKw(''); setAddFuncSearchRes(null) }}
        footer={null} width={540} destroyOnHidden>
        <Form form={funcForm} layout="vertical" onFinish={handleAddFunction} className="mt-4">
          <Form.Item name="function_nm" label="功能名稱" rules={[{ required: true }]}>
            <Input placeholder="請輸入功能名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
            </Form.Item>
            <Form.Item name="group1" label="任務分組" rules={[{ required: true }]}>
              <AutoComplete
                options={groupAutoOptions}
                placeholder="選擇或輸入分組名稱"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
            <Form.Item name="expected_end_date"   label="預計結束"><Input type="date" /></Form.Item>
          </div>

          {/* 負責人 picker */}
          <div className="mb-4">
            <div className="text-sm font-medium text-slate-700 mb-1.5">
              負責人
              {addFuncPersons.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">（已選 {addFuncPersons.length} 人）</span>
              )}
            </div>
            <Input
              ref={addFuncSearchRef}
              placeholder="輸入工號，自動搜索"
              value={addFuncSearchKw}
              onChange={(e) => setAddFuncSearchKw(e.target.value)}
              suffix={<Spin size="small" style={{ opacity: addFuncSearching ? 1 : 0 }} />}
              className="mb-2"
            />
            {addFuncSearchRes === false && (
              <div className="text-xs text-red-400 mb-2">找不到該工號，請確認後重試</div>
            )}
            {typeof addFuncSearchRes === 'object' && addFuncSearchRes !== null && (
              <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-2">
                <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {(addFuncSearchRes as UserProfile).name?.[0]?.toUpperCase()}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-700">{(addFuncSearchRes as UserProfile).name}</span>
                  <span className="text-xs text-slate-400 ml-1.5">{(addFuncSearchRes as UserProfile).work_no} · {(addFuncSearchRes as UserProfile).department}</span>
                </div>
                <Button
                  size="small" type="primary" style={{ background: '#2563eb' }}
                  disabled={addFuncPersons.some((p) => p.work_no === (addFuncSearchRes as UserProfile).work_no)}
                  onClick={() => {
                    const person = addFuncSearchRes as UserProfile
                    if (!addFuncPersons.some((p) => p.work_no === person.work_no)) {
                      setAddFuncPersons((prev) => [...prev, person])
                    }
                    setAddFuncSearchKw(''); setAddFuncSearchRes(null)
                  }}
                >
                  {addFuncPersons.some((p) => p.work_no === (addFuncSearchRes as UserProfile).work_no) ? '已加入' : '加入'}
                </Button>
              </div>
            )}
            {addFuncPersons.length > 0 && (
              <div className="space-y-1.5">
                {addFuncPersons.map((p, i) => (
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
                      onClick={() => setAddFuncPersons((prev) => prev.filter((x) => x.work_no !== p.work_no))}
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Form.Item name="describe" label="功能描述">
            <Input.TextArea rows={3} placeholder="請描述功能需求" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowAddFunc(false); funcForm.resetFields(); setAddFuncPersons([]); setAddFuncSearchKw(''); setAddFuncSearchRes(null) }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={addFuncLoading} style={{ background: '#2563eb' }}>新增</Button>
          </div>
        </Form>
      </Modal>

      {/* Function Detail Drawer */}
      {selectedFid && id && (
        <FunctionDetailDrawer projectId={id} functionId={selectedFid}
          open={!!selectedFid} onClose={() => setSelectedFid(null)}
          onRefresh={() => loadFunctions(id)}
          isProjectPm={isPm && [3, 10].includes(current?.status ?? 0) && !isProjectLocked}
          projectStatus={current?.status}
          projectPm={current?.project_pm} />
      )}

      <DutyDetailDrawer
        open={!!selectedDutyId}
        dutyId={selectedDutyId}
        onClose={() => {
          setSelectedDutyId(null)
          if (id) dutyApi.listByProject(id).then((res) => setProjectDuties(Array.isArray(res.content) ? res.content : [])).catch(() => {})
        }}
      />

      {/* 編輯專案 Modal */}
      <Modal title="編輯專案" open={showEdit} onCancel={() => setShowEdit(false)}
        footer={null} width={600} destroyOnHidden>
        <Form form={editForm} layout="vertical" onFinish={handleEditSave} className="mt-4">
          <Form.Item name="project_nm" label="專案名稱" rules={[{ required: true }]} className="col-span-2">
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="department" label="部門" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="project_pm" label="專案PM（工號）" rules={[{ required: true }]} normalize={(v) => (v || '').toLowerCase()}>
              <Input />
            </Form.Item>
            <Form.Item name="product_pm" label="産品PM（工號）" normalize={(v) => (v || '').toLowerCase()}>
              <Input placeholder="（可空，預設與建立人相同）" />
            </Form.Item>
            <Form.Item name="group_id" label="專案分組" rules={[{ required: true, message: '請選擇專案分組' }]}>
              <Select
                options={groups.map((g) => ({ value: g.id, label: g.group_nm }))}
                placeholder="請選擇分組"
                popupRender={canManageGroups ? (menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '8px 0' }} />
                    <Space style={{ padding: '0 8px 8px' }}>
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup() } }}
                        placeholder="輸入新分組名稱"
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                      <Button type="text" icon={<span>+</span>} loading={creatingGroup}
                        onClick={handleCreateGroup} disabled={!newGroupName.trim()} size="small">
                        新建分組
                      </Button>
                    </Space>
                  </>
                ) : undefined}
              />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成日期"
              getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              getValueFromEvent={(date) => date ? date.format('YYYY-MM-DD') : ''}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="code_url" label="代碼庫地址" className="col-span-2">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="benefit_amount" label="預估效益金額">
              <InputNumber
                style={{ width: '100%' }} placeholder="預估節省/產生的金額"
                min={0} suffix="元/年"
              />
            </Form.Item>
            <Form.Item name="expected_benefit" label="效益說明">
              <Input.TextArea rows={2} placeholder="例：預計減少人工作業30%，每年節省約50萬元" />
            </Form.Item>
          </div>
          <Form.Item name="describe" label="專案描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowEdit(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={editSaving} style={{ background: '#2563eb' }}>保存</Button>
          </div>
        </Form>
      </Modal>

      {/* 快速設定任務負責人 Modal */}
      <Modal
        title="設定任務負責人"
        open={!!quickResponsible}
        onCancel={() => setQuickResponsible(null)}
        onOk={handleQuickSetResponsible}
        okText="確認儲存"
        confirmLoading={quickSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={440}
        destroyOnHidden
      >
        <div className="py-3 space-y-4">
          {/* 搜尋區 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">透過工號搜尋人員</div>
            <Input
              ref={respSearchRef}
              value={respSearchKw}
              onChange={(e) => setRespSearchKw(e.target.value)}
              placeholder="輸入工號，自動搜索（如：EMP001）"
              suffix={respSearching ? <Spin size="small" /> : null}
              autoFocus
            />

            {/* 搜尋結果 */}
            {respSearchResult === false && (
              <div className="mt-2 text-xs text-red-500 flex items-center gap-1">
                <XMarkIcon className="w-3.5 h-3.5" />查無此工號，請確認後重試
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
                  disabled={quickResponsible?.persons.some((p) => p.work_no === (respSearchResult as UserProfile).work_no)}
                  onClick={() => {
                    const person = respSearchResult as UserProfile
                    if (!quickResponsible?.persons.some((p) => p.work_no === person.work_no)) {
                      setQuickResponsible((prev) => prev ? { ...prev, persons: [...prev.persons, person] } : null)
                    }
                    setRespSearchKw(''); setRespSearchResult(null)
                  }}
                >
                  {quickResponsible?.persons.some((p) => p.work_no === (respSearchResult as UserProfile).work_no) ? '已加入' : '加入'}
                </Button>
              </div>
            )}
          </div>

          {/* 已選人員列表 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              已選負責人
              {quickResponsible && quickResponsible.persons.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">（共 {quickResponsible.persons.length} 人，儲存後生效）</span>
              )}
            </div>
            {respPreloading ? (
              <div className="flex items-center justify-center py-5 text-slate-400 text-xs gap-2"><Spin size="small" />載入中…</div>
            ) : !quickResponsible || quickResponsible.persons.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg py-5 text-center text-slate-400 text-xs">尚未加入任何負責人</div>
            ) : (
              <div className="space-y-1.5">
                {quickResponsible.persons.map((p, i) => (
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
                      onClick={() => setQuickResponsible((prev) => prev ? { ...prev, persons: prev.persons.filter((x) => x.work_no !== p.work_no) } : null)}
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

      {/* 任務編輯 Modal */}
      <Modal
        title="編輯功能任務"
        open={!!editFunctionId}
        onCancel={() => setEditFunctionId(null)}
        onOk={() => funcEditForm.submit()}
        okText="儲存"
        confirmLoading={funcEditSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={520}
        destroyOnHidden
      >
        {!funcEditData ? (
          <div className="flex items-center justify-center py-12"><Spin /></div>
        ) : (
          <Form form={funcEditForm} layout="vertical" onFinish={handleFuncEditSave} className="mt-2">
            <Form.Item name="function_nm" label="功能名稱" rules={[{ required: true, message: '請輸入功能名稱' }]}>
              <Input />
            </Form.Item>
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="priority" label="優先級" rules={[{ required: true }]}>
                <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
              </Form.Item>
              <Form.Item name="group1" label="任務分組" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
              <Form.Item name="expected_end_date" label="預計完成"><Input type="date" /></Form.Item>
            </div>
            <Form.Item name="describe" label="功能描述">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 設定專案PM Modal */}
      <Modal
        title="設定專案PM"
        open={showSetPm}
        onCancel={() => setShowSetPm(false)}
        onOk={handleSetProjectPm}
        okText="確認設定"
        confirmLoading={setPmSaving}
        width={400}
        destroyOnHidden
      >
        <div className="py-3 space-y-3">
          <div className="text-sm text-slate-500">
            立案審核通過後，專案PM尚未設定。請輸入專案PM的工號，設定後由專案PM負責提交規劃審核。
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1.5">專案PM 工號</div>
            <Input
              value={setPmValue}
              onChange={(e) => setSetPmValue(e.target.value.toLowerCase())}
              placeholder="請輸入工號"
              onPressEnter={handleSetProjectPm}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 提交審核 Modal */}
      <Modal
        title={
          isCompletionSubmit ? '提交完結申請' :
          current.status === 1 ? '提交立案審核' :
          current.status === 3 ? '提交規劃審核' :
          '提交排程審核'
        }
        open={showSubmit} onCancel={() => setShowSubmit(false)}
        footer={null} width={520} destroyOnHidden>
        <div className="mt-4 space-y-4">
          {/* 審核流程說明 */}
          <div className="text-xs text-slate-400">審核人將依列表順序逐一審核（OA流程），可拖動或上下移動調整順序。</div>

          {/* 審核人列表 */}
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">審核流程</div>
            {supervisorsLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : submitReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                尚未添加審核人，請搜尋並加入
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {submitReviewers.map((r, i) => (
                  <div key={r.work_no}
                    className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    {/* 順序標號 */}
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">
                      {i + 1}
                    </div>
                    {/* 用戶信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}
                      </div>
                    </div>
                    {/* 上下移動 + 刪除 */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0}
                        onClick={() => moveReviewer(i, -1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === submitReviewers.length - 1}
                        onClick={() => moveReviewer(i, 1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === submitReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      <Button size="small" type="text" danger
                        icon={<TrashIcon className="w-3.5 h-3.5" />}
                        onClick={() => removeReviewer(r.work_no)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 搜尋加簽 */}
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">加簽審核人</div>
            <div className="relative">
              <Input
                placeholder="輸入姓名或工號搜尋"
                value={reviewerSearch}
                onChange={(e) => handleSearchReviewer(e.target.value)}
                prefix={searchLoading ? <Spin size="small" /> : undefined}
                allowClear
              />
              {searchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {searchResults.map((u) => {
                    const already = submitReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => !already && addReviewer(u)}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                          {u.name.charAt(0)}
                        </div>
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
            <Button onClick={() => setShowSubmit(false)}>取消</Button>
            <Button type="primary" loading={submitSaving}
              disabled={submitReviewers.length === 0}
              style={{ background: isCompletionSubmit ? '#059669' : '#2563eb' }}
              onClick={handleSubmitReview}>
              {isCompletionSubmit ? '提交完結申請' : '提交審核'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProjectDetailPage
