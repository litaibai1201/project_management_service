import React, { useMemo, useState } from 'react'
import type { TemporaryDuty } from '@/types/api.types'
import { DUTY_STATUS_MAP } from '@/utils/status'

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: '低',   color: '#22c55e' },
  2: { label: '中',   color: '#f59e0b' },
  3: { label: '高',   color: '#ef4444' },
  4: { label: '緊急', color: '#7c3aed' },
}

const DutyWbsTable: React.FC<{
  duties: TemporaryDuty[]
  toName: (workNo: string) => string
  reqNameMap?: Record<string, string>
  defaultExpanded?: boolean
}> = ({ duties, toName, reqNameMap = {}, defaultExpanded = false }) => {
  const COLS = '24px 2fr 1fr 1fr 1fr 1fr 1fr'

  const isUuid = (s: string) => /^[0-9a-f]{32}$/i.test(s) || /^[0-9a-f-]{36}$/i.test(s)

  const structure = useMemo(() => {
    const byReq = new Map<string, TemporaryDuty[]>()
    duties.forEach((d) => {
      const key = d.standalone_req_id || '__none__'
      if (!byReq.has(key)) byReq.set(key, [])
      byReq.get(key)!.push(d)
    })
    return [...byReq.entries()].map(([reqKey, tasks]) => {
      const subGroupMap = new Map<string, TemporaryDuty[]>()
      tasks.forEach((t) => {
        const g = (t.group && !isUuid(t.group)) ? t.group : '__nogroup__'
        if (!subGroupMap.has(g)) subGroupMap.set(g, [])
        subGroupMap.get(g)!.push(t)
      })
      const subGroups = [...subGroupMap.entries()].map(([g, items]) => ({
        name: g === '__nogroup__' ? '未分組' : g,
        key: g,
        items,
      }))
      return { reqKey, reqNm: reqKey === '__none__' ? null : (reqNameMap[reqKey] || reqKey), subGroups, allTasks: tasks }
    })
  }, [duties, reqNameMap])

  const allHeaderKeys = useMemo(() => {
    const keys: string[] = []
    structure.forEach((r) => {
      if (r.reqNm) keys.push(`req:${r.reqKey}`)
      const showGroups = !(r.subGroups.length === 1 && r.subGroups[0].key === '__nogroup__')
      if (showGroups) r.subGroups.forEach((g) => keys.push(`grp:${r.reqKey}::${g.key}`))
    })
    return keys
  }, [structure])

  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    defaultExpanded ? new Set() : new Set(allHeaderKeys)
  )
  const allCollapsed = allHeaderKeys.length > 0 && allHeaderKeys.every((k) => collapsed.has(k))
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(allHeaderKeys))
  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next
  })

  const groupRange = (tasks: TemporaryDuty[]) => {
    const starts = tasks.map((t) => t.expected_start_date).filter(Boolean) as string[]
    const ends   = tasks.map((t) => t.expected_end_date).filter(Boolean) as string[]
    return { start: starts.length ? starts.sort()[0] : null, end: ends.length ? ends.sort().at(-1)! : null }
  }
  const groupResponsible = (tasks: TemporaryDuty[]) => {
    const seen = new Set<string>()
    tasks.forEach((t) => (t.responsible ?? []).forEach((r) => seen.add(r)))
    return [...seen]
  }

  const renderTaskRows = (tasks: TemporaryDuty[], indent = false) =>
    tasks.map((task, ti) => {
      const s = DUTY_STATUS_MAP[task.status] ?? { label: String(task.status), color: 'default', dot: '#94a3b8' }
      return (
        <div key={task.id}
          className={`grid border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors ${ti % 2 === 1 ? 'bg-slate-50/40' : ''}`}
          style={{ gridTemplateColumns: COLS }}>
          <div />
          <div className={`${indent ? 'pl-5' : 'px-2'} pr-2 py-2 text-slate-700 flex items-center gap-1.5`}>
            <span className="truncate">{task.duty_nm}</span>
          </div>
          <div className="px-2 py-2 text-slate-600 truncate">
            {(task.responsible ?? []).length > 0
              ? (task.responsible ?? []).map((r) => toName(r) || r).join('、')
              : <span className="text-slate-300">—</span>}
          </div>
          <div className="px-2 py-2">
            {PRIORITY_LABEL[task.priority]
              ? <span className="font-medium" style={{ color: PRIORITY_LABEL[task.priority].color }}>{PRIORITY_LABEL[task.priority].label}</span>
              : '—'}
          </div>
          <div className="px-2 py-2 text-slate-500 tabular-nums">{task.expected_start_date || '—'}</div>
          <div className="px-2 py-2 text-slate-500 tabular-nums">{task.expected_end_date || '—'}</div>
          <div className="px-2 py-2">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.dot }} />
              <span style={{ color: s.dot }}>{s.label}</span>
            </span>
          </div>
        </div>
      )
    })

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
      <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
        style={{ gridTemplateColumns: COLS }}>
        <div className="flex items-center justify-center py-2">
          {allHeaderKeys.length > 0 && (
            <button onClick={toggleAll}
              className="w-4 h-4 rounded border border-slate-300 hover:border-violet-400 hover:text-violet-600 text-slate-400 bg-white hover:bg-violet-50 transition-colors cursor-pointer flex items-center justify-center text-[10px] font-bold leading-none"
              title={allCollapsed ? '展開全部' : '折疊全部'}>
              {allCollapsed ? '+' : '−'}
            </button>
          )}
        </div>
        <div className="px-2 py-2">任務名稱</div>
        <div className="px-2 py-2">負責人</div>
        <div className="px-2 py-2">優先級</div>
        <div className="px-2 py-2">預計開始</div>
        <div className="px-2 py-2">預計完成</div>
        <div className="px-2 py-2">狀態</div>
      </div>

      {structure.map((reqGroup) => {
        const reqColKey = `req:${reqGroup.reqKey}`
        const reqOpen   = !collapsed.has(reqColKey)
        const singleUnnamedGroup = reqGroup.subGroups.length === 1 && reqGroup.subGroups[0].key === '__nogroup__'
        const showGroups = !singleUnnamedGroup

        return (
          <div key={reqGroup.reqKey}>
            {reqGroup.reqNm && (
              <div className="grid items-center border-b border-slate-200 bg-purple-50 hover:bg-purple-100 cursor-pointer select-none transition-colors"
                style={{ gridTemplateColumns: COLS }}
                onClick={() => toggle(reqColKey)}>
                <div className="flex items-center justify-center py-2">
                  <span className="w-4 h-4 rounded border border-purple-300 text-purple-500 bg-white flex items-center justify-center text-[10px] font-bold leading-none flex-shrink-0">
                    {reqOpen ? '−' : '+'}
                  </span>
                </div>
                <div className="px-2 py-2 font-semibold text-purple-700 flex items-center gap-1.5 col-span-6">
                  <span className="truncate">{reqGroup.reqNm}</span>
                  <span className="font-normal text-purple-400 text-[11px] flex-shrink-0">（{reqGroup.allTasks.length} 項）</span>
                </div>
              </div>
            )}

            {(!reqGroup.reqNm || reqOpen) && (
              showGroups ? (
                reqGroup.subGroups.map((sg, gi) => {
                  const grpColKey = `grp:${reqGroup.reqKey}::${sg.key}`
                  const grpOpen   = !collapsed.has(grpColKey)
                  const { start, end } = groupRange(sg.items)
                  const responsible    = groupResponsible(sg.items)
                  return (
                    <div key={sg.key}>
                      <div className="grid items-center border-b border-slate-200 bg-violet-50 hover:bg-violet-100 cursor-pointer select-none transition-colors"
                        style={{ gridTemplateColumns: COLS }}
                        onClick={() => toggle(grpColKey)}>
                        <div className="flex items-center justify-center py-2">
                          <span className="w-4 h-4 rounded border border-violet-300 text-violet-500 bg-white flex items-center justify-center text-[10px] font-bold leading-none flex-shrink-0">
                            {grpOpen ? '−' : '+'}
                          </span>
                        </div>
                        <div className={`${reqGroup.reqNm ? 'pl-4' : 'px-2'} pr-2 py-2 font-semibold text-violet-700 flex items-center gap-1.5`}>
                          <span className="w-4 h-4 rounded-sm bg-violet-200 text-violet-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{gi + 1}</span>
                          <span className="truncate">{sg.name}</span>
                          <span className="font-normal text-violet-400 text-[11px] flex-shrink-0">（{sg.items.length} 項）</span>
                        </div>
                        {!grpOpen ? (
                          <>
                            <div className="px-2 py-2 text-violet-500 truncate">
                              {responsible.length > 0 ? responsible.map((r) => toName(r) || r).join('、') : <span className="text-violet-300">—</span>}
                            </div>
                            <div className="px-2 py-2" />
                            <div className="px-2 py-2 text-violet-500 tabular-nums">{start ?? '—'}</div>
                            <div className="px-2 py-2 text-violet-500 tabular-nums">{end ?? '—'}</div>
                            <div className="px-2 py-2" />
                          </>
                        ) : <div className="col-span-5" />}
                      </div>
                      {grpOpen && renderTaskRows(sg.items, !!reqGroup.reqNm)}
                    </div>
                  )
                })
              ) : (
                renderTaskRows(reqGroup.allTasks, !!reqGroup.reqNm)
              )
            )}
          </div>
        )
      })}
    </div>
  )
}

export default DutyWbsTable
