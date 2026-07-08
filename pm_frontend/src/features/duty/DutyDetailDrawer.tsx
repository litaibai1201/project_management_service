import React, { useEffect, useState, useCallback } from 'react'
import {
  Drawer, Descriptions, Button, Tag, Progress, Spin, Empty, Avatar, Switch,
  Typography, Form, Input, InputNumber, Upload, Timeline,
  Card, Steps, Modal, Select, Popconfirm, AutoComplete, Tooltip, Divider,
} from 'antd'
import type { UploadFile } from 'antd'
import { PlusIcon, PaperClipIcon, TrashIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { userApi } from '@/api/user.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { standaloneReqApi } from '@/api/standalone_req.api'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import RichTextContent from '@/components/common/RichTextContent'
import RichTextEditor from '@/components/common/RichTextEditor'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import type { FileInfo, TemporaryDuty, UserProfile } from '@/types/api.types'
import { useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { dutyApi } from '@/api/duty.api'
import { dailyLogApi } from '@/api/daily_log.api'
import type { TaskLogEntry } from '@/api/daily_log.api'
import { tokenStorage } from '@/api/httpClient'
import { DUTY_STATUS_MAP, PRIORITY_MAP, formatGroupName } from '@/utils/status'
import { showToast } from '@/utils/toast'
// dayjs removed — no longer used directly
import DateInput from '@/components/common/DateInput'
import ProgressPreCheckModal, { checkTaskDates, type PreCheckType } from '@/components/common/ProgressPreCheckModal'

const { Text } = Typography

const DUTY_STEP_KEYS = ['status.duty.6', 'status.duty.1', 'status.duty.2', 'status.duty.3'] as const
const statusToStep = (s: number) => ({ 6: 0, 1: 1, 2: 2, 3: 3 }[s] ?? 0)
const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

interface Props {
  open: boolean
  dutyId: string | null
  onClose: () => void
  onRefresh?: () => void
}

const normalizeCooperator = (c: unknown): string[] => {
  if (!c) return []
  if (Array.isArray(c)) return c as string[]
  if (typeof c === 'string') { try { const p = JSON.parse(c); return Array.isArray(p) ? p : [c] } catch { return [c] } }
  return []
}

const DutyDetailDrawer: React.FC<Props> = ({ open, dutyId, onClose, onRefresh }) => {
  const { t } = useTranslation()
  const workNo = useAppSelector((s) => s.auth.workNo)
  const toName = useWorkNoToName()

  const [duty,       setDuty]       = useState<TemporaryDuty | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [records,    setRecords]    = useState<Record<string, unknown>[]>([])
  const [logEntries, setLogEntries] = useState<TaskLogEntry[]>([])
  const [showForm,   setShowForm]   = useState(false)
  const [isSaving,   setIsSaving]   = useState(false)
  const [isActing,   setIsActing]   = useState(false)
  const [fileList,   setFileList]   = useState<UploadFile[]>([])
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null)
  const [form]                      = Form.useForm()

  const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
  const withToken = (url: string) => { const t = tokenStorage.get(); return t ? `${url}?token=${t}` : url }
  const splitFiles = (files: { name: string; url: string; size?: number }[] | undefined) => {
    const all = (files ?? []).map((f) => ({ ...f, url: withToken(f.url) }))
    return {
      images: all.filter((f) => IMG_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? '')),
      files:  all.filter((f) => !IMG_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? '')),
    }
  }

  // 激活前補填欄位
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [activateForm]                            = Form.useForm()

  // 編輯任務
  const [showEditModal, setShowEditModal]       = useState(false)
  const [editForm]                              = Form.useForm()
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([])

  // 提交完結審核
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [reviewerOptions, setReviewerOptions] = useState<{ value: string; label: string }[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [userOptions, setUserOptions]             = useState<{ value: string; label: string }[]>([])

  // 延期
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleForm]                              = Form.useForm()
  const [isRescheduling, setIsRescheduling]           = useState(false)

  // 更新進度前置檢查
  const [preCheckType, setPreCheckType] = useState<PreCheckType>(null)

  // 進度說明展開編輯
  const [expandOpen,  setExpandOpen]  = useState(false)
  const [expandDraft, setExpandDraft] = useState('')

  // 編輯任務描述展開
  const [editDescExpandOpen,  setEditDescExpandOpen]  = useState(false)
  const [editDescExpandDraft, setEditDescExpandDraft] = useState('')
  const isHtml    = (v: string) => /<[a-z][\s\S]*>/i.test(v)
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  // 進度達100%提示
  const [show100Prompt, setShow100Prompt] = useState(false)

  // 需求任務完結確認（需求責任人資訊）
  const [reqResponsible,         setReqResponsible]         = useState<string[]>([])
  const [showReqCompleteConfirm, setShowReqCompleteConfirm] = useState(false)

  // 需求任務提交審核
  const [showReqReviewModal,        setShowReqReviewModal]        = useState(false)
  const [reqReviewers,              setReqReviewers]              = useState<UserProfile[]>([])
  const [defaultReqReviewerWnos,   setDefaultReqReviewerWnos]    = useState<Set<string>>(new Set())
  const [reqReviewersLoading,       setReqReviewersLoading]       = useState(false)
  const [reqReviewSearch,           setReqReviewSearch]           = useState('')
  const [reqReviewSearchResults,    setReqReviewSearchResults]    = useState<UserProfile[]>([])
  const [reqReviewSearchLoading,    setReqReviewSearchLoading]    = useState(false)
  const [reqReviewSaving,           setReqReviewSaving]           = useState(false)

  // 需求任務完結審核（多責任人）
  const [showCompletionReviewModal, setShowCompletionReviewModal] = useState(false)
  const [completionReviewers,       setCompletionReviewers]       = useState<UserProfile[]>([])
  const [defaultCompletionWnos,     setDefaultCompletionWnos]     = useState<Set<string>>(new Set())
  const [completionReviewSearch,    setCompletionReviewSearch]    = useState('')
  const [completionSearchResults,   setCompletionSearchResults]   = useState<UserProfile[]>([])
  const [completionSearchLoading,   setCompletionSearchLoading]   = useState(false)
  const [completionSaving,          setCompletionSaving]          = useState(false)

  // 搁置
  const [showHoldModal,   setShowHoldModal]   = useState(false)
  const [holdReason,      setHoldReason]      = useState('')
  const [holdSaving,      setHoldSaving]      = useState(false)

  useEffect(() => {
    if (!open || !dutyId) { setDuty(null); setRecords([]); return }
    setLoading(true)
    setShowForm(false)
    setFileList([])
    Promise.all([
      dutyApi.get(dutyId),
      dutyApi.getProgress(dutyId, { page: 1, size: 50 }),
      dailyLogApi.taskEntries('duty', dutyId),
    ]).then(([dutyRes, progRes, logRes]) => {
      const loadedDuty = dutyRes.content as TemporaryDuty
      setDuty(loadedDuty)
      const rawRecords = ((progRes.content as { data_list?: Record<string, unknown>[] }).data_list) ?? []
      setRecords(rawRecords.map((r) => ({ ...r, cooperator: normalizeCooperator(r.cooperator) })))
      setLogEntries(logRes.content ?? [])
      // 載入需求責任人（用於完結審核邏輯）
      if (loadedDuty.standalone_req_id) {
        standaloneReqApi.get(loadedDuty.standalone_req_id).then((reqRes) => {
          const req = reqRes.content as { responsible?: string[] }
          setReqResponsible(req.responsible ?? [])
        }).catch(() => { setReqResponsible([]) })
      } else {
        setReqResponsible([])
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [open, dutyId])

  const reloadDuty = useCallback(async () => {
    if (!dutyId) return
    const res = await dutyApi.get(dutyId)
    const loaded = res.content as TemporaryDuty
    setDuty(loaded)
    if (loaded.standalone_req_id) {
      standaloneReqApi.get(loaded.standalone_req_id).then((r) => {
        setReqResponsible((r.content as { responsible?: string[] }).responsible ?? [])
      }).catch(() => {})
    }
  }, [dutyId])

  const doAction = useCallback(async (action: () => Promise<unknown>) => {
    setIsActing(true)
    try { await action(); await reloadDuty(); onRefresh?.() }
    catch { /* global toast */ }
    finally { setIsActing(false) }
  }, [reloadDuty, onRefresh])

  const ensureUserOptions = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      const opts = data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` }))
      setUserOptions(opts)
      setReviewerOptions(opts)
    }).catch(() => {})
  }, [userOptions.length])

  const openEditModal = useCallback(() => {
    if (!duty) return
    editForm.setFieldsValue({
      duty_nm:              duty.duty_nm,
      describe:             duty.describe ?? '',
      group:                duty.group ?? '',
      system_id:            duty.system_id ?? '',
      priority:             duty.priority,
      responsible:          duty.responsible ?? [],
      expected_start_date:  duty.expected_start_date ?? '',
      expected_end_date:    duty.expected_end_date ?? '',
    })
    ensureUserOptions()
    if (systemOptions.length === 0) {
      systemApi.list({ page: 1, size: 200 }).then((res) => {
        const c = res.content as { data_list: SystemItem[] }
        setSystemOptions((c.data_list ?? []).map((s) => ({ value: s.id, label: s.sys_nm })))
      }).catch(() => {})
    }
    setShowEditModal(true)
  }, [duty, editForm, ensureUserOptions, systemOptions.length])

  const handleEdit = useCallback(async () => {
    const values = await editForm.validateFields()
    setIsActing(true)
    try {
      await dutyApi.update(duty!.id, {
        duty_nm:              values.duty_nm,
        describe:             values.describe,
        group:                values.group,
        system_id:            values.system_id,
        priority:             values.priority,
        responsible:          values.responsible,
        expected_start_date:  values.expected_start_date,
        expected_end_date:    values.expected_end_date,
      })
      showToast.success(t('duty.detail.taskInfoUpdated'))
      setShowEditModal(false)
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [duty, editForm, reloadDuty, onRefresh])

  const openActivateModal = useCallback(() => {
    const responsible = duty?.responsible ?? []
    const startDate   = duty?.expected_start_date ?? ''
    const endDate     = duty?.expected_end_date ?? ''
    // 如果欄位都已填，直接激活
    if (responsible.length > 0 && startDate && endDate) {
      doAction(() => dutyApi.activate(duty!.id))
      return
    }
    activateForm.setFieldsValue({ responsible, expected_start_date: startDate, expected_end_date: endDate })
    ensureUserOptions()
    setShowActivateModal(true)
  }, [duty, activateForm, doAction, ensureUserOptions])

  const handleActivate = useCallback(async () => {
    const values = await activateForm.validateFields()
    setIsActing(true)
    try {
      await dutyApi.activate(duty!.id, {
        responsible:          values.responsible,
        expected_start_date:  values.expected_start_date,
        expected_end_date:    values.expected_end_date,
      })
      showToast.success(t('duty.detail.taskActivated'))
      setShowActivateModal(false)
      activateForm.resetFields()
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [duty, activateForm, reloadDuty, onRefresh])

  const openSubmitModal = useCallback(async () => {
    if (duty?.standalone_req_id) {
      // 系統任務：實時獲取需求責任人（避免狀態延遲）
      let freshReqResp: string[] = []
      try {
        const reqRes = await standaloneReqApi.get(duty.standalone_req_id)
        freshReqResp = (reqRes.content as { responsible?: string[] }).responsible ?? []
      } catch { /* ignore */ }

      const otherReqResp = freshReqResp.filter((w) => w.toLowerCase() !== (workNo ?? '').toLowerCase())

      const taskResp = duty.responsible ?? []
      const submitterInReqResp = freshReqResp.some((w) => w.toLowerCase() === (workNo ?? '').toLowerCase())

      if (
        // 需求只有1個責任人且就是提交者
        (freshReqResp.length === 1 && otherReqResp.length === 0) ||
        // 需求多責任人 + 任務只有1個責任人 + 該人在需求責任人中
        (freshReqResp.length > 1 && taskResp.length === 1 && submitterInReqResp)
      ) {
        setShowReqCompleteConfirm(true)
      } else {
        // 需要審批 → 彈出審核人選擇窗口
        setCompletionReviewSearch('')
        setCompletionSearchResults([])
        setShowCompletionReviewModal(true)
        try {
          const res = await userApi.list({ page: 1, size: 2000 })
          const allUsers = ((res.content as { data_list?: UserProfile[] }).data_list) ?? []

          if (freshReqResp.length === 0) {
            // 需求沒有設置責任人 → 回退到任務創建人
            const creator = duty?.creator ?? ''
            const creatorUser = allUsers.find((u) => u.work_no.toLowerCase() === creator.toLowerCase())
            setCompletionReviewers(creatorUser ? [creatorUser] : [])
            setDefaultCompletionWnos(new Set(creatorUser ? [creatorUser.work_no] : []))
          } else if (freshReqResp.length === 1) {
            // 需求只有1個責任人但提交者不是 → 該責任人鎖定
            const respUser = allUsers.find((u) => u.work_no.toLowerCase() === freshReqResp[0].toLowerCase())
            setCompletionReviewers(respUser ? [respUser] : [])
            setDefaultCompletionWnos(new Set(respUser ? [respUser.work_no] : []))
          } else {
            // 需求有多個責任人 → 填入所有需求責任人（排除提交者）
            const otherSet = new Set(otherReqResp.map((w) => w.toLowerCase()))
            const otherUsers = allUsers.filter((u) => otherSet.has(u.work_no.toLowerCase()))
            setCompletionReviewers(otherUsers)
            setDefaultCompletionWnos(new Set(otherUsers.map((u) => u.work_no)))
          }
        } catch { /* ignore */ }
      }
    } else {
      // AR任務
      const creator = duty?.creator ?? ''
      const isCreator = (workNo ?? '').toLowerCase() === creator.toLowerCase()

      if (isCreator) {
        // 提交人是創建人 → 直接完結
        setShowReqCompleteConfirm(true)
      } else {
        // 提交人不是創建人 → 彈出審核人選擇窗口，創建人默認鎖定
        setCompletionReviewSearch('')
        setCompletionSearchResults([])
        setShowCompletionReviewModal(true)
        try {
          const res = await userApi.list({ page: 1, size: 2000 })
          const allUsers = ((res.content as { data_list?: UserProfile[] }).data_list) ?? []
          const creatorUser = allUsers.find((u) => u.work_no.toLowerCase() === creator.toLowerCase())
          setCompletionReviewers(creatorUser ? [creatorUser] : [])
          setDefaultCompletionWnos(new Set(creatorUser ? [creatorUser.work_no] : []))
        } catch { /* ignore */ }
      }
    }
  }, [duty, workNo])

  const handleReschedule = useCallback(async () => {
    const values = await rescheduleForm.validateFields()
    if (!duty) return
    setIsRescheduling(true)
    try {
      await dutyApi.reschedule(duty.id, values.new_end_date, values.reason)
      showToast.success(t('duty.detail.rescheduleSuccess'))
      setShowRescheduleModal(false)
      rescheduleForm.resetFields()
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setIsRescheduling(false) }
  }, [duty, rescheduleForm, reloadDuty, onRefresh])

  const handleSubmitCompletion = useCallback(async () => {
    if (!dutyId || selectedReviewers.length === 0) return
    setIsActing(true)
    try {
      await dutyApi.submitCompletion(dutyId, selectedReviewers)
      showToast.success(t('duty.detail.completionSubmitted'))
      setShowSubmitModal(false)
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [dutyId, selectedReviewers, reloadDuty, onRefresh])

  const handleReqCompleteConfirm = useCallback(async () => {
    if (!dutyId) return
    setIsActing(true)
    try {
      const res = await dutyApi.submitCompletion(dutyId, [])
      const c = res.content as { direct?: boolean }
      showToast.success(c.direct ? t('duty.detail.taskDirectCompleted') : t('duty.detail.completionWaitingReview'))
      setShowReqCompleteConfirm(false)
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [dutyId, reloadDuty, onRefresh])

  const openReqReviewModal = useCallback(async () => {
    setReqReviewers([])
    setDefaultReqReviewerWnos(new Set())
    setReqReviewSearch('')
    setReqReviewSearchResults([])
    setShowReqReviewModal(true)
    setReqReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo ?? '')
      const list = (Array.isArray(res.content) ? res.content : []) as UserProfile[]
      setReqReviewers(list)
      setDefaultReqReviewerWnos(new Set(list.map((u) => u.work_no)))
    } catch { /* ignore */ }
    finally { setReqReviewersLoading(false) }
  }, [workNo])

  const handleReqReviewSearchChange = async (keyword: string) => {
    setReqReviewSearch(keyword)
    if (!keyword.trim()) { setReqReviewSearchResults([]); return }
    setReqReviewSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setReqReviewSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setReqReviewSearchLoading(false) }
  }

  const handleSubmitReqReview = useCallback(async () => {
    if (!duty || reqReviewers.length === 0) return
    setReqReviewSaving(true)
    try {
      await dutyApi.submitReqTaskReview(duty.id, {
        reviewer: reqReviewers.map((r) => r.work_no),
      })
      showToast.success(t('duty.detail.reviewSubmitted'))
      setShowReqReviewModal(false)
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setReqReviewSaving(false) }
  }, [duty, reqReviewers, reloadDuty, onRefresh])

  const handleCompletionSearchChange = async (keyword: string) => {
    setCompletionReviewSearch(keyword)
    if (!keyword.trim()) { setCompletionSearchResults([]); return }
    setCompletionSearchLoading(true)
    try {
      const res = await userApi.list({ keyword, size: 10 })
      const c = res.content as { data_list?: UserProfile[] }
      setCompletionSearchResults(c.data_list ?? [])
    } catch { /* ignore */ }
    finally { setCompletionSearchLoading(false) }
  }

  const handleSubmitCompletionReview = useCallback(async () => {
    if (!duty || completionReviewers.length === 0) return
    setCompletionSaving(true)
    try {
      await dutyApi.submitCompletion(duty.id, completionReviewers.map((r) => r.work_no))
      showToast.success(t('duty.detail.completionSubmitted'))
      setShowCompletionReviewModal(false)
      await reloadDuty(); onRefresh?.()
    } catch { /* global */ }
    finally { setCompletionSaving(false) }
  }, [duty, completionReviewers, reloadDuty, onRefresh])

  const loadProgress = async () => {
    if (!dutyId) return
    try {
      const [progRes, logRes] = await Promise.all([
        dutyApi.getProgress(dutyId, { page: 1, size: 50 }),
        dailyLogApi.taskEntries('duty', dutyId),
      ])
      const rawRecords2 = ((progRes.content as { data_list?: Record<string, unknown>[] }).data_list) ?? []
      setRecords(rawRecords2.map((r) => ({ ...r, cooperator: normalizeCooperator(r.cooperator) })))
      setLogEntries(logRes.content ?? [])
    } catch { /* global */ }
  }

  const handleImageUpload = React.useCallback(async (file: File): Promise<string> => {
    const result = await dutyApi.uploadInlineImage(file)
    return result.url
  }, [])

  const handlePreCheckSubmit = async (type: 'start' | 'end' | 'overdue', date: string, reason: string) => {
    if (!duty) return
    if (type === 'start') {
      await dutyApi.update(duty.id, { expected_start_date: date })
    } else if (type === 'end') {
      await dutyApi.update(duty.id, { expected_end_date: date })
    } else if (type === 'overdue') {
      await dutyApi.reschedule(duty.id, date, reason)
    }
    showToast.success(t('common.saveSuccess'))
    reloadDuty(); onRefresh?.()
  }

  const tryOpenProgressForm = () => {
    if (!duty) return
    const check = checkTaskDates(duty.expected_start_date, duty.expected_end_date)
    if (check) { setPreCheckType(check); return }
    setShowForm((v) => !v); ensureUserOptions()
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!dutyId) return
    setIsSaving(true)
    try {
      const files: Record<string, File[]> = {}
      fileList.forEach((f) => { if (f.originFileObj) { if (!files.files) files.files = []; files.files.push(f.originFileObj) } })
      await dutyApi.createProgress(dutyId, {
        progress: values.progress,
        progress_record: values.progress_record,
        time_consum: values.time_consum,
        cooperator: values.cooperator,
        submitter: workNo,
        is_overtime: (values.is_overtime as boolean) ?? false,
        overtime_hours: (values.is_overtime as boolean) ? (values.overtime_hours as number ?? values.time_consum as number ?? 0) : 0,
      }, Object.keys(files).length > 0 ? files : undefined)
      showToast.success(t('duty.detail.progressUpdated'))
      setShowForm(false); form.resetFields(); setFileList([])
      loadProgress()
      const dutyRes = await dutyApi.get(dutyId)
      setDuty(dutyRes.content as TemporaryDuty)
      onRefresh?.()
      if (Number(values.progress) === 100) {
        openSubmitModal()
      }
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const priorityColor = PRIORITY_COLORS[duty?.priority ?? 0] ?? '#94a3b8'
  const statusInfo    = duty ? DUTY_STATUS_MAP[duty.status] : null

  return (
    <>
    {previewFile && (
      <FilePreviewModal
        directUrl={previewFile.url}
        filename={previewFile.name}
        onClose={() => setPreviewFile(null)}
      />
    )}
    <Drawer
      open={open}
      onClose={onClose}
      width="min(680px, 88vw)"
      title={
        duty ? (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ background: priorityColor }} />
            <span className="font-bold text-slate-800 text-base leading-tight">{duty.duty_nm}</span>
            {statusInfo && <Tag color={statusInfo.color} style={{ fontSize: 11, marginLeft: 4 }}>{statusInfo.label}</Tag>}
          </div>
        ) : t('duty.detail.arDetail')
      }
      styles={{ body: { padding: '16px 24px', overflowY: 'auto' } }}
      extra={
        duty && (() => {
          const isCreator = workNo?.toLowerCase() === duty.creator?.toLowerCase()
          const isResponsible = (duty.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? ''))
          const canAct = isCreator || isResponsible
          const canReqHold = duty.standalone_req_id
            ? reqResponsible.some((w) => w.toLowerCase() === (workNo ?? '').toLowerCase())
            : canAct
          const isOverdue = duty.expected_end_date && duty.expected_end_date < new Date().toISOString().slice(0, 10)
          return (
            <div className="flex gap-2">
              {/* 刪除：草稿狀態 + 建立人或負責人 */}
              {duty.status === 0 && (isCreator || isResponsible) && (
                <Popconfirm title={t('duty.detail.confirmDelete')} onConfirm={async () => {
                  await dutyApi.delete(duty.id)
                  showToast.success(t('duty.detail.deleteSuccess'))
                  onClose?.()
                }} okText={t('common.confirm')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }}>
                  <Button size="small" danger>{t('common.delete')}</Button>
                </Popconfirm>
              )}
              {/* 延期：超時 + 進行中/未開始（非搁置）+ 需求任務需求責任人/普通AR建立人或負責人 */}
              {isOverdue && [1, 6].includes(duty.status) && canReqHold && (
                <Button size="small" onClick={() => {
                  rescheduleForm.setFieldsValue({ new_end_date: '', reason: '' })
                  setShowRescheduleModal(true)
                }}>{t('duty.detail.reschedule')}</Button>
              )}
              {/* 擱置 */}
              {[1, 6].includes(duty.status) && canReqHold && (
                <Button size="small" onClick={() => { setHoldReason(''); setShowHoldModal(true) }}>{t('duty.detail.hold')}</Button>
              )}
              {/* 恢復 */}
              {duty.status === 8 && canReqHold && (
                <Button size="small" loading={isActing} onClick={() => doAction(() => dutyApi.resume(duty.id))}>
                  {t('duty.detail.resumeInProgress')}
                </Button>
              )}
              {/* 提交完結：進行中 + 進度100% + 任務責任人 */}
              {duty.status === 1 && (duty.progress ?? 0) >= 100 && isResponsible && (
                <Button size="small" type="primary" style={{ background: '#16a34a' }}
                  onClick={() => openSubmitModal()}>
                  {t('duty.detail.submitCompletion')}
                </Button>
              )}
              {/* 更新進度 */}
              {(duty.status === 1 || duty.status === 6) && isResponsible && (
                <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
                  style={{ background: '#2563eb' }} onClick={tryOpenProgressForm}>
                  {t('duty.addProgress')}
                </Button>
              )}
            </div>
          )
        })()
      }
      destroyOnHidden
    >
      {loading ? (
        <div className="flex items-center justify-center h-48"><Spin size="large" /></div>
      ) : !duty ? (
        <Empty description={t('duty.detail.taskNotExist')} className="mt-16" />
      ) : (
        <div className="space-y-4">
          {/* Action buttons — 草稿階段操作 */}
          {(() => {
            const isCreator = workNo?.toLowerCase() === duty.creator?.toLowerCase()
            const isResponsible = (duty.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? ''))
            const canAct = isCreator || isResponsible
            if (duty.status !== 0 || !canAct) return null
            return (
              <div className="flex flex-wrap gap-2 mb-1">
                <Button size="small" onClick={openEditModal}>{t('duty.detail.editInfo')}</Button>
                {duty.standalone_req_id && (
                  <Button type="primary" size="small" style={{ background: '#7c3aed' }} onClick={openReqReviewModal}>
                    {t('duty.detail.submitReview')}
                  </Button>
                )}
                {!duty.standalone_req_id && (
                  <Button type="primary" size="small" loading={isActing} style={{ background: '#2563eb' }} onClick={openActivateModal}>
                    {t('duty.detail.activateTask')}
                  </Button>
                )}
              </div>
            )
          })()}

          {/* Status steps */}
          {(duty.status === 6 || duty.status === 8 || (duty.status >= 1 && duty.status <= 3)) && (
            <>
              <Steps size="small" current={statusToStep(duty.status)}
                items={DUTY_STEP_KEYS.map((k) => ({ title: <span style={{ fontSize: 11 }}>{t(k)}</span> }))}
                className="mb-4" />
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-4">
                <span className="text-xs text-slate-400 flex-shrink-0">{t('duty.detail.overallProgress')}</span>
                <Progress percent={duty.progress ?? 0} size="small" strokeColor="#2563eb" trailColor="#e2e8f0"
                  style={{ flex: 1, marginBottom: 0 }} />
              </div>
            </>
          )}

          {/* Info */}
          <Descriptions column={2} size="small" className="mb-4"
            styles={{ label: { color: '#94a3b8', fontSize: 12, fontWeight: 500 }, content: { fontSize: 13, color: '#334155' } }}>
            <Descriptions.Item label={t('common.priority')}>
              {(() => { const p = PRIORITY_MAP[duty.priority]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : duty.priority })()}
            </Descriptions.Item>
            <Descriptions.Item label={t('duty.assignee')}>
              {duty.responsible?.length
                ? duty.responsible.map((wn) => (
                    <Tag key={wn} style={{ marginBottom: 2 }} color="purple">{toName(wn)}</Tag>
                  ))
                : <span className="text-slate-300">{t('common.notAssigned')}</span>}
            </Descriptions.Item>
            <Descriptions.Item label={t('duty.taskGroup')}>
              {duty.group ? formatGroupName(duty.group) || duty.group : '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('duty.expectedStart')}>{duty.expected_start_date || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('duty.expectedComplete')}>
              <div className="flex items-center gap-2 flex-wrap">
                <span>{duty.expected_end_date || '—'}</span>
                {(duty.reschedule_count ?? 0) > 0 && (
                  <>
                    <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                      {t('duty.detail.rescheduledCount', { count: duty.reschedule_count })}
                    </Tag>
                    <span className="text-[10px] text-slate-400">{t('duty.detail.original')}: {duty.original_end_date || '—'}</span>
                  </>
                )}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label={t('common.createdAt')}>{(duty as unknown as { created_at?: string }).created_at ?? '—'}</Descriptions.Item>
            {duty.system_nm && (
              <Descriptions.Item label={t('duty.linkedSystem')}>
                <span className="text-blue-600 text-xs">{duty.system_nm}</span>
              </Descriptions.Item>
            )}
            {duty.describe && (
              <Descriptions.Item label={t('common.description')} span={2}><RichTextContent html={duty.describe} /></Descriptions.Item>
            )}
          </Descriptions>

          {/* Shelve reason */}
          {duty.status === 8 && (duty as unknown as { shelve_reason?: string }).shelve_reason && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-amber-700 mb-1">{t('duty.detail.holdReasonLabel')}</p>
              <p className="text-sm text-amber-800">{(duty as unknown as { shelve_reason?: string }).shelve_reason}</p>
            </div>
          )}

          {/* Reschedule history */}
          {(duty.reschedule_history ?? []).length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-orange-700 mb-2">{t('duty.detail.rescheduleHistory')}</p>
              <Timeline className="!mb-0" items={(duty.reschedule_history ?? []).map((h, i) => ({
                key: i,
                color: 'orange',
                children: (
                  <div className="text-[11px] text-slate-600 leading-5">
                    <span className="text-slate-400">{h.date}</span>
                    {'　'}
                    <span className="line-through text-slate-400">{h.from}</span>
                    {' → '}
                    <span className="font-semibold text-orange-600">{h.to}</span>
                    {h.reason && <span className="text-slate-400 ml-1">（{h.reason}）</span>}
                    <span className="text-slate-300 ml-1">by {toName(h.operator)}</span>
                  </div>
                ),
              }))} />
            </div>
          )}

          {/* Progress section */}
          <Card
            variant="borderless" className="shadow-sm"
            title={
              <span className="font-semibold text-slate-700 text-sm">
                {t('duty.detail.progressRecords', { count: records.length })}
                {logEntries.length > 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                    · {t('duty.detail.includesLogEntries', { count: logEntries.length })}
                  </span>
                )}
              </span>
            }
          >
            {showForm && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                  <div className="grid grid-cols-2 gap-x-3">
                    <Form.Item name="progress" label={t('duty.detail.completionPercent')} rules={[{ required: true }]}>
                      <InputNumber min={1} max={100} style={{ width: '100%' }} suffix="%" />
                    </Form.Item>
                    <Form.Item name="time_consum" label={t('duty.detail.timeConsumed')}>
                      <InputNumber min={0} step={0.5} style={{ width: '100%' }} suffix="h" />
                    </Form.Item>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3">
                    <Form.Item name="is_overtime" label={t('dailyLog.isOvertime')} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.is_overtime !== cur.is_overtime}>
                      {({ getFieldValue }) => getFieldValue('is_overtime') ? (
                        <Form.Item name="overtime_hours" label={t('dailyLog.overtimeHours')}>
                          <InputNumber min={0} step={0.5} style={{ width: '100%' }} suffix="h" />
                        </Form.Item>
                      ) : null}
                    </Form.Item>
                  </div>
                  <Form.Item
                    name="progress_record"
                    label={
                      <div className="flex items-center justify-between w-full">
                        <span>{t('duty.detail.progressDescription')}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const cur = form.getFieldValue('progress_record') ?? ''
                            setExpandDraft(cur)
                            setExpandOpen(true)
                          }}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-0.5 hover:border-blue-300 bg-white transition-colors ml-2"
                        >
                          <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                          {t('duty.detail.expandEdit')}
                        </button>
                      </div>
                    }
                  >
                    <RichTextEditor
                      placeholder={t('duty.detail.progressPlaceholder')}
                      minHeight={120}
                      onImageUpload={handleImageUpload}
                    />
                  </Form.Item>
                  <Form.Item name="cooperator" label={t('duty.detail.cooperator')}>
                    <Select
                      mode="multiple"
                      showSearch
                      placeholder={t('duty.detail.cooperatorPlaceholder')}
                      optionFilterProp="label"
                      options={userOptions.filter((u) => u.value.toLowerCase() !== (workNo ?? '').toLowerCase())}
                      allowClear
                    />
                  </Form.Item>
                  <Form.Item label={t('duty.detail.attachments')}>
                    <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.md">
                      <Button icon={<PaperClipIcon className="w-4 h-4" />} size="small">{t('duty.detail.selectAttachment')}</Button>
                    </Upload>
                  </Form.Item>
                  <div className="flex justify-end gap-2">
                    <Button size="small" onClick={() => { setShowForm(false); form.resetFields(); setFileList([]) }}>{t('common.cancel')}</Button>
                    <Button type="primary" size="small" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>{t('common.submit')}</Button>
                  </div>
                </Form>
              </div>
            )}

            {records.length === 0 && logEntries.length === 0 ? (
              <Text type="secondary" className="block text-center py-8 text-sm">{t('duty.detail.noProgressRecords')}</Text>
            ) : (() => {
              // ── 構建合併時間軸（與 FunctionDetailDrawer 相同邏輯）──────────
              const updatedMap = new Map<string, TaskLogEntry[]>()
              const manualEntries: TaskLogEntry[] = []
              for (const e of logEntries) {
                if (e.source === 'updated' && e.suggest_id) {
                  if (!updatedMap.has(e.suggest_id)) updatedMap.set(e.suggest_id, [])
                  updatedMap.get(e.suggest_id)!.push(e)
                } else if (e.source === 'manual') {
                  manualEntries.push(e)
                }
              }
              for (const list of updatedMap.values()) list.sort((a, b) => a.log_date.localeCompare(b.log_date))

              type MixedItem =
                | { kind: 'progress'; data: Record<string, unknown>; _sort: string }
                | { kind: 'manual';   data: TaskLogEntry;             _sort: string }

              const mixed: MixedItem[] = [
                ...records.map((r) => ({ kind: 'progress' as const, data: r, _sort: String(r.created_at ?? '') })),
                ...manualEntries.map((e) => ({ kind: 'manual' as const, data: e, _sort: `${e.log_date} ${e.record_time ?? '00:00'}` })),
              ].sort((a, b) => (a._sort > b._sort ? -1 : 1))

              return (
                <Timeline items={mixed.map(({ kind, data }) => {
                  if (kind === 'progress') {
                    const item = data
                    const recordId = String(item.progress_id ?? '')
                    const allUpdates = updatedMap.get(recordId) ?? []
                    const submitterWno = String(item.submitter ?? '')
                    const ownUpdates  = allUpdates.filter((e) => e.work_no === submitterWno)
                    const coopUpdates = allUpdates.filter((e) => e.work_no !== submitterWno)
                    const latestUpd = ownUpdates.length > 0 ? ownUpdates[ownUpdates.length - 1] : null
                    const origHours = Number(item.time_consum ?? 0)
                    const latestHours = latestUpd ? Number(latestUpd.work_hours ?? 0) : origHours
                    const hoursChanged = latestUpd && latestHours !== origHours
                    const origProgress = Number(item.progress ?? 0)
                    const latestProgress = latestUpd?.progress
                    const progressChanged = latestUpd && latestProgress != null && latestProgress !== origProgress
                    return {
                      dot: (
                        <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                          {toName(String(item.submitter ?? ''))?.[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div className="pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-700 text-sm">{toName(String(item.submitter ?? ''))}</span>
                              {((item.cooperator as string[] | undefined) ?? []).length > 0 && (
                                <Tooltip title={`${t('duty.detail.cooperator')}：${((item.cooperator as string[] | undefined) ?? []).map((c) => toName(c) || c).join('、')}`}>
                                  <div className="flex items-center gap-0.5">
                                    <span className="text-xs text-slate-400">+</span>
                                    {((item.cooperator as string[] | undefined) ?? []).map((c) => (
                                      <Avatar key={c} size={18} style={{ background: '#7c3aed', fontSize: 9, fontWeight: 700, marginLeft: 2 }}>
                                        {(toName(c) || c)[0]?.toUpperCase()}
                                      </Avatar>
                                    ))}
                                  </div>
                                </Tooltip>
                              )}
                              {progressChanged ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-xs text-slate-400 line-through">{origProgress}%</span>
                                  <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{latestProgress}%</Tag>
                                </span>
                              ) : (
                                <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{origProgress}%</Tag>
                              )}
                              {hoursChanged ? (
                                <span className="flex items-center gap-1">
                                  {origHours > 0 && <span className="text-xs text-slate-400 line-through">{origHours}h</span>}
                                  <Tag style={{ fontSize: 11, padding: '0 6px' }}>{latestHours}h</Tag>
                                </span>
                              ) : (
                                origHours > 0 && <Tag style={{ fontSize: 11, padding: '0 6px' }}>{origHours}h</Tag>
                              )}
                            </div>
                            {latestUpd && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                  {latestUpd.log_status === 2 ? t('duty.detail.submitted') : t('duty.detail.draft')}
                                </Tag>
                                <Tag color="orange" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>{t('duty.detail.logUpdated')}</Tag>
                              </div>
                            )}
                          </div>
                          {/* 原始說明：若提交人自己的第一條更新改了文字則劃線 */}
                          {!!item.progress_record && (() => {
                            const origText = String(item.progress_record)
                            const firstUpdDesc = ownUpdates[0]?.description ?? ''
                            const origChanged = ownUpdates.length > 0 && firstUpdDesc !== origText
                            return origChanged ? (
                              <p className="text-sm mt-1 mb-0 leading-snug"
                                style={{ color: '#94a3b8', textDecoration: 'line-through', margin: '4px 0 0 0' }}>
                                {origText.replace(/<[^>]*>/g, '')}
                              </p>
                            ) : (
                              <div className="mt-1" style={{ margin: '4px 0 0 0' }}>
                                <RichTextContent html={origText} onImageClick={(src) => setPreviewFile({ name: src.split('/').pop()?.split('?')[0] ?? 'image.png', url: src })} />
                              </div>
                            )
                          })()}
                          {/* 提交人自己的日誌更新鏈 */}
                          {ownUpdates.map((upd, idx) => {
                            const isLatest    = idx === ownUpdates.length - 1
                            const prevDesc    = idx === 0 ? String(item.progress_record ?? '') : (ownUpdates[idx - 1].description ?? '')
                            const descChanged = upd.description !== prevDesc
                            const prevRawFiles = idx === 0
                              ? (item.files as { name: string; url: string; size?: number }[] ?? [])
                              : (ownUpdates[idx - 1].files ?? [])
                            const currRawFiles = upd.files ?? []
                            const prevNameSet  = new Set(prevRawFiles.map((f) => f.name))
                            const currNameSet  = new Set(currRawFiles.map((f) => f.name))
                            const addedFiles   = currRawFiles.filter((f) => !prevNameSet.has(f.name))
                            const removedFiles = prevRawFiles.filter((f) => !currNameSet.has(f.name))
                            const hasFileDiff  = addedFiles.length > 0 || removedFiles.length > 0
                            if (!descChanged && !hasFileDiff) return null
                            return (
                              <div key={upd.log_date + idx}>
                                {idx > 0 && descChanged && (
                                  <p className="text-sm leading-tight"
                                    style={{ color: '#94a3b8', textDecoration: 'line-through', margin: '2px 0 0 0' }}>
                                    {(ownUpdates[idx - 1].description ?? '').replace(/<[^>]*>/g, '')}
                                  </p>
                                )}
                                {descChanged && (
                                  isLatest ? (
                                    <div style={{ margin: '2px 0 0 0' }}>
                                      <RichTextContent html={upd.description} onImageClick={(src) => setPreviewFile({ name: src.split('/').pop()?.split('?')[0] ?? 'image.png', url: src })} />
                                    </div>
                                  ) : (
                                    <p className="text-sm leading-tight"
                                      style={{ color: '#94a3b8', textDecoration: 'line-through', margin: '2px 0 0 0' }}>
                                      {(upd.description ?? '').replace(/<[^>]*>/g, '')}
                                    </p>
                                  )
                                )}
                                {hasFileDiff && (
                                  <div className="mt-1 space-y-1">
                                    {removedFiles.map((f, fi) => (
                                      <div key={fi} className="flex items-center gap-1.5">
                                        <Tag color="red" style={{ fontSize: 9, padding: '0 4px', lineHeight: '14px', flexShrink: 0 }}>{t('duty.detail.deleted')}</Tag>
                                        <span className="text-xs text-slate-400" style={{ textDecoration: 'line-through' }}>{f.name}</span>
                                      </div>
                                    ))}
                                    {addedFiles.length > 0 && (() => { const sf = splitFiles(addedFiles); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                          {/* 原始附件 */}
                          {(() => { const sf = splitFiles(item.files as { name: string; url: string; size?: number }[] | undefined); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                          <span className="text-xs text-slate-300 mt-1 block">{String(item.created_at ?? '')}</span>
                          {/* 合作人的日誌更新（獨立顯示，不影響原始記錄） */}
                          {coopUpdates.map((upd) => {
                            const origNameSet = new Set((item.files as { name: string }[] ?? []).map((f) => f.name))
                            const newFiles = (upd.files ?? []).filter((f) => !origNameSet.has(f.name))
                            return (
                              <div key={`coop-${upd.work_no}-${upd.log_date}`}
                                className="mt-2 pt-2"
                                style={{ borderTop: '1px dashed #e2e8f0' }}>
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <Avatar size={18} style={{ background: '#7c3aed', fontSize: 9, fontWeight: 700 }}>
                                      {toName(upd.work_no)?.[0]?.toUpperCase()}
                                    </Avatar>
                                    <span className="text-xs font-semibold text-slate-600">{toName(upd.work_no)}</span>
                                    {upd.progress != null && (
                                      <Tag color="blue" style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>{upd.progress}%</Tag>
                                    )}
                                    {upd.work_hours > 0 && (
                                      <Tag style={{ fontSize: 11, padding: '0 6px', margin: 0 }}>{upd.work_hours}h</Tag>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <Tag color="purple" style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', margin: 0 }}>{t('duty.detail.cooperatorUpdate')}</Tag>
                                    <Tag style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                      {upd.log_status === 2 ? t('duty.detail.submitted') : t('duty.detail.draft')}
                                    </Tag>
                                  </div>
                                </div>
                                {upd.description && (
                                  <div style={{ margin: '4px 0' }}>
                                    <RichTextContent html={upd.description} onImageClick={(src) => setPreviewFile({ name: src.split('/').pop()?.split('?')[0] ?? 'image.png', url: src })} />
                                  </div>
                                )}
                                {newFiles.length > 0 && (() => { const sf = splitFiles(newFiles as { name: string; url: string; size?: number }[]); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                                <span className="text-xs text-slate-300 block">{upd.log_date}{upd.record_time ? ` ${upd.record_time}` : ''}</span>
                              </div>
                            )
                          })}
                        </div>
                      ),
                    }
                  } else {
                    // manual 日誌新增
                    const e = data
                    const displayTime = e.record_time ? `${e.log_date} ${e.record_time}` : e.log_date
                    return {
                      dot: (
                        <Avatar size={26} style={{ background: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                          {toName(e.work_no)?.[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div className="pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-700 text-sm">{toName(e.work_no)}</span>
                              {e.progress != null && <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{e.progress}%</Tag>}
                              {Number(e.work_hours ?? 0) > 0 && <Tag style={{ fontSize: 11, padding: '0 6px' }}>{e.work_hours}h</Tag>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                {e.log_status === 2 ? t('duty.detail.submitted') : t('duty.detail.draft')}
                              </Tag>
                              <Tag color="green" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>{t('duty.detail.logAdded')}</Tag>
                            </div>
                          </div>
                          {e.description && (
                            <div className="mt-1 mb-1">
                              <RichTextContent html={e.description} onImageClick={(src) => setPreviewFile({ name: src.split('/').pop()?.split('?')[0] ?? 'image.png', url: src })} />
                            </div>
                          )}
                          {(() => { const sf = splitFiles(e.files as { name: string; url: string; size?: number }[] | undefined); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                          <span className="text-xs text-slate-300 mt-1 block">{displayTime}</span>
                        </div>
                      ),
                    }
                  }
                })} />
              )
            })()}
          </Card>
        </div>
      )}
      <Modal
        title={t('duty.detail.editTaskInfo')}
        open={showEditModal}
        onCancel={() => setShowEditModal(false)}
        onOk={handleEdit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: isActing, style: { background: '#2563eb' } }}
        width="min(680px, 88vw)"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" className="mt-3">
          <Form.Item name="duty_nm" label={t('duty.taskName')} rules={[{ required: true }]}>
            <Input placeholder={t('duty.taskNamePlaceholder')} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} rules={[{ required: true }]}>
              <Select options={[{value:1,label:t('status.priority.1')},{value:2,label:t('status.priority.2')},{value:3,label:t('status.priority.3')},{value:4,label:t('status.priority.4')}]} />
            </Form.Item>
            <Form.Item name="group" label={t('duty.taskGroup')}>
              <AutoComplete
                options={[]}
                placeholder={t('duty.groupPlaceholder')}
              />
            </Form.Item>
          </div>
          <Form.Item name="responsible" label={t('duty.assignee')}>
            <Select
              mode="multiple"
              placeholder={t('duty.assigneePlaceholder')}
              options={userOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="expected_start_date" label={t('duty.expectedStart')}>
              <DateInput/>
            </Form.Item>
            <Form.Item name="expected_end_date" label={t('duty.expectedComplete')}>
              <DateInput/>
            </Form.Item>
          </div>
          <Form.Item name="system_id" label={t('duty.linkedSystem')}>
            <Select
              placeholder={t('duty.linkedSystemPlaceholder')}
              options={systemOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
              onOpenChange={(open) => {
                if (open && systemOptions.length === 0) {
                  systemApi.list({ page: 1, size: 200 }).then((res) => {
                    const c = res.content as { data_list: SystemItem[] }
                    setSystemOptions((c.data_list ?? []).map((s) => ({ value: s.id, label: s.sys_nm })))
                  }).catch(() => {})
                }
              }}
            />
          </Form.Item>
          <Form.Item shouldUpdate={(prev, curr) => prev.describe !== curr.describe} noStyle>
            {({ getFieldValue }) => {
              const v: string = getFieldValue('describe') ?? ''
              const displayValue = isHtml(v) ? stripHtml(v) : v
              return (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-700">{t('duty.taskDescription')}</span>
                    <button type="button"
                      onClick={() => {
                        const html = isHtml(v) ? v : v.trim() ? `<p>${v.replace(/\n/g, '</p><p>')}</p>` : ''
                        setEditDescExpandDraft(html)
                        setEditDescExpandOpen(true)
                      }}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
                    >
                      <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                      {t('duty.detail.expandEdit')}
                    </button>
                  </div>
                  <Input.TextArea value={displayValue}
                    onChange={(e) => editForm.setFieldValue('describe', e.target.value)}
                    rows={3} placeholder={t('duty.descriptionPlaceholder')}
                    style={{ resize: 'vertical', minHeight: 80 }} />
                  <Form.Item name="describe" noStyle><input type="hidden" /></Form.Item>
                  {isHtml(v) && (
                    <p className="text-xs text-blue-500 mt-1">{t('duty.detail.richTextApplied') || '已套用富文本格式'}</p>
                  )}
                </div>
              )
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('duty.detail.activateTitle')}
        open={showActivateModal}
        onCancel={() => setShowActivateModal(false)}
        onOk={handleActivate}
        okText={t('duty.detail.confirmActivate')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: isActing, style: { background: '#2563eb' } }}
        destroyOnHidden
      >
        <p className="text-sm text-slate-500 mb-4">{t('duty.detail.activateHint')}</p>
        <Form form={activateForm} layout="vertical">
          <Form.Item name="responsible" label={t('duty.assignee')} rules={[{ required: true, message: t('duty.detail.assigneeRequired') }]}>
            <Select
              mode="multiple"
              placeholder={t('duty.assigneePlaceholder')}
              options={userOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="expected_start_date" label={t('duty.expectedStart')} rules={[{ required: true, message: t('duty.detail.expectedStartRequired') }]}>
              <DateInput/>
            </Form.Item>
            <Form.Item name="expected_end_date" label={t('duty.expectedComplete')} rules={[{ required: true, message: t('duty.detail.expectedEndRequired') }]}>
              <DateInput/>
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={t('duty.detail.submitCompletionTitle')}
        open={showSubmitModal}
        onCancel={() => setShowSubmitModal(false)}
        onOk={handleSubmitCompletion}
        okText={t('common.submit')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: selectedReviewers.length === 0, loading: isActing, style: { background: '#2563eb' } }}
      >
        <p className="text-sm text-slate-500 mb-3">{t('duty.detail.submitCompletionHint')}</p>
        <Select
          mode="multiple"
          placeholder={t('duty.detail.selectReviewers')}
          style={{ width: '100%' }}
          options={reviewerOptions}
          value={selectedReviewers}
          onChange={setSelectedReviewers}
          showSearch
          filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
        />
      </Modal>

      {/* 延期 Modal */}
      <Modal
        title={t('duty.detail.rescheduleTitle')}
        open={showRescheduleModal}
        onCancel={() => { setShowRescheduleModal(false); rescheduleForm.resetFields() }}
        onOk={handleReschedule}
        okText={t('duty.detail.confirmReschedule')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: isRescheduling, danger: true }}
      >
        <p className="text-sm text-slate-500 mb-3">
          {t('duty.detail.currentExpectedEnd')}<span className="font-semibold text-orange-600">{duty?.expected_end_date || '—'}</span>
        </p>
        <Form form={rescheduleForm} layout="vertical">
          <Form.Item name="new_end_date" label={t('duty.detail.newEndDate')} rules={[{ required: true, message: t('duty.detail.newEndDateRequired') }]}>
            <DateInput/>
          </Form.Item>
          <Form.Item name="reason" label={t('duty.detail.rescheduleReason')}>
            <Input.TextArea rows={2} placeholder={t('duty.detail.rescheduleReasonPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 需求任務提交審核 Modal */}
      <Modal
        title={t('duty.detail.submitReqReviewTitle')}
        open={showReqReviewModal}
        onCancel={() => setShowReqReviewModal(false)}
        footer={null} width={520} destroyOnHidden
      >
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">{t('duty.detail.reqReviewHint')}</div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('duty.detail.reviewFlow')}</div>
            {reqReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : reqReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                {t('duty.detail.noReviewerAdded')}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {reqReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0}
                        onClick={() => setReqReviewers((prev) => { const a = [...prev]; [a[i], a[i-1]] = [a[i-1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === reqReviewers.length - 1}
                        onClick={() => setReqReviewers((prev) => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === reqReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {defaultReqReviewerWnos.has(r.work_no) && reqReviewers.filter((u) => defaultReqReviewerWnos.has(u.work_no)).length <= 1
                        ? <Tooltip title={t('system.defaultReviewer') || '默認主管審核人'}>
                            <span className="w-7 h-7 flex items-center justify-center text-slate-300">🔒</span>
                          </Tooltip>
                        : <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                            onClick={() => setReqReviewers((prev) => prev.filter((u) => u.work_no !== r.work_no))} />
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('duty.detail.addReviewer')}</div>
            <div className="relative">
              <Input placeholder={t('duty.detail.searchReviewerPlaceholder')} value={reqReviewSearch}
                onChange={(e) => handleReqReviewSearchChange(e.target.value)}
                prefix={reqReviewSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {reqReviewSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden">
                  {reqReviewSearchResults.map((u) => {
                    const already = reqReviewers.some((r) => r.work_no === u.work_no)
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => {
                          if (already) return
                          setReqReviewers((prev) => [...prev, u])
                          setReqReviewSearch('')
                          setReqReviewSearchResults([])
                        }}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('duty.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowReqReviewModal(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={reqReviewSaving} disabled={reqReviewers.length === 0}
              style={{ background: '#7c3aed' }}
              onClick={handleSubmitReqReview}>
              {t('duty.detail.submitReview')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 需求任務完結審核人選擇 Modal（多責任人） */}
      <Modal
        title={t('duty.detail.submitCompletionTitle')}
        open={showCompletionReviewModal}
        onCancel={() => setShowCompletionReviewModal(false)}
        footer={null} width={520} destroyOnHidden
      >
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">{t('duty.detail.completionReviewHint')}</div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('duty.detail.reviewFlow')}</div>
            {completionReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                {t('duty.detail.noReviewerAdded')}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {completionReviewers.map((r, i) => (
                  <div key={r.work_no} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-b-0 bg-white hover:bg-slate-50 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0 font-semibold">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-400 truncate">{r.department}{r.position ? ` · ${r.position}` : ''} · {r.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="small" type="text" disabled={i === 0}
                        onClick={() => setCompletionReviewers((prev) => { const a = [...prev]; [a[i], a[i-1]] = [a[i-1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === 0 ? '#cbd5e1' : '#64748b' }}>↑</Button>
                      <Button size="small" type="text" disabled={i === completionReviewers.length - 1}
                        onClick={() => setCompletionReviewers((prev) => { const a = [...prev]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a })}
                        style={{ padding: '0 4px', fontSize: 12, color: i === completionReviewers.length - 1 ? '#cbd5e1' : '#64748b' }}>↓</Button>
                      {(() => {
                        const isDefault = defaultCompletionWnos.has(r.work_no)
                        const defaultCount = completionReviewers.filter((rv) => defaultCompletionWnos.has(rv.work_no)).length
                        const isLastDefault = isDefault && defaultCount <= 1
                        return isLastDefault ? (
                          <Tooltip title={t('duty.detail.lastReviewerLock')}>
                            <span className="w-7 h-7 flex items-center justify-center text-slate-300">🔒</span>
                          </Tooltip>
                        ) : (
                          <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                            onClick={() => setCompletionReviewers((prev) => prev.filter((u) => u.work_no !== r.work_no))} />
                        )
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">{t('duty.detail.addReviewer')}</div>
            <div className="relative">
              <Input placeholder={t('duty.detail.searchReviewerPlaceholder')} value={completionReviewSearch}
                onChange={(e) => handleCompletionSearchChange(e.target.value)}
                prefix={completionSearchLoading ? <Spin size="small" /> : undefined} allowClear />
              {completionSearchResults.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {completionSearchResults.map((u) => {
                    const already = completionReviewers.some((r) => r.work_no === u.work_no)
                    const isSelf = u.work_no.toLowerCase() === (workNo ?? '').toLowerCase()
                    return (
                      <div key={u.work_no}
                        className={`flex items-center gap-3 px-3 py-2 border-b border-slate-50 last:border-b-0 transition-colors ${already || isSelf ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => {
                          if (already || isSelf) return
                          setCompletionReviewers((prev) => [...prev, u])
                          setCompletionReviewSearch('')
                          setCompletionSearchResults([])
                        }}>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">{u.name.charAt(0)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800">{u.name}</div>
                          <div className="text-xs text-slate-400">{u.department}{u.position ? ` · ${u.position}` : ''} · {u.work_no}</div>
                        </div>
                        {already && <span className="text-xs text-slate-400">{t('duty.alreadyAdded')}</span>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowCompletionReviewModal(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={completionSaving} disabled={completionReviewers.length === 0}
              style={{ background: '#16a34a' }}
              onClick={handleSubmitCompletionReview}>
              {t('duty.detail.submitCompletionNow')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 進度100%完結提示 Modal */}
      {(() => {
        const isReqTask = !!duty?.standalone_req_id
        const dutyResp = duty?.responsible ?? []
        const otherResp = dutyResp.filter((w) => w.toLowerCase() !== (workNo ?? '').toLowerCase())
        const isSoleResp = isReqTask && otherResp.length === 0
        return (
          <Modal
            title={
              <div className="flex items-center gap-2">
                <span className="text-lg">🎉</span>
                <span>{t('duty.detail.progress100Title')}</span>
              </div>
            }
            open={show100Prompt}
            onOk={() => { setShow100Prompt(false); openSubmitModal() }}
            onCancel={() => setShow100Prompt(false)}
            okText={isSoleResp ? t('duty.detail.confirmComplete') : t('duty.detail.submitCompletionNow')}
            cancelText={t('duty.detail.later')}
            okButtonProps={{ style: { background: '#16a34a' } }}
            width={400}
          >
            <p className="text-sm text-slate-600 mt-2">
              {isReqTask
                ? isSoleResp
                  ? t('duty.detail.reqRespDirectComplete')
                  : t('duty.detail.reqSubmitToResponsible', { names: otherResp.map((w) => toName(w) || w).join('、') })
                : t('duty.detail.submitCompletionPrompt')}
            </p>
          </Modal>
        )
      })()}

      {/* 直接完結確認 Modal */}
      <Modal
        title={t('duty.detail.confirmCompleteTitle')}
        open={showReqCompleteConfirm}
        onOk={handleReqCompleteConfirm}
        onCancel={() => setShowReqCompleteConfirm(false)}
        okText={t('duty.detail.directComplete')}
        cancelText={t('common.cancel')}
        confirmLoading={isActing}
        okButtonProps={{ style: { background: '#16a34a' } }}
        width={400}
      >
        <p className="text-sm text-slate-600 mt-2">
          {t('duty.detail.directCompleteHint')}
        </p>
      </Modal>

      {/* 進度說明展開編輯 Modal */}
      <Modal
        open={expandOpen}
        title={t('duty.detail.progressDescription')}
        onCancel={() => setExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              form.setFieldValue('progress_record', expandDraft)
              setExpandOpen(false)
            }}>{t('duty.detail.done')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={expandDraft}
          onChange={setExpandDraft}
          placeholder={t('duty.detail.progressPlaceholder')}
          minHeight={480}
          onImageUpload={handleImageUpload}
        />
      </Modal>

      {/* 編輯任務描述展開 Modal */}
      <Modal
        open={editDescExpandOpen}
        title={t('duty.taskDescription')}
        onCancel={() => setEditDescExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditDescExpandOpen(false)}>{t('common.cancel')}</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              editForm.setFieldValue('describe', editDescExpandDraft)
              setEditDescExpandOpen(false)
            }}>{t('common.confirm')}</Button>
          </div>
        }
        destroyOnHidden
      >
        <RichTextEditor
          value={editDescExpandDraft}
          onChange={setEditDescExpandDraft}
          placeholder={t('duty.descriptionPlaceholder')}
          minHeight={480}
        />
      </Modal>
    </Drawer>

    {/* 搁置原因 Modal */}
    <Modal
      title={t('duty.detail.holdTitle')}
      open={showHoldModal}
      onCancel={() => setShowHoldModal(false)}
      onOk={async () => {
        if (!duty || !holdReason.trim()) return
        setHoldSaving(true)
        try {
          await dutyApi.hold(duty.id, holdReason)
          showToast.success(t('duty.detail.holdSuccess'))
          setShowHoldModal(false)
          await reloadDuty(); onRefresh?.()
        } catch { /* global */ }
        finally { setHoldSaving(false) }
      }}
      okText={t('duty.detail.confirmHoldBtn')}
      cancelText={t('common.cancel')}
      confirmLoading={holdSaving}
      okButtonProps={{ disabled: !holdReason.trim(), style: { background: '#d97706' } }}
      destroyOnHidden
    >
      <div className="mt-4 space-y-4">
        <div className="text-sm text-amber-600 bg-amber-50 rounded px-3 py-2">
          {t('duty.detail.holdHint')}
        </div>
        <div>
          <div className="text-sm font-medium text-slate-600 mb-2">{t('duty.detail.holdReasonLabel')} <span className="text-red-500">*</span></div>
          <Input.TextArea value={holdReason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setHoldReason(e.target.value)}
            rows={3} placeholder={t('duty.detail.holdReasonPlaceholder')} />
        </div>
      </div>
    </Modal>

    <ProgressPreCheckModal
      type={preCheckType}
      currentEndDate={duty?.expected_end_date}
      onClose={() => setPreCheckType(null)}
      onSubmit={handlePreCheckSubmit}
    />
    </>
  )
}

export default DutyDetailDrawer
