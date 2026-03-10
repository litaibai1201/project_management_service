import React from 'react'
import { Empty, Button } from 'antd'

export interface EmptyStateProps {
  description?: string
  actionLabel?: string
  onAction?:    () => void
}

const EmptyState: React.FC<EmptyStateProps> = ({
  description = '暫無數據',
  actionLabel,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16">
    <Empty description={description}>
      {actionLabel && onAction && (
        <Button type="primary" onClick={onAction} className="mt-2 bg-blue-600">
          {actionLabel}
        </Button>
      )}
    </Empty>
  </div>
)

export default EmptyState
