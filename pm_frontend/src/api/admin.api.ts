import { get, post, put, del } from './httpClient'
import { ApiResponse, PaginatedContent } from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OperationLog {
  id: string
  operator: string
  action: string
  matter_id: string
  detail?: string
  ip?: string
  created_at: string
}

export interface OperLogListQuery {
  page: number
  size?: number
  operator?: string
  action?: string
  matter_id?: string
  start_date?: string
  end_date?: string
}

export interface ProjectGroup {
  id: number
  group_name: string
  created_at: string
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export const adminApi = {
  // ── 操作日誌 ──────────────────────────────────────────────────────────────

  /** GET /api/admin/operation_log */
  operLogList: (params: OperLogListQuery): Promise<ApiResponse<PaginatedContent<OperationLog>>> =>
    get('/admin/operation_log', { params }),

  // ── 項目組管理 ────────────────────────────────────────────────────────────

  /** GET /api/admin/project_group */
  groupList: (): Promise<ApiResponse<ProjectGroup[]>> =>
    get('/admin/project_group'),

  /** POST /api/admin/project_group */
  createGroup: (groupName: string): Promise<ApiResponse<null>> =>
    post('/admin/project_group', { group_name: groupName }),

  /** PUT /api/admin/project_group/:group_id */
  updateGroup: (groupId: number, groupName: string): Promise<ApiResponse<null>> =>
    put(`/admin/project_group/${groupId}`, { group_name: groupName }),

  /** DELETE /api/admin/project_group/:group_id */
  deleteGroup: (groupId: number): Promise<ApiResponse<null>> =>
    del(`/admin/project_group/${groupId}`),
}
