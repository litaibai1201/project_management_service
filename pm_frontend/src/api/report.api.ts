import { get, post } from './httpClient'
import { ApiResponse, PaginatedContent } from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportType = 'weekly' | 'monthly'

export interface ReportPreviewQuery {
  period_start: string   // "YYYY-MM-DD"
  period_end?: string    // "YYYY-MM-DD"  (monthly may auto-calculate)
}

export interface ReportAttachment {
  file_name: string
  url: string
}

export interface ReportTaskItem {
  biz_type: 'project' | 'duty'
  biz_id: string
  title: string
  hours: number
  progress?: number
  attachments: ReportAttachment[]
}

export interface ReportFreeItem {
  category: string
  description: string
  hours: number
}

export interface ReportContent {
  report_id: string
  work_no: string
  report_type: ReportType
  period_start: string
  period_end: string
  status: 'draft' | 'confirmed'
  total_hours: number
  overtime_hours: number
  task_items: ReportTaskItem[]
  free_items: ReportFreeItem[]
  confirmed_at?: string
}

export interface ReportListQuery {
  page: number
  size?: number
}

export interface ReportListItem {
  report_id: string
  report_type: ReportType
  period_start: string
  period_end: string
  status: 'draft' | 'confirmed'
  total_hours: number
  confirmed_at?: string
}

// ─── Report API ───────────────────────────────────────────────────────────────

const reportApi = {
  // ── 週報 ─────────────────────────────────────────────────────────────────

  /** POST /api/report/weekly/preview */
  weeklyPreview: (payload: ReportPreviewQuery): Promise<ApiResponse<ReportContent>> =>
    post('/report/weekly/preview', payload),

  /** POST /api/report/weekly/confirm */
  weeklyConfirm: (payload: ReportPreviewQuery): Promise<ApiResponse<null>> =>
    post('/report/weekly/confirm', payload),

  /** GET /api/report/weekly  — 列表 */
  weeklyList: (params: ReportListQuery): Promise<ApiResponse<PaginatedContent<ReportListItem>>> =>
    get('/report/weekly', { params }),

  /** GET /api/report/weekly/:report_id  — 詳情 */
  weeklyDetail: (reportId: string): Promise<ApiResponse<ReportContent>> =>
    get(`/report/weekly/${reportId}`),

  // ── 月報 ─────────────────────────────────────────────────────────────────

  /** POST /api/report/monthly/preview */
  monthlyPreview: (payload: ReportPreviewQuery): Promise<ApiResponse<ReportContent>> =>
    post('/report/monthly/preview', payload),

  /** POST /api/report/monthly/confirm */
  monthlyConfirm: (payload: ReportPreviewQuery): Promise<ApiResponse<null>> =>
    post('/report/monthly/confirm', payload),

  /** GET /api/report/monthly  — 列表 */
  monthlyList: (params: ReportListQuery): Promise<ApiResponse<PaginatedContent<ReportListItem>>> =>
    get('/report/monthly', { params }),

  /** GET /api/report/monthly/:report_id  — 詳情 */
  monthlyDetail: (reportId: string): Promise<ApiResponse<ReportContent>> =>
    get(`/report/monthly/${reportId}`),

  // ── 通用帮手 ──────────────────────────────────────────────────────────────

  preview: (type: ReportType, payload: ReportPreviewQuery) =>
    type === 'weekly' ? reportApi.weeklyPreview(payload) : reportApi.monthlyPreview(payload),

  confirm: (type: ReportType, payload: ReportPreviewQuery) =>
    type === 'weekly' ? reportApi.weeklyConfirm(payload) : reportApi.monthlyConfirm(payload),

  list: (type: ReportType, params: ReportListQuery) =>
    type === 'weekly' ? reportApi.weeklyList(params) : reportApi.monthlyList(params),

  detail: (type: ReportType, reportId: string) =>
    type === 'weekly' ? reportApi.weeklyDetail(reportId) : reportApi.monthlyDetail(reportId),
}

export { reportApi }
