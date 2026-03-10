import { get, post } from './httpClient'

export const groupApi = {
  /** GET /api/group/member */
  members: (params?: { page?: number; size?: number; keyword?: string }) =>
    get('/group/member', { params }),

  /** GET /api/group/member/:work_no/project_list */
  memberProjects: (workNo: string, params?: { page?: number; size?: number }) =>
    get(`/group/member/${workNo}/project_list`, { params }),

  /** GET /api/group/member/:work_no/temporary_duty_list */
  memberDuties: (workNo: string, params?: { page?: number; size?: number }) =>
    get(`/group/member/${workNo}/temporary_duty_list`, { params }),

  /** GET /api/group/member/:work_no/produce_report */
  produceReport: (workNo: string, params?: { start_date?: string; end_date?: string }) =>
    get(`/group/member/${workNo}/produce_report`, { params }),

  /** POST /api/group/member/:work_no/send_report */
  sendReport: (workNo: string, payload: { start_date: string; end_date: string; email?: string }) =>
    post(`/group/member/${workNo}/send_report`, payload),

  /** POST /api/group/member/:work_no/statistical_data */
  statisticalData: (workNo: string, payload: { start_date: string; end_date: string }) =>
    post(`/group/member/${workNo}/statistical_data`, payload),

  /** POST /api/group/member/:work_no/overview */
  overview: (workNo: string, payload: { start_date: string; end_date: string }) =>
    post(`/group/member/${workNo}/overview`, payload),

  /** GET /api/group/member/:work_no/schedule */
  schedule: (workNo: string, params?: { start_date?: string; end_date?: string }) =>
    get(`/group/member/${workNo}/schedule`, { params }),
}
