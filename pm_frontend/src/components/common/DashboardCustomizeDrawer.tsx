import React, { useState, useEffect } from 'react'
import { Modal, Button, Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import { XMarkIcon, CheckIcon, EllipsisVerticalIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import type { UseDashboardConfigReturn, WidgetEntry } from '@/hooks/useDashboardConfig'
import type { DashboardViewType } from '@/types/api.types'
import { useTranslation } from 'react-i18next'

// ── Widget metadata ────────────────────────────────────────────────────────────

interface WidgetMeta {
  id: string
  titleKey: string
  descKey: string
  color: string
}

interface CategoryDef {
  key: string
  labelKey: string
  widgets: WidgetMeta[]
}

const WIDGET_DEFS: Record<DashboardViewType, CategoryDef[]> = {
  personal: [
    { key: 'project', labelKey: 'widget.catProject', widgets: [
      { id: 'project_stats',      titleKey: 'widget.projectStats',     descKey: 'widget.projectStatsDesc',     color: '#3b82f6' },
      { id: 'my_projects',        titleKey: 'widget.myProjects',       descKey: 'widget.myProjectsDesc',       color: '#3b82f6' },
    ]},
    { key: 'task', labelKey: 'widget.catTask', widgets: [
      { id: 'task_stats',         titleKey: 'widget.taskStats',        descKey: 'widget.taskStatsDesc',        color: '#22c55e' },
      { id: 'my_tasks',           titleKey: 'widget.myTasks',          descKey: 'widget.myTasksDesc',          color: '#22c55e' },
      { id: 'pending_review',     titleKey: 'widget.pendingReview',    descKey: 'widget.pendingReviewDesc',    color: '#f59e0b' },
      { id: 'my_pending_review',  titleKey: 'widget.myPendingReview',  descKey: 'widget.myPendingReviewDesc',  color: '#f59e0b' },
    ]},
    { key: 'hours', labelKey: 'widget.catHours', widgets: [
      { id: 'activity_chart',     titleKey: 'widget.activityChart',    descKey: 'widget.activityChartDesc',    color: '#8b5cf6' },
      { id: 'monthly_attendance', titleKey: 'widget.monthlyAttendance',descKey: 'widget.monthlyAttendanceDesc',color: '#8b5cf6' },
    ]},
    { key: 'log', labelKey: 'widget.catLog', widgets: [
      { id: 'daily_log',          titleKey: 'widget.dailyLog',         descKey: 'widget.dailyLogDesc',         color: '#06b6d4' },
    ]},
    { key: 'other', labelKey: 'widget.catOther', widgets: [
      { id: 'latest_news',        titleKey: 'widget.latestNews',       descKey: 'widget.latestNewsDesc',       color: '#64748b' },
    ]},
  ],
  manager: [
    { key: 'project', labelKey: 'widget.catProject', widgets: [
      { id: 'team_project',        titleKey: 'widget.teamProject',      descKey: 'widget.teamProjectDesc',     color: '#3b82f6' },
    ]},
    { key: 'task', labelKey: 'widget.catTask', widgets: [
      { id: 'team_task',           titleKey: 'widget.teamTask',         descKey: 'widget.teamTaskDesc',        color: '#22c55e' },
      { id: 'team_pending',        titleKey: 'widget.teamPending',      descKey: 'widget.teamPendingDesc',     color: '#f59e0b' },
    ]},
    { key: 'member', labelKey: 'widget.catMember', widgets: [
      { id: 'team_size',           titleKey: 'widget.teamSize',         descKey: 'widget.teamSizeDesc',        color: '#ec4899' },
      { id: 'daily_report_status', titleKey: 'widget.dailyReportStatus',descKey: 'widget.dailyReportStatusDesc',color: '#06b6d4' },
      { id: 'member_task_chart',   titleKey: 'widget.memberTaskChart',  descKey: 'widget.memberTaskChartDesc', color: '#8b5cf6' },
      { id: 'member_detail',       titleKey: 'widget.memberDetail',     descKey: 'widget.memberDetailDesc',    color: '#64748b' },
    ]},
    { key: 'benefit', labelKey: 'widget.catBenefit', widgets: [
      { id: 'team_benefit',        titleKey: 'widget.teamBenefit',      descKey: 'widget.teamBenefitDesc',     color: '#3b82f6' },
      { id: 'team_benefit_detail', titleKey: 'widget.teamBenefitDetail',descKey: 'widget.teamBenefitDetailDesc',color: '#3b82f6' },
    ]},
    { key: 'req_ar', labelKey: 'widget.catReqAr', widgets: [
      { id: 'team_requirement', titleKey: 'widget.teamRequirement',  descKey: 'widget.teamRequirementDesc', color: '#7c3aed' },
      { id: 'team_ar_task',     titleKey: 'widget.teamArTask',       descKey: 'widget.teamArTaskDesc',      color: '#d97706' },
    ]},
  ],
}

// ── Widget card preview illustration ──────────────────────────────────────────

const WidgetPreview: React.FC<{ color: string }> = ({ color }) => (
  <div className="rounded-lg p-2.5" style={{ background: `${color}12` }}>
    <div className="flex flex-col gap-1.5">
      {[0.7, 0.5, 0.35].map((opacity, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded" style={{ background: color, opacity }} />
          <div className="flex-1 h-1.5 rounded-full bg-slate-200" />
          <div className="w-5 h-1.5 rounded-full" style={{ background: color, opacity: opacity * 0.7 }} />
        </div>
      ))}
    </div>
  </div>
)

// ── AddCardModal (controlled) ──────────────────────────────────────────────────

interface AddCardModalProps {
  open:       boolean
  onClose:    () => void
  viewType:   DashboardViewType
  allWidgets: WidgetEntry[]
  onShow:     UseDashboardConfigReturn['showWidget']
  onHide:     UseDashboardConfigReturn['hideWidget']
}

export const AddCardModal: React.FC<AddCardModalProps> = ({
  open, onClose, viewType, allWidgets, onShow, onHide,
}) => {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [pendingVisible, setPendingVisible] = useState<Set<string>>(new Set())

  const categories = (WIDGET_DEFS[viewType] ?? WIDGET_DEFS.personal).map((c) => ({
    ...c,
    label: t(c.labelKey),
    widgets: c.widgets.map((w) => ({ ...w, title: t(w.titleKey), desc: t(w.descKey) })),
  }))

  useEffect(() => {
    if (open) {
      const visible = new Set(allWidgets.filter((w) => w.is_visible).map((w) => w.widget_id))
      setPendingVisible(visible)
      setActiveCategory(categories[0]?.key ?? '')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleConfirm = () => {
    allWidgets.forEach((w) => {
      const shouldShow = pendingVisible.has(w.widget_id)
      if (shouldShow && !w.is_visible) onShow(w.widget_id)
      else if (!shouldShow && w.is_visible && w.removable) onHide(w.widget_id)
    })
    onClose()
  }

  const toggle = (id: string, removable: boolean) => {
    if (!removable) return
    setPendingVisible((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const currentCat = categories.find((c) => c.key === activeCategory)

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('widget.addCard')}
      width={680}
      footer={
        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" onClick={handleConfirm}>{t('common.confirm')}</Button>
        </div>
      }
      styles={{ body: { padding: '16px 0 0 0' } }}
    >
      <div className="flex" style={{ minHeight: 380 }}>
        {/* Left: category sidebar */}
        <div className="w-28 border-r border-slate-100 flex flex-col gap-0.5 px-2 pb-4 flex-shrink-0">
          {categories.map((cat) => {
            const count = cat.widgets.filter((w) => pendingVisible.has(w.id)).length
            return (
              <div
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors select-none ${
                  activeCategory === cat.key
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{cat.label}</span>
                <span className="text-xs text-slate-400">· {count}</span>
              </div>
            )
          })}
        </div>

        {/* Right: card grid */}
        <div className="flex-1 px-5 pb-4 overflow-y-auto">
          <p className="text-xs text-slate-400 mb-3">{t('widget.clickToToggle')}</p>
          <div className="grid grid-cols-2 gap-3">
            {currentCat?.widgets.map((meta) => {
              const entry     = allWidgets.find((w) => w.widget_id === meta.id)
              const removable = entry?.removable ?? true
              const selected  = pendingVisible.has(meta.id)
              return (
                <div
                  key={meta.id}
                  onClick={() => toggle(meta.id, removable)}
                  className={`relative rounded-xl border-2 p-3 transition-all ${
                    selected
                      ? 'border-blue-400 bg-blue-50/60'
                      : 'border-slate-100 bg-white hover:border-slate-300'
                  } ${removable ? 'cursor-pointer' : 'cursor-default opacity-60'}`}
                >
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <CheckIcon className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <WidgetPreview color={meta.color} />
                  <div className="mt-2.5">
                    <div className="text-sm font-medium text-slate-700">{meta.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-snug">{meta.desc}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── WidgetMenu (⋮ dropdown on each card) ─────────────────────────────────────

export const WidgetMenu: React.FC<{
  widgetId:  string
  removable: boolean
  onHide:    (id: string) => void
  onRefresh: () => void
}> = ({ widgetId, removable, onHide, onRefresh }) => {
  const { t } = useTranslation()
  const items: MenuProps['items'] = [
    {
      key:   'refresh',
      label: t('common.refresh'),
      icon:  <ArrowPathIcon className="w-3.5 h-3.5" />,
      onClick: () => onRefresh(),
    },
    ...(removable ? [{
      key:     'remove',
      label:   t('widget.remove'),
      danger:  true,
      icon:    <XMarkIcon className="w-3.5 h-3.5" />,
      onClick: () => onHide(widgetId),
    }] : []),
  ]

  return (
    <div
      className="absolute z-10"
      style={{ top: 11, right: 12 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Dropdown menu={{ items }} trigger={['click']}>
        <button className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer border-0 outline-none bg-transparent">
          <EllipsisVerticalIcon className="w-4 h-4" />
        </button>
      </Dropdown>
    </div>
  )
}
