import { get, post, put, del } from './httpClient'
import { ApiResponse } from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminDashboard {
  total_users:    number
  total_projects: number
  total_duties:   number
  total_admins:   number
  recent_logs:    OperationLog[]
}

export interface AdminUser {
  work_no:      string
  name:         string
  department:   string
  position:     string
  email:        string
  status:       number
  created_at:   string
  role_code:    string | null
  role_name:    string | null
  is_supervisor: boolean
}

export interface SystemConfig {
  id:           string
  config_key:   string
  config_value: string
  description:  string
}

export interface OperationLog {
  id:         string
  work_no:    string
  operation:  string
  detail:     string
  ip:         string
  created_at: string
}

export interface AdminAccount {
  id:         string
  username:   string
  name:       string
  status:     number
  last_login: string
  created_at: string
}

export interface Role {
  code:     string
  name:     string
  describe: string
}

export interface UserRoleDetail {
  work_no:      string
  role_code:    string | null
  role_name:    string | null
  subordinates: string[]
}

export interface AdminUserListQuery {
  page:        number
  size?:       number
  keyword?:    string
  department?: string
  status?:     number
}

export interface OperationLogQuery {
  page:        number
  size?:       number
  work_no?:    string
  operation?:  string
  start_date?: string
  end_date?:   string
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const sysAdminApi = {
  /** GET /api/sys_admin/dashboard */
  getDashboard: (): Promise<ApiResponse<AdminDashboard>> =>
    get('/sys_admin/dashboard'),

  // ── 用户管理 ──────────────────────────────────────────────────────────────

  /** GET /api/sys_admin/users */
  listUsers: (params: AdminUserListQuery): Promise<ApiResponse<{ total_count: number; total_page: number; data_list: AdminUser[] }>> => {
    const query = new URLSearchParams({ page: String(params.page) })
    if (params.size)       query.set('size', String(params.size))
    if (params.keyword)    query.set('keyword', params.keyword)
    if (params.department) query.set('department', params.department)
    if (params.status !== undefined) query.set('status', String(params.status))
    return get(`/sys_admin/users?${query}`)
  },

  /** PUT /api/sys_admin/users/:work_no/status */
  setUserStatus: (work_no: string, status: number): Promise<ApiResponse<null>> =>
    put(`/sys_admin/users/${work_no}/status`, { status }),

  /** PUT /api/sys_admin/users/:work_no/reset_password */
  resetPassword: (work_no: string, new_password: string): Promise<ApiResponse<null>> =>
    put(`/sys_admin/users/${work_no}/reset_password`, { new_password }),

  // ── 角色管理 ──────────────────────────────────────────────────────────────

  /** GET /api/sys_admin/roles */
  listRoles: (): Promise<ApiResponse<Role[]>> =>
    get('/sys_admin/roles'),

  /** GET /api/sys_admin/users/:work_no/role */
  getUserRoleDetail: (work_no: string): Promise<ApiResponse<UserRoleDetail>> =>
    get(`/sys_admin/users/${work_no}/role`),

  /** PUT /api/sys_admin/users/:work_no/role */
  setUserRole: (work_no: string, role_code: string | null): Promise<ApiResponse<null>> =>
    put(`/sys_admin/users/${work_no}/role`, { role_code }),

  /** PUT /api/sys_admin/users/:work_no/subordinates */
  setUserSubordinates: (work_no: string, subordinates: string[]): Promise<ApiResponse<null>> =>
    put(`/sys_admin/users/${work_no}/subordinates`, { subordinates }),

  // ── 系统配置 ──────────────────────────────────────────────────────────────

  /** GET /api/sys_admin/system_config */
  getConfigs: (): Promise<ApiResponse<SystemConfig[]>> =>
    get('/sys_admin/system_config'),

  /** PUT /api/sys_admin/system_config */
  updateConfigs: (configs: Record<string, string>): Promise<ApiResponse<null>> =>
    put('/sys_admin/system_config', configs),

  // ── 操作日志 ──────────────────────────────────────────────────────────────

  /** GET /api/sys_admin/operation_logs */
  listLogs: (params: OperationLogQuery): Promise<ApiResponse<{ total_count: number; total_page: number; data_list: OperationLog[] }>> => {
    const query = new URLSearchParams({ page: String(params.page) })
    if (params.size)       query.set('size', String(params.size))
    if (params.work_no)    query.set('work_no', params.work_no)
    if (params.operation)  query.set('operation', params.operation)
    if (params.start_date) query.set('start_date', params.start_date)
    if (params.end_date)   query.set('end_date', params.end_date)
    return get(`/sys_admin/operation_logs?${query}`)
  },

  // ── 管理员账号 ────────────────────────────────────────────────────────────

  /** GET /api/sys_admin/admins */
  listAdmins: (page: number, size = 20): Promise<ApiResponse<{ total_count: number; total_page: number; data_list: AdminAccount[] }>> =>
    get(`/sys_admin/admins?page=${page}&size=${size}`),

  /** POST /api/sys_admin/admins */
  createAdmin: (username: string, password: string, name: string): Promise<ApiResponse<AdminAccount>> =>
    post('/sys_admin/admins', { username, password, name }),

  /** DELETE /api/sys_admin/admins/:id */
  deleteAdmin: (id: string): Promise<ApiResponse<null>> =>
    del(`/sys_admin/admins/${id}`),
}
