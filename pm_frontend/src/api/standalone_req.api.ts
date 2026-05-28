import { post, put, del } from './httpClient'
import type { ApiResponse } from '@/types/api.types'

export interface StandaloneReq {
  id:                string
  req_nm:            string
  describe:          string
  priority:          number
  status:            number   // 0=待處理 1=進行中 2=已完成 9=已刪除
  system_id:         string
  system_nm?:        string
  creator:           string
  creator_nm?:       string
  responsible:       string[]
  expected_end_date: string
  created_at:        string
  updated_at:        string
}

export interface StandaloneReqListQuery {
  page:        number
  size?:       number
  keyword?:    string
  status?:     number
  priority?:   number
  responsible?: string
}

export interface CreateStandaloneReqPayload {
  req_nm:             string
  system_id:          string
  describe?:          string
  priority?:          number
  responsible?:       string[]
  expected_end_date?: string
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
}
