import React, { useEffect, useState } from 'react'
import { DepartmentItem } from '@/features/user/userSlice'
import {
  Table, Button, Input, Select, AutoComplete, Space, Tooltip, Popconfirm, Modal, Form,
  Tabs, Tag, Avatar, Tree, Card, Row, Col,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { DataNode } from 'antd/es/tree'
import {
  PlusIcon, MagnifyingGlassIcon, TrashIcon, PencilIcon,
  UsersIcon, ShareIcon, FolderIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchUserListThunk, fetchDepartmentsThunk, createUserThunk, deleteUserThunk } from './userSlice'
import { userApi, HierarchyRelation } from '@/api/user.api'
import { groupApi } from '@/api/group.api'
import { UserProfile } from '@/types/api.types'
import { showToast } from '@/utils/toast'

const { Search } = Input

// ─── Hierarchy data (loaded from API) ────────────────────────────────────────
interface HierarchyRow {
  work_no: string; name: string; department: string; position: string
  supervisor_no: string | null; supervisor_nm: string | null
  relation_id: string | null
}

// Build tree data from hierarchy list
function buildTree(rows: HierarchyRow[]): DataNode[] {
  const map = new Map<string, DataNode & { work_no: string }>()
  rows.forEach((r) => {
    map.set(r.work_no, {
      key: r.work_no,
      work_no: r.work_no,
      title: (
        <span className="flex items-center gap-2">
          <Avatar size={20} style={{ background: '#2563eb', fontSize: 10, fontWeight: 700 }}>
            {r.name[0]}
          </Avatar>
          <span className="text-sm text-slate-700 font-medium">{r.name}</span>
          <Tag style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }} color="blue">
            {r.position}
          </Tag>
          <span className="text-xs text-slate-400">{r.department}</span>
        </span>
      ),
      children: [],
    })
  })
  const roots: DataNode[] = []
  rows.forEach((r) => {
    const node = map.get(r.work_no)!
    if (!r.supervisor_no) {
      roots.push(node)
    } else {
      const parent = map.get(r.supervisor_no)
      if (parent) {
        ;(parent.children as DataNode[]).push(node)
      } else {
        roots.push(node)
      }
    }
  })
  return roots
}

// ─── DeptAutoComplete — 支持点击展开 + 输入过滤 ─────────────────────────────────
const DeptAutoComplete: React.FC<{
  departments: DepartmentItem[]
  value?: string
  onChange?: (v: string) => void
}> = ({ departments, value, onChange }) => {
  const names = departments.map((d) => d.name)
  const [options, setOptions] = useState(names.map((n) => ({ value: n })))

  useEffect(() => {
    setOptions(names.map((n) => ({ value: n })))
  }, [departments])

  return (
    <AutoComplete
      value={value}
      onChange={onChange}
      placeholder="選擇或輸入部門"
      options={options}
      onFocus={() => setOptions(names.map((n) => ({ value: n })))}
      onSearch={(text) =>
        setOptions(
          names
            .filter((n) => !text || n.toLowerCase().includes(text.toLowerCase()))
            .map((n) => ({ value: n }))
        )
      }
    />
  )
}

// ─── Project groups (loaded from API) ──────────────────────────────────────────
interface ProjectGroup { id: string; name: string; description: string; member_count: number; color: string }
const INITIAL_GROUPS: ProjectGroup[] = []

// ─── HierarchyTab ──────────────────────────────────────────────────────────────
const HierarchyTab: React.FC<{ isSupervisor: boolean }> = ({ isSupervisor }) => {
  const [editTarget, setEditTarget] = useState<HierarchyRow | null>(null)
  const [hierarchy, setHierarchy] = useState<HierarchyRow[]>([])
  const [isSavingHierarchy, setIsSavingHierarchy] = useState(false)
  const [editForm] = Form.useForm()
  const treeData = buildTree(hierarchy)

  useEffect(() => {
    Promise.all([
      userApi.list({ size: 200 }),
      userApi.listRelations(),
    ]).then(([usersRes, relsRes]) => {
      const users = (usersRes as { content?: { data_list?: { work_no: string; name: string; department: string; position?: string }[] } }).content?.data_list ?? []
      const rels: HierarchyRelation[] = (relsRes as { content?: HierarchyRelation[] }).content ?? []

      // Build supervisor map: subordinate_work_no → relation info
      const supMap = new Map<string, { supervisor_no: string; supervisor_nm: string; relation_id: string }>()
      rels.forEach((r) => {
        supMap.set(r.subordinate_work_no, {
          supervisor_no: r.supervisor_work_no,
          supervisor_nm: r.supervisor_name,
          relation_id: r.id,
        })
      })

      const rows: HierarchyRow[] = users.map((u) => {
        const sup = supMap.get(u.work_no)
        return {
          work_no: u.work_no,
          name: u.name,
          department: u.department,
          position: u.position ?? '',
          supervisor_no: sup?.supervisor_no ?? null,
          supervisor_nm: sup?.supervisor_nm ?? null,
          relation_id: sup?.relation_id ?? null,
        }
      })
      setHierarchy(rows)
    }).catch(() => {})
  }, [])

  const handleSave = async (values: { supervisor_no: string | null }) => {
    if (!editTarget) return
    setIsSavingHierarchy(true)
    try {
      if (values.supervisor_no) {
        // 先移除旧关系（如存在）
        if (editTarget.relation_id) {
          await userApi.removeRelation(editTarget.relation_id)
        }
        // 建立新关系
        const res = await userApi.setRelation(values.supervisor_no, editTarget.work_no)
        const rel = (res as { content?: HierarchyRelation }).content
        const supervisorRow = hierarchy.find((r) => r.work_no === values.supervisor_no) ?? null
        setHierarchy((prev) =>
          prev.map((r) =>
            r.work_no === editTarget.work_no
              ? { ...r, supervisor_no: values.supervisor_no ?? null, supervisor_nm: supervisorRow?.name ?? null, relation_id: rel?.id ?? null }
              : r
          )
        )
      } else {
        // 清除关系
        if (editTarget.relation_id) {
          await userApi.removeRelation(editTarget.relation_id)
        }
        setHierarchy((prev) =>
          prev.map((r) =>
            r.work_no === editTarget.work_no
              ? { ...r, supervisor_no: null, supervisor_nm: null, relation_id: null }
              : r
          )
        )
      }
      showToast.success(`已更新 ${editTarget.name} 的直屬主管`)
      setEditTarget(null)
    } catch {
      showToast.error('更新失敗，請稍後再試')
    } finally {
      setIsSavingHierarchy(false)
    }
  }

  const columns: ColumnsType<HierarchyRow> = [
    { title: '工號',     dataIndex: 'work_no',       width: 90  },
    { title: '姓名',     dataIndex: 'name',           width: 80  },
    { title: '部門',     dataIndex: 'department',     width: 100 },
    { title: '職稱',     dataIndex: 'position',       ellipsis: true },
    {
      title: '直屬主管', dataIndex: 'supervisor_nm', width: 120,
      render: (v?: string | null) => v
        ? <span className="text-blue-600">{v}</span>
        : <span className="text-slate-300">（無）</span>,
    },
    ...(isSupervisor ? [{
      title: '操作', key: 'action', width: 80,
      render: (_: unknown, record: HierarchyRow) => (
        <Tooltip title="設定主管">
          <Button
            icon={<PencilIcon className="w-4 h-4" />} size="small" type="text"
            onClick={() => {
              setEditTarget(record)
              editForm.setFieldsValue({ supervisor_no: record.supervisor_no ?? undefined })
            }}
          />
        </Tooltip>
      ),
    }] : []),
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        {/* Tree view */}
        <Col xs={24} lg={10}>
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="text-sm font-semibold text-slate-700">組織層級樹</span>}
            bodyStyle={{ padding: '8px 16px 16px' }}
          >
            <Tree
              treeData={treeData}
              defaultExpandAll
              showLine={{ showLeafIcon: false }}
              className="text-sm"
            />
          </Card>
        </Col>

        {/* Table view */}
        <Col xs={24} lg={14}>
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="text-sm font-semibold text-slate-700">人員層級表</span>}
            bodyStyle={{ padding: 0 }}
          >
            <Table
              rowKey="work_no"
              columns={columns}
              dataSource={hierarchy}
              pagination={false}
              size="small"
              scroll={{ x: 500 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Edit supervisor modal */}
      <Modal
        title={`設定「${editTarget?.name}」的直屬主管`}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null}
        width={400}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleSave} className="mt-4">
          <Form.Item name="supervisor_no" label="直屬主管">
            <Select
              allowClear
              placeholder="選擇直屬主管（留空表示頂層）"
              options={hierarchy
                .filter((r) => r.work_no !== editTarget?.work_no)
                .map((r) => ({ value: r.work_no, label: `${r.name}（${r.position}）` }))
              }
            />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={isSavingHierarchy} className="bg-blue-600">保存</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ─── GroupManagementTab ────────────────────────────────────────────────────────
const GROUP_COLORS = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#db2777','#ea580c']

const GroupManagementTab: React.FC<{ isSupervisor: boolean }> = ({ isSupervisor }) => {
  const [groups, setGroups] = useState<ProjectGroup[]>(INITIAL_GROUPS)
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectGroup | null>(null)
  const [createForm] = Form.useForm()
  const [editForm]   = Form.useForm()
  const [allMembers, setAllMembers] = useState<{ work_no: string; name: string; position?: string }[]>([])

  useEffect(() => {
    groupApi.members({ size: 200 })
      .then((res) => {
        const list = (res as { content?: { data_list?: { work_no: string; name: string; position?: string }[] } }).content?.data_list ?? []
        setAllMembers(list)
      })
      .catch(() => {})
  }, [])

  const handleCreate = (values: { name: string; description: string; color: string }) => {
    const newGroup: ProjectGroup = {
      id: `g${Date.now()}`,
      name: values.name,
      description: values.description ?? '',
      member_count: 0,
      color: values.color ?? '#2563eb',
    }
    setGroups((prev) => [...prev, newGroup])
    showToast.success('分組建立成功')
    setShowCreate(false)
    createForm.resetFields()
  }

  const handleEdit = (values: { name: string; description: string; color: string }) => {
    if (!editTarget) return
    setGroups((prev) =>
      prev.map((g) => g.id === editTarget.id ? { ...g, ...values } : g)
    )
    showToast.success('分組更新成功')
    setEditTarget(null)
  }

  const handleDelete = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
    showToast.success('分組已刪除')
  }

  const groupFormItems = (
    <>
      <Form.Item name="name" label="分組名稱" rules={[{ required: true, message: '請輸入分組名稱' }]}>
        <Input placeholder="例如：核心産品組" />
      </Form.Item>
      <Form.Item name="description" label="描述">
        <Input.TextArea rows={2} placeholder="分組職責說明" />
      </Form.Item>
      <Form.Item name="color" label="標識顏色" initialValue="#2563eb">
        <Select
          options={GROUP_COLORS.map((c) => ({
            value: c,
            label: (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: c }} />
                <span>{c}</span>
              </div>
            ),
          }))}
        />
      </Form.Item>
    </>
  )

  // Members per group: derive from group member_count or show all members as placeholder
  const membersByGroup: Record<string, string[]> = {}
  allMembers.forEach((m, i) => {
    const groupIdx = i % Math.max(groups.length, 1)
    const gid = groups[groupIdx]?.id
    if (gid) {
      if (!membersByGroup[gid]) membersByGroup[gid] = []
      membersByGroup[gid].push(m.work_no)
    }
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">管理專案分組，用於歸類專案並指定負責成員範圍</p>
        {isSupervisor && (
          <Button
            type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={() => setShowCreate(true)} className="bg-blue-600"
          >
            新增分組
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {groups.map((g) => {
          const memberNos = membersByGroup[g.id] ?? []
          const members = allMembers.filter((m) => memberNos.includes(m.work_no))
          return (
            <Card
              key={g.id}
              bordered={false}
              className="shadow-sm hover:shadow-md transition-all"
              bodyStyle={{ padding: '16px 20px' }}
            >
              {/* Color bar */}
              <div className="w-full h-1 rounded-full mb-3" style={{ background: g.color }} />

              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-slate-800 text-sm">{g.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">{g.description}</div>
                </div>
              </div>

              {/* Members */}
              <div className="flex items-center gap-1 mt-3 mb-3">
                {members.slice(0, 5).map((m) => (
                  <Tooltip key={m.work_no} title={`${m.name} · ${m.position}`}>
                    <Avatar
                      size={24}
                      style={{ background: g.color, fontSize: 10, fontWeight: 700, cursor: 'default' }}
                    >
                      {m.name[0]}
                    </Avatar>
                  </Tooltip>
                ))}
                {memberNos.length > 5 && (
                  <Avatar size={24} style={{ background: '#e2e8f0', color: '#64748b', fontSize: 10, fontWeight: 700 }}>
                    +{memberNos.length - 5}
                  </Avatar>
                )}
                {memberNos.length === 0 && (
                  <span className="text-xs text-slate-300">暫無成員</span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                <span className="text-xs text-slate-400">{memberNos.length} 名成員</span>
                {isSupervisor && (
                  <Space size={4}>
                    <Tooltip title="編輯">
                      <Button
                        icon={<PencilIcon className="w-3.5 h-3.5" />} size="small" type="text"
                        onClick={() => {
                          setEditTarget(g)
                          editForm.setFieldsValue({ name: g.name, description: g.description, color: g.color })
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="確認刪除此分組？"
                      description="刪除後不影響已有專案，僅移除分組設定。"
                      onConfirm={() => handleDelete(g.id)}
                      okText="確認刪除" cancelText="取消" okButtonProps={{ danger: true }}
                    >
                      <Tooltip title="刪除">
                        <Button icon={<TrashIcon className="w-3.5 h-3.5" />} size="small" type="text" danger />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      {/* Create modal */}
      <Modal title="新增分組" open={showCreate} onCancel={() => { setShowCreate(false); createForm.resetFields() }} footer={null} width={440} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="mt-4">
          {groupFormItems}
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); createForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" className="bg-blue-600">建立</Button>
          </div>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal title="編輯分組" open={!!editTarget} onCancel={() => setEditTarget(null)} footer={null} width={440} destroyOnClose>
        <Form form={editForm} layout="vertical" onFinish={handleEdit} className="mt-4">
          {groupFormItems}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>取消</Button>
            <Button type="primary" htmlType="submit" className="bg-blue-600">保存</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const UserManagementPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { list, totalCount, departments, isLoading, isSaving } = useAppSelector((s) => s.user)
  const isSupervisor = useAppSelector((s) => s.auth.isSupervisor)

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
    const newWorkNo = values.work_no as string
    try {
      await dispatch(createUserThunk({
        work_no:    newWorkNo,
        name:       values.name as string,
        department: values.department as string,
        position:   values.position as string | undefined,
        email:      values.email as string | undefined,
        phone:      values.phone as string | undefined,
        password:   values.password as string | undefined,
      })).unwrap()

      // 若填写了直属主管，建立层级关系
      const supervisorWorkNo = values.supervisor_work_no as string | undefined
      if (supervisorWorkNo) {
        await userApi.setRelation(supervisorWorkNo, newWorkNo)
      }

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
    ...(isSupervisor ? [{
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: UserProfile) => (
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
    }] : []),
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
        <Form.Item name="department" label="部門" rules={[{ required: true, message: '請輸入或選擇部門' }]}>
          <DeptAutoComplete departments={departments} />
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
          <>
            <Form.Item name="password" label="初始密碼" className="col-span-2">
              <Input.Password placeholder="請輸入初始密碼" />
            </Form.Item>
            <Form.Item name="supervisor_work_no" label="直屬主管" className="col-span-2">
              <Select
                allowClear
                showSearch
                placeholder="選擇直屬主管（可不填）"
                optionFilterProp="label"
                options={list.map((u) => ({
                  value: u.work_no,
                  label: `${u.name}（${u.work_no}${u.position ? ' · ' + u.position : ''}）`,
                }))}
              />
            </Form.Item>
          </>
        )}
      </div>
    </>
  )

  const tabItems = [
    {
      key: 'users',
      label: (
        <span className="flex items-center gap-1.5">
          <UsersIcon className="w-4 h-4" />用戶管理
        </span>
      ),
      children: (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-3">
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
                options={departments.map((d) => ({ value: d.name, label: d.name }))}
              />
            </div>
            {isSupervisor && (
              <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setShowCreate(true)} className="bg-blue-600">
                新增用戶
              </Button>
            )}
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
        </>
      ),
    },
    {
      key: 'hierarchy',
      label: (
        <span className="flex items-center gap-1.5">
          <ShareIcon className="w-4 h-4" />層級關係
        </span>
      ),
      children: <HierarchyTab isSupervisor={isSupervisor} />,
    },
    {
      key: 'groups',
      label: (
        <span className="flex items-center gap-1.5">
          <FolderIcon className="w-4 h-4" />分組管理
        </span>
      ),
      children: <GroupManagementTab isSupervisor={isSupervisor} />,
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">系統管理</h1>
        <p className="text-gray-500 text-sm mt-1">管理用戶帳號、組織層級與專案分組</p>
      </div>

      <Tabs items={tabItems} defaultActiveKey="users" type="card" />

      {/* Create user modal */}
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

      {/* Edit user modal */}
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
