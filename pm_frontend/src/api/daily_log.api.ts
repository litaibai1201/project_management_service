import { get, post, put, postForm } from './httpClient'
import type { ApiResponse, DailyLog, DailyLogEntry } from '@/types/api.types'

// ─── Backend wire types (match Flask-Marshmallow schema exactly) ──────────────

/** Backend: task_items 條目（專案功能 / 臨時任務） */
export interface BackendTaskItem {
  task_type: 'project' | 'duty'   // backend field name
  task_id: string                  // function_id (project) | duty_id (duty)
  task_nm: string                  // function_nm | duty_nm
  work_hours: number               // backend uses work_hours, not hours
  description: string
  project_id?: string              // 所屬專案 ID（project 類型時使用）
  project_nm?: string              // 所屬專案名稱（project 類型時使用）
  suggest_id?: string              // 來源進度記錄 ID，用於刷新後去重
  files?: { name: string; url: string; size?: number }[]  // 來自進度記錄的附件
  record_time?: string             // 提交時間 HH:mm（來自進度記錄 created_at）
}

/** Backend: free_items 條目（會議 / 培訓 / 其他） */
export interface BackendFreeItem {
  category: string
  description: string
  work_hours: number               // backend uses work_hours, not hours
}

/** Backend: create / update request payload */
export interface CreateDailyLogPayload {
  log_date: string                 // "YYYY-MM-DD"
  task_items?: BackendTaskItem[]
  free_items?: BackendFreeItem[]
  remark?: string
}

export interface UpdateDailyLogPayload {
  task_items?: BackendTaskItem[]
  free_items?: BackendFreeItem[]
  remark?: string
  status?: 1 | 2                   // 1=草稿, 2=已提交
}

/** Backend: list query params */
export interface DailyLogListQuery {
  page: number
  size?: number
  start_date?: string
  end_date?: string
  work_no?: string                 // 主管查下屬時傳
  status?: 1 | 2
}

/** Backend: GET /api/daily_log/:id response shape */
export interface BackendDailyLogDetail {
  log_id: string
  work_no: string
  user_name?: string
  log_date: string
  total_hours: string | number
  status: 1 | 2                   // 1=草稿, 2=已提交
  task_items: BackendTaskItem[]
  free_items: BackendFreeItem[]
  remark?: string
  created_at?: string
  updated_at?: string
}

/** Backend: list item (summary only, no task/free items) */
export interface BackendDailyLogSummary {
  log_id: string
  work_no: string
  user_name?: string
  log_date: string
  total_hours: string | number
  status: 1 | 2
  created_at?: string
  updated_at?: string
}

export interface UploadedFileInfo {
  file_id: string
  minio_key: string
  file_name: string
  file_type: string
  file_size: number
  url: string
}

// ─── Adapters: Backend ↔ Frontend DailyLog types ─────────────────────────────

/**
 * Convert frontend DailyLogEntry[] → backend payload (task_items + free_items).
 * Called in DailyLogPage before API requests.
 */
export function entriesToBackend(
  entries: DailyLogEntry[],
  logDate: string,
): CreateDailyLogPayload {
  const task_items: BackendTaskItem[] = entries
    .filter((e) => e.work_category === 'project' || e.work_category === 'duty')
    .map((e) => ({
      task_type:   e.work_category as 'project' | 'duty',
      task_id:     e.work_category === 'project' ? (e.function_id ?? '') : (e.duty_id ?? ''),
      task_nm:     e.work_category === 'project' ? (e.function_nm ?? '') : (e.duty_nm ?? ''),
      work_hours:  e.hours,
      description: e.description,
      project_id:  e.work_category === 'project' ? e.project_id : undefined,
      project_nm:  e.work_category === 'project' ? e.project_nm : undefined,
      suggest_id:  e.suggest_id,
      files:       e.files?.length ? e.files : undefined,
      record_time: e.record_time,
    }))

  const free_items: BackendFreeItem[] = entries
    .filter((e) => e.work_category !== 'project' && e.work_category !== 'duty')
    .map((e) => ({
      category:    e.work_category,
      description: e.description,
      work_hours:  e.hours,
    }))

  return { log_date: logDate, task_items, free_items }
}

/**
 * Convert backend detail response → frontend DailyLog shape.
 * Called after API responses so DailyLogPage state stays consistent.
 */
export function backendDetailToLog(raw: BackendDailyLogDetail): DailyLog {
  const taskEntries: DailyLogEntry[] = (raw.task_items ?? []).map((t, i) => ({
    entry_id:      `t-${i}-${t.task_id}`,
    work_category: t.task_type,
    project_id:    t.task_type === 'project' ? (t.project_id ?? undefined) : undefined,
    project_nm:    t.task_type === 'project' ? (t.project_nm ?? undefined) : undefined,
    function_id:   t.task_type === 'project' ? t.task_id : undefined,
    function_nm:   t.task_type === 'project' ? t.task_nm : undefined,
    duty_id:       t.task_type === 'duty' ? t.task_id : undefined,
    duty_nm:       t.task_type === 'duty' ? t.task_nm : undefined,
    description:   t.description,
    hours:         Number(t.work_hours),
    is_overtime:   false,
    overtime_hours: 0,
    suggest_id:    t.suggest_id,
    files:         t.files?.length ? t.files : undefined,
    record_time:   t.record_time,
  }))

  const freeEntries: DailyLogEntry[] = (raw.free_items ?? []).map((f, i) => ({
    entry_id:      `f-${i}-${f.category}`,
    work_category: f.category as DailyLogEntry['work_category'],
    description:   f.description,
    hours:         Number(f.work_hours),
    is_overtime:   false,
    overtime_hours: 0,
  }))

  const statusMap: Record<number, DailyLog['status']> = { 1: 'draft', 2: 'submitted' }

  return {
    log_id:        raw.log_id,
    work_no:       raw.work_no,
    log_date:      raw.log_date,
    entries:       [...taskEntries, ...freeEntries],
    total_hours:   Number(raw.total_hours),
    overtime_hours: 0,
    status:        statusMap[raw.status] ?? 'draft',
  }
}

// ─── Daily Log API ────────────────────────────────────────────────────────────

export const dailyLogApi = {
  /** GET /api/daily_log  — 列表（摘要，不含 task_items/free_items） */
  list: (params: DailyLogListQuery): Promise<ApiResponse<{ list: BackendDailyLogSummary[]; total: number; page: number }>> =>
    get('/daily_log', { params }),

  /** POST /api/daily_log  — 新建日誌 */
  create: (payload: CreateDailyLogPayload): Promise<ApiResponse<{ log_id: string }>> =>
    post('/daily_log', payload),

  /** GET /api/daily_log/:log_id  — 詳情（含 task_items / free_items） */
  detail: (logId: string): Promise<ApiResponse<BackendDailyLogDetail>> =>
    get(`/daily_log/${logId}`),

  /** PUT /api/daily_log/:log_id  — 更新日誌 */
  update: (logId: string, payload: UpdateDailyLogPayload): Promise<ApiResponse<null>> =>
    put(`/daily_log/${logId}`, payload),

  /** POST /api/daily_log/:log_id/upload  — 上傳附件 */
  uploadAttachments: (
    logId: string,
    files: File[],
  ): Promise<ApiResponse<UploadedFileInfo[]>> => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    return postForm(`/daily_log/${logId}/upload`, fd)
  },

  /** GET /api/daily_log/suggest?date=YYYY-MM-DD  — 從任務進度記錄生成建議條目 */
  suggest: (date?: string): Promise<ApiResponse<SuggestItem[]>> =>
    get('/daily_log/suggest', { params: date ? { date } : {} }),
}

/** Backend suggest item shape */
export interface SuggestItem {
  task_type:   'project' | 'duty'
  task_id:     string
  task_nm:     string
  project_id?: string
  project_nm:  string | null
  group1?:     string
  group2?:     string
  work_hours:  number
  description: string
  files?:      { name: string; url: string; size?: number }[]
  /** 進度記錄 ID（ProgressRecordDataModel.progress_id / DutyProgressRecordModel.id） */
  suggest_id?: string
  record_time?: string
}
