import { get, post, put, del, postForm } from './httpClient'
import {
  ApiResponse,
  Project,
  ProjectListItem,
  PaginatedContent,
  CreateProjectPayload,
  ProjectListQuery,
  ProjectFunction,
  AddFunctionPayload,
  FunctionAllocationPayload,
  ProgressRecord,
  CreateProgressPayload,
  ApplyRecord,
  ReviewPayload,
  CountersignPayload,
  ProjectGroup,
  Milestone,
  CreateMilestonePayload,
  MemberWorkStat,
} from '@/types/api.types'

// ─── DEV mock ─────────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV

async function devDelay(): Promise<void> {
  if (IS_DEV) {
    const { delay } = await import('@/mocks/mockData')
    await delay(200)
  }
}

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export const projectApi = {
  /** POST /api/project/project_list */
  list: async (payload: ProjectListQuery): Promise<ApiResponse<PaginatedContent<ProjectListItem>>> => {
    if (IS_DEV) {
      const { MOCK_PROJECT_LIST, paginate, delay } = await import('@/mocks/mockData')
      await delay(200)
      let items = [...MOCK_PROJECT_LIST]
      if (payload.keyword) items = items.filter((p) => p.project_nm.includes(payload.keyword!))
      if (payload.status)  items = items.filter((p) => p.status === payload.status)
      return paginate(items, payload.page, payload.size ?? 10)
    }
    return post('/project/project_list', payload)
  },

  /** GET /api/project/:id */
  get: async (id: string): Promise<ApiResponse<Project>> => {
    if (IS_DEV) {
      const { getMockProject, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok(getMockProject(id))
    }
    return get(`/project/${id}`)
  },

  /** POST /api/project/create_project  (multipart/form-data) */
  create: async (payload: CreateProjectPayload, files?: Record<string, File[]>): Promise<ApiResponse<{ project_id: string }>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(400)
      return ok({ project_id: `p_mock_${Date.now()}` })
    }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return postForm('/project/create_project', fd)
  },

  /** PUT /api/project/:id */
  update: async (id: string, payload: Partial<CreateProjectPayload>, files?: Record<string, File[]>): Promise<ApiResponse<null>> => {
    if (IS_DEV) { const { ok, delay } = await import('@/mocks/mockData'); await delay(300); return ok(null) }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return postForm(`/project/${id}`, fd)
  },

  /** DELETE /api/project/:id */
  delete: async (id: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { const { ok, delay } = await import('@/mocks/mockData'); await delay(200); return ok(null) }
    return del(`/project/${id}`)
  },

  /** PUT /api/project/:id/set_status */
  setStatus: async (id: string, status: number): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/${id}/set_status`, { status })
  },

  /** POST /api/project/:id/submit_for_review */
  submitForReview: async (id: string, reviewer: string[], status: number): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return post(`/project/${id}/submit_for_review`, { reviewer, status })
  },

  /** PUT /api/project/:id/is_finished */
  finish: async (id: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/${id}/is_finished`)
  },

  /** POST /api/project/:id/restart */
  restart: async (id: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return post(`/project/${id}/restart`)
  },

  /** GET /api/project/:id/gantt_chart */
  ganttChart: async (id: string): Promise<ApiResponse<unknown[]>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok([]) }
    return get(`/project/${id}/gantt_chart`)
  },

  /** GET /api/project/:id/member_dynamics */
  memberDynamics: async (id: string, params?: { page?: number; size?: number }) => {
    if (IS_DEV) {
      const { MOCK_DYNAMICS, ok, delay } = await import('@/mocks/mockData')
      await delay(150)
      return ok({ data_list: MOCK_DYNAMICS, total_count: MOCK_DYNAMICS.length })
    }
    return get(`/project/${id}/member_dynamics`, { params })
  },

  /** GET /api/project/:id/files */
  files: async (id: string) => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok({ data_list: [] }) }
    return get(`/project/${id}/files`)
  },

  /** GET /api/project/:id/progress_and_hour */
  progressAndHour: async (id: string) => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok({ total_progress: 72, total_hour: 120 }) }
    return get(`/project/${id}/progress_and_hour`)
  },

  /** GET /api/project/project_group */
  groups: async (): Promise<ApiResponse<ProjectGroup[]>> => {
    if (IS_DEV) {
      const { MOCK_GROUPS, ok, delay } = await import('@/mocks/mockData')
      await delay(100)
      return ok(MOCK_GROUPS)
    }
    return get('/project/project_group')
  },

  // ─── Function ───────────────────────────────────────────────────────────────

  /** POST /api/project/:pid/add_function */
  addFunction: async (pid: string, payload: AddFunctionPayload): Promise<ApiResponse<{ function_id: string }>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(300)
      return ok({ function_id: `f_mock_${Date.now()}` })
    }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    return postForm(`/project/${pid}/add_function`, fd)
  },

  /** GET /api/project/:pid/function/:fid */
  getFunction: async (pid: string, fid: string): Promise<ApiResponse<ProjectFunction>> => {
    if (IS_DEV) {
      const { getMockFunction, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok(getMockFunction(pid, fid))
    }
    return get(`/project/${pid}/function/${fid}`)
  },

  /** PUT /api/project/:pid/function/:fid */
  updateFunction: async (pid: string, fid: string, payload: Partial<AddFunctionPayload>): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    return postForm(`/project/${pid}/function/${fid}`, fd)
  },

  /** DELETE /api/project/:pid/function/:fid */
  deleteFunction: async (pid: string, fid: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return del(`/project/${pid}/function/${fid}`)
  },

  /** PUT /api/project/:pid/function/:fid/set_status */
  setFunctionStatus: async (pid: string, fid: string, status: number): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/${pid}/function/${fid}/set_status`, { status })
  },

  /** PUT /api/project/:pid/function/:fid/allocation */
  allocateFunction: async (pid: string, fid: string, payload: FunctionAllocationPayload): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/${pid}/function/${fid}/allocation`, payload)
  },

  /** POST /api/project/:pid/function_list */
  functionList: async (pid: string, payload: { page: number; size?: number; keyword?: string; status?: number }) => {
    if (IS_DEV) {
      const { getMockFunctions, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      let items = getMockFunctions(pid)
      if (payload.keyword) items = items.filter((f) => f.function_nm.includes(payload.keyword!))
      if (payload.status)  items = items.filter((f) => f.status === payload.status)
      return ok({ data_list: items, total_count: items.length, total_page: 1 })
    }
    return post(`/project/${pid}/function_list`, payload)
  },

  // ─── Progress ────────────────────────────────────────────────────────────────

  /** POST /api/project/:pid/function/:fid/progress */
  createProgress: async (pid: string, fid: string, payload: CreateProgressPayload, files?: Record<string, File[]>): Promise<ApiResponse<string>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(300)
      return ok('progress_mock_created')
    }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return postForm(`/project/${pid}/function/${fid}/progress`, fd)
  },

  /** GET /api/project/:pid/function/:fid/progress */
  getProgress: async (pid: string, fid: string, params?: { page?: number; size?: number; unread?: number }): Promise<ApiResponse<PaginatedContent<ProgressRecord>>> => {
    if (IS_DEV) {
      const { getMockProgress, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      const records = getMockProgress(fid)
      return ok({ data_list: records, total_count: records.length, total_page: 1 })
    }
    return get(`/project/${pid}/function/${fid}/progress`, { params })
  },

  // ─── Review ──────────────────────────────────────────────────────────────────

  /** GET /api/project/review_list */
  reviewList: async (params?: { page?: number; size?: number }): Promise<ApiResponse<PaginatedContent<ApplyRecord>>> => {
    if (IS_DEV) {
      const { MOCK_PROJECT_REVIEWS, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok({ data_list: MOCK_PROJECT_REVIEWS, total_count: MOCK_PROJECT_REVIEWS.length, total_page: 1 })
    }
    return get('/project/review_list', { params })
  },

  /** GET /api/project/all_reviews — combined project+duty reviews */
  allReviews: async (): Promise<ApiResponse<ApplyRecord[]>> => {
    if (IS_DEV) {
      const { getAllReviews, delay } = await import('@/mocks/mockData')
      await delay(200)
      return { code: '200', msg: 'success', content: getAllReviews() }
    }
    return get('/project/all_reviews')
  },

  /** PUT /api/project/review/:review_id */
  approveReview: async (reviewId: string, payload: ReviewPayload): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/review/${reviewId}`, payload)
  },

  /** POST /api/project/review/:review_id/countersign — 加簽 */
  countersignReview: async (reviewId: string, payload: CountersignPayload): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return post(`/project/review/${reviewId}/countersign`, payload)
  },

  // ─── Milestone ───────────────────────────────────────────────────────────────

  /** GET /api/project/:pid/milestones */
  getMilestones: async (pid: string): Promise<ApiResponse<Milestone[]>> => {
    if (IS_DEV) {
      const { getMockMilestones, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok(getMockMilestones(pid))
    }
    return get(`/project/${pid}/milestones`)
  },

  /** POST /api/project/:pid/milestones */
  createMilestone: async (pid: string, payload: CreateMilestonePayload): Promise<ApiResponse<{ milestone_id: string }>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(300)
      return ok({ milestone_id: `m_mock_${Date.now()}` })
    }
    return post(`/project/${pid}/milestones`, payload)
  },

  /** PUT /api/project/:pid/milestones/:mid */
  updateMilestone: async (pid: string, mid: string, payload: Partial<CreateMilestonePayload>): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/project/${pid}/milestones/${mid}`, payload)
  },

  /** DELETE /api/project/:pid/milestones/:mid */
  deleteMilestone: async (pid: string, mid: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return del(`/project/${pid}/milestones/${mid}`)
  },

  // ─── Statistics ──────────────────────────────────────────────────────────────

  /** GET /api/statistics/member_stats */
  memberStats: async (_params?: { start_date?: string; end_date?: string }): Promise<ApiResponse<MemberWorkStat[]>> => {
    if (IS_DEV) {
      const { MOCK_MEMBER_STATS, ok, delay } = await import('@/mocks/mockData')
      await delay(300)
      return ok(MOCK_MEMBER_STATS)
    }
    return get('/statistics/member_stats', { params: _params })
  },
}
