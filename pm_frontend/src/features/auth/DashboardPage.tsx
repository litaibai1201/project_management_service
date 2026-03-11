import React, { useEffect } from 'react'
import { Card, Row, Col, Progress, Tag, Avatar, Skeleton } from 'antd'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts'
import {
  FolderIcon, ClipboardDocumentListIcon, ClockIcon, CheckCircleIcon,
  ArrowTrendingUpIcon, FireIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchIndexThunk } from './authSlice'
import dayjs from 'dayjs'

// ─── Mock data ────────────────────────────────────────────────────────────────
const WEEKLY_DATA = [
  { day: '週一', project: 2, duty: 1 }, { day: '週二', project: 1, duty: 3 },
  { day: '週三', project: 4, duty: 2 }, { day: '週四', project: 2, duty: 4 },
  { day: '週五', project: 5, duty: 2 }, { day: '週六', project: 1, duty: 1 },
  { day: '週日', project: 0, duty: 0 },
]
const MY_PROJECTS = [
  { id: 'p1', name: 'ERP系統改版',  status: 5, progress: 75, daysLeft: 12, priority: 3 },
  { id: 'p2', name: '行動端APP',    status: 3, progress: 30, daysLeft:  3, priority: 4 },
  { id: 'p3', name: '報表系統優化', status: 5, progress: 90, daysLeft: 20, priority: 2 },
  { id: 'p4', name: '客服平台升級', status: 2, progress: 10, daysLeft: 45, priority: 1 },
]
const FEED_ITEMS = [
  { id: 1, user: '王小明', avatar: '王', action: '更新了', target: 'ERP系統改版', sub: '進度更新至 75%',      time: '5 分鐘前',  color: '#2563eb' },
  { id: 2, user: '李大華', avatar: '李', action: '完成了', target: 'API整合',     sub: '任務已完結',          time: '32 分鐘前', color: '#16a34a' },
  { id: 3, user: '張美玲', avatar: '張', action: '提交了', target: '行動端改版',  sub: '申請立案審核',        time: '1 小時前',  color: '#d97706' },
  { id: 4, user: '陳建國', avatar: '陳', action: '新增了', target: '資料庫優化',  sub: '新增功能任務',        time: '3 小時前',  color: '#7c3aed' },
  { id: 5, user: '林小芸', avatar: '林', action: '審核了', target: '前端重構',    sub: '審核通過',            time: '昨天',      color: '#16a34a' },
]
const STATUS_LABEL: Record<number, string> = { 1:'草稿',2:'立案審核',3:'規劃中',4:'規劃審核',5:'執行中',6:'完結審核',7:'已完結' }
const STATUS_COLOR: Record<number, string> = { 1:'default',2:'processing',3:'blue',4:'orange',5:'green',6:'orange',7:'success' }
const PRIORITY_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

const DaysLeftBadge: React.FC<{ days: number }> = ({ days }) => {
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)}天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">剩 {days} 天</span>
}

const StatCard: React.FC<{
  title: string; value: number; icon: React.ReactNode
  gradient: string; iconBg: string; trend?: string
}> = ({ title, value, icon, gradient, iconBg, trend }) => (
  <Card bordered={false} className={`${gradient} shadow-sm hover:shadow-md transition-all`} bodyStyle={{ padding: '20px 24px' }}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{title}</p>
        <p className="text-3xl font-bold text-slate-800 leading-none">{value}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            <ArrowTrendingUpIcon className="w-3 h-3 text-green-500" />
            <span className="text-xs text-green-600 font-medium">{trend}</span>
          </div>
        )}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg}`}>{icon}</div>
    </div>
  </Card>
)

const DashboardPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { indexData, name, isLoading } = useAppSelector((s) => s.auth)

  useEffect(() => { dispatch(fetchIndexThunk()) }, [dispatch])

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Greeting */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">歡迎回來，{name ?? '用戶'} 👋</h1>
          <p className="text-slate-400 text-sm mt-0.5">{dayjs().format('YYYY 年 M 月 D 日')} · 今天也加油！</p>
        </div>
        {(indexData?.pending_review ?? 0) > 0 && (
          <div className="hidden md:flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-2">
            <FireIcon className="w-4 h-4 text-orange-500" />
            <span className="text-sm text-orange-600 font-medium">有 {indexData?.pending_review} 個審核待處理</span>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <Row gutter={[16, 16]} className="mb-5">
        {[
          { title:'參與專案', value: indexData?.project_count ?? 0,  gradient:'stat-card-blue',   iconBg:'bg-blue-100',   icon:<FolderIcon className="w-5 h-5 text-blue-600" />,                  trend:'較上週 +2' },
          { title:'臨時任務', value: indexData?.duty_count ?? 0,     gradient:'stat-card-purple', iconBg:'bg-purple-100', icon:<ClipboardDocumentListIcon className="w-5 h-5 text-purple-600" />, trend:'較上週 +1' },
          { title:'待審核',   value: indexData?.pending_review ?? 0, gradient:'stat-card-orange', iconBg:'bg-orange-100', icon:<ClockIcon className="w-5 h-5 text-orange-500" />,            trend:'需盡快處理' },
          { title:'進行中',   value: indexData?.in_progress ?? 0,    gradient:'stat-card-green',  iconBg:'bg-green-100',  icon:<CheckCircleIcon className="w-5 h-5 text-green-600" />,            trend:'本週完成 3 項' },
        ].map((s) => (
          <Col xs={24} sm={12} xl={6} key={s.title}>
            {isLoading && !indexData
              ? <Card bordered={false} className="shadow-sm"><Skeleton active paragraph={{ rows: 2 }} /></Card>
              : <StatCard {...s} />}
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {/* Left */}
        <Col xs={24} lg={15}>
          {/* Activity bar chart */}
          <Card
            bordered={false} className="shadow-sm mb-4"
            title={<span className="font-semibold text-slate-700 text-sm">本週活動概覽</span>}
            extra={<span className="text-xs text-slate-400">{dayjs().startOf('week').format('MM/DD')} – {dayjs().endOf('week').format('MM/DD')}</span>}
            bodyStyle={{ paddingTop: 8 }}
          >
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={WEEKLY_DATA} barCategoryGap="35%">
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <RTooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="project" name="專案更新" fill="#bfdbfe" radius={[4,4,0,0]} />
                <Bar dataKey="duty"    name="任務更新" fill="#2563eb" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#bfdbfe]" /><span className="text-xs text-slate-400">專案更新</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-[#2563eb]" /><span className="text-xs text-slate-400">任務更新</span></div>
            </div>
          </Card>

          {/* My projects */}
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="font-semibold text-slate-700 text-sm">我的專案</span>}
            extra={<a href="/projects" className="text-xs text-blue-500 hover:underline">查看全部 →</a>}
            bodyStyle={{ padding: '0 24px 16px' }}
          >
            {MY_PROJECTS.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 -mx-4 px-4 rounded-lg cursor-pointer transition-colors"
              >
                <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: PRIORITY_COLORS[p.priority - 1] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-700 text-sm truncate">{p.name}</span>
                    <Tag color={STATUS_COLOR[p.status]} style={{ fontSize: 11, lineHeight: '18px', padding: '0 6px', margin: 0 }}>
                      {STATUS_LABEL[p.status]}
                    </Tag>
                  </div>
                  <Progress
                    percent={p.progress} size="small" showInfo={false}
                    strokeColor={p.progress >= 80 ? '#16a34a' : p.progress >= 40 ? '#2563eb' : '#94a3b8'}
                    trailColor="#f1f5f9"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400 hidden sm:block">{p.progress}%</span>
                  <DaysLeftBadge days={p.daysLeft} />
                </div>
              </div>
            ))}
          </Card>
        </Col>

        {/* Right: activity feed */}
        <Col xs={24} lg={9}>
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="font-semibold text-slate-700 text-sm">近期動態</span>}
            bodyStyle={{ padding: '0 16px 12px' }}
          >
            {FEED_ITEMS.map((item) => (
              <div key={item.id} className="feed-item flex items-start gap-3 py-3">
                <Avatar size={32} style={{ background: item.color, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                  {item.avatar}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 leading-snug">
                    <span className="font-semibold">{item.user}</span>
                    <span className="text-slate-400"> {item.action} </span>
                    <span className="text-blue-600 font-medium">{item.target}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{item.sub}</div>
                  <div className="text-xs text-slate-300 mt-0.5">{item.time}</div>
                </div>
              </div>
            ))}
            <div className="pt-2 text-center">
              <a href="#" className="text-xs text-blue-500 hover:underline">查看更多動態</a>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default DashboardPage
