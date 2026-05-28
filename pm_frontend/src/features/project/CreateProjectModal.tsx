import React, { useEffect, useRef, useState } from 'react'
import { Modal, Form, Input, Select, DatePicker, Button, InputNumber, Divider, Space, Spin } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { useForm, Controller, useWatch } from 'react-hook-form'
import RichTextEditor from '@/components/common/RichTextEditor'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { createProjectThunk, fetchProjectGroupsThunk } from './projectSlice'
import { fetchDepartmentsThunk } from '@/features/user/userSlice'
import { projectApi } from '@/api/project.api'
import { userApi } from '@/api/user.api'
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
  benefit_amount:     z.number().min(0).optional(),
  benefit_unit:       z.enum(['元/年', '人/年', '工時/年']).optional(),
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
  const { departments } = useAppSelector((s) => s.user)
  const { isAdmin, isSupervisor } = useAppSelector((s) => s.auth)
  const canManageGroups = isAdmin || isSupervisor

  const [newGroupName, setNewGroupName]       = useState('')
  const [creatingGroup, setCreatingGroup]     = useState(false)
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  // Department
  const [newDeptName,  setNewDeptName]  = useState('')
  const [creatingDept, setCreatingDept] = useState(false)
  const newDeptInputRef = useRef<HTMLInputElement>(null)

  const handleCreateDept = async (onChange: (v: string) => void) => {
    const nm = newDeptName.trim()
    if (!nm) return
    setCreatingDept(true)
    try {
      await userApi.createDepartment(nm)
      await dispatch(fetchDepartmentsThunk())
      onChange(nm)
      setNewDeptName('')
      showToast.success(`部門「${nm}」已建立`)
    } catch {
      showToast.error('建立部門失敗')
    } finally {
      setCreatingDept(false)
    }
  }

  // PM search (project_pm / product_pm)
  const [pmOptions,   setPmOptions]   = useState<{ value: string; label: string }[]>([])
  const [pmSearching, setPmSearching] = useState(false)
  const pmTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const handlePmSearch = (keyword: string) => {
    clearTimeout(pmTimerRef.current)
    if (!keyword.trim()) { setPmOptions([]); return }
    setPmSearching(true)
    pmTimerRef.current = setTimeout(async () => {
      try {
        const res = await userApi.list({ keyword, page: 1, size: 20 })
        const list = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
        setPmOptions(list.map((u) => ({ value: u.work_no, label: `${u.name}（${u.work_no}）` })))
      } catch { setPmOptions([]) }
      finally  { setPmSearching(false) }
    }, 300)
  }

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 2 },
  })
  const describeValue = useWatch({ control, name: 'describe' })

  // Expand-to-edit modal state
  const [expandOpen,  setExpandOpen]  = useState(false)
  const [expandDraft, setExpandDraft] = useState('')

  // Detect if a value is HTML
  const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)

  // Strip HTML tags to plain text (for textarea display when value is HTML)
  const stripHtml = (html: string) =>
    html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const handleOpenExpand = () => {
    const current = describeValue ?? ''
    // If already HTML (from a previous expand edit), load as-is; otherwise wrap plain text in <p>
    const html = isHtml(current)
      ? current
      : current.trim() ? `<p>${current.replace(/\n/g, '</p><p>')}</p>` : ''
    setExpandDraft(html)
    setExpandOpen(true)
  }
  const handleConfirmExpand = () => {
    setValue('describe', expandDraft, { shouldDirty: true })
    setExpandOpen(false)
  }
  const handleCancelExpand = () => {
    setExpandOpen(false)
  }

  useEffect(() => {
    if (open) {
      dispatch(fetchProjectGroupsThunk())
      dispatch(fetchDepartmentsThunk())
    } else {
      reset()
      setNewGroupName('')
      setNewDeptName('')
      setPmOptions([])
      setExpandOpen(false)
      setExpandDraft('')
    }
  }, [open, dispatch, reset])

  const handleCreateGroup = async () => {
    const nm = newGroupName.trim()
    if (!nm) return
    setCreatingGroup(true)
    try {
      await projectApi.createGroup(nm)
      await dispatch(fetchProjectGroupsThunk())
      setNewGroupName('')
      showToast.success(`分組「${nm}」已建立`)
    } catch {
      showToast.error('建立分組失敗')
    } finally {
      setCreatingGroup(false)
    }
  }

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
      width="min(960px, 90vw)"
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

          {/* 部門 — 選擇已有或新增 */}
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
                <Select
                  {...field}
                  showSearch
                  placeholder="輸入或選擇部門"
                  filterOption={(input, opt) =>
                    (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={departments.map((d) => ({ value: d.name, label: d.name }))}
                  popupRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 8px' }}>
                        <input
                          ref={newDeptInputRef}
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateDept(field.onChange) } }}
                          placeholder="輸入新部門名稱"
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                        />
                        <Button
                          type="text"
                          icon={<PlusOutlined />}
                          size="small"
                          loading={creatingDept}
                          disabled={!newDeptName.trim()}
                          onClick={() => handleCreateDept(field.onChange)}
                        >
                          新增部門
                        </Button>
                      </Space>
                    </>
                  )}
                />
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

          {/* 專案PM — 搜尋選擇 */}
          <Form.Item
            label="專案PM"
            validateStatus={errors.project_pm ? 'error' : ''}
            help={errors.project_pm?.message}
            required
          >
            <Controller
              name="project_pm"
              control={control}
              render={({ field }) => (
                <Select
                  showSearch
                  placeholder="輸入工號或姓名搜索..."
                  filterOption={false}
                  onSearch={handlePmSearch}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  value={field.value || undefined}
                  notFoundContent={pmSearching ? <Spin size="small" /> : '未找到用戶，請繼續輸入'}
                  options={pmOptions}
                  allowClear
                  onClear={() => field.onChange('')}
                />
              )}
            />
          </Form.Item>

          {/* 産品PM — 搜尋選擇 */}
          <Form.Item
            label="産品PM"
            validateStatus={errors.product_pm ? 'error' : ''}
            help={errors.product_pm?.message}
          >
            <Controller
              name="product_pm"
              control={control}
              render={({ field }) => (
                <Select
                  showSearch
                  placeholder="輸入工號或姓名搜索（可留空）"
                  filterOption={false}
                  onSearch={handlePmSearch}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  value={field.value || undefined}
                  notFoundContent={pmSearching ? <Spin size="small" /> : '未找到用戶，請繼續輸入'}
                  options={pmOptions}
                  allowClear
                  onClear={() => field.onChange('')}
                />
              )}
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
                  popupRender={canManageGroups ? (menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 8px' }}>
                        <input
                          ref={newGroupInputRef}
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup() } }}
                          placeholder="輸入新分組名稱"
                          style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                        />
                        <Button
                          type="text"
                          icon={<PlusOutlined />}
                          loading={creatingGroup}
                          onClick={handleCreateGroup}
                          disabled={!newGroupName.trim()}
                          size="small"
                        >
                          新建分組
                        </Button>
                      </Space>
                    </>
                  ) : undefined}
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
            label="預估效益數量"
            validateStatus={errors.benefit_amount ? 'error' : ''}
            help={errors.benefit_amount?.message}
          >
            <Controller
              name="benefit_amount"
              control={control}
              render={({ field }) => (
                <Controller
                  name="benefit_unit"
                  control={control}
                  defaultValue="元/年"
                  render={({ field: unitField }) => (
                    <InputNumber
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      style={{ width: '100%' }}
                      placeholder="請輸入數字（支援小數）"
                      min={0}
                      stringMode={false}
                      addonAfter={
                        <Select
                          value={unitField.value ?? '元/年'}
                          onChange={unitField.onChange}
                          options={[
                            { value: '元/年', label: '元/年' },
                            { value: '人/年', label: '人/年' },
                            { value: '工時/年', label: '工時/年' },
                          ]}
                          style={{ width: 80 }}
                        />
                      }
                    />
                  )}
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

          {/* 描述 — 小輸入框 + 展開富文本編輯 */}
          <div className="col-span-2 mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm text-slate-700">專案描述</span>
              <button
                type="button"
                onClick={handleOpenExpand}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors"
              >
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                展開富文本編輯
              </button>
            </div>
            <Controller
              name="describe"
              control={control}
              render={({ field }) => {
                // If value is HTML (set by the expand editor), display stripped plain text in textarea
                const displayValue = field.value && isHtml(field.value)
                  ? stripHtml(field.value)
                  : (field.value ?? '')
                return (
                  <Input.TextArea
                    value={displayValue}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    rows={3}
                    placeholder="請輸入專案描述，或點擊右上角展開富文本編輯器..."
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                )
              }}
            />
            {describeValue && isHtml(describeValue) && (
              <p className="text-xs text-blue-500 mt-1">已套用富文本格式，點擊「展開富文本編輯」可繼續修改</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit" loading={isSaving} className="bg-blue-600">
            建立
          </Button>
        </div>
      </Form>

      {/* 描述展開編輯 Modal */}
      <Modal
        open={expandOpen}
        title="專案描述"
        onCancel={handleCancelExpand}
        width="80vw"
        style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={handleCancelExpand}>取消</Button>
            <Button type="primary" onClick={handleConfirmExpand} style={{ background: '#2563eb' }}>完成</Button>
          </div>
        }
        destroyOnClose
      >
        <RichTextEditor
          value={expandDraft}
          onChange={setExpandDraft}
          placeholder="請輸入專案描述..."
          minHeight={480}
        />
      </Modal>
    </Modal>
  )
}

export default CreateProjectModal
