import React, { useEffect, useState } from 'react'
import {
  Drawer, Descriptions, Progress, Button, Form, Input, InputNumber,
  Timeline, Avatar, Typography, Tag, Upload, Spin, Divider, Steps, Select, Modal,
} from 'antd'
import { PlusIcon, PaperClipIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import FilePreviewModal from './FilePreviewModal'
import type { UploadFile } from 'antd'
import { projectApi } from '@/api/project.api'
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

const FunctionDetailDrawer: React.FC<FunctionDetailDrawerProps> = ({
  projectId, functionId, open, onClose, onRefresh, isProjectPm = false, projectStatus, projectPm,
}) => {
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const toName = useWorkNoToName()
  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null)
  const [funcData,   setFuncData]   = useState<ProjectFunction | null>(null)
  const [records,     setRecords]     = useState<ProgressRecord[]>([])
  const [logEntries,  setLogEntries]  = useState<TaskLogEntry[]>([])
  const [isLoading,   setIsLoading]   = useState(false)
  const [isSaving,   setIsSaving]   = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [fileList,   setFileList]   = useState<UploadFile[]>([])
  const [form]                      = Form.useForm()
  const [editForm]                  = Form.useForm()

  useEffect(() => { if (open) loadData() }, [open, functionId])

  const addTokenToFiles = (items: FileInfo[] | undefined): FileInfo[] => {
    if (!items?.length) return []
    const token = tokenStorage.get()
    return items.map((f) => ({ ...f, url: token ? `${f.url}?token=${token}` : f.url }))
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [funcRes, progressRes, logRes] = await Promise.all([
        projectApi.getFunction(projectId, functionId),
        projectApi.getProgress(projectId, functionId, { page: 1, size: 30 }),
        dailyLogApi.taskEntries('project', functionId),
      ])
      setFuncData(funcRes.content)
      const c = progressRes.content as { data_list?: ProgressRecord[] }
      const list = (c.data_list ?? []) as ProgressRecord[]
      setRecords(list.map((r) => ({ ...r, files: addTokenToFiles(r.files) })))
      setLogEntries(logRes.content ?? [])
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    setIsSaving(true)
    try {
      const files: Record<string, File[]> = {}
      fileList.forEach((f) => { if (f.originFileObj) { if (!files.files) files.files = []; files.files.push(f.originFileObj) } })
      await projectApi.createProgress(projectId, functionId, {
        progress:        values.progress as number,
        progress_record: values.progress_record as string | undefined,
        time_consum:     values.time_consum as number | undefined,
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
            <Descriptions.Item label="預計完成">{funcData.expected_end_date ?? '—'}</Descriptions.Item>
            {funcData.describe && (
              <Descriptions.Item label="描述" span={2}>{funcData.describe}</Descriptions.Item>
            )}
          </Descriptions>

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
            進度記錄 ({records.length})
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
            // updated 條目按 suggest_id 分組，key=suggest_id，value=按 log_date 排序的條目列表
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
            // 每組 updated 按 log_date 升序
            for (const list of updatedMap.values()) list.sort((a, b) => a.log_date.localeCompare(b.log_date))

            // 進度記錄 + manual 條目合併後按時間排序
            type MixedItem =
              | { kind: 'progress'; data: ProgressRecord }
              | { kind: 'manual';   data: TaskLogEntry }
            const mixed: MixedItem[] = [
              ...records.map((r) => ({ kind: 'progress' as const, data: r, _sort: r.created_at ?? '' })),
              ...manualEntries.map((e) => ({ kind: 'manual' as const, data: e, _sort: e.log_date })),
            ].sort((a, b) => (a._sort > b._sort ? -1 : 1))  // 倒序：最新在上

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
              <Timeline
                items={mixed.map(({ kind, data }) => {
                  if (kind === 'progress') {
                    const item = data as ProgressRecord
                    const updates = updatedMap.get(item.progress_id) ?? []
                    return {
                      dot: (
                        <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                          {toName(item.submitter)?.[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div className="pb-3">
                          {(() => {
                            // 計算最新耗時：如有更新則取最後一條 updated 的 work_hours
                            const latestUpd = updates.length > 0 ? updates[updates.length - 1] : null
                            const origHours = Number(item.time_consum ?? 0)
                            const latestHours = latestUpd ? Number(latestUpd.work_hours ?? 0) : origHours
                            const hoursChanged = latestUpd && latestHours !== origHours
                            return (
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-slate-700 text-sm">{toName(item.submitter)}</span>
                                <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{item.progress}%</Tag>
                                {hoursChanged ? (
                                  <span className="flex items-center gap-1">
                                    {origHours > 0 && <span className="text-xs text-slate-400 line-through">{origHours}h</span>}
                                    <Tag style={{ fontSize: 11, padding: '0 6px' }}>{latestHours}h</Tag>
                                  </span>
                                ) : (
                                  origHours > 0 && <Tag style={{ fontSize: 11, padding: '0 6px' }}>{origHours}h</Tag>
                                )}
                              </div>
                            )
                          })()}
                          {/* 原始進度說明：如有更新則加劃線 */}
                          {item.progress_record && (
                            <p className="text-sm mt-1 mb-1 leading-snug"
                              style={{ color: updates.length > 0 ? '#94a3b8' : '#475569', textDecoration: updates.length > 0 ? 'line-through' : 'none' }}>
                              {item.progress_record}
                            </p>
                          )}

                          {/* 日誌更新鏈：緊接在劃線文字下方，時間戳之前 */}
                          {updates.map((upd, idx) => {
                            const isLatest = idx === updates.length - 1
                            const prevText = idx === 0 ? null : updates[idx - 1].description

                            // 附件差異
                            const prevRawFiles = idx === 0
                              ? (item.files ?? [])
                              : (updates[idx - 1].files ?? []).map((f) => ({ ...f, url: withToken(f.url) }))
                            const currRawFiles = (upd.files ?? []).map((f) => ({ ...f, url: withToken(f.url) }))
                            const prevNameSet = new Set(prevRawFiles.map((f) => f.name))
                            const currNameSet = new Set(currRawFiles.map((f) => f.name))
                            const addedFiles   = currRawFiles.filter((f) => !prevNameSet.has(f.name))
                            const removedFiles = prevRawFiles.filter((f) => !currNameSet.has(f.name))
                            const hasFileDiff  = addedFiles.length > 0 || removedFiles.length > 0

                            return (
                              <div key={upd.log_date}>
                                {/* 非第一條：上一版本劃線 */}
                                {prevText && (
                                  <p className="text-sm leading-tight"
                                    style={{ color: '#94a3b8', textDecoration: 'line-through' }}>
                                    {prevText}
                                  </p>
                                )}
                                {/* 新內容 */}
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm leading-tight"
                                    style={{ color: isLatest ? '#334155' : '#94a3b8', textDecoration: isLatest ? 'none' : 'line-through' }}>
                                    {upd.description}
                                  </p>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {isLatest && (
                                      <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', margin: 0 }}>
                                        {upd.log_status === 2 ? '已提交' : '草稿'}
                                      </Tag>
                                    )}
                                    <Tag color="orange" style={{ fontSize: 10, padding: '0 5px', lineHeight: '16px', margin: 0 }}>日誌更新</Tag>
                                  </div>
                                </div>
                                {/* 附件差異 */}
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
                          {/* 時間戳 + 原始附件（在更新鏈之後） */}
                          <span className="text-xs text-slate-300 mt-1 block">{item.created_at}</span>
                          <AttachmentPreview files={item.files} images={item.images} onPreview={setPreviewFile} />
                        </div>
                      ),
                    }
                  } else {
                    // manual 日誌新增
                    const entry = data as TaskLogEntry
                    return {
                      dot: (
                        <Avatar size={26} style={{ background: '#16a34a', fontSize: 11, fontWeight: 700 }}>
                          {toName(entry.work_no)?.[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div className="pb-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-700 text-sm">{toName(entry.work_no)}</span>
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
                          <span className="text-xs text-slate-300">{entry.log_date}</span>
                          {(() => { const sf = splitFiles(entry.files); return <AttachmentPreview files={sf.files} images={sf.images} onPreview={setPreviewFile} /> })()}
                        </div>
                      ),
                    }
                  }
                })}
              />
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
