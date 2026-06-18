import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Table, Spin } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  UserOutlined,
  ProjectOutlined,
  TeamOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { sysAdminApi, AdminDashboard, OperationLog } from '@/api/sys_admin.api'
import { showToast } from '@/utils/toast'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'

const AdminDashboardPage: React.FC = () => {
  const [data, setData]       = useState<AdminDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sysAdminApi.getDashboard()
      .then((res) => setData(res.content))
      .catch(() => showToast.error('加载仪表盘失败'))
      .finally(() => setLoading(false))
  }, [])

  const rawLogColumns: TableColumnsType<OperationLog> = [
    { title: '工号',     dataIndex: 'work_no',   key: 'work_no',   width: 120 },
    { title: '操作',     dataIndex: 'operation', key: 'operation' },
    { title: '详情',     dataIndex: 'detail',    key: 'detail',    ellipsis: true },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => v ? v.slice(0, 19).replace('T', ' ') : '-',
    },
  ]
  const { mergeColumns: logColumns } = useResizableColumns(rawLogColumns)

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ marginBottom: 24, fontWeight: 600 }}>仪表盘</h2>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={data?.total_users ?? 0}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="专案数"
              value={data?.total_projects ?? 0}
              prefix={<ProjectOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="任务数"
              value={data?.total_duties ?? 0}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="管理员数"
              value={data?.total_admins ?? 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最近操作日志" style={{ marginTop: 24 }}>
        <Table<OperationLog>
          rowKey="id"
          dataSource={data?.recent_logs ?? []}
          columns={logColumns}
          components={tableComponents}
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="small"
        />
      </Card>
    </div>
  )
}

export default AdminDashboardPage
