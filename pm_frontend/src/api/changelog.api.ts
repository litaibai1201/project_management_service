import { get, post, put, del } from './httpClient'
import { ApiResponse, PaginatedContent } from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChangelogUpdateType = 'feature' | 'bugfix' | 'improvement' | 'security' | 'other'

export interface ChangelogItem {
  id: string
  version: string
  title: string
  content: string
  update_type: ChangelogUpdateType
  operator: string
  status: 1 | 0
  created_at: string
  updated_at?: string
}

export interface ChangelogListQuery {
  page: number
  size?: number
  keyword?: string
  update_type?: ChangelogUpdateType
}

export interface CreateChangelogPayload {
  version: string
  title: string
  content: string
  update_type: ChangelogUpdateType
}

export interface UpdateChangelogPayload {
  version?: string
  title?: string
  content?: string
  update_type?: ChangelogUpdateType
}

// ─── Changelog API ────────────────────────────────────────────────────────────

export const changelogApi = {
  /** GET /api/changelog  — 列表 */
  list: (params: ChangelogListQuery): Promise<ApiResponse<PaginatedContent<ChangelogItem>>> =>
    get('/changelog', { params }),

  /** POST /api/changelog  — 新增 */
  create: (payload: CreateChangelogPayload): Promise<ApiResponse<{ log_id: string }>> =>
    post('/changelog', payload),

  /** GET /api/changelog/:log_id  — 詳情 */
  get: (logId: string): Promise<ApiResponse<ChangelogItem>> =>
    get(`/changelog/${logId}`),

  /** PUT /api/changelog/:log_id  — 更新 */
  update: (logId: string, payload: UpdateChangelogPayload): Promise<ApiResponse<null>> =>
    put(`/changelog/${logId}`, payload),

  /** DELETE /api/changelog/:log_id  — 刪除 */
  delete: (logId: string): Promise<ApiResponse<null>> =>
    del(`/changelog/${logId}`),
}
