import React, { useEffect, useState } from 'react'
import {
  Drawer, Descriptions, Progress, Button, Form, Input, InputNumber,
  Timeline, Avatar, Typography, Tag, Upload, Spin, Divider, Steps,
} from 'antd'
import { PlusIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import type { UploadFile } from 'antd'
import { projectApi } from '@/api/project.api'
import { ProjectFunction, ProgressRecord } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import { useAppSelector } from '@/hooks/redux'

const { Text } = Typography

export interface FunctionDetailDrawerProps {
  projectId:  string
  functionId: string
  open:       boolean
  onClose:    () => void
  onRefresh?: () => void
}

// Map function status to Steps index
const FUNC_STEPS = ['待開始', '進行中', '完結審核', '已完結']
const statusToStep = (s: number) => ({ 1: 0, 2: 1, 3: 2, 4: 3 }[s] ?? 0)

const FunctionDetailDrawer: React.FC<FunctionDetailDrawerProps> = ({
  projectId, functionId, open, onClose, onRefresh,
}) => {
  // workNo will be used for progress submission in production
  useAppSelector((s) => s.auth.workNo)
  const [funcData,  setFuncData]  = useState<ProjectFunction | null>(null)
  const [records,   setRecords]   = useState<ProgressRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving,  setIsSaving]  = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [fileList,  setFileList]  = useState<UploadFile[]>([])
  const [form]                    = Form.useForm()

  useEffect(() => { if (open) loadData() }, [open, functionId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [funcRes, progressRes] = await Promise.all([
        projectApi.getFunction(projectId, functionId),
        projectApi.getProgress(projectId, functionId, { page: 1, size: 30 }),
      ])
      setFuncData(funcRes.content)
      const c = progressRes.content as { data_list?: ProgressRecord[] }
      setRecords((c.data_list ?? []) as ProgressRecord[])
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
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const priorityColor = funcData ? ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed'][funcData.priority] ?? '#94a3b8' : '#94a3b8'

  return (
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
        <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} size="small"
          style={{ background: '#2563eb' }} onClick={() => setShowForm((v) => !v)}>
          更新進度
        </Button>
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
            <Descriptions.Item label="分組">{funcData.group1 ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="預計開始">{funcData.expected_start_date ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="預計完成">{funcData.expected_end_date ?? '—'}</Descriptions.Item>
            {funcData.describe && (
              <Descriptions.Item label="描述" span={2}>{funcData.describe}</Descriptions.Item>
            )}
          </Descriptions>

          {/* Progress submit form */}
          {showForm && (
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

          <Divider style={{ fontSize: 12, color: '#94a3b8' }}>進度記錄 ({records.length})</Divider>

          {records.length === 0 ? (
            <Text type="secondary" className="block text-center py-8 text-sm">暫無進度記錄</Text>
          ) : (
            <Timeline
              items={records.map((item) => ({
                dot: (
                  <Avatar size={26} style={{ background: '#2563eb', fontSize: 11, fontWeight: 700 }}>
                    {item.submitter?.[0]?.toUpperCase()}
                  </Avatar>
                ),
                children: (
                  <div className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-700 text-sm">{item.submitter}</span>
                      <Tag color="blue" style={{ fontSize: 11, padding: '0 6px' }}>{item.progress}%</Tag>
                      {Number(item.time_consum) > 0 && (
                        <Tag style={{ fontSize: 11, padding: '0 6px' }}>{item.time_consum}h</Tag>
                      )}
                    </div>
                    {item.progress_record && (
                      <p className="text-sm text-slate-600 mt-1 mb-1 leading-relaxed">{item.progress_record}</p>
                    )}
                    <span className="text-xs text-slate-300">{item.created_at}</span>
                    {item.files && item.files.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {item.files.map((f) => (
                          <a key={f.url} href={f.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-2 py-0.5 hover:bg-blue-100">
                            <PaperClipIcon className="w-3 h-3" />{f.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </>
      ) : (
        <Text type="secondary" className="block text-center py-10">功能資料不存在</Text>
      )}
    </Drawer>
  )
}

export default FunctionDetailDrawer
