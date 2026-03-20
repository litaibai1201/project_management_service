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

  /** POST /api/user/mgmt/hierarchy */
  setRelation: (supervisorWorkNo: string, subordinateWorkNo: string): Promise<ApiResponse<HierarchyRelation>> =>
    post('/user/mgmt/hierarchy', { supervisor_work_no: supervisorWorkNo, subordinate_work_no: subordinateWorkNo }),

  /** DELETE /api/user/mgmt/hierarchy/:id */
  removeRelation: (relationId: string): Promise<ApiResponse<null>> =>
    del(`/user/mgmt/hierarchy/${relationId}`),

  /** GET /api/user/mgmt/:work_no/subordinates */
  getSubordinates: (workNo: string, allLevels?: boolean) =>
    get(`/user/mgmt/${workNo}/subordinates`, { params: { all_levels: allLevels } }),

  /** GET /api/user/mgmt/:work_no/supervisors */
  getSupervisors: (workNo: string) =>
    get(`/user/mgmt/${workNo}/supervisors`),

  /** GET /api/user/mgmt/:work_no/team */
  getTeamTree: (workNo: string) =>
    get(`/user/mgmt/${workNo}/team`),

  // ─── Personal Queries ─────────────────────────────────────────────────────────

  /** GET /api/user/project */
  myProjects: (params?: { page?: number; size?: number; status?: number }) =>
    get('/user/project', { params }),

  /** GET /api/user/temporary_duty */
  myDuties: (params?: { page?: number; size?: number; status?: number }) =>
    get('/user/temporary_duty', { params }),

  /** GET /api/user/project/my_apply */
  myProjectApply: (params?: { page?: number; size?: number }) =>
    get('/user/project/my_apply', { params }),

  /** GET /api/user/temporary_duty/my_apply */
  myDutyApply: (params?: { page?: number; size?: number }) =>
    get('/user/temporary_duty/my_apply', { params }),

  /** PUT /api/user/project/apply/:id */
  cancelProjectApply: (applyId: string) =>
    put(`/user/project/apply/${applyId}`),

  /** PUT /api/user/temporary_duty/apply/:id */
  cancelDutyApply: (applyId: string) =>
    put(`/user/temporary_duty/apply/${applyId}`),

  /** GET /api/user/project/audit_record */
  projectAuditRecord: (params?: { page?: number; size?: number }) =>
    get('/user/project/audit_record', { params }),

  /** GET /api/user/duty/audit_record */
  dutyAuditRecord: (params?: { page?: number; size?: number }) =>
    get('/user/duty/audit_record', { params }),

  // ─── Role Management ──────────────────────────────────────────────────────────

  /** GET /api/user/mgmt/roles */
  listRoles: (): Promise<ApiResponse<Role[]>> =>
    get('/user/mgmt/roles'),

  /** POST /api/user/mgmt/roles */
  createRole: (payload: { name: string; superior_code?: number | null }): Promise<ApiResponse<Role>> =>
    post('/user/mgmt/roles', payload),

  /** PUT /api/user/mgmt/roles/:code */
  updateRole: (code: number, payload: { name?: string; superior_code?: number | null }): Promise<ApiResponse<Role>> =>
    put(`/user/mgmt/roles/${code}`, payload),

  /** DELETE /api/user/mgmt/roles/:code */
  deleteRole: (code: number): Promise<ApiResponse<null>> =>
    del(`/user/mgmt/roles/${code}`),

  /** GET /api/user/mgmt/user/:work_no/role */
  getUserRole: (workNo: string): Promise<ApiResponse<UserRole | null>> =>
    get(`/user/mgmt/user/${workNo}/role`),

  /** PUT /api/user/mgmt/user/:work_no/role */
  assignRole: (workNo: string, roleCode: number): Promise<ApiResponse<UserRole>> =>
    put(`/user/mgmt/user/${workNo}/role`, { role_code: roleCode }),

  /** DELETE /api/user/mgmt/user/:work_no/role */
  removeRole: (workNo: string): Promise<ApiResponse<null>> =>
    del(`/user/mgmt/user/${workNo}/role`),
}

export interface Role {
  code: number
  name: string
  superior_code: number | null
  created_at: string
}

export interface UserRole {
  role_code: number | null
  role_name: string | null
}
