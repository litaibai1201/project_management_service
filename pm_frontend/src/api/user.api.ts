import { get, post, put, del } from './httpClient'
import { ApiResponse, UserProfile } from '@/types/api.types'

const IS_DEV = import.meta.env.DEV

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

// ─── Mock users ───────────────────────────────────────────────────────────────

const MOCK_USERS: UserProfile[] = [
  { work_no: 'DEV001', name: '王小明', department: '技術部', position: '技術總監', email: 'wang@example.com', phone: '0912-000-001' },
  { work_no: 'DEV002', name: '李大華', department: '技術部', position: '後端工程師', email: 'li@example.com' },
  { work_no: 'DEV003', name: '張美玲', department: '産品部', position: '産品經理', email: 'zhang@example.com' },
  { work_no: 'DEV004', name: '陳建國', department: '運營部', position: '運營主管', email: 'chen@example.com' },
  { work_no: 'DEV005', name: '林小芸', department: '設計部', position: 'UI 設計師', email: 'lin@example.com' },
  { work_no: 'DEV006', name: '趙四海', department: '技術部', position: '前端工程師', email: 'zhao@example.com' },
  { work_no: 'DEV007', name: '劉思遠', department: '技術部', position: '資深後端', email: 'liu@example.com' },
  { work_no: 'DEV008', name: '方曉雯', department: '設計部', position: '設計主管', email: 'fang@example.com' },
]

const MOCK_DEPARTMENTS = ['技術部', '産品部', '運營部', '設計部']

// ─── User API ─────────────────────────────────────────────────────────────────

export const userApi = {
  // ─── User CRUD ───────────────────────────────────────────────────────────────

  /** GET /api/user/mgmt/users */
  list: async (params?: QueryUsersParams) => {
    if (IS_DEV) {
      let items = [...MOCK_USERS]
      if (params?.keyword) items = items.filter((u) => u.name.includes(params.keyword!) || u.work_no.includes(params.keyword!))
      if (params?.department) items = items.filter((u) => u.department === params.department)
      return Promise.resolve({ code: '0', msg: 'ok', content: { users: items, total_count: items.length } })
    }
    return get('/user/mgmt/users', { params })
  },

  /** GET /api/user/mgmt/user/:work_no */
  get: async (workNo: string): Promise<ApiResponse<UserProfile>> => {
    if (IS_DEV) {
      const user = MOCK_USERS.find((u) => u.work_no === workNo) ?? MOCK_USERS[0]
      return Promise.resolve({ code: '0', msg: 'ok', content: user })
    }
    return get(`/user/mgmt/user/${workNo}`)
  },

  /** POST /api/user/mgmt/user */
  create: async (payload: CreateUserPayload): Promise<ApiResponse<{ work_no: string }>> => {
    if (IS_DEV) return Promise.resolve({ code: '0', msg: 'ok', content: { work_no: payload.work_no } })
    return post('/user/mgmt/user', payload)
  },

  /** PUT /api/user/mgmt/user/:work_no */
  update: async (workNo: string, payload: Partial<CreateUserPayload>): Promise<ApiResponse<null>> => {
    if (IS_DEV) return Promise.resolve({ code: '0', msg: 'ok', content: null })
    return put(`/user/mgmt/user/${workNo}`, payload)
  },

  /** DELETE /api/user/mgmt/user/:work_no */
  delete: async (workNo: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) return Promise.resolve({ code: '0', msg: 'ok', content: null })
    return del(`/user/mgmt/user/${workNo}`)
  },

  /** GET /api/user/mgmt/departments */
  departments: async (): Promise<ApiResponse<string[]>> => {
    if (IS_DEV) return Promise.resolve({ code: '0', msg: 'ok', content: MOCK_DEPARTMENTS })
    return get('/user/mgmt/departments')
  },

  // ─── Hierarchy ────────────────────────────────────────────────────────────────

  setRelation: (supervisorWorkNo: string, subordinateWorkNo: string): Promise<ApiResponse<HierarchyRelation>> =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { id: 'rel_mock', supervisor_work_no: supervisorWorkNo, subordinate_work_no: subordinateWorkNo } })
      : post('/user/mgmt/hierarchy', { supervisor_work_no: supervisorWorkNo, subordinate_work_no: subordinateWorkNo }),

  removeRelation: (relationId: string): Promise<ApiResponse<null>> =>
    IS_DEV ? Promise.resolve({ code: '0', msg: 'ok', content: null }) : del(`/user/mgmt/hierarchy/${relationId}`),

  getSubordinates: (workNo: string, allLevels?: boolean) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: MOCK_USERS.slice(1, 4) } })
      : get(`/user/mgmt/${workNo}/subordinates`, { params: { all_levels: allLevels } }),

  getSupervisors: (workNo: string) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [MOCK_USERS[0]] } })
      : get(`/user/mgmt/${workNo}/supervisors`),

  getTeamTree: (workNo: string) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { tree: [] } })
      : get(`/user/mgmt/${workNo}/team`),

  // ─── Personal Queries ─────────────────────────────────────────────────────────

  myProjects: (params?: { page?: number; size?: number; status?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { project_list: [], total_count: 0 } })
      : get('/user/project', { params }),

  myDuties: (params?: { page?: number; size?: number; status?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/temporary_duty', { params }),

  myProjectApply: (params?: { page?: number; size?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/project/my_apply', { params }),

  myDutyApply: (params?: { page?: number; size?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/temporary_duty/my_apply', { params }),

  cancelProjectApply: (applyId: string) =>
    IS_DEV ? Promise.resolve({ code: '0', msg: 'ok', content: null }) : put(`/user/project/apply/${applyId}`),

  cancelDutyApply: (applyId: string) =>
    IS_DEV ? Promise.resolve({ code: '0', msg: 'ok', content: null }) : put(`/user/temporary_duty/apply/${applyId}`),

  projectAuditRecord: (params?: { page?: number; size?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/project/audit_record', { params }),

  dutyAuditRecord: (params?: { page?: number; size?: number }) =>
    IS_DEV
      ? Promise.resolve({ code: '0', msg: 'ok', content: { data_list: [], total_count: 0 } })
      : get('/user/duty/audit_record', { params }),
}
