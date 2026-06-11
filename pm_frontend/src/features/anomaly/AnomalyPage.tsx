/**
 * AnomalyPage — 異常管理看板
 * 管理目的：著重於管理異常，正常則可以減少時間管理
 * 自動識別並彙整所有「異常」項目，主管只需關注異常
 */
import React, { useState, useMemo, useEffect } from 'react'
import {
  Card, Tag, Avatar, Empty,
} from 'antd'
import {
  ExclamationTriangleIcon, ClockIcon, DocumentTextIcon,
  ChartBarIcon, PauseCircleIcon, ShieldExclamationIcon,
  ArrowTrendingDownIcon, BellAlertIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import { projectApi } from '@/api/project.api'
import { useTranslation } from 'react-i18next'

// ─── Anomaly Types ──────────────────────────────────────────────────────────

type AnomalyLevel = 'critical' | 'warning' | 'info'
type AnomalyType = 'task_overdue' | 'task_urgent' | 'no_daily_log' | 'insufficient_hours' | 'progress_stalled' | 'project_delay' | 'delay_no_report'

interface AnomalyItem {
  id: string
  type: AnomalyType
  level: AnomalyLevel
  title: string
  description: string
  member?: string
  member_work_no?: string
  project?: string
  task?: string
  value?: number      // days overdue, hours missing, etc.
  detected_at: string
  resolved?: boolean
}

const TYPE_STYLE: Record<AnomalyType, { icon: React.ReactNode; color: string; labelKey: string }> = {
  task_overdue:      { icon: <ClockIcon className="w-4 h-4" />,              color: '#dc2626', labelKey: 'anomaly.taskOverdue' },
  task_urgent:       { icon: <ExclamationTriangleIcon className="w-4 h-4" />,color: '#d97706', labelKey: 'anomaly.taskUrgent' },
  no_daily_log:      { icon: <DocumentTextIcon className="w-4 h-4" />,       color: '#f59e0b', labelKey: 'anomaly.noDailyLog' },
  insufficient_hours:{ icon: <ArrowTrendingDownIcon className="w-4 h-4" />,  color: '#f97316', labelKey: 'anomaly.insufficientHours' },
  progress_stalled:  { icon: <PauseCircleIcon className="w-4 h-4" />,        color: '#8b5cf6', labelKey: 'anomaly.progressStalled' },
  project_delay:     { icon: <ChartBarIcon className="w-4 h-4" />,           color: '#dc2626', labelKey: 'anomaly.projectDelay' },
  delay_no_report:   { icon: <ShieldExclamationIcon className="w-4 h-4" />,  color: '#be123c', labelKey: 'anomaly.delayNoReport' },
}

// ─── Anomaly data is loaded from the API ────────────────────────────────────

// ─── Stats Summary ──────────────────────────────────────────────────────────
const SummaryCard: React.FC<{
  title: string; count: number; color: string; bg: string; icon: React.ReactNode; active?: boolean; onClick?: () => void
}> = ({ title, count, color, bg, icon, active, onClick }) => {
  const { t } = useTranslation()
  return (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center gap-3 cursor-pointer transition-all hover:shadow-md ${active ? 'ring-2' : ''}`}
    style={active ? { borderColor: color, boxShadow: `0 0 0 2px ${color}33` } : {}}
  >
    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
      {icon}
    </div>
    <div>
      <div className="text-[10px] text-slate-400 font-medium leading-none mb-0.5">{title}</div>
      <div className="font-bold text-xl leading-none" style={{ color }}>
        {count}<span className="text-xs font-normal text-slate-400 ml-0.5">{t('anomaly.itemUnit')}</span>
      </div>
    </div>
  </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

type FilterLevel = 'all' | 'critical' | 'warning'
type ViewMode = 'project' | 'member'

const AnomalyPage: React.FC = () => {
  const { t } = useTranslation()
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all')
  const [filterType, setFilterType] = useState<AnomalyType | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('project')
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(projectApi as any).anomalies()
      .then((res: { content?: unknown }) => {
        if (Array.isArray(res.content)) setAnomalies(res.content as AnomalyItem[])
      })
      .catch(() => {})
  }, [])

  // Helper: count unique tasks (deduplicated by task name + project)
  const countUniqueTasks = (items: AnomalyItem[]) => {
    const seen = new Set<string>()
    items.forEach((a) => seen.add(`${a.project ?? ''}::${a.task ?? a.title}`))
    return seen.size
  }

  // Filter by type first (for level card counts), then by level (for type tag counts)
  const filteredByType = useMemo(() =>
    filterType === 'all' ? anomalies : anomalies.filter((a) => a.type === filterType),
    [anomalies, filterType])

  const filteredByLevel = useMemo(() =>
    filterLevel === 'all' ? anomalies : anomalies.filter((a) => a.level === filterLevel),
    [anomalies, filterLevel])

  // Level card counts: unique tasks, react to filterType
  const allTaskCount  = countUniqueTasks(filteredByType)
  const criticalCount = countUniqueTasks(filteredByType.filter((a) => a.level === 'critical'))
  const warningCount  = countUniqueTasks(filteredByType.filter((a) => a.level === 'warning'))

  // Type tag counts: unique tasks, react to filterLevel
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    // Group by type, then count unique tasks within each type
    const byType: Record<string, AnomalyItem[]> = {}
    filteredByLevel.forEach((a) => {
      ;(byType[a.type] = byType[a.type] ?? []).push(a)
    })
    Object.entries(byType).forEach(([t, items]) => { counts[t] = countUniqueTasks(items) })
    return counts
  }, [filteredByLevel])

  // Final filtered list: both filters applied
  const filtered = useMemo(() => {
    let list = anomalies
    if (filterLevel !== 'all') list = list.filter((a) => a.level === filterLevel)
    if (filterType !== 'all') list = list.filter((a) => a.type === filterType)
    return list
  }, [anomalies, filterLevel, filterType])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t('anomaly.boardTitle')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('anomaly.boardSubtitle', { datetime: dayjs().format('YYYY-MM-DD HH:mm') })}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard
          title={t('anomaly.allAnomalies')} count={allTaskCount}
          color="#334155" bg="#f1f5f9"
          icon={<BellAlertIcon className="w-4 h-4 text-slate-500" />}
          active={filterLevel === 'all'} onClick={() => setFilterLevel('all')}
        />
        <SummaryCard
          title={t('anomaly.highRisk')} count={criticalCount}
          color="#dc2626" bg="#fef2f2"
          icon={<ShieldExclamationIcon className="w-4 h-4 text-red-500" />}
          active={filterLevel === 'critical'} onClick={() => setFilterLevel('critical')}
        />
        <SummaryCard
          title={t('anomaly.needAttention')} count={warningCount}
          color="#d97706" bg="#fff7ed"
          icon={<ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />}
          active={filterLevel === 'warning'} onClick={() => setFilterLevel('warning')}
        />
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <FunnelIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 font-medium flex-shrink-0">{t('anomaly.anomalyType')}</span>
        <Tag
          className="cursor-pointer"
          color={filterType === 'all' ? 'blue' : undefined}
          onClick={() => setFilterType('all')}
          style={{ fontSize: 11 }}
        >
          {t('anomaly.all')}
        </Tag>
        {(Object.keys(TYPE_STYLE) as AnomalyType[]).map((tp) => {
          const count = typeCounts[tp] ?? 0
          if (count === 0) return null
          return (
            <Tag
              key={tp}
              className="cursor-pointer"
              color={filterType === tp ? TYPE_STYLE[tp].color : undefined}
              onClick={() => setFilterType(filterType === tp ? 'all' : tp)}
              style={{ fontSize: 11 }}
            >
              {t(TYPE_STYLE[tp].labelKey)} ({count})
            </Tag>
          )
        })}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs text-slate-500 font-medium">{t('anomaly.perspective')}</span>
        {([
          { key: 'project' as ViewMode, label: t('anomaly.byProject'), icon: <ChartBarIcon className="w-3.5 h-3.5" /> },
          { key: 'member' as ViewMode, label: t('anomaly.byMember'), icon: <BellAlertIcon className="w-3.5 h-3.5" /> },
        ]).map((v) => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border-0 outline-none cursor-pointer ${
              viewMode === v.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {v.icon}{v.label}
          </button>
        ))}
      </div>

      {/* Grouped anomaly view */}
      {filtered.length === 0 ? (
        <Card variant="borderless" className="shadow-sm">
          <Empty description={t('anomaly.noAnomalies')} className="py-10" />
        </Card>
      ) : (() => {
        // ── Helper: merge same-task anomalies into one row ──
        type MergedTask = {
          taskName: string
          types: { type: AnomalyType; label: string; color: string }[]
          members: { name: string; work_no: string }[]
          maxOverdue: number | null
          items: AnomalyItem[]
        }
        // Generate a localized display name instead of using backend's Chinese title
        const localizedName = (a: AnomalyItem): string => {
          if (a.task) return a.task // task name is user data, keep as-is
          if (a.type === 'project_delay') return t('anomaly.projectDelayDesc', { name: a.project ?? '' })
          if (a.type === 'delay_no_report') return t('anomaly.delayNoReportDesc', { name: a.project ?? '' })
          if (a.type === 'no_daily_log') return t('anomaly.noDailyLogDesc', { name: a.member ?? '' })
          if (a.type === 'progress_stalled') return t('anomaly.progressStalledDesc', { name: a.task ?? a.project ?? '' })
          return a.task ?? a.project ?? a.title
        }

        const mergeByTask = (items: AnomalyItem[]): MergedTask[] => {
          const map: Record<string, MergedTask> = {}
          items.forEach((a) => {
            const key = a.task ?? a.title ?? a.id
            if (!map[key]) map[key] = { taskName: localizedName(a), types: [], members: [], maxOverdue: null, items: [] }
            const mt = map[key]
            mt.items.push(a)
            const tm = TYPE_STYLE[a.type]
            if (!mt.types.find((tt) => tt.type === a.type)) {
              mt.types.push({ type: a.type, label: t(tm.labelKey), color: tm.color })
            }
            if (a.member && a.member_work_no && !mt.members.find((m) => m.work_no === a.member_work_no)) {
              mt.members.push({ name: a.member, work_no: a.member_work_no })
            }
            if (a.value != null && (a.type === 'task_overdue' || a.type === 'project_delay')) {
              mt.maxOverdue = Math.max(mt.maxOverdue ?? 0, a.value)
            }
            if (a.value != null && a.type === 'task_urgent') {
              mt.maxOverdue = mt.maxOverdue ?? a.value  // keep smallest (most urgent)
            }
          })
          return Object.values(map).sort((a, b) => (b.maxOverdue ?? 0) - (a.maxOverdue ?? 0))
        }

        // ── Render a merged task row ──
        const TaskRow: React.FC<{ mt: MergedTask }> = ({ mt }) => {
          const hasCritical = mt.items.some((i) => i.level === 'critical')
          const hasOverdue = mt.types.some((t) => t.type === 'task_overdue' || t.type === 'project_delay')
          const hasUrgent = mt.types.some((t) => t.type === 'task_urgent')
          return (
            <div className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors ${hasCritical ? 'border-l-[3px] border-l-red-400' : ''}`}>
              <div className="flex-1 min-w-0">
                {/* Task name */}
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-slate-700">{mt.taskName}</span>
                  {/* All anomaly type tags */}
                  {mt.types.map((t) => (
                    <Tag key={t.type} style={{ fontSize: 9, padding: '0 5px', margin: 0, lineHeight: '18px', color: t.color, background: t.color + '15', border: `1px solid ${t.color}30`, fontWeight: 600 }}>
                      {t.label}
                    </Tag>
                  ))}
                </div>
                {/* Members */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-slate-400">{t('anomaly.assignee')}</span>
                  {mt.members.map((m) => (
                    <span key={m.work_no} className="flex items-center gap-1 text-[11px] text-slate-600">
                      <Avatar size={16} style={{ background: hasCritical ? '#dc2626' : '#2563eb', fontSize: 8, fontWeight: 700 }}>{m.name[0]}</Avatar>
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
              {/* Right: key metric */}
              <div className="flex-shrink-0 text-right mt-0.5">
                {hasOverdue && mt.maxOverdue != null && (
                  <span className="text-sm text-red-600 font-bold">{t('anomaly.overdueNDays', { days: mt.maxOverdue })}</span>
                )}
                {!hasOverdue && hasUrgent && mt.maxOverdue != null && (
                  <span className="text-sm text-orange-600 font-bold">{t('anomaly.daysLeft', { days: mt.maxOverdue })}</span>
                )}
                {mt.types.some((t) => t.type === 'progress_stalled') && !hasOverdue && (
                  <span className="text-xs text-violet-600 font-medium">{t('anomaly.noUpdateDays')}</span>
                )}
                {mt.types.some((t) => t.type === 'no_daily_log') && mt.types.length === 1 && (
                  <span className="text-xs text-amber-600 font-medium">{t('anomaly.noDailyLogShort')}</span>
                )}
              </div>
            </div>
          )
        }

        if (viewMode === 'project') {
          // ── 专案视角 ──
          const byProject: Record<string, { name: string; items: AnomalyItem[] }> = {}
          filtered.forEach((a) => {
            const key = a.project ?? t('anomaly.other')
            if (!byProject[key]) byProject[key] = { name: key, items: [] }
            byProject[key].items.push(a)
          })
          const groups = Object.values(byProject).sort((a, b) => b.items.length - a.items.length)
          return (
            <div className="space-y-4">
              {groups.map((g) => {
                const merged = mergeByTask(g.items)
                const critCount = g.items.filter((i) => i.level === 'critical').length
                return (
                  <div key={g.name} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
                      <ChartBarIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm font-semibold text-slate-700">{g.name}</span>
                      <span className="text-xs text-slate-400">{t('anomaly.taskCount', { count: merged.length })}</span>
                      {critCount > 0 && <Tag color="error" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('anomaly.highRiskCount', { count: critCount })}</Tag>}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {merged.map((mt) => <TaskRow key={mt.taskName} mt={mt} />)}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        } else {
          // ── 人员视角 ──
          const byMember: Record<string, { name: string; work_no: string; items: AnomalyItem[] }> = {}
          filtered.forEach((a) => {
            const key = a.member_work_no ?? 'system'
            if (!byMember[key]) byMember[key] = { name: a.member ?? t('anomaly.system'), work_no: key, items: [] }
            byMember[key].items.push(a)
          })
          const members = Object.values(byMember).sort((a, b) => {
            const ac = a.items.filter((i) => i.level === 'critical').length
            const bc = b.items.filter((i) => i.level === 'critical').length
            return bc - ac || b.items.length - a.items.length
          })
          return (
            <div className="space-y-4">
              {members.map((m) => {
                const critCount = m.items.filter((i) => i.level === 'critical').length
                // Group by project, then merge by task
                const projMap: Record<string, AnomalyItem[]> = {}
                m.items.forEach((a) => {
                  const pk = a.project ?? t('anomaly.other')
                  ;(projMap[pk] = projMap[pk] ?? []).push(a)
                })
                return (
                  <div key={m.work_no} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50/80 border-b border-slate-100">
                      <Avatar size={28} style={{ background: critCount > 0 ? '#dc2626' : '#d97706', fontSize: 11, fontWeight: 700 }}>
                        {m.name[0]}
                      </Avatar>
                      <span className="text-sm font-semibold text-slate-700">{m.name}</span>
                      <span className="text-xs text-slate-400">{m.work_no}</span>
                      {critCount > 0 && <Tag color="error" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{t('anomaly.highRiskCount', { count: critCount })}</Tag>}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {Object.entries(projMap).map(([projName, items]) => {
                        const merged = mergeByTask(items)
                        return (
                          <div key={projName}>
                            <div className="flex items-center gap-2 px-4 pt-2.5 pb-1">
                              <span className="text-[11px] text-blue-600 font-medium bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">{projName}</span>
                              <span className="text-[10px] text-slate-400">{t('anomaly.taskCount', { count: merged.length })}</span>
                            </div>
                            {merged.map((mt) => (
                              <div key={mt.taskName} className="flex items-center gap-2 px-4 py-2 pl-6 hover:bg-slate-50/50">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-slate-700">{mt.taskName}</span>
                                    {mt.types.map((t) => (
                                      <Tag key={t.type} style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px', color: t.color, background: t.color + '15', border: `1px solid ${t.color}30` }}>
                                        {t.label}
                                      </Tag>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  {mt.maxOverdue != null && mt.types.some((t) => t.type === 'task_overdue' || t.type === 'project_delay') && (
                                    <span className="text-xs text-red-600 font-bold">{t('anomaly.overdueNDays', { days: mt.maxOverdue })}</span>
                                  )}
                                  {mt.maxOverdue != null && !mt.types.some((t) => t.type === 'task_overdue') && mt.types.some((t) => t.type === 'task_urgent') && (
                                    <span className="text-xs text-orange-600 font-bold">{t('anomaly.daysLeft', { days: mt.maxOverdue })}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      })()}
    </div>
  )
}

export default AnomalyPage
