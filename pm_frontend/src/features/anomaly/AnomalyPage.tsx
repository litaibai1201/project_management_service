/**
 * AnomalyPage — 異常管理看板
 * 管理目的：著重於管理異常，正常則可以減少時間管理
 * 自動識別並彙整所有「異常」項目，主管只需關注異常
 */
import React, { useState, useMemo, useEffect } from 'react'
import {
  Card, Tag, Avatar, Badge, Tooltip, Empty,
} from 'antd'
import {
  ExclamationTriangleIcon, ClockIcon, DocumentTextIcon,
  ChartBarIcon, PauseCircleIcon, ShieldExclamationIcon,
  CheckCircleIcon, ArrowTrendingDownIcon, BellAlertIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import dayjs from 'dayjs'

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

const TYPE_META: Record<AnomalyType, { label: string; icon: React.ReactNode; color: string }> = {
  task_overdue:      { label: '任務超期',     icon: <ClockIcon className="w-4 h-4" />,                 color: '#dc2626' },
  task_urgent:       { label: '任務即將超期', icon: <ExclamationTriangleIcon className="w-4 h-4" />,    color: '#d97706' },
  no_daily_log:      { label: '日報未填',     icon: <DocumentTextIcon className="w-4 h-4" />,          color: '#f59e0b' },
  insufficient_hours:{ label: '工時不足',     icon: <ArrowTrendingDownIcon className="w-4 h-4" />,     color: '#f97316' },
  progress_stalled:  { label: '進度停滯',     icon: <PauseCircleIcon className="w-4 h-4" />,           color: '#8b5cf6' },
  project_delay:     { label: '專案Delay',    icon: <ChartBarIcon className="w-4 h-4" />,              color: '#dc2626' },
  delay_no_report:   { label: 'Delay未提報告',icon: <ShieldExclamationIcon className="w-4 h-4" />,     color: '#be123c' },
}

const LEVEL_META: Record<AnomalyLevel, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: '高風險', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  warning:  { label: '需關注', color: '#d97706', bg: '#fff7ed', border: '#fed7aa' },
  info:     { label: '提示',   color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
}

// ─── Anomaly data is loaded from the API ────────────────────────────────────

// ─── Stats Summary ──────────────────────────────────────────────────────────
const SummaryCard: React.FC<{
  title: string; count: number; color: string; bg: string; icon: React.ReactNode; active?: boolean; onClick?: () => void
}> = ({ title, count, color, bg, icon, active, onClick }) => (
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
        {count}<span className="text-xs font-normal text-slate-400 ml-0.5">項</span>
      </div>
    </div>
  </div>
)

// ─── Anomaly Card ───────────────────────────────────────────────────────────
const AnomalyCard: React.FC<{ item: AnomalyItem }> = ({ item }) => {
  const typeMeta = TYPE_META[item.type]
  const levelMeta = LEVEL_META[item.level]

  return (
    <div
      className="rounded-xl border px-4 py-3 mb-2.5 transition-all hover:shadow-sm"
      style={{ background: levelMeta.bg, borderColor: levelMeta.border }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: typeMeta.color + '18', color: typeMeta.color }}>
          {typeMeta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Tag style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px', color: typeMeta.color, background: typeMeta.color + '15', border: `1px solid ${typeMeta.color}30` }}>
              {typeMeta.label}
            </Tag>
            <span className="text-sm font-semibold text-slate-700">{item.title}</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-1.5">{item.description}</p>
          <div className="flex items-center gap-3 flex-wrap">
            {item.member && (
              <div className="flex items-center gap-1">
                <Avatar size={16} style={{ background: '#2563eb', fontSize: 8, fontWeight: 700 }}>
                  {item.member[0]}
                </Avatar>
                <span className="text-[10px] text-slate-500">{item.member}</span>
              </div>
            )}
            {item.project && (
              <span className="text-[10px] text-blue-500 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                {item.project}
              </span>
            )}
            <span className="text-[10px] text-slate-300 ml-auto">{item.detected_at}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ───────────────────────────────────────────────────────────────────

type FilterLevel = 'all' | 'critical' | 'warning'

const AnomalyPage: React.FC = () => {
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('all')
  const [filterType, setFilterType] = useState<AnomalyType | 'all'>('all')
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([])

  useEffect(() => {
    // TODO: call real API when endpoint is available, e.g.:
    // projectApi.anomalies().then((res) => { if (res.content) setAnomalies(res.content) }).catch(() => {})
    setAnomalies([])
  }, [])

  const criticalCount = anomalies.filter((a) => a.level === 'critical').length
  const warningCount = anomalies.filter((a) => a.level === 'warning').length
  const normalCount = 0 // TODO: load from API

  // By type counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    anomalies.forEach((a) => { counts[a.type] = (counts[a.type] ?? 0) + 1 })
    return counts
  }, [anomalies])

  // Filter
  const filtered = useMemo(() => {
    let list = anomalies
    if (filterLevel !== 'all') list = list.filter((a) => a.level === filterLevel)
    if (filterType !== 'all') list = list.filter((a) => a.type === filterType)
    return list
  }, [anomalies, filterLevel, filterType])

  const critical = filtered.filter((a) => a.level === 'critical')
  const warning = filtered.filter((a) => a.level === 'warning')

  // By member summary
  const memberSummary = useMemo(() => {
    const map: Record<string, { name: string; work_no: string; critical: number; warning: number; items: AnomalyItem[] }> = {}
    anomalies.forEach((a) => {
      const key = a.member_work_no ?? 'system'
      if (!map[key]) map[key] = { name: a.member ?? '系統', work_no: key, critical: 0, warning: 0, items: [] }
      if (a.level === 'critical') map[key].critical++
      else map[key].warning++
      map[key].items.push(a)
    })
    return Object.values(map).sort((a, b) => (b.critical * 10 + b.warning) - (a.critical * 10 + a.warning))
  }, [anomalies])

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">異常管理看板</h1>
          <p className="text-slate-400 text-sm mt-0.5">著重管理異常 · 正常項目自動隱藏 · {dayjs().format('YYYY-MM-DD HH:mm')} 更新</p>
        </div>
        <Tag color="success" style={{ fontSize: 12 }}>
          <CheckCircleIcon className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
          {normalCount} 項正常已隱藏
        </Tag>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <SummaryCard
          title="全部異常" count={anomalies.length}
          color="#334155" bg="#f1f5f9"
          icon={<BellAlertIcon className="w-4 h-4 text-slate-500" />}
          active={filterLevel === 'all'} onClick={() => setFilterLevel('all')}
        />
        <SummaryCard
          title="高風險" count={criticalCount}
          color="#dc2626" bg="#fef2f2"
          icon={<ShieldExclamationIcon className="w-4 h-4 text-red-500" />}
          active={filterLevel === 'critical'} onClick={() => setFilterLevel('critical')}
        />
        <SummaryCard
          title="需關注" count={warningCount}
          color="#d97706" bg="#fff7ed"
          icon={<ExclamationTriangleIcon className="w-4 h-4 text-orange-500" />}
          active={filterLevel === 'warning'} onClick={() => setFilterLevel('warning')}
        />
        <SummaryCard
          title="正常" count={normalCount}
          color="#16a34a" bg="#f0fdf4"
          icon={<CheckCircleIcon className="w-4 h-4 text-green-500" />}
        />
      </div>

      {/* Type filter chips */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <FunnelIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 font-medium flex-shrink-0">異常類型</span>
        <Tag
          className="cursor-pointer"
          color={filterType === 'all' ? 'blue' : undefined}
          onClick={() => setFilterType('all')}
          style={{ fontSize: 11 }}
        >
          全部
        </Tag>
        {(Object.keys(TYPE_META) as AnomalyType[]).map((t) => {
          const count = typeCounts[t] ?? 0
          if (count === 0) return null
          return (
            <Tag
              key={t}
              className="cursor-pointer"
              color={filterType === t ? TYPE_META[t].color : undefined}
              onClick={() => setFilterType(filterType === t ? 'all' : t)}
              style={{ fontSize: 11 }}
            >
              {TYPE_META[t].label} ({count})
            </Tag>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: anomaly list */}
        <div className="lg:col-span-2">
          {/* Critical */}
          {critical.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-4 rounded bg-red-500" />
                <span className="text-sm font-bold text-red-600">高風險</span>
                <Badge count={critical.length} color="#dc2626" />
              </div>
              {critical.map((item) => <AnomalyCard key={item.id} item={item} />)}
            </div>
          )}

          {/* Warning */}
          {warning.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1.5 h-4 rounded bg-orange-500" />
                <span className="text-sm font-bold text-orange-600">需關注</span>
                <Badge count={warning.length} color="#d97706" />
              </div>
              {warning.map((item) => <AnomalyCard key={item.id} item={item} />)}
            </div>
          )}

          {filtered.length === 0 && (
            <Card bordered={false} className="shadow-sm">
              <Empty description="當前篩選條件下沒有異常項目" className="py-10" />
            </Card>
          )}
        </div>

        {/* Right: member summary */}
        <div>
          <Card
            bordered={false}
            className="shadow-sm sticky top-20"
            title={<span className="text-sm font-semibold text-slate-700">成員異常彙整</span>}
            bodyStyle={{ padding: '12px 16px' }}
          >
            {memberSummary.length === 0 ? (
              <Empty description="暫無異常" className="py-6" />
            ) : (
              <div className="space-y-2.5">
                {memberSummary.map((m) => (
                  <div key={m.work_no} className="flex items-center gap-2.5 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <Avatar size={28} style={{ background: m.critical > 0 ? '#dc2626' : '#d97706', fontSize: 11, fontWeight: 700 }}>
                      {m.name[0]}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 truncate">{m.name}</div>
                      <div className="text-[10px] text-slate-400">{m.work_no}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {m.critical > 0 && (
                        <Tag color="error" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                          {m.critical} 高危
                        </Tag>
                      )}
                      {m.warning > 0 && (
                        <Tag color="warning" style={{ fontSize: 9, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                          {m.warning} 關注
                        </Tag>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Quick stats */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[10px] text-slate-400 font-medium mb-2">本週異常趨勢</div>
              <div className="flex items-end gap-1 h-12">
                {[2, 3, 5, 7, 9, 6, 4].map((v, i) => (
                  <Tooltip key={i} title={`${['一','二','三','四','五','六','日'][i]}: ${v} 項`}>
                    <div className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(4, (v / 9) * 36)}px`,
                          background: i === 6 ? '#2563eb' : v > 6 ? '#fca5a5' : '#93c5fd',
                        }}
                      />
                      <span className="text-[8px] text-slate-300">{['一','二','三','四','五','六','日'][i]}</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AnomalyPage
