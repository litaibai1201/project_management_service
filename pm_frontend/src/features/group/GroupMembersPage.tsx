/**
 * GroupMembersPage — 成員管理
 * - 卡片式成員列表
 * - 抽屜詳情：本月工時統計 + 週趨勢 mini 圖 + 參與專案/任務列表
 */
import React, { useEffect, useState } from 'react'
import {
  Input, Card, Avatar, Drawer, Tabs, Tag, Progress,
  Empty, Row, Col, Skeleton,
} from 'antd'
import {
  MagnifyingGlassIcon, BriefcaseIcon, ClipboardDocumentListIcon,
  ClockIcon, CheckCircleIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts'
import { groupApi } from '@/api/group.api'
import { PROJECT_STATUS_MAP, DUTY_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'

const { Search } = Input

// ─── Types ────────────────────────────────────────────────────────────────────
interface MemberRow {
  work_no:    string
  name:       string
  department: string
  position?:  string
}

interface MemberOverview {
  total_hours:       number
  completed_tasks:   number
  in_progress_tasks: number
  overdue_tasks:     number
  weekly_hours:      { week: string; hours: number }[]
}

// ─── Mini Stat Card ───────────────────────────────────────────────────────────
const MiniStat: React.FC<{
  label: string; value: number; unit?: string
  icon: React.ReactNode; color: string; bg: string
}> = ({ label, value, unit = '', icon, color, bg }) => (
  <div className={`rounded-xl p-3 ${bg} flex items-center gap-3`}>
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0`}
      style={{ background: color + '22' }}>
      <span style={{ color }}>{icon}</span>
    </div>
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold text-slate-800 leading-tight">
        {value}<span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>
      </div>
    </div>
  </div>
)

// ─── Avatar colors per department ─────────────────────────────────────────────
const DEPT_COLORS: Record<string, string> = {
  '技術部': '#2563eb', '産品部': '#7c3aed',
  '運營部': '#d97706', '設計部': '#db2777',
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const GroupMembersPage: React.FC = () => {
  const [members,    setMembers]    = useState<MemberRow[]>([])
  const [filtered,   setFiltered]   = useState<MemberRow[]>([])
  const [isLoading,  setIsLoading]  = useState(false)
  const [keyword,    setKeyword]    = useState('')

  // Drawer state
  const [selected,        setSelected]        = useState<MemberRow | null>(null)
  const [overview,        setOverview]        = useState<MemberOverview | null>(null)
  const [projects,        setProjects]        = useState<Record<string, unknown>[]>([])
  const [duties,          setDuties]          = useState<Record<string, unknown>[]>([])
  const [drawerLoading,   setDrawerLoading]   = useState(false)

  // Load member list
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await groupApi.members({ page: 1, size: 100 })
        const c = res.content as { data_list?: MemberRow[]; project_list?: MemberRow[] }
        const list = (c.data_list ?? c.project_list ?? []) as MemberRow[]
        setMembers(list)
        setFiltered(list)
      } catch { /* global */ }
      finally { setIsLoading(false) }
    }
    load()
  }, [])

  // Filter by keyword
  useEffect(() => {
    const kw = keyword.toLowerCase()
    setFiltered(
      kw
        ? members.filter((m) => m.name.includes(kw) || m.work_no.toLowerCase().includes(kw) || (m.department ?? '').includes(kw))
        : members,
    )
  }, [keyword, members])

  const openDrawer = async (member: MemberRow) => {
    setSelected(member)
    setDrawerLoading(true)
    setOverview(null); setProjects([]); setDuties([])
    try {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
      const end   = today.toISOString().slice(0, 10)
      const [ovRes, prRes, duRes] = await Promise.all([
        groupApi.overview(member.work_no, { start_date: start, end_date: end }),
        groupApi.memberProjects(member.work_no, { page: 1, size: 10 }),
        groupApi.memberDuties(member.work_no, { page: 1, size: 10 }),
      ])
      setOverview(ovRes.content as MemberOverview)
      const pc = prRes.content as { data_list?: Record<string, unknown>[]; project_list?: Record<string, unknown>[] }
      setProjects((pc.data_list ?? pc.project_list ?? []) as Record<string, unknown>[])
      const dc = duRes.content as { data_list?: Record<string, unknown>[] }
      setDuties((dc.data_list ?? []) as Record<string, unknown>[])
    } catch { /* global */ }
    finally { setDrawerLoading(false) }
  }

  const closeDrawer = () => { setSelected(null); setOverview(null) }

  const avatarColor = (m: MemberRow) => DEPT_COLORS[m.department] ?? '#64748b'

  // Group members by department
  const deptMap = filtered.reduce<Record<string, MemberRow[]>>((acc, m) => {
    ;(acc[m.department] = acc[m.department] ?? []).push(m)
    return acc
  }, {})

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">成員管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">共 {members.length} 位成員</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 mb-5 flex gap-3">
        <Search
          placeholder="搜索姓名、工號、部門..."
          allowClear
          style={{ width: 280 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />}
          onSearch={(v) => setKeyword(v)}
          onChange={(e) => !e.target.value && setKeyword('')}
        />
        <span className="text-xs text-slate-400 self-center">
          {keyword ? `找到 ${filtered.length} 位` : `${members.length} 位成員`}
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} lg={8}><Card><Skeleton active avatar paragraph={{ rows: 2 }} /></Card></Col>
          ))}
        </Row>
      ) : filtered.length === 0 ? (
        <Empty description="未找到匹配成員" className="py-20" />
      ) : (
        Object.entries(deptMap).map(([dept, list]) => (
          <div key={dept} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full" style={{ background: DEPT_COLORS[dept] ?? '#94a3b8' }} />
              <span className="font-semibold text-slate-600 text-sm">{dept}</span>
              <span className="text-xs text-slate-400">（{list.length} 人）</span>
            </div>
            <Row gutter={[12, 12]}>
              {list.map((m) => (
                <Col key={m.work_no} xs={24} sm={12} lg={8}>
                  <Card
                    bordered={false}
                    className="shadow-sm hover:shadow-md cursor-pointer transition-all border border-slate-100 hover:border-blue-200"
                    bodyStyle={{ padding: '16px 20px' }}
                    onClick={() => openDrawer(m)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        size={44}
                        style={{ background: avatarColor(m), fontSize: 16, fontWeight: 700, flexShrink: 0 }}
                      >
                        {m.name[0]}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 text-sm">{m.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{m.position ?? m.department}</div>
                        <div className="text-xs text-slate-300 mt-0.5 font-mono">{m.work_no}</div>
                      </div>
                      <Tag
                        style={{ fontSize: 10, padding: '0 6px', flexShrink: 0 }}
                        color={DEPT_COLORS[m.department] ? 'blue' : 'default'}
                      >
                        {m.department}
                      </Tag>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        ))
      )}

      {/* ─── Member Detail Drawer ──────────────────────────────────────────── */}
      <Drawer
        title={
          selected ? (
            <div className="flex items-center gap-3">
              <Avatar size={36} style={{ background: avatarColor(selected), fontSize: 14, fontWeight: 700 }}>
                {selected.name[0]}
              </Avatar>
              <div>
                <div className="font-semibold text-slate-800 text-sm leading-tight">{selected.name}</div>
                <div className="text-xs text-slate-400">{selected.position ?? selected.department} · {selected.work_no}</div>
              </div>
            </div>
          ) : '成員概況'
        }
        open={!!selected}
        onClose={closeDrawer}
        width={600}
        bodyStyle={{ padding: '16px 20px' }}
      >
        {drawerLoading ? (
          <div className="flex flex-col gap-4">
            <Skeleton active paragraph={{ rows: 3 }} />
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : (
          <Tabs
            size="small"
            items={[
              {
                key: 'overview',
                label: '本月概況',
                children: overview ? (
                  <div className="flex flex-col gap-4">
                    {/* Stat cards */}
                    <Row gutter={[10, 10]}>
                      <Col span={12}>
                        <MiniStat label="累計工時" value={overview.total_hours} unit="h"
                          icon={<ClockIcon className="w-4 h-4" />} color="#2563eb" bg="bg-blue-50" />
                      </Col>
                      <Col span={12}>
                        <MiniStat label="已完成任務" value={overview.completed_tasks} unit="項"
                          icon={<CheckCircleIcon className="w-4 h-4" />} color="#16a34a" bg="bg-green-50" />
                      </Col>
                      <Col span={12}>
                        <MiniStat label="進行中" value={overview.in_progress_tasks} unit="項"
                          icon={<BriefcaseIcon className="w-4 h-4" />} color="#7c3aed" bg="bg-purple-50" />
                      </Col>
                      <Col span={12}>
                        <MiniStat label="超期任務" value={overview.overdue_tasks} unit="項"
                          icon={<ExclamationTriangleIcon className="w-4 h-4" />}
                          color={overview.overdue_tasks > 0 ? '#dc2626' : '#94a3b8'}
                          bg={overview.overdue_tasks > 0 ? 'bg-red-50' : 'bg-slate-50'} />
                      </Col>
                    </Row>

                    {/* Weekly hours chart */}
                    {overview.weekly_hours?.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-100 p-4">
                        <div className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wide">週工時趨勢</div>
                        <ResponsiveContainer width="100%" height={130}>
                          <BarChart data={overview.weekly_hours} barCategoryGap="40%">
                            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis hide />
                            <RTooltip
                              formatter={(v: number) => [`${v}h`, '工時']}
                              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}
                              cursor={{ fill: '#f8fafc' }}
                            />
                            <Bar dataKey="hours" name="工時" fill="#2563eb" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                ) : (
                  <Empty description="暫無數據" className="py-10" />
                ),
              },
              {
                key: 'projects',
                label: `參與專案 (${projects.length})`,
                children: projects.length === 0 ? (
                  <Empty description="暫無參與專案" className="py-10" />
                ) : (
                  <div className="flex flex-col gap-2 mt-1">
                    {projects.map((p) => {
                      const st = PROJECT_STATUS_MAP[p.status as number]
                      const pr = PRIORITY_MAP[p.priority as number]
                      return (
                        <div key={String(p.id)}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                          <div className="w-1 self-stretch rounded-full flex-shrink-0"
                            style={{ background: pr?.color === 'red' ? '#ef4444' : pr?.color === 'orange' ? '#f59e0b' : '#94a3b8' }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{String(p.project_nm ?? '')}</div>
                            <div className="flex items-center gap-2 mt-1">
                              {st && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background: st.dot }} />
                                  {st.label}
                                </span>
                              )}
                              <span className="text-xs text-slate-300">{String(p.department ?? '')}</span>
                            </div>
                          </div>
                          <div className="w-20 flex-shrink-0">
                            <Progress percent={Number(p.progress ?? 0)} size="small" showInfo={false}
                              strokeColor="#2563eb" trailColor="#f1f5f9" />
                            <div className="text-right text-xs text-slate-400 mt-0.5">{Number(p.progress ?? 0)}%</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ),
              },
              {
                key: 'duties',
                label: `AR (${duties.length})`,
                children: duties.length === 0 ? (
                  <Empty description="暫無AR" className="py-10" />
                ) : (
                  <div className="flex flex-col gap-2 mt-1">
                    {duties.map((d) => {
                      const st = DUTY_STATUS_MAP[d.status as number]
                      const pr = PRIORITY_MAP[d.priority as number]
                      const endDate = String(d.expected_end_date ?? '')
                      const daysLeft = endDate
                        ? Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
                        : null
                      return (
                        <div key={String(d.id)}
                          className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                          <ClipboardDocumentListIcon className="w-4 h-4 text-slate-300 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 truncate">{String(d.duty_nm ?? '')}</div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {pr && <Tag color={pr.color} style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>{pr.label}</Tag>}
                              {st && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%', background: st.dot }} />
                                  {st.label}
                                </span>
                              )}
                            </div>
                          </div>
                          {daysLeft !== null && (
                            <span className={`text-xs flex-shrink-0 ${
                              daysLeft < 0 ? 'days-overdue' : daysLeft <= 3 ? 'days-overdue' : daysLeft <= 7 ? 'days-warning' : 'days-ok'
                            }`}>
                              {daysLeft < 0 ? `超期 ${Math.abs(daysLeft)}天` : `剩 ${daysLeft}天`}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Drawer>
    </div>
  )
}

export default GroupMembersPage
