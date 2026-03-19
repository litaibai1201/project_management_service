import { get, post, put, del } from './httpClient'
import { ApiResponse, UserProfile } from '@/types/api.types'

export interface CreateUserPayload {
  work_no: string
  name: string
  department: string
  position?: string
  email?: string
  phone?: string
  password?: string
}

export interface QueryUsersParams {
  page?: number
  size?: number
  keyword?: string
  department?: string
}

export interface HierarchyRelation {
  id: string
  supervisor_work_no: string
  subordinate_work_no: string
  supervisor_name?: string
  subordinate_name?: string
}

// ─── User API ─────────────────────────────────────────────────────────────────

export const userApi = {
  // ─── User CRUD ───────────────────────────────────────────────────────────────

  /** GET /api/user/mgmt/users */
  list: (params?: QueryUsersParams) =>
    get('/user/mgmt/users', { params }),

  /** GET /api/user/mgmt/user/:work_no */
  get: (workNo: string): Promise<ApiResponse<UserProfile>> =>
    get(`/user/mgmt/user/${workNo}`),

  /** POST /api/user/mgmt/user */
  create: (payload: CreateUserPayload): Promise<ApiResponse<{ work_no: string }>> =>
    post('/user/mgmt/user', payload),

  /** PUT /api/user/mgmt/user/:work_no */
  update: (workNo: string, payload: Partial<CreateUserPayload>): Promise<ApiResponse<null>> =>
    put(`/user/mgmt/user/${workNo}`, payload),

  /** DELETE /api/user/mgmt/user/:work_no */
  delete: (workNo: string): Promise<ApiResponse<null>> =>
    del(`/user/mgmt/user/${workNo}`),

  /** GET /api/user/mgmt/departments */
  departments: (): Promise<ApiResponse<string[]>> =>
    get('/user/mgmt/departments'),

  // ─── Hierarchy ────────────────────────────────────────────────────────────────

  setRelation: (supervisorWorkNo: string, subordinateWorkNo: string): Promise<ApiResponse<HierarchyRelation>> =>
    post('/user/mgmt/hierarchy', { supervisor_work_no: supervisorWorkNo, subordinate_work_no: subordinateWorkNo }),

  removeRelation: (relationId: string): Promise<ApiResponse<null>> =>
    del(`/user/mgmt/hierarchy/${relationId}`),

  getSubordinates: (workNo: string, allLevels?: boolean) =>
    get(`/user/mgmt/${workNo}/subordinates`, { params: { all_levels: allLevels } }),

  getSupervisors: (workNo: string) =>
    get(`/user/mgmt/${workNo}/supervisors`),

  getTeamTree: (workNo: string) =>
    get(`/user/mgmt/${workNo}/team`),

  // ─── Personal Queries ─────────────────────────────────────────────────────────

  myProjects: (params?: { page?: number; size?: number; status?: number }) =>
    get('/user/project', { params }),

  myDuties: (params?: { page?: number; size?: number; status?: number }) =>
    get('/user/temporary_duty', { params }),

  myProjectApply: (params?: { page?: number; size?: number }) =>
    get('/user/project/my_apply', { params }),

  myDutyApply: (params?: { page?: number; size?: number }) =>
    get('/user/temporary_duty/my_apply', { params }),

  cancelProjectApply: (applyId: string) =>
    put(`/user/project/apply/${applyId}`),

  cancelDutyApply: (applyId: string) =>
    put(`/user/temporary_duty/apply/${applyId}`),

  projectAuditRecord: (params?: { page?: number; size?: number }) =>
    get('/user/project/audit_record', { params }),

  dutyAuditRecord: (params?: { page?: number; size?: number }) =>
    get('/user/duty/audit_record', { params }),
}
