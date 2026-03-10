import React, { useEffect, useState } from 'react'
import { Tabs, Table, Button, Tag, Modal, Form, Input, Select, Space } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckIcon } from '@heroicons/react/24/outline'
import { projectApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { ApplyRecord } from '@/types/api.types'
import { showToast } from '@/utils/toast'

const REVIEW_STATUS_MAP: Record<number, { label: string; color: string }> = {
  1: { label: '待審核', color: 'processing' },
  2: { label: '已通過', color: 'success'    },
  3: { label: '已拒絕', color: 'error'      },
}

const ReviewListPage: React.FC = () => {
  const [projRecords,  setProjRecords]  = useState<ApplyRecord[]>([])
  const [dutyRecords,  setDutyRecords]  = useState<ApplyRecord[]>([])
  const [isLoading,    setIsLoading]    = useState(false)
  const [isSaving,     setIsSaving]     = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{ id: string; type: 'project' | 'duty' } | null>(null)
  const [form]                          = Form.useForm()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [proj, duty] = await Promise.all([
        projectApi.reviewList({ page: 1, size: 50 }),
        dutyApi.reviewList({ page: 1, size: 50 }),
      ])
      const projContent = proj.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const dutyContent = duty.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      setProjRecords((projContent.project_list ?? projContent.data_list ?? []) as ApplyRecord[])
      setDutyRecords((dutyContent.project_list ?? dutyContent.data_list ?? []) as ApplyRecord[])
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const handleApprove = async (values: Record<string, unknown>) => {
    if (!reviewTarget) return
    setIsSaving(true)
    try {
      const payload = { status: values.status as number, reject_reason: values.reject_reason as string | undefined }
      if (reviewTarget.type === 'project') {
        await projectApi.approveReview(reviewTarget.id, payload)
      } else {
        await dutyApi.approveReview(reviewTarget.id, payload)
      }
      showToast.success('審核完成')
      setReviewTarget(null)
      form.resetFields()
      loadData()
    } catch { /* global */ }
    finally { setIsSaving(false) }
  }

  const columns: ColumnsType<ApplyRecord> = [
    { title: '申請類型', dataIndex: 'apply_type', width: 120 },
    {
      title: '相關專案',
      dataIndex: 'project_nm',
      ellipsis: true,
      render: (v?: string) => v ?? '—',
    },
    { title: '提交人', dataIndex: 'submitter', width: 90 },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 90,
      render: (v: number) => {
        const s = REVIEW_STATUS_MAP[v]
        return s ? <Tag color={s.color}>{s.label}</Tag> : v
      },
    },
    { title: '優先級', dataIndex: 'priority', width: 80 },
    { title: '建立時間', dataIndex: 'created_at', width: 160 },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record) =>
        record.status === 1 ? (
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<CheckIcon className="w-3 h-3" />}
              className="bg-green-600"
              onClick={() => setReviewTarget({ id: record.id, type: 'project' })}
            >
              審核
            </Button>
          </Space>
        ) : null,
    },
  ]

  const dutyColumns: ColumnsType<ApplyRecord> = columns.map((c) =>
    c.key === 'action'
      ? {
          ...c,
          render: (_: unknown, record) =>
            record.status === 1 ? (
              <Button
                size="small"
                type="primary"
                icon={<CheckIcon className="w-3 h-3" />}
                className="bg-green-600"
                onClick={() => setReviewTarget({ id: record.id, type: 'duty' })}
              >
                審核
              </Button>
            ) : null,
        }
      : c,
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">審核管理</h1>
        <p className="text-gray-500 text-sm mt-1">處理專案及任務審核申請</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <Tabs
          items={[
            {
              key: 'project',
              label: `專案審核 (${projRecords.filter((r) => r.status === 1).length})`,
              children: (
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={projRecords}
                  loading={isLoading}
                  pagination={{ pageSize: 10 }}
                  size="middle"
                />
              ),
            },
            {
              key: 'duty',
              label: `任務審核 (${dutyRecords.filter((r) => r.status === 1).length})`,
              children: (
                <Table
                  rowKey="id"
                  columns={dutyColumns}
                  dataSource={dutyRecords}
                  loading={isLoading}
                  pagination={{ pageSize: 10 }}
                  size="middle"
                />
              ),
            },
          ]}
        />
      </div>

      {/* Review Modal */}
      <Modal
        title="提交審核意見"
        open={!!reviewTarget}
        onCancel={() => { setReviewTarget(null); form.resetFields() }}
        footer={null}
        width={420}
      >
        <Form form={form} layout="vertical" onFinish={handleApprove} className="mt-4">
          <Form.Item name="status" label="審核結果" rules={[{ required: true }]} initialValue={2}>
            <Select
              options={[
                { value: 2, label: '✅ 通過' },
                { value: 3, label: '❌ 拒絕' },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.status !== curr.status}
          >
            {({ getFieldValue }) =>
              getFieldValue('status') === 3 ? (
                <Form.Item name="reject_reason" label="拒絕原因" rules={[{ required: true, message: '請填寫拒絕原因' }]}>
                  <Input.TextArea rows={3} placeholder="請填寫拒絕原因" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setReviewTarget(null); form.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} className="bg-blue-600">確認提交</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default ReviewListPage
