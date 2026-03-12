import React, { useEffect } from 'react'
import { Modal, Form, Input, Select, DatePicker, Button, InputNumber } from 'antd'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createProjectThunk } from './projectSlice'
import { showToast } from '@/utils/toast'

// ─── Validation Schema ────────────────────────────────────────────────────────

const schema = z.object({
  project_nm:         z.string().min(1, '請輸入專案名稱').max(100),
  describe:           z.string().optional(),
  department:         z.string().min(1, '請選擇部門'),
  project_pm:         z.string().min(1, '請輸入專案PM工號'),
  product_pm:         z.string().optional(),
  expected_end_date:  z.string().optional(),
  priority:           z.number().min(1).max(4),
  group_id:           z.string().min(1, '請選擇專案分組'),
  code_url:           z.string().url('請輸入正確的代碼庫網址').optional().or(z.literal('')),
  expected_benefit:   z.string().optional(),
  benefit_amount:     z.number().optional(),
})

type FormValues = z.infer<typeof schema>

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CreateProjectModalProps {
  open:      boolean
  onClose:   () => void
  onSuccess: () => void
}

const PRIORITY_OPTIONS = [
  { value: 1, label: '低' },
  { value: 2, label: '中' },
  { value: 3, label: '高' },
  { value: 4, label: '緊急' },
]

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ open, onClose, onSuccess }) => {
  const dispatch = useAppDispatch()
  const { groups, isSaving } = useAppSelector((s) => s.project)

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 2 },
  })

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const onSubmit = async (values: FormValues) => {
    try {
      await dispatch(createProjectThunk({ payload: values })).unwrap()
      showToast.success('專案建立成功')
      onSuccess()
    } catch (err: unknown) {
      showToast.error((err as string) || '建立失敗')
    }
  }

  return (
    <Modal
      title="新建專案"
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form layout="vertical" onFinish={handleSubmit(onSubmit)} className="mt-4">

        <div className="grid grid-cols-2 gap-x-4">
          {/* 專案名稱 */}
          <Form.Item
            label="專案名稱"
            validateStatus={errors.project_nm ? 'error' : ''}
            help={errors.project_nm?.message}
            className="col-span-2"
            required
          >
            <Controller
              name="project_nm"
              control={control}
              render={({ field }) => <Input {...field} placeholder="請輸入專案名稱" />}
            />
          </Form.Item>

          {/* 部門 */}
          <Form.Item
            label="部門"
            validateStatus={errors.department ? 'error' : ''}
            help={errors.department?.message}
            required
          >
            <Controller
              name="department"
              control={control}
              render={({ field }) => (
                <Input {...field} placeholder="請輸入部門" />
              )}
            />
          </Form.Item>

          {/* 優先級 */}
          <Form.Item
            label="優先級"
            validateStatus={errors.priority ? 'error' : ''}
            help={errors.priority?.message}
            required
          >
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select {...field} options={PRIORITY_OPTIONS} placeholder="請選擇優先級" />
              )}
            />
          </Form.Item>

          {/* 專案PM */}
          <Form.Item
            label="專案PM（工號）"
            validateStatus={errors.project_pm ? 'error' : ''}
            help={errors.project_pm?.message}
            required
          >
            <Controller
              name="project_pm"
              control={control}
              render={({ field }) => <Input {...field} placeholder="請輸入PM工號" />}
            />
          </Form.Item>

          {/* 産品PM */}
          <Form.Item
            label="産品PM（工號）"
            validateStatus={errors.product_pm ? 'error' : ''}
            help={errors.product_pm?.message}
          >
            <Controller
              name="product_pm"
              control={control}
              render={({ field }) => <Input {...field} placeholder="（可空，預設與建立人相同）" />}
            />
          </Form.Item>

          {/* 分組 */}
          <Form.Item
            label="專案分組"
            validateStatus={errors.group_id ? 'error' : ''}
            help={errors.group_id?.message}
            required
          >
            <Controller
              name="group_id"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  options={groups.map((g) => ({ value: g.id, label: g.group_nm }))}
                  placeholder="請選擇分組"
                />
              )}
            />
          </Form.Item>

          {/* 預計完成日期 */}
          <Form.Item
            label="預計完成日期"
            validateStatus={errors.expected_end_date ? 'error' : ''}
            help={errors.expected_end_date?.message}
          >
            <Controller
              name="expected_end_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  style={{ width: '100%' }}
                  onChange={(_, s) => field.onChange(s as string)}
                  value={field.value ? undefined : undefined}
                  format="YYYY-MM-DD"
                />
              )}
            />
          </Form.Item>

          {/* 代碼庫地址 */}
          <Form.Item
            label="代碼庫地址"
            validateStatus={errors.code_url ? 'error' : ''}
            help={errors.code_url?.message}
            className="col-span-2"
          >
            <Controller
              name="code_url"
              control={control}
              render={({ field }) => <Input {...field} placeholder="https://..." />}
            />
          </Form.Item>

          {/* 預估效益 */}
          <Form.Item
            label="預估效益金額"
            validateStatus={errors.benefit_amount ? 'error' : ''}
            help={errors.benefit_amount?.message}
          >
            <Controller
              name="benefit_amount"
              control={control}
              render={({ field }) => (
                <InputNumber
                  {...field}
                  style={{ width: '100%' }}
                  placeholder="預估節省/產生的金額"
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(v?.replace(/,/g, '') ?? 0)}
                  addonAfter="元/年"
                  min={0}
                />
              )}
            />
          </Form.Item>

          {/* 預估效益描述 */}
          <Form.Item
            label="效益說明"
          >
            <Controller
              name="expected_benefit"
              control={control}
              render={({ field }) => (
                <Input.TextArea {...field} rows={2} placeholder="例：預計減少人工作業30%，每年節省約50萬元" />
              )}
            />
          </Form.Item>

          {/* 描述 */}
          <Form.Item
            label="專案描述"
            className="col-span-2"
          >
            <Controller
              name="describe"
              control={control}
              render={({ field }) => (
                <Input.TextArea {...field} rows={3} placeholder="請輸入專案描述" />
              )}
            />
          </Form.Item>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" loading={isSaving} className="bg-blue-600">
            建立
          </Button>
        </div>
      </Form>
    </Modal>
  )
}

export default CreateProjectModal
