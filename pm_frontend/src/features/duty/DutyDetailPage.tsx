import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Descriptions, Button, Tag, Progress, Spin, Empty, Avatar,
  Typography, Space, Form, Input, InputNumber, Upload, Timeline,
  Card, Steps,
} from 'antd'
import type { UploadFile } from 'antd'
import { ArrowLeftIcon, PlusIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import AttachmentPreview from '@/components/ui/AttachmentPreview'
import type { FileInfo } from '@/types/api.types'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchDutyThunk, clearCurrentDuty } from './dutySlice'
import { dutyApi } from '@/api/duty.api'
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

const DutyDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const workNo   = useAppSelector((s) => s.auth.workNo)
  const { current, isLoading } = useAppSelector((s) => s.duty)

  const [records,  setRecords]  = useState<Record<string, unknown>[]>([])
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [form]                  = Form.useForm()

  useEffect(() => {
    if (id) { dispatch(fetchDutyThunk(id)); loadProgress(id) }
    return () => { dispatch(clearCurrentDuty()) }
  }, [id, dispatch])

  const loadProgress = async (dutyId: string) => {
    try {
      const res = await dutyApi.getProgress(dutyId, { page: 1, size: 30 })
      const c = res.content as { data_list?: Record<string, unknown>[] }
      setRecords(c.data_list ?? [])
    } catch { /* global */ }
  }

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!id) return
    setIsSaving(true)
    try {
      const files: Record<string, File[]> = {}
      fileList.forEach((f) => { if (f.originFileObj) { if (!files.files) files.files = []; files.files.push(f.originFileObj) } })
      await dutyApi.createProgress(id, { progress: values.progress, progress_record: values.progress_record, time_consum: values.time_consum, submitter: workNo },
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
    <div className="p-6 max-w-3xl mx-auto">
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
          <Descriptions.Item label="建立人">{current.creator}</Descriptions.Item>
          <Descriptions.Item label="負責人">
            {current.responsible
              ? <div className="flex items-center gap-1.5">
                  <Avatar size={18} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>{current.responsible?.[0]?.toUpperCase()}</Avatar>
                  <span>{current.responsible.split(';').join(', ')}</span>
                </div>
              : <span className="text-slate-300">未分配</span>}
          </Descriptions.Item>
          <Descriptions.Item label="預計開始">{current.expected_start_date ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="預計完成">{current.expected_end_date ?? '—'}</Descriptions.Item>
          {(current.revision_count ?? 0) > 0 && (
            <Descriptions.Item label="延期次數">
              <Tag color="orange">{current.revision_count} 次</Tag>
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
        title={<span className="font-semibold text-slate-700 text-sm">進度記錄 ({records.length})</span>}
        extra={
          <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
            style={{ background: '#2563eb' }} onClick={() => setShowForm((v) => !v)}>
            更新進度
          </Button>
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

        {records.length === 0 ? (
          <Text type="secondary" className="block text-center py-8 text-sm">暫無進度記錄</Text>
        ) : (
          <Timeline
            items={records.map((item) => ({
              dot: (
                <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                  {String(item.submitter ?? '?')[0]?.toUpperCase()}
                </Avatar>
              ),
              children: (
                <div className="pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700 text-sm">{String(item.submitter ?? '')}</span>
                    <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{Number(item.progress ?? 0)}%</Tag>
                    {Number(item.time_consum ?? 0) > 0 && <Tag style={{ fontSize: 11 }}>{Number(item.time_consum)}h</Tag>}
                  </div>
                  {!!item.progress_record && (
                    <p className="text-sm text-slate-600 mt-1 mb-1 leading-relaxed">{String(item.progress_record)}</p>
                  )}
                  <span className="text-xs text-slate-300">{String(item.created_at ?? '')}</span>
                  <AttachmentPreview
                    files={(item.files as FileInfo[] | undefined)}
                    images={(item.images as FileInfo[] | undefined)}
                  />
                </div>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  )
}

export default DutyDetailPage
