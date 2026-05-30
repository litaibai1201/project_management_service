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
      r.total, r.draft, r.not_started, r.in_progress, r.completed, r.shelved, r.completion_rate])
    rows.push(['合計', '', summary.total, summary.draft, summary.not_started, summary.in_progress, summary.completed, summary.shelved, rate])
    downloadXlsx('項目進度報表', ['項目', '項目狀態', '總任務', '草稿中', '未開始', '進行中', '已完成', '搁置', '完成率(%)'],
      rows, '項目進度報表', [20, 12, 10, 10, 10, 10, 10, 8, 12])
  }

  const rawColumns: ColumnsType<ProjectReportStat> = [
    { title: '項目', dataIndex: 'project_nm', width: 160, ellipsis: true },
    { title: '項目狀態', dataIndex: 'status', width: 110,
      render: (s: number) => { const m = PROJECT_STATUS_MAP[s]; return m ? <Tag color={m.color}>{m.label}</Tag> : <Tag>{s}</Tag> } },
    { title: '總任務', dataIndex: 'total', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '草稿中', dataIndex: 'draft', width: 80, align: 'center',
      render: (v: number) => <span className="text-slate-400">{v}</span> },
    { title: '未開始', dataIndex: 'not_started', width: 80, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '已完成', dataIndex: 'completed', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '搁置', dataIndex: 'shelved', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-yellow-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '完成率', dataIndex: 'completion_rate', width: 280, align: 'center',
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
        <StatCard label="項目" value={summary.projects} />
        <StatCard label="總任務" value={summary.total} />
        <StatCard label="草稿中" value={summary.draft} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="已完成" value={summary.completed} color="#16a34a" />
        <StatCard label="搁置" value={summary.shelved} color={summary.shelved > 0 ? '#eab308' : undefined} />
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
    shelved:     data.reduce((s, r) => s + r.shelved, 0),
  }), [data])

  const rate = summary.total > 0 ? Math.round(summary.completed / summary.total * 1000) / 10 : 0

  const onExport = () => {
    const rows = data.map((r) => [r.name, r.total, r.not_started, r.in_progress, r.completed, r.shelved, r.completion_rate])
    rows.push(['合計', summary.total, summary.not_started, summary.in_progress, summary.completed, summary.shelved, rate])
    downloadXlsx('成員進度報表', ['成員', '總任務', '未開始', '進行中', '已完成', '搁置', '完成率(%)'],
      rows, '成員進度報表', [16, 10, 10, 10, 10, 8, 12])
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
    { title: '未開始', dataIndex: 'not_started', width: 80, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'in_progress', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '已完成', dataIndex: 'completed', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '搁置', dataIndex: 'shelved', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-yellow-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '完成率', dataIndex: 'completion_rate', width: 280, align: 'center',
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
        <StatCard label="成員" value={summary.members} />
        <StatCard label="總任務" value={summary.total} />
        <StatCard label="未開始" value={summary.not_started} />
        <StatCard label="進行中" value={summary.in_progress} color="#f59e0b" />
        <StatCard label="已完成" value={summary.completed} color="#16a34a" />
        <StatCard label="搁置" value={summary.shelved} color={summary.shelved > 0 ? '#eab308' : undefined} />
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

// ─── System: Progress Tab ─────────────────────────────────────────────────────

const SystemProgressTab: React.FC<{ data: SystemReportStat[] }> = ({ data }) => {
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
    rows.push(['合計',
      summary.task_total, '', summary.task_in_progress, summary.task_completed, '', taskRate])
    downloadXlsx('系統進度報表',
      ['系統', '總任務', '草稿', '進行中', '已完結', '搁置', '完成率(%)'],
      rows, '系統進度報表', [18, 10, 8, 10, 10, 8, 12])
  }

  const rawColumns: ColumnsType<SystemReportStat> = [
    { title: '系統', dataIndex: 'sys_nm', width: 160, ellipsis: true },
    { title: '總任務', dataIndex: 'task_total', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '草稿', dataIndex: 'task_draft', width: 80, align: 'center',
      render: (v: number) => <span className="text-slate-400">{v}</span> },
    { title: '進行中', dataIndex: 'task_in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '已完結', dataIndex: 'task_completed', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-green-600 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '搁置', dataIndex: 'task_shelved', width: 80, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-yellow-500' : 'text-slate-400'}>{v}</span> },
    { title: '完成率', dataIndex: 'task_completion_rate', width: 240, align: 'center',
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
        <StatCard label="系統" value={summary.systems} />
        <StatCard label="總需求" value={summary.req_total} />
        <StatCard label="已完結需求" value={summary.req_completed} color="#16a34a" />
        <StatCard label="總任務" value={summary.task_total} />
        <StatCard label="進行中" value={summary.task_in_progress} color="#f59e0b" />
        <StatCard label="已完結任務" value={summary.task_completed} color="#16a34a" />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={reqRate}  label="需求完成率" color="#2563eb" />
          <GaugeChart rate={taskRate} label="任務完成率" color="#16a34a" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="system_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── System: Overdue Tab ──────────────────────────────────────────────────────

const SystemOverdueTab: React.FC<{ data: SystemReportStat[] }> = ({ data }) => {
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
    rows.push(['合計',
      summary.task_pending, summary.task_not_started, summary.task_in_progress,
      summary.task_overdue_incomplete, summary.task_overdue_complete, overdueRate])
    downloadXlsx('系統延期報表',
      ['系統', '待處理任務', '未開始', '進行中', '延期未完成', '延期已完成', '任務延期率(%)'],
      rows, '系統延期報表', [18, 12, 10, 10, 12, 12, 14])
  }

  const rawColumns: ColumnsType<SystemReportStat> = [
    { title: '系統', dataIndex: 'sys_nm', width: 150, ellipsis: true },
    { title: '待處理任務', dataIndex: 'task_pending', width: 110, align: 'center',
      render: (v: number) => <span className="text-blue-500 font-medium">{v}</span> },
    { title: '未開始', dataIndex: 'task_not_started', width: 90, align: 'center',
      render: (v: number) => <span className="text-blue-400">{v}</span> },
    { title: '進行中', dataIndex: 'task_in_progress', width: 90, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-500 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '延期未完成', dataIndex: 'task_overdue_incomplete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-red-500 font-semibold' : 'text-slate-400'}>{v}</span> },
    { title: '延期已完成', dataIndex: 'task_overdue_complete', width: 110, align: 'center',
      render: (v: number) => <span className={v > 0 ? 'text-orange-400 font-medium' : 'text-slate-400'}>{v}</span> },
    { title: '任務延期率', dataIndex: 'task_overdue_rate', width: 230, align: 'center',
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
        <StatCard label="系統" value={summary.systems} />
        <StatCard label="待處理任務" value={summary.task_pending} />
        <StatCard label="未開始" value={summary.task_not_started} />
        <StatCard label="進行中" value={summary.task_in_progress} color="#f59e0b" />
        <StatCard label="延期未完成" value={summary.task_overdue_incomplete} color={summary.task_overdue_incomplete > 0 ? '#ef4444' : undefined} />
        <StatCard label="延期已完成" value={summary.task_overdue_complete} color={summary.task_overdue_complete > 0 ? '#f59e0b' : undefined} />
        <div className="flex-1 flex items-center justify-end gap-4 pr-6">
          <GaugeChart rate={overdueRate} label="延期率" color="#ef4444" />
          <Button icon={<ArrowDownTrayIcon className="w-4 h-4" />} onClick={onExport}>匯出 Excel</Button>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
        <Table rowKey="system_id" columns={columns} components={tableComponents} dataSource={data} pagination={false} size="middle" />
      </div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ProjectReportPage: React.FC = () => {
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
      label: '項目',
      children: (
        <Tabs items={[
          { key: 'progress', label: '項目進度報表', children: loading ? null : <ProjectProgressTab data={projectData} /> },
          { key: 'overdue',  label: '項目延期報表', children: loading ? null : <ProjectOverdueTab  data={projectData} /> },
        ]} />
      ),
    },
    {
      key: 'system',
      label: '系統',
      children: (
        <Tabs items={[
          { key: 'progress', label: '系統進度報表', children: loading ? null : <SystemProgressTab data={systemData} /> },
          { key: 'overdue',  label: '系統延期報表', children: loading ? null : <SystemOverdueTab  data={systemData} /> },
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
