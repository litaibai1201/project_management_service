import { get, post, put, del, postForm } from './httpClient'
import type { ApiResponse } from '@/types/api.types'

export interface ReqFileInfo {
  file_id: string
  name:    string
  url:     string
  size:    number
}

export interface StandaloneReq {
  id:                string
  req_nm:            string
  describe:          string
  priority:          number
  status:            number   // 0=草稿 1=審核中 2=進行中 3=已拒絕 4=已完結 8=搁置 9=已刪除
  system_id:         string
  system_nm?:        string
  creator:           string
  creator_nm?:       string
  reviewer:          string
  reviewer_nm?:      string
  responsible:       string[]
  progress:          number
  expected_end_date: string
  expected_benefit?: string
  benefit_amount?:   number | null
  benefit_unit?:     string
  files:             ReqFileInfo[]
  created_at:        string
  updated_at:        string
}

export interface StandaloneReqListQuery {
  page:         number
  size?:        number
  keyword?:     string
  status?:      number
  priority?:    number
  responsible?: string
  system_id?:   string
}

export interface CreateStandaloneReqPayload {
  req_nm:             string
  system_id:          string
  describe?:          string
  priority?:          number
  responsible?:       string[]
  expected_end_date?: string
  expected_benefit?:  string
  benefit_amount?:    number | null
  benefit_unit?:      string
}

export interface StandaloneReqListResult {
  data_list:   StandaloneReq[]
  total_count: number
  page:        number
  size:        number
}

export const standaloneReqApi = {
  list: (payload: StandaloneReqListQuery): Promise<ApiResponse<StandaloneReqListResult>> =>
    post('/standalone_req/list', payload),

  create: (payload: CreateStandaloneReqPayload): Promise<ApiResponse<StandaloneReq>> =>
    post('/standalone_req/create', payload),

  update: (id: string, payload: Partial<CreateStandaloneReqPayload> & { status?: number }): Promise<ApiResponse<StandaloneReq>> =>
    put(`/standalone_req/${id}`, payload),

  delete: (id: string): Promise<ApiResponse<null>> =>
    del(`/standalone_req/${id}`),

  get: (id: string): Promise<ApiResponse<StandaloneReq>> =>
    get(`/standalone_req/${id}`),

  uploadFile: (reqId: string, file: File): Promise<ApiResponse<{ files: ReqFileInfo[]; file: ReqFileInfo }>> => {
    const fd = new FormData()
    fd.append('file', file)
    return postForm(`/standalone_req/${reqId}/files`, fd)
  },

  deleteFile: (reqId: string, fileId: string): Promise<ApiResponse<ReqFileInfo[]>> =>
    del(`/standalone_req/${reqId}/files`, { data: { file_id: fileId } }),

  submitReview: (reqId: string, reviewer: string[]): Promise<ApiResponse<StandaloneReq>> =>
    post(`/standalone_req/${reqId}/submit_review`, { reviewer }),

  batchSubmitReview: (reqIds: string[], reviewer: string[]): Promise<ApiResponse<{ updated: string[]; count: number }>> =>
    post('/standalone_req/batch_submit_review', { req_ids: reqIds, reviewer }),

  reviewResult: (reqId: string, action: 'approve' | 'reject'): Promise<ApiResponse<StandaloneReq>> =>
    post(`/standalone_req/${reqId}/review_result`, { action }),
}
