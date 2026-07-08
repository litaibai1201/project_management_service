/**
 * ProgressPreCheckModal — 更新进度前置检查弹窗
 *
 * 检查任务是否缺少开始/结束时间或已超期，
 * 弹窗让用户当场设定日期后才能继续更新进度。
 *
 * 三处复用：FunctionDetailDrawer / DutyDetailDrawer / DailyLogPage
 */
import React, { useState } from 'react'
import { Modal, Button, Input } from 'antd'
import { useTranslation } from 'react-i18next'
import DateInput from '@/components/common/DateInput'
import { showToast } from '@/utils/toast'

export type PreCheckType = 'start' | 'end' | 'overdue' | null

export interface ProgressPreCheckModalProps {
  type: PreCheckType
  currentEndDate?: string
  onClose: () => void
  /** 提交日期后调用，返回 Promise 表示保存完成 */
  onSubmit: (type: 'start' | 'end' | 'overdue', date: string, reason: string) => Promise<void>
}

const ProgressPreCheckModal: React.FC<ProgressPreCheckModalProps> = ({
  type, currentEndDate, onClose, onSubmit,
}) => {
  const { t } = useTranslation()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!date) { showToast.warning(t('function.pleaseSelectDate')); return }
    if (!type) return
    setSaving(true)
    try {
      await onSubmit(type, date, reason)
      setDate(''); setReason('')
      onClose()
    } catch { /* global */ }
    finally { setSaving(false) }
  }

  const handleClose = () => {
    setDate(''); setReason('')
    onClose()
  }

  return (
    <Modal
      open={!!type}
      title={type === 'overdue' ? t('function.needExtendDateTitle') : type === 'start' ? t('function.needStartDateTitle') : t('function.needEndDateTitle')}
      onCancel={handleClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={handleClose}>{t('common.cancel')}</Button>
          <Button type="primary" loading={saving} disabled={!date} style={{ background: '#2563eb' }} onClick={handleSubmit}>
            {t('common.confirm')}
          </Button>
        </div>
      }
      width={420} destroyOnHidden
    >
      <div className="py-2 space-y-3">
        <p className="text-sm text-slate-500">
          {type === 'overdue' ? t('function.needExtendDate') : type === 'start' ? t('function.needStartDate') : t('function.needEndDate')}
        </p>
        {type === 'overdue' && currentEndDate && (
          <p className="text-xs text-slate-400">{t('function.currentDeadline', { date: currentEndDate })}</p>
        )}
        <div>
          <div className="text-sm font-medium text-slate-700 mb-1">
            {type === 'overdue' ? t('function.newExpectedEnd') : type === 'start' ? t('function.expectedStart') : t('function.expectedEnd')}
          </div>
          <DateInput value={date} onChange={(v) => setDate(v)} />
        </div>
        {type === 'overdue' && (
          <div>
            <div className="text-sm font-medium text-slate-700 mb-1">{t('function.rescheduleReason')}</div>
            <Input.TextArea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('function.rescheduleReasonPlaceholder')} />
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * 检查任务是否需要前置设定日期，返回需要的 PreCheckType，如果都满足返回 null
 */
export function checkTaskDates(startDate?: string, endDate?: string): PreCheckType {
  if (!startDate) return 'start'
  if (!endDate) return 'end'
  if (endDate < new Date().toISOString().slice(0, 10)) return 'overdue'
  return null
}

export default ProgressPreCheckModal
