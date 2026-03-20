import { get, post, put, del } from './httpClient'
import { ApiResponse, ProjectGroup } from '@/types/api.types'

export const adminApi = {
  // ─── Project Group CRUD (GET: all users; POST/PUT/DELETE: admin only) ─────────

  /** GET /api/admin/project_group */
  listGroups: (): Promise<ApiResponse<ProjectGroup[]>> =>
    get('/admin/project_group'),

  /** POST /api/admin/project_group */
  createGroup: (group_nm: string): Promise<ApiResponse<ProjectGroup>> =>
    post('/admin/project_group', { group_nm }),

  /** PUT /api/admin/project_group/:id */
  updateGroup: (id: string, group_nm: string): Promise<ApiResponse<null>> =>
    put(`/admin/project_group/${id}`, { group_nm }),

  /** DELETE /api/admin/project_group/:id */
  deleteGroup: (id: string): Promise<ApiResponse<null>> =>
    del(`/admin/project_group/${id}`),
}
