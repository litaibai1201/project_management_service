import { get, post, put, del, postForm, putForm } from './httpClient'
import {
  ApiResponse,
  TemporaryDuty,
  CreateDutyPayload,
  DutyListQuery,
  PaginatedContent,
  ApplyRecord,
  ReviewPayload,
  CountersignPayload,
} from '@/types/api.types'

// ─── Duty API ─────────────────────────────────────────────────────────────────

export const dutyApi = {
  /** POST /api/temporary_duty/temporary_duty_list */
  list: (payload: DutyListQuery): Promise<ApiResponse<PaginatedContent<TemporaryDuty>>> =>
    post('/temporary_duty/temporary_duty_list', payload),

  /** GET /api/temporary_duty/:id */
  get: (id: string): Promise<ApiResponse<TemporaryDuty>> =>
    get(`/temporary_duty/${id}`),

  /** POST /api/temporary_duty/create_temporary_duty */
  create: (payload: CreateDutyPayload, files?: Record<string, File[]>): Promise<ApiResponse<{ duty_id: string }>> => {
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return postForm('/temporary_duty/create_temporary_duty', fd)
  },

  /** PUT /api/temporary_duty/:id */
  update: (id: string, payload: Partial<CreateDutyPayload>): Promise<ApiResponse<null>> => {
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    return putForm(`/temporary_duty/${id}`, fd)
  },

  /** DELETE /api/temporary_duty/:id */
  delete: (id: string): Promise<ApiResponse<null>> =>
    del(`/temporary_duty/${id}`),

  /** PUT /api/temporary_duty/:id/allocation */
  allocate: (id: string, payload: { responsible?: string[]; expected_start_date?: string; expected_end_date?: string }): Promise<ApiResponse<null>> =>
    put(`/temporary_duty/${id}/allocation`, payload),

  /** PUT /api/temporary_duty/:id/set_status */
  setStatus: (id: string, status: number): Promise<ApiResponse<null>> =>
    put(`/temporary_duty/${id}/set_status`, { status }),

  /** GET /api/temporary_duty/:id/files */
  files: (id: string) =>
    get(`/temporary_duty/${id}/files`),

  // ─── Progress ────────────────────────────────────────────────────────────────

  /** GET /api/temporary_duty/progress  (unread count) */
  unreadProgressCount: (params?: { page?: number; size?: number }) =>
    get('/temporary_duty/progress', { params }),

  /** GET /api/temporary_duty/:id/progress */
  getProgress: (id: string, params?: { page?: number; size?: number }) =>
    get(`/temporary_duty/${id}/progress`, { params }),

  /** POST /api/temporary_duty/:id/progress */
  createProgress: (id: string, payload: unknown, files?: Record<string, File[]>): Promise<ApiResponse<null>> => {
    const fd = new FormData()
    Object.entries(payload as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) (v as string[]).forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    if (files) Object.entries(files).forEach(([type, list]) => list.forEach((f) => fd.append(type, f)))
    return postForm(`/temporary_duty/${id}/progress`, fd)
  },

  // ─── Status actions ──────────────────────────────────────────────────────────

  /** POST /api/temporary_duty/:id/reschedule */
  reschedule: (id: string, newEndDate: string, reason?: string): Promise<ApiResponse<null>> =>
    post(`/temporary_duty/${id}/reschedule`, { new_end_date: newEndDate, reason: reason ?? '' }),

  /** POST /api/temporary_duty/:id/activate */
  activate: (id: string, payload?: { responsible?: string[]; expected_start_date?: string; expected_end_date?: string }): Promise<ApiResponse<null>> =>
    post(`/temporary_duty/${id}/activate`, payload ?? {}),

  /** POST /api/temporary_duty/:id/hold */
  hold: (id: string): Promise<ApiResponse<null>> =>
    post(`/temporary_duty/${id}/hold`, {}),

  /** POST /api/temporary_duty/:id/resume */
  resume: (id: string): Promise<ApiResponse<null>> =>
    post(`/temporary_duty/${id}/resume`, {}),

  /** POST /api/temporary_duty/:id/submit_completion */
  submitCompletion: (id: string, reviewer: string[], submitterName?: string): Promise<ApiResponse<{ review_id: string }>> =>
    post(`/temporary_duty/${id}/submit_completion`, { reviewer, submitter_name: submitterName ?? '' }),

  // ─── Review ──────────────────────────────────────────────────────────────────

  /** GET /api/temporary_duty/review_list */
  reviewList: (params?: { page?: number; size?: number }): Promise<ApiResponse<PaginatedContent<ApplyRecord>>> =>
    get('/temporary_duty/review_list', { params }),

  /** PUT /api/temporary_duty/review/:id */
  approveReview: (reviewId: string, payload: ReviewPayload): Promise<ApiResponse<null>> =>
    put(`/temporary_duty/review/${reviewId}`, payload),

  /** POST /api/temporary_duty/review/:id/countersign — 加簽 */
  countersignReview: (reviewId: string, payload: CountersignPayload): Promise<ApiResponse<null>> =>
    post(`/temporary_duty/review/${reviewId}/countersign`, payload),

  /** GET /api/temporary_duty/tasklist */
  taskList: (params?: { page?: number; size?: number }) =>
    get('/temporary_duty/tasklist', { params }),

  /** POST /api/temporary_duty/batch_req_task_review */
  batchSubmitReqTaskReview: (
    dutyIds: string[],
    reviewer: string[],
  ): Promise<ApiResponse<{ apply_id: string; count: number }>> =>
    post('/temporary_duty/batch_req_task_review', { duty_ids: dutyIds, reviewer }),

  /** POST /api/temporary_duty/:id/req_task_review */
  submitReqTaskReview: (
    dutyId: string,
    payload: { reviewer: string[]; submitter_name?: string },
  ): Promise<ApiResponse<{ apply_id: string }>> =>
    post(`/temporary_duty/${dutyId}/req_task_review`, payload),
}
