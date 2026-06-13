import { Tag } from 'antd'
import React from 'react'
import i18n from '@/i18n'

// Status map entry — `label` is a getter so it always returns the current language
type StatusEntry   = { labelKey: string; color: string; dot: string; readonly label: string }
type PriorityEntry = { labelKey: string; color: string; readonly label: string }

const mkStatus = (labelKey: string, color: string, dot: string): StatusEntry =>
  ({ labelKey, color, dot, get label() { return i18n.t(labelKey) } })

const mkPriority = (labelKey: string, color: string): PriorityEntry =>
  ({ labelKey, color, get label() { return i18n.t(labelKey) } })

// ─── Project Status ───────────────────────────────────────────────────────────

export const PROJECT_STATUS_MAP: Record<number, StatusEntry> = {
  1:  mkStatus('status.project.1',  'default',    '#94a3b8'),
  2:  mkStatus('status.project.2',  'processing', '#2563eb'),
  3:  mkStatus('status.project.3',  'blue',       '#3b82f6'),
  4:  mkStatus('status.project.4',  'processing', '#2563eb'),
  5:  mkStatus('status.project.5',  'success',    '#16a34a'),
  6:  mkStatus('status.project.6',  'orange',     '#d97706'),
  7:  mkStatus('status.project.7',  'processing', '#2563eb'),
  8:  mkStatus('status.project.8',  'warning',    '#f59e0b'),
  9:  mkStatus('status.project.9',  'error',      '#dc2626'),
  10: mkStatus('status.project.10', 'purple',     '#8b5cf6'),
  11: mkStatus('status.project.11', 'processing', '#2563eb'),
}

export const FUNCTION_STATUS_MAP: Record<number, StatusEntry> = {
  0: mkStatus('status.function.0', 'default',    '#94a3b8'),
  1: mkStatus('status.function.1', 'default',    '#94a3b8'),
  2: mkStatus('status.function.2', 'success',    '#16a34a'),
  3: mkStatus('status.function.3', 'orange',     '#d97706'),
  4: mkStatus('status.function.4', 'processing', '#2563eb'),
  8: mkStatus('status.function.8', 'warning',    '#f59e0b'),
  9: mkStatus('status.function.9', 'error',      '#dc2626'),
}

export const DUTY_STATUS_MAP: Record<number, StatusEntry> = {
  0: mkStatus('status.duty.0', 'default',    '#94a3b8'),
  1: mkStatus('status.duty.1', 'success',    '#16a34a'),
  2: mkStatus('status.duty.2', 'orange',     '#d97706'),
  3: mkStatus('status.duty.3', 'processing', '#2563eb'),
  5: mkStatus('status.duty.5', 'purple',     '#7c3aed'),
  6: mkStatus('status.duty.6', 'cyan',       '#0891b2'),
  8: mkStatus('status.duty.8', 'warning',    '#f59e0b'),
  9: mkStatus('status.duty.9', 'error',      '#dc2626'),
}

export const PRIORITY_MAP: Record<number, PriorityEntry> = {
  1: mkPriority('status.priority.1', 'blue'   ),
  2: mkPriority('status.priority.2', 'orange' ),
  3: mkPriority('status.priority.3', 'red'    ),
  4: mkPriority('status.priority.4', 'magenta'),
}

export const renderProjectStatus = (status: number): React.ReactNode => {
  const s = PROJECT_STATUS_MAP[status]
  return s ? React.createElement(Tag, { color: s.color }, s.label) : status
}

export const renderFunctionStatus = (status: number): React.ReactNode => {
  const s = FUNCTION_STATUS_MAP[status]
  return s ? React.createElement(Tag, { color: s.color }, s.label) : status
}

export const renderDutyStatus = (status: number): React.ReactNode => {
  const s = DUTY_STATUS_MAP[status]
  return s ? React.createElement(Tag, { color: s.color }, s.label) : status
}

export const renderPriority = (priority: number): React.ReactNode => {
  const p = PRIORITY_MAP[priority]
  return p ? React.createElement(Tag, { color: p.color }, p.label) : priority
}

// ─── Group Name ─────────────────────────────────────────────────────────────
export const STAGE_GROUP = '__stage__'

/** Replace __stage__ marker with translated display name (with emoji) */
export const formatGroupName = (name: string | null | undefined): string => {
  if (name === STAGE_GROUP) return i18n.t('common.stageTask')
  return name ?? ''
}

/** Replace __stage__ marker with plain translated name (for exports/documents) */
export const formatGroupNamePlain = (name: string | null | undefined): string => {
  if (name === STAGE_GROUP) return i18n.t('common.stageTaskPlain')
  return name ?? ''
}

// ─── Benefit Unit Label ──────────────────────────────────────────────────────
const BENEFIT_UNIT_KEYS: Record<string, string> = {
  '元/年':   'project.benefitUnitMoney',
  '人/年':   'project.benefitUnitPerson',
  '工時/年': 'project.benefitUnitHour',
  '工时/年': 'project.benefitUnitHour',
}
export const benefitUnitLabel = (unit: string): string =>
  BENEFIT_UNIT_KEYS[unit] ? i18n.t(BENEFIT_UNIT_KEYS[unit]) : unit
