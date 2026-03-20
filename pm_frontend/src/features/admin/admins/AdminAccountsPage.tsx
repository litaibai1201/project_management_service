import React, { useEffect, useState, useCallback } from 'react'
import { Card, Table, Button, Modal, Form, Input, Popconfirm, Space, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { sysAdminApi, AdminAccount } from '@/api/sys_admin.api'
import { showToast } from '@/utils/toast'

interface CreateForm {
  username: string
  password: string
  name:     string
}

const AdminAccountsPage: React.FC = () => {
  const [admins, setAdmins]   = useState<AdminAccount[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage]       = useState(1)
  const [modalOpen, setModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm<CreateForm>()

  const fetchAdmins = useCallback(() => {
    setLoading(true)
    sysAdminApi.listAdmins(page)
      .then((res) => {
        setAdmins(res.content?.data_list ?? [])
        setTotal(res.content?.total_count ?? 0)
      })
      .catch(() => showToast.error('加载管理员列表失败'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { fetchAdmins() }, [fetchAdmins])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)
      await sysAdminApi.createAdmin(values.username, values.password, values.name)
      showToast.success('管理员已创建')
      setModal(false)
      form.resetFields()
      fetchAdmins()
    } catch {
      showToast.error('创建失败')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (id: string) => {
    sysAdminApi.deleteAdmin(id)
      .then(() => { showToast.success('已删除'); fetchAdmins() })
      .catch(() => showToast.error('删除失败'))
  }

  const columns = [
    { title: '账号',   dataIndex: 'username',   key: 'username',   width: 140 },
    { title: '显示名', dataIndex: 'name',        key: 'name',        width: 140 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (v: number) => <Tag color={v === 1 ? 'green' : 'red'}>{v === 1 ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '最近登录',
      dataIndex: 'last_login',
      key: 'last_login',
      width: 180,
      render: (v: string) => v ? v.slice(0, 19).replace('T', ' ') : '-',
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
      width: 100,
      render: (_: unknown, record: AdminAccount) => (
        <Popconfirm
          title="确定删除该管理员账号？"
          onConfirm={() => handleDelete(record.id)}
        >
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontWeight: 600 }}>管理员账号</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal(true)}>
          新增管理员
        </Button>
      </div>

      <Card>
        <Table<AdminAccount>
          rowKey="id"
          dataSource={admins}
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

      <Modal
        title="新增管理员"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModal(false); form.resetFields() }}
        okText="创建"
        cancelText="取消"
        confirmLoading={creating}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="账号"
            rules={[{ required: true, message: '请输入账号' }]}
          >
            <Input placeholder="登录账号" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="登录密码" />
          </Form.Item>
          <Form.Item
            name="name"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="管理员显示名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminAccountsPage
