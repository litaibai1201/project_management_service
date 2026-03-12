import { get, post, put, del, postForm } from './httpClient'
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

// ─── DEV mock ─────────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV

async function devDelay(): Promise<void> {
  if (IS_DEV) {
    const { delay } = await import('@/mocks/mockData')
    await delay(200)
  }
}

// ─── Duty API ─────────────────────────────────────────────────────────────────

export const dutyApi = {
  /** POST /api/temporary_duty/temporary_duty_list */
  list: async (payload: DutyListQuery): Promise<ApiResponse<PaginatedContent<TemporaryDuty>>> => {
    if (IS_DEV) {
      const { MOCK_DUTIES, paginate, delay } = await import('@/mocks/mockData')
      await delay(200)
      let items = [...MOCK_DUTIES]
      if (payload.keyword)  items = items.filter((d) => d.duty_nm.includes(payload.keyword!))
      if (payload.status !== undefined) items = items.filter((d) => d.status === payload.status)
      if (payload.priority) items = items.filter((d) => d.priority === payload.priority)
      return paginate(items, payload.page, payload.size ?? 10)
    }
    return post('/temporary_duty/temporary_duty_list', payload)
  },

  /** GET /api/temporary_duty/:id */
  get: async (id: string): Promise<ApiResponse<TemporaryDuty>> => {
    if (IS_DEV) {
      const { getMockDuty, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok(getMockDuty(id))
    }
    return get(`/temporary_duty/${id}`)
  },

  /** POST /api/temporary_duty/create_temporary_duty */
  create: async (payload: CreateDutyPayload, files?: Record<string, File[]>): Promise<ApiResponse<{ duty_id: string }>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(350)
      return ok({ duty_id: `d_mock_${Date.now()}` })
    }
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
  update: async (id: string, payload: Partial<CreateDutyPayload>): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    const fd = new FormData()
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        if (Array.isArray(v)) v.forEach((item) => fd.append(k, item))
        else fd.append(k, String(v))
      }
    })
    return postForm(`/temporary_duty/${id}`, fd)
  },

  /** DELETE /api/temporary_duty/:id */
  delete: async (id: string): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return del(`/temporary_duty/${id}`)
  },

  /** PUT /api/temporary_duty/:id/allocation */
  allocate: async (id: string, payload: { responsible?: string[]; expected_start_date?: string; expected_end_date?: string }): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/temporary_duty/${id}/allocation`, payload)
  },

  /** PUT /api/temporary_duty/:id/set_status */
  setStatus: async (id: string, status: number): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/temporary_duty/${id}/set_status`, { status })
  },

  /** GET /api/temporary_duty/:id/files */
  files: async (id: string) => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok({ data_list: [] }) }
    return get(`/temporary_duty/${id}/files`)
  },

  // ─── Progress ────────────────────────────────────────────────────────────────

  /** GET /api/temporary_duty/progress  (unread count) */
  unreadProgressCount: async (params?: { page?: number; size?: number }) => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok({ unread_count: 2 }) }
    return get('/temporary_duty/progress', { params })
  },

  /** GET /api/temporary_duty/:id/progress */
  getProgress: async (id: string, params?: { page?: number; size?: number }) => {
    if (IS_DEV) {
      const { getMockDutyProgress, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      const records = getMockDutyProgress(id)
      return ok({ data_list: records, total_count: records.length })
    }
    return get(`/temporary_duty/${id}/progress`, { params })
  },

  /** POST /api/temporary_duty/:id/progress */
  createProgress: async (id: string, payload: unknown, files?: Record<string, File[]>): Promise<ApiResponse<null>> => {
    if (IS_DEV) {
      const { ok, delay } = await import('@/mocks/mockData')
      await delay(300)
      return ok(null)
    }
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

  // ─── Review ──────────────────────────────────────────────────────────────────

  /** GET /api/temporary_duty/review_list */
  reviewList: async (params?: { page?: number; size?: number }): Promise<ApiResponse<PaginatedContent<ApplyRecord>>> => {
    if (IS_DEV) {
      const { MOCK_DUTY_REVIEWS, ok, delay } = await import('@/mocks/mockData')
      await delay(200)
      return ok({ data_list: MOCK_DUTY_REVIEWS, total_count: MOCK_DUTY_REVIEWS.length, total_page: 1 })
    }
    return get('/temporary_duty/review_list', { params })
  },

  /** PUT /api/temporary_duty/review/:id */
  approveReview: async (reviewId: string, payload: ReviewPayload): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return put(`/temporary_duty/review/${reviewId}`, payload)
  },

  /** POST /api/temporary_duty/review/:id/countersign — 加簽 */
  countersignReview: async (reviewId: string, payload: CountersignPayload): Promise<ApiResponse<null>> => {
    if (IS_DEV) { await devDelay(); const { ok } = await import('@/mocks/mockData'); return ok(null) }
    return post(`/temporary_duty/review/${reviewId}/countersign`, payload)
  },

  /** GET /api/temporary_duty/tasklist */
  taskList: async (params?: { page?: number; size?: number }) => {
    if (IS_DEV) {
      const { MOCK_DUTIES, ok, delay } = await import('@/mocks/mockData')
      await delay(150)
      return ok({ data_list: MOCK_DUTIES.slice(0, 5), total_count: 5 })
    }
    return get('/temporary_duty/tasklist', { params })
  },
}
