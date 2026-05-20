import React, { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Table, Progress, Tag, Tabs, Button, Avatar } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { projectApi, type ProjectReportStat, type MemberReportStat } from '@/api/project.api'
import { PROJECT_STATUS_MAP } from '@/utils/status'
import dayjs from 'dayjs'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'

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
  const summary = useMemo(() => ({
    projects: data.length,
    total:       data.reduce((s, r) => s + r.total, 0),
    not_started: data.reduce((s, r) => s + r.not_started, 0),
    in_progress: data.reduce((s, r) => s + r.in_progress, 0),
    completed:   data.reduce((s, r) => s + r.completed, 0),
  }), [data])

  const rate = summary.total > 0 ? Math.round(summary.completed / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.project_nm, PROJECT_STATUS_MAP[r.status]?.label ?? r.status,
      r.total, r.not_started, r.in_progress, r.completed, r.completion_rate])
    rows.push(['合計', '', summary.total, summary.not_started, summary.in_progress, summary.completed, rate])
    downloadXlsx('項目進度報表', ['項目', '項目狀態', '總任務', '未開始', '進行中', '已完成', '完成率(%)'],
      rows, '項目進度報表', [20, 12, 10, 10, 10, 10, 12])
  }

  const rawColumns: ColumnsType<ProjectReportStat> = [
    { title: '項目', dataIndex: 'project_nm', width: 160, ellipsis: true },
    { title: '項目狀態', dataIndex: 'status', width: 110,
      render: (s: number) => { const m = PROJECT_STATUS_MAP[s]; return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{s}</Tag> } },
    { title: '總任務', dataIndex: 'total', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '未開始', dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '已完成', dataIndex: 'completed', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '完成率', dataIndex: 'completion_rate', width: 200, align: 'center',
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
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label="項目" value={summary.projects} />
        <StatCard label="總任務" value={summary.total} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="已完成" value={summary.completed} color="#16a34a" />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={rate} label="完成率" color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="project_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── Project: Overdue Tab ─────────────────────────────────────────────────────

const ProjectOverdueTab: React.FC<{ data: ProjectReportStat[] }> = ({ data }) => {
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
    rows.push(['合計', '', summary.pending, summary.not_started, summary.in_progress,
      summary.overdue_incomplete, data.reduce((s, r) => s + r.overdue_complete, 0), overdueRate])
    downloadXlsx('項目延期報表', ['項目', '項目狀態', '待處理任務', '未開始', '進行中', '延期未完成', '延期已完成', '延期率(%)'],
      rows, '項目延期報表', [20, 12, 12, 10, 10, 12, 12, 12])
  }

  const rawColumns: ColumnsType<ProjectReportStat> = [
    { title: '項目', dataIndex: 'project_nm', width: 160, ellipsis: true },
    { title: '項目狀態', dataIndex: 'status', width: 110,
      render: (s: number) => { const m = PROJECT_STATUS_MAP[s]; return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{s}</Tag> } },
    { title: '待處理任務', dataIndex: 'pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '未開始', dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '延期未完成', dataIndex: 'overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: '延期已完成', dataIndex: 'overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '延期率', dataIndex: 'overdue_rate', width: 180, align: 'center',
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
        <StatCard label="項目" value={summary.projects} />
        <StatCard label="待處理任務" value={summary.pending} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="延期未完成" value={summary.overdue_incomplete} color={summary.overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label="延期率" color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="project_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── Member: Progress Tab ─────────────────────────────────────────────────────

const MemberProgressTab: React.FC<{ data: MemberReportStat[] }> = ({ data }) => {
  const summary = useMemo(() => ({
    members:     data.length,
    total:       data.reduce((s, r) => s + r.total, 0),
    not_started: data.reduce((s, r) => s + r.not_started, 0),
    in_progress: data.reduce((s, r) => s + r.in_progress, 0),
    completed:   data.reduce((s, r) => s + r.completed, 0),
  }), [data])

  const rate = summary.total > 0 ? Math.round(summary.completed / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.name, r.total, r.not_started, r.in_progress, r.completed, r.completion_rate])
    rows.push(['合計', summary.total, summary.not_started, summary.in_progress, summary.completed, rate])
    downloadXlsx('成員進度報表', ['成員', '總任務', '未開始', '進行中', '已完成', '完成率(%)'],
      rows, '成員進度報表', [16, 10, 10, 10, 10, 12])
  }

  const rawColumns: ColumnsType<MemberReportStat> = [
    { title: '成員', dataIndex: 'name', width: 160,
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 12, flexShrink: 0 }}>{name?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-700">{name}</span>
        </div>
      ) },
    { title: '總任務', dataIndex: 'total', width: 100, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '未開始', dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '已完成', dataIndex: 'completed', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '完成率', dataIndex: 'completion_rate', width: 200, align: 'center',
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
      <div className="bg-white border border-slate-100 rounded-xl mb-4 flex items-center">
        <StatCard label="成員" value={summary.members} />
        <StatCard label="總任務" value={summary.total} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="已完成" value={summary.completed} color="#16a34a" />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={rate} label="完成率" color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="work_no" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── Member: Overdue Tab ──────────────────────────────────────────────────────

const MemberOverdueTab: React.FC<{ data: MemberReportStat[] }> = ({ data }) => {
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
    rows.push(['合計', summary.pending, summary.not_started, summary.in_progress,
      summary.overdue_incomplete, data.reduce((s, r) => s + r.overdue_complete, 0), overdueRate])
    downloadXlsx('成員延期報表', ['成員', '待處理任務', '未開始', '進行中', '延期未完成', '延期已完成', '延期率(%)'],
      rows, '成員延期報表', [16, 12, 10, 10, 12, 12, 12])
  }

  const rawColumns: ColumnsType<MemberReportStat> = [
    { title: '成員', dataIndex: 'name', width: 160,
      render: (name: string) => (
        <div className="flex items-center gap-2">
          <Avatar size={28} style={{ background: '#2563eb', fontSize: 12, flexShrink: 0 }}>{name?.[0]?.toUpperCase()}</Avatar>
          <span className="text-sm text-slate-700">{name}</span>
        </div>
      ) },
    { title: '待處理任務', dataIndex: 'pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '未開始', dataIndex: 'not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '延期未完成', dataIndex: 'overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: '延期已完成', dataIndex: 'overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '延期率', dataIndex: 'overdue_rate', width: 180, align: 'center',
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
        <StatCard label="成員" value={summary.members} />
        <StatCard label="待處理任務" value={summary.pending} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="延期未完成" value={summary.overdue_incomplete} color={summary.overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label="延期率" color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="work_no" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProjectReportPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'member' ? 'member' : 'project'

  const [projectData, setProjectData] = useState<ProjectReportStat[]>([])
  const [memberData,  setMemberData]  = useState<MemberReportStat[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      projectApi.reportStats().then((r) => { if (Array.isArray(r.content)) setProjectData(r.content) }),
      projectApi.memberReportStats().then((r) => { if (Array.isArray(r.content)) setMemberData(r.content) }),
    ]).finally(() => setLoading(false))
  }, [])

  const topTabs = [
    {
      key: 'project',
      label: '項目',
      children: (
        <Tabs items={[
          { key: 'progress', label: '項目進度報表', children: loading ? null : <ProjectProgressTab data={projectData} /> },
          { key: 'overdue',  label: '項目延期報表', children: loading ? null : <ProjectOverdueTab  data={projectData} /> },
        ]} />
      ),
    },
    {
      key: 'member',
      label: '成員',
      children: (
        <Tabs items={[
          { key: 'progress', label: '成員進度報表', children: loading ? null : <MemberProgressTab data={memberData} /> },
          { key: 'overdue',  label: '成員延期報表', children: loading ? null : <MemberOverdueTab  data={memberData} /> },
        ]} />
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800">項目報表</h1>
        <p className="text-slate-400 text-sm mt-0.5">各項目 / 成員任務進度與延期狀況統計</p>
      </div>
      <Tabs type="card" defaultActiveKey={initialTab} items={topTabs} />
    </div>
  )
}

export default ProjectReportPage
