import React, { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Input, Select, Space, Button, Tag, Modal, Form, Popconfirm,
} from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { sysAdminApi, AdminUser } from '@/api/sys_admin.api'
import { showToast } from '@/utils/toast'

const { Option } = Select

const AdminUsersPage: React.FC = () => {
  const [users, setUsers]       = useState<AdminUser[]>([])
  const [total, setTotal]       = useState(0)
  const [loading, setLoading]   = useState(false)
  const [page, setPage]         = useState(1)
  const [keyword, setKeyword]   = useState('')
  const [department, setDept]   = useState('')
  const [status, setStatus]     = useState<number | undefined>(undefined)

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<string | null>(null)
  const [pwForm] = Form.useForm<{ new_password: string }>()

  const fetchUsers = useCallback(() => {
    setLoading(true)
    sysAdminApi.listUsers({ page, size: 20, keyword, department, status })
      .then((res) => {
        setUsers(res.content?.data_list ?? [])
        setTotal(res.content?.total_count ?? 0)
      })
      .catch(() => showToast.error('加载用户列表失败'))
      .finally(() => setLoading(false))
  }, [page, keyword, department, status])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleToggleStatus = (work_no: string, currentStatus: number) => {
    const newStatus = currentStatus === 1 ? 0 : 1
    sysAdminApi.setUserStatus(work_no, newStatus)
      .then(() => {
        showToast.success(newStatus === 1 ? '用户已启用' : '用户已禁用')
        fetchUsers()
      })
      .catch(() => showToast.error('操作失败'))
  }

  const handleResetPassword = async () => {
    try {
      const values = await pwForm.validateFields()
      await sysAdminApi.resetPassword(resetTarget!, values.new_password)
      showToast.success('密码已重置')
      setResetTarget(null)
      pwForm.resetFields()
    } catch {
      showToast.error('重置密码失败')
    }
  }

  const columns = [
    { title: '工号',   dataIndex: 'work_no',    key: 'work_no',    width: 120 },
    { title: '姓名',   dataIndex: 'name',        key: 'name',        width: 120 },
    { title: '部门',   dataIndex: 'department',  key: 'department' },
    { title: '职位',   dataIndex: 'position',    key: 'position' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => v ? v.slice(0, 19).replace('T', ' ') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_: unknown, record: AdminUser) => (
        <Space>
          <Popconfirm
            title={`确定要${record.status === 1 ? '禁用' : '启用'}该用户？`}
            onConfirm={() => handleToggleStatus(record.work_no, record.status)}
          >
            <Button size="small" danger={record.status === 1}>
              {record.status === 1 ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
          <Button size="small" onClick={() => setResetTarget(record.work_no)}>
            重置密码
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <h2 style={{ marginBottom: 16, fontWeight: 600 }}>用户管理</h2>

      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input
            placeholder="搜索工号/姓名"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            allowClear
            style={{ width: 200 }}
          />
          <Input
            placeholder="部门筛选"
            value={department}
            onChange={(e) => { setDept(e.target.value); setPage(1) }}
            allowClear
            style={{ width: 160 }}
          />
          <Select
            placeholder="状态"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1) }}
            allowClear
            style={{ width: 100 }}
          >
            <Option value={1}>启用</Option>
            <Option value={0}>禁用</Option>
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>刷新</Button>
        </Space>

        <Table<AdminUser>
          rowKey="work_no"
          dataSource={users}
          columns={columns}
          loading={loading}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: setPage,
            showTotal: (t) => `共 ${t} 条`,
          }}
          size="middle"
        />
      </Card>

      {/* Reset Password Modal */}
      <Modal
        title={`重置密码 — ${resetTarget}`}
        open={!!resetTarget}
        onOk={handleResetPassword}
        onCancel={() => { setResetTarget(null); pwForm.resetFields() }}
        okText="确认重置"
        cancelText="取消"
      >
        <Form form={pwForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminUsersPage
