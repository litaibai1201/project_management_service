import React, { useEffect, useState, useCallback } from 'react'
import {
  Table, Button, Input, Select, AutoComplete, Space, Tooltip, Popconfirm,
  Modal, Form, Tag, Avatar, Drawer, Descriptions, Divider,
  Typography, Popover, Checkbox,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon, PencilSquareIcon, TrashIcon, EyeIcon, PlusCircleIcon, MinusCircleIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { systemApi, type SystemItem, type SystemUrl, type DeployRow, type CreateSystemPayload } from '@/api/system.api'
import { userApi } from '@/api/user.api'
import { useAppSelector } from '@/hooks/redux'
import { showToast } from '@/utils/toast'

const { Text, Link } = Typography

const EMPTY_DEPLOY_ROW: DeployRow = {
  fe_host: '', fe_path: '', fe_app_nm: '', fe_port: '',
  be_host: '', be_path: '', be_app_nm: '', be_port: '',
  remark: '',
}

const SystemListPage: React.FC = () => {
  const isAdmin = useAppSelector((s) => s.auth.isAdmin)

  const TOGGLEABLE_COLS = ['sys_group', 'maintainer_names', 'go_live_date', 'urls'] as const
  type ColKey = typeof TOGGLEABLE_COLS[number]
  const COL_LABELS: Record<ColKey, string> = {
    sys_group:        '分组',
    maintainer_names: '维护人员',
    go_live_date:     '上线时间',
    urls:             '访问网址',
  }
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(new Set(TOGGLEABLE_COLS))
  const toggleCol = (key: ColKey) =>
    setVisibleCols((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })

  const [list,     setList]     = useState<SystemItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword,  setKeyword]  = useState('')
  const [group,    setGroup]    = useState<string | undefined>()
  const [groups,   setGroups]   = useState<string[]>([])

  const [detail,      setDetail]      = useState<SystemItem | null>(null)
  const [detailOpen,  setDetailOpen]  = useState(false)
  const [editTarget,  setEditTarget]  = useState<SystemItem | null>(null)
  const [formOpen,    setFormOpen]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [userOptions, setUserOptions] = useState<{ value: string; label: string }[]>([])
  const [form] = Form.useForm()

  // Dynamic URL list state
  const [urlList,     setUrlList]     = useState<SystemUrl[]>([{ name: '', url: '' }])
  // Dynamic deploy rows state
  const [deployRows,  setDeployRows]  = useState<DeployRow[]>([{ ...EMPTY_DEPLOY_ROW }])

  const loadList = useCallback(async (p = page, s = pageSize, kw = keyword, g = group) => {
    setLoading(true)
    try {
      const res = await systemApi.list({ page: p, size: s, keyword: kw, sys_group: g })
      const c = res.content as { data_list: SystemItem[]; total_count: number }
      setList(c.data_list ?? [])
      setTotal(c.total_count ?? 0)
      setPage(p)
    } catch { /* global */ } finally { setLoading(false) }
  }, [page, pageSize, keyword, group])

  const loadGroups = useCallback(async () => {
    try {
      const res = await systemApi.groups()
      const raw = res.content
      setGroups(Array.isArray(raw) ? raw : [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadList(); loadGroups() }, [])

  const loadUsers = useCallback(() => {
    if (userOptions.length > 0) return
    userApi.list({ page: 1, size: 2000 }).then((res) => {
      const data = (res.content as { data_list?: { work_no: string; name: string }[] }).data_list ?? []
      setUserOptions(data.map((u) => ({ value: u.work_no, label: `${u.name} (${u.work_no})` })))
    }).catch(() => {})
  }, [userOptions.length])

  const openCreate = () => {
    setEditTarget(null)
    form.resetFields()
    setUrlList([{ name: '', url: '' }])
    setDeployRows([{ ...EMPTY_DEPLOY_ROW }])
    loadUsers()
    setFormOpen(true)
  }

  const openEdit = (item: SystemItem) => {
    setEditTarget(item)
    form.setFieldsValue({
      sys_nm:      item.sys_nm,
      sys_group:   item.sys_group,
      maintainers: item.maintainers,
      description: item.description,
      go_live_date: item.go_live_date,
    })
    setUrlList(item.urls.length > 0 ? item.urls : [{ name: '', url: '' }])
    setDeployRows(item.deploy_info.length > 0 ? item.deploy_info : [{ ...EMPTY_DEPLOY_ROW }])
    loadUsers()
    setFormOpen(true)
  }

  const openDetail = async (item: SystemItem) => {
    setDetail(item)
    setDetailOpen(true)
    // Refresh detail from server for latest data
    try {
      const res = await systemApi.get(item.id)
      setDetail(res.content as SystemItem)
    } catch { /* ignore */ }
  }

  const handleSave = async () => {
    let values: Record<string, unknown>
    try { values = await form.validateFields() } catch { return }
    setSaving(true)
    try {
      const payload: CreateSystemPayload = {
        sys_nm:      values.sys_nm as string,
        sys_group:   values.sys_group as string,
        maintainers: values.maintainers as string[],
        description: values.description as string,
        go_live_date: values.go_live_date as string,
        urls:         urlList.filter((u) => u.url),
        deploy_info:  deployRows.filter((r) => r.fe_host || r.be_host || r.remark),
      }
      if (editTarget) {
        await systemApi.update(editTarget.id, payload)
        showToast.success('更新成功')
      } else {
        await systemApi.create(payload)
        showToast.success('创建成功')
      }
      setFormOpen(false)
      loadList(1)
      loadGroups()
    } catch (err: unknown) { showToast.error((err as string) || '操作失败') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await systemApi.delete(id)
      showToast.success('已删除')
      loadList(page)
    } catch { showToast.error('删除失败') }
  }

  const rawColumns: ColumnsType<SystemItem> = [
    {
      title: '系统名称', dataIndex: 'sys_nm', ellipsis: true, width: 260,
      render: (v: string, r) => (
        <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => openDetail(r)}>{v}</Button>
      ),
    },
    ...(visibleCols.has('sys_group') ? [{
      title: '分组', dataIndex: 'sys_group', width: 120,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <span className="text-slate-300 text-xs">—</span>,
    } as ColumnsType<SystemItem>[number]] : []),
    ...(visibleCols.has('maintainer_names') ? [{
      title: '维护人员', dataIndex: 'maintainer_names', width: 180,
      render: (v: { work_no: string; name: string }[]) => (
        <Avatar.Group max={{ count: 4 }} size="small">
          {(v ?? []).map((u) => (
            <Tooltip key={u.work_no} title={`${u.name} (${u.work_no})`}>
              <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>
                {u.name?.[0] ?? u.work_no[0]}
              </Avatar>
            </Tooltip>
          ))}
        </Avatar.Group>
      ),
    } as ColumnsType<SystemItem>[number]] : []),
    ...(visibleCols.has('go_live_date') ? [{
      title: '上线时间', dataIndex: 'go_live_date', width: 120,
      render: (v: string) => v || <span className="text-slate-300 text-xs">—</span>,
    } as ColumnsType<SystemItem>[number]] : []),
    ...(visibleCols.has('urls') ? [{
      title: '访问网址', dataIndex: 'urls', width: 160,
      render: (v: SystemUrl[]) => v?.length
        ? <Link href={v[0].url} target="_blank" style={{ fontSize: 12 }}>{v[0].name || v[0].url}</Link>
        : <span className="text-slate-300 text-xs">—</span>,
    } as ColumnsType<SystemItem>[number]] : []),
    {
      title: '操作', key: 'action', width: isAdmin ? 110 : 70, fixed: 'right',
      render: (_: unknown, r) => (
        <Space size={0}>
          <Tooltip title="查看详情">
            <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => openDetail(r)} />
          </Tooltip>
          {isAdmin && (
            <>
              <Tooltip title="编辑">
                <Button icon={<PencilSquareIcon className="w-4 h-4" />} size="small" type="text" onClick={() => openEdit(r)} />
              </Tooltip>
              <Popconfirm title="确认删除此系统？" onConfirm={() => handleDelete(r.id)} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <Tooltip title="删除">
                  <Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  const { mergeColumns } = useResizableColumns(rawColumns)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">系统管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">查看所有系统基本资料与部署详情</p>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={openCreate} style={{ background: '#2563eb', fontWeight: 500 }}>
            新增系统
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Input.Search
          placeholder="搜索系统名称..."
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => { setKeyword(v); loadList(1, pageSize, v, group) }}
        />
        <Select
          placeholder="分组" allowClear style={{ width: 150 }}
          value={group}
          onChange={(v) => { setGroup(v); loadList(1, pageSize, keyword, v) }}
          options={groups.map((g) => ({ value: g, label: g }))}
        />
        <div className="ml-auto">
          <Popover
            trigger="click"
            placement="bottomRight"
            content={
              <div className="flex flex-col gap-2 py-1">
                <span className="text-xs text-slate-400 font-medium px-1">显示栏位</span>
                {TOGGLEABLE_COLS.map((key) => (
                  <Checkbox key={key} checked={visibleCols.has(key)} onChange={() => toggleCol(key)}>
                    {COL_LABELS[key]}
                  </Checkbox>
                ))}
              </div>
            }
          >
            <Button icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />} size="middle">
              栏位
            </Button>
          </Popover>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-1">
        <Table<SystemItem>
          rowKey="id"
          loading={loading}
          dataSource={list}
          columns={mergeColumns}
          components={tableComponents}
          pagination={{
            current: page, pageSize, total,
            showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
            onChange: (p, s) => { setPageSize(s); loadList(p, s) },
          }}
          size="middle"
          scroll={{ x: 800 }}
        />
      </div>

      {/* Detail Drawer */}
      <Drawer
        title={detail?.sys_nm ?? '系统详情'}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={720}
        styles={{ body: { padding: '16px 24px' } }}
      >
        {detail && (
          <div className="space-y-6">
            {/* Basic Info */}
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="系统名称" span={2}>{detail.sys_nm}</Descriptions.Item>
              <Descriptions.Item label="所属分组">
                {detail.sys_group ? <Tag color="blue">{detail.sys_group}</Tag> : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="上线时间">{detail.go_live_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="系统功能介绍" span={2}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{detail.description || '—'}</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* Maintainers */}
            {detail.maintainer_names.length > 0 && (
              <>
                <Divider orientation="left" plain>维护人员</Divider>
                <div className="flex flex-wrap gap-2">
                  {detail.maintainer_names.map((u) => (
                    <div key={u.work_no} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                      <Avatar size="small" style={{ background: '#2563eb', fontSize: 10 }}>{u.name?.[0]}</Avatar>
                      <span className="text-sm text-slate-700">{u.name}</span>
                      <span className="text-xs text-slate-400">({u.work_no})</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* URLs */}
            {detail.urls.length > 0 && (
              <>
                <Divider orientation="left" plain>访问网址</Divider>
                <div className="space-y-2">
                  {detail.urls.map((u, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {u.name && <Tag color="processing">{u.name}</Tag>}
                      <Link href={u.url} target="_blank">{u.url}</Link>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Deploy Info */}
            {detail.deploy_info.length > 0 && (
              <>
                <Divider orientation="left" plain>部署详情</Divider>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">前端 IP</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">端口</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">部署路径</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">应用名（代码包）</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">后端 IP</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">端口</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">路径</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">应用名（代码包）</th>
                        <th className="border border-slate-200 px-2 py-1.5 text-left text-slate-600 font-medium">备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.deploy_info.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.fe_host || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.fe_port || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.fe_path || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.fe_app_nm || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.be_host || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.be_port || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.be_path || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-700">{row.be_app_nm || '—'}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-slate-500">{row.remark || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      {/* Create / Edit Modal */}
      <Modal
        title={editTarget ? `编辑系统 — ${editTarget.sys_nm}` : '新增系统'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editTarget ? '保存' : '创建'}
        width="min(900px, 92vw)"
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="sys_nm" label="系统名称" rules={[{ required: true, message: '请输入系统名称' }]}>
              <Input placeholder="请输入系统名称" />
            </Form.Item>
            <Form.Item name="sys_group" label="所属分组">
              <AutoComplete
                placeholder="选择或输入分组名称..."
                allowClear
                options={groups.map((g) => ({ value: g }))}
                filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="go_live_date" label="上线时间">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="maintainers" label="维护人员">
              <Select
                mode="multiple" placeholder="选择维护人员"
                options={userOptions} showSearch allowClear
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                onDropdownVisibleChange={(open) => { if (open) loadUsers() }}
              />
            </Form.Item>
          </div>
          <Form.Item name="description" label="系统功能介绍">
            <Input.TextArea rows={3} placeholder="请描述系统功能..." />
          </Form.Item>

          {/* URL List */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">访问网址</span>
              <Button
                size="small" type="dashed"
                icon={<PlusCircleIcon className="w-3.5 h-3.5" />}
                onClick={() => setUrlList([...urlList, { name: '', url: '' }])}
              >
                添加网址
              </Button>
            </div>
            <div className="space-y-2">
              {urlList.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="环境名称（如：生产）"
                    value={u.name}
                    style={{ width: 150 }}
                    onChange={(e) => {
                      const next = [...urlList]; next[i] = { ...next[i], name: e.target.value }; setUrlList(next)
                    }}
                  />
                  <Input
                    placeholder="https://..."
                    value={u.url}
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      const next = [...urlList]; next[i] = { ...next[i], url: e.target.value }; setUrlList(next)
                    }}
                  />
                  {urlList.length > 1 && (
                    <Button
                      type="text" danger size="small"
                      icon={<MinusCircleIcon className="w-4 h-4" />}
                      onClick={() => setUrlList(urlList.filter((_, j) => j !== i))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Deploy Info Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">部署详情</span>
              <Button
                size="small" type="dashed"
                icon={<PlusCircleIcon className="w-3.5 h-3.5" />}
                onClick={() => setDeployRows([...deployRows, { ...EMPTY_DEPLOY_ROW }])}
              >
                添加环境
              </Button>
            </div>
            <div className="space-y-3">
              {deployRows.map((row, i) => {
                const update = (key: keyof DeployRow, val: string) => {
                  const next = [...deployRows]; next[i] = { ...next[i], [key]: val }; setDeployRows(next)
                }
                return (
                  <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    {/* Card header */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        环境 #{i + 1}
                      </span>
                      {deployRows.length > 1 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
                          onClick={() => setDeployRows(deployRows.filter((_, j) => j !== i))}
                        >
                          <MinusCircleIcon className="w-3.5 h-3.5" />
                          删除
                        </button>
                      )}
                    </div>
                    {/* Frontend */}
                    <div className="mb-2">
                      <div className="text-xs font-medium text-blue-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        前端
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {/* IP地址 + 端口号 并排占一列区域，用 flex */}
                        <div className="flex gap-1 items-end">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-400 mb-0.5">IP地址</div>
                            <Input size="small" value={row.fe_host} onChange={(e) => update('fe_host', e.target.value)} placeholder="192.168.x.x" />
                          </div>
                          <div style={{ width: 72 }}>
                            <div className="text-xs text-slate-400 mb-0.5">端口</div>
                            <Input size="small" value={row.fe_port} onChange={(e) => update('fe_port', e.target.value)} placeholder="8080" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">部署路径</div>
                          <Input size="small" value={row.fe_path} onChange={(e) => update('fe_path', e.target.value)} placeholder="/app/xxx" />
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-0.5">应用名 <span className="text-slate-300">（代码包名称）</span></div>
                          <Input size="small" value={row.fe_app_nm} onChange={(e) => update('fe_app_nm', e.target.value)} placeholder="frontend-app.tar.gz" />
                        </div>
                      </div>
                    </div>
                    {/* Backend */}
                    <div className="mb-2">
                      <div className="text-xs font-medium text-green-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        后端
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="flex gap-1 items-end">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-400 mb-0.5">IP地址</div>
                            <Input size="small" value={row.be_host} onChange={(e) => update('be_host', e.target.value)} placeholder="192.168.x.x" />
                          </div>
                          <div style={{ width: 72 }}>
                            <div className="text-xs text-slate-400 mb-0.5">端口</div>
                            <Input size="small" value={row.be_port} onChange={(e) => update('be_port', e.target.value)} placeholder="8080" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">路径</div>
                          <Input size="small" value={row.be_path} onChange={(e) => update('be_path', e.target.value)} placeholder="/app/xxx" />
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-0.5">应用名 <span className="text-slate-300">（代码包名称）</span></div>
                          <Input size="small" value={row.be_app_nm} onChange={(e) => update('be_app_nm', e.target.value)} placeholder="backend-service.jar" />
                        </div>
                      </div>
                    </div>
                    {/* Remark */}
                    <div>
                      <div className="text-xs text-slate-400 mb-0.5">备注</div>
                      <Input
                        size="small"
                        value={row.remark}
                        onChange={(e) => update('remark', e.target.value)}
                        placeholder="请输入备注"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default SystemListPage
