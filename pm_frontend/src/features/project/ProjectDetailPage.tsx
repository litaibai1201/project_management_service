import React, { useEffect, useState, useMemo, useRef } from 'react'
import dayjs from 'dayjs'
import { renderAsync as renderDocx } from 'docx-preview'
import * as XLSX from 'xlsx'
import PptxPreview from './PptxPreview'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Tabs, Descriptions, Button, Tag, Progress, Spin, Empty, Table,
  Space, Tooltip, Popconfirm, Modal, Form, Input, Select, Steps, Avatar,
  Timeline, Card, Segmented, Collapse, AutoComplete, DatePicker, InputNumber, Divider, Upload,
} from 'antd'
import { PencilSquareIcon as EditIcon } from '@heroicons/react/24/outline'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftIcon, PlusIcon, EyeIcon, TrashIcon,
  CodeBracketIcon, UserCircleIcon, FolderIcon,
} from '@heroicons/react/24/outline'
import { useAppDispatch, useAppSelector } from '@/hooks/redux'
import { fetchProjectThunk, clearCurrent, fetchProjectGroupsThunk } from './projectSlice'
import { projectApi } from '@/api/project.api'
import { ProjectFunction, Milestone, ProjectFile } from '@/types/api.types'
import { FUNCTION_STATUS_MAP, PRIORITY_MAP } from '@/utils/status'
import { showToast } from '@/utils/toast'
import FunctionDetailDrawer from './FunctionDetailDrawer'
import GanttChart from './GanttChart'
import MilestoneTab from './MilestoneTab'

// ─── Office Preview Sub-components ────────────────────────────────────────────

const DocxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    blob.arrayBuffer().then((buf) => {
      renderDocx(buf, containerRef.current!, undefined, {
        className: 'docx-preview-body',
        inWrapper: true,
        ignoreWidth: false,
        ignoreHeight: false,
        ignoreFonts: false,
        breakPages: true,
        useBase64URL: true,
      }).catch(() => setError(true))
    })
  }, [blob])

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
      <span className="text-3xl">⚠️</span><span>文件渲染失敗，請下載後查看</span>
    </div>
  )
  return (
    <div ref={containerRef}
      style={{ padding: '16px 32px', background: '#f0f0f0', minHeight: 300 }} />
  )
}

const XlsxPreview: React.FC<{ blob: Blob }> = ({ blob }) => {
  const [sheets, setSheets] = useState<{ name: string; html: string }[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<false | 'password' | 'error'>(false)

  useEffect(() => {
    const load = async () => {
      try {
        const binary = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsBinaryString(blob)
        })
        const wb = XLSX.read(binary, { type: 'binary' })
        const STYLE = `<style>
body{font-family:sans-serif;font-size:12px;margin:8px;overflow:auto;}
table{border-collapse:collapse;}
td,th{border:1px solid #e2e8f0;padding:4px 8px;white-space:nowrap;vertical-align:top;}
th{background:#f1f5f9;font-weight:600;}
</style>`
        const result = wb.SheetNames.map((name) => {
          const ws   = wb.Sheets[name]
          // sheet_to_json with header:1 returns rows as arrays — safer than sheet_to_html
          const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
            ws, { header: 1, defval: '' }
          )
          const tbody = rows.map((row) =>
            `<tr>${row.map((cell) => `<td>${String(cell ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>`).join('')}</tr>`
          ).join('')
          const html = `<!DOCTYPE html><html><head><meta charset="utf-8">${STYLE}</head><body><table>${tbody}</table></body></html>`
          return { name, html }
        })
        setSheets(result)
      } catch (e) {
        console.error('XLSX parse error:', e)
        const msg = e instanceof Error ? e.message : ''
        setError(msg.includes('password') ? 'password' : 'error')
      }
    }
    load()
  }, [blob])

  if (error) return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
      <span className="text-3xl">⚠️</span>
      <span>{error === 'password' ? '此文件已加密，請下載後用密碼開啟' : '文件渲染失敗，請下載後查看'}</span>
    </div>
  )
  if (sheets.length === 0) return <div className="flex justify-center py-10"><Spin /></div>
  return (
    <div>
      {sheets.length > 1 && (
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '0 16px', background: '#f8fafc' }}>
          {sheets.map((s, i) => (
            <button key={s.name} onClick={() => setActive(i)}
              style={{
                padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                borderBottom: i === active ? '2px solid #2563eb' : '2px solid transparent',
                color: i === active ? '#2563eb' : '#64748b', fontSize: 13, fontWeight: i === active ? 600 : 400,
              }}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <iframe
        srcDoc={sheets[active]?.html}
        title="xlsx-preview"
        style={{ width: '100%', height: '68vh', border: 'none', display: 'block' }}
      />
    </div>
  )
}

const PRIORITY_OPTIONS = [
  { value: 1, label: '低' }, { value: 2, label: '中' },
  { value: 3, label: '高' }, { value: 4, label: '緊急' },
]

const PRIORITY_COLORS = ['', '#22c55e', '#f59e0b', '#ef4444', '#7c3aed']

// ─── Status Steps ─────────────────────────────────────────────────────────────
const STATUS_STEPS = [
  { title: '草稿',     statuses: [1] },
  { title: '立案審核', statuses: [2] },
  { title: '規劃中',   statuses: [3] },
  { title: '規劃審核', statuses: [4] },
  { title: '執行中',   statuses: [5] },
  { title: '完結審核', statuses: [6] },
  { title: '已完結',   statuses: [7] },
]

const getStepIndex = (status: number) => {
  const idx = STATUS_STEPS.findIndex((s) => s.statuses.includes(status))
  return idx >= 0 ? idx : 0
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ProjectDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { current, isLoading, groups } = useAppSelector((s) => s.project)
  const workNo = useAppSelector((s) => s.auth.workNo) ?? ''
  const { isAdmin, isSupervisor } = useAppSelector((s) => s.auth)
  const canManageGroups = isAdmin || isSupervisor

  const [functions,       setFunctions]       = useState<ProjectFunction[]>([])
  const [funcView,        setFuncView]         = useState<'all' | 'mine'>('all')
  const [funcGroupMode,   setFuncGroupMode]    = useState<'flat' | 'grouped'>('grouped')
  const [funcLoading,     setFuncLoading]      = useState(false)
  const [dynamics,        setDynamics]         = useState<Record<string, unknown>[]>([])
  const [milestones,      setMilestones]       = useState<Milestone[]>([])
  const [files,           setFiles]            = useState<ProjectFile[]>([])
  const [filesLoading,    setFilesLoading]     = useState(false)
  const [uploading,       setUploading]        = useState(false)
  const [preview,         setPreview]          = useState<{
    file: ProjectFile; blobUrl?: string; blob?: Blob; text?: string; loading: boolean
  } | null>(null)
  const [selectedFid,     setSelectedFid]      = useState<string | null>(null)
  const [showAddFunc,     setShowAddFunc]      = useState(false)
  const [addFuncLoading,  setAddFuncLoading]   = useState(false)
  const [funcForm]                             = Form.useForm()

  // ── 编辑专案 ──────────────────────────────────────────────────────────────
  const [showEdit,        setShowEdit]        = useState(false)
  const [editSaving,      setEditSaving]      = useState(false)
  const [editForm]                            = Form.useForm()
  const [newGroupName,    setNewGroupName]    = useState('')
  const [creatingGroup,   setCreatingGroup]   = useState(false)

  // ── 提交审核 ──────────────────────────────────────────────────────────────
  const [showSubmit,    setShowSubmit]    = useState(false)
  const [submitSaving,  setSubmitSaving]  = useState(false)
  const [submitForm]                      = Form.useForm()

  useEffect(() => {
    if (id) {
      dispatch(fetchProjectThunk(id))
      loadFunctions(id)
      loadDynamics(id)
      loadMilestones(id)
      loadFiles(id)
    }
    return () => { dispatch(clearCurrent()) }
  }, [id, dispatch])

  const loadFunctions = async (pid: string) => {
    setFuncLoading(true)
    try {
      const res = await projectApi.functionList(pid, { page: 1, size: 100 })
      const c = res.content as { project_list?: ProjectFunction[]; data_list?: ProjectFunction[] }
      setFunctions((c.project_list ?? c.data_list ?? []) as ProjectFunction[])
    } catch { /* global */ }
    finally { setFuncLoading(false) }
  }

  const loadDynamics = async (pid: string) => {
    try {
      const res = await projectApi.memberDynamics(pid, { page: 1, size: 20 })
      const c = res.content as { data_list?: Record<string, unknown>[] }
      setDynamics((c.data_list ?? []) as Record<string, unknown>[])
    } catch { /* global */ }
  }

  const loadMilestones = async (pid: string) => {
    try {
      const res = await projectApi.getMilestones(pid)
      setMilestones(Array.isArray(res.content) ? (res.content as Milestone[]) : [])
    } catch { /* global */ }
  }

  const loadFiles = async (pid: string) => {
    setFilesLoading(true)
    try {
      const res = await projectApi.listFiles(pid)
      setFiles(Array.isArray(res.content) ? (res.content as ProjectFile[]) : [])
    } catch { /* global */ }
    finally { setFilesLoading(false) }
  }

  const handleUploadFile = async (file: File) => {
    if (!id) return false
    setUploading(true)
    try {
      await projectApi.uploadFile(id, file)
      showToast.success('上傳成功')
      loadFiles(id)
    } catch { showToast.error('上傳失敗') }
    finally { setUploading(false) }
    return false // 阻止 antd Upload 自動提交
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!id) return
    try {
      await projectApi.deleteFile(id, fileId)
      showToast.success('已刪除')
      setFiles((prev) => prev.filter((f) => f.id !== fileId))
    } catch { showToast.error('刪除失敗') }
  }

  const IMAGE_EXTS  = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
  const PDF_EXTS    = new Set(['pdf'])
  const TEXT_EXTS   = new Set(['txt', 'md', 'yaml', 'yml', 'csv'])
  const HTML_EXTS   = new Set(['html', 'htm'])
  const DOCX_EXTS   = new Set(['docx'])
  const XLSX_EXTS   = new Set(['xlsx', 'xls'])
  const PPTX_EXTS   = new Set(['pptx', 'ppt'])
  const DOC_LEGACY  = new Set(['doc', 'ppt', 'xls'])   // legacy binary — no client-side renderer
  const PREVIEWABLE = new Set([...IMAGE_EXTS, ...PDF_EXTS, ...TEXT_EXTS, ...HTML_EXTS, ...DOCX_EXTS, ...XLSX_EXTS, ...PPTX_EXTS, ...DOC_LEGACY])

  const handlePreview = async (file: ProjectFile) => {
    const ext = file.file_ext.toLowerCase()
    setPreview({ file, loading: true })
    try {
      if (TEXT_EXTS.has(ext)) {
        const text = await projectApi.previewFileAsText(id!, file.id)
        setPreview({ file, text, loading: false })
      } else if (IMAGE_EXTS.has(ext) || PDF_EXTS.has(ext) || HTML_EXTS.has(ext)) {
        const blobUrl = await projectApi.previewFileAsBlob(id!, file.id)
        setPreview({ file, blobUrl, loading: false })
      } else if (DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext)) {
        const blob = await projectApi.previewFileRawBlob(id!, file.id)
        setPreview({ file, blob, loading: false })
      } else {
        setPreview({ file, loading: false })
      }
    } catch {
      showToast.error('預覽失敗')
      setPreview(null)
    }
  }

  const closePreview = () => {
    if (preview?.blobUrl) URL.revokeObjectURL(preview.blobUrl)
    setPreview(null)
  }

  const handleAddFunction = async (values: Record<string, unknown>) => {
    if (!id) return
    setAddFuncLoading(true)
    try {
      await projectApi.addFunction(id, {
        function_nm: values.function_nm as string,
        describe:    values.describe as string | undefined,
        priority:    values.priority as number,
        group1:      values.group1 as string,
        expected_start_date: values.expected_start_date as string | undefined,
        expected_end_date:   values.expected_end_date as string | undefined,
      })
      showToast.success('功能新增成功')
      setShowAddFunc(false); funcForm.resetFields(); loadFunctions(id)
    } catch { /* global */ }
    finally { setAddFuncLoading(false) }
  }

  const handleDeleteFunction = async (fid: string) => {
    if (!id) return
    try {
      await projectApi.deleteFunction(id, fid)
      showToast.success('功能刪除成功'); loadFunctions(id)
    } catch { /* global */ }
  }

  const handleEditOpen = () => {
    if (!current) return
    dispatch(fetchProjectGroupsThunk())
    editForm.setFieldsValue({
      project_nm:        current.project_nm,
      department:        current.department,
      project_pm:        current.project_pm,
      product_pm:        current.product_pm,
      priority:          current.priority,
      group_id:          current.group_id,
      expected_end_date: current.expected_end_date,
      code_url:          current.code_url,
      expected_benefit:  current.expected_benefit,
      describe:          current.describe,
    })
    setNewGroupName('')
    setShowEdit(true)
  }

  const handleCreateGroup = async () => {
    const nm = newGroupName.trim()
    if (!nm) return
    setCreatingGroup(true)
    try {
      await projectApi.createGroup(nm)
      await dispatch(fetchProjectGroupsThunk())
      setNewGroupName('')
      showToast.success(`分組「${nm}」已建立`)
    } catch {
      showToast.error('建立分組失敗')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleEditSave = async (values: Record<string, unknown>) => {
    if (!id) return
    setEditSaving(true)
    try {
      await projectApi.update(id, values as Parameters<typeof projectApi.update>[1])
      showToast.success('專案已更新')
      setShowEdit(false)
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setEditSaving(false) }
  }

  const handleSubmitReview = async (values: { reviewer: string }) => {
    if (!id || !current) return
    setSubmitSaving(true)
    try {
      // 草稿(1) → 提交立案審核(status=2)；規劃中(3) → 提交規劃審核(status=4)
      const targetStatus = current.status === 1 ? 2 : 4
      await projectApi.submitForReview(id, [values.reviewer], targetStatus)
      showToast.success('已提交審核')
      setShowSubmit(false)
      dispatch(fetchProjectThunk(id))
    } catch { /* global */ }
    finally { setSubmitSaving(false) }
  }

  const myFunctions = useMemo(
    () => functions.filter((f) => (f.developers ?? '').split(';').some((d) => d.trim() === workNo)),
    [functions, workNo],
  )
  const displayedFunctions = funcView === 'mine' ? myFunctions : functions

  // Group-related computed data
  const existingGroups = useMemo(
    () => Array.from(new Set(functions.map((f) => f.group1).filter(Boolean))),
    [functions],
  )
  const groupAutoOptions = useMemo(
    () => existingGroups.map((g) => ({ value: g, label: g })),
    [existingGroups],
  )
  const groupedFunctions = useMemo(() => {
    const map = new Map<string, ProjectFunction[]>()
    displayedFunctions.forEach((f) => {
      const g = f.group1 || '未分組'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(f)
    })
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items,
      count: items.length,
      avgProgress: Math.round(items.reduce((s, f) => s + (f.progress ?? 0), 0) / items.length),
      overdueCount: items.filter((f) => f.expected_end_date && new Date(f.expected_end_date) < new Date() && f.status !== 4).length,
    }))
  }, [displayedFunctions])

  const funcColumns: ColumnsType<ProjectFunction> = [
    {
      title: '功能名稱', dataIndex: 'function_nm',
      render: (name: string, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 24, borderRadius: 2, flexShrink: 0, background: PRIORITY_COLORS[r.priority] }} />
          <Button type="link" style={{ padding: 0, fontWeight: 500 }} onClick={() => setSelectedFid(r.id)}>{name}</Button>
        </div>
      ),
    },
    {
      title: '狀態', dataIndex: 'status', width: 110,
      render: (v: number) => {
        const s = FUNCTION_STATUS_MAP[v]
        return s ? <div className="flex items-center gap-1.5"><span className="status-dot" style={{ background: ['#94a3b8','#2563eb','#d97706','#16a34a','','#f59e0b','','','#94a3b8','#dc2626'][v] ?? '#94a3b8' }} /><span className="text-sm">{s.label}</span></div> : v
      },
    },
    {
      title: '優先級', dataIndex: 'priority', width: 80,
      render: (v: number) => { const p = PRIORITY_MAP[v]; return p ? <Tag color={p.color} style={{ fontSize: 11 }}>{p.label}</Tag> : v },
    },
    {
      title: '進度', dataIndex: 'progress', width: 140,
      render: (v: number) => (
        <div className="flex items-center gap-2">
          <Progress percent={v ?? 0} size="small" showInfo={false} style={{ flex: 1 }} strokeColor="#2563eb" trailColor="#f1f5f9" />
          <span className="text-xs text-slate-400">{v ?? 0}%</span>
        </div>
      ),
    },
    { title: '預計完成', dataIndex: 'expected_end_date', width: 110 },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0}>
          <Tooltip title="查看"><Button icon={<EyeIcon className="w-4 h-4" />} size="small" type="text" onClick={() => setSelectedFid(record.id)} /></Tooltip>
          <Popconfirm title="確認刪除？" onConfirm={() => handleDeleteFunction(record.id)} okText="確認" cancelText="取消">
            <Tooltip title="刪除"><Button icon={<TrashIcon className="w-4 h-4" />} size="small" type="text" danger /></Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spin size="large" /></div>
  if (!current)  return <Empty description="專案不存在" className="mt-20" />

  const stepIndex = getStepIndex(current.status)

  return (
    <div className="p-6">
      {/* Back + Title */}
      <div className="flex items-start gap-3 mb-5">
        <Button icon={<ArrowLeftIcon className="w-4 h-4" />} onClick={() => navigate(-1)} type="text" className="mt-1" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800">{current.project_nm}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <Tag color="blue" style={{ fontSize: 12 }}>{current.department}</Tag>
            {current.product_pm && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <UserCircleIcon className="w-3.5 h-3.5" /> 産品：{current.product_pm}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <UserCircleIcon className="w-3.5 h-3.5" /> 專案：{current.project_pm}
            </div>
            {current.code_url && (
              <a href={current.code_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                <CodeBracketIcon className="w-3.5 h-3.5" /> 代碼庫
              </a>
            )}
          </div>
        </div>
        {/* 操作按鈕 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* 草稿且有權限才可編輯（産品PM或其直屬上級） */}
          {current.status === 1 && current.can_edit && (
            <Button icon={<EditIcon className="w-4 h-4" />} onClick={handleEditOpen}>
              編輯
            </Button>
          )}
          {/* 提交立案審核：僅草稿階段且當前用戶是産品PM */}
          {current.status === 1 && current.can_submit_review && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => setShowSubmit(true)}>
              提交立案審核
            </Button>
          )}
          {/* 提交規劃審核：規劃中階段 */}
          {current.status === 3 && (
            <Button type="primary" style={{ background: '#2563eb' }} onClick={() => setShowSubmit(true)}>
              提交規劃審核
            </Button>
          )}
        </div>
      </div>

      {/* Status progress steps */}
      <Card variant="borderless" className="shadow-sm mb-5" styles={{ body: { padding: '20px 28px' } }}>
        <Steps
          current={stepIndex}
          size="small"
          items={STATUS_STEPS.map((s, i) => ({
            title: <span style={{ fontSize: 12 }}>{s.title}</span>,
            status: i < stepIndex ? 'finish' : i === stepIndex ? 'process' : 'wait',
          }))}
        />
        {current.progress != null && (
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-slate-400 w-14">整體進度</span>
            <Progress percent={current.progress} size="small" strokeColor="#2563eb" trailColor="#f1f5f9" style={{ flex: 1 }} />
          </div>
        )}
      </Card>

      {/* Tabs */}
      <Tabs
        type="card"
        items={[
          {
            key: 'info',
            label: '基本資訊',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 24 } }}>
                <Descriptions bordered column={2} size="small"
                  labelStyle={{ background: '#f8fafc', color: '#64748b', fontWeight: 500, fontSize: 12 }}
                  contentStyle={{ fontSize: 13 }}
                >
                  <Descriptions.Item label="優先級">
                    {(() => { const p = PRIORITY_MAP[current.priority]; return p ? <Tag color={p.color}>{p.label}</Tag> : current.priority })()}
                  </Descriptions.Item>
                  <Descriptions.Item label="建立人">{current.creator}</Descriptions.Item>
                  <Descriptions.Item label="産品PM">{current.product_pm}</Descriptions.Item>
                  <Descriptions.Item label="專案PM">{current.project_pm}</Descriptions.Item>
                  <Descriptions.Item label="預計完成">{current.expected_end_date ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="建立時間">{current.created_at}</Descriptions.Item>
                  <Descriptions.Item label="描述" span={2}>{current.describe ?? '—'}</Descriptions.Item>
                </Descriptions>
              </Card>
            ),
          },
          {
            key: 'functions',
            label: `功能任務 (${functions.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 0 } }}>
                <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Segmented
                      size="small"
                      value={funcView}
                      onChange={(v) => setFuncView(v as 'all' | 'mine')}
                      options={[
                        { label: `全部 (${functions.length})`, value: 'all'  },
                        { label: `我的 (${myFunctions.length})`,     value: 'mine' },
                      ]}
                    />
                    <div className="w-px h-5 bg-slate-200" />
                    <Segmented
                      size="small"
                      value={funcGroupMode}
                      onChange={(v) => setFuncGroupMode(v as 'flat' | 'grouped')}
                      options={[
                        { label: '分組', value: 'grouped' },
                        { label: '平面', value: 'flat'    },
                      ]}
                    />
                  </div>
                  <Button type="primary" icon={<PlusIcon className="w-4 h-4" />}
                    onClick={() => setShowAddFunc(true)} size="small" style={{ background: '#2563eb' }}>
                    新增功能
                  </Button>
                </div>

                {funcGroupMode === 'flat' ? (
                  <Table rowKey="id" columns={funcColumns} dataSource={displayedFunctions}
                    loading={funcLoading} pagination={{ pageSize: 10 }} size="middle" scroll={{ x: 800 }} />
                ) : (
                  <div className="px-2 py-2">
                    {funcLoading ? (
                      <div className="flex justify-center py-8"><Spin /></div>
                    ) : groupedFunctions.length === 0 ? (
                      <Empty description="暫無功能任務" className="py-8" />
                    ) : (
                      <Collapse
                        defaultActiveKey={groupedFunctions.map((g) => g.name)}
                        className="bg-transparent border-0"
                        expandIconPosition="start"
                      >
                        {groupedFunctions.map((g) => (
                          <Collapse.Panel
                            key={g.name}
                            header={
                              <div className="flex items-center gap-3">
                                <FolderIcon className="w-4 h-4 text-blue-500" />
                                <span className="font-semibold text-slate-700">{g.name}</span>
                                <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>{g.count} 項</Tag>
                                <Progress
                                  percent={g.avgProgress} size="small" showInfo={false}
                                  style={{ width: 80 }} strokeColor="#2563eb" trailColor="#e2e8f0"
                                />
                                <span className="text-xs text-slate-400">{g.avgProgress}%</span>
                                {g.overdueCount > 0 && (
                                  <Tag color="error" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
                                    超時 {g.overdueCount}
                                  </Tag>
                                )}
                              </div>
                            }
                          >
                            <Table rowKey="id" columns={funcColumns} dataSource={g.items}
                              pagination={false} size="small" scroll={{ x: 800 }} />
                          </Collapse.Panel>
                        ))}
                      </Collapse>
                    )}
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'dynamics',
            label: '成員動態',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: '16px 24px' } }}>
                {dynamics.length === 0 ? (
                  <Empty description="暫無動態記錄" />
                ) : (
                  <Timeline
                    items={dynamics.map((d) => ({
                      dot: (
                        <Avatar size={24} style={{ background: '#2563eb', fontSize: 11, fontWeight: 600 }}>
                          {String(d.operator ?? '?')[0]?.toUpperCase()}
                        </Avatar>
                      ),
                      children: (
                        <div>
                          <span className="font-medium text-slate-700 text-sm">{String(d.operator ?? '')}</span>
                          <span className="text-slate-400 text-sm"> · {String(d.action ?? '')}</span>
                          <div className="text-xs text-slate-300 mt-0.5">{String(d.created_at ?? '')}</div>
                        </div>
                      ),
                    }))}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'gantt',
            label: '甘特圖',
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 16 } }}>
                <GanttChart functions={functions} milestones={milestones} />
              </Card>
            ),
          },
          {
            key: 'milestones',
            label: `里程碑 (${milestones.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: 20 } }}>
                {id && <MilestoneTab projectId={id} functions={functions} />}
              </Card>
            ),
          },
          {
            key: 'files',
            label: `附件 (${files.length})`,
            children: (
              <Card variant="borderless" className="shadow-sm" styles={{ body: { padding: '16px 24px' } }}>
                {/* 上傳區域：僅草稿且有編輯權限 */}
                {current.status === 1 && current.can_edit && (
                  <Upload
                    showUploadList={false}
                    beforeUpload={(file) => {
                      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
                      const LEGACY = { doc: '.docx', ppt: '.pptx', xls: '.xlsx' } as Record<string, string>
                      if (LEGACY[ext]) {
                        showToast.error(`不支持 .${ext} 格式，請另存為 ${LEGACY[ext]} 後再上傳`)
                        return false
                      }
                      handleUploadFile(file)
                      return false
                    }}
                    accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.yaml,.yml,.csv,.html,.htm"
                    disabled={uploading}
                  >
                    <Button
                      icon={<PlusIcon className="w-4 h-4" />}
                      loading={uploading}
                      className="mb-4"
                    >
                      上傳附件
                    </Button>
                  </Upload>
                )}

                {/* 附件列表 */}
                {filesLoading ? (
                  <Spin />
                ) : files.length === 0 ? (
                  <Empty description="暫無附件" />
                ) : (
                  <Table
                    rowKey="id"
                    dataSource={files}
                    size="small"
                    pagination={false}
                    columns={[
                      {
                        title: '文件名',
                        dataIndex: 'file_nm',
                        render: (name: string, record) => {
                          const ext = record.file_ext.toLowerCase()
                          const canPreview = PREVIEWABLE.has(ext)
                          return (
                            <div className="flex items-center gap-2">
                              {canPreview ? (
                                <Button type="link" style={{ padding: 0 }}
                                  onClick={() => handlePreview(record)}>
                                  {name}
                                </Button>
                              ) : (
                                <span className="text-slate-700 text-sm">{name}</span>
                              )}
                            </div>
                          )
                        },
                      },
                      {
                        title: '類型',
                        dataIndex: 'file_ext',
                        width: 70,
                        render: (v: string) => <Tag style={{ fontSize: 11 }}>{v.toUpperCase()}</Tag>,
                      },
                      {
                        title: '大小',
                        dataIndex: 'file_size',
                        width: 90,
                        render: (v: number) => {
                          if (v >= 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`
                          if (v >= 1024) return `${(v / 1024).toFixed(1)} KB`
                          return `${v} B`
                        },
                      },
                      { title: '上傳人', dataIndex: 'uploader', width: 100 },
                      { title: '上傳時間', dataIndex: 'created_at', width: 140 },
                      {
                        title: '操作',
                        width: 120,
                        render: (_: unknown, record) => (
                          <Space size={0}>
                            <Tooltip title="下載">
                              <a href={projectApi.getFileDownloadUrl(id!, record.id)}
                                target="_blank" rel="noreferrer">
                                <Button type="text" size="small"
                                  icon={<EyeIcon className="w-4 h-4" />} />
                              </a>
                            </Tooltip>
                            {current.status === 1 && current.can_edit && (
                              <Popconfirm
                                title="確認刪除此附件？"
                                onConfirm={() => handleDeleteFile(record.id)}
                                okText="確認" cancelText="取消"
                              >
                                <Tooltip title="刪除">
                                  <Button type="text" size="small" danger
                                    icon={<TrashIcon className="w-4 h-4" />} />
                                </Tooltip>
                              </Popconfirm>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      {/* 附件預覽 Modal */}
      {preview && (() => {
        const ext = preview.file.file_ext.toLowerCase()
        const isWide = PDF_EXTS.has(ext) || HTML_EXTS.has(ext) || DOCX_EXTS.has(ext) || XLSX_EXTS.has(ext) || PPTX_EXTS.has(ext)
        return (
          <Modal
            open
            title={preview.file.file_nm}
            onCancel={closePreview}
            footer={
              <a href={projectApi.getFileDownloadUrl(id!, preview.file.id)}
                target="_blank" rel="noreferrer">
                <Button>下載</Button>
              </a>
            }
            width={isWide ? '85vw' : 700}
            styles={{ body: { padding: 0, maxHeight: '78vh', overflow: 'auto' } }}
          >
            {preview.loading ? (
              <div className="flex justify-center items-center py-16"><Spin size="large" /></div>
            ) : IMAGE_EXTS.has(ext) && preview.blobUrl ? (
              <div className="flex justify-center p-4 bg-slate-50">
                <img src={preview.blobUrl} alt={preview.file.file_nm}
                  style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} />
              </div>
            ) : PDF_EXTS.has(ext) && preview.blobUrl ? (
              <iframe src={preview.blobUrl} title={preview.file.file_nm}
                style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }} />
            ) : HTML_EXTS.has(ext) && preview.blobUrl ? (
              <iframe src={preview.blobUrl} title={preview.file.file_nm} sandbox="allow-same-origin"
                style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }} />
            ) : TEXT_EXTS.has(ext) && preview.text !== undefined ? (
              <pre style={{
                margin: 0, padding: '16px 20px', fontSize: 13, lineHeight: 1.6,
                fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                background: '#f8fafc', minHeight: 200,
              }}>
                {preview.text}
              </pre>
            ) : DOCX_EXTS.has(ext) && preview.blob ? (
              <DocxPreview blob={preview.blob} />
            ) : XLSX_EXTS.has(ext) && preview.blob ? (
              <XlsxPreview blob={preview.blob} />
            ) : PPTX_EXTS.has(ext) && preview.blob ? (
              <PptxPreview blob={preview.blob} />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                <span className="text-4xl">📄</span>
                <span>此文件類型不支持預覽，請下載後查看</span>
              </div>
            )}
          </Modal>
        )
      })()}

      {/* Add Function Modal */}
      <Modal title="新增功能任務" open={showAddFunc}
        onCancel={() => { setShowAddFunc(false); funcForm.resetFields() }}
        footer={null} width={520} destroyOnHidden>
        <Form form={funcForm} layout="vertical" onFinish={handleAddFunction} className="mt-4">
          <Form.Item name="function_nm" label="功能名稱" rules={[{ required: true }]}>
            <Input placeholder="請輸入功能名稱" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]} initialValue={2}>
              <Select options={[{value:1,label:'低'},{value:2,label:'中'},{value:3,label:'高'},{value:4,label:'緊急'}]} />
            </Form.Item>
            <Form.Item name="group1" label="任務分組" rules={[{ required: true }]}>
              <AutoComplete
                options={groupAutoOptions}
                placeholder="選擇或輸入分組名稱"
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="expected_start_date" label="預計開始"><Input type="date" /></Form.Item>
            <Form.Item name="expected_end_date"   label="預計結束"><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="describe" label="功能描述">
            <Input.TextArea rows={3} placeholder="請描述功能需求" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => { setShowAddFunc(false); funcForm.resetFields() }}>取消</Button>
            <Button type="primary" htmlType="submit" loading={addFuncLoading} style={{ background: '#2563eb' }}>新增</Button>
          </div>
        </Form>
      </Modal>

      {/* Function Detail Drawer */}
      {selectedFid && id && (
        <FunctionDetailDrawer projectId={id} functionId={selectedFid}
          open={!!selectedFid} onClose={() => setSelectedFid(null)}
          onRefresh={() => loadFunctions(id)} />
      )}

      {/* 編輯專案 Modal */}
      <Modal title="編輯專案" open={showEdit} onCancel={() => setShowEdit(false)}
        footer={null} width={600} destroyOnHidden>
        <Form form={editForm} layout="vertical" onFinish={handleEditSave} className="mt-4">
          <Form.Item name="project_nm" label="專案名稱" rules={[{ required: true }]} className="col-span-2">
            <Input />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="department" label="部門" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="priority" label="優先級" rules={[{ required: true }]}>
              <Select options={PRIORITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="project_pm" label="專案PM（工號）" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="product_pm" label="産品PM（工號）">
              <Input placeholder="（可空，預設與建立人相同）" />
            </Form.Item>
            <Form.Item name="group_id" label="專案分組" rules={[{ required: true, message: '請選擇專案分組' }]}>
              <Select
                options={groups.map((g) => ({ value: g.id, label: g.group_nm }))}
                placeholder="請選擇分組"
                popupRender={canManageGroups ? (menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '8px 0' }} />
                    <Space style={{ padding: '0 8px 8px' }}>
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateGroup() } }}
                        placeholder="輸入新分組名稱"
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, outline: 'none' }}
                      />
                      <Button type="text" icon={<span>+</span>} loading={creatingGroup}
                        onClick={handleCreateGroup} disabled={!newGroupName.trim()} size="small">
                        新建分組
                      </Button>
                    </Space>
                  </>
                ) : undefined}
              />
            </Form.Item>
            <Form.Item name="expected_end_date" label="預計完成日期"
              getValueProps={(v) => ({ value: v ? dayjs(v) : null })}
              getValueFromEvent={(date) => date ? date.format('YYYY-MM-DD') : ''}>
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="code_url" label="代碼庫地址" className="col-span-2">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="benefit_amount" label="預估效益金額">
              <InputNumber
                style={{ width: '100%' }} placeholder="預估節省/產生的金額"
                min={0} suffix="元/年"
              />
            </Form.Item>
            <Form.Item name="expected_benefit" label="效益說明">
              <Input.TextArea rows={2} placeholder="例：預計減少人工作業30%，每年節省約50萬元" />
            </Form.Item>
          </div>
          <Form.Item name="describe" label="專案描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowEdit(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={editSaving} style={{ background: '#2563eb' }}>保存</Button>
          </div>
        </Form>
      </Modal>

      {/* 提交審核 Modal */}
      <Modal
        title={current.status === 1 ? '提交立案審核' : '提交規劃審核'}
        open={showSubmit} onCancel={() => setShowSubmit(false)}
        footer={null} width={420} destroyOnHidden>
        <Form form={submitForm} layout="vertical" onFinish={handleSubmitReview} className="mt-4">
          <Form.Item name="reviewer" label="審核人（工號）" rules={[{ required: true, message: '請填寫審核人工號' }]}
            extra="填寫直屬主管的工號，審核通過後專案將進入下一階段">
            <Input placeholder="請輸入審核人工號" />
          </Form.Item>
          <div className="flex justify-end gap-3">
            <Button onClick={() => setShowSubmit(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={submitSaving} style={{ background: '#2563eb' }}>提交</Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default ProjectDetailPage
