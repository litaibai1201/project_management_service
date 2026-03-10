import React from 'react'
import { Tag, Tooltip } from 'antd'
import {
  PencilSquareIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentCheckIcon,
  Cog6ToothIcon,
  CheckBadgeIcon,
  PauseCircleIcon,
  TrashIcon,
  PlayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import {
  PROJECT_STATUS_MAP,
  FUNCTION_STATUS_MAP,
  DUTY_STATUS_MAP,
  PRIORITY_MAP,
} from '@/utils/status'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const PROJECT_STATUS_ICONS: Record<number, React.ReactNode> = {
  1: <PencilSquareIcon className="w-3 h-3" />,
  2: <MagnifyingGlassIcon className="w-3 h-3" />,
  3: <Cog6ToothIcon className="w-3 h-3" />,
  4: <ClipboardDocumentCheckIcon className="w-3 h-3" />,
  5: <PlayIcon className="w-3 h-3" />,
  6: <ClipboardDocumentCheckIcon className="w-3 h-3" />,
  7: <CheckBadgeIcon className="w-3 h-3" />,
  8: <PauseCircleIcon className="w-3 h-3" />,
  9: <TrashIcon className="w-3 h-3" />,
}

const FUNCTION_STATUS_ICONS: Record<number, React.ReactNode> = {
  1: <ClockIcon className="w-3 h-3" />,
  2: <PlayIcon className="w-3 h-3" />,
  3: <ClipboardDocumentCheckIcon className="w-3 h-3" />,
  4: <CheckBadgeIcon className="w-3 h-3" />,
  8: <PauseCircleIcon className="w-3 h-3" />,
  9: <TrashIcon className="w-3 h-3" />,
}

const DUTY_STATUS_ICONS: Record<number, React.ReactNode> = {
  0: <PencilSquareIcon className="w-3 h-3" />,
  1: <PlayIcon className="w-3 h-3" />,
  2: <ClipboardDocumentCheckIcon className="w-3 h-3" />,
  3: <CheckBadgeIcon className="w-3 h-3" />,
  8: <PauseCircleIcon className="w-3 h-3" />,
  9: <TrashIcon className="w-3 h-3" />,
}

const PRIORITY_ICONS: Record<number, React.ReactNode> = {
  1: <span style={{ fontSize: 10 }}>▽</span>,
  2: <span style={{ fontSize: 10 }}>▶</span>,
  3: <span style={{ fontSize: 10 }}>▲</span>,
  4: <span style={{ fontSize: 10 }}>⚡</span>,
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatusTagProps {
  value:    number
  type:     'project' | 'function' | 'duty' | 'priority'
  /** Show colored dot before label (default: true for status types) */
  showDot?: boolean
  /** Show icon before label (default: true) */
  showIcon?: boolean
  size?: 'small' | 'default'
}

const MAP_BY_TYPE = {
  project:  PROJECT_STATUS_MAP,
  function: FUNCTION_STATUS_MAP,
  duty:     DUTY_STATUS_MAP,
  priority: PRIORITY_MAP,
}

const ICON_BY_TYPE = {
  project:  PROJECT_STATUS_ICONS,
  function: FUNCTION_STATUS_ICONS,
  duty:     DUTY_STATUS_ICONS,
  priority: PRIORITY_ICONS,
}

// ─── Component ────────────────────────────────────────────────────────────────

export const StatusTag: React.FC<StatusTagProps> = ({
  value,
  type,
  showDot  = type !== 'priority',
  showIcon = true,
  size     = 'default',
}) => {
  const map  = MAP_BY_TYPE[type]
  const info = map[value]
  const icon = ICON_BY_TYPE[type][value]

  const dotColor = (info as { dot?: string })?.dot

  if (!info) return <Tag style={{ fontSize: 11 }}>{value}</Tag>

  const fontSize = size === 'small' ? 11 : 12
  const padding  = size === 'small' ? '0 5px' : '0 7px'

  return (
    <Tag
      color={info.color}
      style={{ fontSize, padding, display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: '20px' }}
    >
      {showDot && dotColor && (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {showIcon && icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.85 }}>
          {icon}
        </span>
      )}
      {info.label}
    </Tag>
  )
}

// ─── Compact dot-only badge (for table cells where space is tight) ─────────────

export interface StatusDotProps {
  value:   number
  type:    'project' | 'function' | 'duty'
  tooltip?: boolean
}

export const StatusDot: React.FC<StatusDotProps> = ({ value, type, tooltip = true }) => {
  const map  = MAP_BY_TYPE[type]
  const info = map[value]
  if (!info) return null
  const dotColor = (info as { dot?: string })?.dot ?? '#94a3b8'

  const dot = (
    <div className="flex items-center gap-1.5">
      <span
        className="status-dot"
        style={{ background: dotColor }}
      />
      <span className="text-slate-600 text-sm">{info.label}</span>
    </div>
  )

  return tooltip ? <Tooltip title={info.label}>{dot}</Tooltip> : dot
}

export default StatusTag
