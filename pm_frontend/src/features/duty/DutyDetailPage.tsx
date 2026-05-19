import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Descriptions, Button, Tag, Progress, Spin, Empty, Avatar,
  Typography, Space, Form, Input, InputNumber, Upload, Timeline,
  Card, Steps, Select, Tooltip,
} from 'antd'
import type { UploadFile } from 'antd'
import { ArrowLeftIcon, PlusIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import FilePreviewModal from '@/features/project/FilePreviewModal'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import { fetchDutyThunk, clearCurrentDuty } from './dutySlice'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { dailyLogApi } from '@/api/daily_log.api'
import type { TaskLogEntry } from '@/api/daily_log.api'
import { tokenStorage } from '@/api/httpClient'
import { DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import dayjs from 'dayjs'

const { Text } = Typography

const DUTY_STEPS = ['進行中', '完結審核', '已完結']
const statusToStep = (s: number) => ({ 1: 0, 2: 1, 3: 2 }[s] ?? 0)

const DaysLeftBadge: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return null
  const days = dayjs(date).diff(dayjs(), 'day')
  if (days < 0)  return <span className="days-overdue">已超期 {Math.abs(days)} 天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">剩 {days} 天</span>
}

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const normalizeCooperator = (c: unknown): string[] => {
  if (!c) return []
  if (Array.isArray(c)) return c as string[]
  if (typeof c === 'string') { try { const p = JSON.parse(c); return Array.isArray(p) ? p : [c] } catch { return [c] } }
  return []
}

const DutyDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const workNo   = useAppSelector((s) => s.auth.workNo)
  const toName   = useWorkNoToName()
  const { current, isLoading } = useAppSelector((s) => s.duty)

  const [records,    setRecords]    = useState<Record<string, unknown>[]>([])
  const [logEntries, setLogEntries] = useState<TaskLogEntry[]>([])
  const [showForm,   setShowForm]   = useState(false)
  const [isSaving,   setIsSaving]   = useState(false)
  const [fileList,   setFileList]   = useState<UploadFile[]>([])
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null)
  const [userOpts,   setUserOpts]   = useState<{ value: string; label: string }[]>([])
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

  useEffect(() => {
    if (id) { dispatch(fetchDutyThunk(id)); loadProgress(id) }
    return () => { dispatch(clearCurrentDuty()) }
  }, [id, dispatch])

  useEffect(() => {
    userApi.list().then((res) => {
      const list = (res.content as { work_no: string; name: string }[] | undefined) ?? []
      setUserOpts(list.map((u) => ({ value: u.work_no, label: u.name })))
    }).catch(() => {})
  }, [])

  const loadProgress = async (dutyId: string) => {
    try {
      const [progRes, logRes] = await Promise.all([
        dutyApi.getProgress(dutyId, { page: 1, size: 50 }),
        dailyLogApi.taskEntries('duty', dutyId),
      ])
      const c = progRes.content as { data_list?: Record<string, unknown>[] }
      setRecords((c.data_list ?? []).map((r) => ({ ...r, cooperator: normalizeCooperator(r.cooperator) })))
      setLogEntries(logRes.content ?? [])
    } catch { /* global */ }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!id) return
    setIsSaving(true)
    try {
      const files: Record<string, File[]> = {}
      fileList.forEach((f) => { if (f.originFileObj) { if (!files.files) files.files = []; files.files.push(f.originFileObj) } })
      await dutyApi.createProgress(id, { progress: values.progress, progress_record: values.progress_record, time_consum: values.time_consum, cooperator: values.cooperator, submitter: workNo },
        Object.keys(files).length > 0 ? files : undefined)
      showToast.success('進度更新成功')
      setShowForm(false); form.resetFields(); setFileList([]); loadProgress(id)
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
  if (!current)  return <Empty description="任務不存在" className="mt-20" />

  const priorityColor = PRIORITY_COLORS[current.priority] ?? '#94a3b8'
  const statusInfo    = DUTY_STATUS_MAP[current.status]

  return (
    <div className="p-6">
      {/* Back + Title */}
      <div className="flex items-start gap-3 mb-5">
        <Button icon={<ArrowLeftIcon className="w-4 h-4" />} onClick={() => navigate(-1)} type="text" className="mt-1" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 rounded-full" style={{ background: priorityColor }} />
            <h1 className="text-2xl font-bold text-slate-800">{current.duty_nm}</h1>
          </div>
          <Space>
            {statusInfo && (
              <div className="flex items-center gap-1.5">
                <span className="status-dot" style={{ background: { default:'#94a3b8', processing:'#2563eb', orange:'#d97706', success:'#16a34a', warning:'#f59e0b', error:'#dc2626' }[statusInfo.color] ?? '#94a3b8' }} />
                <span className="text-sm text-slate-500">{statusInfo.label}</span>
              </div>
            )}
            {(() => { const p = PRIORITY_MAP[current.priority]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : null })()}
            <DaysLeftBadge date={current.expected_end_date} />
          </Space>
        </div>
      </div>

      {/* Status Steps */}
      {current.status >= 1 && current.status <= 3 && (
        <Card bordered={false} className="shadow-sm mb-5" bodyStyle={{ padding: '16px 24px' }}>
          <Steps size="small" current={statusToStep(current.status)}
            items={DUTY_STEPS.map((t) => ({ title: <span style={{ fontSize: 12 }}>{t}</span> }))} />
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-slate-400 w-14">整體進度</span>
            <Progress percent={current.progress ?? 0} size="small" strokeColor="#2563eb" trailColor="#e2e8f0" style={{ flex: 1, marginBottom: 0 }} />
          </div>
        </Card>
      )}

      {/* Info card */}
      <Card bordered={false} className="shadow-sm mb-5" bodyStyle={{ padding: 24 }}>
        <Descriptions column={2} size="small"
          labelStyle={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}
          contentStyle={{ fontSize: 13, color: '#334155' }}>
          <Descriptions.Item label="建立人">{toName(current.creator)}</Descriptions.Item>
          <Descriptions.Item label="負責人">
            {current.responsible?.length
              ? <div className="flex items-center gap-1.5">
                  <Avatar size={18} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{current.responsible[0]?.[0]?.toUpperCase()}</Avatar>
                  <span>{current.responsible.join(', ')}</span>
                </div>
              : <span className="text-slate-300">未分配</span>}
          </Descriptions.Item>
          <Descriptions.Item label="預計開始">{current.expected_start_date ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="預計完成">{current.expected_end_date ?? '—'}</Descriptions.Item>
          {(current.reschedule_count ?? 0) > 0 && (
            <Descriptions.Item label="延期次數">
              <Tag color="orange">{current.reschedule_count} 次</Tag>
              <span className="text-[10px] text-slate-400 ml-1">原始: {current.original_end_date || '—'}</span>
            </Descriptions.Item>
          )}
          {current.describe && (
            <Descriptions.Item label="描述" span={2}>{current.describe}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>

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
          current.status === 1 && (current.responsible ?? []).some((w) => w.toLowerCase() === (workNo?.toLowerCase() ?? '')) && (
            <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
              style={{ background: '#2563eb' }} onClick={() => setShowForm((v) => !v)}>
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
                  optionFilterProp="label"
                  placeholder="選擇本次一同完成的合作人（選填）"
                  options={userOpts.filter((u) => u.value.toLowerCase() !== (workNo ?? '').toLowerCase())}
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
          // ── 構建合併時間軸 ──────────────────────────────────────────────
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

      {previewFile && (
        <FilePreviewModal
          directUrl={previewFile.url}
          filename={previewFile.name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  )
}

export default DutyDetailPage
