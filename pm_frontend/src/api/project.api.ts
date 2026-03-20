import { get, post, put, del, postForm, putForm } from './httpClient'
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

// ─── Project CRUD ─────────────────────────────────────────────────────────────

export const projectApi = {
  /** POST /api/project/project_list */
  list: (payload: ProjectListQuery): Promise<ApiResponse<PaginatedContent<ProjectListItem>>> =>
    post('/project/project_list', payload),

  /** GET /api/project/:id */
  get: (id: string): Promise<ApiResponse<Project>> =>
    get(`/project/${id}`),

  /** POST /api/project/create_project  (multipart/form-data) */
  create: (payload: CreateProjectPayload, files?: Record<string, File[]>): Promise<ApiResponse<{ project_id: string }>> => {
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
  update: (id: string, payload: Partial<CreateProjectPayload>, files?: Record<string, File[]>): Promise<ApiResponse<null>> => {
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return putForm(`/project/${id}`, fd)
  },

  /** DELETE /api/project/:id */
  delete: (id: string): Promise<ApiResponse<null>> =>
    del(`/project/${id}`),

  /** PUT /api/project/:id/set_status */
  setStatus: (id: string, status: number): Promise<ApiResponse<null>> =>
    put(`/project/${id}/set_status`, { status }),

  /** POST /api/project/:id/submit_for_review */
  submitForReview: (id: string, reviewer: string[], status: number): Promise<ApiResponse<null>> =>
    post(`/project/${id}/submit_for_review`, { reviewer, status }),

  /** PUT /api/project/:id/is_finished */
  finish: (id: string): Promise<ApiResponse<null>> =>
    put(`/project/${id}/is_finished`),

  /** POST /api/project/:id/restart */
  restart: (id: string): Promise<ApiResponse<null>> =>
    post(`/project/${id}/restart`),

  /** GET /api/project/:id/gantt_chart */
  ganttChart: (id: string): Promise<ApiResponse<unknown[]>> =>
    get(`/project/${id}/gantt_chart`),

  /** GET /api/project/:id/member_dynamics */
  memberDynamics: (id: string, params?: { page?: number; size?: number }) =>
    get(`/project/${id}/member_dynamics`, { params }),

  /** GET /api/project/:id/files */
  files: (id: string) =>
    get(`/project/${id}/files`),

  /** GET /api/project/:id/progress_and_hour */
  progressAndHour: (id: string) =>
    get(`/project/${id}/progress_and_hour`),

  /** GET /api/project/project_group */
  groups: (): Promise<ApiResponse<ProjectGroup[]>> =>
    get('/project/project_group'),

  // ─── Function ───────────────────────────────────────────────────────────────

  /** POST /api/project/:pid/add_function */
  addFunction: (pid: string, payload: AddFunctionPayload): Promise<ApiResponse<{ function_id: string }>> => {
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
  getFunction: (pid: string, fid: string): Promise<ApiResponse<ProjectFunction>> =>
    get(`/project/${pid}/function/${fid}`),

  /** PUT /api/project/:pid/function/:fid */
  updateFunction: (pid: string, fid: string, payload: Partial<AddFunctionPayload>): Promise<ApiResponse<null>> => {
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    return putForm(`/project/${pid}/function/${fid}`, fd)
  },

  /** DELETE /api/project/:pid/function/:fid */
  deleteFunction: (pid: string, fid: string): Promise<ApiResponse<null>> =>
    del(`/project/${pid}/function/${fid}`),

  /** PUT /api/project/:pid/function/:fid/set_status */
  setFunctionStatus: (pid: string, fid: string, status: number): Promise<ApiResponse<null>> =>
    put(`/project/${pid}/function/${fid}/set_status`, { status }),

  /** PUT /api/project/:pid/function/:fid/allocation */
  allocateFunction: (pid: string, fid: string, payload: FunctionAllocationPayload): Promise<ApiResponse<null>> =>
    put(`/project/${pid}/function/${fid}/allocation`, payload),

  /** POST /api/project/:pid/function_list */
  functionList: (pid: string, payload: { page: number; size?: number; keyword?: string; status?: number }) =>
    post(`/project/${pid}/function_list`, payload),

  // ─── Progress ────────────────────────────────────────────────────────────────

  /** POST /api/project/:pid/function/:fid/progress */
  createProgress: (pid: string, fid: string, payload: CreateProgressPayload, files?: Record<string, File[]>): Promise<ApiResponse<string>> => {
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
  getProgress: (pid: string, fid: string, params?: { page?: number; size?: number; unread?: number }): Promise<ApiResponse<PaginatedContent<ProgressRecord>>> =>
    get(`/project/${pid}/function/${fid}/progress`, { params }),

  // ─── Review ──────────────────────────────────────────────────────────────────

  /** GET /api/project/review_list */
  reviewList: (params?: { page?: number; size?: number }): Promise<ApiResponse<PaginatedContent<ApplyRecord>>> =>
    get('/project/review_list', { params }),

  /** GET /api/project/all_reviews — combined project+duty reviews */
  allReviews: (): Promise<ApiResponse<ApplyRecord[]>> =>
    get('/project/all_reviews'),

  /** PUT /api/project/review/:review_id */
  approveReview: (reviewId: string, payload: ReviewPayload): Promise<ApiResponse<null>> =>
    put(`/project/review/${reviewId}`, payload),

  /** POST /api/project/review/:review_id/countersign — 加簽 */
  countersignReview: (reviewId: string, payload: CountersignPayload): Promise<ApiResponse<null>> =>
    post(`/project/review/${reviewId}/countersign`, payload),

  // ─── Milestone ───────────────────────────────────────────────────────────────

  /** GET /api/project/:pid/milestones */
  getMilestones: (pid: string): Promise<ApiResponse<Milestone[]>> =>
    get(`/project/${pid}/milestones`),

  /** POST /api/project/:pid/milestones */
  createMilestone: (pid: string, payload: CreateMilestonePayload): Promise<ApiResponse<{ milestone_id: string }>> =>
    post(`/project/${pid}/milestones`, payload),

  /** PUT /api/project/:pid/milestones/:mid */
  updateMilestone: (pid: string, mid: string, payload: Partial<CreateMilestonePayload>): Promise<ApiResponse<null>> =>
    put(`/project/${pid}/milestones/${mid}`, payload),

  /** DELETE /api/project/:pid/milestones/:mid */
  deleteMilestone: (pid: string, mid: string): Promise<ApiResponse<null>> =>
    del(`/project/${pid}/milestones/${mid}`),

  // ─── Statistics ──────────────────────────────────────────────────────────────

  /** GET /api/statistics/member_stats */
  memberStats: (params?: { start_date?: string; end_date?: string }): Promise<ApiResponse<MemberWorkStat[]>> =>
    get('/statistics/member_stats', { params }),
}
