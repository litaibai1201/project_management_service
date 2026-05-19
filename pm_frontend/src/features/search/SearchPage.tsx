/**
 * SearchPage — 全局搜索
 * - 卡片式搜索结果，可点击直接跳转
 * - 关键字高亮
 * - 快捷筛选 Tab（全部 / 专案 / 任务）
 * - 搜索建议（初始状态）
 */
import React, { useState, useCallback } from 'react'
import { Input, Tag, Progress, Empty, Spin, Tabs } from 'antd'
import {
  MagnifyingGlassIcon, FolderIcon, ClipboardDocumentListIcon,
  UserCircleIcon, CalendarDaysIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { searchApi } from '@/api/search.api'
import { SearchResult } from '@/types/api.types'
import { PROJECT_STATUS_MAP, DUTY_STATUS_MAP, FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'

const { Search } = Input

// ─── Keyword Highlight ────────────────────────────────────────────────────────
const Highlight: React.FC<{ text: string; keyword: string }> = ({ text, keyword }) => {
  if (!keyword.trim()) return <>{text}</>
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase()
          ? <mark key={i} style={{ background: '#fef08a', padding: 0, borderRadius: 2 }}>{part}</mark>
          : part,
      )}
    </>
  )
}

// ─── Days Left Badge ──────────────────────────────────────────────────────────
const DaysTag: React.FC<{ date?: string }> = ({ date }) => {
  if (!date) return null
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  if (days < 0)  return <span className="days-overdue">超期 {Math.abs(days)} 天</span>
  if (days <= 3) return <span className="days-overdue">剩 {days} 天</span>
  if (days <= 7) return <span className="days-warning">剩 {days} 天</span>
  return <span className="days-ok">剩 {days} 天</span>
}

// ─── Result Card ─────────────────────────────────────────────────────────────
const ResultCard: React.FC<{ item: SearchResult; keyword: string; onClick: () => void }> = ({ item, keyword, onClick }) => {
  const isProject  = item.type === 'project'
  const isFunction = item.type === 'function'
  const statusMap  = isProject ? PROJECT_STATUS_MAP : isFunction ? FUNCTION_STATUS_MAP : DUTY_STATUS_MAP
  const statusInfo = statusMap[item.status]
  const priority   = item.priority ? PRIORITY_MAP[item.priority] : null

  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200 cursor-pointer transition-all p-4 flex items-start gap-4"
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isProject ? 'bg-blue-50' : isFunction ? 'bg-green-50' : 'bg-purple-50'}`}>
        {isProject
          ? <FolderIcon className="w-5 h-5 text-blue-500" />
          : isFunction
            ? <ClipboardDocumentListIcon className="w-5 h-5 text-green-500" />
            : <ClipboardDocumentListIcon className="w-5 h-5 text-purple-500" />
        }
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          <Tag
            color={isProject ? 'blue' : isFunction ? 'green' : 'purple'}
            style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0 }}
          >
            {isProject ? '專案' : isFunction ? '功能任務' : '臨時任務'}
          </Tag>
          <span className="font-semibold text-slate-800 text-sm">
            <Highlight text={item.title} keyword={keyword} />
          </span>
          {priority && (
            <Tag color={priority.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 5px', margin: 0 }}>
              {priority.label}
            </Tag>
          )}
          {statusInfo && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: statusInfo.dot ?? '#94a3b8', flexShrink: 0,
              }} />
              {statusInfo.label}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-400">
          {item.department && (
            <span className="flex items-center gap-1">
              <FolderIcon className="w-3 h-3" />{item.department}
            </span>
          )}
          {item.responsible && (
            <span className="flex items-center gap-1">
              <UserCircleIcon className="w-3 h-3" />{item.responsible}
            </span>
          )}
          {item.expected_end_date && (
            <span className="flex items-center gap-1">
              <CalendarDaysIcon className="w-3 h-3" />
              截止 {item.expected_end_date}
              <DaysTag date={item.expected_end_date} />
            </span>
          )}
        </div>

        {/* Progress (project only) */}
        {isProject && item.progress != null && (
          <div className="flex items-center gap-2 mt-2">
            <Progress
              percent={item.progress} size="small" showInfo={false}
              strokeColor={item.progress >= 80 ? '#16a34a' : '#2563eb'}
              trailColor="#f1f5f9" style={{ flex: 1, maxWidth: 180 }}
            />
            <span className="text-xs text-slate-400">{item.progress}%</span>
          </div>
        )}
      </div>

      {/* Arrow */}
      <ArrowRightIcon className="w-4 h-4 text-slate-300 group-hover:text-blue-400 flex-shrink-0 mt-0.5 transition-colors" />
    </div>
  )
}

// ─── Search Suggestions (initial state) ───────────────────────────────────────
const SUGGESTIONS = [
  'ERP', 'APP', '報表', '優化', '審核', '測試', '部署',
]

// ─── Main ─────────────────────────────────────────────────────────────────────
const SearchPage: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''

  const [results,   setResults]   = useState<SearchResult[]>([])
  const [total,     setTotal]     = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [keyword,   setKeyword]   = useState(initialQ)
  const [activeTab, setActiveTab] = useState<'all' | 'project' | 'duty'>('all')
  const [hasSearched, setHasSearched] = useState(!!initialQ)

  const doSearch = useCallback(async (value: string) => {
    if (!value.trim()) return
    setKeyword(value)
    setHasSearched(true)
    setIsLoading(true)
    try {
      const res = await searchApi.search({ keyword: value, page: 1, size: 50 })
      const content = res.content as { project_list?: SearchResult[]; data_list?: SearchResult[]; total_count?: number }
      const all = (content.project_list ?? content.data_list ?? []) as SearchResult[]
      setResults(all)
      setTotal(content.total_count ?? all.length)
    } catch { /* global error */ }
    finally { setIsLoading(false) }
  }, [])

  // Run initial search if URL has ?q=
  React.useEffect(() => {
    if (initialQ) doSearch(initialQ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNavigate = (item: SearchResult) => {
    if (item.type === 'project') navigate(`/projects/${item.id}`)
    else if (item.type === 'function') navigate(`/projects/${item.project_id}?fid=${item.id}`)
    else navigate(`/duties?dutyId=${item.id}&tab=duty`)
  }

  const displayed = results.filter((r) =>
    activeTab === 'all' ||
    (activeTab === 'project' && r.type === 'project') ||
    (activeTab === 'duty' && (r.type === 'duty' || r.type === 'function'))
  )
  const projectCount = results.filter((r) => r.type === 'project').length
  const dutyCount    = results.filter((r) => r.type === 'duty' || r.type === 'function').length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">全局搜索</h1>
        <p className="text-slate-400 text-sm mt-1">搜索專案、任務、成員等</p>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <Search
          defaultValue={initialQ}
          placeholder="輸入關鍵字，按 Enter 搜索..."
          allowClear
          enterButton={
            <span className="flex items-center gap-1.5">
              <MagnifyingGlassIcon className="w-4 h-4" />
              搜索
            </span>
          }
          size="large"
          loading={isLoading}
          onSearch={doSearch}
          style={{ width: '100%' }}
        />

        {/* Quick suggestions */}
        {!hasSearched && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-slate-400">熱門搜索：</span>
            {SUGGESTIONS.map((s) => (
              <Tag
                key={s}
                className="cursor-pointer hover:text-blue-600 hover:border-blue-300 transition-colors"
                onClick={() => doSearch(s)}
                style={{ cursor: 'pointer' }}
              >
                {s}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spin size="large" />
        </div>
      ) : hasSearched && results.length === 0 ? (
        <Empty
          description={
            <div className="text-center">
              <p className="text-slate-500 font-medium">未找到「{keyword}」相關結果</p>
              <p className="text-slate-400 text-sm mt-1">請嘗試其他關鍵字，或縮短搜索詞</p>
            </div>
          }
          className="py-20"
        />
      ) : hasSearched && results.length > 0 ? (
        <>
          {/* Result count + tab filter */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-slate-500">
              共找到 <span className="font-semibold text-slate-800">{total}</span> 個結果
              {keyword && <span className="text-slate-400">（關鍵字：{keyword}）</span>}
            </span>
          </div>
          <Tabs
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as 'all' | 'project' | 'duty')}
            size="small"
            className="mb-4"
            items={[
              { key: 'all',     label: `全部 (${results.length})`   },
              { key: 'project', label: `專案 (${projectCount})`     },
              { key: 'duty',    label: `任務 (${dutyCount})`        },
            ]}
          />
          <div className="flex flex-col gap-3">
            {displayed.map((item) => (
              <ResultCard
                key={item.id}
                item={item}
                keyword={keyword}
                onClick={() => handleNavigate(item)}
              />
            ))}
          </div>
        </>
      ) : (
        /* Initial empty state */
        <div className="text-center py-20">
          <MagnifyingGlassIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">輸入關鍵字開始搜索</p>
        </div>
      )}
    </div>
  )
}

export default SearchPage
