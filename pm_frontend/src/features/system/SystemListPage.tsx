import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Table, Button, Input, Select, AutoComplete, Space, Tooltip, Popconfirm,
  Modal, Form, Tag, Avatar,
  Typography, Popover, Checkbox,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusIcon, PencilSquareIcon, TrashIcon, EyeIcon, PlusCircleIcon, MinusCircleIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { systemApi, type SystemItem, type SystemUrl, type DeployRow, type CreateSystemPayload } from '@/api/system.api'
import { userApi } from '@/api/user.api'
import { useAppSelector } from '@/hooks/redux'
import { showToast } from '@/utils/toast'
import { useTranslation } from 'react-i18next'
import DateInput from '@/components/common/DateInput'

const { Link } = Typography

const EMPTY_DEPLOY_ROW: DeployRow = {
  fe_host: '', fe_path: '', fe_app_nm: '', fe_port: '',
  be_host: '', be_path: '', be_app_nm: '', be_port: '',
  remark: '',
}

const SystemListPage: React.FC = () => {
  const { t } = useTranslation()
  const isAdmin  = useAppSelector((s) => s.auth.isAdmin)
  const navigate = useNavigate()
  const location = useLocation()
  const isAdminPage = location.pathname.startsWith('/admin')
  const systemBasePath = isAdminPage ? '/admin/systems' : '/systems'

  const TOGGLEABLE_COLS = ['sys_group', 'maintainer_names', 'go_live_date', 'urls'] as const
  type ColKey = typeof TOGGLEABLE_COLS[number]
  const COL_LABELS: Record<ColKey, string> = {
    sys_group:        t('system.group'),
    maintainer_names: t('system.maintainers'),
    go_live_date:     t('system.goLiveDate'),
    urls:             t('system.urls'),
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
        showToast.success(t('system.updateSuccess'))
      } else {
        await systemApi.create(payload)
        showToast.success(t('system.createSuccess'))
      }
      setFormOpen(false)
      loadList(1)
      loadGroups()
    } catch (err: unknown) { showToast.error((err as string) || t('common.error')) }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await systemApi.delete(id)
      showToast.success(t('common.deleteSuccess'))
      loadList(page)
    } catch { showToast.error(t('common.deleteFailed')) }
  }

  const rawColumns: ColumnsType<SystemItem> = [
    {
      title: t('system.name'), dataIndex: 'sys_nm', ellipsis: true, width: 260,
      render: (v: string, r) => isAdminPage
        ? <span className="font-medium text-slate-700">{v}</span>
        : <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => navigate(`${systemBasePath}/${r.id}`)}>{v}</Button>,
    },
    ...(visibleCols.has('sys_group') ? [{
      title: t('system.group'), dataIndex: 'sys_group', width: 120,
      render: (v: string) => v ? <Tag color="blue">{v}</Tag> : <span className="text-slate-300 text-xs">—</span>,
    } as ColumnsType<SystemItem>[number]] : []),
    ...(visibleCols.has('maintainer_names') ? [{
      title: t('system.maintainers'), dataIndex: 'maintainer_names', width: 180,
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
      title: t('system.goLiveDate'), dataIndex: 'go_live_date', width: 120,
      render: (v: string) => v || <span className="text-slate-300 text-xs">—</span>,
    } as ColumnsType<SystemItem>[number]] : []),
    ...(visibleCols.has('urls') ? [{
      title: t('system.urls'), dataIndex: 'urls', width: 220,
      render: (v: SystemUrl[]) => {
        if (!v?.length) return <span className="text-slate-300 text-xs">—</span>
        return (
          <div className="flex flex-col gap-0.5">
            {v.map((u, i) => (
              <div key={i} className="flex items-center gap-1 min-w-0">
                {u.name && <Tag color="processing" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', flexShrink: 0 }}>{u.name}</Tag>}
                <Tooltip title={u.url}>
                  <Link href={u.url} target="_blank" style={{ fontSize: 12 }} ellipsis>{u.url}</Link>
                </Tooltip>
              </div>
            ))}
          </div>
        )
      },
    } as ColumnsType<SystemItem>[number]] : []),
    {
      title: t('common.operation'), key: 'action', width: isAdmin ? 110 : 70, fixed: 'right',
      render: (_: unknown, r) => (
        <Space size={0}>
          {!isAdminPage && (
            <Tooltip title={t('system.viewDetail')}>
              <Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => navigate(`${systemBasePath}/${r.id}`)} />
            </Tooltip>
          )}
          {isAdmin && (
            <>
              <Tooltip title={t('common.edit')}>
                <Button icon={<PencilSquareIcon className="w-4 h-4" />} size="small" type="text" onClick={() => openEdit(r)} />
              </Tooltip>
              <Popconfirm title={t('system.confirmDelete')} onConfirm={() => handleDelete(r.id)} okText={t('common.delete')} cancelText={t('common.cancel')} okButtonProps={{ danger: true }}>
                <Tooltip title={t('common.delete')}>
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
          <h1 className="text-2xl font-bold text-slate-800">{t('system.title')}</h1>
          <p className="text-slate-400 text-sm mt-0.5">{t('system.subtitle')}</p>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
            onClick={openCreate} style={{ background: '#2563eb', fontWeight: 500 }}>
            {t('system.create')}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
        <Input.Search
          placeholder={t('system.searchPlaceholder')}
          allowClear
          style={{ width: 220 }}
          onSearch={(v) => { setKeyword(v); loadList(1, pageSize, v, group) }}
        />
        <Select
          placeholder={t('system.group')} allowClear style={{ width: 150 }}
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
                <span className="text-xs text-slate-400 font-medium px-1">{t('system.showColumns')}</span>
                {TOGGLEABLE_COLS.map((key) => (
                  <Checkbox key={key} checked={visibleCols.has(key)} onChange={() => toggleCol(key)}>
                    {COL_LABELS[key]}
                  </Checkbox>
                ))}
              </div>
            }
          >
            <Button icon={<AdjustmentsHorizontalIcon className="w-4 h-4" />} size="middle">
              {t('system.columns')}
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
            showSizeChanger: true, showTotal: (tot) => t('common.total', { count: tot }),
            onChange: (p, s) => { setPageSize(s); loadList(p, s) },
          }}
          size="middle"
          scroll={{ x: 800 }}
          {...(isAdminPage ? {
            expandable: {
              expandedRowRender: (record) => (
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm mb-4">
                    <div><span className="text-slate-400 mr-2">{t('system.name')}:</span><span className="text-slate-700 font-medium">{record.sys_nm}</span></div>
                    <div><span className="text-slate-400 mr-2">{t('system.group')}:</span><span className="text-slate-700">{record.sys_group || '—'}</span></div>
                    <div><span className="text-slate-400 mr-2">{t('system.goLiveDate')}:</span><span className="text-slate-700">{record.go_live_date || '—'}</span></div>
                    <div>
                      <span className="text-slate-400 mr-2">{t('system.maintainers')}:</span>
                      {(record.maintainer_names ?? []).length > 0
                        ? record.maintainer_names.map((u) => <Tag key={u.work_no} color="blue" style={{ fontSize: 11 }}>{u.name}</Tag>)
                        : <span className="text-slate-300">—</span>}
                    </div>
                  </div>
                  {record.description && (
                    <div className="mb-4">
                      <div className="text-slate-400 text-sm mb-1">{t('common.description')}:</div>
                      <div className="text-slate-600 text-sm bg-slate-50 rounded-lg p-3">{record.description}</div>
                    </div>
                  )}
                  {(record.urls ?? []).length > 0 && (
                    <div className="mb-4">
                      <div className="text-slate-400 text-sm mb-1">{t('system.urls')}:</div>
                      <div className="flex flex-col gap-1">
                        {record.urls.map((u, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            {u.name && <Tag color="processing" style={{ fontSize: 10, margin: 0 }}>{u.name}</Tag>}
                            <a href={u.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">{u.url}</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(record.deploy_info ?? []).length > 0 && (
                    <div>
                      <div className="text-slate-400 text-sm mb-1">{t('system.deployInfo')}:</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">#</th>
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">{t('system.frontend')} Host</th>
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">{t('system.frontend')} {t('system.path')}</th>
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">{t('system.backend')} Host</th>
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">{t('system.backend')} {t('system.path')}</th>
                              <th className="text-left px-3 py-1.5 border border-slate-200 text-slate-500">{t('common.remark')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {record.deploy_info.map((d, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1.5 border border-slate-200">{i + 1}</td>
                                <td className="px-3 py-1.5 border border-slate-200 font-mono">{d.fe_host ? `${d.fe_host}${d.fe_port ? ':' + d.fe_port : ''}` : '—'}</td>
                                <td className="px-3 py-1.5 border border-slate-200">{d.fe_path || d.fe_app_nm || '—'}</td>
                                <td className="px-3 py-1.5 border border-slate-200 font-mono">{d.be_host ? `${d.be_host}${d.be_port ? ':' + d.be_port : ''}` : '—'}</td>
                                <td className="px-3 py-1.5 border border-slate-200">{d.be_path || d.be_app_nm || '—'}</td>
                                <td className="px-3 py-1.5 border border-slate-200">{d.remark || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ),
              rowExpandable: () => true,
            },
          } : {})}
        />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editTarget ? `${t('system.editSystem')} — ${editTarget.sys_nm}` : t('system.create')}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editTarget ? t('common.save') : t('system.createBtn')}
        width="min(900px, 92vw)"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" className="mt-4">
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="sys_nm" label={t('system.name')} rules={[{ required: true, message: t('system.nameRequired') }]}>
              <Input placeholder={t('system.namePlaceholder')} />
            </Form.Item>
            <Form.Item name="sys_group" label={t('system.belongGroup')}>
              <AutoComplete
                placeholder={t('system.groupPlaceholder')}
                allowClear
                options={groups.map((g) => ({ value: g }))}
                filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="go_live_date" label={t('system.goLiveDate')}>
              <DateInput/>
            </Form.Item>
            <Form.Item name="maintainers" label={t('system.maintainers')}>
              <Select
                mode="multiple" placeholder={t('system.maintainersPlaceholder')}
                options={userOptions} showSearch allowClear
                filterOption={(input, opt) => (opt?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                onOpenChange={(open) => { if (open) loadUsers() }}
              />
            </Form.Item>
          </div>
          <Form.Item name="description" label={t('system.functionDesc')}>
            <Input.TextArea rows={3} placeholder={t('system.functionDescPlaceholder')} />
          </Form.Item>

          {/* URL List */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">{t('system.urls')}</span>
              <Button
                size="small" type="dashed"
                icon={<PlusCircleIcon className="w-3.5 h-3.5" />}
                onClick={() => setUrlList([...urlList, { name: '', url: '' }])}
              >
                {t('system.addUrl')}
              </Button>
            </div>
            <div className="space-y-2">
              {urlList.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder={t('system.envNamePlaceholder')}
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
              <span className="text-sm font-medium text-slate-700">{t('system.deployInfo')}</span>
              <Button
                size="small" type="dashed"
                icon={<PlusCircleIcon className="w-3.5 h-3.5" />}
                onClick={() => setDeployRows([...deployRows, { ...EMPTY_DEPLOY_ROW }])}
              >
                {t('system.addEnv')}
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
                        {t('system.envIndex', { index: i + 1 })}
                      </span>
                      {deployRows.length > 1 && (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600"
                          onClick={() => setDeployRows(deployRows.filter((_, j) => j !== i))}
                        >
                          <MinusCircleIcon className="w-3.5 h-3.5" />
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                    {/* Frontend */}
                    <div className="mb-2">
                      <div className="text-xs font-medium text-blue-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                        {t('system.frontend')}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {/* IP地址 + 端口号 并排占一列区域，用 flex */}
                        <div className="flex gap-1 items-end">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-400 mb-0.5">{t('system.ipAddress')}</div>
                            <Input size="small" value={row.fe_host} onChange={(e) => update('fe_host', e.target.value)} placeholder="192.168.x.x" />
                          </div>
                          <div style={{ width: 72 }}>
                            <div className="text-xs text-slate-400 mb-0.5">{t('system.port')}</div>
                            <Input size="small" value={row.fe_port} onChange={(e) => update('fe_port', e.target.value)} placeholder="8080" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">{t('system.deployPath')}</div>
                          <Input size="small" value={row.fe_path} onChange={(e) => update('fe_path', e.target.value)} placeholder="/app/xxx" />
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-0.5">{t('system.appName')} <span className="text-slate-300">({t('system.packageName')})</span></div>
                          <Input size="small" value={row.fe_app_nm} onChange={(e) => update('fe_app_nm', e.target.value)} placeholder="frontend-app.tar.gz" />
                        </div>
                      </div>
                    </div>
                    {/* Backend */}
                    <div className="mb-2">
                      <div className="text-xs font-medium text-green-600 mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        {t('system.backend')}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="flex gap-1 items-end">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-400 mb-0.5">{t('system.ipAddress')}</div>
                            <Input size="small" value={row.be_host} onChange={(e) => update('be_host', e.target.value)} placeholder="192.168.x.x" />
                          </div>
                          <div style={{ width: 72 }}>
                            <div className="text-xs text-slate-400 mb-0.5">{t('system.port')}</div>
                            <Input size="small" value={row.be_port} onChange={(e) => update('be_port', e.target.value)} placeholder="8080" />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-0.5">{t('system.path')}</div>
                          <Input size="small" value={row.be_path} onChange={(e) => update('be_path', e.target.value)} placeholder="/app/xxx" />
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-0.5">{t('system.appName')} <span className="text-slate-300">({t('system.packageName')})</span></div>
                          <Input size="small" value={row.be_app_nm} onChange={(e) => update('be_app_nm', e.target.value)} placeholder="backend-service.jar" />
                        </div>
                      </div>
                    </div>
                    {/* Remark */}
                    <div>
                      <div className="text-xs text-slate-400 mb-0.5">{t('common.remark')}</div>
                      <Input
                        size="small"
                        value={row.remark}
                        onChange={(e) => update('remark', e.target.value)}
                        placeholder={t('system.remarkPlaceholder')}
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
