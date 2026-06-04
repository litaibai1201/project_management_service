import React, { useEffect, useState, useMemo } from 'react'
import {
  Tabs, Table, Button, Tag, Modal, Form, Input, Select, Space,
  Avatar, Badge, Tooltip, Drawer, Spin, Empty, DatePicker,
} from 'antd'
import type { Dayjs } from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import {
  CheckIcon, XMarkIcon, ArrowUturnLeftIcon, UserPlusIcon, EyeIcon,
  CheckCircleIcon, InformationCircleIcon, PaperClipIcon,
  ArrowDownTrayIcon, PlusIcon, MagnifyingGlassIcon, FunnelIcon,
} from '@heroicons/react/24/outline'
import { useLocation } from 'react-router-dom'
import { useResizableColumns, tableComponents } from '@/hooks/useResizableColumns'
import { projectApi, requirementApi } from '@/api/project.api'
import { dutyApi } from '@/api/duty.api'
import { userApi } from '@/api/user.api'
import { standaloneReqApi, type StandaloneReq } from '@/api/standalone_req.api'
import { systemApi, type SystemItem } from '@/api/system.api'
import { ApplyRecord, Project, ProjectFile, ProjectFunction, ProgressRecord, FileInfo, ReviewPayload, Requirement, TemporaryDuty } from '@/types/api.types'
import { PRIORITY_MAP , benefitUnitLabel } from '@/utils/status'
import { showToast } from '@/utils/toast'
import FilePreviewModal from './FilePreviewModal'
import { tokenStorage } from '@/api/httpClient'
import { useWorkNoToName } from '@/hooks/useWorkNoToName'
import RichTextContent from '@/components/common/RichTextContent'
import WbsTable from '@/components/common/WbsTable'
import DutyWbsTable from '@/components/common/DutyWbsTable'
import { useTranslation } from 'react-i18next'

// ─── Constants ────────────────────────────────────────────────────────────────

const REVIEW_STATUS_COLOR: Record<number, string> = {
  1: 'processing', 2: 'success', 3: 'error', 4: 'warning',
}

const STAMP_COLORS: Record<number, string> = {
  1: '#2563eb',
  2: '#16a34a',
  3: '#dc2626',
  4: '#d97706',
}

const APPLY_TYPE_COLOR: Record<string, string> = {
  initiate:            'blue',
  plan:                'geekblue',
  schedule:            'purple',
  function_complete:   'cyan',
  function_completion: 'cyan',   // alias — 兼容旧记录
  project_complete:    'green',
  duty_complete:       'volcano',
  duty_completion:     'volcano',  // 兼容旧记录
  requirement_change:  'orange',
  requirement_review:           'purple',
  requirement_batch_review:     'purple',
  requirement_shelve:           'gold',
  task_addition_review:         'cyan',
  standalone_req_review:        'magenta',
  standalone_req_batch_review:  'magenta',
  req_task_addition_review:     'blue',
}

// 一個頁籤 key 可能對應多個 apply_type_code（如需求審核 = 單條 + 批量）
const TAB_CODES: Record<string, string[]> = {
  requirement_review: [
    'requirement_review', 'requirement_batch_review',
    'standalone_req_review', 'standalone_req_batch_review',
  ],
}
const tabMatchesCodes = (tabKey: string, code: string) =>
  TAB_CODES[tabKey] ? TAB_CODES[tabKey].includes(code) : code === tabKey

const REVIEW_TAB_KEYS = [
  'all', 'initiate', 'plan', 'schedule', 'function_complete',
  'project_complete', 'duty_complete', 'requirement_review',
  'task_addition_review', 'req_task_addition_review',
]

// ─── 每種審批類型需要展示的附件分類 ──────────────────────────────────────────────
const STAGE_FILES: Record<string, string[]> = {
  initiate:           ['requirement'],
  plan:               ['requirement', 'design'],
  function_complete:  ['progress'],
  project_complete:   ['requirement', 'design', 'progress', 'other'],
  requirement_change: ['requirement', 'design'],
  duty_complete:      [],
}


// ─── ReviewerChain ────────────────────────────────────────────────────────────

const CHAIN_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

type ChainPerson = { work_no: string; name: string }

const ReviewerChain: React.FC<{
  value: ChainPerson[]
  onChange: (v: ChainPerson[]) => void
  userOptions: { value: string; label: string }[]
  maxCount?: number
}> = ({ value, onChange, userOptions, maxCount = 5 }) => {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)

  const addPerson = (workNo: string) => {
    const name = userOptions.find((u) => u.value === workNo)?.label ?? workNo
    if (!value.some((v) => v.work_no === workNo)) {
      onChange([...value, { work_no: workNo, name }])
    }
    setAdding(false)
  }

  const removePerson = (workNo: string) => onChange(value.filter((v) => v.work_no !== workNo))

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {value.map((person, i) => (
        <div key={person.work_no} className="flex items-center gap-1">
          <Tooltip title={t('review.chainPersonTooltip', { order: i + 1, name: person.name })} placement="top">
            <div className="relative group cursor-pointer select-none" onClick={() => removePerson(person.work_no)}>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm transition-transform group-hover:scale-95"
                style={{ background: CHAIN_COLORS[i % CHAIN_COLORS.length] }}
              >
                {person.name.charAt(0)}
              </div>
              {/* 序号 */}
              <div className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 leading-none">
                {i + 1}
              </div>
              {/* 移除遮罩 */}
              <div className="absolute inset-0 rounded-full bg-red-500 bg-opacity-0 group-hover:bg-opacity-75 flex items-center justify-center transition-all">
                <XMarkIcon className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          </Tooltip>
          {/* 虚线连接器 */}
          <div className="flex items-center gap-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
            <div className="w-3 border-t border-dashed border-slate-300" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 opacity-50" />
          </div>
        </div>
      ))}

      {value.length < maxCount && (
        adding ? (
          <Select
            autoFocus
            size="small"
            style={{ width: 130 }}
            placeholder={t('review.selectPerson')}
            showSearch
            optionFilterProp="label"
            options={userOptions.filter((u) => !value.some((v) => v.work_no === u.value))}
            onChange={addPerson}
            onBlur={() => setAdding(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-9 h-9 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        )
      )}
    </div>
  )
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

const ReviewDetailDrawer: React.FC<{
  record: ApplyRecord | null
  open: boolean
  onClose: () => void
  userOptions: { value: string; label: string }[]
  onAction: (action: 'approve' | 'reject' | 'return', record: ApplyRecord, countersigns?: ChainPerson[]) => void
}> = ({ record, open, onClose, userOptions, onAction }) => {
  const { t } = useTranslation()
  const PAGE_SIZE = 5
  const toName = useWorkNoToName()

  const reviewStatusLabel = (s: number) => ({ 1: t('review.status1'), 2: t('review.status2'), 3: t('review.status3'), 4: t('review.status4') }[s] ?? '')

  const fileCategoryLabel = (cat: string) => ({
    requirement: t('review.fileCategoryRequirement'),
    design:      t('review.fileCategoryDesign'),
    progress:    t('review.fileCategoryProgress'),
    other:       t('review.fileCategoryOther'),
  }[cat] ?? cat)

  const applyTypeMeta = (code: string): { what: string; approve: string; reject: string } | null => ({
    initiate:                   { what: t('review.meta.initiate.what'),                   approve: t('review.meta.initiate.approve'),                   reject: t('review.meta.initiate.reject')                   },
    plan:                       { what: t('review.meta.plan.what'),                       approve: t('review.meta.plan.approve'),                       reject: t('review.meta.plan.reject')                       },
    schedule:                   { what: t('review.meta.schedule.what'),                   approve: t('review.meta.schedule.approve'),                   reject: t('review.meta.schedule.reject')                   },
    function_complete:          { what: t('review.meta.function_complete.what'),          approve: t('review.meta.function_complete.approve'),          reject: t('review.meta.function_complete.reject')          },
    project_complete:           { what: t('review.meta.project_complete.what'),           approve: t('review.meta.project_complete.approve'),           reject: t('review.meta.project_complete.reject')           },
    duty_complete:              { what: t('review.meta.duty_complete.what'),              approve: t('review.meta.duty_complete.approve'),              reject: t('review.meta.duty_complete.reject')              },
    requirement_change:         { what: t('review.meta.requirement_change.what'),         approve: t('review.meta.requirement_change.approve'),         reject: t('review.meta.requirement_change.reject')         },
    requirement_review:         { what: t('review.meta.requirement_review.what'),         approve: t('review.meta.requirement_review.approve'),         reject: t('review.meta.requirement_review.reject')         },
    requirement_batch_review:   { what: t('review.meta.requirement_batch_review.what'),   approve: t('review.meta.requirement_batch_review.approve'),   reject: t('review.meta.requirement_batch_review.reject')   },
    task_addition_review:       { what: t('review.meta.task_addition_review.what'),       approve: t('review.meta.task_addition_review.approve'),       reject: t('review.meta.task_addition_review.reject')       },
    requirement_shelve:         { what: t('review.meta.requirement_shelve.what'),         approve: t('review.meta.requirement_shelve.approve'),         reject: t('review.meta.requirement_shelve.reject')         },
    standalone_req_review:      { what: t('review.meta.standalone_req_review.what'),      approve: t('review.meta.standalone_req_review.approve'),      reject: t('review.meta.standalone_req_review.reject')      },
    standalone_req_batch_review:{ what: t('review.meta.standalone_req_batch_review.what'),approve: t('review.meta.standalone_req_batch_review.approve'),reject: t('review.meta.standalone_req_batch_review.reject')},
    req_task_addition_review:   { what: t('review.meta.req_task_addition_review.what'),   approve: t('review.meta.req_task_addition_review.approve'),   reject: t('review.meta.req_task_addition_review.reject')   },
  }[code] ?? null)

  const [project,              setProject]              = useState<Project | null>(null)
  const [files,                setFiles]                = useState<ProjectFile[]>([])
  const [functions,            setFunctions]            = useState<ProjectFunction[]>([])
  const [requirements,         setRequirements]         = useState<Requirement[]>([])
  const [standaloneReqs,       setStandaloneReqs]       = useState<StandaloneReq[]>([])
  const [systemDetail,         setSystemDetail]         = useState<SystemItem | null>(null)
  const [reqTaskDuties,        setReqTaskDuties]        = useState<TemporaryDuty[]>([])
  const [funcDetail,           setFuncDetail]           = useState<ProjectFunction | null>(null)
  const [progressRecords,      setProgressRecords]      = useState<ProgressRecord[]>([])
  const [progressPage,         setProgressPage]         = useState(1)
  const [progressHasMore,      setProgressHasMore]      = useState(false)
  const [progressLoading,      setProgressLoading]      = useState(false)
  const [projectLoading,       setProjectLoading]       = useState(false)
  const [projectInfoCollapsed, setProjectInfoCollapsed] = useState(false)
  const [previewFile,          setPreviewFile]          = useState<ProjectFile | null>(null)
  const [previewDirect,        setPreviewDirect]        = useState<FileInfo | null>(null)
  const [countersignPeople,    setCountersignPeople]    = useState<ChainPerson[]>([])
  const [reqListCollapsed,     setReqListCollapsed]     = useState(false)
  const [expandedReqs,         setExpandedReqs]         = useState<Set<string>>(new Set())

  useEffect(() => {
    setCountersignPeople([])
    // 功能完結審核：預設折疊專案資訊
    setProjectInfoCollapsed(record?.apply_type_code === 'function_complete')
    setProgressRecords([])
    setProgressPage(1)
    setProgressHasMore(false)
    setReqListCollapsed(false)
    setExpandedReqs(new Set())
  }, [record?.id])

  const addToken = (items: FileInfo[] | undefined): FileInfo[] => {
    if (!items?.length) return []
    const token = tokenStorage.get()
    return items.map((f) => ({ ...f, url: token ? `${f.url}?token=${token}` : f.url }))
  }

  const loadProgress = async (pid: string, fid: string, page: number, append = false) => {
    setProgressLoading(true)
    try {
      const res = await projectApi.getProgress(pid, fid, { page, size: PAGE_SIZE })
      const c = res.content as { data_list?: ProgressRecord[]; total_count?: number; total_page?: number }
      const list = (c.data_list ?? []) as ProgressRecord[]
      const withToken = list.map((r) => ({ ...r, files: addToken(r.files) }))
      setProgressRecords((prev) => append ? [...prev, ...withToken] : withToken)
      setProgressPage(page)
      setProgressHasMore((c.total_page ?? 1) > page)
    } catch { /* global */ }
    finally { setProgressLoading(false) }
  }

  // 加載系統需求詳情 + 系統資訊（standalone req review / req_task_addition_review 類型）
  useEffect(() => {
    const isStandaloneType = record?.apply_type_code === 'standalone_req_review' ||
      record?.apply_type_code === 'standalone_req_batch_review' ||
      record?.apply_type_code === 'req_task_addition_review'
    if (!record || !isStandaloneType) {
      setStandaloneReqs([])
      setSystemDetail(null)
      setReqTaskDuties([])
      return
    }
    // 載入系統資訊
    const sysId = record.system_id
    if (sysId) {
      systemApi.get(sysId).then((res) => setSystemDetail(res.content as SystemItem)).catch(() => {})
    }
    if (record.apply_type_code === 'req_task_addition_review') {
      // 載入需求任務詳情
      const dutyIds = record.function_ids ?? []
      if (dutyIds.length > 0) {
        Promise.all(dutyIds.map((did) => dutyApi.get(did))).then((results) => {
          const loadedDuties = results.map((r) => r.content as TemporaryDuty)
          setReqTaskDuties(loadedDuties)
          // 載入關聯的獨立需求名稱
          const reqIds = [...new Set(loadedDuties.map((d) => d.standalone_req_id).filter(Boolean) as string[])]
          if (reqIds.length > 0) {
            Promise.all(reqIds.map((rid) => standaloneReqApi.get(rid))).then((reqResults) => {
              setStandaloneReqs(reqResults.map((r) => r.content as StandaloneReq))
            }).catch(() => {})
          }
        }).catch(() => {})
      }
      return
    }
    // 載入需求詳情（standalone_req_review / standalone_req_batch_review）
    const reqId = record.requirement_id
    const reqIds = record.requirement_ids ?? []
    if (reqId) {
      standaloneReqApi.get(reqId).then((res) => {
        setStandaloneReqs([res.content as StandaloneReq])
      }).catch(() => {})
    } else if (reqIds.length > 0) {
      standaloneReqApi.list({ page: 1, size: 200 }).then((res) => {
        const all = (res.content as { data_list?: StandaloneReq[] }).data_list ?? []
        setStandaloneReqs(all.filter((r) => reqIds.includes(r.id)))
      }).catch(() => {})
    }
  }, [record?.id, record?.apply_type_code])

  useEffect(() => {
    if (!record?.project_id) {
      setProject(null); setFiles([]); setFunctions([])
      setRequirements([]); setFuncDetail(null); setProgressRecords([])
      return
    }
    setProjectLoading(true)
    const reqs: Promise<unknown>[] = [
      projectApi.get(record.project_id),
      projectApi.listFiles(record.project_id),
    ]
    if (record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') {
      reqs.push(projectApi.functionList(record.project_id, { page: 1, size: 200 }))
      reqs.push(requirementApi.list(record.project_id))
    }
    if (record.apply_type_code === 'function_complete' && record.function_id) {
      reqs.push(projectApi.getFunction(record.project_id, record.function_id))
    }
    if (record.apply_type_code === 'initiate') {
      reqs.push(requirementApi.list(record.project_id))
    }
    if (['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code)) {
      reqs.push(requirementApi.list(record.project_id))
    }
    if (record.apply_type_code === 'task_addition_review') {
      reqs.push(projectApi.functionList(record.project_id, { page: 1, size: 200 }))
      reqs.push(requirementApi.list(record.project_id))
    }
    Promise.all(reqs).then((results) => {
      const [pRes, fRes, extra1] = results as [
        Awaited<ReturnType<typeof projectApi.get>>,
        { content: unknown },
        unknown?,
      ]
      setProject(pRes.content as Project)
      setFiles(Array.isArray((fRes as { content: unknown }).content) ? ((fRes as { content: ProjectFile[] }).content) : [])

      if ((record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') && extra1) {
        const c = (extra1 as { content: { data_list?: ProjectFunction[] } }).content
        setFunctions(c.data_list ?? [])
        const extra2 = results[3]
        if (extra2) {
          setRequirements(Array.isArray((extra2 as { content: unknown }).content) ? (extra2 as { content: Requirement[] }).content : [])
        }
      }
      if (record.apply_type_code === 'function_complete' && extra1) {
        setFuncDetail((extra1 as { content: ProjectFunction }).content)
      }
      if (record.apply_type_code === 'initiate' && extra1) {
        setRequirements(Array.isArray((extra1 as { content: unknown }).content) ? (extra1 as { content: Requirement[] }).content : [])
      }
      if (['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code) && extra1) {
        setRequirements(Array.isArray((extra1 as { content: unknown }).content) ? (extra1 as { content: Requirement[] }).content : [])
      }
      if (record.apply_type_code === 'task_addition_review' && extra1) {
        const c = (extra1 as { content: { data_list?: ProjectFunction[] } }).content
        setFunctions(c.data_list ?? [])
        const extra2 = results[3]
        if (extra2) {
          setRequirements(Array.isArray((extra2 as { content: unknown }).content) ? (extra2 as { content: Requirement[] }).content : [])
        }
      }
    }).catch(() => {}).finally(() => setProjectLoading(false))

    // Load first page of progress records separately
    if (record.apply_type_code === 'function_complete' && record.function_id) {
      loadProgress(record.project_id, record.function_id, 1, false)
    }
  }, [record?.project_id, record?.apply_type_code, record?.function_id])

  if (!record) return null

  const isStandaloneReqType = record.apply_type_code === 'standalone_req_review' || record.apply_type_code === 'standalone_req_batch_review'
  const isReqTaskType = record.apply_type_code === 'req_task_addition_review'
  const targetName = record.apply_type_code === 'function_complete'
    ? (record.function_nm || record.project_nm || '—')
    : record.apply_type_code === 'duty_complete'
    ? (record.duty_nm || '—')
    : (isStandaloneReqType || isReqTaskType)
    ? (record.system_nm || systemDetail?.sys_nm || '—')
    : (record.project_nm || record.duty_nm || record.function_nm || '—')
  const nodes         = [...(record.approval_nodes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  // 本次審批需要展示的附件分類
  const relevantCategories = STAGE_FILES[record.apply_type_code] ?? []
  const relevantFiles = files.filter((f) => relevantCategories.includes(f.file_category) && f.source !== 'requirement_attachment')

  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <Tag color={APPLY_TYPE_COLOR[record.apply_type_code]} style={{ margin: 0 }}>
            {t(`review.applyType.${record.apply_type_code}`, record.apply_type)}
          </Tag>
          <span className="text-slate-700 font-semibold truncate">{targetName}</span>
          <Tag color={REVIEW_STATUS_COLOR[record.status]} style={{ margin: 0 }}>
            {reviewStatusLabel(record.status)}
          </Tag>
        </div>
      }
      open={open}
      onClose={onClose}
      width={record?.apply_type_code === 'schedule' || record?.apply_type_code === 'project_complete' ? 900 : record?.apply_type_code === 'function_complete' ? 780 : 720}
      footer={
        record.is_my_turn ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-1 mt-1 flex-shrink-0">
                <UserPlusIcon className="w-4 h-4 text-slate-400" />
                <span className="text-xs text-slate-500 whitespace-nowrap">{t('review.countersignOptional')}</span>
              </div>
              <ReviewerChain
                value={countersignPeople}
                onChange={setCountersignPeople}
                userOptions={userOptions}
              />
            </div>
            {countersignPeople.length > 0 && (
              <div className="text-xs text-slate-400 pl-1">
                {t('review.countersignHint')}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button icon={<ArrowUturnLeftIcon className="w-4 h-4" />} onClick={() => onAction('return', record)}>{t('review.returnAction')}</Button>
              <Button danger icon={<XMarkIcon className="w-4 h-4" />} onClick={() => onAction('reject', record)}>{t('review.rejectAction')}</Button>
              <Button type="primary" icon={<CheckIcon className="w-4 h-4" />}
                onClick={() => onAction('approve', record, countersignPeople.length ? countersignPeople : undefined)}
                style={{ background: '#16a34a' }}>{t('review.approveAction')}</Button>
            </div>
          </div>
        ) : null
      }
    >
      {/* ─── ① 頂部摘要欄 ─── */}
      <div className="flex items-center gap-5 pb-5 mb-5 border-b border-slate-100">
        {/* 狀態印章 */}
        <div className="relative w-[68px] h-[68px] flex-shrink-0 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full"
            style={{ border: `3px dashed ${STAMP_COLORS[record.status] ?? '#94a3b8'}`, transform: 'rotate(-12deg)' }} />
          <span className="text-sm font-bold text-center leading-tight"
            style={{ color: STAMP_COLORS[record.status] ?? '#94a3b8' }}>
            {reviewStatusLabel(record.status)}
          </span>
        </div>

        {/* 申請人 */}
        <div className="flex flex-col items-center gap-1">
          <Avatar size={36} style={{ background: '#7c3aed', fontSize: 14, fontWeight: 600 }}>
            {(record.submitter_name || toName(record.submitter) || record.submitter)?.[0]?.toUpperCase()}
          </Avatar>
          <div className="text-xs font-medium text-slate-700">{record.submitter_name || toName(record.submitter) || record.submitter}</div>
          <div className="text-[11px] text-slate-400">{t('review.applicant')}</div>
        </div>

        {/* 當前審批人 */}
        {nodes.find((n) => n.status === 0) && (
          <>
            <div className="text-slate-300 text-lg">→</div>
            <div className="flex flex-col items-center gap-1">
              {(() => {
                const node = nodes.find((n) => n.status === 0)!
                const wn = node.approver_work_no || node.approver
                const name = toName(wn) || wn
                return (
                  <>
                    <Avatar size={36} style={{ background: '#2563eb', fontSize: 14, fontWeight: 600 }}>
                      {name?.[0]?.toUpperCase()}
                    </Avatar>
                    <div className="text-xs font-medium text-slate-700">{name}</div>
                    <div className="text-[11px] text-slate-400">{t('review.currentApprover')}</div>
                  </>
                )
              })()}
            </div>
          </>
        )}

        {/* 右側申請信息 */}
        <div className="ml-auto text-right flex flex-col gap-1.5">
          <Tag color={APPLY_TYPE_COLOR[record.apply_type_code]} style={{ margin: 0 }}>{t(`review.applyType.${record.apply_type_code}`, record.apply_type)}</Tag>
          {record.function_nm && record.project_nm && (
            <div className="text-xs text-slate-400">{t('review.funcTaskLabel', { project: record.project_nm })}</div>
          )}
          <div className="text-xs text-slate-400">{t('review.submittedAt', { date: record.created_at })}</div>
          {nodes.length > 0 && (
            <div className="text-xs text-slate-500">
              {t('review.approvalProgress', { done: nodes.filter((n) => n.status === 1).length, total: nodes.length })}
            </div>
          )}
        </div>
      </div>

      {/* ─── ② 申請動態說明 ─── */}
      {applyTypeMeta(record.apply_type_code) && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-5 text-sm text-slate-600 flex items-start gap-2">
          <InformationCircleIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <span>{applyTypeMeta(record.apply_type_code)!.what}</span>
        </div>
      )}

      {/* ─── ③ 申請說明（如有） ─── */}
      {record.description && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2">{t('review.requestDesc')}</div>
          <div className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg p-3 leading-relaxed">
            {record.description}
          </div>
        </div>
      )}

      {/* ─── ④ 申請資訊 Grid Table（系統需求版）─── */}
      {(isStandaloneReqType || isReqTaskType) && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2">{t('review.requestInfo')}</div>
          {!systemDetail ? (
            <div className="flex justify-center py-6"><Spin size="small" /></div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <tbody>
                <tr>
                  <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">{t('review.sysName')}</td>
                  <td className="px-3 py-2.5 border border-slate-200 font-medium text-slate-800" colSpan={3}>{systemDetail.sys_nm}</td>
                </tr>
                <tr>
                  <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.sysGroup')}</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-slate-700 w-[29%]">{systemDetail.sys_group || '—'}</td>
                  <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">{t('review.liveDate')}</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{systemDetail.go_live_date || '—'}</td>
                </tr>
                {(systemDetail.maintainer_names ?? []).length > 0 && (
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.maintainers')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>
                      {systemDetail.maintainer_names.map((u) => u.name).join('、')}
                    </td>
                  </tr>
                )}
                {systemDetail.description && (
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.sysDescription')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>{systemDetail.description}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── ④ 申請資訊 Grid Table（專案版）─── */}
      {record.project_id && !isStandaloneReqType && (
        <div className="mb-5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
            onClick={() => setProjectInfoCollapsed((v) => !v)}
          >
            <span
              className="text-[10px] text-slate-400 font-normal"
            >
              {projectInfoCollapsed ? t('review.expand') : t('review.collapse')}
            </span>
            {t('review.requestInfo')}
          </button>
          {!projectInfoCollapsed && (
            projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : project ? (
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">{t('review.projectName')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 font-medium text-slate-800" colSpan={3}>{project.project_nm}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.projectDept')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700 w-[29%]">{project.department || '—'}</td>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap w-[21%]">{t('review.productPm')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{toName(project.product_pm) || '—'}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.projectPm')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{toName(project.project_pm) || '—'}</td>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.expectedEnd')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700">{project.expected_end_date || '—'}</td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.projectDesc')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>
                      <RichTextContent html={project.describe} />
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-slate-50 px-3 py-2.5 border border-slate-200 font-medium text-slate-500 whitespace-nowrap">{t('review.expectedBenefit')}</td>
                    <td className="px-3 py-2.5 border border-slate-200 text-slate-700" colSpan={3}>
                      {project.benefit_amount != null
                        ? <>{project.benefit_amount} {benefitUnitLabel(project.benefit_unit ?? "元/年")}{project.expected_benefit ? <span className="text-slate-400 ml-2 text-xs">（{project.expected_benefit}）</span> : null}</>
                        : project.expected_benefit || '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-400 text-center py-4 border border-slate-200 rounded-lg">{t('review.loadProjectFailed')}</div>
            )
          )}
        </div>
      )}

      {/* ─── ④-b 功能詳情（功能完結審核專用） ─── */}
      {record.apply_type_code === 'function_complete' && (
        <div className="mb-5">
          {projectLoading ? (
            <div className="flex justify-center py-4"><Spin size="small" /></div>
          ) : funcDetail ? (
            <>
              {/* Compact meta strip */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                <span className="font-semibold text-slate-800">{funcDetail.function_nm}</span>
                <span className="text-slate-400 text-xs">|</span>
                <span className="text-slate-500 text-xs">{t('review.assigneesLabel')}
                  {(funcDetail.responsible ?? []).length > 0
                    ? funcDetail.responsible!.map((r) => (
                        <Tag key={r} color="purple" style={{ fontSize: 11, margin: '0 2px' }}>{toName(r) || r}</Tag>
                      ))
                    : '—'}
                </span>
                {PRIORITY_MAP[funcDetail.priority] && (
                  <span className="text-xs" style={{ color: PRIORITY_MAP[funcDetail.priority].color }}>
                    {t('review.priorityLabel', { label: PRIORITY_MAP[funcDetail.priority].label })}
                  </span>
                )}
                {funcDetail.expected_start_date && (
                  <span className="text-slate-400 text-xs">{funcDetail.expected_start_date} → {funcDetail.expected_end_date ?? '—'}</span>
                )}
                {/* Overall progress inline */}
                <div className="flex items-center gap-2 ml-auto">
                  <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${funcDetail.progress ?? 0}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-blue-600 tabular-nums">{funcDetail.progress ?? 0}%</span>
                </div>
              </div>
              {funcDetail.describe && (
                <div className="text-xs text-slate-500 mb-3 px-1"><RichTextContent html={funcDetail.describe} /></div>
              )}

              {/* Progress records with load-more */}
              <div className="text-xs font-medium text-slate-500 mb-1.5 px-1">
                {t('review.progressLoaded', { count: progressRecords.length })}
              </div>
              {progressLoading && progressRecords.length === 0 ? (
                <div className="flex justify-center py-4"><Spin size="small" /></div>
              ) : progressRecords.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noProgressRecords')}</div>
              ) : (
                <div className="space-y-1.5">
                  {progressRecords.map((rec) => (
                    <div key={rec.progress_id} className="flex gap-2.5 bg-white border border-slate-100 rounded-lg px-2.5 py-2 hover:border-slate-200 transition-colors">
                      <Avatar size={22} style={{ background: '#2563eb', fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                        {toName(rec.submitter)?.[0]?.toUpperCase()}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700">{toName(rec.submitter)}</span>
                          <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{rec.progress}%</Tag>
                          {Number(rec.time_consum) > 0 && (
                            <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{rec.time_consum}h</Tag>
                          )}
                          <span className="ml-auto text-[11px] text-slate-400 tabular-nums flex-shrink-0">{rec.created_at}</span>
                        </div>
                        {rec.progress_record && (
                          <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            <RichTextContent html={rec.progress_record} />
                          </div>
                        )}
                        {(rec.files ?? []).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(rec.files ?? []).map((f, fi) => (
                              <button
                                key={fi}
                                type="button"
                                onClick={() => setPreviewDirect(f)}
                                className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer"
                              >
                                <PaperClipIcon className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate max-w-[120px]">{f.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Load-more / all-loaded footer */}
                  <div className="text-center pt-1">
                    {progressHasMore ? (
                      <button
                        type="button"
                        disabled={progressLoading}
                        onClick={() => record?.project_id && record?.function_id &&
                          loadProgress(record.project_id, record.function_id, progressPage + 1, true)}
                        className="text-xs text-blue-500 hover:text-blue-700 disabled:text-slate-300 transition-colors cursor-pointer border-0 bg-transparent outline-none focus:outline-none p-0"
                      >
                        {progressLoading ? t('review.loadingMore') : t('review.loadMore')}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">{t('review.allLoaded')}</span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-slate-400 text-center py-4 border border-slate-200 rounded-lg">{t('review.loadFuncFailed')}</div>
          )}
        </div>
      )}

      {/* ─── ④-c WBS 任務表（排程審核 / 專案完結審核） ─── */}
      {(record.apply_type_code === 'schedule' || record.apply_type_code === 'project_complete') && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            {record.apply_type_code === 'project_complete' ? t('review.wbsTaskCompletion') : t('review.wbsTaskSchedule')}
            <span className="font-normal text-xs text-slate-400">{t('review.taskCount', { count: functions.length })}</span>
          </div>
          {projectLoading ? (
            <div className="flex justify-center py-6"><Spin size="small" /></div>
          ) : functions.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noTaskData')}</div>
          ) : (
            <WbsTable functions={functions} toName={toName} requirements={requirements} />
          )}
        </div>
      )}

      {/* ─── ④-d 需求列表（立案審核專用） ─── */}
      {record.apply_type_code === 'initiate' && (
        <div className="mb-5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
            onClick={() => setReqListCollapsed((v) => !v)}
          >
            <span className="text-[10px] text-slate-400 font-normal">
              {reqListCollapsed ? t('review.expand') : t('review.collapse')}
            </span>
            {t('review.reqListLabel')}
            <span className="font-normal text-xs text-slate-400">{t('review.reqCount', { count: requirements.length })}</span>
          </button>
          {!reqListCollapsed && (
            projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : requirements.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noReqData')}</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                {/* Header */}
                <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
                  style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                  <div />
                  <div className="px-3 py-2">{t('review.colReqName')}</div>
                  <div className="px-3 py-2">{t('review.colPriority')}</div>
                  <div className="px-3 py-2">{t('review.colBenefit')}</div>
                  <div className="px-3 py-2">{t('review.colExpectedEnd')}</div>
                  <div className="px-3 py-2">{t('review.colReqDesc')}</div>
                </div>
                {requirements.map((req, i) => {
                  const isExpanded = expandedReqs.has(req.id)
                  const hasFiles = (req.files ?? []).length > 0
                  const descLong = (req.describe ?? '').length > 30
                  const canExpand = hasFiles || descLong
                  const token = tokenStorage.get()
                  return (
                    <div key={req.id} className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                      {/* Main row */}
                      <div className="grid items-center" style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                        <div className="flex items-center justify-center py-2.5">
                          {canExpand && (
                            <button
                              type="button"
                              onClick={() => setExpandedReqs((prev) => {
                                const next = new Set(prev)
                                next.has(req.id) ? next.delete(req.id) : next.add(req.id)
                                return next
                              })}
                              className="w-4 h-4 rounded border border-slate-300 hover:border-blue-400 hover:text-blue-500 text-slate-400 bg-white hover:bg-blue-50 transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
                              title={isExpanded ? t('review.collapseDetail') : t('review.expandDetail')}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          )}
                        </div>
                        <div className="px-3 py-2.5 text-slate-800 font-medium truncate flex items-center gap-1">
                          {req.req_nm}
                          {hasFiles && (
                            <span className="text-[10px] text-slate-400 font-normal flex-shrink-0">
                              {t('review.attachmentCount', { count: (req.files ?? []).length })}
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2.5">
                          {PRIORITY_MAP[req.priority]
                            ? <span className="font-medium" style={{ color: PRIORITY_MAP[req.priority].color }}>{PRIORITY_MAP[req.priority].label}</span>
                            : '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-600">
                          {req.benefit_amount != null
                            ? <>{req.benefit_amount} {benefitUnitLabel(req.benefit_unit ?? "元/年")}</>
                            : req.expected_benefit || '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-500 tabular-nums">
                          {req.expected_end_date || '—'}
                        </div>
                        <div className="px-3 py-2.5 text-slate-500">
                          {req.describe
                            ? (req.describe.length > 30 ? req.describe.slice(0, 30) + '…' : req.describe)
                            : '—'}
                        </div>
                      </div>
                      {/* Expanded: full description + attachments */}
                      {isExpanded && canExpand && (
                        <div className="px-3 pb-2.5 border-t border-slate-100 bg-blue-50/30">
                          {descLong && (
                            <div className="pt-2 pb-1.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{req.describe}</div>
                          )}
                          {hasFiles && (
                            <>
                              <div className={`${descLong ? 'pt-1.5 border-t border-slate-100' : 'pt-2'} pb-0.5 text-[11px] text-slate-400 font-medium`}>{t('review.reqAttachment')}</div>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(req.files ?? []).map((f, fi) => {
                              const previewUrl = f.file_id
                                ? requirementApi.getFilePreviewUrl(record.project_id!, req.id, f.file_id)
                                : f.url
                              const tokenUrl = token ? `${previewUrl}?token=${token}` : previewUrl
                              return (
                                <button
                                  key={fi}
                                  type="button"
                                  onClick={() => setPreviewDirect({ name: f.name, url: tokenUrl })}
                                  className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer"
                                >
                                  <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                  <span className="truncate max-w-[180px]">{f.name}</span>
                                </button>
                              )
                            })}
                          </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* ─── ④-e2 系統需求詳情（standalone req review 專用） ─── */}
      {isStandaloneReqType && (
        <div className="mb-5">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
            onClick={() => setReqListCollapsed((v) => !v)}
          >
            <span className="text-[10px] text-slate-400 font-normal">{reqListCollapsed ? t('review.expand') : t('review.collapse')}</span>
            {t('review.sysReqDetail')}
            <span className="font-normal text-xs text-slate-400">{t('review.reqCount', { count: standaloneReqs.length })}</span>
          </button>
          {!reqListCollapsed && (
            standaloneReqs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noReqData')}</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
                  style={{ gridTemplateColumns: '2fr 70px 90px 1.5fr 2fr' }}>
                  <div className="px-3 py-2">{t('review.reqName')}</div>
                  <div className="px-3 py-2">{t('review.priority')}</div>
                  <div className="px-3 py-2">{t('review.expectedEnd')}</div>
                  <div className="px-3 py-2">{t('review.estimatedBenefit')}</div>
                  <div className="px-3 py-2">{t('review.reqDesc')}</div>
                </div>
                {standaloneReqs.map((req, i) => (
                  <div key={req.id} className={`grid items-start border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}
                    style={{ gridTemplateColumns: '2fr 70px 90px 1.5fr 2fr' }}>
                    <div className="px-3 py-2.5 text-slate-800 font-medium truncate">{req.req_nm}</div>
                    <div className="px-3 py-2.5">
                      {PRIORITY_MAP[req.priority]
                        ? <span className="font-medium" style={{ color: PRIORITY_MAP[req.priority].color }}>{PRIORITY_MAP[req.priority].label}</span>
                        : '—'}
                    </div>
                    <div className="px-3 py-2.5 text-slate-500 tabular-nums">{req.expected_end_date || '—'}</div>
                    <div className="px-3 py-2.5 text-slate-500">
                      {req.benefit_amount != null
                        ? <>{req.benefit_amount} {benefitUnitLabel(req.benefit_unit ?? "元/年")}{req.expected_benefit ? <div className="text-slate-400 text-[11px] mt-0.5">{req.expected_benefit}</div> : null}</>
                        : req.expected_benefit
                          ? <span>{req.expected_benefit}</span>
                          : '—'}
                    </div>
                    <div className="px-3 py-2.5 text-slate-500">
                      {req.describe ? (req.describe.length > 40 ? req.describe.slice(0, 40) + '…' : req.describe) : '—'}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* ─── ④-e3 需求任務詳情（req_task_addition_review 專用） ─── */}
      {isReqTaskType && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            🆕 {t('review.addTaskDetail')}
            <span className="font-normal text-xs text-slate-400">{t('review.totalCount', { count: reqTaskDuties.length })}</span>
          </div>
          {reqTaskDuties.length === 0 ? (
            <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noTaskData')}</div>
          ) : (
            <DutyWbsTable
              duties={reqTaskDuties}
              toName={toName}
              reqNameMap={Object.fromEntries(standaloneReqs.map((r) => [r.id, r.req_nm]))}
            />
          )}
        </div>
      )}

      {/* ─── ④-e 需求詳情（需求審核 / 需求搁置專用） ─── */}
      {['requirement_review', 'requirement_shelve', 'requirement_batch_review'].includes(record.apply_type_code) && (() => {
        const batchIds = record.requirement_ids ?? []
        const displayReqs = batchIds.length > 0
          ? requirements.filter((r) => batchIds.includes(r.id))
          : requirements.filter((r) => r.id === record.requirement_id)
        return (
          <div className="mb-5">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2 hover:text-blue-600 transition-colors cursor-pointer select-none border-0 bg-transparent outline-none focus:outline-none p-0"
              onClick={() => setReqListCollapsed((v) => !v)}
            >
              <span className="text-[10px] text-slate-400 font-normal">{reqListCollapsed ? t('review.expand') : t('review.collapse')}</span>
              📋 {t('review.reqDetail')}
              <span className="font-normal text-xs text-slate-400">{t('review.totalCount', { count: displayReqs.length })}</span>
            </button>
            {!reqListCollapsed && (
              projectLoading ? (
                <div className="flex justify-center py-6"><Spin size="small" /></div>
              ) : displayReqs.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noReqData')}</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="grid bg-slate-100 border-b border-slate-200 font-semibold text-slate-500"
                    style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                    <div />
                    <div className="px-3 py-2">{t('review.reqName')}</div>
                    <div className="px-3 py-2">{t('review.priority')}</div>
                    <div className="px-3 py-2">{t('review.estimatedBenefit')}</div>
                    <div className="px-3 py-2">{t('review.expectedEnd')}</div>
                    <div className="px-3 py-2">{t('review.reqDesc')}</div>
                  </div>
                  {displayReqs.map((req, i) => {
                    const isExpanded = expandedReqs.has(req.id)
                    const hasFiles = (req.files ?? []).length > 0
                    const descLong = (req.describe ?? '').length > 30
                    const canExpand = hasFiles || descLong
                    const token = tokenStorage.get()
                    return (
                      <div key={req.id} className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}`}>
                        <div className="grid items-center" style={{ gridTemplateColumns: '24px 2fr 1fr 1fr 100px 2fr' }}>
                          <div className="flex items-center justify-center py-2.5">
                            {canExpand && (
                              <button type="button"
                                onClick={() => setExpandedReqs((prev) => { const next = new Set(prev); next.has(req.id) ? next.delete(req.id) : next.add(req.id); return next })}
                                className="w-4 h-4 rounded border border-slate-300 hover:border-blue-400 hover:text-blue-500 text-slate-400 bg-white hover:bg-blue-50 transition-colors flex items-center justify-center text-[10px] font-bold leading-none"
                                title={isExpanded ? t('review.collapse') : t('review.expandDetail')}
                              >{isExpanded ? '−' : '+'}</button>
                            )}
                          </div>
                          <div className="px-3 py-2.5 text-slate-800 font-medium truncate flex items-center gap-1">
                            {req.req_nm}
                            {hasFiles && <span className="text-[10px] text-slate-400 font-normal flex-shrink-0">{t('review.fileCount', { count: (req.files ?? []).length })}</span>}
                          </div>
                          <div className="px-3 py-2.5">
                            {PRIORITY_MAP[req.priority]
                              ? <span className="font-medium" style={{ color: PRIORITY_MAP[req.priority].color }}>{PRIORITY_MAP[req.priority].label}</span>
                              : '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-600">
                            {req.benefit_amount != null ? <>{req.benefit_amount} {benefitUnitLabel(req.benefit_unit ?? "元/年")}</> : req.expected_benefit || '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-500 tabular-nums">
                            {req.expected_end_date || '—'}
                          </div>
                          <div className="px-3 py-2.5 text-slate-500">
                            {req.describe ? (req.describe.length > 30 ? req.describe.slice(0, 30) + '…' : req.describe) : '—'}
                          </div>
                        </div>
                        {isExpanded && canExpand && (
                          <div className="px-3 pb-2.5 border-t border-slate-100 bg-blue-50/30">
                            {descLong && <div className="pt-2 pb-1.5 text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{req.describe}</div>}
                            {hasFiles && (
                              <>
                                <div className={`${descLong ? 'pt-1.5 border-t border-slate-100' : 'pt-2'} pb-0.5 text-[11px] text-slate-400 font-medium`}>{t('review.reqAttachment')}</div>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {(req.files ?? []).map((f, fi) => {
                                    const previewUrl = f.file_id ? requirementApi.getFilePreviewUrl(record.project_id!, req.id, f.file_id) : f.url
                                    const tokenUrl = token ? `${previewUrl}?token=${token}` : previewUrl
                                    return (
                                      <button key={fi} type="button"
                                        onClick={() => setPreviewDirect({ name: f.name, url: tokenUrl })}
                                        className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer">
                                        <PaperClipIcon className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[180px]">{f.name}</span>
                                      </button>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </div>
        )
      })()}

      {/* ─── ④-f 新增任務詳情（task_addition_review 專用） ─── */}
      {record.apply_type_code === 'task_addition_review' && (() => {
        const funcIds = record.function_ids ?? []
        const displayFuncs = funcIds.length > 0
          ? functions.filter((f) => funcIds.includes(f.id))
          : []
        return (
          <div className="mb-5">
            <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              🆕 {t('review.addTaskDetail')}
              <span className="font-normal text-xs text-slate-400">{t('review.totalCount', { count: displayFuncs.length })}</span>
            </div>
            {projectLoading ? (
              <div className="flex justify-center py-6"><Spin size="small" /></div>
            ) : displayFuncs.length === 0 ? (
              <div className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noTaskData')}</div>
            ) : (
              <WbsTable functions={displayFuncs} toName={toName} requirements={requirements} />
            )}
          </div>
        )
      })()}

      {/* ─── ⑤ 相關附件 ─── */}
      {relevantCategories.length > 0 && project && (
        <div className="mb-5">
          <div className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
            <PaperClipIcon className="w-4 h-4 text-slate-400" />
            {t('review.relatedAttachments')}
            <span className="font-normal text-xs text-slate-400">（{relevantCategories.map((c) => fileCategoryLabel(c)).join('、')}）</span>
          </div>
          {relevantFiles.length === 0 ? (
            <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">{t('review.noAttachments')}</div>
          ) : (
            <div className="space-y-1.5">
              {relevantFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-2.5 bg-white rounded-lg px-3 py-2 border border-slate-200">
                  <span className="text-base">{
                    f.file_ext === 'pdf' ? '📄' :
                    ['doc','docx'].includes(f.file_ext) ? '📝' :
                    ['xls','xlsx'].includes(f.file_ext) ? '📊' :
                    ['ppt','pptx'].includes(f.file_ext) ? '📋' :
                    ['png','jpg','jpeg','gif'].includes(f.file_ext) ? '🖼️' : '📎'
                  }</span>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setPreviewFile(f)}>
                    <div className="text-sm text-blue-600 hover:text-blue-700 truncate font-medium">{f.file_nm}</div>
                    <div className="text-xs text-slate-400">{fileCategoryLabel(f.file_category)} · {f.uploader} · {f.created_at}</div>
                  </div>
                  <Tooltip title={t('review.preview')}>
                    <Button size="small" type="text" icon={<EyeIcon className="w-3.5 h-3.5" />} onClick={() => setPreviewFile(f)} />
                  </Tooltip>
                  <Tooltip title={t('review.download')}>
                    <a href={projectApi.getFileDownloadUrl(record.project_id!, f.id)} target="_blank" rel="noreferrer">
                      <Button size="small" type="text" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />} />
                    </a>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ⑥ 審批流程 ─── */}
      <div>
        <div className="text-sm font-semibold text-slate-700 mb-4">{t('review.approvalFlow')}</div>
        {nodes.length === 0 ? (
          <div className="text-xs text-slate-300 text-center py-6 border border-dashed border-slate-200 rounded-lg">{t('review.noApprovalNodes')}</div>
        ) : (
          <>
            {/* 水平頭像鏈 */}
            <div className="flex items-end overflow-x-auto pb-1 mb-4">
              {/* 申請人節點 */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                <div className="relative">
                  <Avatar size={38} style={{ background: '#7c3aed', fontSize: 15, fontWeight: 600 }}>
                    {(record.submitter_name || toName(record.submitter) || record.submitter)?.[0]?.toUpperCase()}
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                    <CheckIcon className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <div className="text-[11px] font-medium text-slate-700 text-center leading-tight mt-1">
                  {record.submitter_name || toName(record.submitter) || record.submitter}
                </div>
                <div className="text-[10px] text-blue-500">{t('review.submitApplication')}</div>
              </div>

              {/* 審批節點 */}
              {nodes.map((node, i) => {
                const dotColors: Record<number, string> = { 1: '#16a34a', 2: '#dc2626', 3: '#d97706', 0: '#94a3b8' }
                const actionLabels: Record<number, string> = { 1: t('review.actionApprove'), 2: t('review.actionReject'), 3: t('review.actionReturn'), 0: t('review.actionPending') }
                const dotColor = dotColors[node.status] ?? '#94a3b8'
                return (
                  <React.Fragment key={node.node_id || i}>
                    {/* 連接線 */}
                    <div className="flex items-center mx-1 mb-8" style={{ minWidth: 28 }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <div className="flex-1 border-t-2 border-dashed border-slate-200" style={{ minWidth: 16 }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-200 opacity-60" />
                    </div>
                    <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                      <div className="relative">
                        <Avatar size={38} style={{
                          background: node.is_countersign ? '#8b5cf6' : '#2563eb',
                          fontSize: 15, fontWeight: 600,
                          opacity: node.status === 0 ? 0.55 : 1,
                        }}>
                          {(toName(node.approver_work_no || node.approver) || node.approver)?.[0]?.toUpperCase()}
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
                          style={{ background: dotColor }}>
                          {node.status === 1 ? <CheckIcon className="w-2.5 h-2.5 text-white" />
                            : node.status === 2 ? <XMarkIcon className="w-2.5 h-2.5 text-white" />
                            : node.status === 3 ? <ArrowUturnLeftIcon className="w-2.5 h-2.5 text-white" />
                            : <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                      <div className="text-[11px] font-medium text-slate-700 text-center leading-tight mt-1">{toName(node.approver_work_no || node.approver) || node.approver}</div>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px]" style={{ color: dotColor }}>{actionLabels[node.status] ?? '—'}</span>
                        {node.is_countersign && (
                          <Tag style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }} color="purple">{t('review.countersign')}</Tag>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                )
              })}

              {/* 終止節點（已全部通過） */}
              {record.status === 2 && (
                <>
                  <div className="flex items-center mx-1 mb-8" style={{ minWidth: 28 }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-300" />
                    <div className="flex-1 border-t-2 border-dashed border-green-300" style={{ minWidth: 16 }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-200" />
                  </div>
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[64px]">
                    <div className="w-[38px] h-[38px] rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center">
                      <CheckIcon className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-[11px] font-medium text-green-700 mt-1">{t('review.approvalPassed')}</div>
                    <div className="text-[10px] text-slate-400">{t('review.completed')}</div>
                  </div>
                </>
              )}
            </div>

            {/* 審批歷程表格 */}
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">{t('review.approver')}</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">{t('review.action')}</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">{t('review.time')}</th>
                  <th className="text-left px-3 py-2 border border-slate-200 font-medium text-slate-500 text-xs">{t('review.comment')}</th>
                </tr>
              </thead>
              <tbody>
                {/* 提交申請行 */}
                <tr>
                  <td className="px-3 py-2.5 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <Avatar size={22} style={{ background: '#7c3aed', fontSize: 10, fontWeight: 600 }}>
                        {(record.submitter_name || toName(record.submitter) || record.submitter)?.[0]?.toUpperCase()}
                      </Avatar>
                      <span className="text-xs text-slate-700">{record.submitter_name || toName(record.submitter) || record.submitter}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-blue-500">{t('review.submitApplication')}</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">{record.created_at}</td>
                  <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-300">—</td>
                </tr>
                {/* 各審批節點 */}
                {nodes.map((node) => {
                  const rowColors: Record<number, string> = { 1: '#16a34a', 2: '#dc2626', 3: '#d97706' }
                  const rowLabels: Record<number, string> = { 1: t('review.actionApprove'), 2: t('review.actionReject'), 3: t('review.actionReturn'), 0: t('review.actionPending') }
                  return (
                    <tr key={node.node_id} className={node.status === 0 ? 'bg-blue-50/30' : ''}>
                      <td className="px-3 py-2.5 border border-slate-200">
                        <div className="flex items-center gap-2">
                          <Avatar size={22} style={{
                            background: node.is_countersign ? '#8b5cf6' : '#2563eb',
                            fontSize: 10, fontWeight: 600,
                          }}>
                            {(toName(node.approver_work_no || node.approver) || node.approver)?.[0]?.toUpperCase()}
                          </Avatar>
                          <span className="text-xs text-slate-700">{toName(node.approver_work_no || node.approver) || node.approver}</span>
                          {node.is_countersign && (
                            <Tag style={{ margin: 0, fontSize: 9, padding: '0 3px', lineHeight: '14px' }} color="purple">{t('review.countersign')}</Tag>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs"
                        style={{ color: rowColors[node.status] ?? '#94a3b8' }}>
                        {rowLabels[node.status] ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">
                        {node.approved_at || <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 border border-slate-200 text-xs text-slate-500">
                        {node.comment || <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 附件預覽 — 專案檔案 */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          projectId={record.project_id ?? ''}
          onClose={() => setPreviewFile(null)}
        />
      )}
      {/* 附件預覽 — 進度附件（直接 URL） */}
      {previewDirect && (
        <FilePreviewModal
          directUrl={previewDirect.url}
          filename={previewDirect.name}
          onClose={() => setPreviewDirect(null)}
        />
      )}
    </Drawer>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ReviewListPage: React.FC = () => {
  const { t } = useTranslation()
  const toName = useWorkNoToName()
  const location = useLocation()
  const isSubmitterMode = location.pathname === '/review/submitted'
  const isReviewedMode  = location.pathname === '/review/reviewed'

  const [allRecords,   setAllRecords]   = useState<ApplyRecord[]>([])
  const [myRecords,    setMyRecords]    = useState<ApplyRecord[]>([])
  const [isLoading,    setIsLoading]    = useState(false)
  const [isSaving,     setIsSaving]     = useState(false)
  const [reviewerTab,  setReviewerTab]  = useState('all')
  const [reviewedTab,  setReviewedTab]  = useState('all')
  const [submitterTab, setSubmitterTab] = useState('all')
  const [keyword,      setKeyword]      = useState('')
  const [dateRange,    setDateRange]    = useState<[Dayjs | null, Dayjs | null] | null>(null)
  const [detailRecord, setDetailRecord] = useState<ApplyRecord | null>(null)
  const [actionTarget, setActionTarget] = useState<{
    record: ApplyRecord
    action: 'approve' | 'reject' | 'return'
    countersigns?: ChainPerson[]
  } | null>(null)
  const [actionForm]   = Form.useForm()
  const [userOptions,  setUserOptions]  = useState<{ value: string; label: string }[]>([])

  useEffect(() => {
    userApi.list({ size: 200 })
      .then((res) => {
        const content = (res as { content?: { data_list?: { work_no: string; name: string }[] } }).content
        const users = content?.data_list ?? []
        setUserOptions(users.map((u) => ({ value: u.work_no, label: u.name })))
      })
      .catch(() => {})
  }, [])

  // 兼容旧版本 apply_type_code 命名，统一归一
  const normalizeRecord = (r: ApplyRecord): ApplyRecord => {
    if (r.apply_type_code === 'function_completion') {
      return { ...r, apply_type_code: 'function_complete', apply_type: '功能完結審核' }
    }
    if (r.apply_type_code === 'function_complete' && r.apply_type !== '功能完結審核') {
      return { ...r, apply_type: '功能完結審核' }
    }
    if (r.apply_type_code === 'duty_completion') {
      return { ...r, apply_type_code: 'duty_complete', apply_type: 'AR完結審核' }
    }
    return r
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [proj, duty, mySubmitted] = await Promise.all([
        projectApi.reviewList({ page: 1, size: 100 }),
        dutyApi.reviewList({ page: 1, size: 100 }),
        projectApi.mySubmittedReviews({ page: 1, size: 200 }),
      ])
      const projContent = proj.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const dutyContent = duty.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const myContent   = mySubmitted.content as { project_list?: ApplyRecord[]; data_list?: ApplyRecord[] }
      const projList = (projContent.project_list ?? projContent.data_list ?? []) as ApplyRecord[]
      const dutyList = (dutyContent.project_list ?? dutyContent.data_list ?? []) as ApplyRecord[]
      const myList   = (myContent.project_list ?? myContent.data_list ?? []) as ApplyRecord[]
      const merged = [...projList, ...dutyList]
        .map(normalizeRecord)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      setAllRecords(merged)
      setMyRecords(myList.map(normalizeRecord).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch { /* global handler */ }
    finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [])

  const pendingAll = useMemo(() => allRecords.filter((r) => r.is_my_turn),  [allRecords])
  const doneAll    = useMemo(() => allRecords.filter((r) => !r.is_my_turn), [allRecords])

  // 通用篩選：關鍵字 + 時間範圍
  const applyFilters = (list: ApplyRecord[]): ApplyRecord[] => {
    let result = list
    const kw = keyword.trim().toLowerCase()
    if (kw) {
      result = result.filter((r) =>
        (r.project_nm ?? '').toLowerCase().includes(kw) ||
        (r.duty_nm    ?? '').toLowerCase().includes(kw) ||
        (r.function_nm ?? '').toLowerCase().includes(kw) ||
        (r.submitter_name ?? '').toLowerCase().includes(kw) ||
        (r.apply_type ?? '').toLowerCase().includes(kw) ||
        (r.description ?? '').toLowerCase().includes(kw),
      )
    }
    if (dateRange?.[0] && dateRange?.[1]) {
      const [start, end] = dateRange
      result = result.filter((r) => {
        const d = r.created_at ? new Date(r.created_at).getTime() : 0
        return d >= start.startOf('day').valueOf() && d <= end.endOf('day').valueOf()
      })
    }
    return result
  }

  // 待我審核 - 依子標籤過濾（只有待處理）
  const reviewerRecords = useMemo(() => {
    const base = reviewerTab === 'all' ? pendingAll : pendingAll.filter((r) => tabMatchesCodes(reviewerTab, r.apply_type_code))
    return applyFilters(base)
  }, [pendingAll, reviewerTab, keyword, dateRange])

  // 我的審核 - 依子標籤過濾（已審核）
  const reviewedRecords = useMemo(() => {
    const base = reviewedTab === 'all' ? doneAll : doneAll.filter((r) => tabMatchesCodes(reviewedTab, r.apply_type_code))
    return applyFilters(base)
  }, [doneAll, reviewedTab, keyword, dateRange])

  // 我的提交 - 依子標籤過濾
  const submitterRecords = useMemo(() => {
    const base = submitterTab === 'all' ? myRecords : myRecords.filter((r) => tabMatchesCodes(submitterTab, r.apply_type_code))
    return applyFilters(base)
  }, [myRecords, submitterTab, keyword, dateRange])

  // Badge counts
  const pendingCount = pendingAll.length
  const doneCount    = doneAll.length

  // ─── Actions ───────────────────────────────────────────────────────────────

  const handleActionConfirm = async (values: Record<string, unknown>) => {
    if (!actionTarget) return
    setIsSaving(true)
    try {
      const { record, action, countersigns } = actionTarget
      const statusMap = { approve: 2, reject: 3, return: 4 }
      const payload: ReviewPayload = {
        status: statusMap[action],
        reject_reason: values.reason as string | undefined,
        ...(action === 'approve' && countersigns?.length ? { countersigns } : {}),
      }

      const isDuty = record.apply_type_code === 'duty_complete'
      if (isDuty) {
        await dutyApi.approveReview(record.id, payload)
      } else {
        await projectApi.approveReview(record.id, payload)
      }

      showToast.success(action === 'approve' ? t('review.toastApproved') : action === 'reject' ? t('review.toastRejected') : t('review.toastReturned'))
      setActionTarget(null)
      setDetailRecord(null)
      actionForm.resetFields()
      loadData()
    } catch { /* global handler */ }
    finally { setIsSaving(false) }
  }

  // ─── Table Columns ─────────────────────────────────────────────────────────

  const reviewStatusLabel = (v: number) => ({
    1: t('review.status1'), 2: t('review.status2'), 3: t('review.status3'), 4: t('review.status4'),
  }[v] ?? String(v))

  const nodeStatusLabel = (s: number) => ({
    0: t('review.actionPending'), 1: t('review.actionApprove'), 2: t('review.actionReject'), 3: t('review.actionReturn'),
  }[s] ?? '—')

  const rawColumns: ColumnsType<ApplyRecord> = [
    {
      title: t('review.col.applyType'), dataIndex: 'apply_type_code', width: 110,
      render: (_: string, r) => (
        <Tag color={APPLY_TYPE_COLOR[r.apply_type_code]} style={{ fontSize: 11 }}>{t(`review.applyType.${r.apply_type_code}`, r.apply_type)}</Tag>
      ),
    },
    {
      title: t('review.col.relatedTarget'), key: 'target', ellipsis: true,
      render: (_: unknown, r) => {
        const isFuncComplete    = r.apply_type_code === 'function_complete'
        const isDutyComplete    = r.apply_type_code === 'duty_complete'
        const isStandaloneReq   = r.apply_type_code === 'standalone_req_review' || r.apply_type_code === 'standalone_req_batch_review' || r.apply_type_code === 'req_task_addition_review'
        const primaryName = isFuncComplete
          ? (r.function_nm || r.project_nm || '—')
          : isDutyComplete
          ? (r.duty_nm || '—')
          : isStandaloneReq
          ? (r.system_nm || '—')
          : (r.project_nm || r.duty_nm || r.function_nm || '—')
        const secondaryName = isFuncComplete && r.project_nm ? r.project_nm : null
        return (
          <div className="cursor-pointer group" onClick={() => setDetailRecord(r)}>
            <div className="flex items-center gap-1.5">
              {isStandaloneReq && <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', lineHeight: '18px', margin: 0 }}>{t('review.system')}</Tag>}
              <span className="text-slate-700 text-sm font-medium group-hover:text-blue-600 transition-colors">{primaryName}</span>
            </div>
            {secondaryName && (
              <div className="text-slate-400 text-xs mt-0.5">{t('review.project')}：{secondaryName}</div>
            )}
          </div>
        )
      },
    },
    {
      title: t('review.col.applicant'), dataIndex: 'submitter_name', width: 90,
      render: (v: string, r) => {
        const display = v || toName(r.submitter) || r.submitter || '—'
        return <span className="text-sm text-slate-700 font-medium">{display}</span>
      },
    },
    {
      title: t('review.col.status'), dataIndex: 'status', width: 88,
      render: (v: number) => {
        const color = REVIEW_STATUS_COLOR[v]
        return color ? <Tag color={color} style={{ fontSize: 11 }}>{reviewStatusLabel(v)}</Tag> : v
      },
    },
    {
      title: t('review.col.approver'), key: 'nodes', width: 220,
      render: (_: unknown, r) => {
        const nodes = [...(r.approval_nodes ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        if (nodes.length === 0) return <span className="text-slate-300 text-xs">—</span>
        const statusColor: Record<number, string> = { 0: '#94a3b8', 1: '#16a34a', 2: '#dc2626', 3: '#d97706' }
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {nodes.map((n, i) => {
              const name = toName(n.approver_work_no || n.approver) || n.approver
              const color = statusColor[n.status] ?? '#94a3b8'
              return (
                <React.Fragment key={n.node_id}>
                  <Tooltip title={`${name}（${nodeStatusLabel(n.status)}）`}>
                    <span className="inline-flex items-center gap-1 text-xs cursor-default">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span style={{ color }} className="font-medium">{name}</span>
                    </span>
                  </Tooltip>
                  {i < nodes.length - 1 && <span className="text-slate-300 text-[10px]">→</span>}
                </React.Fragment>
              )
            })}
          </div>
        )
      },
    },
    { title: t('review.col.submitTime'), dataIndex: 'created_at', width: 160 },
    {
      title: t('common.action'), key: 'action', width: 120, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={4}>
          <Tooltip title={t('review.viewDetail')}>
            <Button
              icon={<EyeIcon className="w-3.5 h-3.5" />} size="small" type="text"
              onClick={() => setDetailRecord(record)}
            />
          </Tooltip>
          {record.is_my_turn && (
            <>
              <Tooltip title={t('review.approve')}>
                <Button
                  icon={<CheckIcon className="w-3.5 h-3.5" />} size="small" type="text"
                  className="text-green-600 hover:text-green-700"
                  onClick={() => setActionTarget({ record, action: 'approve' })}
                />
              </Tooltip>
              <Tooltip title={t('review.reject')}>
                <Button
                  icon={<XMarkIcon className="w-3.5 h-3.5" />} size="small" type="text" danger
                  onClick={() => setActionTarget({ record, action: 'reject' })}
                />
              </Tooltip>
              <Tooltip title={t('review.return')}>
                <Button
                  icon={<ArrowUturnLeftIcon className="w-3.5 h-3.5" />} size="small" type="text"
                  className="text-amber-500 hover:text-amber-600"
                  onClick={() => setActionTarget({ record, action: 'return' })}
                />
              </Tooltip>
            </>
          )}
        </Space>
      ),
    },
  ]

  const { mergeColumns: columns } = useResizableColumns(rawColumns)

  // ─── Render ────────────────────────────────────────────────────────────────

  const actionLabels = { approve: t('review.approve'), reject: t('review.reject'), return: t('review.return') }
  const actionColors = { approve: '#16a34a', reject: '#dc2626', return: '#d97706' }
  const needReason   = actionTarget?.action !== 'approve'

  const tabContent = (records: ApplyRecord[]) => {
    if (isLoading) return <div className="flex justify-center py-16"><Spin size="large" /></div>
    if (records.length === 0) return <Empty description={t('review.noRecords')} className="py-16" />
    return (
      <Table
        rowKey="id"
        columns={columns}
        components={tableComponents}
        dataSource={records}
        loading={false}
        pagination={{ pageSize: 20, showTotal: (total) => t('review.paginationTotal', { total }) }}
        size="small"
        scroll={{ x: 900 }}
      />
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">
          {isSubmitterMode ? t('review.mySubmissions') : isReviewedMode ? t('review.myReviews') : t('review.pendingReview')}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {isSubmitterMode
            ? <>{t('review.submissionCount', { count: myRecords.length })}</>
            : isReviewedMode
            ? <>{t('review.reviewedCount', { count: doneCount })}</>
            : <>{t('review.pendingCount', { count: pendingCount })}</>
          }
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100">
        {/* ── 篩選工具列 ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-wrap">
          <FunnelIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <Input
            prefix={<MagnifyingGlassIcon className="w-3.5 h-3.5 text-slate-400" />}
            placeholder={t('review.searchPlaceholder')}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 280 }}
            size="small"
          />
          <DatePicker.RangePicker
            size="small"
            placeholder={[t('review.dateStart'), t('review.dateEnd')]}
            value={dateRange ?? undefined}
            onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
            style={{ width: 240 }}
          />
          {(keyword || dateRange) && (
            <Button
              size="small"
              type="text"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => { setKeyword(''); setDateRange(null) }}
            >
              {t('review.clearFilter')}
            </Button>
          )}
          <span className="ml-auto text-xs text-slate-400">
            {isSubmitterMode
              ? t('review.showCount', { shown: submitterRecords.length, total: myRecords.length })
              : isReviewedMode
              ? t('review.showCount', { shown: reviewedRecords.length, total: doneCount })
              : t('review.showCount', { shown: reviewerRecords.length, total: pendingCount })
            }
          </span>
        </div>

        {/* ── 待我審核面板 ── */}
        {!isSubmitterMode && !isReviewedMode && (
          <Tabs
            activeKey={reviewerTab}
            onChange={setReviewerTab}
            style={{ padding: '0 16px' }}
            items={REVIEW_TAB_KEYS.map((key) => {
              const count = key === 'all'
                ? pendingCount
                : pendingAll.filter((r) => tabMatchesCodes(key, r.apply_type_code)).length
              const label = t(`review.tab.${key}`)
              return {
                key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{label}</span></Badge>
                  : label,
                children: tabContent(reviewerRecords),
              }
            })}
          />
        )}

        {/* ── 我的審核面板 ── */}
        {isReviewedMode && (
          <Tabs
            activeKey={reviewedTab}
            onChange={setReviewedTab}
            style={{ padding: '0 16px' }}
            items={REVIEW_TAB_KEYS.map((key) => {
              const count = key === 'all'
                ? doneCount
                : doneAll.filter((r) => tabMatchesCodes(key, r.apply_type_code)).length
              const label = t(`review.tab.${key}`)
              return {
                key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{label}</span></Badge>
                  : label,
                children: tabContent(reviewedRecords),
              }
            })}
          />
        )}

        {/* ── 我的提交面板 ── */}
        {isSubmitterMode && (
          <Tabs
            activeKey={submitterTab}
            onChange={setSubmitterTab}
            style={{ padding: '0 16px' }}
            items={REVIEW_TAB_KEYS.map((key) => {
              const count = key === 'all'
                ? myRecords.length
                : myRecords.filter((r) => tabMatchesCodes(key, r.apply_type_code)).length
              const label = t(`review.tab.${key}`)
              return {
                key,
                label: count > 0
                  ? <Badge count={count} size="small" offset={[6, -2]}><span className="pr-2">{label}</span></Badge>
                  : label,
                children: tabContent(submitterRecords),
              }
            })}
          />
        )}
      </div>

      {/* Detail Drawer */}
      <ReviewDetailDrawer
        record={detailRecord}
        open={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        userOptions={userOptions}
        onAction={(action, record, countersigns) => {
          setDetailRecord(null)
          setActionTarget({ record, action, countersigns })
        }}
      />

      {/* Action Confirm Modal (通過 / 拒絕 / 退回) */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            {actionTarget?.action === 'approve' && <CheckCircleIcon className="w-5 h-5 text-green-500" />}
            {actionTarget?.action === 'reject'  && <XMarkIcon className="w-5 h-5 text-red-500" />}
            {actionTarget?.action === 'return'  && <ArrowUturnLeftIcon className="w-5 h-5 text-amber-500" />}
            <span>{t('review.confirmAction', { action: actionTarget ? actionLabels[actionTarget.action] : '' })}</span>
          </div>
        }
        open={!!actionTarget}
        onCancel={() => { setActionTarget(null); actionForm.resetFields() }}
        footer={null}
        width={420}
        destroyOnHidden
      >
        <div className="mt-1 mb-4 text-sm text-slate-500">
          {(() => {
            const r = actionTarget?.record
            if (!r) return null
            const isStandalone = r.apply_type_code === 'standalone_req_review' || r.apply_type_code === 'standalone_req_batch_review' || r.apply_type_code === 'req_task_addition_review'
            const name = isStandalone
              ? (r.description || '—')
              : (r.project_nm ?? r.duty_nm ?? r.function_nm ?? r.description ?? '—')
            return (
              <>
                {isStandalone && r.system_nm && (
                  <div className="mb-1 text-xs text-slate-400">{t('review.system')}：{r.system_nm}</div>
                )}
                <span>{t('review.actionDescription', { name, action: actionLabels[actionTarget!.action] })}</span>
              </>
            )
          })()}
        </div>
        <Form form={actionForm} layout="vertical" onFinish={handleActionConfirm}>
          {needReason && (
            <Form.Item
              name="reason"
              label={t('review.reasonLabel', { action: actionTarget ? actionLabels[actionTarget.action] : '' })}
              rules={[{ required: true, message: t('review.reasonRequired') }]}
            >
              <Input.TextArea rows={3} placeholder={t('review.reasonPlaceholder', { action: actionTarget ? actionLabels[actionTarget.action] : '' })} />
            </Form.Item>
          )}
          {actionTarget?.action === 'approve' && !!actionTarget.countersigns?.length && (
            <div className="mb-3 flex items-start gap-2 text-sm text-slate-500 bg-blue-50 rounded px-3 py-2">
              <UserPlusIcon className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                {t('review.countersignNote')}
                <span className="font-semibold text-blue-700 ml-1">
                  {actionTarget.countersigns.map((cs, i) => (
                    <span key={cs.work_no}>{i > 0 ? ' → ' : ''}{cs.name}</span>
                  ))}
                </span>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 mt-2">
            <Button onClick={() => { setActionTarget(null); actionForm.resetFields() }}>{t('common.cancel')}</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={isSaving}
              style={{ background: actionTarget ? actionColors[actionTarget.action] : '#2563eb' }}
            >
              {t('review.confirmAction', { action: actionTarget ? actionLabels[actionTarget.action] : '' })}
            </Button>
          </div>
        </Form>
      </Modal>

    </div>
  )
}

export default ReviewListPage
