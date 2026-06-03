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
import { projectApi } from '@/api/project.api'
import { UserProfile } from '@/types/api.types'
import { showToast } from '@/utils/toast'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { useTranslation } from 'react-i18next'

const { Search } = Input

// ─── Hierarchy data (loaded from API) ────────────────────────────────────────
interface SupervisorEntry { supervisor_no: string; supervisor_nm: string; relation_id: string }

interface HierarchyRow {
  work_no: string; name: string; department: string; position: string
  supervisors: SupervisorEntry[]
}

// Build tree data — use first supervisor as primary parent to keep tree structure valid
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
    const primary = r.supervisors[0]
    if (!primary) {
      roots.push(node)
    } else {
      const parent = map.get(primary.supervisor_no)
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
  const { t } = useTranslation()
  const names = departments.map((d) => d.name)
  const [options, setOptions] = useState(names.map((n) => ({ value: n })))

  useEffect(() => {
    setOptions(names.map((n) => ({ value: n })))
  }, [departments])

  return (
    <AutoComplete
      value={value}
      onChange={onChange}
      placeholder={t('user.deptPlaceholder')}
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
// Groups are loaded from API via adminApi.listGroups()

// ─── HierarchyTab ──────────────────────────────────────────────────────────────
const HierarchyTab: React.FC<{ isSupervisor: boolean }> = ({ isSupervisor }) => {
  const { t } = useTranslation()
  const [editTarget, setEditTarget] = useState<HierarchyRow | null>(null)
  const [hierarchy, setHierarchy] = useState<HierarchyRow[]>([])
  const [isSavingHierarchy, setIsSavingHierarchy] = useState(false)
  const [editForm] = Form.useForm()
  const treeData = buildTree(hierarchy)

  const loadHierarchy = () => {
    Promise.all([
      userApi.list({ size: 200 }),
      userApi.listRelations(),
    ]).then(([usersRes, relsRes]) => {
      const users = (usersRes as { content?: { data_list?: { work_no: string; name: string; department: string; position?: string }[] } }).content?.data_list ?? []
      const rels: HierarchyRelation[] = (relsRes as { content?: HierarchyRelation[] }).content ?? []

      // Build supervisor map: subordinate_work_no → [ ...supervisors ]
      const supMap = new Map<string, SupervisorEntry[]>()
      rels.forEach((r) => {
        if (!supMap.has(r.subordinate_work_no)) supMap.set(r.subordinate_work_no, [])
        supMap.get(r.subordinate_work_no)!.push({
          supervisor_no: r.supervisor_work_no,
          supervisor_nm: r.supervisor_name,
          relation_id: r.id,
        })
      })

      const rows: HierarchyRow[] = users.map((u) => ({
        work_no: u.work_no,
        name: u.name,
        department: u.department,
        position: u.position ?? '',
        supervisors: supMap.get(u.work_no) ?? [],
      }))
      setHierarchy(rows)
    }).catch(() => {})
  }

  useEffect(() => { loadHierarchy() }, [])

  const handleSave = async (values: { supervisor_nos: string[] }) => {
    if (!editTarget) return
    setIsSavingHierarchy(true)
    try {
      const newSet = new Set(values.supervisor_nos ?? [])
      const oldMap = new Map(editTarget.supervisors.map((s) => [s.supervisor_no, s.relation_id]))

      // Remove relations no longer selected
      for (const [supNo, relId] of oldMap.entries()) {
        if (!newSet.has(supNo)) {
          await userApi.removeRelation(relId)
        }
      }
      // Add newly selected relations
      for (const supNo of newSet) {
        if (!oldMap.has(supNo)) {
          await userApi.setRelation(supNo, editTarget.work_no)
        }
      }

      showToast.success(t('user.updateSupervisorSuccess', { name: editTarget.name }))
      setEditTarget(null)
      loadHierarchy()
    } catch {
      showToast.error(t('user.updateSupervisorFailed'))
    } finally {
      setIsSavingHierarchy(false)
    }
  }

  const rawHierarchyColumns: ColumnsType<HierarchyRow> = [
    { title: t('user.workNo'),  dataIndex: 'work_no',   width: 90  },
    { title: t('user.name'),  dataIndex: 'name',       width: 80  },
    { title: t('user.department'),  dataIndex: 'department', width: 100 },
    { title: t('user.position'),  dataIndex: 'position',   ellipsis: true },
    {
      title: t('user.supervisor'), dataIndex: 'supervisors', width: 180,
      render: (supervisors: SupervisorEntry[]) =>
        supervisors.length === 0
          ? <span className="text-slate-300">{t('user.noSupervisor')}</span>
          : supervisors.map((s) => (
            <Tag key={s.relation_id} color="blue" style={{ marginBottom: 2 }}>{s.supervisor_nm}</Tag>
          )),
    },
    ...(isSupervisor ? [{
      title: t('common.action'), key: 'action', width: 80,
      render: (_: unknown, record: HierarchyRow) => (
        <Tooltip title={t('user.setSupervisor')}>
          <Button
            icon={<PencilIcon className="w-4 h-4" />} size="small" type="text"
            onClick={() => {
              setEditTarget(record)
              editForm.setFieldsValue({ supervisor_nos: record.supervisors.map((s) => s.supervisor_no) })
            }}
          />
        </Tooltip>
      ),
    }] : []),
  ]
  const { mergeColumns: hierarchyColumns } = useResizableColumns(rawHierarchyColumns)

  return (
    <div>
      <Row gutter={[16, 16]}>
        {/* Tree view */}
        <Col xs={24} lg={10}>
          <Card
            bordered={false} className="shadow-sm"
            title={<span className="text-sm font-semibold text-slate-700">{t('user.orgTreeTitle')}</span>}
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
            title={<span className="text-sm font-semibold text-slate-700">{t('user.hierarchyTableTitle')}</span>}
            bodyStyle={{ padding: 0 }}
          >
            <Table
              rowKey="work_no"
              columns={hierarchyColumns}
              components={tableComponents}
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
        title={t('user.setSupervisorTitle', { name: editTarget?.name })}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null}
        width={440}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleSave} className="mt-4">
          <Form.Item name="supervisor_nos" label={t('user.supervisorMultiple')}>
            <Select
              mode="multiple"
              allowClear
              placeholder={t('user.supervisorMultiplePlaceholder')}
              optionFilterProp="label"
              options={hierarchy
                .filter((r) => r.work_no !== editTarget?.work_no)
                .map((r) => ({ value: r.work_no, label: `${r.name}（${r.position}）` }))
              }
            />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSavingHierarchy}>{t('user.saveBtn')}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ─── GroupManagementTab ────────────────────────────────────────────────────────
const GROUP_COLORS = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#db2777','#ea580c']

const GroupManagementTab: React.FC<{ isSupervisor: boolean }> = ({ isSupervisor }) => {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<ProjectGroup[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectGroup | null>(null)
  const [createForm] = Form.useForm()
  const [editForm]   = Form.useForm()
  const [allMembers, setAllMembers] = useState<{ work_no: string; name: string; position?: string }[]>([])

  const loadGroups = () => {
    projectApi.groups()
      .then((res) => {
        const list = Array.isArray(res.content) ? res.content : []
        setGroups(list.map((g: any, i: number) => ({ id: g.id, name: g.group_nm ?? g.name, description: '', member_count: 0, color: GROUP_COLORS[i % GROUP_COLORS.length] })))
      })
      .catch((err) => {
        console.error('[loadGroups] failed:', err)
      })
  }

  useEffect(() => {
    loadGroups()
    groupApi.members({ size: 200 })
      .then((res) => {
        const list = (res as { content?: { data_list?: { work_no: string; name: string; position?: string }[] } }).content?.data_list ?? []
        setAllMembers(list)
      })
      .catch(() => {})
  }, [])

  const handleCreate = async (values: { name: string; description: string; color: string }) => {
    try {
      await projectApi.createGroup(values.name)
      showToast.success(t('user.createGroupSuccess'))
      setShowCreate(false)
      createForm.resetFields()
      loadGroups()
    } catch {
      showToast.error(t('user.createFailed'))
    }
  }

  const handleEdit = async (values: { name: string; description: string; color: string }) => {
    if (!editTarget) return
    try {
      await projectApi.updateGroup(editTarget.id, values.name)
      showToast.success(t('user.editGroupSuccess'))
      setEditTarget(null)
      loadGroups()
    } catch {
      showToast.error(t('common.error'))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await projectApi.deleteGroup(id)
      showToast.success(t('user.deleteGroupSuccess'))
      loadGroups()
    } catch {
      showToast.error(t('user.deleteFailed'))
    }
  }

  const groupFormItems = (
    <>
      <Form.Item name="name" label={t('user.groupName')} rules={[{ required: true, message: t('user.groupNameRequired') }]}>
        <Input placeholder={t('user.groupNamePlaceholder')} />
      </Form.Item>
      <Form.Item name="description" label={t('common.description')}>
        <Input.TextArea rows={2} placeholder={t('user.groupDescPlaceholder')} />
      </Form.Item>
      <Form.Item name="color" label={t('user.groupColor')} initialValue="#2563eb">
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
        <p className="text-sm text-slate-500">{t('user.groupMgmtSubtitle')}</p>
        {isSupervisor && (
          <Button
            type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={() => setShowCreate(true)} className="bg-blue-600"
          >
            {t('user.createGroup')}
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
                  <span className="text-xs text-slate-300">{t('user.noMembers')}</span>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                <span className="text-xs text-slate-400">{t('user.memberCount', { count: memberNos.length })}</span>
                {isSupervisor && (
                  <Space size={4}>
                    <Tooltip title={t('common.edit')}>
                      <Button
                        icon={<PencilIcon className="w-3.5 h-3.5" />} size="small" type="text"
                        onClick={() => {
                          setEditTarget(g)
                          editForm.setFieldsValue({ name: g.name, description: g.description, color: g.color })
                        }}
                      />
                    </Tooltip>
                    <Popconfirm
                      title={t('user.confirmDeleteGroup')}
                      description={t('user.confirmDeleteGroupDesc')}
                      onConfirm={() => handleDelete(g.id)}
                      okText={t('user.confirmDeleteGroupOk')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }}
                    >
                      <Tooltip title={t('common.delete')}>
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
      <Modal title={t('user.createGroupTitle')} open={showCreate} onCancel={() => { setShowCreate(false); createForm.resetFields() }} footer={null} width={440} destroyOnClose>
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="mt-4">
          {groupFormItems}
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); createForm.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" className="bg-blue-600">{t('user.createBtn')}</Button>
          </div>
        </Form>
      </Modal>

      {/* Edit modal */}
      <Modal title={t('user.editGroupTitle')} open={!!editTarget} onCancel={() => setEditTarget(null)} footer={null} width={440} destroyOnClose>
        <Form form={editForm} layout="vertical" onFinish={handleEdit} className="mt-4">
          {groupFormItems}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" className="bg-blue-600">{t('user.saveBtn')}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const UserManagementPage: React.FC = () => {
  const { t } = useTranslation()
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
      showToast.success(t('user.deleteSuccess'))
    } catch {
      showToast.error(t('user.deleteFailed'))
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

      showToast.success(t('user.createSuccess'))
      setShowCreate(false)
      createForm.resetFields()
      dispatch(fetchUserListThunk({ page, size: pageSize }))
    } catch (err: unknown) {
      showToast.error((err as string) || t('user.createFailed'))
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
      showToast.success(t('user.updateSuccess'))
      setEditTarget(null)
      dispatch(fetchUserListThunk({ page, size: pageSize }))
    } catch { /* global */ }
    finally { setIsSavingEdit(false) }
  }

  const openEdit = (user: UserProfile) => {
    setEditTarget(user)
    editForm.setFieldsValue(user)
  }

  const rawUserColumns: ColumnsType<UserProfile> = [
    { title: t('user.workNo'),   dataIndex: 'work_no',    width: 100 },
    { title: t('user.name'),   dataIndex: 'name',        width: 100 },
    { title: t('user.department'),   dataIndex: 'department',  width: 140 },
    { title: t('user.position'),   dataIndex: 'position',    width: 120, render: (v?: string) => v || '—' },
    { title: 'Email',  dataIndex: 'email',        ellipsis: true, render: (v?: string) => v || '—' },
    { title: t('user.phone'),   dataIndex: 'phone',        width: 130, render: (v?: string) => v || '—' },
    ...(isSupervisor ? [{
      title: t('common.action'),
      key: 'action',
      width: 100,
      render: (_: unknown, record: UserProfile) => (
        <Space>
          <Tooltip title={t('common.edit')}>
            <Button icon={<PencilIcon className="w-4 h-4" />} size="small" type="text" onClick={() => openEdit(record)} />
          </Tooltip>
          <Popconfirm title={t('user.confirmDeleteUser')} onConfirm={() => handleDelete(record.work_no)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Tooltip title={t('common.delete')}>
              <Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ]
  const { mergeColumns: userColumns } = useResizableColumns(rawUserColumns)

  const userFormItems = (isEdit = false) => (
    <>
      {!isEdit && (
        <Form.Item name="work_no" label={t('user.workNo')} rules={[{ required: true, message: t('user.workNoRequired') }]}>
          <Input placeholder={t('user.workNoPlaceholder')} />
        </Form.Item>
      )}
      <div className="grid grid-cols-2 gap-x-4">
        <Form.Item name="name" label={t('user.name')} rules={[{ required: true, message: t('user.nameRequired') }]}>
          <Input placeholder={t('user.namePlaceholder')} />
        </Form.Item>
        <Form.Item name="department" label={t('user.department')} rules={[{ required: true, message: t('user.deptRequired') }]}>
          <DeptAutoComplete departments={departments} />
        </Form.Item>
        <Form.Item name="position" label={t('user.position')}>
          <Input placeholder={t('user.positionPlaceholder')} />
        </Form.Item>
        <Form.Item name="phone" label={t('user.phone')}>
          <Input placeholder={t('user.phonePlaceholder')} />
        </Form.Item>
        <Form.Item name="email" label="Email" className="col-span-2">
          <Input placeholder={t('user.emailPlaceholder')} type="email" />
        </Form.Item>
        {!isEdit && (
          <>
            <Form.Item name="password" label={t('user.initialPassword')} className="col-span-2">
              <Input.Password placeholder={t('user.passwordPlaceholder')} />
            </Form.Item>
            <Form.Item name="supervisor_work_no" label={t('user.supervisor')} className="col-span-2">
              <Select
                allowClear
                showSearch
                placeholder={t('user.supervisorOptional')}
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
          <UsersIcon className="w-4 h-4" />{t('user.userTab')}
        </span>
      ),
      children: (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex flex-wrap gap-3">
              <Search
                placeholder={t('user.searchPlaceholder')}
                allowClear
                style={{ width: 240 }}
                prefix={<MagnifyingGlassIcon className="w-4 h-4 text-gray-400" />}
                onSearch={(v) => { setKeyword(v); setPage(1) }}
              />
              <Select
                placeholder={t('user.selectDept')}
                allowClear
                style={{ width: 180 }}
                onChange={(v) => { setDeptFilter(v); setPage(1) }}
                options={departments.map((d) => ({ value: d.name, label: d.name }))}
              />
            </div>
            {isSupervisor && (
              <Button type="primary" icon={<PlusIcon className="w-4 h-4" />} onClick={() => setShowCreate(true)} className="bg-blue-600">
                {t('user.createUser')}
              </Button>
            )}
          </div>
          <div className="bg-white rounded-lg shadow-sm">
            <Table
              rowKey="work_no"
              columns={userColumns}
              components={tableComponents}
              dataSource={list}
              loading={isLoading}
              pagination={{
                current: page, pageSize,
                total: totalCount,
                showSizeChanger: true,
                showTotal: (total) => t('common.total', { count: total }),
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
          <ShareIcon className="w-4 h-4" />{t('user.hierarchyTab')}
        </span>
      ),
      children: <HierarchyTab isSupervisor={isSupervisor} />,
    },
    {
      key: 'groups',
      label: (
        <span className="flex items-center gap-1.5">
          <FolderIcon className="w-4 h-4" />{t('user.groupTab')}
        </span>
      ),
      children: <GroupManagementTab isSupervisor={isSupervisor} />,
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">{t('user.systemMgmt')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('user.systemMgmtSubtitle')}</p>
      </div>

      <Tabs items={tabItems} defaultActiveKey="users" type="card" />

      {/* Create user modal */}
      <Modal
        title={t('user.createUser')}
        open={showCreate}
        onCancel={() => { setShowCreate(false); createForm.resetFields() }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} className="mt-4">
          {userFormItems(false)}
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowCreate(false); createForm.resetFields() }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSaving} className="bg-blue-600">{t('user.createBtn')}</Button>
          </div>
        </Form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        title={t('user.editUser')}
        open={!!editTarget}
        onCancel={() => setEditTarget(null)}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit} className="mt-4">
          {userFormItems(true)}
          <div className="flex justify-end gap-3">
            <Button onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={isSavingEdit} className="bg-blue-600">{t('user.saveBtn')}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default UserManagementPage
