import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Table, Progress, Tag, Tabs, Button, Avatar } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { projectApi, type ProjectReportStat, type MemberReportStat } from '@/api/project.api'
import { systemApi, type SystemReportStat } from '@/api/system.api'
import { PROJECT_STATUS_MAP } from '@/utils/status'
import dayjs from 'dayjs'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { useTranslation } from 'react-i18next'

// ─── Summary stat card ────────────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: number | string; color?: string }> = ({ label, value, color }) => (
  <div className="flex flex-col items-center justify-center py-4 px-8 border-r border-slate-100 last:border-0">
    <div className="text-xs text-slate-400 mb-1">{label}</div>
    <div className="text-2xl font-bold" style={{ color: color ?? '#1e293b' }}>{value}</div>
  </div>
)

// ─── Semi-circle gauge ────────────────────────────────────────────────────────

const GaugeChart: React.FC<{ rate: number; label: string; color: string }> = ({ rate, label, color }) => {
  const data = [
    { value: rate,       fill: color },
    { value: 100 - rate, fill: '#f1f5f9' },
  ]
  return (
    <div className="relative flex items-center justify-center" style={{ width: 130, height: 80 }}>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie data={data} cx="50%" cy="80%" startAngle={180} endAngle={0}
            innerRadius={38} outerRadius={52} paddingAngle={0} dataKey="value" stroke="none">
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute bottom-1 flex flex-col items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-base font-bold" style={{ color }}>{rate}%</span>
      </div>
    </div>
  )
}

// ─── Excel export ─────────────────────────────────────────────────────────────

function downloadXlsx(sheetName: string, headers: string[], rows: (string | number)[][], filename: string, colWidths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = colWidths.map((wch) => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}_${dayjs().format('YYYYMMDD')}.xlsx`)
}

// ─── Project: Progress Tab ────────────────────────────────────────────────────

const ProjectProgressTab: React.FC<{ data: ProjectReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const [hoursMap, setHoursMap] = useState<Record<string, import('@/api/project.api').HoursSummary>>({})

  // 页面加载时批量获取所有专案工时
  useEffect(() => {
    if (data.length === 0) return
    for (const p of data) {
      projectApi.hoursSummary(p.project_id)
        .then((res) => { if (res.content) setHoursMap((prev) => ({ ...prev, [p.project_id]: res.content! })) })
        .catch(() => {})
    }
  }, [data])

  const summary = useMemo(() => ({
    projects:    data.length,
    total:       data.reduce((s, r) => s + r.total, 0),
    draft:       data.reduce((s, r) => s + r.draft, 0),
    not_started: data.reduce((s, r) => s + r.not_started, 0),
    in_progress: data.reduce((s, r) => s + r.in_progress, 0),
    completed:   data.reduce((s, r) => s + r.completed, 0),
    shelved:     data.reduce((s, r) => s + r.shelved, 0),
  }), [data])

  const rate = summary.total > 0 ? Math.round(summary.completed / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.project_nm, PROJECT_STATUS_MAP[r.status]?.label ?? r.status,
      r.total, r.draft, r.not_started, r.in_progress, r.completed, r.shelved, r.completion_rate,
      hoursMap[r.project_id]?.project_total_hours ?? ''])
    rows.push([t('projectReport.subtotal'), '', summary.total, summary.draft, summary.not_started, summary.in_progress, summary.completed, summary.shelved, rate, ''])
    downloadXlsx(t('projectReport.projectProgressReport'), [t('projectReport.project'), t('projectReport.projectStatus'), t('projectReport.totalTasks'), t('projectReport.draft'), t('projectReport.notStarted'), t('projectReport.inProgress'), t('projectReport.completed'), t('projectReport.shelved'), t('projectReport.completionRatePct'), t('projectDetail.totalHours')],
      rows, t('projectReport.projectProgressReport'), [20, 12, 10, 10, 10, 10, 10, 8, 12, 10])
  }

  // 展开时加载工时
  const onExpand = async (expanded: boolean, record: ProjectReportStat) => {
    if (!expanded || !record || hoursMap[record.project_id]) return
    try {
      const res = await projectApi.hoursSummary(record.project_id)
      if (res.content) setHoursMap((prev) => ({ ...prev, [record.project_id]: res.content! }))
    } catch { /* ignore */ }
  }

  // 构建树形数据：专案 → 需求 → 任务
  type TreeRow = {
    _key: string; _type: 'project' | 'req' | 'func'
    name: string; status?: number; total: number; draft: number; not_started: number; in_progress: number; completed: number; shelved: number
    total_hours: number; completion_rate: number; children?: TreeRow[]
  }
  const FUNC_STATUS_MAP_LOCAL: Record<number, string> = { 0: t('projectReport.draft'), 1: t('projectReport.notStarted'), 2: t('projectReport.inProgress'), 3: t('projectReport.inProgress'), 4: t('projectReport.completed'), 8: t('projectReport.shelved') }
  const FUNC_STATUS_COLOR: Record<number, string> = { 0: 'default', 1: 'blue', 2: 'green', 3: 'green', 4: 'blue', 8: 'orange' }

  const treeData: TreeRow[] = useMemo(() => data.map((p) => {
    const hs = hoursMap[p.project_id]
    const reqChildren: TreeRow[] | undefined = hs ? hs.requirements.map((req) => {
      const funcChildren: TreeRow[] = hs.functions
        .filter((f) => (f.req_id || '') === (req.req_id || ''))
        .map((f) => ({
          _key: `func-${f.func_id}`, _type: 'func' as const,
          name: f.func_nm, status: f.status,
          total: 0, draft: 0, not_started: 0, in_progress: 0, completed: 0, shelved: 0,
          total_hours: f.total_hours, completion_rate: f.progress,
        }))
      return {
        _key: `req-${p.project_id}-${req.req_id || 'none'}`, _type: 'req' as const,
        name: req.req_nm || t('projectReport.noRequirement'), status: req.req_status,
        total: req.total, draft: req.draft, not_started: req.not_started,
        in_progress: req.in_progress, completed: req.completed, shelved: req.shelved,
        total_hours: req.total_hours, completion_rate: req.completion_rate,
        children: funcChildren.length > 0 ? funcChildren : undefined,
      }
    }) : undefined
    return {
      _key: `proj-${p.project_id}`, _type: 'project' as const,
      name: p.project_nm, status: p.status,
      total: p.total, draft: p.draft, not_started: p.not_started,
      in_progress: p.in_progress, completed: p.completed, shelved: p.shelved,
      total_hours: hs?.project_total_hours ?? 0, completion_rate: p.completion_rate,
      children: reqChildren,
    }
  }), [data, hoursMap, t])

  const rawColumns: ColumnsType<TreeRow> = [
    { title: t('projectReport.project'), dataIndex: 'name', width: 240, ellipsis: true,
      render: (v: string, r) => {
        if (r._type === 'project') return <span className="font-semibold text-slate-800">{v}</span>
        if (r._type === 'req') return <span className="font-medium text-purple-600 text-xs">{v}</span>
        return <span className="text-slate-600 text-xs">{v}</span>
      },
    },
    { title: t('common.status'), dataIndex: 'status', width: 110, align: 'center',
      render: (s: number | undefined, r) => {
        if (s == null) return null
        if (r._type === 'project') { const m = PROJECT_STATUS_MAP[s]; return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{s}</Tag> }
        if (r._type === 'req') {
          const REQ_ST: Record<number, [string, string]> = { 0: [t('projectDetail.reqStatus.draft'), 'default'], 1: [t('projectDetail.reqStatus.reviewing'), 'processing'], 2: [t('projectDetail.reqStatus.inProgress'), 'success'], 3: [t('projectDetail.reqStatus.rejected'), 'error'], 4: [t('projectDetail.reqStatus.completed'), 'blue'], 8: [t('projectDetail.reqStatus.shelved'), 'warning'] }
          const [label, color] = REQ_ST[s] ?? [String(s), 'default']
          return <Tag color={color} style={{ fontSize: 10 }}>{label}</Tag>
        }
        if (r._type === 'func') { return <Tag color={FUNC_STATUS_COLOR[s] ?? 'default'} style={{ fontSize: 10 }}>{FUNC_STATUS_MAP_LOCAL[s] ?? s}</Tag> }
        return null
      },
    },
    { title: t('projectReport.totalTasks'), dataIndex: 'total', width: 80, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={r._type === 'project' ? 'text-blue-500 font-medium' : 'text-blue-500 text-xs'}>{v}</span> },
    { title: t('projectReport.draft'), dataIndex: 'draft', width: 70, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={r._type === 'project' ? 'text-slate-400' : 'text-slate-400 text-xs'}>{v}</span> },
    { title: t('projectReport.notStarted'), dataIndex: 'not_started', width: 70, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={r._type === 'project' ? 'text-blue-400' : 'text-blue-400 text-xs'}>{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'in_progress', width: 70, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={v > 0 ? (r._type === 'project' ? 'text-green-600 font-medium' : 'text-green-600 text-xs font-medium') : (r._type === 'project' ? 'text-slate-400' : 'text-slate-400 text-xs')}>{v}</span> },
    { title: t('projectReport.completed'), dataIndex: 'completed', width: 70, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={v > 0 ? (r._type === 'project' ? 'text-blue-600 font-medium' : 'text-blue-600 text-xs font-medium') : (r._type === 'project' ? 'text-slate-400' : 'text-slate-400 text-xs')}>{v}</span> },
    { title: t('projectReport.shelved'), dataIndex: 'shelved', width: 70, align: 'center',
      render: (v: number, r) => r._type === 'func' ? null : <span className={v > 0 ? (r._type === 'project' ? 'text-yellow-500 font-medium' : 'text-yellow-500 text-xs') : (r._type === 'project' ? 'text-slate-400' : 'text-slate-400 text-xs')}>{v}</span> },
    { title: t('projectDetail.colTotalHours'), dataIndex: 'total_hours', width: 100, align: 'center',
      render: (v: number, r) => v > 0
        ? <span className={r._type === 'project' ? 'font-semibold text-blue-600 tabular-nums' : 'text-xs font-semibold text-blue-600 tabular-nums'}>{v}h</span>
        : <span className="text-slate-300">—</span>,
    },
    { title: t('projectReport.completionRate'), dataIndex: 'completion_rate', width: 200, align: 'center',
      render: (r: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={r} size="small" showInfo={false} strokeColor="#16a34a" trailColor="#e2e8f0" style={{ width: 100, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-10 text-center">{r}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center flex-wrap">
        <StatCard label={t('projectReport.project')} value={summary.projects} />
        <StatCard label={t('projectReport.totalTasks')} value={summary.total} />
        <StatCard label={t('projectReport.draft')} value={summary.draft} />
        <StatCard label={t('projectReport.notStarted')} value={summary.not_started} />
        <StatCard label={t('projectReport.inProgress')} value={summary.in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.completed')} value={summary.completed} color="#2563eb" />
        <StatCard label={t('projectReport.shelved')} value={summary.shelved} color={summary.shelved > 0 ? '#eab308' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={rate} label={t('projectReport.completionRate')} color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table<TreeRow>
          rowKey="_key"
          columns={columns}
          components={tableComponents}
          dataSource={treeData}
          pagination={false}
          size="middle"
          scroll={{ x: 'max-content' }}
          indentSize={20}
          expandable={{
            onExpand: (expanded, record) => {
              if (record._type === 'project') onExpand(expanded, data.find((p) => p.project_id === record._key.replace('proj-', ''))!)
            },
          }}
        />
      </div>
    </>
  )
}

// ─── Project: Overdue Tab ─────────────────────────────────────────────────────

const ProjectOverdueTab: React.FC<{ data: ProjectReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const summary = useMemo(() => ({
    projects:           data.length,
    pending:            data.reduce((s, r) => s + r.pending, 0),
    not_started:        data.reduce((s, r) => s + r.not_started, 0),
    in_progress:        data.reduce((s, r) => s + r.in_progress, 0),
    overdue_incomplete: data.reduce((s, r) => s + r.overdue_incomplete, 0),
    total:              data.reduce((s, r) => s + r.total, 0),
  }), [data])

  const overdueRate = summary.total > 0 ? Math.round(summary.overdue_incomplete / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.project_nm, PROJECT_STATUS_MAP[r.status]?.label ?? r.status,
      r.pending, r.not_started, r.in_progress, r.overdue_incomplete, r.overdue_complete, r.overdue_rate])
    rows.push([t('projectReport.subtotal'), '', summary.pending, summary.not_started, summary.in_progress,
      summary.overdue_incomplete, data.reduce((s, r) => s + r.overdue_complete, 0), overdueRate])
    downloadXlsx(t('projectReport.projectOverdueReport'), [t('projectReport.project'), t('projectReport.projectStatus'), t('projectReport.pendingTasks'), t('projectReport.notStarted'), t('projectReport.inProgress'), t('projectReport.overdueIncomplete'), t('projectReport.overdueComplete'), t('projectReport.overdueRatePct')],
      rows, t('projectReport.projectOverdueReport'), [20, 12, 12, 10, 10, 12, 12, 12])
  }

  const rawColumns: ColumnsType<ProjectReportStat> = [
    { title: t('projectReport.project'), dataIndex: 'project_nm', width: 160, ellipsis: true },
    { title: t('projectReport.projectStatus'), dataIndex: 'status', width: 110,
      render: (s: number) => { const m = PROJECT_STATUS_MAP[s]; return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{s}</Tag> } },
    { title: t('projectReport.pendingTasks'), dataIndex: 'pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: t('projectReport.notStarted'), dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueIncomplete'), dataIndex: 'overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueComplete'), dataIndex: 'overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueRate'), dataIndex: 'overdue_rate', width: 180, align: 'center',
      render: (r: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={r} size="small" showInfo={false} strokeColor="#ef4444" trailColor="#e2e8f0" style={{ width: 80, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-10 text-center">{r}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label={t('projectReport.project')} value={summary.projects} />
        <StatCard label={t('projectReport.pendingTasks')} value={summary.pending} />
        <StatCard label={t('projectReport.notStarted')} value={summary.not_started} />
        <StatCard label={t('projectReport.inProgress')} value={summary.in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.overdueIncomplete')} value={summary.overdue_incomplete} color={summary.overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label={t('projectReport.overdueRate')} color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="project_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </div>
    </>
  )
}

// ─── Member: Progress Tab ─────────────────────────────────────────────────────

const MemberProgressTab: React.FC<{ data: MemberReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const summary = useMemo(() => ({
    members:     data.length,
    total:       data.reduce((s, r) => s + r.total, 0),
    draft:       data.reduce((s, r) => s + (r.draft || 0), 0),
    not_started: data.reduce((s, r) => s + r.not_started, 0),
    in_progress: data.reduce((s, r) => s + r.in_progress, 0),
    completed:   data.reduce((s, r) => s + r.completed, 0),
    shelved:     data.reduce((s, r) => s + r.shelved, 0),
  }), [data])

  const rate = summary.total > 0 ? Math.round(summary.completed / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.name, r.total, r.draft || 0, r.not_started, r.in_progress, r.completed, r.shelved, r.completion_rate])
    rows.push([t('projectReport.subtotal'), summary.total, summary.draft, summary.not_started, summary.in_progress, summary.completed, summary.shelved, rate])
    downloadXlsx(t('projectReport.memberProgressReport'), [t('projectReport.member'), t('projectReport.totalTasks'), t('projectReport.draft'), t('projectReport.notStarted'), t('projectReport.inProgress'), t('projectReport.completed'), t('projectReport.shelved'), t('projectReport.completionRatePct')],
      rows, t('projectReport.memberProgressReport'), [16, 10, 8, 10, 10, 10, 8, 12])
  }

  const rawColumns: ColumnsType<MemberReportStat> = [
    { title: t('projectReport.member'), dataIndex: 'name', width: 160,
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 12, flexShrink: 0 }}>{name?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-700">{name}</span>
        </div>
      ) },
    { title: t('projectReport.totalTasks'), dataIndex: 'total', width: 100, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: t('projectReport.draft'), dataIndex: 'draft', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-slate-500' : 'text-slate-400'}>{v || 0}</span> },
    { title: t('projectReport.notStarted'), dataIndex: 'not_started', width: 80, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'in_progress', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.completed'), dataIndex: 'completed', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.shelved'), dataIndex: 'shelved', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-yellow-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.completionRate'), dataIndex: 'completion_rate', width: 280, align: 'center',
      render: (r: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={r} size="small" showInfo={false} strokeColor="#16a34a" trailColor="#e2e8f0" style={{ width: 180, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-10 text-center">{r}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label={t('projectReport.member')} value={summary.members} />
        <StatCard label={t('projectReport.totalTasks')} value={summary.total} />
        <StatCard label={t('projectReport.draft')} value={summary.draft} />
        <StatCard label={t('projectReport.notStarted')} value={summary.not_started} />
        <StatCard label={t('projectReport.inProgress')} value={summary.in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.completed')} value={summary.completed} color="#2563eb" />
        <StatCard label={t('projectReport.shelved')} value={summary.shelved} color={summary.shelved > 0 ? '#eab308' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={rate} label={t('projectReport.completionRate')} color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="work_no" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </div>
    </>
  )
}

// ─── Member: Overdue Tab ──────────────────────────────────────────────────────

const MemberOverdueTab: React.FC<{ data: MemberReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const summary = useMemo(() => ({
    members:            data.length,
    pending:            data.reduce((s, r) => s + r.pending, 0),
    not_started:        data.reduce((s, r) => s + r.not_started, 0),
    in_progress:        data.reduce((s, r) => s + r.in_progress, 0),
    overdue_incomplete: data.reduce((s, r) => s + r.overdue_incomplete, 0),
    total:              data.reduce((s, r) => s + r.total, 0),
  }), [data])

  const overdueRate = summary.total > 0 ? Math.round(summary.overdue_incomplete / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.name, r.pending, r.not_started, r.in_progress,
      r.overdue_incomplete, r.overdue_complete, r.overdue_rate])
    rows.push([t('projectReport.subtotal'), summary.pending, summary.not_started, summary.in_progress,
      summary.overdue_incomplete, data.reduce((s, r) => s + r.overdue_complete, 0), overdueRate])
    downloadXlsx(t('projectReport.memberOverdueReport'), [t('projectReport.member'), t('projectReport.pendingTasks'), t('projectReport.notStarted'), t('projectReport.inProgress'), t('projectReport.overdueIncomplete'), t('projectReport.overdueComplete'), t('projectReport.overdueRatePct')],
      rows, t('projectReport.memberOverdueReport'), [16, 12, 10, 10, 12, 12, 12])
  }

  const rawColumns: ColumnsType<MemberReportStat> = [
    { title: t('projectReport.member'), dataIndex: 'name', width: 160,
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 12, flexShrink: 0 }}>{name?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-700">{name}</span>
        </div>
      ) },
    { title: t('projectReport.pendingTasks'), dataIndex: 'pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: t('projectReport.notStarted'), dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueIncomplete'), dataIndex: 'overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueComplete'), dataIndex: 'overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueRate'), dataIndex: 'overdue_rate', width: 180, align: 'center',
      render: (r: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={r} size="small" showInfo={false} strokeColor="#ef4444" trailColor="#e2e8f0" style={{ width: 80, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-10 text-center">{r}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label={t('projectReport.member')} value={summary.members} />
        <StatCard label={t('projectReport.pendingTasks')} value={summary.pending} />
        <StatCard label={t('projectReport.notStarted')} value={summary.not_started} />
        <StatCard label={t('projectReport.inProgress')} value={summary.in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.overdueIncomplete')} value={summary.overdue_incomplete} color={summary.overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label={t('projectReport.overdueRate')} color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="work_no" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </div>
    </>
  )
}

// ─── System: Progress Tab ─────────────────────────────────────────────────────

const SystemProgressTab: React.FC<{ data: SystemReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const summary = useMemo(() => ({
    systems:          data.length,
    req_total:        data.reduce((s, r) => s + r.req_total, 0),
    req_completed:    data.reduce((s, r) => s + r.req_completed, 0),
    task_total:       data.reduce((s, r) => s + r.task_total, 0),
    task_in_progress: data.reduce((s, r) => s + r.task_in_progress, 0),
    task_completed:   data.reduce((s, r) => s + r.task_completed, 0),
  }), [data])

  const reqRate  = summary.req_total  > 0 ? Math.round(summary.req_completed  / summary.req_total  * 1000) / 10 : 0
  const taskRate = summary.task_total > 0 ? Math.round(summary.task_completed / summary.task_total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.sys_nm,
      r.task_total, r.task_draft, r.task_in_progress, r.task_completed, r.task_shelved, r.task_completion_rate])
    rows.push([t('projectReport.subtotal'),
      summary.task_total, '', summary.task_in_progress, summary.task_completed, '', taskRate])
    downloadXlsx(t('projectReport.systemProgressReport'),
      [t('projectReport.system'), t('projectReport.totalTasks'), t('projectReport.draftShort'), t('projectReport.inProgress'), t('projectReport.completedAlt'), t('projectReport.shelved'), t('projectReport.completionRatePct')],
      rows, t('projectReport.systemProgressReport'), [18, 10, 8, 10, 10, 8, 12])
  }

  const rawColumns: ColumnsType<SystemReportStat> = [
    { title: t('projectReport.system'), dataIndex: 'sys_nm', width: 160, ellipsis: true },
    { title: t('projectReport.totalTasks'), dataIndex: 'task_total', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: t('projectReport.draftShort'), dataIndex: 'task_draft', width: 80, align: 'center',
      render: (v: number) => <span className="text-slate-400">{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'task_in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.completedAlt'), dataIndex: 'task_completed', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-blue-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.shelved'), dataIndex: 'task_shelved', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-yellow-500' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.completionRate'), dataIndex: 'task_completion_rate', width: 240, align: 'center',
      render: (v: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={v} size="small" showInfo={false} strokeColor="#16a34a" trailColor="#e2e8f0" style={{ width: 140, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-8 text-center">{v}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label={t('projectReport.system')} value={summary.systems} />
        <StatCard label={t('projectReport.totalRequirements')} value={summary.req_total} />
        <StatCard label={t('projectReport.completedRequirements')} value={summary.req_completed} color="#2563eb" />
        <StatCard label={t('projectReport.totalTasks')} value={summary.task_total} />
        <StatCard label={t('projectReport.inProgress')} value={summary.task_in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.completedTasks')} value={summary.task_completed} color="#2563eb" />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={reqRate}  label={t('projectReport.reqCompletionRate')} color="#2563eb" />
          <GaugeChart rate={taskRate} label={t('projectReport.taskCompletionRate')} color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="system_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </div>
    </>
  )
}

// ─── System: Overdue Tab ──────────────────────────────────────────────────────

const SystemOverdueTab: React.FC<{ data: SystemReportStat[] }> = ({ data }) => {
  const { t } = useTranslation()
  const summary = useMemo(() => ({
    systems:                 data.length,
    task_pending:            data.reduce((s, r) => s + r.task_pending, 0),
    task_not_started:        data.reduce((s, r) => s + r.task_not_started, 0),
    task_in_progress:        data.reduce((s, r) => s + r.task_in_progress, 0),
    task_overdue_incomplete: data.reduce((s, r) => s + r.task_overdue_incomplete, 0),
    task_overdue_complete:   data.reduce((s, r) => s + r.task_overdue_complete, 0),
  }), [data])

  const overdueRate = summary.task_pending > 0
    ? Math.round(summary.task_overdue_incomplete / summary.task_pending * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.sys_nm,
      r.task_pending, r.task_not_started, r.task_in_progress,
      r.task_overdue_incomplete, r.task_overdue_complete, r.task_overdue_rate])
    rows.push([t('projectReport.subtotal'),
      summary.task_pending, summary.task_not_started, summary.task_in_progress,
      summary.task_overdue_incomplete, summary.task_overdue_complete, overdueRate])
    downloadXlsx(t('projectReport.systemOverdueReport'),
      [t('projectReport.system'), t('projectReport.pendingTasks'), t('projectReport.notStarted'), t('projectReport.inProgress'), t('projectReport.overdueIncomplete'), t('projectReport.overdueComplete'), t('projectReport.taskOverdueRatePct')],
      rows, t('projectReport.systemOverdueReport'), [18, 12, 10, 10, 12, 12, 14])
  }

  const rawColumns: ColumnsType<SystemReportStat> = [
    { title: t('projectReport.system'), dataIndex: 'sys_nm', width: 150, ellipsis: true },
    { title: t('projectReport.pendingTasks'), dataIndex: 'task_pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: t('projectReport.notStarted'), dataIndex: 'task_not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: t('projectReport.inProgress'), dataIndex: 'task_in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueIncomplete'), dataIndex: 'task_overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.overdueComplete'), dataIndex: 'task_overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: t('projectReport.taskOverdueRate'), dataIndex: 'task_overdue_rate', width: 230, align: 'center',
      render: (v: number) => (
        <div className="flex items-center gap-2 justify-center">
          <Progress percent={v} size="small" showInfo={false} strokeColor="#ef4444" trailColor="#e2e8f0" style={{ width: 150, marginBottom: 0 }} />
          <span className="text-xs text-slate-500 w-8 text-center">{v}%</span>
        </div>
      ) },
  ]
  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  return (
    <>
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label={t('projectReport.system')} value={summary.systems} />
        <StatCard label={t('projectReport.pendingTasks')} value={summary.task_pending} />
        <StatCard label={t('projectReport.notStarted')} value={summary.task_not_started} />
        <StatCard label={t('projectReport.inProgress')} value={summary.task_in_progress} color="#16a34a" />
        <StatCard label={t('projectReport.overdueIncomplete')} value={summary.task_overdue_incomplete} color={summary.task_overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <StatCard label={t('projectReport.overdueComplete')} value={summary.task_overdue_complete} color={summary.task_overdue_complete > 0 ? '#f59e0b' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label={t('projectReport.overdueRate')} color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>{t('projectReport.exportExcel')}</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="system_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" scroll={{ x: 'max-content' }} />
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProjectReportPage: React.FC = () => {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = ['member', 'system'].includes(searchParams.get('tab') ?? '') ? searchParams.get('tab')! : 'project'

  const [projectData, setProjectData] = useState<ProjectReportStat[]>([])
  const [memberData,  setMemberData]  = useState<MemberReportStat[]>([])
  const [systemData,  setSystemData]  = useState<SystemReportStat[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      projectApi.reportStats().then((r) => { if (Array.isArray(r.content)) setProjectData(r.content) }),
      projectApi.memberReportStats().then((r) => { if (Array.isArray(r.content)) setMemberData(r.content) }),
      systemApi.reportStats().then((r) => { if (Array.isArray(r.content)) setSystemData(r.content) }),
    ]).finally(() => setLoading(false))
  }, [])

  const topTabs = [
    {
      key: 'project',
      label: t('projectReport.tabProject'),
      children: (
        <Tabs items={[
          { key: 'progress', label: t('projectReport.projectProgressReport'), children: loading ? null : <ProjectProgressTab data={projectData} /> },
          { key: 'overdue',  label: t('projectReport.projectOverdueReport'), children: loading ? null : <ProjectOverdueTab  data={projectData} /> },
        ]} />
      ),
    },
    {
      key: 'system',
      label: t('projectReport.tabSystem'),
      children: (
        <Tabs items={[
          { key: 'progress', label: t('projectReport.systemProgressReport'), children: loading ? null : <SystemProgressTab data={systemData} /> },
          { key: 'overdue',  label: t('projectReport.systemOverdueReport'), children: loading ? null : <SystemOverdueTab  data={systemData} /> },
        ]} />
      ),
    },
    {
      key: 'member',
      label: t('projectReport.tabMember'),
      children: (
        <Tabs items={[
          { key: 'progress', label: t('projectReport.memberProgressReport'), children: loading ? null : <MemberProgressTab data={memberData} /> },
          { key: 'overdue',  label: t('projectReport.memberOverdueReport'), children: loading ? null : <MemberOverdueTab  data={memberData} /> },
        ]} />
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800">{t('projectReport.pageTitle')}</h1>
        <p className="text-slate-400 text-sm mt-0.5">{t('projectReport.pageSubtitle')}</p>
      </div>
      <Tabs type="card" defaultActiveKey={initialTab} items={topTabs} />
    </div>
  )
}

export default ProjectReportPage
