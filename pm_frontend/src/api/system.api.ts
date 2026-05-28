import { get, post, put, del } from './httpClient'
import type { ApiResponse } from '@/types/api.types'

export interface DeployRow {
  fe_host:    string
  fe_path:    string
  fe_app_nm:  string
  fe_port:    string
  be_host:    string
  be_path:    string
  be_app_nm:  string
  be_port:    string
  remark:     string
}

export interface SystemUrl {
  name: string
  url:  string
}

export interface MaintainerInfo {
  work_no: string
  name:    string
}

export interface SystemItem {
  id:               string
  sys_nm:           string
  sys_group:        string
  maintainers:      string[]
  maintainer_names: MaintainerInfo[]
  description:      string
  go_live_date:     string
  urls:             SystemUrl[]
  deploy_info:      DeployRow[]
  created_at:       string
  updated_at:       string
}

export interface SystemListQuery {
  page?:      number
  size?:      number
  keyword?:   string
  sys_group?: string
}

export interface CreateSystemPayload {
  sys_nm:       string
  sys_group?:   string
  maintainers?: string[]
  description?: string
  go_live_date?: string
  urls?:         SystemUrl[]
  deploy_info?:  DeployRow[]
}

export const systemApi = {
  list: (payload: SystemListQuery): Promise<ApiResponse<{ data_list: SystemItem[]; total_count: number; page: number; size: number }>> =>
    post('/system/list', payload),

  get: (id: string): Promise<ApiResponse<SystemItem>> =>
    get(`/system/${id}`),

  groups: (): Promise<ApiResponse<string[]>> =>
    get('/system/groups'),

  create: (payload: CreateSystemPayload): Promise<ApiResponse<SystemItem>> =>
    post('/system/create', payload),

  update: (id: string, payload: Partial<CreateSystemPayload>): Promise<ApiResponse<SystemItem>> =>
    put(`/system/${id}`, payload),

  delete: (id: string): Promise<ApiResponse<null>> =>
    del(`/system/${id}`),
}
