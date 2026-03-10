import React, { useEffect, useState } from 'react'
import { Table, Input, Card, Typography, Row, Col, Statistic, Button, Drawer, Descriptions, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { MagnifyingGlassIcon, EyeIcon } from '@heroicons/react/24/outline'
import { groupApi } from '@/api/group.api'

const { Search } = Input
const { Text } = Typography

interface MemberRow {
  work_no:    string
  name:       string
  department: string
  position?:  string
}

const GroupMembersPage: React.FC = () => {
  const [members,    setMembers]    = useState<MemberRow[]>([])
  const [total,      setTotal]      = useState(0)
  const [page,       setPage]       = useState(1)
  const [keyword,    setKeyword]    = useState('')
  const [isLoading,  setIsLoading]  = useState(false)
  const [selected,   setSelected]   = useState<MemberRow | null>(null)
  const [overview,   setOverview]   = useState<Record<string, unknown> | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(false)

  const loadMembers = async (p = 1, kw = '') => {
    setIsLoading(true)
    try {
      const res = await groupApi.members({ page: p, size: 20, keyword: kw || undefined })
      const content = res.content as { data_list?: MemberRow[]; project_list?: MemberRow[]; total_count?: number }
      setMembers((content.data_list ?? content.project_list ?? []) as MemberRow[])
      setTotal(content.total_count ?? 0)
    } catch { /* global */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadMembers(page, keyword) }, [page, keyword])

  const openMember = async (member: MemberRow) => {
    setSelected(member)
    setOverviewLoading(true)
    try {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
      const end   = today.toISOString().slice(0, 10)
      const res = await groupApi.overview(member.work_no, { start_date: start, end_date: end })
      setOverview(res.content as Record<string, unknown>)
    } catch { /* global */ }
    finally { setOverviewLoading(false) }
  }

  const columns: ColumnsType<MemberRow> = [
    { title: '工號', dataIndex: 'work_no', width: 100 },
    { title: '姓名', dataIndex: 'name', width: 100 },
    { title: '部門', dataIndex: 'department', width: 140 },
    { title: '職稱', dataIndex: 'position', render: (v?: string) => v ?? '—' },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record) => (
        <Button
          size="small"
          type="text"
          icon={<EyeIcon className="w-4 h-4" />}
          onClick={() => openMember(record)}
        />
      ),
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">成員管理</h1>
        <p className="text-gray-500 text-sm mt-1">查看團隊成員工作概況</p>
      </div>

      <div className="flex gap-3 mb-4 bg-white p-4 rounded-lg shadow-sm">
        <Search
          placeholder="搜索成員工號或姓名"
          allowClear
          style={{ width: 260 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />}
          onSearch={(v) => { setKeyword(v); setPage(1) }}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm">
        <Table
          rowKey="work_no"
          columns={columns}
          dataSource={members}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            showTotal: (t) => `共 ${t} 條`,
            onChange: (p) => setPage(p),
          }}
        />
      </div>

      {/* Member Detail Drawer */}
      <Drawer
        title={selected ? `${selected.name}（${selected.work_no}）的概況` : '成員概況'}
        open={!!selected}
        onClose={() => { setSelected(null); setOverview(null) }}
        width={560}
      >
        {selected && (
          <>
            <Descriptions size="small" column={2} className="mb-4">
              <Descriptions.Item label="工號">{selected.work_no}</Descriptions.Item>
              <Descriptions.Item label="姓名">{selected.name}</Descriptions.Item>
              <Descriptions.Item label="部門">{selected.department}</Descriptions.Item>
              <Descriptions.Item label="職稱">{selected.position ?? '—'}</Descriptions.Item>
            </Descriptions>

            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '本月概況',
                  children: overviewLoading ? (
                    <Text type="secondary">載入中...</Text>
                  ) : overview ? (
                    <Row gutter={16}>
                      {Object.entries(overview).map(([k, v]) => (
                        <Col span={12} key={k} className="mb-3">
                          <Card size="small">
                            <Statistic title={k} value={Number(v ?? 0)} />
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  ) : (
                    <Text type="secondary">暫無數據</Text>
                  ),
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  )
}

export default GroupMembersPage
