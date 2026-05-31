import React, { useEffect, useState, useCallback } from 'react'
import {
  Drawer, Descriptions, Button, Tag, Progress, Spin, Empty, Avatar,
  Typography, Space, Form, Input, InputNumber, Upload, Timeline,
  Card, Steps, Modal, Select, Popconfirm, AutoComplete, Tooltip, Divider,
} from 'antd'
import type { UploadFile } from 'antd'
import { PlusIcon, PaperClipIcon, TrashIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
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
import { DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

const { Text } = Typography

const DUTY_STEPS = ['未開始', '進行中', '完結審核', '已完結']
const statusToStep = (s: number) => ({ 6: 0, 1: 1, 2: 2, 3: 3 }[s] ?? 0)
const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return null
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">已超期 {Math.abs(days)} 天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">剩 {days} 天</span>
}

interface Props {
  open: boolean
  dutyId: string | null
  onClose: () => void
}

const normalizeCooperator = (c: unknown): string[] => {
  if (!c) return []
  if (Array.isArray(c)) return c as string[]
  if (typeof c === 'string') { try { const p = JSON.parse(c); return Array.isArray(p) ? p : [c] } catch { return [c] } }
  return []
}

const DutyDetailDrawer: React.FC<Props> = ({ open, dutyId, onClose }) => {
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

  // 進度說明展開編輯
  const [expandOpen,  setExpandOpen]  = useState(false)
  const [expandDraft, setExpandDraft] = useState('')

  // 進度達100%提示
  const [show100Prompt, setShow100Prompt] = useState(false)

  // 需求任務完結確認（需求責任人資訊）
  const [reqResponsible,         setReqResponsible]         = useState<string[]>([])
  const [showReqCompleteConfirm, setShowReqCompleteConfirm] = useState(false)

  // 需求任務提交審核
  const [showReqReviewModal,        setShowReqReviewModal]        = useState(false)
  const [reqReviewers,              setReqReviewers]              = useState<UserProfile[]>([])
  const [reqReviewersLoading,       setReqReviewersLoading]       = useState(false)
  const [reqReviewSearch,           setReqReviewSearch]           = useState('')
  const [reqReviewSearchResults,    setReqReviewSearchResults]    = useState<UserProfile[]>([])
  const [reqReviewSearchLoading,    setReqReviewSearchLoading]    = useState(false)
  const [reqReviewSaving,           setReqReviewSaving]           = useState(false)

  useEffect(() => {
    if (!open || !dutyId) { setDuty(null); setRecords([]); return }
    setLoading(true)
    setShowForm(false)
    form.resetFields()
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
    try { await action(); await reloadDuty() }
    catch { /* global toast */ }
    finally { setIsActing(false) }
  }, [reloadDuty])

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
      showToast.success('任務資訊已更新')
      setShowEditModal(false)
      await reloadDuty()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [duty, editForm, reloadDuty])

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
      showToast.success('任務已激活')
      setShowActivateModal(false)
      activateForm.resetFields()
      await reloadDuty()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [duty, activateForm, reloadDuty])

  const openSubmitModal = useCallback(async () => {
    if (duty?.standalone_req_id) {
      // 需求任務：由後端自動決定審核人或直接完結，只需確認
      setShowReqCompleteConfirm(true)
    } else {
      // AR任務：手動選審核人
      setSelectedReviewers([])
      setShowSubmitModal(true)
      ensureUserOptions()
    }
  }, [duty?.standalone_req_id, ensureUserOptions])

  const handleReschedule = useCallback(async () => {
    const values = await rescheduleForm.validateFields()
    if (!duty) return
    setIsRescheduling(true)
    try {
      await dutyApi.reschedule(duty.id, values.new_end_date, values.reason)
      showToast.success('延期成功')
      setShowRescheduleModal(false)
      rescheduleForm.resetFields()
      await reloadDuty()
    } catch { /* global */ }
    finally { setIsRescheduling(false) }
  }, [duty, rescheduleForm, reloadDuty])

  const handleSubmitCompletion = useCallback(async () => {
    if (!dutyId || selectedReviewers.length === 0) return
    setIsActing(true)
    try {
      await dutyApi.submitCompletion(dutyId, selectedReviewers)
      showToast.success('已提交完結審核')
      setShowSubmitModal(false)
      await reloadDuty()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [dutyId, selectedReviewers, reloadDuty])

  const handleReqCompleteConfirm = useCallback(async () => {
    if (!dutyId) return
    setIsActing(true)
    try {
      const res = await dutyApi.submitCompletion(dutyId, [])
      const c = res.content as { direct?: boolean }
      showToast.success(c.direct ? '任務已直接完結' : '已提交完結審核，等待需求責任人審核')
      setShowReqCompleteConfirm(false)
      await reloadDuty()
    } catch { /* global */ }
    finally { setIsActing(false) }
  }, [dutyId, reloadDuty])

  const openReqReviewModal = useCallback(async () => {
    setReqReviewers([])
    setReqReviewSearch('')
    setReqReviewSearchResults([])
    setShowReqReviewModal(true)
    setReqReviewersLoading(true)
    try {
      const res = await userApi.getSupervisors(workNo ?? '')
      setReqReviewers((Array.isArray(res.content) ? res.content : []) as UserProfile[])
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
      showToast.success('已提交審核')
      setShowReqReviewModal(false)
      await reloadDuty()
    } catch { /* global */ }
    finally { setReqReviewSaving(false) }
  }, [duty, reqReviewers, reloadDuty])

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
      }, Object.keys(files).length > 0 ? files : undefined)
      showToast.success('進度更新成功')
      setShowForm(false); form.resetFields(); setFileList([])
      loadProgress()
      const dutyRes = await dutyApi.get(dutyId)
      setDuty(dutyRes.content as TemporaryDuty)
      if (Number(values.progress) === 100) {
        setShow100Prompt(true)
      }
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const priorityColor = PRIORITY_COLORS[duty?.priority ?? 0] ?? '#94a3b8'
  const statusInfo    = duty ? DUTY_STATUS_MAP[duty.status] : null
  const dotColorMap: Record<string, string> = {
    default: '#94a3b8', processing: '#2563eb', orange: '#d97706',
    success: '#16a34a', warning: '#f59e0b', error: '#dc2626',
  }

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
          </div>
        ) : 'AR詳情'
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
              {/* 延期：超時 + 進行中/未開始（非搁置）+ 需求任務需求責任人/普通AR建立人或負責人 */}
              {isOverdue && [1, 6].includes(duty.status) && canReqHold && (
                <Button size="small" onClick={() => {
                  rescheduleForm.setFieldsValue({ new_end_date: '', reason: '' })
                  setShowRescheduleModal(true)
                }}>延期</Button>
              )}
              {/* 擱置 */}
              {[1, 6].includes(duty.status) && canReqHold && (
                <Popconfirm title="確認擱置此任務？" onConfirm={() => doAction(() => dutyApi.hold(duty.id))} okText="確認" cancelText="取消">
                  <Button size="small" loading={isActing}>擱置</Button>
                </Popconfirm>
              )}
              {/* 恢復 */}
              {duty.status === 8 && canReqHold && (
                <Button size="small" loading={isActing} onClick={() => doAction(() => dutyApi.resume(duty.id))}>
                  恢復進行中
                </Button>
              )}
              {/* 更新進度 */}
              {(duty.status === 1 || duty.status === 6) && isResponsible && (
                <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
                  style={{ background: '#2563eb' }} onClick={() => { setShowForm((v) => !v); ensureUserOptions() }}>
                  更新進度
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
        <Empty description="任務不存在" className="mt-16" />
      ) : (
        <div className="space-y-4">
          {/* Status badge row */}
          <Space wrap>
            {statusInfo && (
              <div className="flex items-center gap-1.5">
                <span className="status-dot" style={{ background: dotColorMap[statusInfo.color] ?? '#94a3b8' }} />
                <span className="text-sm text-slate-500">{statusInfo.label}</span>
              </div>
            )}
            {(() => { const p = PRIORITY_MAP[duty.priority]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : null })()}
            <DaysLeftBadge date={duty.expected_end_date} />
          </Space>

          {/* Action buttons — 草稿階段操作 */}
          {(() => {
            const isCreator = workNo?.toLowerCase() === duty.creator?.toLowerCase()
            const isResponsible = (duty.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? ''))
            const canAct = isCreator || isResponsible
            if (duty.status !== 0 || !canAct) return null
            return (
              <div className="flex flex-wrap gap-2 mb-1">
                <Button size="small" onClick={openEditModal}>編輯資訊</Button>
                {duty.standalone_req_id && (
                  <Button type="primary" size="small" style={{ background: '#7c3aed' }} onClick={openReqReviewModal}>
                    提交審核
                  </Button>
                )}
                {!duty.standalone_req_id && (
                  <Button type="primary" size="small" loading={isActing} style={{ background: '#2563eb' }} onClick={openActivateModal}>
                    激活任務
                  </Button>
                )}
              </div>
            )
          })()}

          {/* Status steps */}
          {(duty.status === 6 || (duty.status >= 1 && duty.status <= 3)) && (
            <Card bordered={false} className="shadow-sm" styles={{ body: { padding: '14px 20px' } }}>
              <Steps size="small" current={statusToStep(duty.status)}
                items={DUTY_STEPS.map((t) => ({ title: <span style={{ fontSize: 12 }}>{t}</span> }))} />
              <div className="flex items-center gap-3 mt-3">
                <span className="text-xs text-slate-400 w-14">整體進度</span>
                <Progress percent={duty.progress ?? 0} size="small" strokeColor="#2563eb" trailColor="#e2e8f0"
                  style={{ flex: 1, marginBottom: 0 }} />
              </div>
            </Card>
          )}

          {/* Info */}
          <Card bordered={false} className="shadow-sm" styles={{ body: { padding: 20 } }}>
            <Descriptions column={2} size="small"
              labelStyle={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}
              contentStyle={{ fontSize: 13, color: '#334155' }}>
              <Descriptions.Item label="建立人">{toName(duty.creator)}</Descriptions.Item>
              <Descriptions.Item label="負責人">
                {duty.responsible?.length
                  ? <div className="flex items-center gap-1.5">
                      <Avatar size={18} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>
                        {duty.responsible[0]?.[0]?.toUpperCase()}
                      </Avatar>
                      <span>{duty.responsible.map((wn) => toName(wn)).join(', ')}</span>
                    </div>
                  : <span className="text-slate-300">未分配</span>}
              </Descriptions.Item>
              <Descriptions.Item label="預計開始">{duty.expected_start_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="預計完成">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{duty.expected_end_date || '—'}</span>
                  {(duty.reschedule_count ?? 0) > 0 && (
                    <>
                      <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                        已延期 {duty.reschedule_count} 次
                      </Tag>
                      <span className="text-[10px] text-slate-400">原始: {duty.original_end_date || '—'}</span>
                    </>
                  )}
                </div>
              </Descriptions.Item>
              {duty.group && (
                <Descriptions.Item label="任務分組">
                  <Tag color="processing" style={{ fontSize: 11 }}>{duty.group}</Tag>
                </Descriptions.Item>
              )}
              {duty.system_nm && (
                <Descriptions.Item label="關聯系統">
                  <span className="text-blue-600 text-xs">{duty.system_nm}</span>
                </Descriptions.Item>
              )}
              {duty.describe && (
                <Descriptions.Item label="描述" span={2}><RichTextContent html={duty.describe} /></Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Reschedule history */}
          {(duty.reschedule_history ?? []).length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3">
              <p className="text-[11px] font-semibold text-orange-700 mb-2">延期記錄</p>
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
            bordered={false} className="shadow-sm"
            title={
              <span className="font-semibold text-slate-700 text-sm">
                進度記錄（共 {records.length} 條）
                {logEntries.length > 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                    · 含 {logEntries.length} 條日誌記錄
                  </span>
                )}
              </span>
            }
          >
            {showForm && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                  <div className="grid grid-cols-2 gap-x-3">
                    <Form.Item name="progress" label="完成 (%)" rules={[{ required: true }]}>
                      <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter="%" />
                    </Form.Item>
                    <Form.Item name="time_consum" label="耗時 (h)">
                      <InputNumber min={0} step={0.5} style={{ width: '100%' }} addonAfter="h" />
                    </Form.Item>
                  </div>
                  <Form.Item
                    name="progress_record"
                    label={
                      <div className="flex items-center justify-between w-full">
                        <span>進度說明</span>
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
                          展開編輯
                        </button>
                      </div>
                    }
                  >
                    <RichTextEditor
                      placeholder="本次完成了哪些工作...（支援格式化文字與圖片混排）"
                      minHeight={120}
                      onImageUpload={handleImageUpload}
                    />
                  </Form.Item>
                  <Form.Item name="cooperator" label="合作人">
                    <Select
                      mode="multiple"
                      showSearch
                      placeholder="搜尋並選擇合作人（選填）"
                      optionFilterProp="label"
                      options={userOptions.filter((u) => u.value.toLowerCase() !== (workNo ?? '').toLowerCase())}
                      allowClear
                    />
                  </Form.Item>
                  <Form.Item label="附件（非圖片文件）">
                    <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.md">
                      <Button icon={<PaperClipIcon className="w-4 h-4" />} size="small">選擇附件</Button>
                    </Upload>
                  </Form.Item>
                  <div className="flex justify-end gap-2">
                    <Button size="small" onClick={() => { setShowForm(false); form.resetFields(); setFileList([]) }}>取消</Button>
                    <Button type="primary" size="small" htmlType="submit" loading={isSaving} style={{ background: '#2563eb' }}>提交</Button>
                  </div>
                </Form>
              </div>
            )}

            {records.length === 0 && logEntries.length === 0 ? (
              <Text type="secondary" className="block text-center py-8 text-sm">暫無進度記錄</Text>
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
                                <Tooltip title={`合作人：${((item.cooperator as string[] | undefined) ?? []).map((c) => toName(c) || c).join('、')}`}>
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
                                  {latestUpd.log_status === 2 ? '已提交' : '草稿'}
                                </Tag>
                                <Tag color="orange" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>日誌更新</Tag>
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
                                        <Tag color="red" style={{ fontSize: 9, padding: '0 4px', lineHeight: '14px', flexShrink: 0 }}>已刪除</Tag>
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
                                    <Tag color="purple" style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', margin: 0 }}>合作人更新</Tag>
                                    <Tag style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                      {upd.log_status === 2 ? '已提交' : '草稿'}
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
                                {e.log_status === 2 ? '已提交' : '草稿'}
                              </Tag>
                              <Tag color="green" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>日誌新增</Tag>
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
        title="編輯任務資訊"
        open={showEditModal}
        onCancel={() => setShowEditModal(false)}
        onOk={handleEdit}
        okText="儲存"
        cancelText="取消"
        okButtonProps={{ loading: isActing, style: { background: '#2563eb' } }}
        width="min(680px, 88vw)"
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" className="mt-3">
          <Form.Item name="duty_nm" label="任務名稱" rules={[{ required: true }]}>
            <Input placeholder="請輸入任務名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]}>
              <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
            </Form.Item>
            <Form.Item name="group" label="任務分組">
              <AutoComplete
                options={[]}
                placeholder="選擇或輸入分組"
              />
            </Form.Item>
          </div>
          <Form.Item name="responsible" label="負責人">
            <Select
              mode="multiple"
              placeholder="選擇負責人"
              options={userOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="expected_start_date" label="預計開始">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="system_id" label="關聯系統">
            <Select
              placeholder="選擇關聯系統（選填）"
              options={systemOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
              onDropdownVisibleChange={(open) => {
                if (open && systemOptions.length === 0) {
                  systemApi.list({ page: 1, size: 200 }).then((res) => {
                    const c = res.content as { data_list: SystemItem[] }
                    setSystemOptions((c.data_list ?? []).map((s) => ({ value: s.id, label: s.sys_nm })))
                  }).catch(() => {})
                }
              }}
            />
          </Form.Item>
          <Form.Item name="describe" label="任務描述">
            <Input.TextArea rows={3} placeholder="請描述任務內容" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="激活任務 — 補充必填資訊"
        open={showActivateModal}
        onCancel={() => setShowActivateModal(false)}
        onOk={handleActivate}
        okText="確認激活"
        cancelText="取消"
        okButtonProps={{ loading: isActing, style: { background: '#2563eb' } }}
        destroyOnHidden
      >
        <p className="text-sm text-slate-500 mb-4">激活前需指定負責人及預計時間。</p>
        <Form form={activateForm} layout="vertical">
          <Form.Item name="responsible" label="負責人" rules={[{ required: true, message: '請指定負責人' }]}>
            <Select
              mode="multiple"
              placeholder="選擇負責人"
              options={userOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="expected_start_date" label="預計開始" rules={[{ required: true, message: '請設定預計開始' }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成" rules={[{ required: true, message: '請設定預計完成' }]}>
              <Input type="date" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title="提交完結審核"
        open={showSubmitModal}
        onCancel={() => setShowSubmitModal(false)}
        onOk={handleSubmitCompletion}
        okText="提交"
        cancelText="取消"
        okButtonProps={{ disabled: selectedReviewers.length === 0, loading: isActing, style: { background: '#2563eb' } }}
      >
        <p className="text-sm text-slate-500 mb-3">請選擇審核人，審核通過後任務將自動標記為「已完結」。</p>
        <Select
          mode="multiple"
          placeholder="選擇審核人（可多選）"
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
        title="延期任務"
        open={showRescheduleModal}
        onCancel={() => { setShowRescheduleModal(false); rescheduleForm.resetFields() }}
        onOk={handleReschedule}
        okText="確認延期"
        cancelText="取消"
        okButtonProps={{ loading: isRescheduling, danger: true }}
      >
        <p className="text-sm text-slate-500 mb-3">
          當前預計完成：<span className="font-semibold text-orange-600">{duty?.expected_end_date || '—'}</span>
        </p>
        <Form form={rescheduleForm} layout="vertical">
          <Form.Item name="new_end_date" label="新的預計完成日期" rules={[{ required: true, message: '請選擇新日期' }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="延期原因">
            <Input.TextArea rows={2} placeholder="說明延期原因（選填）" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 需求任務提交審核 Modal */}
      <Modal
        title="提交需求任務審核"
        open={showReqReviewModal}
        onCancel={() => setShowReqReviewModal(false)}
        footer={null} width={520} destroyOnClose
      >
        <div className="mt-4 space-y-4">
          <div className="text-xs text-slate-400">審核人將依序審核，通過後任務將進入進行中狀態。</div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">審核流程</div>
            {reqReviewersLoading ? (
              <div className="flex justify-center py-4"><Spin size="small" /></div>
            ) : reqReviewers.length === 0 ? (
              <div className="border border-dashed border-slate-300 rounded-lg py-5 text-center text-slate-400 text-sm">
                尚未添加審核人，請搜尋並加入
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
                      <Button size="small" type="text" danger icon={<TrashIcon className="w-3.5 h-3.5" />}
                        onClick={() => setReqReviewers((prev) => prev.filter((u) => u.work_no !== r.work_no))} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm font-medium text-slate-600 mb-2">加簽審核人</div>
            <div className="relative">
              <Input placeholder="輸入姓名或工號搜尋" value={reqReviewSearch}
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
            <Button onClick={() => setShowReqReviewModal(false)}>取消</Button>
            <Button type="primary" loading={reqReviewSaving} disabled={reqReviewers.length === 0}
              style={{ background: '#7c3aed' }}
              onClick={handleSubmitReqReview}>
              提交審核
            </Button>
          </div>
        </div>
      </Modal>

      {/* 進度100%完結提示 Modal */}
      {(() => {
        const isReqTask = !!duty?.standalone_req_id
        const isReqResp = isReqTask && reqResponsible.some((w) => w.toLowerCase() === (workNo ?? '').toLowerCase())
        return (
          <Modal
            title={
              <div className="flex items-center gap-2">
                <span className="text-lg">🎉</span>
                <span>任務進度已達100%</span>
              </div>
            }
            open={show100Prompt}
            onOk={() => { setShow100Prompt(false); openSubmitModal() }}
            onCancel={() => setShow100Prompt(false)}
            okText={isReqResp ? '確認完結' : '立即提交完結'}
            cancelText="稍後再說"
            okButtonProps={{ style: { background: '#16a34a' } }}
            width={400}
          >
            <p className="text-sm text-slate-600 mt-2">
              {isReqTask
                ? isReqResp
                  ? '您是此需求的責任人，確認後任務將直接標記為「已完結」，無需審核。'
                  : `任務完結申請將提交給需求責任人（${reqResponsible.map((w) => toName(w) || w).join('、')}）審核通過後完結。`
                : '是否立即提交完結審核，讓審核人確認任務完成？'}
            </p>
          </Modal>
        )
      })()}

      {/* 需求任務完結確認 Modal（非100%觸發，由 openSubmitModal 直接開啟） */}
      {(() => {
        const isReqResp = reqResponsible.some((w) => w.toLowerCase() === (workNo ?? '').toLowerCase())
        return (
          <Modal
            title="確認完結任務"
            open={showReqCompleteConfirm}
            onOk={handleReqCompleteConfirm}
            onCancel={() => setShowReqCompleteConfirm(false)}
            okText={isReqResp ? '直接完結' : '提交審核'}
            cancelText="取消"
            confirmLoading={isActing}
            okButtonProps={{ style: { background: '#16a34a' } }}
            width={400}
          >
            <p className="text-sm text-slate-600 mt-2">
              {isReqResp
                ? '您是此需求的責任人，確認後任務將直接標記為「已完結」，無需審核。'
                : `任務完結申請將提交給需求責任人（${reqResponsible.map((w) => toName(w) || w).join('、')}）審核通過後完結。`}
            </p>
          </Modal>
        )
      })()}

      {/* 進度說明展開編輯 Modal */}
      <Modal
        open={expandOpen}
        title="進度說明"
        onCancel={() => setExpandOpen(false)}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setExpandOpen(false)}>取消</Button>
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => {
              form.setFieldValue('progress_record', expandDraft)
              setExpandOpen(false)
            }}>完成</Button>
          </div>
        }
        destroyOnClose
      >
        <RichTextEditor
          value={expandDraft}
          onChange={setExpandDraft}
          placeholder="本次完成了哪些工作...（支援格式化文字與圖片混排）"
          minHeight={480}
          onImageUpload={handleImageUpload}
        />
      </Modal>
    </Drawer>
    </>
  )
}

export default DutyDetailDrawer
