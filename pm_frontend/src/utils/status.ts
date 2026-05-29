import { Tag } from 'antd'
import React from 'react'

// ─── Project Status ───────────────────────────────────────────────────────────

export const PROJECT_STATUS_MAP: Record<number, { label: string; color: string; dot: string }> = {
  1: { label: '草稿',     color: 'default',    dot: '#94a3b8' },
  2: { label: '立案審核', color: 'processing', dot: '#2563eb' },
  3: { label: '規劃中',   color: 'blue',       dot: '#3b82f6' },
  4: { label: '規劃審核', color: 'processing', dot: '#2563eb' },
  5: { label: '執行中',   color: 'green',      dot: '#16a34a' },
  6: { label: '完結審核', color: 'orange',     dot: '#d97706' },
  7: { label: '已完結',   color: 'success',    dot: '#15803d' },
  8: { label: '擱置',     color: 'warning',    dot: '#f59e0b' },
  9: { label: '刪除',     color: 'error',      dot: '#dc2626' },
}

export const FUNCTION_STATUS_MAP: Record<number, { label: string; color: string; dot: string }> = {
  0: { label: '草稿',     color: 'default',    dot: '#94a3b8' },
  1: { label: '待開始',   color: 'default',    dot: '#94a3b8' },
  2: { label: '進行中',   color: 'processing', dot: '#2563eb' },
  3: { label: '完結審核', color: 'orange',     dot: '#d97706' },
  4: { label: '已完結',   color: 'success',    dot: '#15803d' },
  8: { label: '擱置',     color: 'warning',    dot: '#f59e0b' },
  9: { label: '刪除',     color: 'error',      dot: '#dc2626' },
}

export const DUTY_STATUS_MAP: Record<number, { label: string; color: string; dot: string }> = {
  0: { label: '草稿',     color: 'default',    dot: '#94a3b8' },
  1: { label: '進行中',   color: 'processing', dot: '#2563eb' },
  2: { label: '完結審核', color: 'orange',     dot: '#d97706' },
  3: { label: '已完結',   color: 'success',    dot: '#15803d' },
  5: { label: '審核中',   color: 'purple',     dot: '#7c3aed' },
  6: { label: '未開始',   color: 'cyan',       dot: '#0891b2' },
  8: { label: '擱置',     color: 'warning',    dot: '#f59e0b' },
  9: { label: '刪除',     color: 'error',      dot: '#dc2626' },
}

export const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  1: { label: '低',   color: 'blue'    },
  2: { label: '中',   color: 'orange'  },
  3: { label: '高',   color: 'red'     },
  4: { label: '緊急', color: 'magenta' },
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
