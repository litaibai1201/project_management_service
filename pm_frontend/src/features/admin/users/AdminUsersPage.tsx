import React, { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Input, Select, Space, Button, Tag, Modal, Form, Popconfirm, Transfer,
} from 'antd'
import { SearchOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { sysAdminApi, AdminUser, Role, UserRoleDetail } from '@/api/sys_admin.api'
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

  // Role assignment modal
  const [roles, setRoles]                 = useState<Role[]>([])
  const [roleTarget, setRoleTarget]       = useState<AdminUser | null>(null)
  const [roleDetail, setRoleDetail]       = useState<UserRoleDetail | null>(null)
  const [roleLoading, setRoleLoading]     = useState(false)
  const [selectedRole, setSelectedRole]   = useState<string | null>(null)
  const [targetKeys, setTargetKeys]       = useState<string[]>([])   // subordinate work_nos

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

  // load roles once
  useEffect(() => {
    sysAdminApi.listRoles()
      .then((res) => setRoles(res.content ?? []))
      .catch(() => {})
  }, [])

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

  const openRoleModal = (record: AdminUser) => {
    setRoleTarget(record)
    setRoleDetail(null)
    setSelectedRole(null)
    setTargetKeys([])
    setRoleLoading(true)
    sysAdminApi.getUserRoleDetail(record.work_no)
      .then((res) => {
        const d = res.content!
        setRoleDetail(d)
        setSelectedRole(d.role_code)
        setTargetKeys(d.subordinates)
      })
      .catch(() => showToast.error('加载用户角色信息失败'))
      .finally(() => setRoleLoading(false))
  }

  const handleSaveRole = async () => {
    if (!roleTarget) return
    try {
      await sysAdminApi.setUserRole(roleTarget.work_no, selectedRole)
      await sysAdminApi.setUserSubordinates(roleTarget.work_no, targetKeys)
      showToast.success('角色设置已保存')
      setRoleTarget(null)
      fetchUsers()
    } catch {
      showToast.error('保存失败')
    }
  }

  // transfer data source: all users except self
  const transferSource = users
    .filter((u) => u.work_no !== roleTarget?.work_no)
    .map((u) => ({ key: u.work_no, title: `${u.name} (${u.work_no})`, description: u.department }))

  const columns = [
    { title: '工号',   dataIndex: 'work_no',    key: 'work_no',    width: 110 },
    { title: '姓名',   dataIndex: 'name',        key: 'name',        width: 110 },
    { title: '部门',   dataIndex: 'department',  key: 'department' },
    { title: '职位',   dataIndex: 'position',    key: 'position' },
    {
      title: '角色',
      key: 'role',
      width: 120,
      render: (_: unknown, r: AdminUser) => {
        if (r.role_name) return <Tag color="blue">{r.role_name}</Tag>
        return <span style={{ color: '#999' }}>—</span>
      },
    },
    {
      title: '主管',
      key: 'is_supervisor',
      width: 70,
      render: (_: unknown, r: AdminUser) =>
        r.is_supervisor ? <Tag color="green">主管</Tag> : null,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      key: 'action',
      width: 230,
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
          <Button size="small" icon={<SettingOutlined />} onClick={() => openRoleModal(record)}>
            角色
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

      {/* Role Assignment Modal */}
      <Modal
        title={`角色设置 — ${roleTarget?.name} (${roleTarget?.work_no})`}
        open={!!roleTarget}
        onOk={handleSaveRole}
        onCancel={() => setRoleTarget(null)}
        okText="保存"
        cancelText="取消"
        width={700}
        confirmLoading={roleLoading}
      >
        <Space direction="vertical" style={{ width: '100%', paddingTop: 12 }}>
          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>角色</div>
            <Select
              style={{ width: 260 }}
              value={selectedRole}
              onChange={setSelectedRole}
              allowClear
              placeholder="选择角色（留空则清除）"
              loading={roleLoading}
            >
              {roles.map((r) => (
                <Option key={r.code} value={r.code}>
                  {r.name}
                  {r.describe ? ` — ${r.describe}` : ''}
                </Option>
              ))}
            </Select>
          </div>

          <div>
            <div style={{ marginBottom: 6, fontWeight: 500 }}>
              下属成员
              <span style={{ color: '#999', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                （设置后该用户拥有主管视角）
              </span>
            </div>
            <Transfer
              dataSource={transferSource}
              titles={['所有用户', '下属']}
              targetKeys={targetKeys}
              onChange={(keys) => setTargetKeys(keys as string[])}
              render={(item) => item.title}
              listStyle={{ width: 280, height: 260 }}
              showSearch
              filterOption={(inputValue, item) =>
                item.title.toLowerCase().includes(inputValue.toLowerCase())
              }
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}

export default AdminUsersPage
