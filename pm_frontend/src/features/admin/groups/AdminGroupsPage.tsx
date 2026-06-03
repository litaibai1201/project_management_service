import React, { useEffect, useState } from 'react'
import { Card, Button, Modal, Form, Input, Select, Space, Popconfirm, Tooltip, Empty, Avatar } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { projectApi } from '@/api/project.api'
import { groupApi } from '@/api/group.api'
import { showToast } from '@/utils/toast'
import { useTranslation } from 'react-i18next'

const GROUP_COLORS = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#0891b2', '#db2777', '#ea580c']

interface GroupItem {
  id: string
  group_nm: string
  color: string
}

interface MemberInfo {
  work_no: string
  name: string
  position?: string
}

const AdminGroupsPage: React.FC = () => {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<GroupItem[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<GroupItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [allMembers, setAllMembers] = useState<MemberInfo[]>([])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const res = await projectApi.groups()
      const list = Array.isArray(res.content) ? res.content : []
      setGroups(list.map((g: any, i: number) => ({
        id: g.id,
        group_nm: g.group_nm ?? g.name,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
      })))
    } catch (err) { console.error('[AdminGroups] load failed:', err) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    loadGroups()
    groupApi.members({ size: 200 })
      .then((res) => {
        const list = (res as any).content?.data_list ?? []
        setAllMembers(list)
      })
      .catch(() => {})
  }, [])

  // Distribute members to groups (same logic as user management page)
  const membersByGroup: Record<string, string[]> = {}
  allMembers.forEach((m, i) => {
    const groupIdx = i % Math.max(groups.length, 1)
    const gid = groups[groupIdx]?.id
    if (gid) {
      if (!membersByGroup[gid]) membersByGroup[gid] = []
      membersByGroup[gid].push(m.work_no)
    }
  })

  const handleOpenCreate = () => {
    setEditTarget(null)
    form.resetFields()
    setModalOpen(true)
  }

  const handleOpenEdit = (record: GroupItem) => {
    setEditTarget(record)
    form.setFieldsValue({ group_nm: record.group_nm, description: '', color: record.color })
    setModalOpen(true)
  }

  const handleSave = async (values: { group_nm: string }) => {
    setSaving(true)
    try {
      if (editTarget) {
        await projectApi.updateGroup(editTarget.id, values.group_nm)
        showToast.success(t('adminGroup.updateSuccess'))
      } else {
        await projectApi.createGroup(values.group_nm)
        showToast.success(t('adminGroup.createSuccess'))
      }
      setModalOpen(false)
      form.resetFields()
      setEditTarget(null)
      loadGroups()
    } catch { /* handled by interceptor */ }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await projectApi.deleteGroup(id)
      showToast.success(t('adminGroup.deleteSuccess'))
      loadGroups()
    } catch { /* handled by interceptor */ }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">{t('adminGroup.title')}</h2>
          <p className="text-slate-400 text-sm mt-1">{t('adminGroup.subtitle')}</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
          {t('adminGroup.create')}
        </Button>
      </div>

      {groups.length === 0 && !loading ? (
        <Empty description={t('common.noData')} className="py-16" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {groups.map((g) => {
            const memberNos = membersByGroup[g.id] ?? []
            const members = allMembers.filter((m) => memberNos.includes(m.work_no))
            return (
              <Card
                key={g.id}
                className="shadow-sm hover:shadow-md transition-all"
                loading={loading}
                styles={{ body: { padding: '16px 20px' } }}
              >
                {/* Color bar */}
                <div className="w-full h-1 rounded-full mb-3" style={{ background: g.color }} />

                {/* Group name */}
                <div className="font-semibold text-slate-800 text-sm truncate mb-3">{g.group_nm}</div>

                {/* Members avatars */}
                <div className="flex items-center gap-1 mb-3">
                  {members.slice(0, 5).map((m) => (
                    <Tooltip key={m.work_no} title={`${m.name}${m.position ? ' · ' + m.position : ''}`}>
                      <Avatar
                        size={28}
                        style={{ background: g.color, fontSize: 11, fontWeight: 700, cursor: 'default' }}
                      >
                        {m.name[0]}
                      </Avatar>
                    </Tooltip>
                  ))}
                  {memberNos.length > 5 && (
                    <Avatar size={28} style={{ background: '#e2e8f0', color: '#64748b', fontSize: 10, fontWeight: 700 }}>
                      +{memberNos.length - 5}
                    </Avatar>
                  )}
                  {memberNos.length === 0 && (
                    <span className="text-xs text-slate-300">{t('user.noMembers')}</span>
                  )}
                </div>

                {/* Footer: member count + actions */}
                <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                  <span className="text-xs text-slate-400">{t('user.memberCount', { count: memberNos.length })}</span>
                  <Space size={4}>
                    <Tooltip title={t('common.edit')}>
                      <Button
                        icon={<EditOutlined />} size="small" type="text"
                        onClick={() => handleOpenEdit(g)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title={t('adminGroup.deleteConfirm')}
                      onConfirm={() => handleDelete(g.id)}
                      okText={t('common.confirm')}
                      cancelText={t('common.cancel')}
                      okButtonProps={{ danger: true }}
                    >
                      <Tooltip title={t('common.delete')}>
                        <Button icon={<DeleteOutlined />} size="small" type="text" danger />
                      </Tooltip>
                    </Popconfirm>
                  </Space>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editTarget ? t('adminGroup.editTitle') : t('adminGroup.createTitle')}
        onCancel={() => { setModalOpen(false); setEditTarget(null) }}
        footer={null}
        destroyOnHidden
        width={420}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} className="mt-4">
          <Form.Item
            name="group_nm"
            label={t('user.groupName')}
            rules={[{ required: true, message: t('adminGroup.nameRequired') }]}
          >
            <Input placeholder={t('adminGroup.namePlaceholder')} />
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
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setModalOpen(false); setEditTarget(null) }}>{t('common.cancel')}</Button>
            <Button type="primary" htmlType="submit" loading={saving} className="bg-blue-600">
              {editTarget ? t('common.save') : t('adminGroup.create')}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default AdminGroupsPage
