import React, { useEffect, useState } from 'react'
import {
  Table, Button, Input, Select, Space, Tooltip, Popconfirm, Modal, Form,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon, MagnifyingGlassIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUserListThunk, fetchDepartmentsThunk, createUserThunk, deleteUserThunk } from './userSlice'
import { userApi } from '@/api/user.api'
import { UserProfile } from '@/types/api.types'
import { showToast } from '@/utils/toast'

const { Search } = Input

const UserManagementPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { list, totalCount, departments, isLoading, isSaving } = useAppSelector((s) => s.user)

  const [page,         setPage]         = useState(1)
  const [pageSize,     setPageSize]     = useState(20)
  const [keyword,      setKeyword]      = useState('')
  const [deptFilter,   setDeptFilter]   = useState<string | undefined>()
  const [showCreate,   setShowCreate]   = useState(false)
  const [editTarget,   setEditTarget]   = useState<UserProfile | null>(null)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [createForm]                    = Form.useForm()
  const [editForm]                      = Form.useForm()

  useEffect(() => {
    dispatch(fetchDepartmentsThunk())
  }, [dispatch])

  useEffect(() => {
    dispatch(fetchUserListThunk({ page, size: pageSize, keyword: keyword || undefined, department: deptFilter }))
  }, [dispatch, page, pageSize, keyword, deptFilter])

  const handleDelete = async (workNo: string) => {
    try {
      await dispatch(deleteUserThunk(workNo)).unwrap()
      showToast.success('刪除成功')
    } catch {
      showToast.error('刪除失敗')
    }
  }

  const handleCreate = async (values: Record<string, unknown>) => {
    try {
      await dispatch(createUserThunk({
        work_no:    values.work_no as string,
        name:       values.name as string,
        department: values.department as string,
        position:   values.position as string | undefined,
        email:      values.email as string | undefined,
        phone:      values.phone as string | undefined,
        password:   values.password as string | undefined,
      })).unwrap()
      showToast.success('用戶建立成功')
      setShowCreate(false)
      createForm.resetFields()
      dispatch(fetchUserListThunk({ page, size: pageSize }))
    } catch (err: unknown) {
      showToast.error((err as string) || '建立失敗')
    }
  }

  const handleEdit = async (values: Record<string, unknown>) => {
    if (!editTarget) return
    setIsSavingEdit(true)
    try {
      await userApi.update(editTarget.work_no, {
        name:       values.name as string,
        department: values.department as string,
        position:   values.position as string | undefined,
        email:      values.email as string | undefined,
        phone:      values.phone as string | undefined,
      })
      showToast.success('更新成功')
      setEditTarget(null)
      dispatch(fetchUserListThunk({ page, size: pageSize }))
    } catch { /* global */ }
    finally { setIsSavingEdit(false) }
  }

  const openEdit = (user: UserProfile) => {
    setEditTarget(user)
    editForm.setFieldsValue(user)
  }

  const columns: ColumnsType<UserProfile> = [
    { title: '工號',   dataIndex: 'work_no',    width: 100 },
    { title: '姓名',   dataIndex: 'name',        width: 100 },
    { title: '部門',   dataIndex: 'department',  width: 140 },
    { title: '職稱',   dataIndex: 'position',    width: 120, render: (v?: string) => v || '—' },
    { title: 'Email',  dataIndex: 'email',        ellipsis: true, render: (v?: string) => v || '—' },
    { title: '電話',   dataIndex: 'phone',        width: 130, render: (v?: string) => v || '—' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record) => (
        <Space>
          <Tooltip title="編輯">
            <Button icon={<PencilIcon className="w-4 h-4" />} size="small" type="text" onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title="確認刪除此用戶？" onConfirm={() => handleDelete(record.work_no)} okText="確認" cancelText="取消">
            <Tooltip title="刪除">
              <Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const userFormItems = (isEdit = false) => (
    <>
      {!isEdit && (
        <Form.Item name="work_no" label="工號" rules={[{ required: true, message: '請輸入工號' }]}>
          <Input placeholder="請輸入工號" />
        </Form.Item>
      )}
      <div className="grid grid-cols-2 gap-x-4">
        <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
          <Input placeholder="請輸入姓名" />
        </Form.Item>
        <Form.Item name="department" label="部門" rules={[{ required: true, message: '請選擇部門' }]}>
          <Select
            showSearch
            placeholder="選擇或輸入部門"
            options={departments.map((d) => ({ value: d, label: d }))}
          />
        </Form.Item>
        <Form.Item name="position" label="職稱">
          <Input placeholder="請輸入職稱" />
        </Form.Item>
        <Form.Item name="phone" label="電話">
          <Input placeholder="請輸入電話" />
        </Form.Item>
        <Form.Item name="email" label="Email" className="col-span-2">
          <Input placeholder="請輸入Email" type="email" />
        </Form.Item>
        {!isEdit && (
          <Form.Item name="password" label="初始密碼" className="col-span-2">
            <Input.Password placeholder="請輸入初始密碼" />
          </Form.Item>
        )}
      </div>
    </>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">用戶管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理系統用戶帳號</p>
        </div>
        <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setShowCreate(true)} className="bg-blue-600">
          新增用戶
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 bg-white p-4 rounded-lg shadow-sm">
        <Search
          placeholder="搜索工號或姓名"
          allowClear
          style={{ width: 240 }}
          prefix={<MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />}
          onSearch={(v) => { setKeyword(v); setPage(1) }}
        />
        <Select
          placeholder="選擇部門"
          allowClear
          style={{ width: 180 }}
          onChange={(v) => { setDeptFilter(v); setPage(1) }}
          options={departments.map((d) => ({ value: d, label: d }))}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm">
        <Table
          rowKey="work_no"
          columns={columns}
          dataSource={list}
          loading={isLoading}
          pagination={{
            current: page, pageSize,
            total: totalCount,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 條`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
          scroll={{ x: 800 }}
        />
      </div>

      {/* Create */}
      <Modal
        title="新增用戶"
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields() }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="mt-4">
          {userFormItems(false)}
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); createForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} className="bg-blue-600">建立</Button>
          </div>
        </Form>
      </Modal>

      {/* Edit */}
      <Modal
        title="編輯用戶"
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} className="mt-4">
          {userFormItems(true)}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSavingEdit} className="bg-blue-600">保存</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagementPage
