import React, { useEffect, useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import FilePreviewModal from './FilePreviewModal'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Tabs, Descriptions, Button, Tag, Progress, Spin, Empty, Table,
  Space, Tooltip, Popconfirm, Modal, Form, Input, Select, Steps, Avatar,
  Timeline, Card, Segmented, Collapse, AutoComplete, DatePicker, InputNumber, Divider, Upload, Switch,
} from 'antd'
import type { InputRef } from 'antd'
import { PencilSquareIcon as EditIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon, XMarkIcon, LockClosedIcon,
  CodeBracketIcon, UserCircleIcon, FolderIcon, ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { fetchProjectThunk, clearCurrent, fetchProjectGroupsThunk } from './projectSlice'
import { fetchDepartmentsThunk } from '@/features/user/userSlice'
import { projectApi, requirementApi } from '@/api/project.api'
import { tokenStorage } from '@/api/httpClient'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import { userApi } from '@/api/user.api'
import { ProjectFunction, Milestone, ProjectFile, UserProfile, Requirement } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP, benefitUnitLabel, formatGroupName, STAGE_GROUP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import FunctionDetailDrawer from './FunctionDetailDrawer'
import GanttChart from './GanttChart'
import MilestoneTab from './MilestoneTab'
import RichTextEditor from '@/components/common/RichTextEditor'
import RichTextContent from '@/components/common/RichTextContent'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import DateInput from '@/components/common/DateInput'

// ─── Office Preview Sub-components ────────────────────────────────────────────


const PRIORITY_VALUES = [1, 2, 3, 4]

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

// ─── Status Steps ─────────────────────────────────────────────────────────────
const STATUS_STEP_STATUSES = [
  [1], [2], [3], [4], [10], [11], [5], [6], [7],
]

const getStepIndex = (status: number) => {
  const idx = STATUS_STEP_STATUSES.findIndex((s) => s.includes(status))
  return idx >= 0 ? idx : 0
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
  const { t } = useTranslation()
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { current, isLoading, groups } = useAppSelector((s) => s.project)
  const { departments } = useAppSelector((s) => s.user)
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const { isAdmin, isSupervisor } = useAppSelector((s) => s.auth)
  const toName = useWorkNoToName()
  const withToken = (url: string) => { const tk = tokenStorage.get(); return tk ? `${url}?token=${tk}` : url }

  // Computed i18n helpers
  const PRIORITY_OPTIONS = PRIORITY_VALUES.map((v) => ({ value: v, label: t(`status.priority.${v}`) }))
  const STATUS_STEPS = [
    t('projectDetail.step.draft'), t('projectDetail.step.initReview'), t('projectDetail.step.planning'),
    t('projectDetail.step.planReview'), t('projectDetail.step.scheduling'), t('projectDetail.step.schedReview'),
    t('projectDetail.step.executing'), t('projectDetail.step.completionReview'), t('projectDetail.step.completed'),
  ]
  const FILE_CATEGORIES = [
    { value: 'requirement', label: t('projectDetail.fileCategory.requirement'), color: '#2563eb' },
    { value: 'design',      label: t('projectDetail.fileCategory.design'), color: '#7c3aed' },
    { value: 'progress',    label: t('projectDetail.fileCategory.progress'), color: '#059669' },
    { value: 'other',       label: t('projectDetail.fileCategory.other'), color: '#64748b' },
  ]
  const isPm = (current?.project_pm?.toLowerCase() ?? '') === workNo.toLowerCase() && !!workNo
  // 完結審核中，除系統管理員外任何人不得操作
  const isProjectLocked = current?.status === 6 && !isAdmin
  const canManageGroups = isAdmin || isSupervisor

  const [functions,          setFunctions]          = useState<ProjectFunction[]>([])
  const [funcView,           setFuncView]           = useState<'all' | 'mine'>('all')
  const [funcGroupMode,      setFuncGroupMode]      = useState<'flat' | 'grouped' | 'by_req'>('flat')
  const [funcLoading,        setFuncLoading]        = useState(false)
  const [funcPage,           setFuncPage]           = useState(1)
  const [funcPageSize,       setFuncPageSize]       = useState(100)
  const [funcTotal,          setFuncTotal]          = useState(0)
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

  // ── Tab 控制 ──────────────────────────────────────────────────────────────
  const [activeTab,          setActiveTab]          = useState(() => {
    const tab = searchParams.get('tab')
    if (tab) return tab
    if (searchParams.get('req') || searchParams.get('req_id')) return 'requirements'
    return 'info'
  })
  const [expandedReqKeys,    setExpandedReqKeys]    = useState<string[]>(() => {
    const r = searchParams.get('req') || searchParams.get('req_id')
    return r ? [r] : []
  })

  // ── 需求管理 ──────────────────────────────────────────────────────────────
  const [requirements,       setRequirements]       = useState<Requirement[]>([])
  const [reqLoading,         setReqLoading]         = useState(false)
  const [showAddReq,         setShowAddReq]         = useState(false)
  const [reqSaving,          setReqSaving]          = useState(false)
  const [editReq,            setEditReq]            = useState<Requirement | null>(null)
  const [reqForm]                                   = Form.useForm()
  const [showReqReview,          setShowReqReview]          = useState(false)
  const [reviewReqId,            setReviewReqId]            = useState<string | null>(null)
  const [reqReviewSaving,        setReqReviewSaving]        = useState(false)
  const [reqPreviewFile,         setReqPreviewFile]         = useState<import('@/types/api.types').FileInfo | null>(null)
  const [reqUploading,           setReqUploading]           = useState(false)
  const [showReqShelve,          setShowReqShelve]          = useState(false)
  const [shelveReqId,            setShelveReqId]            = useState<string | null>(null)
  const [reqShelveSaving,        setReqShelveSaving]        = useState(false)
  const [shelveReason,           setShelveReason]           = useState('')
  const [reqUserOptions,         setReqUserOptions]         = useState<{ value: string; label: string }[]>([])
  const [selectedReqIds,         setSelectedReqIds]         = useState<string[]>([])
  const [showBatchReview,        setShowBatchReview]        = useState(false)
  const [batchReviewSaving,      setBatchReviewSaving]      = useState(false)
  // Shared reviewer chain state for both single & batch req review modals
  const [reqModalReviewers,      setReqModalReviewers]      = useState<UserProfile[]>([])
  const [reqModalReviewersLoading, setReqModalReviewersLoading] = useState(false)
  const [reqModalSearch,         setReqModalSearch]         = useState('')
  const [reqModalSearchResults,  setReqModalSearchResults]  = useState<UserProfile[]>([])
  const [reqModalSearchLoading,  setReqModalSearchLoading]  = useState(false)

  // ── 编辑专案 ──────────────────────────────────────────────────────────────
  const [showEdit,        setShowEdit]        = useState(false)
  const [editSaving,      setEditSaving]      = useState(false)
  const [editForm]                            = Form.useForm()
  const [newGroupName,    setNewGroupName]    = useState('')
  const [creatingGroup,   setCreatingGroup]   = useState(false)
  const [newDeptName,     setNewDeptName]     = useState('')
  const [creatingDept,    setCreatingDept]    = useState(false)
  const [pmOptions,       setPmOptions]       = useState<{ value: string; label: string }[]>([])
  const [pmSearching,     setPmSearching]     = useState(false)
  const pmTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const [editExpandOpen,  setEditExpandOpen]  = useState(false)
  const [editExpandDraft, setEditExpandDraft] = useState('')

  // ── 新增功能 ────────────────────────────────────────────────────────────────
  const [funcModalUserOptions, setFuncModalUserOptions] = useState<{ value: string; label: string }[]>([])
  const [addFuncExpandOpen,  setAddFuncExpandOpen]  = useState(false)
  const [addFuncExpandDraft, setAddFuncExpandDraft] = useState('')

  // ── 編輯功能任務描述展開 ────────────────────────────────────────────────────
  const [funcEditExpandOpen,  setFuncEditExpandOpen]  = useState(false)
  const [funcEditExpandDraft, setFuncEditExpandDraft] = useState('')

  // ── 快速設定任務負責人 ─────────────────────────────────────────────────────
  const [quickResponsible,   setQuickResponsible]   = useState<{ fid: string; persons: UserProfile[] } | null>(null)
  const [quickSaving,        setQuickSaving]         = useState(false)
  const [respSearchKw,       setRespSearchKw]        = useState('')
  const [respSearchResults,  setRespSearchResults]   = useState<UserProfile[]>([])
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
  const [defaultReviewerWnos, setDefaultReviewerWnos] = useState<Set<string>>(new Set()) // 默认主管，至少保留一个

  // ── 執行階段草稿任務審核 ────────────────────────────────────────────────────
  const [selectedDraftFuncIds,    setSelectedDraftFuncIds]    = useState<string[]>([])
  const [showDraftReview,         setShowDraftReview]         = useState(false)
  const [draftReviewSaving,       setDraftReviewSaving]       = useState(false)
  const [draftReviewers,          setDraftReviewers]          = useState<UserProfile[]>([])
  const [draftReviewersLoading,   setDraftReviewersLoading]   = useState(false)
  const [draftReviewSearch,       setDraftReviewSearch]       = useState('')
  const [draftReviewSearchResults, setDraftReviewSearchResults] = useState<UserProfile[]>([])
  const [draftReviewSearchLoading, setDraftReviewSearchLoading] = useState(false)

  useEffect(() => {
    if (id) {
      dispatch(fetchProjectThunk(id))
      loadFunctions(id)
      loadDynamics(id)
      loadMilestones(id)
      loadFiles(id)
      loadRequirements(id)
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

  const loadRequirements = async (pid: string) => {
    setReqLoading(true)
    try {
      const res = await requirementApi.list(pid)
      setRequirements(Array.isArray(res.content) ? (res.content as Requirement[]) : [])
    } catch { /* global */ }
    finally { setReqLoading(false) }
  }

  const handleSaveRequirement = async (values: Record<string, unknown>) => {
    if (!id) return
    setReqSaving(true)
    try {
      if (editReq) {
        await requirementApi.update(id, editReq.id, values as Parameters<typeof requirementApi.update>[2])
        showToast.success(t('projectDetail.reqUpdated'))
      } else {
        await requirementApi.create(id, values as unknown as Parameters<typeof requirementApi.create>[1])
        showToast.success(t('projectDetail.reqCreated'))
      }
      setShowAddReq(false)
      setEditReq(null)
      reqForm.resetFields()
      loadRequirements(id)
      loadFunctions(id, funcPage, funcPageSize)
    } catch { /* global */ }
    finally { setReqSaving(false) }
  }

  const handleDeleteReq = async (reqId: string) => {
    if (!id) return
    try {
      await requirementApi.delete(id, reqId)
      showToast.success(t('projectDetail.reqDeleted'))
      loadRequirements(id)
      loadFiles(id)
    } catch { /* global */ }
  }

  const handleSubmitReqReview = async () => {
    if (!id || !reviewReqId || reqModalReviewers.length === 0) return
    setReqReviewSaving(true)
    try {
      await requirementApi.submitReview(id, reviewReqId, reqModalReviewers.map((r) => r.work_no))
      showToast.success(t('projectDetail.reviewSubmitted'))
      setShowReqReview(false)
      setReviewReqId(null)
      loadRequirements(id)
    } catch { /* global */ }
    finally { setReqReviewSaving(false) }
  }

  const openReqReviewModal = async (reqId: string) => {
    setReviewReqId(reqId)
    setReqModalReviewers([])
    setReqModalSearch('')
    setReqModalSearchResults([])
    setShowReqReview(true)
    setReqModalReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      setReqModalReviewers(list)
    } catch { /* ignore */ }
    finally { setReqModalReviewersLoading(false) }
  }

  const openBatchReviewModal = async () => {
    setReqModalReviewers([])
    setReqModalSearch('')
    setReqModalSearchResults([])
    setShowBatchReview(true)
    setReqModalReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      setReqModalReviewers(list)
    } catch { /* ignore */ }
    finally { setReqModalReviewersLoading(false) }
  }

  const addReqReviewer = (user: UserProfile) => {
    if (reqModalReviewers.some((r) => r.work_no === user.work_no)) return
    setReqModalReviewers((prev) => [...prev, user])
    setReqModalSearch('')
    setReqModalSearchResults([])
  }

  const removeReqReviewer = (wn: string) => {
    setReqModalReviewers((prev) => prev.filter((r) => r.work_no !== wn))
  }

  const moveReqReviewer = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= reqModalReviewers.length) return
    setReqModalReviewers((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
  }

  const handleSearchReqReviewer = async (keyword: string) => {
    setReqModalSearch(keyword)
    if (!keyword.trim()) { setReqModalSearchResults([]); return }
    setReqModalSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setReqModalSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setReqModalSearchLoading(false) }
  }

  const handleBatchSubmitReview = async () => {
    if (!id || selectedReqIds.length === 0 || reqModalReviewers.length === 0) return
    setBatchReviewSaving(true)
    try {
      await requirementApi.batchSubmitReview(id, selectedReqIds, reqModalReviewers.map((r) => r.work_no))
      showToast.success(t('projectDetail.batchReviewSubmitted', { count: selectedReqIds.length }))
      setShowBatchReview(false)
      setSelectedReqIds([])
      loadRequirements(id)
    } catch { /* global */ }
    finally { setBatchReviewSaving(false) }
  }

  const openDraftReviewModal = async () => {
    setDraftReviewers([])
    setDefaultReviewerWnos(new Set())
    setDraftReviewSearch('')
    setDraftReviewSearchResults([])
    setShowDraftReview(true)
    setDraftReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      setDraftReviewers(list)
      setDefaultReviewerWnos(new Set(list.map((u) => u.work_no)))
    } catch { /* ignore */ }
    finally { setDraftReviewersLoading(false) }
  }

  const addDraftReviewer = (user: UserProfile) => {
    if (draftReviewers.some((r) => r.work_no === user.work_no)) return
    setDraftReviewers((prev) => [...prev, user])
    setDraftReviewSearch('')
    setDraftReviewSearchResults([])
  }

  const removeDraftReviewer = (wn: string) => {
    setDraftReviewers((prev) => prev.filter((r) => r.work_no !== wn))
  }

  const moveDraftReviewer = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= draftReviewers.length) return
    setDraftReviewers((prev) => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]]
      return arr
    })
  }

  const handleSearchDraftReviewer = async (keyword: string) => {
    setDraftReviewSearch(keyword)
    if (!keyword.trim()) { setDraftReviewSearchResults([]); return }
    setDraftReviewSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setDraftReviewSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setDraftReviewSearchLoading(false) }
  }

  const handleSubmitDraftReview = async () => {
    if (!id || selectedDraftFuncIds.length === 0 || draftReviewers.length === 0) return
    setDraftReviewSaving(true)
    try {
      await projectApi.submitTaskAdditionReview(id, selectedDraftFuncIds, draftReviewers.map((r) => r.work_no))
      showToast.success(t('projectDetail.draftReviewSubmitted', { count: selectedDraftFuncIds.length }))
      setShowDraftReview(false)
      setSelectedDraftFuncIds([])
      if (id) loadFunctions(id)
    } catch { /* global */ }
    finally { setDraftReviewSaving(false) }
  }

  const handleSubmitReqShelve = async () => {
    if (!id || !shelveReqId || !shelveReason.trim()) return
    setReqShelveSaving(true)
    try {
      await requirementApi.submitShelve(id, shelveReqId, shelveReason)
      showToast.success(t('projectDetail.shelveSuccess'))
      setShowReqShelve(false)
      setShelveReqId(null)
      setShelveReason('')
      loadRequirements(id)
    } catch { /* global */ }
    finally { setReqShelveSaving(false) }
  }

  const handleUploadFile = async (file: File, category: string) => {
    if (!id) return false
    setUploading(true)
    try {
      await projectApi.uploadFile(id, file, category)
      showToast.success(t('projectDetail.uploadSuccess'))
      loadFiles(id)
    } catch { showToast.error(t('projectDetail.uploadFailed')) }
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

  // FILE_CATEGORIES is now computed at the top of the component

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
      showToast.success(t('common.deleteSuccess'))
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch { showToast.error(t('common.deleteFailed')) }
  }

  const handleSubmitChangeRequest = async (values: { reviewer: string[]; description: string }) => {
    if (!id) return
    setChangeReqSaving(true)
    try {
      await projectApi.submitChangeRequest(id, values.reviewer, values.description)
      showToast.success(t('projectDetail.changeReqSubmitted'))
      setChangeReqModal(false)
      changeReqForm.resetFields()
      dispatch(fetchProjectThunk(id))  // 刷新专案状态
    } catch { showToast.error(t('common.submitFailed')) }
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
        function_nm:    values.function_nm as string,
        describe:       values.describe as string | undefined,
        responsible:    (values.responsible as string[] | undefined)?.length ? values.responsible as string[] : undefined,
        priority:       values.priority as number,
        group1:         values.group1 as string,
        expected_start_date:  values.expected_start_date as string | undefined,
        expected_end_date:    values.expected_end_date as string | undefined,
        requirement_id: values.requirement_id as string | undefined,
      })
      showToast.success(t('projectDetail.funcAddSuccess'))
      setShowAddFunc(false)
      funcForm.resetFields()
      loadFunctions(id)
    } catch { /* global */ }
    finally { setAddFuncLoading(false) }
  }

  const handleDeleteFunction = async (fid: string) => {
    if (!id) return
    try {
      await projectApi.deleteFunction(id, fid)
      showToast.success(t('projectDetail.funcDeleteSuccess')); loadFunctions(id)
    } catch { /* global */ }
  }

  const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const handleCreateDept = async () => {
    const nm = newDeptName.trim()
    if (!nm) return
    setCreatingDept(true)
    try {
      await userApi.createDepartment(nm)
      await dispatch(fetchDepartmentsThunk())
      editForm.setFieldValue('department', nm)
      setNewDeptName('')
      showToast.success(t('project.deptCreated', { name: nm }))
    } catch {
      showToast.error(t('project.deptCreateFailed'))
    } finally {
      setCreatingDept(false)
    }
  }

  const handlePmSearch = (keyword: string) => {
    clearTimeout(pmTimerRef.current)
    if (!keyword.trim()) { setPmOptions([]); return }
    setPmSearching(true)
    pmTimerRef.current = setTimeout(async () => {
      try {
        const res = await userApi.list({ keyword, page: 1, size: 20 })
        const list = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
        setPmOptions(list.map((u) => ({ value: u.work_no, label: `${u.name}（${u.work_no}）` })))
      } catch { setPmOptions([]) }
      finally  { setPmSearching(false) }
    }, 300)
  }

  const handleOpenExpandEdit = () => {
    const v = editForm.getFieldValue('describe') ?? ''
    const html = isHtml(v) ? v : v.trim() ? `<p>${v.replace(/\n/g, '</p><p>')}</p>` : ''
    setEditExpandDraft(html)
    setEditExpandOpen(true)
  }

  const handleOpenAddFuncExpand = () => {
    const v = funcForm.getFieldValue('describe') ?? ''
    const html = isHtml(v) ? v : v.trim() ? `<p>${v.replace(/\n/g, '</p><p>')}</p>` : ''
    setAddFuncExpandDraft(html)
    setAddFuncExpandOpen(true)
  }

  const handleOpenFuncEditExpand = () => {
    const v = funcEditForm.getFieldValue('describe') ?? ''
    const html = isHtml(v) ? v : v.trim() ? `<p>${v.replace(/\n/g, '</p><p>')}</p>` : ''
    setFuncEditExpandDraft(html)
    setFuncEditExpandOpen(true)
  }

  const handleConfirmExpandEdit = () => {
    editForm.setFieldValue('describe', editExpandDraft)
    setEditExpandOpen(false)
  }

  const handleEditOpen = () => {
    if (!current) return
    dispatch(fetchProjectGroupsThunk())
    dispatch(fetchDepartmentsThunk())
    // Pre-populate pmOptions with current PM values so labels display correctly
    const initOpts: { value: string; label: string }[] = []
    if (current.project_pm) {
      const nm = toName(current.project_pm)
      initOpts.push({ value: current.project_pm, label: nm !== current.project_pm ? `${nm}（${current.project_pm}）` : current.project_pm })
    }
    if (current.product_pm && current.product_pm !== current.project_pm) {
      const nm = toName(current.product_pm)
      initOpts.push({ value: current.product_pm, label: nm !== current.product_pm ? `${nm}（${current.product_pm}）` : current.product_pm })
    }
    setPmOptions(initOpts)
    editForm.setFieldsValue({
      project_nm:        current.project_nm,
      department:        current.department,
      project_pm:        current.project_pm,
      product_pm:        current.product_pm,
      priority:          current.priority,
      group_id:          current.group_id,
      expected_end_date: current.expected_end_date,
      code_url:          current.code_url,
      expected_benefit:       current.expected_benefit,
      benefit_amount:         current.benefit_amount,
      benefit_unit:           current.benefit_unit ?? '元/年',
      region:            (current as unknown as { region?: string }).region ?? '',
      campus:            (current as unknown as { campus?: string }).campus ?? '',
      process:           (current as unknown as { process?: string }).process ?? '',
      factory:           (current as unknown as { factory?: string }).factory ?? '',
      describe:          current.describe,
    })
    setNewGroupName('')
    setNewDeptName('')
    setEditExpandDraft('')
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
      showToast.success(t('project.groupCreated', { name: nm }))
    } catch {
      showToast.error(t('project.groupCreateFailed'))
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleEditSave = async (values: Record<string, unknown>) => {
    if (!id) return
    setEditSaving(true)
    try {
      await projectApi.update(id, values as Parameters<typeof projectApi.update>[1])
      showToast.success(t('projectDetail.projectUpdated'))
      setShowEdit(false)
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setEditSaving(false) }
  }

  const handleRespSearch = async (kw: string) => {
    const trimmed = kw.trim()
    if (trimmed.length < 1) { setRespSearchResults([]); return }
    setRespSearching(true); setRespSearchResults([])
    try {
      const res = await userApi.list({ keyword: trimmed, size: 10 })
      setRespSearchResults(((res.content as { data_list?: UserProfile[] }).data_list) ?? [])
    } catch { setRespSearchResults([]) }
    finally { setRespSearching(false) }
  }

  useEffect(() => {
    if (respSearchKw.trim().length < 1) { setRespSearchResults([]); return }
    const t = setTimeout(() => handleRespSearch(respSearchKw), 400)
    return () => clearTimeout(t)
  }, [respSearchKw])

  const handleQuickSetResponsible = async () => {
    if (!id || !quickResponsible) return
    setQuickSaving(true)
    try {
      await projectApi.updateFunction(id, quickResponsible.fid, {
        responsible: quickResponsible.persons.map((p) => p.work_no),
      })
      showToast.success(t('projectDetail.responsibleUpdated'))
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
      showToast.success(t('projectDetail.taskUpdated'))
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
      showToast.success(t('projectDetail.pmSet'))
      setShowSetPm(false)
      setSetPmValue('')
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setSetPmSaving(false) }
  }

  const handleOpenSubmitModal = async () => {
    setIsCompletionSubmit(false)
    setSubmitReviewers([])
    setDefaultReviewerWnos(new Set())
    setReviewerSearch('')
    setSearchResults([])
    setShowSubmit(true)
    setSupervisorsLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo)
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      if (list.length > 0) {
        setSubmitReviewers(list)
        setDefaultReviewerWnos(new Set(list.map((u) => u.work_no)))
      }
    } catch { /* ignore */ }
    finally { setSupervisorsLoading(false) }
  }

  const handleOpenCompletionModal = async () => {
    setIsCompletionSubmit(true)
    setSubmitReviewers([])
    setDefaultReviewerWnos(new Set())
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
      if (reviewers.length > 0) {
        setSubmitReviewers(reviewers)
        // 只有主管是不可全删的默认审核人，产品PM可以删除
        setDefaultReviewerWnos(new Set(supList.map((u) => u.work_no)))
      }
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
    // 默认主管至少保留一个
    if (defaultReviewerWnos.has(wn)) {
      const remainingDefaults = submitReviewers.filter((r) => defaultReviewerWnos.has(r.work_no) && r.work_no !== wn)
      if (remainingDefaults.length === 0) return // 最后一个默认主管不可删除
    }
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
      showToast.success(isCompletionSubmit ? t('projectDetail.completionSubmitted') : t('projectDetail.reviewSubmitted'))
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

  // Group-related computed data
  const existingGroups = useMemo(
    () => Array.from(new Set(functions.map((f) => f.group1).filter((g) => g && g !== STAGE_GROUP))),
    [functions],
  )
  const groupAutoOptions = useMemo(
    () => existingGroups.map((g) => ({ value: g, label: g })),
    [existingGroups],
  )
  const groupedFunctions = useMemo(() => {
    const map = new Map<string, ProjectFunction[]>()
    displayedFunctions.forEach((f) => {
      const g = formatGroupName(f.group1) || f.group1 || t('common.ungrouped')
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

  const groupedByRequirement = useMemo(() => {
    const map = new Map<string, { reqNm: string; expectedEndDate: string; items: ProjectFunction[] }>()
    displayedFunctions.forEach((f) => {
      const key = f.requirement_id || '__none__'
      if (!map.has(key)) {
        const req = f.requirement_id ? requirements.find((r) => r.id === f.requirement_id) : undefined
        map.set(key, { reqNm: req ? req.req_nm : t('projectDetail.noLinkedReq'), expectedEndDate: req?.expected_end_date ?? '', items: [] })
      }
      map.get(key)!.items.push(f)
    })
    return [...map.entries()]
      .sort(([a, av], [b, bv]) => {
        if (a === '__none__') return 1
        if (b === '__none__') return -1
        // sort by requirement expected_end_date ascending; no date → last
        const da = av.expectedEndDate, db = bv.expectedEndDate
        if (!da && !db) return 0
        if (!da) return 1
        if (!db) return -1
        return da < db ? -1 : da > db ? 1 : 0
      })
      .map(([key, { reqNm, expectedEndDate, items }]) => {
        const groupMap = new Map<string, ProjectFunction[]>()
        items.forEach((f) => {
          const g = formatGroupName(f.group1) || f.group1 || t('common.ungrouped')
          if (!groupMap.has(g)) groupMap.set(g, [])
          groupMap.get(g)!.push(f)
        })
        const subGroups = [...groupMap.entries()].map(([gName, gItems]) => ({
          name: gName,
          items: gItems,
          count: gItems.length,
          avgProgress: gItems.length ? Math.round(gItems.reduce((s, f) => s + (f.progress ?? 0), 0) / gItems.length) : 0,
          overdueCount: gItems.filter((f) => f.expected_end_date && new Date(f.expected_end_date) < new Date() && f.status !== 4).length,
        }))
        return {
          key,
          reqNm,
          expectedEndDate,
          subGroups,
          count: items.length,
          avgProgress: items.length ? Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length) : 0,
          overdueCount: items.filter((f) => f.expected_end_date && new Date(f.expected_end_date) < new Date() && f.status !== 4).length,
        }
      })
  }, [displayedFunctions, requirements])

  const rawFuncColumnsGrouped: ColumnsType<ProjectFunction> = [
    {
      title: t('projectDetail.colFuncName'), dataIndex: 'function_nm', width: 220, ellipsis: true,
      render: (name: string, r) => {
        const req = r.requirement_id ? requirements.find((x) => x.id === r.requirement_id) : null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[r.priority] }} />
            <div style={{ minWidth: 0 }}>
              <Button type="link" style={{ padding: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} onClick={() => setSelectedFid(r.id)}>{name}</Button>
              {req && <div style={{ fontSize: 10, color: '#6366f1', marginTop: 1, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('projectDetail.reqLabel')}: {req.req_nm}</div>}
            </div>
          </div>
        )
      },
    },
    {
      title: t('common.status'), dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = FUNCTION_STATUS_MAP[v]
        return s ? <div className="flex items-center gap-1.5"><span className="status-dot" style={{ background: s.dot }} /><span className="text-sm">{s.label}</span></div> : v
      },
    },
    {
      title: t('common.priority'), dataIndex: 'priority', width: 80,
      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
    },
    {
      title: t('common.progress'), dataIndex: 'progress', width: 140,
      render: (v: number, r: ProjectFunction) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor={r.status === 4 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    {
      title: t('projectDetail.colResponsible'), dataIndex: 'responsible', width: 150,
      render: (v: string[], record) => {
        const isStage = record.group1 === STAGE_GROUP
        // 阶段任务：PM 在任何非完结阶段都可设定负责人；普通任务：PM 在规划/执行/排程阶段
        const ispm = isPm && record.status !== 4 && record.status !== 3 && !isProjectLocked && (isStage || [3, 5, 10].includes(current?.status ?? 0))
        const openPicker = async () => {
          setRespSearchKw(''); setRespSearchResults([])
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
              <span className="text-xs text-slate-600">{toName(v[0])}{v.length > 1 ? ` ${t('common.andMore', { count: v.length })}` : ''}</span>
              {ispm && (
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 border-0 outline-none bg-transparent p-0 cursor-pointer" onClick={openPicker} title={t('projectDetail.editResponsible')}>
                  <PencilSquareIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )
        }
        if (!ispm) return <span className="text-slate-300 text-xs">{t('common.notAssigned')}</span>
        return (
          <button
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-blue-500 hover:bg-blue-50 px-2 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-blue-300 transition-colors"
            onClick={openPicker}
          >
            <PlusIcon className="w-3 h-3" />{t('projectDetail.assignResponsible')}
          </button>
        )
      },
    },
    {
      title: t('common.expectedStartDate'), dataIndex: 'expected_start_date', width: 110,
      render: (v: string, record) => {
        if (!v) {
          const canSet = isPm && record.status !== 0 && record.status !== 4 && record.status !== 9
          if (canSet) {
            return (
              <DateInput
                value=""
                placeholder={t('projectDetail.clickToSetDate')}
                onChange={async (d) => {
                  if (!d || !current) return
                  try {
                    await projectApi.updateFunction(current.id, record.id, { expected_start_date: d })
                    showToast.success(t('common.saveSuccess'))
                    if (id) loadFunctions(id)
                  } catch { /* interceptor */ }
                }}
              />
            )
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
        return <span className="text-xs">{v}</span>
      },
    },
    {
      title: t('common.expectedEndDate'), dataIndex: 'expected_end_date', width: 110,
      render: (v: string, record) => {
        if (!v) {
          // PM 可在任务非草稿、非完结时设定日期（仅一次）
          const canSet = isPm && record.status !== 0 && record.status !== 4 && record.status !== 9
          if (canSet) {
            return (
              <DateInput
                value=""
                placeholder={t('projectDetail.clickToSetDate')}
                onChange={async (d) => {
                  if (!d || !current) return
                  try {
                    await projectApi.updateFunction(current.id, record.id, { expected_end_date: d })
                    showToast.success(t('common.saveSuccess'))
                    if (id) loadFunctions(id)
                  } catch { /* interceptor */ }
                }}
              />
            )
          }
          return <span className="text-slate-300 text-xs">—</span>
        }
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
      title: t('common.actualEndDate'), dataIndex: 'end_time', width: 110,
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
      title: t('common.operation'), key: 'action', width: isPm ? 110 : 80, fixed: 'right',
      render: (_: unknown, record) => {
        const isDraft = record.status === 0
        const canModifyTask = [3, 10].includes(current?.status ?? 0) || isDraft
        const isStage = record.group1 === STAGE_GROUP
        return (
          <Space size={0}>
            <Tooltip title={t('common.view')}><Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(record.id)} /></Tooltip>
            {isPm && canModifyTask && !isStage && (
              <Tooltip title={t('common.edit')}><Button icon={<EditIcon className="w-4 h-4" />} size="small" type="text" onClick={() => handleOpenFuncEdit(record.id)} /></Tooltip>
            )}
            {canModifyTask && !isStage && (
              <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteFunction(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
                <Tooltip title={t('common.delete')}><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  const rawFuncColumnsFlat: ColumnsType<ProjectFunction> = [
    rawFuncColumnsGrouped[0], // 功能名稱
    { title: t('projectDetail.colGroup'), dataIndex: 'group1', width: 100, render: (v: string) => <Tag style={{ fontSize: 10 }}>{formatGroupName(v) || v || t('common.ungrouped')}</Tag> },
    ...rawFuncColumnsGrouped.slice(1), // 狀態, 優先級, 進度, 負責人, 預計完成, 實際完成, 操作
  ]

  const rawFileColumns: ColumnsType<ProjectFile> = [
    {
      title: t('projectDetail.colFileName'),
      dataIndex: 'file_nm',
      render: (name: string, record) => {
        const ext = record.file_ext.toLowerCase()
        const canPreview = PREVIEWABLE.has(ext)
        const isReqFile = record.source === 'requirement_attachment'
        return (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              {canPreview ? (
                <Button type="link" style={{ padding: 0 }}
                  onClick={() => {
                    if (isReqFile && record.req_id) {
                      setReqPreviewFile({ name, url: withToken(requirementApi.getFilePreviewUrl(id!, record.req_id, record.id)) })
                    } else {
                      setPreviewFile(record)
                    }
                  }}>
                  {name}
                </Button>
              ) : (
                <span className="text-slate-700 text-sm">{name}</span>
              )}
            </div>
            {isReqFile && record.req_nm && (
              <span className="text-[11px] text-slate-400">{t('projectDetail.fromReq')}：{record.req_nm}</span>
            )}
          </div>
        )
      },
    },
    {
      title: t('projectDetail.colCategory'),
      dataIndex: 'file_category',
      width: 90,
      render: (v: string) => {
        const cat = FILE_CATEGORIES.find(c => c.value === v)
        return <Tag color={cat?.color} style={{ fontSize: 11 }}>{cat?.label ?? t('projectDetail.fileCategory.other')}</Tag>
      },
    },
    {
      title: t('common.type'),
      dataIndex: 'file_ext',
      width: 65,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t('projectDetail.colSize'),
      dataIndex: 'file_size',
      width: 85,
      render: (v: number) => {
        if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
        if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`
        return `${v} B`
      },
    },
    { title: t('projectDetail.colUploader'), dataIndex: 'uploader', width: 90 },
    { title: t('projectDetail.colUploadTime'), dataIndex: 'created_at', width: 140 },
    {
      title: t('common.operation'),
      width: 90,
      render: (_: unknown, record) => {
        const isReqFile = record.source === 'requirement_attachment'
        const downloadUrl = isReqFile && record.req_id
          ? withToken(requirementApi.getFileDownloadUrl(id!, record.req_id, record.id))
          : projectApi.getFileDownloadUrl(id!, record.id)
        return (
        <Space size={0}>
          <Tooltip title={t('common.download')}>
            <a href={downloadUrl}
              target="_blank" rel="noreferrer">
              <Button type="text" size="small"
                icon={<EyeIcon className="w-4 h-4" />} />
            </a>
          </Tooltip>
          {!isReqFile && current?.can_manage_files && canDeleteCategory(record.file_category) && (
            <Popconfirm
              title={t('projectDetail.confirmDeleteAttachment')}
              onConfirm={() => handleDeleteFile(record.id)}
              okText={t('common.confirm')} cancelText={t('common.cancel')}
            >
              <Tooltip title={t('common.delete')}>
                <Button type="text" size="small" danger
                  icon={<TrashIcon className="w-4 h-4" />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
        )
      },
    },
  ]

  const { mergeColumns: funcColumnsGrouped } = useResizableColumns(rawFuncColumnsGrouped)
  const { mergeColumns: funcColumnsFlat }    = useResizableColumns(rawFuncColumnsFlat)
  const { mergeColumns: fileColumns }        = useResizableColumns(rawFileColumns)

  // rowSelection for draft tasks — per-table, merges selections across sub-tables
  const makeDraftRowSelection = React.useCallback((tableItems: ProjectFunction[]) => {
    if (!isPm || current?.status !== 5) return undefined
    if (!tableItems.some((f) => f.status === 0)) return undefined
    const tableIds = new Set(tableItems.map((f) => f.id))
    return {
      selectedRowKeys: selectedDraftFuncIds.filter((id) => tableIds.has(id)),
      onChange: (keys: React.Key[]) => {
        setSelectedDraftFuncIds((prev) => [
          ...prev.filter((id) => !tableIds.has(id)),
          ...(keys as string[]),
        ])
      },
      getCheckboxProps: (f: ProjectFunction) => ({ disabled: f.status !== 0 }),
    }
  }, [isPm, current?.status, selectedDraftFuncIds])

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
  if (!current)  return <Empty description={t('projectDetail.projectNotFound')} className="mt-20" />

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
                <UserCircleIcon className="w-3.5 h-3.5" /> {t('projectDetail.productLabel')}：{toName(current.product_pm)}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <UserCircleIcon className="w-3.5 h-3.5" /> {t('projectDetail.projectLabel')}：{toName(current.project_pm)}
            </div>
            {current.code_url && (
              <a href={current.code_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <CodeBracketIcon className="w-3.5 h-3.5" /> {t('projectDetail.codeRepo')}
              </a>
            )}
            {((current as unknown as { region?: string }).region || (current as unknown as { campus?: string }).campus || (current as unknown as { process?: string }).process || (current as unknown as { factory?: string }).factory) && (
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                {(current as unknown as { region?: string }).region && <span>{t('project.region')}：{(current as unknown as { region?: string }).region}</span>}
                {(current as unknown as { campus?: string }).campus && <span>{t('project.campus')}：{(current as unknown as { campus?: string }).campus}</span>}
                {(current as unknown as { process?: string }).process && <span>{t('project.process')}：{(current as unknown as { process?: string }).process}</span>}
                {(current as unknown as { factory?: string }).factory && <span>{t('project.factory')}：{(current as unknown as { factory?: string }).factory}</span>}
              </div>
            )}
          </div>
        </div>
        {/* 操作按鈕 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 草稿且有權限才可編輯（産品PM或其直屬上級） */}
          {current.status === 1 && current.can_edit && (
            <Button icon={<EditIcon className="w-4 h-4" />} onClick={handleEditOpen}>
              {t('common.edit')}
            </Button>
          )}
          {/* 提交立案審核：僅草稿階段且當前用戶是産品PM */}
          {current.status === 1 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={handleOpenSubmitModal}>
              {t('projectDetail.submitInitReview')}
            </Button>
          )}
          {/* 設定專案PM：規劃中且尚未設定PM，由創建人/産品PM操作 */}
          {current.status === 3 && current.can_set_project_pm && (
            <Button onClick={() => { setSetPmValue(''); setShowSetPm(true) }}>
              {t('projectDetail.setProjectPm')}
            </Button>
          )}
          {/* 提交規劃審核：規劃中且當前用戶是專案PM */}
          {current.status === 3 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={handleOpenSubmitModal}>
              {t('projectDetail.submitPlanReview')}
            </Button>
          )}
          {/* 提交排程審核：排程安排階段且當前用戶是專案PM */}
          {current.status === 10 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#7c3aed' }} onClick={handleOpenSubmitModal}>
              {t('projectDetail.submitSchedReview')}
            </Button>
          )}
          {/* 提交完結申請：執行中 + 進度100% + 專案PM */}
          {current.status === 5 && isPm && current.progress === 100 && (
            <Button type="primary" style={{ background: '#059669' }} onClick={handleOpenCompletionModal}>
              {t('projectDetail.submitCompletion')}
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
            title: <span style={{ fontSize: 12 }}>{s}</span>,
            status: i < stepIndex ? 'finish' : i === stepIndex ? 'process' : 'wait',
          }))}
        />
        {current.progress != null && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-slate-400 w-14">{t('projectDetail.overallProgress')}</span>
            <Progress percent={current.progress} size="small" strokeColor={current.status === 7 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" style={{ flex: 1 }} />
          </div>
        )}
      </Card>

      {/* 排程安排提示 Banner */}
      {current.status === 10 && (
        <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-5 py-4 flex items-start gap-3">
          <span className="text-2xl flex-shrink-0">📋</span>
          <div>
            <div className="font-semibold text-violet-800 text-sm mb-1">{t('projectDetail.schedulingPhaseTitle')}</div>
            <div className="text-xs text-violet-600 leading-relaxed">
              {t('projectDetail.schedulingPhaseDesc')}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        type="card"
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key)
          if (key === 'requirements' && id && !reqLoading) {
            loadRequirements(id)
          }
        }}
        items={[
          {
            key: 'info',
            label: t('projectDetail.tabInfo'),
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 24 } }}>
                <Descriptions bordered column={2} size="small"
                  styles={{ label: { background: '#f8fafc', color: '#64748b', fontWeight: 500, fontSize: 12 }, content: { fontSize: 13 } }}
                >
                  <Descriptions.Item label={t('common.priority')}>
                    {(() => { const p = PRIORITY_MAP[current.priority]; return p ? <Tag color={p.color}>{p.label}</Tag> : current.priority })()}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('projectDetail.creator')}>{toName(current.creator)}</Descriptions.Item>
                  <Descriptions.Item label={t('project.productPm')}>{toName(current.product_pm)}</Descriptions.Item>
                  <Descriptions.Item label={t('project.projectPm')}>{toName(current.project_pm)}</Descriptions.Item>
                  <Descriptions.Item label={t('common.expectedEndDate')}>{current.expected_end_date ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label={t('common.createdAt')}>{current.created_at}</Descriptions.Item>
                  <Descriptions.Item label={t('common.description')} span={2}><RichTextContent html={current.describe} /></Descriptions.Item>
                  <Descriptions.Item label={t('projectDetail.estimatedBenefit')} span={2}>
                    {current.benefit_amount != null
                      ? <>{current.benefit_amount} {benefitUnitLabel(current.benefit_unit ?? "元/年")}{current.expected_benefit ? <span className="text-slate-400 ml-2 text-xs">（{current.expected_benefit}）</span> : null}</>
                      : current.expected_benefit || '—'
                    }
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'requirements',
            label: `${t('projectDetail.tabReq')} (${requirements.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">{t('projectDetail.reqList')}</span>
                    {selectedReqIds.length > 0 && current?.status === 5 && (
                      <Button size="small" type="primary" ghost
                        onClick={() => openBatchReviewModal()}>
                        {t('projectDetail.batchSubmitReview', { count: selectedReqIds.length })}
                      </Button>
                    )}
                  </div>
                  {workNo.toLowerCase() === (current?.product_pm ?? '').toLowerCase() &&
                    [1, 5].includes(current?.status ?? 0) && !isProjectLocked && (
                    <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                      size="small" style={{ background: '#2563eb' }}
                      onClick={() => {
                        setEditReq(null)
                        reqForm.resetFields()
                        reqForm.setFieldValue('is_addon', (current?.status ?? 1) !== 1)
                        setShowAddReq(true)
                        if (reqUserOptions.length === 0) {
                          userApi.list({ page: 1, size: 2000 }).then((res) => {
                            const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
                            setReqUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name}（${u.work_no}）` })))
                          }).catch(() => {})
                        }
                      }}>
                      {t('projectDetail.addReq')}
                    </Button>
                  )}
                </div>
                <Table
                  rowKey="id"
                  loading={reqLoading}
                  dataSource={requirements}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  pagination={false}
                  rowSelection={current?.status === 5 && workNo.toLowerCase() === (current?.product_pm ?? '').toLowerCase() ? {
                    selectedRowKeys: selectedReqIds,
                    onChange: (keys) => setSelectedReqIds(keys as string[]),
                    getCheckboxProps: (req: Requirement) => ({ disabled: req.status !== 0 }),
                  } : undefined}
                  locale={{ emptyText: <Empty description={t('projectDetail.noReq')} className="py-8" /> }}
                  expandable={{
                    expandRowByClick: true,
                    expandedRowKeys: expandedReqKeys,
                    onExpandedRowsChange: (keys) => setExpandedReqKeys(keys as string[]),
                    expandedRowRender: (req: Requirement) => (
                      <div className="bg-slate-50 px-6 py-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div className="col-span-2">
                          <span className="text-xs text-slate-400 mr-2">{t('projectDetail.reqDesc')}</span>
                          <span className="text-slate-700">{req.describe || '—'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 mr-2">{t('projectDetail.expectedComplete')}</span>
                          <span className="text-slate-700">{req.expected_end_date || '—'}</span>
                        </div>
                        {(req.expected_benefit || req.benefit_amount != null) && (
                          <div className="col-span-2">
                            <span className="text-xs text-slate-400 mr-2">{t('projectDetail.benefitDesc')}</span>
                            <span className="text-emerald-600">
                              {req.benefit_amount != null ? `${req.benefit_amount} ${benefitUnitLabel(req.benefit_unit ?? "元/年")}` : ''}
                              {req.expected_benefit ? `  ${req.expected_benefit}` : ''}
                            </span>
                            {req.is_addon && <Tag color="orange" className="ml-2 text-xs">{t('projectDetail.addonReq')}</Tag>}
                          </div>
                        )}
                        {(req.files?.length ?? 0) > 0 && (
                          <div className="col-span-2">
                            <span className="text-xs text-slate-400 mr-2">{t('projectDetail.attachments')}</span>
                            <div className="mt-1">
                              <AttachmentPreview
                                files={req.files!.map((f) => ({ ...f, url: withToken(f.file_id ? requirementApi.getFilePreviewUrl(id!, req.id, f.file_id) : f.url) }))}
                                onPreview={(f) => setReqPreviewFile(f)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ),
                  }}
                  columns={[
                    {
                      title: t('projectDetail.colReqName'), dataIndex: 'req_nm', ellipsis: true,
                      render: (name: string) => <span className="font-medium text-slate-800">{name}</span>,
                    },
                    {
                      title: t('common.status'), dataIndex: 'status', width: 100,
                      render: (v: number, r: Requirement) => {
                        const map: Record<number, [string, string]> = { 0: [t('projectDetail.reqStatus.draft'), 'default'], 1: [t('projectDetail.reqStatus.reviewing'), 'processing'], 2: [t('projectDetail.reqStatus.inProgress'), 'success'], 3: [t('projectDetail.reqStatus.rejected'), 'error'], 4: [t('projectDetail.reqStatus.completed'), 'processing'], 8: [t('projectDetail.reqStatus.shelved'), 'warning'] }
                        const [label, color] = map[v] ?? [String(v), 'default']
                        const reason = (r as unknown as { shelve_reason?: string }).shelve_reason
                        return v === 8 && reason ? (
                          <Tooltip title={<><div className="font-semibold mb-1">{t('projectDetail.shelveReasonLabel')}</div><div>{reason}</div></>}>
                            <Tag color={color} style={{ fontSize: 11, cursor: 'pointer' }}>{label}</Tag>
                          </Tooltip>
                        ) : <Tag color={color} style={{ fontSize: 11 }}>{label}</Tag>
                      },
                    },
                    {
                      title: t('common.progress'), dataIndex: 'progress', width: 140,
                      render: (v: number, r: Requirement) => (
                        <div className="flex items-center gap-2">
                          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }}
                            strokeColor={r.status === 4 ? '#2563eb' : '#16a34a'} trailColor="#f1f5f9" />
                          <span className="text-xs text-slate-400">{v ?? 0}%</span>
                        </div>
                      ),
                    },
                    {
                      title: t('common.priority'), dataIndex: 'priority', width: 72,
                      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
                    },
                    {
                      title: t('projectDetail.expectedComplete'), dataIndex: 'expected_end_date', width: 100,
                      render: (v: string) => <span className="text-xs text-slate-500">{v || '—'}</span>,
                    },
                    {
                      title: t('projectDetail.estimatedBenefit'), width: 140, ellipsis: true,
                      render: (_: unknown, req: Requirement) => req.benefit_amount != null
                        ? <span className="text-xs text-emerald-600">{req.benefit_amount} {benefitUnitLabel(req.benefit_unit ?? "元/年")}</span>
                        : <span className="text-xs text-slate-300">—</span>,
                    },
                    {
                      title: t('common.operation'), width: 148, align: 'center' as const,
                      render: (_: unknown, req: Requirement) => {
                        const isProductPm = workNo.toLowerCase() === (current?.product_pm ?? '').toLowerCase()
                        const canEdit = isProductPm && req.status === 0 && [1, 5].includes(current?.status ?? 0)
                        const canDelete = isProductPm && req.status === 0 && [1, 5].includes(current?.status ?? 0)
                        const canSubmitReview = isProductPm && req.status === 0 && current?.status === 5
                        const canShelve = isProductPm && req.status === 2
                        return (
                          <Space size={4}>
                            {canSubmitReview && (
                              <Button size="small"
                                onClick={(e) => { e.stopPropagation(); openReqReviewModal(req.id) }}>
                                {t('projectDetail.submitReview')}
                              </Button>
                            )}
                            {canEdit && (
                              <Tooltip title={t('common.edit')}>
                                <Button size="small" icon={<EditIcon className="w-3.5 h-3.5" />}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditReq(req)
                                    reqForm.setFieldsValue({
                                      req_nm:           req.req_nm,
                                      describe:         req.describe,
                                      priority:         req.priority,
                                      responsible:      req.responsible ?? [],
                                      expected_benefit: req.expected_benefit,
                                      benefit_amount:   req.benefit_amount,
                                      benefit_unit:     req.benefit_unit ?? '元/年',
                                      is_addon:         req.is_addon ?? false,
                                      create_stage_tasks: req.create_stage_tasks ?? false,
                                      expected_end_date: req.expected_end_date,
                                    })
                                    if (reqUserOptions.length === 0) {
                                      userApi.list({ page: 1, size: 2000 }).then((res) => {
                                        const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
                                        setReqUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name}（${u.work_no}）` })))
                                      }).catch(() => {})
                                    }
                                    setShowAddReq(true)
                                  }}
                                />
                              </Tooltip>
                            )}
                            {canShelve && (
                              <Button size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShelveReqId(req.id)
                                  setShelveReason('')
                                  setShowReqShelve(true)
                                }}>
                                {t('projectDetail.shelve')}
                              </Button>
                            )}
                            {isProductPm && req.status === 8 && (
                              <Popconfirm title={t('projectDetail.confirmResume')} onConfirm={async () => {
                                try {
                                  await requirementApi.update(id!, req.id, { status: 2 } as any)
                                  showToast.success(t('projectDetail.resumeSuccess'))
                                  if (id) loadRequirements(id)
                                } catch { /* global */ }
                              }} okText={t('common.confirm')} cancelText={t('common.cancel')}
                                onPopupClick={(e) => e.stopPropagation()}>
                                <Button size="small" type="primary" style={{ background: '#2563eb' }}
                                  onClick={(e) => e.stopPropagation()}>
                                  {t('projectDetail.resumeReq')}
                                </Button>
                              </Popconfirm>
                            )}
                            {canDelete && (
                              <Popconfirm title={t('projectDetail.confirmDeleteReq')} onConfirm={() => handleDeleteReq(req.id)} okText={t('common.delete')} cancelText={t('common.cancel')}
                                onPopupClick={(e) => e.stopPropagation()}>
                                <Tooltip title={t('common.delete')}>
                                  <Button size="small" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                                    onClick={(e) => e.stopPropagation()} />
                                </Tooltip>
                              </Popconfirm>
                            )}
                            {req.status === 2 && (req.progress ?? 0) >= 100 && (
                              <Popconfirm title={t('requirement.confirmComplete')} onConfirm={async () => {
                                try {
                                  await requirementApi.update(id!, req.id, { status: 4 } as any)
                                  showToast.success(t('requirement.completeSuccess'))
                                  if (id) loadRequirements(id)
                                } catch { showToast.error(t('common.error')) }
                              }} okText={t('common.confirm')} cancelText={t('common.cancel')} onPopupClick={(e) => e.stopPropagation()}>
                                <Button size="small" type="primary" style={{ background: '#16a34a', fontSize: 11 }}
                                  onClick={(e) => e.stopPropagation()}>
                                  {t('requirement.complete')}
                                </Button>
                              </Popconfirm>
                            )}
                          </Space>
                        )
                      },
                    },
                  ]}
                />
              </Card>
            ),
          },
          {
            key: 'functions',
            label: `${t('project.functions')} (${funcView === 'mine' ? myFunctions.length : funcTotal})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Segmented
                      size="small"
                      value={funcView}
                      onChange={(v) => setFuncView(v as 'all' | 'mine')}
                      options={[
                        { label: `${t('common.all')} (${funcTotal})`, value: 'all'  },
                        { label: `${t('common.mine')} (${myFunctions.length})`, value: 'mine' },
                      ]}
                    />
                    <div className="w-px h-5 bg-slate-200" />
                    <Segmented
                      size="small"
                      value={funcGroupMode}
                      onChange={(v) => setFuncGroupMode(v as 'flat' | 'grouped' | 'by_req')}
                      options={[
                        { label: t('common.byReq'), value: 'by_req'  },
                        { label: t('common.grouped'),   value: 'grouped' },
                        { label: t('common.flat'),   value: 'flat'    },
                      ]}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {isPm && current?.status === 5 && selectedDraftFuncIds.length > 0 && (
                      <Button size="small" type="primary" ghost
                        onClick={() => openDraftReviewModal()}>
                        {t('projectDetail.submitDraftReview', { count: selectedDraftFuncIds.length })}
                      </Button>
                    )}
                    {isPm && ([3, 5, 10].includes(current?.status ?? 0)) && !isProjectLocked && (
                      <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                        onClick={() => {
                          setShowAddFunc(true)
                          if (funcModalUserOptions.length === 0) {
                            userApi.list({ page: 1, size: 2000 }).then((res) => {
                              const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
                              setFuncModalUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name}（${u.work_no}）` })))
                            }).catch(() => {})
                          }
                          if (id && requirements.length === 0 && !reqLoading) {
                            loadRequirements(id)
                          }
                        }} size="small" style={{ background: '#2563eb' }}>
                        {t('projectDetail.addFunc')}
                      </Button>
                    )}
                  </div>
                </div>

                {funcGroupMode === 'flat' ? (
                  <>
                    <Table rowKey="id" columns={funcColumnsFlat} dataSource={displayedFunctions}
                      components={tableComponents}
                      loading={funcLoading} size="middle" scroll={{ x: 900 }}
                      rowSelection={makeDraftRowSelection(displayedFunctions)}
                      pagination={funcView === 'mine' ? {
                        pageSize: funcPageSize,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total) => t('projectDetail.totalItems', { count: total }),
                        onShowSizeChange: (_, size) => setFuncPageSize(size),
                      } : {
                        current: funcPage,
                        pageSize: funcPageSize,
                        total: funcTotal,
                        showSizeChanger: true,
                        pageSizeOptions: ['20', '50', '100', '200'],
                        showTotal: (total) => t('projectDetail.totalItems', { count: total }),
                        onChange: (page, size) => {
                          setFuncPageSize(size)
                          if (id) loadFunctions(id, page, size)
                        },
                      }}
                    />
                  </>
                ) : funcGroupMode === 'by_req' ? (
                  <div className="px-2 py-2">
                    {funcLoading ? (
                      <div className="flex justify-center py-8"><Spin /></div>
                    ) : groupedByRequirement.length === 0 ? (
                      <Empty description={t('projectDetail.noFuncTasks')} className="py-8" />
                    ) : (() => {
                      const reqGroups  = groupedByRequirement.filter((g) => g.key !== '__none__')
                      const noReqGroup = groupedByRequirement.find((g) => g.key === '__none__')
                      const renderSubGroups = (g: typeof groupedByRequirement[0], prefix: string) =>
                        g.subGroups.length === 1 && g.subGroups[0].name === t('common.ungrouped') ? (
                          <Table key={prefix} rowKey="id" columns={funcColumnsGrouped} dataSource={g.subGroups[0].items}
                            components={tableComponents} pagination={false} size="small" scroll={{ x: 800 }}
                            rowSelection={makeDraftRowSelection(g.subGroups[0].items)} />
                        ) : (
                          <Collapse key={prefix} defaultActiveKey={[]}
                            className="bg-transparent border-0" expandIconPosition="start" size="small">
                            {g.subGroups.map((sg) => (
                              <Collapse.Panel key={`${prefix}__${sg.name}`}
                                header={
                                  <div className="flex items-center gap-2">
                                    <FolderIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                    <span className="font-medium text-slate-600 text-xs">{sg.name}</span>
                                    <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{t('common.itemCount', { count: sg.count })}</Tag>
                                    <Progress percent={sg.avgProgress} size="small" showInfo={false}
                                      style={{ width: 60 }} strokeColor="#16a34a" trailColor="#e2e8f0" />
                                    <span className="text-xs text-slate-400">{sg.avgProgress}%</span>
                                    {sg.overdueCount > 0 && (
                                      <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{t('common.overdueCount', { count: sg.overdueCount })}</Tag>
                                    )}
                                  </div>
                                }
                              >
                                <Table rowKey="id" columns={funcColumnsGrouped} dataSource={sg.items}
                                  components={tableComponents} pagination={false} size="small" scroll={{ x: 800 }}
                                  rowSelection={makeDraftRowSelection(sg.items)} />
                              </Collapse.Panel>
                            ))}
                          </Collapse>
                        )
                      return (
                        <>
                          {reqGroups.length > 0 && (
                            <Collapse defaultActiveKey={[]}
                              className="bg-transparent border-0" expandIconPosition="start">
                              {reqGroups.map((g) => (
                                <Collapse.Panel key={g.key}
                                  header={
                                    <div className="flex items-center gap-3">
                                      <span className="font-semibold text-slate-700">{g.reqNm}</span>
                                      <Tag color="purple" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{t('common.itemCount', { count: g.count })}</Tag>
                                      {g.expectedEndDate && (
                                        <span className="text-xs text-slate-400">{t('projectDetail.expectedComplete')} {g.expectedEndDate}</span>
                                      )}
                                      <Progress percent={g.avgProgress} size="small" showInfo={false}
                                        style={{ width: 80 }} strokeColor="#16a34a" trailColor="#e2e8f0" />
                                      <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                                      {g.overdueCount > 0 && (
                                        <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{t('common.overdueCount', { count: g.overdueCount })}</Tag>
                                      )}
                                    </div>
                                  }
                                >
                                  {renderSubGroups(g, g.key)}
                                </Collapse.Panel>
                              ))}
                            </Collapse>
                          )}
                          {noReqGroup && renderSubGroups(noReqGroup, '__none__')}
                        </>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="px-2 py-2">
                    {funcLoading ? (
                      <div className="flex justify-center py-8"><Spin /></div>
                    ) : groupedFunctions.length === 0 ? (
                      <Empty description={t('projectDetail.noFuncTasks')} className="py-8" />
                    ) : (
                      <Collapse
                        defaultActiveKey={[]}
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
                                <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{t('common.itemCount', { count: g.count })}</Tag>
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
                            <Table rowKey="id" columns={funcColumnsGrouped} dataSource={g.items}
                              components={tableComponents}
                              pagination={false} size="small" scroll={{ x: 800 }}
                              rowSelection={makeDraftRowSelection(g.items)} />
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    )}
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'dynamics',
            label: t('project.members'),
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: '16px 24px' } }}>
                {dynamics.length === 0 ? (
                  <Empty description={t('projectDetail.noDynamics')} />
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
                              {note && <div className="text-xs text-slate-500 mt-0.5"><RichTextContent html={note} /></div>}
                              <div className="text-xs text-slate-300 mt-0.5">{String(d.created_at ?? '')}</div>
                            </div>
                          ),
                        }
                      })}
                    />
                    {dynamicsHasMore && (
                      <div className="flex justify-center mt-2">
                        <Button size="small" loading={dynamicsLoadingMore} onClick={loadMoreDynamics}>
                          {t('projectDetail.loadMore')}
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
            label: t('project.gantt'),
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <GanttChart functions={functions} milestones={milestones} requirements={requirements} />
              </Card>
            ),
          },
          {
            key: 'milestones',
            label: `${t('project.milestones')} (${milestones.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 20 } }}>
                {id && <MilestoneTab
                  projectId={id}
                  functions={functions}
                  requirements={requirements}
                  canManage={!isProjectLocked && (isPm || (current?.product_pm?.toLowerCase() === workNo.toLowerCase() && !!workNo) || isSupervisor || isAdmin)}
                />}
              </Card>
            ),
          },
          {
            key: 'files',
            label: `${t('project.files')} (${files.length})`,
            children: (
              <Card
                variant="borderless"
                className="shadow-sm"
                styles={{ body: { padding: '16px 24px' } }}
                title={<span className="text-sm font-medium text-slate-600">{t('projectDetail.fileList')}</span>}
                extra={
                  <Space size={8}>
                    {/* 需求变更申请按钮：执行阶段且 PM 且当前没有待审/通过的申请 */}
                    {current.can_submit_change_request && !isProjectLocked && (
                      <Button size="small" onClick={() => setChangeReqModal(true)}>
                        {t('projectDetail.applyChangeReq')}
                      </Button>
                    )}
                    {/* 变更申请状态提示 */}
                    {current.change_request_status === 1 && (
                      <Tag color="processing">{t('projectDetail.changeReqReviewing')}</Tag>
                    )}
                    {current.has_approved_change_request && (
                      <Tag color="success">{t('projectDetail.changeReqApproved')}</Tag>
                    )}
                    {current.can_manage_files && (
                      <Upload
                        showUploadList={false}
                        beforeUpload={(file) => {
                          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
                          const LEGACY = { doc: '.docx', ppt: '.pptx', xls: '.xlsx' } as Record<string, string>
                          if (LEGACY[ext]) {
                            showToast.error(t('projectDetail.unsupportedFormat', { ext, format: LEGACY[ext] }))
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
                          {t('projectDetail.uploadAttachment')}
                        </Button>
                      </Upload>
                    )}
                  </Space>
                }
              >
                {/* 分類篩選 */}
                <div className="flex gap-2 mb-3 flex-wrap items-center">
                  {[{ value: 'all', label: `${t('common.all')} (${files.length})`, locked: false },
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
                      {tab.locked && <span title={t('projectDetail.lockedNoAdd')}>🔒</span>}
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* 附件列表 */}
                {filesLoading ? (
                  <Spin />
                ) : files.length === 0 ? (
                  <Empty description={t('projectDetail.noFiles')} />
                ) : (
                  <Table
                    rowKey="id"
                    dataSource={files.filter(f => fileCategoryFilter === 'all' || f.file_category === fileCategoryFilter)}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    pagination={false}
                    components={tableComponents}
                    columns={fileColumns}
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
        title={t('projectDetail.uploadAttachment')}
        open={uploadModal.open}
        onCancel={() => setUploadModal({ open: false, file: null, category: 'other' })}
        onOk={async () => {
          if (uploadModal.file) {
            await handleUploadFile(uploadModal.file, uploadModal.category)
          }
          setUploadModal({ open: false, file: null, category: 'other' })
        }}
        okText={t('projectDetail.confirmUpload')}
        cancelText={t('common.cancel')}
        confirmLoading={uploading}
        width={420}
        destroyOnHidden
      >
        <div className="mt-4 mb-2 flex flex-col gap-4">
          <div>
            <div className="text-sm text-slate-500 mb-1">{t('projectDetail.file')}</div>
            <div className="text-slate-800 text-sm font-medium truncate">{uploadModal.file?.name}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500 mb-2">{t('projectDetail.fileClassification')}</div>
            <div className="flex flex-wrap gap-2">
              {FILE_CATEGORIES.map(c => {
                const locked = !canUploadCategory(c.value)
                return (
                  <Tooltip
                    key={c.value}
                    title={locked ? t('projectDetail.lockedNeedChange') : ''}
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
              {uploadModal.category === 'requirement' && t('projectDetail.catHintReq')}
              {uploadModal.category === 'design' && t('projectDetail.catHintDesign')}
              {uploadModal.category === 'progress' && t('projectDetail.catHintProgress')}
              {uploadModal.category === 'other' && t('projectDetail.catHintOther')}
            </div>
          </div>
        </div>
      </Modal>

      {/* 需求變更申請 Modal */}
      <Modal
        title={t('projectDetail.applyChangeReq')}
        open={changeReqModal}
        onCancel={() => { setChangeReqModal(false); changeReqForm.resetFields() }}
        onOk={() => changeReqForm.submit()}
        okText={t('projectDetail.submitApplication')}
        cancelText={t('common.cancel')}
        confirmLoading={changeReqSaving}
        width={480}
        destroyOnHidden
      >
        <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-3 mb-4">
          {t('projectDetail.changeReqHint')}
        </div>
        <Form form={changeReqForm} layout="vertical" onFinish={handleSubmitChangeRequest}>
          <Form.Item name="reviewer" label={t('projectDetail.reviewer')} rules={[{ required: true, message: t('projectDetail.reviewerRequired') }]}>
            <Select mode="tags" placeholder={t('projectDetail.reviewerPlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('projectDetail.changeReason')} rules={[{ required: true, message: t('projectDetail.changeReasonRequired') }]}>
            <Input.TextArea rows={4} placeholder={t('projectDetail.changeReasonPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {reqPreviewFile && (
        <FilePreviewModal
          directUrl={reqPreviewFile.url}
          filename={reqPreviewFile.name}
          onClose={() => setReqPreviewFile(null)}
        />
      )}

      <FilePreviewModal
        file={previewFile}
        projectId={id ?? ''}
        onClose={() => setPreviewFile(null)}
      />

      {/* 新增/編輯需求 Modal */}
      <Modal
        title={editReq ? t('projectDetail.editReq') : t('projectDetail.addReq')}
        open={showAddReq}
        onCancel={() => { setShowAddReq(false); setEditReq(null); reqForm.resetFields() }}
        onOk={() => reqForm.submit()}
        okText={editReq ? t('common.save') : t('common.add')}
        cancelText={t('common.cancel')}
        confirmLoading={reqSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={520}
        destroyOnHidden
      >
        <Form form={reqForm} layout="vertical" onFinish={handleSaveRequirement} className="mt-4">
          <Form.Item name="req_nm" label={t('projectDetail.colReqName')} rules={[{ required: true, message: t('projectDetail.reqNameRequired') }]}>
            <Input placeholder={t('projectDetail.reqNamePlaceholder')} />
          </Form.Item>
          <Form.Item name="describe" label={t('projectDetail.reqDesc')}>
            <Input.TextArea rows={3} placeholder={t('projectDetail.reqDescPlaceholder')} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} initialValue={2} rules={[{ required: true }]}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="expected_end_date" label={t('projectDetail.expectedComplete')}>
              <DateInput/>
            </Form.Item>
          </div>
          <Form.Item name="responsible" label={t('projectDetail.colResponsible')}>
            <Select
              mode="multiple" placeholder={t('projectDetail.responsibleOptionalPlaceholder')}
              options={reqUserOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item label={t('projectDetail.benefitAmount')} style={{ marginBottom: 8 }}>
            <Form.Item name="benefit_amount" noStyle>
              <InputNumber
                style={{ width: '60%' }}
                placeholder={t('projectDetail.numberOptional')}
                addonAfter={
                  <Form.Item name="benefit_unit" noStyle initialValue="元/年">
                    <Select style={{ width: 100 }} options={[
                      { value: '元/年', label: t('project.benefitUnitMoney') },
                      { value: '人/年', label: t('project.benefitUnitPerson') },
                      { value: '工時/年', label: t('project.benefitUnitHour') },
                    ]} />
                  </Form.Item>
                }
              />
            </Form.Item>
          </Form.Item>
          <Form.Item name="expected_benefit" label={t('projectDetail.benefitDesc')}>
            <Input.TextArea rows={3} placeholder={t('projectDetail.benefitDescPlaceholder')} />
          </Form.Item>
          <Form.Item name="is_addon" label={t('projectDetail.reqType')} valuePropName="checked" initialValue={false}>
            <Switch checkedChildren={t('projectDetail.addonReq')} unCheckedChildren={t('projectDetail.initReq')} />
          </Form.Item>
          <div className="text-xs text-slate-400 -mt-3 mb-3 ml-1">{t('projectDetail.reqTypeHint')}</div>
          <Form.Item name="create_stage_tasks" valuePropName="checked" initialValue={false}>
            <Switch size="small" />
          </Form.Item>
          <div className="-mt-3 mb-3 text-xs text-slate-500">{t('system.createStageTasks')}</div>
          {/* 附件上傳（僅編輯已存在需求時顯示） */}
          {editReq && (
            <div className="mt-1">
              <div className="text-sm text-slate-600 mb-2">{t('projectDetail.attachments')}</div>
              {(editReq.files?.length ?? 0) > 0 && (
                <div className="mb-2">
                  <AttachmentPreview
                    files={editReq.files!.map((f) => ({ ...f, url: withToken(f.file_id ? requirementApi.getFilePreviewUrl(id!, editReq.id, f.file_id) : f.url) }))}
                    onPreview={(f) => setReqPreviewFile(f)}
                  />
                  <div className="flex flex-wrap gap-1 mt-1">
                    {editReq.files!.map((f) => (
                      <Popconfirm key={f.url} title={t('projectDetail.confirmDeleteAttachment')}
                        onConfirm={async () => {
                          try {
                            await requirementApi.deleteFile(id!, editReq.id, f.url)
                            setEditReq((prev) => prev ? { ...prev, files: prev.files?.filter((x) => x.url !== f.url) } : null)
                            loadRequirements(id!)
                            loadFiles(id!)
                          } catch { /* global */ }
                        }}
                        okText={t('common.delete')} cancelText={t('common.cancel')}>
                        <button className="text-xs text-red-400 hover:text-red-600 border border-red-200 bg-white rounded px-1.5 py-0.5 cursor-pointer">
                          {t('projectDetail.deleteFile', { name: f.name })}
                        </button>
                      </Popconfirm>
                    ))}
                  </div>
                </div>
              )}
              <Upload
                showUploadList={false}
                beforeUpload={async (file) => {
                  setReqUploading(true)
                  try {
                    const res = await requirementApi.uploadFile(id!, editReq.id, file)
                    const updated = (res.content as { files?: import('@/types/api.types').FileInfo[] }).files ?? []
                    setEditReq((prev) => prev ? { ...prev, files: updated } : null)
                    loadRequirements(id!)
                    loadFiles(id!)
                    showToast.success(t('projectDetail.uploadSuccess'))
                  } catch { showToast.error(t('projectDetail.uploadFailed')) }
                  finally { setReqUploading(false) }
                  return false
                }}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.zip,.rar,.txt,.md"
                disabled={reqUploading}
              >
                <Button size="small" icon={<PlusIcon className="w-3.5 h-3.5" />} loading={reqUploading}>{t('projectDetail.uploadAttachment')}</Button>
              </Upload>
            </div>
          )}
        </Form>
      </Modal>

      {/* 需求提交審核 Modal */}
      <Modal title={t('projectDetail.submitReqReview')} open={showReqReview}
        onCancel={() => { setShowReqReview(false); setReviewReqId(null) }}
        footer={null} width={520} destroyOnHidden>
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">{t('projectDetail.reviewFlowHint')}</div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.reviewFlow')}</div>
            {reqModalReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : reqModalReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">{t('projectDetail.noReviewerAdded')}</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {reqModalReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0} onClick={() => moveReqReviewer(i, -1)} style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === reqModalReviewers.length - 1} onClick={() => moveReqReviewer(i, 1)} style={{ padding: '0 4px', fontSize: 12, color: i === reqModalReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {reqModalReviewers.length <= 1 ? (
                        <span className="text-base">🔒</span>
                      ) : (
                        <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />} onClick={() => removeReqReviewer(r.work_no)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.addReviewer')}</div>
            <div className="relative">
              <Input placeholder={t('projectDetail.searchReviewerPlaceholder')} value={reqModalSearch}
                onChange={(e) => handleSearchReqReviewer(e.target.value)}
                prefix={reqModalSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {reqModalSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {reqModalSearchResults.map((u) => {
                    const already = reqModalReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => !already && addReqReviewer(u)}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('projectDetail.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowReqReview(false); setReviewReqId(null) }}>{t('common.cancel')}</Button>
            <Button type="primary" loading={reqReviewSaving} disabled={reqModalReviewers.length === 0}
              style={{ background: '#2563eb' }} onClick={handleSubmitReqReview}>{t('projectDetail.submitReview')}</Button>
          </div>
        </div>
      </Modal>

      {/* 批量提交需求審核 Modal */}
      <Modal title={t('projectDetail.batchReviewTitle', { count: selectedReqIds.length })} open={showBatchReview}
        onCancel={() => setShowBatchReview(false)}
        footer={null} width={520} destroyOnHidden>
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">{t('projectDetail.batchReviewDesc', { count: selectedReqIds.length })}</div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.reviewFlow')}</div>
            {reqModalReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : reqModalReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">{t('projectDetail.noReviewerAdded')}</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {reqModalReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0} onClick={() => moveReqReviewer(i, -1)} style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === reqModalReviewers.length - 1} onClick={() => moveReqReviewer(i, 1)} style={{ padding: '0 4px', fontSize: 12, color: i === reqModalReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {reqModalReviewers.length <= 1 ? (
                        <span className="text-base">🔒</span>
                      ) : (
                        <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />} onClick={() => removeReqReviewer(r.work_no)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.addReviewer')}</div>
            <div className="relative">
              <Input placeholder={t('projectDetail.searchReviewerPlaceholder')} value={reqModalSearch}
                onChange={(e) => handleSearchReqReviewer(e.target.value)}
                prefix={reqModalSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {reqModalSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {reqModalSearchResults.map((u) => {
                    const already = reqModalReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => !already && addReqReviewer(u)}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('projectDetail.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowBatchReview(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={batchReviewSaving} disabled={reqModalReviewers.length === 0}
              style={{ background: '#2563eb' }} onClick={handleBatchSubmitReview}>{t('projectDetail.submitReview')}</Button>
          </div>
        </div>
      </Modal>

      {/* 提交新增任務審核 Modal */}
      <Modal title={t('projectDetail.draftReviewTitle', { count: selectedDraftFuncIds.length })} open={showDraftReview}
        onCancel={() => setShowDraftReview(false)}
        footer={null} width={520} destroyOnHidden>
        <div className="mt-4 space-y-4">
          <div className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
            {t('projectDetail.draftReviewDesc', { count: selectedDraftFuncIds.length })}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.reviewFlow')}</div>
            {draftReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : draftReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">{t('projectDetail.noReviewerAdded')}</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {draftReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0} onClick={() => moveDraftReviewer(i, -1)} style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === draftReviewers.length - 1} onClick={() => moveDraftReviewer(i, 1)} style={{ padding: '0 4px', fontSize: 12, color: i === draftReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {(() => {
                        const isDefault = defaultReviewerWnos.has(r.work_no)
                        const defaultCount = draftReviewers.filter((rv) => defaultReviewerWnos.has(rv.work_no)).length
                        const isLastDefault = isDefault && defaultCount <= 1
                        return isLastDefault ? (
                          <Tooltip title={t('projectDetail.defaultReviewer')}>
                            <LockClosedIcon className="w-3.5 h-3.5 text-slate-300" />
                          </Tooltip>
                        ) : (
                          <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />} onClick={() => removeDraftReviewer(r.work_no)} />
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.addReviewer')}</div>
            <div className="relative">
              <Input placeholder={t('projectDetail.searchReviewerPlaceholder')} value={draftReviewSearch}
                onChange={(e) => handleSearchDraftReviewer(e.target.value)}
                prefix={draftReviewSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {draftReviewSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {draftReviewSearchResults.map((u) => {
                    const already = draftReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => !already && addDraftReviewer(u)}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('projectDetail.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowDraftReview(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={draftReviewSaving} disabled={draftReviewers.length === 0}
              style={{ background: '#2563eb' }} onClick={handleSubmitDraftReview}>{t('projectDetail.submitReview')}</Button>
          </div>
        </div>
      </Modal>

      {/* 需求搁置 Modal */}
      <Modal
        title={t('projectDetail.applyShelve')}
        open={showReqShelve}
        onCancel={() => { setShowReqShelve(false); setShelveReqId(null); setShelveReason('') }}
        onOk={handleSubmitReqShelve}
        okText={t('projectDetail.confirmShelve')}
        cancelText={t('common.cancel')}
        confirmLoading={reqShelveSaving}
        okButtonProps={{ disabled: !shelveReason.trim(), style: { background: '#d97706' } }}
        destroyOnHidden
      >
        <div className="mt-4 space-y-4">
          <div className="text-sm text-amber-600 bg-amber-50 rounded px-3 py-2">
            {t('projectDetail.shelveHint')}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.shelveReasonLabel')} <span className="text-red-500">*</span></div>
            <Input.TextArea
              value={shelveReason}
              onChange={(e) => setShelveReason(e.target.value)}
              rows={3}
              placeholder={t('projectDetail.shelveReasonPlaceholder')}
            />
          </div>
        </div>
      </Modal>

      {/* Add Function Modal */}
      <Modal title={t('projectDetail.addFuncTask')} open={showAddFunc}
        onCancel={() => { setShowAddFunc(false); funcForm.resetFields() }}
        footer={null} width="min(780px, 88vw)" destroyOnHidden>
        <Form form={funcForm} layout="vertical" onFinish={handleAddFunction} className="mt-4">
          <Form.Item name="function_nm" label={t('function.functionName')} rules={[{ required: true }]}>
            <Input placeholder={t('function.functionNamePlaceholder')} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]} initialValue={2}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="group1" label={t('function.taskGroupLabel')}>
              <AutoComplete
                options={groupAutoOptions}
                placeholder={t('projectDetail.groupPlaceholder')}
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                allowClear
              />
            </Form.Item>
            <Form.Item name="expected_start_date" label={t('function.expectedStartDate')}><DateInput/></Form.Item>
            <Form.Item name="expected_end_date"   label={t('function.expectedEndDate')}><DateInput/></Form.Item>
          </div>

          <Form.Item name="requirement_id" label={t('projectDetail.linkedReqOptional')}>
            <Select
              allowClear
              placeholder={reqLoading ? t('common.loading') : requirements.length === 0 ? t('projectDetail.noReq') : t('projectDetail.selectLinkedReq')}
              loading={reqLoading}
              disabled={reqLoading}
              options={requirements.filter((r) => r.status === 2 || r.status === 4).map((r) => ({ value: r.id, label: r.req_nm }))}
              notFoundContent={reqLoading ? t('common.loading') : t('projectDetail.noApprovedReq')}
            />
          </Form.Item>

          <Form.Item name="responsible" label={t('projectDetail.colResponsible')}>
            <Select
              mode="multiple"
              placeholder={t('function.assigneePlaceholder')}
              options={funcModalUserOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>

          {/* 功能描述 — 小輸入框 + 展開富文本編輯 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
            {({ getFieldValue }) => {
              const v: string = getFieldValue('describe') ?? ''
              const displayValue = isHtml(v) ? stripHtml(v) : v
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700">{t('function.funcDesc')}</span>
                    <button
                      type="button"
                      onClick={handleOpenAddFuncExpand}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
                    >
                      <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                      {t('project.expandRichText')}
                    </button>
                  </div>
                  <Input.TextArea
                    value={displayValue}
                    onChange={(e) => funcForm.setFieldValue('describe', e.target.value)}
                    rows={3}
                    placeholder={t('function.funcDescPlaceholder')}
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">{t('project.richTextApplied')}</p>
                  )}
                </div>
              )
            }}
          </Form.Item>

          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowAddFunc(false); funcForm.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={addFuncLoading} style={{ background: '#2563eb' }}>{t('common.add')}</Button>
          </div>
        </Form>
      </Modal>

      {/* 新增功能描述展開 Modal */}
      <Modal
        open={addFuncExpandOpen}
        title={t('function.funcDescModalTitle')}
        onCancel={() => setAddFuncExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAddFuncExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              funcForm.setFieldValue('describe', addFuncExpandDraft)
              setAddFuncExpandOpen(false)
            }}>{t('project.completeBtn')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={addFuncExpandDraft}
          onChange={setAddFuncExpandDraft}
          placeholder={t('function.funcDescExpandPlaceholder')}
          minHeight={480}
        />
      </Modal>

      {/* Function Detail Drawer */}
      {selectedFid && id && (
        <FunctionDetailDrawer projectId={id} functionId={selectedFid}
          open={!!selectedFid} onClose={() => setSelectedFid(null)}
          onRefresh={() => { loadFunctions(id); loadRequirements(id) }}
          isProjectPm={isPm && [3, 10].includes(current?.status ?? 0) && !isProjectLocked}
          projectStatus={current?.status}
          projectPm={current?.project_pm} />
      )}


      {/* 編輯專案 Modal */}
      <Modal title={t('projectDetail.editProject')} open={showEdit} onCancel={() => setShowEdit(false)}
        footer={null} width="min(960px, 90vw)" destroyOnHidden>
        <Form form={editForm} layout="vertical" onFinish={handleEditSave} className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="project_nm" label={t('project.projectName')} rules={[{ required: true }]} className="col-span-2">
              <Input />
            </Form.Item>

            {/* 部門 — 選擇或新增 */}
            <Form.Item name="department" label={t('project.department')} rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder={t('project.selectOrInputDept')}
                filterOption={(input, opt) =>
                  (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                }
                options={departments.map((d) => ({ value: d.name, label: d.name }))}
                popupRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '8px 0' }} />
                    <Space style={{ padding: '0 8px 8px' }}>
                      <input
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateDept() } }}
                        placeholder={t('project.newDeptPlaceholder')}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                      <Button type="text" icon={<span>+</span>} size="small"
                        loading={creatingDept} disabled={!newDeptName.trim()}
                        onClick={handleCreateDept}>
                        {t('project.addDept')}
                      </Button>
                    </Space>
                  </>
                )}
              />
            </Form.Item>

            <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>

            {/* 專案PM — 搜尋選擇 */}
            <Form.Item name="project_pm" label={t('project.projectPm')} rules={[{ required: true }]}>
              <Select
                showSearch
                placeholder={t('project.searchPmPlaceholder')}
                filterOption={false}
                onSearch={handlePmSearch}
                notFoundContent={pmSearching ? <Spin size="small" /> : t('project.userNotFound')}
                options={pmOptions}
                allowClear
              />
            </Form.Item>

            {/* 産品PM — 搜尋選擇 */}
            <Form.Item name="product_pm" label={t('project.productPm')}>
              <Select
                showSearch
                placeholder={t('project.searchPmOptionalPlaceholder')}
                filterOption={false}
                onSearch={handlePmSearch}
                notFoundContent={pmSearching ? <Spin size="small" /> : t('project.userNotFound')}
                options={pmOptions}
                allowClear
              />
            </Form.Item>

            <Form.Item name="group_id" label={t('project.projectGroup')} rules={[{ required: true, message: t('projectDetail.groupRequired') }]}>
              <Select
                options={groups.map((g) => ({ value: g.id, label: g.group_nm }))}
                placeholder={t('project.selectGroupPlaceholder')}
                popupRender={canManageGroups ? (menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '8px 0' }} />
                    <Space style={{ padding: '0 8px 8px' }}>
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup() } }}
                        placeholder={t('project.newGroupPlaceholder')}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                      <Button type="text" icon={<span>+</span>} loading={creatingGroup}
                        onClick={handleCreateGroup} disabled={!newGroupName.trim()} size="small">
                        {t('project.createGroup')}
                      </Button>
                    </Space>
                  </>
                ) : undefined}
              />
            </Form.Item>

            <Form.Item name="expected_end_date" label={t('common.expectedEndDate')}
              getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              getValueFromEvent={(date) => date ? date.format('YYYY-MM-DD') : ''}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>

            <Form.Item name="code_url" label={t('project.codeUrl')} className="col-span-2">
              <Input placeholder="https://..." />
            </Form.Item>

            <Form.Item name="region" label={t('project.region')}>
              <Input placeholder={t('project.regionPlaceholder')} />
            </Form.Item>
            <Form.Item name="campus" label={t('project.campus')}>
              <Input placeholder={t('project.campusPlaceholder')} />
            </Form.Item>
            <Form.Item name="process" label={t('project.process')}>
              <Input placeholder={t('project.processPlaceholder')} />
            </Form.Item>
            <Form.Item name="factory" label={t('project.factory')}>
              <Input placeholder={t('project.factoryPlaceholder')} />
            </Form.Item>

            <Form.Item label={t('project.benefitAmount')} style={{ marginBottom: 0 }}>
              <Form.Item name="benefit_amount" style={{ display: 'inline-block', width: '100%', marginBottom: 0 }}>
                <InputNumber
                  style={{ width: '100%' }}
                  placeholder={t('project.benefitAmountPlaceholder')}
                  min={0}
                  addonAfter={
                    <Form.Item name="benefit_unit" noStyle initialValue="元/年">
                      <Select
                        options={[
                          { value: '元/年', label: t('project.benefitUnitMoney') },
                          { value: '人/年', label: t('project.benefitUnitPerson') },
                          { value: '工時/年', label: t('project.benefitUnitHour') },
                        ]}
                        style={{ width: 80 }}
                      />
                    </Form.Item>
                  }
                />
              </Form.Item>
            </Form.Item>



            <Form.Item name="expected_benefit" label={t('project.benefitDesc')}>
              <Input.TextArea rows={2} placeholder={t('project.benefitPlaceholder')} />
            </Form.Item>

          </div>

          {/* 描述 — 小輸入框 + 展開富文本編輯 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
            {({ getFieldValue }) => {
              const v: string = getFieldValue('describe') ?? ''
              const displayValue = isHtml(v) ? stripHtml(v) : v
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700">{t('project.projectDesc')}</span>
                    <button
                      type="button"
                      onClick={handleOpenExpandEdit}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
                    >
                      <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                      {t('project.expandRichText')}
                    </button>
                  </div>
                  <Input.TextArea
                    value={displayValue}
                    onChange={(e) => editForm.setFieldValue('describe', e.target.value)}
                    rows={3}
                    placeholder={t('project.descExpandPlaceholder')}
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                  {/* Hidden Form.Item carries the value on submit */}
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">{t('project.richTextApplied')}</p>
                  )}
                </div>
              )
            }}
          </Form.Item>

          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowEdit(false)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={editSaving} style={{ background: '#2563eb' }}>{t('common.save')}</Button>
          </div>
        </Form>
      </Modal>

      {/* 描述展開編輯 Modal（編輯專案用） */}
      <Modal
        open={editExpandOpen}
        title={t('project.descModalTitle')}
        onCancel={() => setEditExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={handleConfirmExpandEdit} style={{ background: '#2563eb' }}>{t('project.completeBtn')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={editExpandDraft}
          onChange={setEditExpandDraft}
          placeholder={t('project.descPlaceholder')}
          minHeight={480}
        />
      </Modal>

      {/* 快速設定任務負責人 Modal */}
      <Modal
        title={t('projectDetail.setResponsible')}
        open={!!quickResponsible}
        onCancel={() => setQuickResponsible(null)}
        onOk={handleQuickSetResponsible}
        okText={t('projectDetail.confirmSave')}
        confirmLoading={quickSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width={440}
        destroyOnHidden
      >
        <div className="py-3 space-y-4">
          {/* 搜尋區 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">{t('projectDetail.searchPerson')}</div>
            <div className="relative">
              <Input
                ref={respSearchRef}
                value={respSearchKw}
                onChange={(e) => setRespSearchKw(e.target.value)}
                placeholder={t('projectDetail.searchPersonPlaceholder')}
                prefix={respSearching ? <Spin size="small" /> : undefined}
                allowClear autoFocus
              />
              {respSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {respSearchResults.map((u) => {
                    const already = quickResponsible?.persons.some((p) => p.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => {
                          if (already) return
                          setQuickResponsible((prev) => prev ? { ...prev, persons: [...prev.persons, u] } : null)
                          setRespSearchKw(''); setRespSearchResults([])
                        }}>
                        <Avatar size={28} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>{u.name?.[0]}</Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.work_no} · {u.department}{u.position ? ` · ${u.position}` : ''}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('projectDetail.alreadyAddedPerson')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 已選人員列表 */}
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">
              {t('projectDetail.selectedResponsible')}
              {quickResponsible && quickResponsible.persons.length > 0 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">{t('projectDetail.selectedCount', { count: quickResponsible.persons.length })}</span>
              )}
            </div>
            {respPreloading ? (
              <div className="flex items-center justify-center py-5 text-slate-400 text-xs gap-2"><Spin size="small" />{t('common.loading')}</div>
            ) : !quickResponsible || quickResponsible.persons.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg py-5 text-center text-slate-400 text-xs">{t('projectDetail.noPersonAdded')}</div>
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
        title={t('function.editTaskTitle')}
        open={!!editFunctionId}
        onCancel={() => setEditFunctionId(null)}
        onOk={() => funcEditForm.submit()}
        okText={t('common.save')}
        confirmLoading={funcEditSaving}
        okButtonProps={{ style: { background: '#2563eb' } }}
        width="min(780px, 88vw)"
        destroyOnHidden
      >
        {!funcEditData ? (
          <div className="flex items-center justify-center py-12"><Spin /></div>
        ) : (
          <Form form={funcEditForm} layout="vertical" onFinish={handleFuncEditSave} className="mt-2">
            <Form.Item name="function_nm" label={t('function.functionName')} rules={[{ required: true, message: t('function.functionNamePlaceholder') }]}>
              <Input />
            </Form.Item>
            <div className="grid grid-cols-2 gap-x-4">
              <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]}>
                <Select options={PRIORITY_OPTIONS} />
              </Form.Item>
              <Form.Item name="group1" label={t('function.taskGroupLabel')}>
                <AutoComplete
                  options={groupAutoOptions}
                  placeholder={t('projectDetail.groupPlaceholder')}
                  filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                />
              </Form.Item>
              <Form.Item name="expected_start_date" label={t('function.expectedStartDate')}><DateInput/></Form.Item>
              <Form.Item name="expected_end_date" label={t('function.expectedEndDate')}><DateInput/></Form.Item>
            </div>
            {/* 功能描述 — 小輸入框 + 展開富文本編輯 */}
            <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
              {({ getFieldValue }) => {
                const v: string = getFieldValue('describe') ?? ''
                const displayValue = isHtml(v) ? stripHtml(v) : v
                return (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-700">{t('function.funcDesc')}</span>
                      <button
                        type="button"
                        onClick={handleOpenFuncEditExpand}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
                      >
                        <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                        {t('project.expandRichText')}
                      </button>
                    </div>
                    <Input.TextArea
                      value={displayValue}
                      onChange={(e) => funcEditForm.setFieldValue('describe', e.target.value)}
                      rows={3}
                      placeholder={t('function.funcDescPlaceholder')}
                      style={{ resize: 'vertical', minHeight: 80 }}
                    />
                    <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                    {isHtml(v) && (
                      <p className="text-xs text-blue-500 mt-1">{t('project.richTextApplied')}</p>
                    )}
                  </div>
                )
              }}
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* 編輯功能描述展開 Modal */}
      <Modal
        open={funcEditExpandOpen}
        title={t('function.funcDescModalTitle')}
        onCancel={() => setFuncEditExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setFuncEditExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              funcEditForm.setFieldValue('describe', funcEditExpandDraft)
              setFuncEditExpandOpen(false)
            }}>{t('project.completeBtn')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={funcEditExpandDraft}
          onChange={setFuncEditExpandDraft}
          placeholder={t('function.funcDescExpandPlaceholder')}
          minHeight={480}
        />
      </Modal>

      {/* 設定專案PM Modal */}
      <Modal
        title={t('projectDetail.setProjectPm')}
        open={showSetPm}
        onCancel={() => setShowSetPm(false)}
        onOk={handleSetProjectPm}
        okText={t('projectDetail.confirmSet')}
        confirmLoading={setPmSaving}
        width={400}
        destroyOnHidden
      >
        <div className="py-3 space-y-3">
          <div className="text-sm text-slate-500">
            {t('projectDetail.setPmDesc')}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1.5">{t('projectDetail.pmWorkNo')}</div>
            <Input
              value={setPmValue}
              onChange={(e) => setSetPmValue(e.target.value.toLowerCase())}
              placeholder={t('projectDetail.enterWorkNo')}
              onPressEnter={handleSetProjectPm}
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* 提交審核 Modal */}
      <Modal
        title={
          isCompletionSubmit ? t('projectDetail.submitCompletion') :
          current.status === 1 ? t('projectDetail.submitInitReview') :
          current.status === 3 ? t('projectDetail.submitPlanReview') :
          t('projectDetail.submitSchedReview')
        }
        open={showSubmit} onCancel={() => setShowSubmit(false)}
        footer={null} width={520} destroyOnHidden>
        <div className="mt-4 space-y-4">
          {/* 審核流程說明 */}
          <div className="text-xs text-slate-400">{t('projectDetail.reviewFlowHint')}</div>

          {/* 審核人列表 */}
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.reviewFlow')}</div>
            {supervisorsLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : submitReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                {t('projectDetail.noReviewerAdded')}
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
                    {/* 上下移動 + 刪除（默认主管不可删除） */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0}
                        onClick={() => moveReviewer(i, -1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === submitReviewers.length - 1}
                        onClick={() => moveReviewer(i, 1)}
                        style={{ padding: '0 4px', fontSize: 12, color: i === submitReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {(() => {
                        const isDefault = defaultReviewerWnos.has(r.work_no)
                        const defaultCount = submitReviewers.filter((rv) => defaultReviewerWnos.has(rv.work_no)).length
                        const isLastDefault = isDefault && defaultCount <= 1
                        return isLastDefault ? (
                          <Tooltip title={t('projectDetail.defaultReviewer')}>
                            <span className="w-7 h-7 flex items-center justify-center text-slate-300"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" /></svg></span>
                          </Tooltip>
                        ) : (
                          <Button size="small" type="text" danger
                            icon={<TrashIcon className="w-3.5 h-3.5" />}
                            onClick={() => removeReviewer(r.work_no)} />
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 搜尋加簽 */}
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('projectDetail.addReviewer')}</div>
            <div className="relative">
              <Input
                placeholder={t('projectDetail.searchReviewerPlaceholder')}
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
                        {already && <span className="text-xs text-slate-400">{t('projectDetail.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowSubmit(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={submitSaving}
              disabled={submitReviewers.length === 0}
              style={{ background: isCompletionSubmit ? '#059669' : '#2563eb' }}
              onClick={handleSubmitReview}>
              {isCompletionSubmit ? t('projectDetail.submitCompletion') : t('projectDetail.submitReview')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProjectDetailPage
