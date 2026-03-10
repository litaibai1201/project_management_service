import React, { useState } from 'react'
import { Input, Table, Tag, Select, Empty } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { searchApi } from '@/api/search.api'
import { SearchResult } from '@/types/api.types'

const { Search } = Input

const SearchPage: React.FC = () => {
  const [results,   setResults]   = useState<SearchResult[]>([])
  const [total,     setTotal]     = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [keyword,   setKeyword]   = useState('')
  const [type,      setType]      = useState<'project' | 'duty' | undefined>()

  const handleSearch = async (value: string) => {
    if (!value.trim()) return
    setKeyword(value)
    setIsLoading(true)
    try {
      const res = await searchApi.search({ keyword: value, type, page: 1, size: 20 })
      const content = res.content as { project_list?: SearchResult[]; data_list?: SearchResult[]; total_count?: number }
      setResults((content.project_list ?? content.data_list ?? []) as SearchResult[])
      setTotal(content.total_count ?? 0)
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  const columns: ColumnsType<SearchResult> = [
    {
      title: '類型',
      dataIndex: 'type',
      width: 80,
      render: (v: string) => <Tag color={v === 'project' ? 'blue' : 'purple'}>{v === 'project' ? '專案' : '任務'}</Tag>,
    },
    { title: '標題', dataIndex: 'title', ellipsis: true },
    { title: '狀態', dataIndex: 'status', width: 80 },
    { title: '建立時間', dataIndex: 'created_at', width: 160 },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">全局搜索</h1>
        <p className="text-gray-500 text-sm mt-1">搜索專案、任務等</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-4">
        <div className="flex gap-3">
          <Select
            value={type}
            onChange={setType}
            allowClear
            placeholder="類型篩選"
            style={{ width: 120 }}
            options={[
              { value: 'project', label: '專案' },
              { value: 'duty',    label: '任務' },
            ]}
          />
          <Search
            placeholder="請輸入關鍵字搜索..."
            allowClear
            enterButton
            loading={isLoading}
            onSearch={handleSearch}
            style={{ flex: 1 }}
            prefix={<MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />}
          />
        </div>
      </div>

      {results.length > 0 ? (
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b text-gray-500 text-sm">
            找到 <span className="font-medium text-gray-800">{total}</span> 個結果
          </div>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={results}
            loading={isLoading}
            pagination={{ pageSize: 10 }}
          />
        </div>
      ) : keyword ? (
        <Empty description={`未找到「${keyword}」相關結果`} className="py-20" />
      ) : null}
    </div>
  )
}

export default SearchPage
