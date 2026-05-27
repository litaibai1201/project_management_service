import React, { useEffect, useState, useCallback } from 'react'
import {
  Drawer, Descriptions, Button, Tag, Progress, Spin, Empty, Avatar,
  Typography, Space, Form, Input, InputNumber, Upload, Timeline,
  Card, Steps, Modal, Select, Popconfirm, AutoComplete, Tooltip,
} from 'antd'
import type { UploadFile } from 'antd'
import { PlusIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { userApi } from '@/api/user.api'
import { projectApi } from '@/api/project.api'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import type { FileInfo, TemporaryDuty } from '@/types/api.types'
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

const DUTY_STEPS = ['進行中', '完結審核', '已完結']
const statusToStep = (s: number) => ({ 1: 0, 2: 1, 3: 2 }[s] ?? 0)
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
  const [projectOptions, setProjectOptions]     = useState<{ value: string; label: string }[]>([])

  // 提交完結審核
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [reviewerOptions, setReviewerOptions] = useState<{ value: string; label: string }[]>([])
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([])
  const [userOptions, setUserOptions]             = useState<{ value: string; label: string }[]>([])

  // 延期
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleForm]                              = Form.useForm()
  const [isRescheduling, setIsRescheduling]           = useState(false)

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
      setDuty(dutyRes.content as TemporaryDuty)
      const rawRecords = ((progRes.content as { data_list?: Record<string, unknown>[] }).data_list) ?? []
      setRecords(rawRecords.map((r) => ({ ...r, cooperator: normalizeCooperator(r.cooperator) })))
      setLogEntries(logRes.content ?? [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [open, dutyId])

  const reloadDuty = useCallback(async () => {
    if (!dutyId) return
    const res = await dutyApi.get(dutyId)
    setDuty(res.content as TemporaryDuty)
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
      project_id:           duty.project_id ?? '',
      priority:             duty.priority,
      responsible:          duty.responsible ?? [],
      expected_start_date:  duty.expected_start_date ?? '',
      expected_end_date:    duty.expected_end_date ?? '',
    })
    ensureUserOptions()
    if (projectOptions.length === 0) {
      projectApi.list({ page: 1, size: 200 }).then((res) => {
        const c = res.content as { project_list?: { id: string; project_nm: string }[]; data_list?: { id: string; project_nm: string }[] }
        const data = c.project_list ?? c.data_list ?? []
        setProjectOptions(data.map((p) => ({ value: p.id, label: p.project_nm })))
      }).catch(() => {})
    }
    setShowEditModal(true)
  }, [duty, editForm, ensureUserOptions, projectOptions.length])

  const handleEdit = useCallback(async () => {
    const values = await editForm.validateFields()
    setIsActing(true)
    try {
      await dutyApi.update(duty!.id, {
        duty_nm:              values.duty_nm,
        describe:             values.describe,
        group:                values.group,
        project_id:           values.project_id,
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
    setSelectedReviewers([])
    setShowSubmitModal(true)
    ensureUserOptions()
  }, [ensureUserOptions])

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
      // 刷新整体进度
      const dutyRes = await dutyApi.get(dutyId)
      setDuty(dutyRes.content as TemporaryDuty)
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
        ) : '臨時任務詳情'
      }
      styles={{ body: { padding: '16px 24px', overflowY: 'auto' } }}
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

          {/* Action buttons */}
          {(() => {
            const isCreator = workNo?.toLowerCase() === duty.creator?.toLowerCase()
            const isResponsible = (duty.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? ''))
            const effectiveEnd = duty.expected_end_date
            const isOverdue = effectiveEnd && new Date(effectiveEnd) < new Date(new Date().toISOString().slice(0, 10))
            const canAct = isCreator || isResponsible
            return (
              <div className="flex flex-wrap gap-2 mb-1">
                {/* 編輯：草稿 + 建立人或負責人 */}
                {duty.status === 0 && canAct && (
                  <Button size="small" onClick={openEditModal}>編輯資訊</Button>
                )}
                {/* 激活：草稿 + 建立人或負責人 */}
                {duty.status === 0 && canAct && (
                  <Button type="primary" size="small" loading={isActing}
                    style={{ background: '#2563eb' }}
                    onClick={openActivateModal}>
                    激活任務
                  </Button>
                )}
                {/* 延期：超時 + 進行中/搁置 + 建立人或負責人 */}
                {isOverdue && [1, 8].includes(duty.status) && canAct && (
                  <Button size="small" danger onClick={() => {
                    rescheduleForm.setFieldsValue({ new_end_date: '', reason: '' })
                    setShowRescheduleModal(true)
                  }}>
                    延期
                  </Button>
                )}
                {/* 提交完結：進行中 + 負責人 */}
                {duty.status === 1 && isResponsible && (
                  <Button type="primary" size="small" loading={isActing}
                    style={{ background: '#16a34a' }}
                    onClick={openSubmitModal}>
                    提交完結
                  </Button>
                )}
                {/* 擱置：進行中 + 建立人 */}
                {duty.status === 1 && isCreator && (
                  <Popconfirm title="確認擱置此任務？" onConfirm={() => doAction(() => dutyApi.hold(duty.id))} okText="確認" cancelText="取消">
                    <Button size="small" loading={isActing}>擱置</Button>
                  </Popconfirm>
                )}
                {/* 恢復：擱置 + 建立人 */}
                {duty.status === 8 && isCreator && (
                  <Button size="small" loading={isActing}
                    onClick={() => doAction(() => dutyApi.resume(duty.id))}>
                    恢復進行中
                  </Button>
                )}
              </div>
            )
          })()}

          {/* Status steps */}
          {duty.status >= 1 && duty.status <= 3 && (
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
              {duty.project_nm && (
                <Descriptions.Item label="關聯專案">
                  <span className="text-blue-600 text-xs">{duty.project_nm}</span>
                </Descriptions.Item>
              )}
              {duty.describe && (
                <Descriptions.Item label="描述" span={2}>{duty.describe}</Descriptions.Item>
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
            extra={
              duty.status === 1 && (duty.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? '')) && (
                <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
                  style={{ background: '#2563eb' }} onClick={() => { setShowForm((v) => !v); ensureUserOptions() }}>
                  更新進度
                </Button>
              )
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
                  <Form.Item name="progress_record" label="進度說明">
                    <Input.TextArea rows={2} placeholder="本次完成了哪些工作..." />
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
                  <Form.Item label="附件">
                    <Upload fileList={fileList} onChange={({ fileList: fl }) => setFileList(fl)} beforeUpload={() => false} multiple>
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
                            return (
                              <p className="text-sm mt-1 mb-0 leading-snug"
                                style={{ color: origChanged ? '#94a3b8' : '#475569', textDecoration: origChanged ? 'line-through' : 'none', margin: '4px 0 0 0' }}>
                                {origText}
                              </p>
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
                                    {ownUpdates[idx - 1].description}
                                  </p>
                                )}
                                {descChanged && (
                                  <p className="text-sm leading-tight"
                                    style={{ color: isLatest ? '#334155' : '#94a3b8', textDecoration: isLatest ? 'none' : 'line-through', margin: '2px 0 0 0' }}>
                                    {upd.description}
                                  </p>
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
                                  <p className="text-sm text-slate-600 leading-snug" style={{ margin: '0 0 4px 0' }}>{upd.description}</p>
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
                          {e.description && <p className="text-sm text-slate-600 mt-1 mb-1 leading-tight">{e.description}</p>}
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
          <Form.Item name="project_id" label="關聯專案" extra="選填，僅作標記參考">
            <Select
              placeholder="選擇關聯專案（選填）"
              options={projectOptions}
              showSearch
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              allowClear
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
    </Drawer>
    </>
  )
}

export default DutyDetailDrawer
