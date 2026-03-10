import React from 'react'
import { Button, Breadcrumb } from 'antd'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useNavigate } from 'react-router-dom'

export interface PageHeaderProps {
  title:       string
  subtitle?:   string
  backPath?:   string
  breadcrumbs?: { label: string; path?: string }[]
  extra?:      React.ReactNode
}

const PageHeader: React.FC<PageHeaderProps> = ({
  title, subtitle, backPath, breadcrumbs, extra,
}) => {
  const navigate = useNavigate()

  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        {backPath && (
          <Button
            type="text"
            icon={<ArrowLeftIcon className="w-4 h-4" />}
            onClick={() => navigate(backPath)}
            className="mt-1"
          />
        )}
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <Breadcrumb
              className="mb-1 text-xs"
              items={breadcrumbs.map((b) => ({
                title: b.path ? (
                  <button className="text-blue-500 hover:underline" onClick={() => navigate(b.path!)}>
                    {b.label}
                  </button>
                ) : b.label,
              }))}
            />
          )}
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          {subtitle && <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {extra && <div className="flex items-center gap-2">{extra}</div>}
    </div>
  )
}

export default PageHeader
