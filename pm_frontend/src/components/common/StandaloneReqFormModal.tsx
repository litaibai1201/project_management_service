/**
 * StandaloneReqFormModal — 系統需求 新增/編輯 共用表單彈窗
 *
 * 用於 SystemDetailPage 和 RequirementListPage，
 * 差異透過 props 控制：
 *   - fixedSystemId: 固定系統 ID（系統詳情頁傳入，鎖定不可選）
 *   - fixedSystemName: 固定系統名稱（顯示用）
 *   - 不傳則顯示系統選擇下拉
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Form, Input, Select, Switch, Button } from 'antd'
import { ArrowsPointingOutIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import { systemApi } from '@/api/system.api'
import { userApi } from '@/api/user.api'
import { showToast } from '@/utils/toast'
import DateInput from '@/components/common/DateInput'
import RichTextEditor from '@/components/common/RichTextEditor'

export interface StandaloneReqFormModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  /** 編輯目標，為 null 時為新增模式 */
  editTarget?: StandaloneReq | null
  /** 固定系統 ID（系統詳情頁使用） */
  fixedSystemId?: string
  /** 固定系統名稱（系統詳情頁使用） */
  fixedSystemName?: string
}

const isHtml = (v: string) => /<[a-z][\s\S]*>/i.test(v)
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const StandaloneReqFormModal: React.FC<StandaloneReqFormModalProps> = ({
  open, onClose, onSuccess, editTarget, fixedSystemId, fixedSystemName,
}) => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [expandOpen, setExpandOpen] = useState(false)
  const [expandDraft, setExpandDraft] = useState('')
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([])
  const [systemOptions, setSystemOptions] = useState<{ value: string; label: string }[]>([])

  const describeValue = Form.useWatch('describe', form)

  const loadUsers = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [userOptions.length])

  const loadSystems = useCallback(() => {
    if (fixedSystemId || systemOptions.length > 0) return
    systemApi.list({ page: 1, size: 200 }).then((res) => {
      const list = res.content?.data_list ?? []
      setSystemOptions(list.map((s: { id: string; sys_nm: string }) => ({ value: s.id, label: s.sys_nm })))
    }).catch(() => {})
  }, [fixedSystemId, systemOptions.length])

  // 打開時載入數據
  useEffect(() => {
    if (!open) return
    loadUsers()
    if (!fixedSystemId) loadSystems()

    if (editTarget) {
      form.setFieldsValue({
        req_nm:            editTarget.req_nm,
        system_id:         editTarget.system_id,
        describe:          editTarget.describe,
        priority:          editTarget.priority,
        responsible:       editTarget.responsible,
        expected_end_date: editTarget.expected_end_date,
        expected_benefit:  editTarget.expected_benefit,
        benefit_amount:    editTarget.benefit_amount,
        benefit_unit:      editTarget.benefit_unit ?? '元/年',
        region:            (editTarget as unknown as { region?: string }).region ?? '',
        campus:            (editTarget as unknown as { campus?: string }).campus ?? '',
        process:           (editTarget as unknown as { process?: string }).process ?? '',
        factory:           (editTarget as unknown as { factory?: string }).factory ?? '',
        create_stage_tasks: (editTarget as unknown as { create_stage_tasks?: boolean }).create_stage_tasks ?? false,
      })
    } else {
      form.resetFields()
    }
  }, [open, editTarget]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSaving(true)
    try {
      const payload = {
        req_nm:            values.req_nm as string,
        system_id:         fixedSystemId || (values.system_id as string),
        describe:          values.describe as string | undefined,
        priority:          values.priority as number,
        responsible:       values.responsible as string[] | undefined,
        expected_end_date: values.expected_end_date as string | undefined,
        expected_benefit:  values.expected_benefit as string | undefined,
        benefit_amount:    values.benefit_amount as number | null | undefined,
        benefit_unit:      values.benefit_unit as string | undefined,
        region:            values.region as string | undefined,
        campus:            values.campus as string | undefined,
        process:           values.process as string | undefined,
        factory:           values.factory as string | undefined,
        create_stage_tasks: values.create_stage_tasks as boolean | undefined,
      }
      if (editTarget) {
        await standaloneReqApi.update(editTarget.id, payload as any)
        showToast.success(t('common.saveSuccess'))
      } else {
        await standaloneReqApi.create(payload as any)
        showToast.success(t('common.createSuccess'))
      }
      form.resetFields()
      onClose()
      onSuccess()
    } catch (err: unknown) {
      showToast.error((err instanceof Error ? err.message : String(err)) || t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const handleOpenExpand = () => {
    const current = (describeValue as string) ?? ''
    const html = isHtml(current) ? current : current.trim() ? `<p>${current.replace(/\n/g, '</p><p>')}</p>` : ''
    setExpandDraft(html)
    setExpandOpen(true)
  }

  return (
    <>
      <Modal
        title={editTarget ? `${t('system.editReq')} — ${editTarget.req_nm}` : (fixedSystemName ? t('system.addReq') : t('requirement.createSysReq'))}
        open={open}
        onCancel={() => { onClose(); form.resetFields() }}
        footer={null}
        width="min(600px, 88vw)"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} className="mt-4">
          {/* 系統名稱：固定 or 選擇 */}
          {fixedSystemId ? (
            <Form.Item label={t('system.sysName')}>
              <Input value={fixedSystemName ?? ''} disabled style={{ color: '#334155', fontWeight: 500 }} />
            </Form.Item>
          ) : (
            <Form.Item name="system_id" label={t('requirement.linkedSystem')} rules={[{ required: true, message: t('requirement.systemRequired') }]}>
              <Select
                placeholder={t('requirement.systemPlaceholder')}
                options={systemOptions}
                showSearch
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                onOpenChange={(open) => { if (open) loadSystems() }}
              />
            </Form.Item>
          )}

          <Form.Item name="req_nm" label={t('system.reqName')} rules={[{ required: true, message: t('system.reqNameRequired') }]}>
            <Input placeholder={t('system.reqNamePlaceholder')} />
          </Form.Item>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label={t('common.priority')} initialValue={2}>
              <Select options={[
                { value: 1, label: t('system.priorityLow') },
                { value: 2, label: t('system.priorityMed') },
                { value: 3, label: t('system.priorityHigh') },
                { value: 4, label: t('system.priorityUrgent') },
              ]} />
            </Form.Item>
            <Form.Item name="expected_end_date" label={t('system.expectedEndDate')}>
              <DateInput />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="benefit_amount" label={t('system.benefitAmount')}>
              <Input type="number" min={0} placeholder={t('system.benefitAmountPlaceholder')} />
            </Form.Item>
            <Form.Item name="benefit_unit" label={t('system.benefitUnit')} initialValue="元/年">
              <Select options={[
                { value: '元/年', label: t('system.unitYuan') },
                { value: '人/年', label: t('system.unitPerson') },
                { value: '工時/年', label: t('system.unitHour') },
              ]} />
            </Form.Item>
          </div>

          <Form.Item name="expected_benefit" label={t('system.benefitDesc')}>
            <Input.TextArea placeholder={t('system.optional')} autoSize={{ minRows: 2, maxRows: 6 }} style={{ resize: 'vertical' }} />
          </Form.Item>

          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="region" label={t('project.region')}>
              <Input placeholder={t('project.regionPlaceholder')} />
            </Form.Item>
            <Form.Item name="campus" label={t('project.campus')}>
              <Input placeholder={t('project.campusPlaceholder')} />
            </Form.Item>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="process" label={t('project.process')}>
              <Input placeholder={t('project.processPlaceholder')} />
            </Form.Item>
            <Form.Item name="factory" label={t('project.factory')}>
              <Input placeholder={t('project.factoryPlaceholder')} />
            </Form.Item>
          </div>

          <Form.Item name="responsible" label={t('system.responsible')}>
            <Select
              mode="multiple" placeholder={t('system.selectResponsible')}
              options={userOptions} showSearch allowClear
              filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              onOpenChange={(open) => { if (open) loadUsers() }}
            />
          </Form.Item>

          <Form.Item label={t('system.reqDescribe')}>
            <div className="flex justify-end mb-1.5">
              <button type="button" onClick={handleOpenExpand}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded-md px-2 py-1 hover:border-blue-300 bg-white transition-colors">
                <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                {t('system.expandRichText')}
              </button>
            </div>
            <Form.Item name="describe" noStyle getValueProps={(v) => ({ value: v && isHtml(v) ? stripHtml(v) : (v ?? '') })}>
              <Input.TextArea rows={3} placeholder={t('system.reqDescPlaceholder')} style={{ resize: 'vertical', minHeight: 72 }} />
            </Form.Item>
            {describeValue && isHtml(describeValue as string) && (
              <p className="text-xs text-blue-500 mt-1">{t('system.richTextApplied')}</p>
            )}
          </Form.Item>

          <Form.Item name="create_stage_tasks" valuePropName="checked" initialValue={false}>
            <Switch size="small" />
          </Form.Item>
          <div className="-mt-3 mb-3 text-xs text-slate-500">{t('system.createStageTasks')}</div>

          <div className="flex justify-end gap-3">
            <Button onClick={() => { onClose(); form.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ background: '#2563eb' }}>
              {editTarget ? t('common.save') : t('system.createBtn')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Rich Text Expand Modal */}
      <Modal open={expandOpen} title={t('system.reqDescribe')} onCancel={() => setExpandOpen(false)}
        width="80vw" style={{ top: 40, maxWidth: 1100 }}
        styles={{ body: { padding: '16px 24px 24px' } }}
        footer={<div className="flex justify-end gap-2">
          <Button onClick={() => setExpandOpen(false)}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={() => { form.setFieldValue('describe', expandDraft); setExpandOpen(false) }} style={{ background: '#2563eb' }}>{t('system.done')}</Button>
        </div>}
        destroyOnHidden
      >
        <RichTextEditor value={expandDraft} onChange={setExpandDraft} placeholder={t('system.reqDescPlaceholder')} minHeight={480} />
      </Modal>
    </>
  )
}

export default StandaloneReqFormModal
