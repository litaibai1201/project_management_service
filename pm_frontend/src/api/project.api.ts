import { get, post, put, del, postForm, putForm, fetchBlob, fetchText } from './httpClient'
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
  Requirement,
  CreateRequirementPayload,
  ProjectFile,
} from '@/types/api.types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemberReportStat {
  work_no:            string
  name:               string
  total:              number
  pending:            number
  not_started:        number
  in_progress:        number
  completed:          number
  shelved:            number
  overdue_incomplete: number
  overdue_complete:   number
  completion_rate:    number
  overdue_rate:       number
}

export interface ProjectReportStat {
  project_id:         string
  project_nm:         string
  status:             number
  total:              number
  pending:            number
  draft:              number
  not_started:        number
  in_progress:        number
  completed:          number
  shelved:            number
  overdue_incomplete: number
  overdue_complete:   number
  completion_rate:    number
  overdue_rate:       number
  expected_end_date:  string
}

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

  /** PUT /api/project/:id/set_project_pm */
  setProjectPm: (id: string, projectPm: string): Promise<ApiResponse<null>> =>
    put(`/project/${id}/set_project_pm`, { project_pm: projectPm }),

  /** PUT /api/project/:id/set_status */
  setStatus: (id: string, status: number): Promise<ApiResponse<null>> =>
    put(`/project/${id}/set_status`, { status }),

  /** POST /api/project/:id/submit_for_review */
  submitForReview: (id: string, reviewer: string[], status: number): Promise<ApiResponse<null>> =>
    post(`/project/${id}/submit_for_review`, { reviewer, status }),

  /** POST /api/project/:id/change_request — 需求變更申請 */
  submitChangeRequest: (id: string, reviewer: string[], description: string): Promise<ApiResponse<null>> =>
    post(`/project/${id}/change_request`, { reviewer, description }),

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

  /** POST /api/project/project_group */
  createGroup: (group_nm: string): Promise<ApiResponse<ProjectGroup>> =>
    post<ProjectGroup>('/project/project_group', { group_nm }),

  /** PUT /api/project/project_group/:id */
  updateGroup: (id: string, group_nm: string): Promise<ApiResponse<null>> =>
    put(`/project/project_group/${id}`, { group_nm }),

  /** DELETE /api/project/project_group/:id */
  deleteGroup: (id: string): Promise<ApiResponse<null>> =>
    del(`/project/project_group/${id}`),

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
        if (Array.isArray(v)) fd.append(k, JSON.stringify(v))
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

  /** POST /api/project/:pid/function/:fid/reschedule — 延期任務 */
  rescheduleFunction: (pid: string, fid: string, payload: { new_end_date: string; reason: string }): Promise<ApiResponse<unknown>> =>
    post(`/project/${pid}/function/${fid}/reschedule`, payload),

  /** POST /api/project/:pid/function/:fid/submit_completion — 提交任務完結審核 */
  submitFunctionCompletion: (pid: string, fid: string): Promise<ApiResponse<{ direct_complete: boolean }>> =>
    post(`/project/${pid}/function/${fid}/submit_completion`, {}),

  /** PUT /api/project/:pid/function/:fid/allocation */
  allocateFunction: (pid: string, fid: string, payload: FunctionAllocationPayload): Promise<ApiResponse<null>> =>
    put(`/project/${pid}/function/${fid}/allocation`, payload),

  /** POST /api/project/:pid/functions/task_addition_review — 提交執行階段新增任務的審核 */
  submitTaskAdditionReview: (pid: string, functionIds: string[], reviewer: string[]): Promise<ApiResponse<{ apply_id: string }>> =>
    post(`/project/${pid}/functions/task_addition_review`, { function_ids: functionIds, reviewer }),

  /** POST /api/project/:pid/function_list */
  functionList: (pid: string, payload: { page: number; size?: number; keyword?: string; status?: number; requirement_id?: string }) =>
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

  /** GET /api/project/my_submitted_reviews — 我提交的審核記錄 */
  mySubmittedReviews: (params?: { page?: number; size?: number }): Promise<ApiResponse<PaginatedContent<ApplyRecord>>> =>
    get('/project/my_submitted_reviews', { params }),

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

  // ─── Files ───────────────────────────────────────────────────────────────────

  /** GET /api/project/:pid/files */
  listFiles: (pid: string): Promise<ApiResponse<ProjectFile[]>> =>
    get(`/project/${pid}/files`),

  /** POST /api/project/:pid/files  (multipart/form-data) */
  uploadFile: (pid: string, file: File, file_category: string): Promise<ApiResponse<ProjectFile>> => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('file_category', file_category)
    return postForm(`/project/${pid}/files`, fd)
  },

  /** DELETE /api/project/:pid/files/:fid */
  deleteFile: (pid: string, fid: string): Promise<ApiResponse<null>> =>
    del(`/project/${pid}/files/${fid}`),

  /** GET /api/project/:pid/files/:fid/download — returns a redirect/blob URL */
  getFileDownloadUrl: (pid: string, fid: string): string =>
    `/api/project/${pid}/files/${fid}/download`,

  /** Fetch file and return a local blob URL for preview (images / PDF) */
  previewFileAsBlob: (pid: string, fid: string): Promise<string> =>
    fetchBlob(`/project/${pid}/files/${fid}/preview`).then((blob) => URL.createObjectURL(blob)),

  /** Fetch file and return the raw Blob (for Office library parsing) */
  previewFileRawBlob: (pid: string, fid: string): Promise<Blob> =>
    fetchBlob(`/project/${pid}/files/${fid}/preview`),

  /** Fetch text-based file content (txt / md / yaml / csv) */
  previewFileAsText: (pid: string, fid: string): Promise<string> =>
    fetchText(`/project/${pid}/files/${fid}/preview`),

  // ─── Statistics ──────────────────────────────────────────────────────────────

  /** GET /api/project/my_functions — 我的跨專案任務 */
  myFunctions: (params?: { page?: number; size?: number; status?: number; scope?: 'all' | 'mine' | 'supervisor' }): Promise<ApiResponse<{ total_count: number; data_list: (ProjectFunction & { project_nm: string; project_status: number; project_pm: string })[] }>> =>
    get('/project/my_functions', { params }),

  /** GET /api/project/wbs_overview — 專案進度總覽（WBS 結構） */
  wbsOverview: (): Promise<ApiResponse<unknown[]>> =>
    get('/project/wbs_overview'),

  /** GET /api/project/report_stats — 專案進度報表統計 */
  reportStats: (): Promise<ApiResponse<ProjectReportStat[]>> =>
    get('/project/report_stats'),

  /** GET /api/project/member_report_stats — 成員報表統計 */
  memberReportStats: (): Promise<ApiResponse<MemberReportStat[]>> =>
    get('/project/member_report_stats'),

  /** GET /api/statistics/member_stats */
  memberStats: (params?: { start_date?: string; end_date?: string }): Promise<ApiResponse<MemberWorkStat[]>> =>
    get('/statistics/member_stats', { params }),

  /** GET /api/statistics/personal_stats */
  personalStats: (params: { work_no: string; start_date?: string; end_date?: string }): Promise<ApiResponse<{
    project_dist:    { name: string; hours: number }[]
    category_dist:   { name: string; hours: number }[]
    weekly_overtime: { week: string; normal: number; overtime: number }[]
  }>> =>
    get('/statistics/personal_stats', { params }),

  /** GET /api/statistics/progress_report */
  progressReport: (params: { start_date: string; end_date: string }): Promise<ApiResponse<unknown[]>> =>
    get('/statistics/progress_report', { params }),

  /** GET /api/statistics/anomalies */
  anomalies: (): Promise<ApiResponse<unknown[]>> =>
    get('/statistics/anomalies'),
}

// ─── Requirement API ──────────────────────────────────────────────────────────

export interface ProjectReqListQuery {
  page:      number
  size?:     number
  keyword?:  string
  status?:   number
  priority?: number
}

export type ProjectReqItem = Requirement & { project_nm?: string; creator_nm?: string }

export interface ProjectReqListResult {
  data_list:   ProjectReqItem[]
  total_count: number
  page:        number
  size:        number
}

export const requirementApi = {
  listAll: (payload: ProjectReqListQuery): Promise<ApiResponse<ProjectReqListResult>> =>
    post('/project/requirements/list', payload),

  list: (projectId: string): Promise<ApiResponse<Requirement[]>> =>
    get(`/project/${projectId}/requirements`),

  create: (projectId: string, payload: CreateRequirementPayload): Promise<ApiResponse<Requirement>> =>
    post(`/project/${projectId}/requirements`, payload),

  update: (projectId: string, reqId: string, payload: Partial<CreateRequirementPayload>): Promise<ApiResponse<Requirement>> =>
    put(`/project/${projectId}/requirements/${reqId}`, payload),

  delete: (projectId: string, reqId: string): Promise<ApiResponse<unknown>> =>
    del(`/project/${projectId}/requirements/${reqId}`),

  submitReview: (projectId: string, reqId: string, reviewer: string[]): Promise<ApiResponse<unknown>> =>
    post(`/project/${projectId}/requirements/${reqId}/submit_review`, { reviewer }),

  batchSubmitReview: (projectId: string, requirementIds: string[], reviewer: string[]): Promise<ApiResponse<unknown>> =>
    post(`/project/${projectId}/requirements/batch_review`, { requirement_ids: requirementIds, reviewer }),

  submitShelve: (projectId: string, reqId: string, reviewer: string[]): Promise<ApiResponse<unknown>> =>
    post(`/project/${projectId}/requirements/${reqId}/shelve`, { reviewer }),

  uploadFile: (projectId: string, reqId: string, file: File): Promise<ApiResponse<{ files: { name: string; url: string; size: number }[] }>> => {
    const fd = new FormData()
    fd.append('file', file)
    return postForm(`/project/${projectId}/requirements/${reqId}/files`, fd)
  },

  deleteFile: (projectId: string, reqId: string, url: string): Promise<ApiResponse<unknown>> =>
    del(`/project/${projectId}/requirements/${reqId}/files`, { data: { url } }),

  getFilePreviewUrl: (projectId: string, reqId: string, fileId: string): string =>
    `/api/project/${projectId}/requirements/${reqId}/files/${fileId}/preview`,

  getFileDownloadUrl: (projectId: string, reqId: string, fileId: string): string =>
    `/api/project/${projectId}/requirements/${reqId}/files/${fileId}/download`,

  previewFileAsBlob: (projectId: string, reqId: string, fileId: string): Promise<string> =>
    fetchBlob(`/project/${projectId}/requirements/${reqId}/files/${fileId}/preview`).then((b) => URL.createObjectURL(b)),

  previewFileRawBlob: (projectId: string, reqId: string, fileId: string): Promise<Blob> =>
    fetchBlob(`/project/${projectId}/requirements/${reqId}/files/${fileId}/preview`),

  previewFileAsText: (projectId: string, reqId: string, fileId: string): Promise<string> =>
    fetchText(`/project/${projectId}/requirements/${reqId}/files/${fileId}/preview`),
}
