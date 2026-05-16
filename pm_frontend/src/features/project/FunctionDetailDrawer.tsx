import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Drawer, Descriptions, Progress, Button, Form, Input, InputNumber,
  Timeline, Avatar, Typography, Tag, Upload, Spin, Divider, Steps, Select, Modal, Popover, Tooltip,
} from 'antd'
import { PlusIcon, PaperClipIcon, PencilSquareIcon, CalendarDaysIcon, ClockIcon } from '@heroicons/react/24/outline'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import FilePreviewModal from './FilePreviewModal'
import type { UploadFile } from 'antd'
import { projectApi } from '@/api/project.api'
import { userApi } from '@/api/user.api'
import { dailyLogApi } from '@/api/daily_log.api'
import type { TaskLogEntry } from '@/api/daily_log.api'
import { tokenStorage } from '@/api/httpClient'
import { ProjectFunction, ProgressRecord, FileInfo } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'

const { Text } = Typography

export interface FunctionDetailDrawerProps {
  projectId:      string
  functionId:     string
  open:           boolean
  onClose:        () => void
  onRefresh?:     () => void
  isProjectPm?:   boolean
  projectStatus?: number
  projectPm?:     string
}

// ─── Reschedule (delay) button component ─────────────────────────────────────
const RescheduleButton: React.FC<{
  projectId: string
  functionId: string
  currentEnd: string
  onSuccess: () => void
}> = ({ projectId, functionId, currentEnd, onSuccess }) => {
  const [open, setOpen] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!newDate) { showToast.warning('請選擇新的預計完成時間'); return }
    if (newDate <= currentEnd) { showToast.warning('新日期必須晚於當前預計完成時間'); return }
    setLoading(true)
    try {
      await projectApi.rescheduleFunction(projectId, functionId, { new_end_date: newDate, reason })
      showToast.success('延期成功')
      setOpen(false); setNewDate(''); setReason('')
      onSuccess()
    } catch { showToast.error('延期失敗') }
    finally { setLoading(false) }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => { setOpen(v); if (!v) { setNewDate(''); setReason('') } }}
      trigger="click"
      placement="bottomLeft"
      title={
        <div className="flex items-center gap-2">
          <CalendarDaysIcon className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-semibold text-slate-700">任務延期</span>
          <span className="text-[10px] text-slate-400">當前截止: {currentEnd}</span>
        </div>
      }
      content={
        <div className="w-64">
          <div className="mb-2">
            <label className="text-[10px] text-slate-500 block mb-1">新的預計完成時間</label>
            <Input type="date" size="small" value={newDate} onChange={(e) => setNewDate(e.target.value)} min={currentEnd} />
          </div>
          <div className="mb-2">
            <label className="text-[10px] text-slate-500 block mb-1">延期原因（選填）</label>
            <Input.TextArea rows={2} size="small" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="說明延期原因..." />
          </div>
          <div className="flex justify-end gap-1.5">
            <Button size="small" onClick={() => setOpen(false)}>取消</Button>
            <Button size="small" type="primary" loading={loading} onClick={handleSubmit} style={{ background: '#d97706' }}>確認延期</Button>
          </div>
        </div>
      }
    >
      <Button size="small" type="text" danger className="mb-3" icon={<ClockIcon className="w-3.5 h-3.5" />}>
        任務已超期，點擊延期
      </Button>
    </Popover>
  )
}

// Allowed file extensions (must match backend UPLOAD_ALLOWED_EXTENSIONS)
const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'yaml', 'yml', 'csv', 'html', 'htm',
])

// Map function status to Steps index
const FUNC_STEPS = ['待開始', '進行中', '完結審核', '已完結']
const statusToStep = (s: number) => ({ 1: 0, 2: 1, 3: 2, 4: 3 }[s] ?? 0)

const PRIORITY_OPTIONS = [
  { value: 1, label: '低' }, { value: 2, label: '中' },
  { value: 3, label: '高' }, { value: 4, label: '緊急' },
]

const PAGE_SIZE = 10

const FunctionDetailDrawer: React.FC<FunctionDetailDrawerProps> = ({
  projectId, functionId, open, onClose, onRefresh, isProjectPm = false, projectStatus, projectPm,
}) => {
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const toName = useWorkNoToName()
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null)
  const [userOpts,        setUserOpts]        = useState<{ value: string; label: string }[]>([])
  const [funcData,        setFuncData]        = useState<ProjectFunction | null>(null)
  const [records,         setRecords]         = useState<ProgressRecord[]>([])
  const [progressPage,    setProgressPage]    = useState(1)
  const [progressTotal,   setProgressTotal]   = useState(0)
  const [progressLoading, setProgressLoading] = useState(false)
  const [logEntries,      setLogEntries]      = useState<TaskLogEntry[]>([])
  const [isLoading,       setIsLoading]       = useState(false)
  const [isSaving,        setIsSaving]        = useState(false)
  const [showForm,        setShowForm]        = useState(false)
  const [showEdit,        setShowEdit]        = useState(false)
  const [editSaving,      setEditSaving]      = useState(false)
  const [fileList,        setFileList]        = useState<UploadFile[]>([])
  const [form]       = Form.useForm()
  const [editForm]   = Form.useForm()
  const sentinelRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    userApi.list({ size: 200 }).then((res) => {
      const list = (res as { content?: { data_list?: { work_no: string; name: string }[] } }).content?.data_list ?? []
      setUserOpts(list.map((u) => ({ value: u.work_no, label: u.name })))
    }).catch(() => {})
  }, [])

  useEffect(() => { if (open) loadData() }, [open, functionId])

  const normalizeCooperator = (c: unknown): string[] => {
    if (!c) return []
    if (Array.isArray(c)) return c as string[]
    if (typeof c === 'string') { try { const p = JSON.parse(c); return Array.isArray(p) ? p : [c] } catch { return [c] } }
    return []
  }

  const addTokenToFiles = (items: FileInfo[] | undefined): FileInfo[] => {
    if (!items?.length) return []
    const token = tokenStorage.get()
    return items.map((f) => ({ ...f, url: token ? `${f.url}?token=${token}` : f.url }))
  }

  const loadData = async () => {
    setIsLoading(true)
    setRecords([])
    setProgressPage(1)
    setProgressTotal(0)
    try {
      const [funcRes, progressRes, logRes] = await Promise.all([
        projectApi.getFunction(projectId, functionId),
        projectApi.getProgress(projectId, functionId, { page: 1, size: PAGE_SIZE }),
        dailyLogApi.taskEntries('project', functionId),
      ])
      setFuncData(funcRes.content)
      const c = progressRes.content as { data_list?: ProgressRecord[]; total_count?: number }
      const list = (c.data_list ?? []) as ProgressRecord[]
      setRecords(list.map((r) => ({ ...r, files: addTokenToFiles(r.files), cooperator: normalizeCooperator(r.cooperator) })))
      setProgressTotal(c.total_count ?? list.length)
      setLogEntries(logRes.content ?? [])
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  const loadMoreProgress = useCallback(async () => {
    if (progressLoading || records.length >= progressTotal) return
    const nextPage = progressPage + 1
    setProgressLoading(true)
    try {
      const res = await projectApi.getProgress(projectId, functionId, { page: nextPage, size: PAGE_SIZE })
      const c = res.content as { data_list?: ProgressRecord[]; total_count?: number }
      const list = (c.data_list ?? []) as ProgressRecord[]
      setRecords((prev) => [...prev, ...list.map((r) => ({ ...r, files: addTokenToFiles(r.files), cooperator: normalizeCooperator(r.cooperator) }))])
      setProgressPage(nextPage)
      if (c.total_count !== undefined) setProgressTotal(c.total_count)
    } catch { /* global */ }
    finally { setProgressLoading(false) }
  }, [progressLoading, records.length, progressTotal, progressPage, projectId, functionId])

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreProgress() },
      { threshold: 0.1 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMoreProgress])

  const handleSubmit = async (values: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const files: Record<string, File[]> = {}
      fileList.forEach((f) => { if (f.originFileObj) { if (!files.files) files.files = []; files.files.push(f.originFileObj) } })
      await projectApi.createProgress(projectId, functionId, {
        progress:        values.progress as number,
        progress_record: values.progress_record as string | undefined,
        time_consum:     values.time_consum as number | undefined,
        cooperator:      values.cooperator as string[] | undefined,
      }, Object.keys(files).length > 0 ? files : undefined)
      showToast.success('進度更新成功')
      setShowForm(false); form.resetFields(); setFileList([])
      loadData(); onRefresh?.()

      // 進度 100% → 詢問是否提交完結審核
      if ((values.progress as number) === 100) {
        const submitterIsPm = !!projectPm && workNo.toLowerCase() === projectPm.toLowerCase()
        Modal.confirm({
          title: '任務已完成',
          content: submitterIsPm
            ? '進度已達 100%，確認後將直接標記任務為已完結，後續無法繼續更新進度，是否繼續？'
            : `進度已達 100%，確認後將提交功能完結審核至專案 PM（${projectPm ?? ''}），審核通過後功能標記完結，後續無法繼續更新進度，是否繼續？`,
          okText: '確認完結',
          cancelText: '稍後再說',
          onOk: async () => {
            try {
              const res = await projectApi.submitFunctionCompletion(projectId, functionId)
              const direct = (res.content as { direct_complete?: boolean })?.direct_complete
              showToast.success(direct ? '任務已完結' : '完結審核已提交至專案 PM，等待審核')
              loadData(); onRefresh?.()
            } catch { /* global */ }
          },
        })
      }
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const handleEditOpen = () => {
    if (!funcData) return
    editForm.setFieldsValue({
      function_nm:         funcData.function_nm,
      describe:            funcData.describe,
      responsible:         funcData.responsible,
      priority:            funcData.priority,
      group1:              funcData.group1,
      expected_start_date: funcData.expected_start_date,
      expected_end_date:   funcData.expected_end_date,
    })
    setShowEdit(true)
  }

  const handleEditSave = async (values: Record<string, unknown>) => {
    setEditSaving(true)
    try {
      await projectApi.updateFunction(projectId, functionId, values as Parameters<typeof projectApi.updateFunction>[2])
      showToast.success('任務已更新')
      setShowEdit(false)
      loadData()
      onRefresh?.()
    } catch { /* global */ }
    finally { setEditSaving(false) }
  }

  const priorityColor = funcData ? ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed'][funcData.priority] ?? '#94a3b8' : '#94a3b8'
  const isCompleted       = funcData?.status === 4
  const isReviewing       = funcData?.status === 3
  const isResponsible     = (funcData?.responsible ?? []).map((r) => r.toLowerCase()).includes(workNo.toLowerCase())
  const canUpdateProgress = projectStatus === 5 && !isCompleted && !isReviewing && isResponsible
  const canEdit           = isProjectPm && !isCompleted

  const token = tokenStorage.get()
  const withToken = (url: string) => token ? `${url}?token=${token}` : url
  const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
  const splitFiles = (files: { name: string; url: string; size?: number }[] | undefined) => {
    const all = (files ?? []).map((f) => ({ ...f, url: withToken(f.url) }))
    return {
      images: all.filter((f) => IMG_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? '')),
      files:  all.filter((f) => !IMG_EXTS.has(f.name.split('.').pop()?.toLowerCase() ?? '')),
    }
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
      title={
        funcData ? (
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full" style={{ background: priorityColor }} />
            <span className="font-semibold text-slate-800">{funcData.function_nm}</span>
            {(() => { const s = FUNCTION_STATUS_MAP[funcData.status]; return s ? <Tag color={s.color} style={{ fontSize: 11, marginLeft: 4 }}>{s.label}</Tag> : null })()}
          </div>
        ) : '功能詳情'
      }
      open={open}
      onClose={onClose}
      width={560}
      extra={
        <div className="flex gap-2">
          {canEdit && (
            <Button icon={<PencilSquareIcon className="w-4 h-4" />} size="small" onClick={handleEditOpen}>
              編輯
            </Button>
          )}
          {canUpdateProgress && (
            <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
              style={{ background: '#2563eb' }} onClick={() => setShowForm((v) => !v)}>
              更新進度
            </Button>
          )}
        </div>
      }
    >
      {isLoading ? (
        <div className="flex justify-center items-center h-40"><Spin /></div>
      ) : funcData ? (
        <>
          {/* Status Steps */}
          <Steps
            size="small" current={statusToStep(funcData.status)}
            items={FUNC_STEPS.map((t) => ({ title: <span style={{ fontSize: 11 }}>{t}</span> }))}
            className="mb-4"
          />

          {/* Progress bar */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3 mb-4">
            <span className="text-xs text-slate-400 flex-shrink-0">整體進度</span>
            <Progress
              percent={funcData.progress ?? 0} size="small" strokeColor="#2563eb" trailColor="#e2e8f0"
              style={{ flex: 1, marginBottom: 0 }}
            />
          </div>

          {/* Meta info */}
          <Descriptions column={2} size="small" className="mb-4"
            labelStyle={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}
            contentStyle={{ fontSize: 13, color: '#334155' }}>
            <Descriptions.Item label="優先級">
              {(() => { const p = PRIORITY_MAP[funcData.priority]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : funcData.priority })()}
            </Descriptions.Item>
            <Descriptions.Item label="負責人">
              {funcData.responsible && funcData.responsible.length > 0
                ? funcData.responsible.map((wn) => (
                    <Tag key={wn} style={{ marginBottom: 2 }} color="purple">{toName(wn)}</Tag>
                  ))
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="分組">{funcData.group1 ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="預計開始">{funcData.expected_start_date ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="預計完成">
              <div className="flex items-center gap-2 flex-wrap">
                <span>{funcData.expected_end_date ?? '—'}</span>
                {(funcData.reschedule_count ?? 0) > 0 && (
                  <>
                    <Tooltip title={`原始預計完成: ${funcData.original_end_date ?? '—'}`}>
                      <Tag color="orange" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                        已延期 {funcData.reschedule_count} 次
                      </Tag>
                    </Tooltip>
                    <span className="text-[10px] text-slate-400">
                      原始: {funcData.original_end_date ?? '—'}
                    </span>
                  </>
                )}
              </div>
            </Descriptions.Item>
            {funcData.describe && (
              <Descriptions.Item label="描述" span={2}>{funcData.describe}</Descriptions.Item>
            )}
          </Descriptions>

          {/* ── Reschedule (delay) button — PM only, shown when task is overdue ── */}
          {(() => {
            const endStr = funcData.expected_end_date
            const isOverdue = endStr && new Date(endStr) < new Date(new Date().toISOString().slice(0, 10))
            const taskNotClosed = funcData.status !== 4 && funcData.status !== 9
            const isPm = !!projectPm && workNo.toLowerCase() === projectPm.toLowerCase()
            if (!isOverdue || !taskNotClosed || !isPm) return null
            return <RescheduleButton projectId={projectId} functionId={funcData.id} currentEnd={endStr} onSuccess={loadData} />
          })()}

          {/* ── Reschedule history timeline ── */}
          {(funcData.reschedule_history ?? []).length > 0 && (
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4">
              <p className="text-[11px] font-semibold text-orange-700 mb-2">延期記錄</p>
              <Timeline
                className="!mb-0"
                items={(funcData.reschedule_history ?? []).map((h, i) => ({
                  color: 'orange',
                  children: (
                    <div key={i} className="text-[11px] text-slate-600 leading-5">
                      <span className="text-slate-400">{h.date}</span>
                      {'　'}
                      <span className="line-through text-slate-400">{h.from}</span>
                      {' → '}
                      <span className="font-semibold text-orange-600">{h.to}</span>
                      {h.reason && (
                        <span className="text-slate-400 ml-1">（{h.reason}）</span>
                      )}
                      <span className="text-slate-300 ml-1">by {toName(h.operator)}</span>
                    </div>
                  ),
                }))}
              />
            </div>
          )}

          {/* Edit form — project PM only */}
          {showEdit && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
              <p className="font-semibold text-slate-700 text-sm mb-3">編輯任務資訊</p>
              <Form form={editForm} layout="vertical" onFinish={handleEditSave}>
                <Form.Item name="function_nm" label="功能名稱" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <div className="grid grid-cols-2 gap-x-3">
                  <Form.Item name="priority" label="優先級">
                    <Select options={PRIORITY_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="responsible" label="負責人工號">
                    <Input placeholder="請輸入工號" />
                  </Form.Item>
                  <Form.Item name="expected_start_date" label="預計開始">
                    <Input type="date" />
                  </Form.Item>
                  <Form.Item name="expected_end_date" label="預計完成">
                    <Input type="date" />
                  </Form.Item>
                </div>
                <Form.Item name="describe" label="功能描述">
                  <Input.TextArea rows={2} />
                </Form.Item>
                <div className="flex justify-end gap-2">
                  <Button size="small" onClick={() => setShowEdit(false)}>取消</Button>
                  <Button type="primary" size="small" htmlType="submit" loading={editSaving} style={{ background: '#2563eb' }}>儲存</Button>
                </div>
              </Form>
            </div>
          )}

          {/* Progress submit form */}
          {showForm && canUpdateProgress && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
              <p className="font-semibold text-slate-700 text-sm mb-3">提交本次進度</p>
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
                    options={userOpts.filter((u) => u.value.toLowerCase() !== workNo.toLowerCase())}
                    allowClear
                  />
                </Form.Item>
                <Form.Item label="附件">
                  <Upload
                    fileList={fileList}
                    onChange={({ fileList: fl }) => setFileList(fl)}
                    beforeUpload={(file) => {
                      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
                      if (!ALLOWED_EXTENSIONS.has(ext)) {
                        showToast.error(`不支持的文件類型：.${ext}`)
                        return Upload.LIST_IGNORE
                      }
                      return false
                    }}
                    multiple
                  >
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

          <Divider style={{ fontSize: 12, color: '#94a3b8' }}>
            進度記錄（共 {progressTotal} 條）
            {logEntries.length > 0 && (
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                · 含 {logEntries.length} 條日誌記錄
              </span>
            )}
          </Divider>

          {records.length === 0 && logEntries.length === 0 ? (
            <Text type="secondary" className="block text-center py-8 text-sm">暫無進度記錄</Text>
          ) : (() => {
            // ── 構建合併時間軸 ──────────────────────────────────────────
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
              | { kind: 'progress'; data: ProgressRecord; _sort: string }
              | { kind: 'manual';   data: TaskLogEntry;   _sort: string }

            const mixed: MixedItem[] = [
              ...records.map((r) => ({ kind: 'progress' as const, data: r, _sort: r.created_at ?? '' })),
              ...manualEntries.map((e) => ({
                kind: 'manual' as const,
                data: e,
                _sort: `${e.log_date} ${e.record_time ?? '00:00'}`,
              })),
            ].sort((a, b) => (a._sort > b._sort ? -1 : 1))  // 倒序：最新在上

            return (
              <>
                <Timeline
                  items={mixed.map(({ kind, data }) => {
                    if (kind === 'progress') {
                      const item = data as ProgressRecord
                      const allUpdates = updatedMap.get(item.progress_id) ?? []
                      // 分離：提交人自己的日誌更新 vs 合作人的日誌更新
                      const ownUpdates  = allUpdates.filter((e) => e.work_no === item.submitter)
                      const coopUpdates = allUpdates.filter((e) => e.work_no !== item.submitter)
                      return {
                        dot: (
                          <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                            {toName(item.submitter)?.[0]?.toUpperCase()}
                          </Avatar>
                        ),
                        children: (
                          <div className="pb-3">
                            {(() => {
                              const latestUpd = ownUpdates.length > 0 ? ownUpdates[ownUpdates.length - 1] : null
                              const origHours = Number(item.time_consum ?? 0)
                              const latestHours = latestUpd ? Number(latestUpd.work_hours ?? 0) : origHours
                              const hoursChanged = latestUpd && latestHours !== origHours
                              const origProgress = item.progress
                              const latestProgress = latestUpd?.progress
                              const progressChanged = latestUpd && latestProgress != null && latestProgress !== origProgress
                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-slate-700 text-sm">{toName(item.submitter)}</span>
                                    {(item.cooperator ?? []).length > 0 && (
                                      <Tooltip title={`合作人：${(item.cooperator ?? []).map((c) => toName(c) || c).join('、')}`}>
                                        <div className="flex items-center gap-0.5">
                                          <span className="text-xs text-slate-400">+</span>
                                          {(item.cooperator ?? []).map((c) => (
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
                              )
                            })()}
                            {/* 原始進度說明：只有第一條提交人自己的更新確實改了文字才劃線 */}
                            {item.progress_record && (() => {
                              const firstUpdDesc = ownUpdates[0]?.description ?? ''
                              const origChanged  = ownUpdates.length > 0 && firstUpdDesc !== item.progress_record
                              return (
                                <p className="text-sm mt-1 mb-0 leading-snug"
                                  style={{ color: origChanged ? '#94a3b8' : '#475569', textDecoration: origChanged ? 'line-through' : 'none', margin: '4px 0 0 0' }}>
                                  {item.progress_record}
                                </p>
                              )
                            })()}
                            {/* 提交人自己的日誌更新鏈 */}
                            {ownUpdates.map((upd, idx) => {
                              const isLatest    = idx === ownUpdates.length - 1
                              const prevDesc    = idx === 0 ? (item.progress_record ?? '') : (ownUpdates[idx - 1].description ?? '')
                              const descChanged = upd.description !== prevDesc
                              const prevRawFiles = idx === 0
                                ? (item.files ?? [])
                                : (ownUpdates[idx - 1].files ?? [])
                              const currRawFiles = (upd.files ?? [])
                              const prevNameSet = new Set(prevRawFiles.map((f) => f.name))
                              const currNameSet = new Set(currRawFiles.map((f) => f.name))
                              const addedFiles   = currRawFiles.filter((f) => !prevNameSet.has(f.name))
                              const removedFiles = prevRawFiles.filter((f) => !currNameSet.has(f.name))
                              const hasFileDiff  = addedFiles.length > 0 || removedFiles.length > 0
                              if (!descChanged && !hasFileDiff) return null
                              return (
                                <div key={upd.log_date}>
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
                            {/* 附件（原始） */}
                            <AttachmentPreview files={item.files} images={item.images} onPreview={setPreviewFile} />
                            {/* 時間戳放在附件下方 */}
                            <span className="text-xs text-slate-300 mt-1 block">{item.created_at}</span>
                            {/* 合作人的日誌更新（獨立顯示，不影響原始記錄） */}
                            {coopUpdates.map((upd) => {
                              const origNameSet = new Set((item.files ?? []).map((f) => f.name))
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
                                  {newFiles.length > 0 && (() => { const sf = splitFiles(newFiles); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                                  <span className="text-xs text-slate-300 block">{upd.log_date}{upd.record_time ? ` ${upd.record_time}` : ''}</span>
                                </div>
                              )
                            })}
                          </div>
                        ),
                      }
                    } else {
                      // manual 日誌新增
                      const entry = data as TaskLogEntry
                      const displayTime = entry.record_time
                        ? `${entry.log_date} ${entry.record_time}`
                        : entry.log_date
                      return {
                        dot: (
                          <Avatar size={26} style={{ background: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                            {toName(entry.work_no)?.[0]?.toUpperCase()}
                          </Avatar>
                        ),
                        children: (
                          <div className="pb-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-700 text-sm">{toName(entry.work_no)}</span>
                                {entry.progress != null && (
                                  <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{entry.progress}%</Tag>
                                )}
                                {Number(entry.work_hours) > 0 && (
                                  <Tag style={{ fontSize: 11, padding: '0 6px' }}>{entry.work_hours}h</Tag>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                  {entry.log_status === 2 ? '已提交' : '草稿'}
                                </Tag>
                                <Tag color="green" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>日誌新增</Tag>
                              </div>
                            </div>
                            {entry.description && (
                              <p className="text-sm text-slate-600 mt-1 mb-1 leading-tight">{entry.description}</p>
                            )}
                            {/* 附件 */}
                            {(() => { const sf = splitFiles(entry.files); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                            {/* 時間戳放在附件下方 */}
                            <span className="text-xs text-slate-300 mt-1 block">{displayTime}</span>
                          </div>
                        ),
                      }
                    }
                  })}
                />

                {/* 滾動哨兵：進入視口時觸發加載下一頁 */}
                <div ref={sentinelRef} className="h-1" />
                {progressLoading && (
                  <div className="flex justify-center py-3">
                    <Spin size="small" />
                  </div>
                )}
                {!progressLoading && records.length >= progressTotal && progressTotal > 0 && (
                  <p className="text-center text-xs text-slate-300 pb-2">已顯示全部 {progressTotal} 條記錄</p>
                )}
              </>
            )
          })()}
        </>
      ) : (
        <Text type="secondary" className="block text-center py-10">功能資料不存在</Text>
      )}
    </Drawer>
    </>
  )
}

export default FunctionDetailDrawer
